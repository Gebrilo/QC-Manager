const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { resolve: resolveAccess } = require('../access/RoleResolver');
const {
    canUserPerform,
    canUserUseScope,
    getPermissionLookupKeys,
    getScope,
    hasPermission,
} = require('../../../shared/rbac/catalog.ts');

const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
// Legacy fallback for old custom JWTs during transition
const LEGACY_JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-not-for-production-use-only';

const TERMINAL_STATUSES = Object.freeze(['SUSPENDED', 'ARCHIVED']);

function isTerminalStatus(status) {
    return typeof status === 'string' && TERMINAL_STATUSES.includes(status.toUpperCase());
}

/**
 * RBAC_UNIFIED kill-switch (ADR 0010, issue #262).
 *
 * Read per-request from the environment so it is live-flippable (a process
 * restart picks up the new value) and so tests can toggle it dynamically
 * without re-requiring the module. Defaults OFF — every existing authorization
 * decision is unchanged until the flag is turned on.
 */
function isRbacUnified() {
    return String(process.env.RBAC_UNIFIED || '').toLowerCase() === 'on';
}

/**
 * Middleware: Verify Supabase JWT token, check user is active, and attach fresh user data to request.
 * This reads the user's current role and active status from the DB on every request,
 * ensuring role changes and deactivation take effect immediately.
 *
 * Supports both Supabase JWTs (by supabase_id) and legacy custom JWTs (by id) during transition.
 */
async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    let user = null;

    // Try Supabase JWT first
    if (SUPABASE_JWT_SECRET) {
        try {
            const decoded = jwt.verify(token, SUPABASE_JWT_SECRET);
            const supabaseId = decoded.sub;

            if (supabaseId) {
                const result = await db.query(
                    'SELECT id, email, name, role, active, status, team_membership_active FROM app_user WHERE supabase_id = $1',
                    [supabaseId]
                );
                if (result.rows.length > 0) {
                    user = result.rows[0];
                }
            }
        } catch (err) {
            // Not a valid Supabase JWT — fall through to legacy
        }
    }

    // Fallback: legacy custom JWT (for backward compatibility during migration)
    if (!user) {
        try {
            const decoded = jwt.verify(token, LEGACY_JWT_SECRET);
            if (decoded.id) {
                const result = await db.query(
                    'SELECT id, email, name, role, active, status, team_membership_active FROM app_user WHERE id = $1',
                    [decoded.id]
                );
                if (result.rows.length > 0) {
                    user = result.rows[0];
                }
            }
        } catch (err) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
    }

    if (!user) {
        return res.status(401).json({ error: 'User not found' });
    }

    if (!user.active) {
        return res.status(403).json({ error: 'Account is deactivated. Contact an administrator.' });
    }

    // Attach fresh user data (not stale JWT data)
    req.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        active: user.active,
        status: user.status,
        team_membership_active: user.team_membership_active,
    };
    next();
}

/**
 * Middleware: Optional auth - attaches fresh user if token present, but doesn't block.
 * Used for endpoints that work differently when authenticated vs anonymous.
 */
async function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next();
    }

    const token = authHeader.split(' ')[1];
    let user = null;

    // Try Supabase JWT first
    if (SUPABASE_JWT_SECRET) {
        try {
            const decoded = jwt.verify(token, SUPABASE_JWT_SECRET);
            const supabaseId = decoded.sub;
            if (supabaseId) {
                const result = await db.query(
                    'SELECT id, email, name, role, active, status, team_membership_active FROM app_user WHERE supabase_id = $1',
                    [supabaseId]
                );
                if (result.rows.length > 0 && result.rows[0].active) {
                    user = result.rows[0];
                }
            }
        } catch (err) {
            // Not a Supabase JWT — try legacy
        }
    }

    // Fallback: legacy custom JWT
    if (!user) {
        try {
            const decoded = jwt.verify(token, LEGACY_JWT_SECRET);
            if (decoded.id) {
                const result = await db.query(
                    'SELECT id, email, name, role, active, status, team_membership_active FROM app_user WHERE id = $1',
                    [decoded.id]
                );
                if (result.rows.length > 0 && result.rows[0].active) {
                    user = result.rows[0];
                }
            }
        } catch (err) {
            // Token invalid, continue without user
        }
    }

    if (user) {
        req.user = {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            active: user.active,
            status: user.status,
            team_membership_active: user.team_membership_active,
        };
    }
    next();
}

async function loadPermissionOverrides(userId, permissionKeys) {
    const keys = permissionKeys.flatMap(permissionKey => getPermissionLookupKeys(permissionKey));
    const uniqueKeys = [...new Set(keys)];
    const placeholders = uniqueKeys.map((_, i) => `$${i + 2}`).join(', ');
    const result = await db.query(
        `SELECT permission_key, granted FROM user_permissions WHERE user_id = $1 AND permission_key IN (${placeholders})`,
        [userId, ...uniqueKeys]
    );
    return result.rows;
}

/**
 * Middleware: Check a permission.
 *
 * Under RBAC_UNIFIED=on (ADR 0010, issue #262), the actor's effective permission
 * set is resolved once per request via the Access Engine RoleResolver (DB
 * `role_permissions` ∪ `user_permissions` deltas) and tested with the pure
 * `hasPermission` membership helper (admin `*` wildcard matches any key). The
 * resolved set is cached on `req._accessResolverCache` so a request never pays
 * for resolution twice.
 *
 * With the flag OFF (default), the legacy catalog-based path is unchanged:
 * per-user overrides are loaded for the requested key and `canUserPerform`
 * resolves the role's permissions from the in-code catalog.
 *
 * @param {string} permissionKey - Required permission key (canonical qc.* format).
 */
function requirePermission(permissionKey) {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        try {
            let allowed;
            if (isRbacUnified()) {
                const { effectivePermissions } = await resolveAccess(req.user, req);
                allowed = hasPermission(effectivePermissions, permissionKey);
            } else {
                const permissionOverrides = req.user.role === 'admin'
                    ? []
                    : await loadPermissionOverrides(req.user.id, [permissionKey]);
                allowed = canUserPerform({ ...req.user, permissionOverrides }, permissionKey);
            }
            if (!allowed) {
                return res.status(403).json({ error: 'You do not have permission to perform this action' });
            }
            next();
        } catch (err) {
            next(err);
        }
    };
}

/**
 * Middleware: Check if user has ANY of the specified permissions.
 * Useful for endpoints accessible by multiple permission types.
 *
 * See `requirePermission` for the RBAC_UNIFIED semantics. On the unified path
 * the effective set is resolved once (cached) and each candidate key is tested
 * against it.
 *
 * @param {string[]} permissionKeys - Array of permission keys (user needs at least one)
 */
function requireAnyPermission(...permissionKeys) {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        try {
            let allowed;
            if (isRbacUnified()) {
                const { effectivePermissions } = await resolveAccess(req.user, req);
                allowed = permissionKeys.some(permissionKey => hasPermission(effectivePermissions, permissionKey));
            } else {
                const permissionOverrides = req.user.role === 'admin'
                    ? []
                    : await loadPermissionOverrides(req.user.id, permissionKeys);
                const actor = { ...req.user, permissionOverrides };
                allowed = permissionKeys.some(permissionKey => canUserPerform(actor, permissionKey));
            }
            if (!allowed) {
                return res.status(403).json({ error: 'You do not have permission to perform this action' });
            }
            next();
        } catch (err) {
            next(err);
        }
    };
}

function requireStatusScope(scopeKey) {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        // Terminal-status floor (ADR 0010 §6, issue #269): SUSPENDED / ARCHIVED
        // are never scope-exemptable, regardless of any user_scopes[granted=true]
        // row. This is a security invariant — applies in both flag states.
        if (isTerminalStatus(req.user.status)) {
            return res.status(403).json({
                error: 'Access restricted based on your account status.',
                reason: 'terminal_status_floor',
                current: req.user.status,
            });
        }

        const scope = getScope(scopeKey);
        if (!scope || !Array.isArray(scope.statuses)) {
            return res.status(500).json({ error: `Invalid status scope: ${scopeKey}` });
        }

        let hasScope;
        if (isRbacUnified()) {
            const { effectivePermissions, effectiveScopes } = await resolveAccess(req.user, req);
            // Admin * wildcard bypasses scope restrictions (parity with legacy canUserUseScope line 417)
            hasScope = effectivePermissions.has('*') || effectiveScopes.has(scopeKey);
        } else {
            hasScope = canUserUseScope(req.user, scopeKey);
        }
        if (!hasScope) {
            return res.status(403).json({
                error: 'Access restricted based on your account status.',
                reason: 'scope_missing',
                required_scope: scopeKey,
                current: req.user.status,
            });
        }

        if (!scope.statuses.includes(req.user.status)) {
            return res.status(403).json({
                error: 'Access restricted based on your account status.',
                required: scope.statuses,
                current: req.user.status,
            });
        }
        next();
    };
}

function requireStatus(...statuses) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (!statuses.includes(req.user.status)) {
            return res.status(403).json({
                error: 'Access restricted based on your account status.',
                required: statuses,
                current: req.user.status,
            });
        }
        next();
    };
}

module.exports = {
    requireAuth,
    requirePermission,
    requireAnyPermission,
    optionalAuth,
    requireStatus,
    requireStatusScope,
    isRbacUnified,
    isTerminalStatus,
    TERMINAL_STATUSES,
};

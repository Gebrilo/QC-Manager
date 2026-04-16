const jwt = require('jsonwebtoken');
const db = require('../config/db');

const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
// Legacy fallback for old custom JWTs during transition
const LEGACY_JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-not-for-production-use-only';

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
 * Middleware: Check if user has required role (uses fresh DB role from requireAuth)
 * @param {string[]} roles - Allowed roles
 */
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
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

/**
 * Middleware: Check if user has a specific permission.
 * Queries user_permissions table for the exact permission grant.
 * Admins bypass all permission checks.
 * @param {string} permissionKey - Required permission key (e.g., 'action:tasks:create')
 */
function requirePermission(permissionKey) {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        // Admins bypass all permission checks
        if (req.user.role === 'admin') {
            return next();
        }
        try {
            const result = await db.query(
                'SELECT granted FROM user_permissions WHERE user_id = $1 AND permission_key = $2',
                [req.user.id, permissionKey]
            );
            if (result.rows.length === 0 || !result.rows[0].granted) {
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
 * @param {string[]} permissionKeys - Array of permission keys (user needs at least one)
 */
function requireAnyPermission(...permissionKeys) {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (req.user.role === 'admin') {
            return next();
        }
        try {
            const placeholders = permissionKeys.map((_, i) => `$${i + 2}`).join(', ');
            const result = await db.query(
                `SELECT permission_key FROM user_permissions WHERE user_id = $1 AND permission_key IN (${placeholders}) AND granted = true`,
                [req.user.id, ...permissionKeys]
            );
            if (result.rows.length === 0) {
                return res.status(403).json({ error: 'You do not have permission to perform this action' });
            }
            next();
        } catch (err) {
            next(err);
        }
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

module.exports = { requireAuth, requireRole, requirePermission, requireAnyPermission, optionalAuth, requireStatus };

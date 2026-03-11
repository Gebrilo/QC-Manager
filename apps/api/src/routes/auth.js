const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth } = require('../middleware/authMiddleware');
const { notifyAdmins } = require('./notifications');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-not-for-production-use-only';
const JWT_EXPIRES_IN = '7d';

// Legacy password helpers — kept for backward compatibility during migration
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
    const [salt, hash] = storedHash.split(':');
    const testHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return hash === testHash;
}

const DEFAULT_PERMISSIONS = {
    admin: [
        // Pages
        'page:dashboard', 'page:tasks', 'page:projects', 'page:resources',
        'page:governance', 'page:test-executions', 'page:reports', 'page:users',
        'page:my-tasks', 'page:task-history', 'page:roles',
        'page:journeys', 'page:teams', 'page:bugs',
        // Journey actions
        'action:journeys:assign',
        'action:journeys:view_assigned',
        'action:journeys:view_team_progress',
        // Task actions
        'action:tasks:create', 'action:tasks:edit', 'action:tasks:delete',
        // Project actions
        'action:projects:create', 'action:projects:edit', 'action:projects:delete',
        // Resource actions
        'action:resources:create', 'action:resources:edit', 'action:resources:delete',
        // Report actions
        'action:reports:generate',
        // Personal task actions
        'action:my-tasks:create', 'action:my-tasks:edit', 'action:my-tasks:delete',
        // Team actions
        'action:teams:manage', 'action:teams:view',
        // Test case actions
        'action:test-cases:create', 'action:test-cases:edit', 'action:test-cases:delete',
        // Test execution actions
        'action:test-executions:create', 'action:test-executions:edit', 'action:test-executions:delete',
        // Test result actions
        'action:test-results:upload', 'action:test-results:delete',
        // Bug actions
        'action:bugs:create', 'action:bugs:edit', 'action:bugs:delete',
        // Governance actions
        'action:governance:manage_gates', 'action:governance:approve_release',
    ],
    manager: [
        // Pages
        'page:dashboard', 'page:tasks', 'page:projects', 'page:resources',
        'page:governance', 'page:test-executions', 'page:reports',
        'page:my-tasks', 'page:task-history', 'page:bugs',
        // Journey actions
        'action:journeys:view_team_progress',
        'action:journeys:assign',
        // Task actions
        'action:tasks:create', 'action:tasks:edit', 'action:tasks:delete',
        // Project actions
        'action:projects:create', 'action:projects:edit',
        // Resource actions
        'action:resources:create', 'action:resources:edit',
        // Report actions
        'action:reports:generate',
        // Personal task actions
        'action:my-tasks:create', 'action:my-tasks:edit', 'action:my-tasks:delete',
        // Team actions
        'action:teams:view',
        // Test case actions
        'action:test-cases:create', 'action:test-cases:edit',
        // Test execution actions
        'action:test-executions:create', 'action:test-executions:edit',
        // Test result actions
        'action:test-results:upload',
        // Bug actions
        'action:bugs:create', 'action:bugs:edit',
        // Governance actions
        'action:governance:approve_release',
    ],
    user: [
        // Pages
        'page:dashboard', 'page:tasks', 'page:projects', 'page:resources',
        'page:test-executions', 'page:reports',
        'page:my-tasks',
        // Task actions
        'action:tasks:create', 'action:tasks:edit',
        // Report actions
        'action:reports:generate',
        // Personal task actions
        'action:my-tasks:create', 'action:my-tasks:edit', 'action:my-tasks:delete',
        // Test case actions
        'action:test-cases:create', 'action:test-cases:edit',
        // Test execution actions
        'action:test-executions:create',
        // Test result actions
        'action:test-results:upload',
        // Bug actions
        'action:bugs:create',
    ],
    viewer: [
        // Pages
        'page:dashboard', 'page:tasks', 'page:projects', 'page:resources',
        'page:test-executions', 'page:reports',
        'page:my-tasks',
        // Personal task actions
        'action:my-tasks:create', 'action:my-tasks:edit', 'action:my-tasks:delete',
    ],
    contributor: [
        // Pages
        'page:dashboard', 'page:tasks', 'page:my-tasks',
        // Task actions
        'action:tasks:edit',
        // Personal task actions
        'action:my-tasks:create', 'action:my-tasks:edit', 'action:my-tasks:delete',
    ],
};

const INACTIVE_PERMISSIONS = [
    'page:my-tasks',
    'action:my-tasks:create', 'action:my-tasks:edit', 'action:my-tasks:delete',
];

async function setDefaultPermissions(userId, role) {
    let permissions;

    // Always check custom_roles table first — it stores both custom role definitions
    // AND admin-customized overrides for built-in roles (saved when admin edits role permissions)
    try {
        const result = await db.query('SELECT permissions FROM custom_roles WHERE name = $1', [role]);
        if (result.rows.length > 0 && Array.isArray(result.rows[0].permissions) && result.rows[0].permissions.length > 0) {
            permissions = result.rows[0].permissions;
        }
    } catch {
        // DB error — fall through to defaults
    }

    // Fall back to hardcoded defaults if no DB override found
    if (!permissions) {
        permissions = DEFAULT_PERMISSIONS[role];
    }

    // Final fallback for unknown roles with no DB entry
    if (!permissions) {
        permissions = DEFAULT_PERMISSIONS.viewer;
    }

    await db.query('DELETE FROM user_permissions WHERE user_id = $1', [userId]);
    for (const perm of permissions) {
        await db.query(
            `INSERT INTO user_permissions (user_id, permission_key, granted)
             VALUES ($1, $2, true)
             ON CONFLICT (user_id, permission_key) DO UPDATE SET granted = true`,
            [userId, perm]
        );
    }
}

async function setInactivePermissions(userId) {
    await db.query('DELETE FROM user_permissions WHERE user_id = $1', [userId]);
    for (const perm of INACTIVE_PERMISSIONS) {
        await db.query(
            `INSERT INTO user_permissions (user_id, permission_key, granted) 
             VALUES ($1, $2, true) 
             ON CONFLICT (user_id, permission_key) DO UPDATE SET granted = true`,
            [userId, perm]
        );
    }
}

// =============================================================================
// POST /auth/sync — Supabase session sync
// Called by frontend after any Supabase sign-in (email, OAuth, phone).
// Creates or retrieves the app_user and returns user + permissions + token.
// =============================================================================
router.post('/sync', async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Supabase access token required' });
        }

        const accessToken = authHeader.split(' ')[1];

        // Verify the Supabase JWT and get user info
        const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET;
        if (!supabaseJwtSecret) {
            return res.status(500).json({ error: 'Server auth configuration error' });
        }

        let decoded;
        try {
            decoded = require('jsonwebtoken').verify(accessToken, supabaseJwtSecret);
        } catch (err) {
            return res.status(401).json({ error: 'Invalid Supabase token' });
        }

        const supabaseId = decoded.sub;
        const email = decoded.email || null;
        const phone = decoded.phone || null;

        // Determine auth provider from Supabase JWT app_metadata
        const appMetadata = decoded.app_metadata || {};
        let authProvider = appMetadata.provider || 'email';
        // Normalize provider names
        if (authProvider === 'azure') authProvider = 'microsoft';

        // Check if user already exists by supabase_id
        let existingUser = await db.query(
            'SELECT * FROM app_user WHERE supabase_id = $1',
            [supabaseId]
        );

        if (existingUser.rows.length > 0) {
            // User exists — return their data
            const user = existingUser.rows[0];

            if (!user.active) {
                return res.status(403).json({ error: 'Account is deactivated. Contact an administrator.' });
            }

            await db.query('UPDATE app_user SET last_login = NOW() WHERE id = $1', [user.id]);

            const permsResult = await db.query(
                'SELECT permission_key FROM user_permissions WHERE user_id = $1 AND granted = true',
                [user.id]
            );
            const permissions = permsResult.rows.map(p => p.permission_key);

            return res.json({
                user: {
                    id: user.id, name: user.name, email: user.email, phone: user.phone,
                    role: user.role, activated: user.activated,
                    preferences: user.preferences || {},
                },
                permissions,
                token: accessToken, // Use the Supabase token directly
            });
        }

        // User doesn't exist by supabase_id — check for email conflict
        if (email) {
            const emailCheck = await db.query(
                'SELECT id, auth_provider, supabase_id FROM app_user WHERE email = $1',
                [email.toLowerCase()]
            );

            if (emailCheck.rows.length > 0) {
                const existing = emailCheck.rows[0];

                // If the existing user has no supabase_id yet, this is a legacy user logging in
                // via Supabase for the first time — link them
                if (!existing.supabase_id) {
                    await db.query(
                        'UPDATE app_user SET supabase_id = $1, auth_provider = $2, updated_at = NOW() WHERE id = $3',
                        [supabaseId, authProvider, existing.id]
                    );

                    const user = (await db.query('SELECT * FROM app_user WHERE id = $1', [existing.id])).rows[0];
                    await db.query('UPDATE app_user SET last_login = NOW() WHERE id = $1', [user.id]);

                    const permsResult = await db.query(
                        'SELECT permission_key FROM user_permissions WHERE user_id = $1 AND granted = true',
                        [user.id]
                    );
                    const permissions = permsResult.rows.map(p => p.permission_key);

                    return res.json({
                        user: {
                            id: user.id, name: user.name, email: user.email, phone: user.phone,
                            role: user.role, activated: user.activated,
                            preferences: user.preferences || {},
                        },
                        permissions,
                        token: accessToken,
                    });
                }

                // Email exists and is linked to a different Supabase account / provider
                // Block cross-provider login to prevent account hijacking
                const providerName = existing.auth_provider || 'email/password';
                return res.status(409).json({
                    error: `This email is already registered with ${providerName}. Please sign in using your original method.`,
                    existing_provider: providerName,
                });
            }
        }

        // Check phone conflict for phone-only users
        if (phone && !email) {
            const phoneCheck = await db.query(
                'SELECT id, supabase_id FROM app_user WHERE phone = $1',
                [phone]
            );
            if (phoneCheck.rows.length > 0 && phoneCheck.rows[0].supabase_id) {
                return res.status(409).json({
                    error: 'This phone number is already linked to another account.',
                });
            }
        }

        // New user — create app_user
        const userCount = await db.query('SELECT COUNT(*) as count FROM app_user');
        const isFirstUser = parseInt(userCount.rows[0].count) === 0;
        const role = isFirstUser ? 'admin' : 'viewer';
        const activated = isFirstUser;

        // Build name from Supabase user metadata or email
        const userMetadata = decoded.user_metadata || {};
        const name = userMetadata.full_name || userMetadata.name ||
                     (email ? email.split('@')[0] : phone || 'User');

        const result = await db.query(
            `INSERT INTO app_user (name, email, phone, role, active, activated, supabase_id, auth_provider)
             VALUES ($1, $2, $3, $4, true, $5, $6, $7)
             RETURNING id, name, email, phone, role, active, activated, created_at`,
            [name, email ? email.toLowerCase() : null, phone || null, role, activated, supabaseId, authProvider]
        );

        const user = result.rows[0];

        if (activated) {
            await setDefaultPermissions(user.id, user.role);
        } else {
            await setInactivePermissions(user.id);
        }

        await db.query('UPDATE app_user SET last_login = NOW() WHERE id = $1', [user.id]);

        const permsResult = await db.query(
            'SELECT permission_key FROM user_permissions WHERE user_id = $1 AND granted = true',
            [user.id]
        );
        const permissions = permsResult.rows.map(p => p.permission_key);

        res.status(201).json({
            user: {
                id: user.id, name: user.name, email: user.email, phone: user.phone,
                role: user.role, activated: user.activated,
                preferences: {},
            },
            permissions,
            token: accessToken,
        });

        // Notify admins about new registration (fire-and-forget)
        if (!isFirstUser) {
            notifyAdmins(
                'user_registered',
                'New User Registered',
                `${user.name} (${user.email || user.phone}) has registered via ${authProvider} and is awaiting activation.`,
                { user_id: user.id, user_name: user.name, user_email: user.email, auth_provider: authProvider }
            );
        }
    } catch (err) {
        next(err);
    }
});

// =============================================================================
// Legacy: POST /auth/register — kept for backward compatibility
// New registrations should go through Supabase SDK + /auth/sync
// =============================================================================
router.post('/register', async (req, res, next) => {
    try {
        const { name, email, password, phone } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email, and password are required' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const existing = await db.query('SELECT id FROM app_user WHERE email = $1', [email.toLowerCase()]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        const userCount = await db.query('SELECT COUNT(*) as count FROM app_user');
        const isFirstUser = parseInt(userCount.rows[0].count) === 0;
        const role = isFirstUser ? 'admin' : 'viewer';
        const activated = isFirstUser;

        const passwordHash = hashPassword(password);

        const result = await db.query(
            `INSERT INTO app_user (name, email, password_hash, phone, role, active, activated, auth_provider) 
             VALUES ($1, $2, $3, $4, $5, true, $6, 'email') 
             RETURNING id, name, email, phone, role, active, activated, created_at`,
            [name, email.toLowerCase(), passwordHash, phone || null, role, activated]
        );

        const user = result.rows[0];

        if (activated) {
            await setDefaultPermissions(user.id, user.role);
        } else {
            await setInactivePermissions(user.id);
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, name: user.name, role: user.role },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        await db.query('UPDATE app_user SET last_login = NOW() WHERE id = $1', [user.id]);

        const permsResult = await db.query(
            'SELECT permission_key FROM user_permissions WHERE user_id = $1 AND granted = true',
            [user.id]
        );
        const permissions = permsResult.rows.map(p => p.permission_key);

        res.status(201).json({
            user: {
                id: user.id, name: user.name, email: user.email, phone: user.phone,
                role: user.role, activated: user.activated,
                preferences: {},
            },
            permissions,
            token,
        });

        // Notify admins about new registration (fire-and-forget)
        notifyAdmins(
            'user_registered',
            'New User Registered',
            `${user.name} (${user.email}) has registered and is awaiting activation.`,
            { user_id: user.id, user_name: user.name, user_email: user.email }
        );
    } catch (err) {
        next(err);
    }
});

// =============================================================================
// Legacy: POST /auth/login — kept for backward compatibility
// New logins should go through Supabase SDK + /auth/sync
// =============================================================================
router.post('/login', async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const result = await db.query(
            'SELECT * FROM app_user WHERE email = $1',
            [email.toLowerCase()]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = result.rows[0];

        if (!user.active) {
            return res.status(403).json({ error: 'Account is deactivated. Contact an administrator.' });
        }

        if (!user.password_hash || !verifyPassword(password, user.password_hash)) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, name: user.name, role: user.role },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        await db.query('UPDATE app_user SET last_login = NOW() WHERE id = $1', [user.id]);

        const permsResult = await db.query(
            'SELECT permission_key, granted FROM user_permissions WHERE user_id = $1',
            [user.id]
        );
        const permissions = permsResult.rows
            .filter(p => p.granted)
            .map(p => p.permission_key);

        res.json({
            user: {
                id: user.id, name: user.name, email: user.email, phone: user.phone,
                role: user.role, activated: user.activated,
                preferences: user.preferences || {},
            },
            permissions,
            token,
        });
    } catch (err) {
        next(err);
    }
});

// =============================================================================
// GET /auth/me — Get current user (works with both Supabase and legacy tokens)
// =============================================================================
router.get('/me', requireAuth, async (req, res, next) => {
    try {
        const result = await db.query(
            'SELECT id, name, display_name, email, phone, role, active, activated, onboarding_completed, preferences, created_at, last_login FROM app_user WHERE id = $1',
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = result.rows[0];

        const permsResult = await db.query(
            'SELECT permission_key, granted FROM user_permissions WHERE user_id = $1',
            [user.id]
        );
        const permissions = permsResult.rows
            .filter(p => p.granted)
            .map(p => p.permission_key);

        res.json({ user, permissions });
    } catch (err) {
        next(err);
    }
});

// PATCH /auth/profile — Update display name and UI preferences
router.patch('/profile', requireAuth, async (req, res, next) => {
    try {
        const { display_name, preferences } = req.body;
        const updates = [];
        const values = [];
        let idx = 1;

        if (display_name !== undefined) {
            if (typeof display_name !== 'string' || display_name.length > 100) {
                return res.status(400).json({ error: 'display_name must be a string up to 100 characters' });
            }
            updates.push(`display_name = $${idx++}`);
            values.push(display_name.trim() || null);
        }

        if (preferences !== undefined) {
            if (typeof preferences !== 'object' || Array.isArray(preferences)) {
                return res.status(400).json({ error: 'preferences must be an object' });
            }
            // Merge with existing preferences rather than overwriting
            updates.push(`preferences = preferences || $${idx++}`);
            values.push(JSON.stringify(preferences));
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'Nothing to update' });
        }

        updates.push(`updated_at = NOW()`);
        values.push(req.user.id);

        const result = await db.query(
            `UPDATE app_user SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, name, display_name, email, role, preferences`,
            values
        );

        res.json(result.rows[0]);
    } catch (err) { next(err); }
});

// =============================================================================
// POST /auth/change-password — Change password (Supabase-aware)
// =============================================================================
router.post('/change-password', requireAuth, async (req, res, next) => {
    try {
        const { current_password, new_password } = req.body;

        if (!current_password || !new_password) {
            return res.status(400).json({ error: 'current_password and new_password are required' });
        }
        if (new_password.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters' });
        }

        // Get user to check auth method
        const userResult = await db.query(
            'SELECT password_hash, supabase_id, auth_provider FROM app_user WHERE id = $1',
            [req.user.id]
        );
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = userResult.rows[0];

        // If user has a supabase_id and Supabase admin is available, use Supabase
        if (user.supabase_id && supabaseAdmin) {
            // Verify current password via legacy method if they have one
            if (user.password_hash) {
                if (!verifyPassword(current_password, user.password_hash)) {
                    return res.status(401).json({ error: 'Current password is incorrect' });
                }
            }

            // Update password in Supabase
            const { error } = await supabaseAdmin.auth.admin.updateUserById(user.supabase_id, {
                password: new_password,
            });
            if (error) {
                return res.status(500).json({ error: 'Failed to update password' });
            }

            // Also update legacy hash for backward compatibility
            const newHash = hashPassword(new_password);
            await db.query(
                'UPDATE app_user SET password_hash = $1, updated_at = NOW() WHERE id = $2',
                [newHash, req.user.id]
            );
        } else {
            // Legacy path: verify and update password hash directly
            if (!user.password_hash) {
                return res.status(400).json({ error: 'Password change not available for social login accounts' });
            }

            if (!verifyPassword(current_password, user.password_hash)) {
                return res.status(401).json({ error: 'Current password is incorrect' });
            }

            const newHash = hashPassword(new_password);
            await db.query(
                'UPDATE app_user SET password_hash = $1, updated_at = NOW() WHERE id = $2',
                [newHash, req.user.id]
            );
        }

        res.json({ success: true, message: 'Password updated successfully' });
    } catch (err) { next(err); }
});

// =============================================================================
// POST /auth/forgot-password — Request password reset email via Supabase
// =============================================================================
router.post('/forgot-password', async (req, res, next) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        // Always return success to prevent email enumeration (FR-015)
        const successResponse = {
            success: true,
            message: 'If an account exists with this email, a password reset link has been sent.',
        };

        if (!supabaseAdmin) {
            // Supabase not configured — still return success to prevent enumeration
            return res.json(successResponse);
        }

        try {
            const redirectTo = process.env.NEXT_PUBLIC_APP_URL
                ? `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password`
                : undefined;

            await supabaseAdmin.auth.resetPasswordForEmail(email.toLowerCase(), {
                redirectTo,
            });
        } catch (err) {
            // Silently handle errors to prevent email enumeration
            console.error('[Auth] Password reset error:', err.message);
        }

        res.json(successResponse);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
module.exports.DEFAULT_PERMISSIONS = DEFAULT_PERMISSIONS;
module.exports.INACTIVE_PERMISSIONS = INACTIVE_PERMISSIONS;
module.exports.setDefaultPermissions = setDefaultPermissions;
module.exports.setInactivePermissions = setInactivePermissions;

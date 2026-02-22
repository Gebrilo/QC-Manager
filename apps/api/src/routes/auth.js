const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { requireAuth } = require('../middleware/authMiddleware');
const { notifyAdmins } = require('./notifications');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-not-for-production-use-only';
const JWT_EXPIRES_IN = '7d';

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
        'page:dashboard', 'page:tasks', 'page:projects', 'page:resources',
        'page:governance', 'page:test-executions', 'page:reports', 'page:users',
        'page:my-tasks', 'page:task-history', 'page:roles',
        'page:journeys', 'page:teams',
        'action:journeys:assign',
        'action:journeys:view_assigned',
        'action:journeys:view_team_progress',
        'action:tasks:create', 'action:tasks:edit', 'action:tasks:delete',
        'action:projects:create', 'action:projects:edit', 'action:projects:delete',
        'action:resources:create', 'action:resources:edit', 'action:resources:delete',
        'action:reports:generate',
        'action:my-tasks:create', 'action:my-tasks:edit', 'action:my-tasks:delete',
        'action:teams:manage',
        'action:teams:view',
    ],
    manager: [
        'page:dashboard', 'page:tasks', 'page:projects', 'page:resources',
        'page:governance', 'page:test-executions', 'page:reports',
        'page:my-tasks', 'page:task-history',
        'action:journeys:view_team_progress',
        'action:tasks:create', 'action:tasks:edit', 'action:tasks:delete',
        'action:projects:create', 'action:projects:edit',
        'action:resources:create', 'action:resources:edit',
        'action:reports:generate',
        'action:my-tasks:create', 'action:my-tasks:edit', 'action:my-tasks:delete',
        'action:teams:view',
    ],
    user: [
        'page:dashboard', 'page:tasks', 'page:projects', 'page:resources',
        'page:test-executions', 'page:reports',
        'page:my-tasks',
        'action:tasks:create', 'action:tasks:edit',
        'action:reports:generate',
        'action:my-tasks:create', 'action:my-tasks:edit', 'action:my-tasks:delete',
    ],
    viewer: [
        'page:dashboard', 'page:tasks', 'page:projects', 'page:resources',
        'page:test-executions', 'page:reports',
        'page:my-tasks',
        'action:my-tasks:create', 'action:my-tasks:edit', 'action:my-tasks:delete',
    ],
    contributor: [
        'page:dashboard', 'page:tasks', 'page:my-tasks',
        'action:tasks:edit',
        'action:my-tasks:create', 'action:my-tasks:edit', 'action:my-tasks:delete',
    ],
};

const INACTIVE_PERMISSIONS = [
    'page:my-tasks',
    'action:my-tasks:create', 'action:my-tasks:edit', 'action:my-tasks:delete',
];

async function setDefaultPermissions(userId, role) {
    let permissions = DEFAULT_PERMISSIONS[role];

    // If not a built-in role, check custom_roles table
    if (!permissions) {
        try {
            const result = await db.query('SELECT permissions FROM custom_roles WHERE name = $1', [role]);
            permissions = result.rows.length > 0 ? result.rows[0].permissions : DEFAULT_PERMISSIONS.viewer;
        } catch {
            permissions = DEFAULT_PERMISSIONS.viewer;
        }
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
            `INSERT INTO app_user (name, email, password_hash, phone, role, active, activated) 
             VALUES ($1, $2, $3, $4, $5, true, $6) 
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
            user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, activated: user.activated },
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

        if (!verifyPassword(password, user.password_hash)) {
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
            user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, activated: user.activated },
            permissions,
            token,
        });
    } catch (err) {
        next(err);
    }
});

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

// POST /auth/change-password — Verify current password then update
router.post('/change-password', requireAuth, async (req, res, next) => {
    try {
        const { current_password, new_password } = req.body;

        if (!current_password || !new_password) {
            return res.status(400).json({ error: 'current_password and new_password are required' });
        }
        if (new_password.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters' });
        }

        const result = await db.query('SELECT password_hash FROM app_user WHERE id = $1', [req.user.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (!verifyPassword(current_password, result.rows[0].password_hash)) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        const newHash = hashPassword(new_password);
        await db.query(
            'UPDATE app_user SET password_hash = $1, updated_at = NOW() WHERE id = $2',
            [newHash, req.user.id]
        );

        res.json({ success: true, message: 'Password updated successfully' });
    } catch (err) { next(err); }
});

module.exports = router;
module.exports.DEFAULT_PERMISSIONS = DEFAULT_PERMISSIONS;
module.exports.INACTIVE_PERMISSIONS = INACTIVE_PERMISSIONS;
module.exports.setDefaultPermissions = setDefaultPermissions;
module.exports.setInactivePermissions = setInactivePermissions;

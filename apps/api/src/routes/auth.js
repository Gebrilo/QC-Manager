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
        'action:tasks:create', 'action:tasks:edit', 'action:tasks:delete',
        'action:projects:create', 'action:projects:edit', 'action:projects:delete',
        'action:resources:create', 'action:resources:edit', 'action:resources:delete',
        'action:reports:generate',
        'action:my-tasks:create', 'action:my-tasks:edit', 'action:my-tasks:delete',
    ],
    manager: [
        'page:dashboard', 'page:tasks', 'page:projects', 'page:resources',
        'page:governance', 'page:test-executions', 'page:reports',
        'page:my-tasks', 'page:task-history',
        'action:tasks:create', 'action:tasks:edit', 'action:tasks:delete',
        'action:projects:create', 'action:projects:edit',
        'action:resources:create', 'action:resources:edit',
        'action:reports:generate',
        'action:my-tasks:create', 'action:my-tasks:edit', 'action:my-tasks:delete',
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
            'SELECT id, name, email, phone, role, active, activated, created_at, last_login FROM app_user WHERE id = $1',
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

module.exports = router;
module.exports.DEFAULT_PERMISSIONS = DEFAULT_PERMISSIONS;
module.exports.INACTIVE_PERMISSIONS = INACTIVE_PERMISSIONS;
module.exports.setDefaultPermissions = setDefaultPermissions;
module.exports.setInactivePermissions = setInactivePermissions;

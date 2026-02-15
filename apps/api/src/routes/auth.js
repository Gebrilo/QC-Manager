const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { requireAuth } = require('../middleware/authMiddleware');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-not-for-production-use-only';
const JWT_EXPIRES_IN = '7d';

// ============================================================================
// Simple password hashing using Node.js built-in crypto (no bcrypt needed)
// ============================================================================

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

// ============================================================================
// Default permissions by role
// ============================================================================

const DEFAULT_PERMISSIONS = {
    admin: [
        'page:dashboard', 'page:tasks', 'page:projects', 'page:resources',
        'page:governance', 'page:test-executions', 'page:reports', 'page:users',
        'action:tasks:create', 'action:tasks:edit', 'action:tasks:delete',
        'action:projects:create', 'action:projects:edit', 'action:projects:delete',
        'action:resources:create', 'action:resources:edit', 'action:resources:delete',
        'action:reports:generate',
    ],
    manager: [
        'page:dashboard', 'page:tasks', 'page:projects', 'page:resources',
        'page:governance', 'page:test-executions', 'page:reports',
        'action:tasks:create', 'action:tasks:edit', 'action:tasks:delete',
        'action:projects:create', 'action:projects:edit',
        'action:resources:create', 'action:resources:edit',
        'action:reports:generate',
    ],
    user: [
        'page:dashboard', 'page:tasks', 'page:projects', 'page:resources',
        'page:test-executions', 'page:reports',
        'action:tasks:create', 'action:tasks:edit',
        'action:reports:generate',
    ],
    viewer: [
        'page:dashboard', 'page:tasks', 'page:projects', 'page:resources',
        'page:test-executions', 'page:reports',
    ],
};

async function setDefaultPermissions(userId, role) {
    const permissions = DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.viewer;

    // Clear existing permissions
    await db.query('DELETE FROM user_permissions WHERE user_id = $1', [userId]);

    // Insert new permissions
    for (const perm of permissions) {
        await db.query(
            `INSERT INTO user_permissions (user_id, permission_key, granted) 
             VALUES ($1, $2, true) 
             ON CONFLICT (user_id, permission_key) DO UPDATE SET granted = true`,
            [userId, perm]
        );
    }
}

// ============================================================================
// POST /auth/register
// ============================================================================

router.post('/register', async (req, res, next) => {
    try {
        const { name, email, password, phone } = req.body;

        // Validation
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email, and password are required' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // Check if email already exists
        const existing = await db.query('SELECT id FROM app_user WHERE email = $1', [email.toLowerCase()]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        // Check if this is the first user (make them admin)
        const userCount = await db.query('SELECT COUNT(*) as count FROM app_user');
        const isFirstUser = parseInt(userCount.rows[0].count) === 0;
        const role = isFirstUser ? 'admin' : 'viewer';

        // Hash password and create user
        const passwordHash = hashPassword(password);

        const result = await db.query(
            `INSERT INTO app_user (name, email, password_hash, phone, role, active) 
             VALUES ($1, $2, $3, $4, $5, true) 
             RETURNING id, name, email, phone, role, active, created_at`,
            [name, email.toLowerCase(), passwordHash, phone || null, role]
        );

        const user = result.rows[0];

        // Set default permissions
        await setDefaultPermissions(user.id, user.role);

        // Generate JWT
        const token = jwt.sign(
            { id: user.id, email: user.email, name: user.name, role: user.role },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        // Update last_login
        await db.query('UPDATE app_user SET last_login = NOW() WHERE id = $1', [user.id]);

        res.status(201).json({
            user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role },
            token,
        });
    } catch (err) {
        next(err);
    }
});

// ============================================================================
// POST /auth/login
// ============================================================================

router.post('/login', async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Find user
        const result = await db.query(
            'SELECT * FROM app_user WHERE email = $1',
            [email.toLowerCase()]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = result.rows[0];

        // Check if active
        if (!user.active) {
            return res.status(403).json({ error: 'Account is deactivated. Contact an administrator.' });
        }

        // Verify password
        if (!verifyPassword(password, user.password_hash)) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Generate JWT
        const token = jwt.sign(
            { id: user.id, email: user.email, name: user.name, role: user.role },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        // Update last_login
        await db.query('UPDATE app_user SET last_login = NOW() WHERE id = $1', [user.id]);

        // Fetch permissions
        const permsResult = await db.query(
            'SELECT permission_key, granted FROM user_permissions WHERE user_id = $1',
            [user.id]
        );
        const permissions = permsResult.rows
            .filter(p => p.granted)
            .map(p => p.permission_key);

        res.json({
            user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role },
            permissions,
            token,
        });
    } catch (err) {
        next(err);
    }
});

// ============================================================================
// GET /auth/me
// ============================================================================

router.get('/me', requireAuth, async (req, res, next) => {
    try {
        const result = await db.query(
            'SELECT id, name, email, phone, role, active, created_at, last_login FROM app_user WHERE id = $1',
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = result.rows[0];

        // Fetch permissions
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

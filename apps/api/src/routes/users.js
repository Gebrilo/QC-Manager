const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

// All user management routes require admin role
router.use(requireAuth, requireRole('admin'));

// ============================================================================
// GET /users — List all users
// ============================================================================

router.get('/', async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT id, name, email, phone, role, active, created_at, updated_at, last_login
            FROM app_user 
            ORDER BY created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

// ============================================================================
// PATCH /users/:id — Update user role or active status
// ============================================================================

router.patch('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const { role, active } = req.body;

        // Prevent self-demotion
        if (id === req.user.id && role && role !== 'admin') {
            return res.status(400).json({ error: 'Cannot demote yourself' });
        }

        // Build dynamic update
        const fields = [];
        const values = [];
        let idx = 1;

        if (role !== undefined) {
            const validRoles = ['admin', 'manager', 'user', 'viewer'];
            if (!validRoles.includes(role)) {
                return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
            }
            fields.push(`role = $${idx++}`);
            values.push(role);
        }

        if (active !== undefined) {
            // Prevent self-deactivation
            if (id === req.user.id && !active) {
                return res.status(400).json({ error: 'Cannot deactivate yourself' });
            }
            fields.push(`active = $${idx++}`);
            values.push(active);
        }

        if (fields.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        fields.push(`updated_at = NOW()`);
        values.push(id);

        const result = await db.query(
            `UPDATE app_user SET ${fields.join(', ')} WHERE id = $${idx} 
             RETURNING id, name, email, phone, role, active, created_at, updated_at, last_login`,
            values
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // If role changed, update default permissions
        if (role) {
            const DEFAULT_PERMISSIONS = require('./auth').DEFAULT_PERMISSIONS || {};
            // We'll set permissions inline since we may not export from auth
            await setRolePermissions(id, role);
        }

        res.json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

// Helper: set permissions based on role
async function setRolePermissions(userId, role) {
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

    const permissions = DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.viewer;
    await db.query('DELETE FROM user_permissions WHERE user_id = $1', [userId]);

    for (const perm of permissions) {
        await db.query(
            `INSERT INTO user_permissions (user_id, permission_key, granted) 
             VALUES ($1, $2, true) ON CONFLICT (user_id, permission_key) DO UPDATE SET granted = true`,
            [userId, perm]
        );
    }
}

// ============================================================================
// GET /users/:id/permissions — Get user permissions
// ============================================================================

router.get('/:id/permissions', async (req, res, next) => {
    try {
        const { id } = req.params;

        const result = await db.query(
            'SELECT permission_key, granted FROM user_permissions WHERE user_id = $1 ORDER BY permission_key',
            [id]
        );

        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

// ============================================================================
// PUT /users/:id/permissions — Set user permissions
// ============================================================================

router.put('/:id/permissions', async (req, res, next) => {
    try {
        const { id } = req.params;
        const { permissions } = req.body;

        if (!Array.isArray(permissions)) {
            return res.status(400).json({ error: 'permissions must be an array of permission_key strings' });
        }

        // Verify user exists
        const userCheck = await db.query('SELECT id FROM app_user WHERE id = $1', [id]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Clear all and re-insert
        await db.query('DELETE FROM user_permissions WHERE user_id = $1', [id]);

        for (const perm of permissions) {
            await db.query(
                `INSERT INTO user_permissions (user_id, permission_key, granted) VALUES ($1, $2, true)`,
                [id, perm]
            );
        }

        // Return updated permissions
        const result = await db.query(
            'SELECT permission_key, granted FROM user_permissions WHERE user_id = $1 ORDER BY permission_key',
            [id]
        );

        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

module.exports = router;

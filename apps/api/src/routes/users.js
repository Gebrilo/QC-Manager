const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { DEFAULT_PERMISSIONS, setDefaultPermissions } = require('./auth');
const { createNotification } = require('./notifications');

router.use(requireAuth, requireRole('admin'));

router.get('/', async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT id, name, email, phone, role, active, activated, created_at, updated_at, last_login
            FROM app_user 
            ORDER BY created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

router.patch('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const { role, active, activated } = req.body;

        if (id === req.user.id && role && role !== 'admin') {
            return res.status(400).json({ error: 'Cannot demote yourself' });
        }

        const fields = [];
        const values = [];
        let idx = 1;

        if (role !== undefined) {
            const validRoles = ['admin', 'manager', 'user', 'viewer', 'contributor'];
            if (!validRoles.includes(role)) {
                return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
            }
            fields.push(`role = $${idx++}`);
            values.push(role);
        }

        if (active !== undefined) {
            if (id === req.user.id && !active) {
                return res.status(400).json({ error: 'Cannot deactivate yourself' });
            }
            fields.push(`active = $${idx++}`);
            values.push(active);
        }

        if (activated !== undefined) {
            fields.push(`activated = $${idx++}`);
            values.push(activated);
        }

        if (fields.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        fields.push(`updated_at = NOW()`);
        values.push(id);

        const result = await db.query(
            `UPDATE app_user SET ${fields.join(', ')} WHERE id = $${idx} 
             RETURNING id, name, email, phone, role, active, activated, created_at, updated_at, last_login`,
            values
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const updatedUser = result.rows[0];

        if (role || activated) {
            const effectiveRole = role || updatedUser.role;
            if (updatedUser.activated) {
                await setDefaultPermissions(id, effectiveRole);
            }
        }

        res.json(updatedUser);

        // Notify user if they were just activated
        if (activated && updatedUser.activated) {
            createNotification(
                id,
                'user_activated',
                'Account Activated',
                'Your account has been activated. You now have full access to the platform.',
                {}
            );
        }
    } catch (err) {
        next(err);
    }
});

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

router.put('/:id/permissions', async (req, res, next) => {
    try {
        const { id } = req.params;
        const { permissions } = req.body;

        if (!Array.isArray(permissions)) {
            return res.status(400).json({ error: 'permissions must be an array of permission_key strings' });
        }

        const userCheck = await db.query('SELECT id FROM app_user WHERE id = $1', [id]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        await db.query('DELETE FROM user_permissions WHERE user_id = $1', [id]);

        for (const perm of permissions) {
            await db.query(
                `INSERT INTO user_permissions (user_id, permission_key, granted) VALUES ($1, $2, true)`,
                [id, perm]
            );
        }

        const result = await db.query(
            'SELECT permission_key, granted FROM user_permissions WHERE user_id = $1 ORDER BY permission_key',
            [id]
        );

        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

router.delete('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;

        if (id === req.user.id) {
            return res.status(400).json({ error: 'Cannot delete yourself' });
        }

        const userCheck = await db.query('SELECT id, name, email FROM app_user WHERE id = $1', [id]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Delete permissions first
        await db.query('DELETE FROM user_permissions WHERE user_id = $1', [id]);
        // Delete the user
        await db.query('DELETE FROM app_user WHERE id = $1', [id]);

        res.status(204).send();
    } catch (err) {
        next(err);
    }
});

module.exports = router;

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
            SELECT u.id, u.name, u.email, u.phone, u.role, u.active, u.activated,
                   u.created_at, u.updated_at, u.last_login,
                   u.manager_id, u.team_id,
                   t.name AS team_name,
                   m.name AS manager_name
            FROM app_user u
            LEFT JOIN teams t ON t.id = u.team_id AND t.deleted_at IS NULL
            LEFT JOIN app_user m ON m.id = u.manager_id
            ORDER BY u.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

router.patch('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const { role, active, activated, manager_id } = req.body;

        if (id === req.user.id && role && role !== 'admin') {
            return res.status(400).json({ error: 'Cannot demote yourself' });
        }

        const fields = [];
        const values = [];
        let idx = 1;

        if (role !== undefined) {
            const builtInRoles = ['admin', 'manager', 'user', 'viewer', 'contributor'];
            if (!builtInRoles.includes(role)) {
                // Check if it's a valid custom role
                const customRoleCheck = await db.query('SELECT name FROM custom_roles WHERE name = $1', [role]);
                if (customRoleCheck.rows.length === 0) {
                    return res.status(400).json({ error: `Invalid role '${role}'. Must be a built-in role (${builtInRoles.join(', ')}) or a valid custom role.` });
                }
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

        // Allow admin to set manager_id (links user to a manager for legacy hierarchy)
        if (manager_id !== undefined) {
            if (manager_id) {
                const managerCheck = await db.query(
                    `SELECT id FROM app_user WHERE id = $1`,
                    [manager_id]
                );
                if (managerCheck.rows.length === 0) {
                    return res.status(400).json({ error: 'Manager user not found' });
                }
            }
            fields.push(`manager_id = $${idx++}`);
            values.push(manager_id || null);
        }

        if (fields.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        fields.push(`updated_at = NOW()`);
        values.push(id);

        const result = await db.query(
            `UPDATE app_user SET ${fields.join(', ')} WHERE id = $${idx}
             RETURNING id, name, email, phone, role, active, activated, manager_id, team_id, created_at, updated_at, last_login`,
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

        // Notify user if they were just activated + auto-assign journeys
        if (activated && updatedUser.activated) {
            createNotification(
                id,
                'user_activated',
                'Account Activated',
                'Your account has been activated. You now have full access to the platform.',
                {}
            );

            // Auto-assign active journeys with auto_assign_on_activation
            db.query(
                `INSERT INTO user_journey_assignments (user_id, journey_id)
                 SELECT $1, j.id FROM journeys j
                 WHERE j.auto_assign_on_activation = true AND j.is_active = true AND j.deleted_at IS NULL
                 ON CONFLICT (user_id, journey_id) DO NOTHING`,
                [id]
            ).catch(err => console.error('Journey auto-assignment error:', err.message));
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

        // Import ALL_PERMISSIONS from roles.js to know the full set of valid permission keys
        const { ALL_PERMISSIONS } = require('./roles');

        // Instead of wiping all permissions, only update the ones included in ALL_PERMISSIONS.
        // This prevents the frontend (which may know a subset) from accidentally wiping unknown keys.
        const permissionsToGrant = new Set(permissions);

        for (const permKey of ALL_PERMISSIONS) {
            if (permissionsToGrant.has(permKey)) {
                // Grant this permission
                await db.query(
                    `INSERT INTO user_permissions (user_id, permission_key, granted)
                     VALUES ($1, $2, true)
                     ON CONFLICT (user_id, permission_key) DO UPDATE SET granted = true`,
                    [id, permKey]
                );
            } else {
                // Revoke this permission (delete the row)
                await db.query(
                    `DELETE FROM user_permissions WHERE user_id = $1 AND permission_key = $2`,
                    [id, permKey]
                );
            }
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

router.post('/:id/convert-to-resource', async (req, res, next) => {
    try {
        const { id } = req.params;
        const { weekly_capacity_hrs, department, role } = req.body;

        // Validate user exists and is activated
        const userCheck = await db.query(
            'SELECT id, name, email, activated FROM app_user WHERE id = $1',
            [id]
        );
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = userCheck.rows[0];
        if (!user.activated) {
            return res.status(400).json({ error: 'User must be activated before converting to a resource' });
        }

        // Check for existing linked resource
        const existingResource = await db.query(
            'SELECT id, resource_name FROM resources WHERE user_id = $1 AND deleted_at IS NULL',
            [id]
        );
        if (existingResource.rows.length > 0) {
            return res.status(409).json({
                error: 'User is already linked to a resource',
                resource_id: existingResource.rows[0].id,
                resource_name: existingResource.rows[0].resource_name
            });
        }

        // Create the resource record
        const result = await db.query(
            `INSERT INTO resources (
                resource_name, user_id, email, weekly_capacity_hrs, department, role, is_active, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7)
            RETURNING *`,
            [
                user.name,
                id,
                user.email,
                weekly_capacity_hrs || 40,
                department || null,
                role || null,
                req.user?.email || 'system'
            ]
        );

        const resource = result.rows[0];

        // Return with utilization metrics from view
        const viewResult = await db.query(
            'SELECT * FROM v_resources_with_utilization WHERE id = $1',
            [resource.id]
        );

        res.status(201).json(viewResult.rows[0] || resource);
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

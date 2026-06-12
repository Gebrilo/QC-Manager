const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth, requirePermission } = require('../middleware/authMiddleware');
const { DEFAULT_PERMISSIONS, setDefaultPermissions } = require('./auth');
const { insertNotification } = require('../services/notifications/dispatcher');
const { rollbackUser } = require('../services/userLifecycle');
const { ROLES } = require('../../../shared/rbac/catalog.ts');

const BUILT_IN_ROLES = Object.freeze(Object.keys(ROLES));

router.use(requireAuth);

router.get('/', requirePermission('qc.admin.users.view'), async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT u.id, u.name, u.email, u.phone, u.role, u.active,
                   u.status, u.ready_for_activation, u.team_membership_active,
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

router.patch('/:id', requirePermission('qc.admin.manage_users'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { role, active, status, manager_id } = req.body;

        if (id === req.user.id && role && role !== 'admin') {
            return res.status(400).json({ error: 'Cannot demote yourself' });
        }

        // Capture the prior state so we can detect deactivation transitions
        // (active: true → false, or status: ACTIVE → anything else). Loading
        // up-front keeps the notification logic in sync with whatever
        // combination of fields the admin actually changed in this PATCH.
        const priorResult = await db.query(
            `SELECT id, name, email, role, active, status FROM app_user WHERE id = $1`,
            [id]
        );
        if (priorResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const priorUser = priorResult.rows[0];

        const fields = [];
        const values = [];
        let idx = 1;

        if (role !== undefined) {
            if (!BUILT_IN_ROLES.includes(role)) {
                // Check if it's a valid custom role
                const customRoleCheck = await db.query('SELECT name FROM custom_roles WHERE name = $1', [role]);
                if (customRoleCheck.rows.length === 0) {
                    return res.status(400).json({ error: `Invalid role '${role}'. Must be a built-in role (${BUILT_IN_ROLES.join(', ')}) or a valid custom role.` });
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

        if (status !== undefined) {
            const validStatuses = ['PREPARATION', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({ error: `Invalid status '${status}'` });
            }
            fields.push(`status = $${idx++}`);
            values.push(status);
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
             RETURNING id, name, email, phone, role, active, status, manager_id, team_id, created_at, updated_at, last_login`,
            values
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const updatedUser = result.rows[0];

        // Apply role permissions when role changes OR when activating a user
        if (role || status === 'ACTIVE') {
            const effectiveRole = role || updatedUser.role;
            await setDefaultPermissions(id, effectiveRole);
        }

        res.json(updatedUser);

        // Deactivation = the user was active (or active=true) and is now
        // not. We detect either of:
        //   - active: true → false
        //   - status: ACTIVE → non-ACTIVE (e.g. SUSPENDED, ARCHIVED, PREPARATION)
        // Both surface as a single "user_deactivated" notification so the
        // bell UI can render a single entry per PATCH.
        const wasActive = priorUser.active && priorUser.status === 'ACTIVE';
        const nowActive = updatedUser.active && updatedUser.status === 'ACTIVE';
        const isDeactivation = wasActive && !nowActive;

        if (isDeactivation) {
            notifyUserDeactivated(id, updatedUser, req.user).catch(err =>
                console.error('Failed to notify user of deactivation:', err.message)
            );
        }

        // Notify user if they were just activated + auto-assign journeys
        if (status === 'ACTIVE' && updatedUser.status === 'ACTIVE') {
            insertNotification({
                user_id: id,
                type: 'user_activated',
                title: 'Account Activated',
                message: 'Your account has been activated. You now have full access to the platform.',
                entity_type: 'user',
                entity_id: id,
            }).catch(err => console.error('Failed to notify user of activation:', err.message));

            // Auto-assign active journeys with auto_assign_on_activation
            db.query(
                `INSERT INTO user_journey_assignments (user_id, journey_id)
                 SELECT $1, j.id FROM journeys j
                 WHERE j.auto_assign_on_activation = true AND j.is_active = true AND j.deleted_at IS NULL
                 ON CONFLICT (user_id, journey_id) DO NOTHING`,
                [id]
            ).catch(err => console.error('Journey auto-assignment error:', err.message));

            // Auto-link to matching resource by email (if not already linked)
            if (updatedUser.email) {
                db.query(
                    `UPDATE resources SET user_id = $1, updated_at = NOW()
                     WHERE LOWER(email) = LOWER($2)
                       AND user_id IS NULL
                       AND deleted_at IS NULL`,
                    [id, updatedUser.email]
                ).catch(err => console.error('Resource auto-link error:', err.message));
            }
        }
    } catch (err) {
        next(err);
    }
});

router.get('/:id/permissions', requirePermission('qc.admin.users.view'), async (req, res, next) => {
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

router.put('/:id/permissions', requirePermission('qc.admin.manage_permissions'), async (req, res, next) => {
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

router.post('/:id/convert-to-resource', requirePermission('qc.admin.manage_users'), async (req, res, next) => {
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

router.delete('/:id', requirePermission('qc.admin.manage_users'), async (req, res, next) => {
    try {
        const { id } = req.params;

        if (id === req.user.id) {
            return res.status(400).json({ error: 'Cannot delete yourself' });
        }

        const userCheck = await db.query('SELECT id, name, email, supabase_id FROM app_user WHERE id = $1', [id]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const { name: deletedName, email: deletedEmail, supabase_id: supabaseId } = userCheck.rows[0];

        await db.query('DELETE FROM user_permissions WHERE user_id = $1', [id]);
        await db.query('DELETE FROM app_user WHERE id = $1', [id]);

        if (supabaseId) {
            await db.query('DELETE FROM auth.users WHERE id = $1', [supabaseId]).catch(() => {});
        }

        // Notify all active admins. The deleted user can't be a recipient
        // (their account is gone) — the FK on notification.user_id would
        // reject it. The notification row's entity_id still points to the
        // now-deleted user id, so the bell link carries the historical
        // reference without needing a live app_user row.
        notifyUserDeleted(id, deletedName, deletedEmail, req.user).catch(err =>
            console.error('Failed to notify admins of user deletion:', err.message)
        );

        res.status(204).send();
    } catch (err) {
        next(err);
    }
});

// POST /users/:id/rollback — Admin-only: revert ACTIVE user to PREPARATION
router.post('/:id/rollback', requirePermission('qc.admin.manage_users'), async (req, res, next) => {
    try {
        const { id } = req.params;
        if (id === req.user.id) {
            return res.status(400).json({ error: 'Cannot rollback your own account' });
        }
        const result = await rollbackUser(id, req.user.id);
        res.json(result);
    } catch (err) {
        if (err.status) return res.status(err.status).json({ error: err.message });
        next(err);
    }
});

// Helper: notify the deactivated user + all active admins. Wraps two
// direct inserts so callers can fire-and-forget without dealing with
// the actor-exclusion logic the audit dispatcher normally handles.
async function notifyUserDeactivated(userId, updatedUser, actor) {
    const name = updatedUser.name || 'a user';
    const message = `Your account has been deactivated${actor ? ` by ${actor.name || actor.email}` : ''}. Contact an administrator for help.`;
    const recipients = [userId];

    const admins = await db.query("SELECT id FROM app_user WHERE role = 'admin' AND active = true");
    for (const a of admins.rows) recipients.push(a.id);

    const dedup = [...new Set(recipients.filter(Boolean).filter(rid => rid !== (actor && actor.id)))];

    for (const recipientId of dedup) {
        await insertNotification({
            user_id: recipientId,
            type: 'user_deactivated',
            title: recipientId === userId ? 'Your account has been deactivated' : 'User deactivated',
            message: recipientId === userId
                ? message
                : `${name} (${updatedUser.email || ''}) was deactivated.`,
            metadata: { user_name: name, user_email: updatedUser.email },
            entity_type: 'user',
            entity_id: userId,
            actor_id: actor ? actor.id : null,
        });
    }
}

// Helper: notify all active admins that a user was deleted. The user
// themselves is gone by the time this fires (the FK on notification.user_id
// would reject them anyway), so we only target admins.
async function notifyUserDeleted(userId, name, email, actor) {
    const admins = await db.query("SELECT id FROM app_user WHERE role = 'admin' AND active = true");
    const recipients = [...new Set(admins.rows.map(a => a.id).filter(rid => rid !== (actor && actor.id)))];

    for (const adminId of recipients) {
        await insertNotification({
            user_id: adminId,
            type: 'user_deleted',
            title: 'User deleted',
            message: `${name} (${email || 'no email'}) was permanently deleted.`,
            metadata: { user_name: name, user_email: email },
            entity_type: 'user',
            entity_id: userId,
            actor_id: actor ? actor.id : null,
        });
    }
}

module.exports = router;

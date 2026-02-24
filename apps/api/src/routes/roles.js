const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { DEFAULT_PERMISSIONS, setDefaultPermissions } = require('./auth');

// All system permission keys
const ALL_PERMISSIONS = [
    // Page permissions
    'page:dashboard', 'page:tasks', 'page:projects', 'page:resources',
    'page:governance', 'page:test-executions', 'page:reports', 'page:users',
    'page:my-tasks', 'page:task-history', 'page:roles', 'page:journeys',
    'page:teams', 'page:bugs',
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
    // Journey actions
    'action:journeys:assign',
    'action:journeys:view_assigned',
    'action:journeys:view_team_progress',
    // Team actions
    'action:teams:manage',
    'action:teams:view',
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
];

// Protected built-in roles that cannot be deleted
const BUILT_IN_ROLES = ['admin', 'manager', 'user', 'viewer', 'contributor'];

// GET all roles with their permissions
router.get('/', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        // Get all roles from custom_roles table (includes both custom roles AND built-in overrides)
        const customResult = await db.query('SELECT * FROM custom_roles ORDER BY created_at ASC');
        const customRolesMap = new Map();
        for (const cr of customResult.rows) {
            customRolesMap.set(cr.name, cr);
        }

        // Merge built-in and custom roles
        const roles = [];

        // Built-in roles — use DB override if admin has customized, otherwise hardcoded defaults
        for (const [roleName, defaultPerms] of Object.entries(DEFAULT_PERMISSIONS)) {
            const dbOverride = customRolesMap.get(roleName);
            roles.push({
                name: roleName,
                permissions: dbOverride && Array.isArray(dbOverride.permissions) && dbOverride.permissions.length > 0
                    ? dbOverride.permissions
                    : defaultPerms,
                is_builtin: true,
                is_protected: roleName === 'admin',
                is_customized: !!dbOverride,
            });
            // Remove from map so it doesn't appear again as a custom role
            customRolesMap.delete(roleName);
        }

        // Remaining custom roles (not built-in overrides)
        for (const [, cr] of customRolesMap) {
            roles.push({
                name: cr.name,
                permissions: cr.permissions || [],
                is_builtin: false,
                is_protected: false,
                created_at: cr.created_at,
                created_by: cr.created_by,
            });
        }

        res.json(roles);
    } catch (err) {
        next(err);
    }
});

// GET all available permission keys
router.get('/permissions', requireAuth, requireRole('admin'), async (req, res) => {
    res.json(ALL_PERMISSIONS);
});

// POST create a custom role
router.post('/', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        const { name, permissions = [] } = req.body;

        if (!name || typeof name !== 'string') {
            return res.status(400).json({ error: 'Role name is required' });
        }

        // Validate: only alphanumeric + underscores, lowercase
        const normalizedName = name.toLowerCase().trim();
        if (!/^[a-z0-9_]+$/.test(normalizedName)) {
            return res.status(400).json({ error: 'Role name must be alphanumeric (lowercase, underscores allowed)' });
        }

        // Check if name conflicts with built-in roles
        if (BUILT_IN_ROLES.includes(normalizedName)) {
            return res.status(409).json({ error: `'${normalizedName}' is a built-in role and cannot be recreated` });
        }

        // Check for duplicate custom role
        const existing = await db.query('SELECT name FROM custom_roles WHERE name = $1', [normalizedName]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: `Role '${normalizedName}' already exists` });
        }

        // Validate permission keys
        const validPerms = permissions.filter(p => ALL_PERMISSIONS.includes(p));

        await db.query(
            'INSERT INTO custom_roles (name, permissions, created_by) VALUES ($1, $2, $3)',
            [normalizedName, validPerms, req.user?.email || 'system']
        );

        res.status(201).json({
            name: normalizedName,
            permissions: validPerms,
            is_builtin: false,
            is_protected: false,
        });
    } catch (err) {
        next(err);
    }
});

// PATCH update permissions for a role (applies immediately to all users with that role)
router.patch('/:roleName', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        const { roleName } = req.params;
        const { permissions } = req.body;

        if (!Array.isArray(permissions)) {
            return res.status(400).json({ error: 'permissions must be an array' });
        }

        // Prevent modifying admin role
        if (roleName === 'admin') {
            return res.status(403).json({ error: 'The admin role cannot be modified to prevent system lockout' });
        }

        // Validate permission keys
        const validPerms = permissions.filter(p => ALL_PERMISSIONS.includes(p));

        // Check if it's a built-in role or custom role
        const isBuiltIn = BUILT_IN_ROLES.includes(roleName);

        if (isBuiltIn) {
            // For built-in roles, persist the override in custom_roles table
            // so setDefaultPermissions() can pick it up for new users
            const existing = await db.query('SELECT name FROM custom_roles WHERE name = $1', [roleName]);
            if (existing.rows.length > 0) {
                await db.query(
                    'UPDATE custom_roles SET permissions = $1 WHERE name = $2',
                    [validPerms, roleName]
                );
            } else {
                await db.query(
                    'INSERT INTO custom_roles (name, permissions, created_by) VALUES ($1, $2, $3)',
                    [roleName, validPerms, req.user?.email || 'system']
                );
            }
        } else {
            // For custom roles, update the custom_roles table
            const existing = await db.query('SELECT name FROM custom_roles WHERE name = $1', [roleName]);
            if (existing.rows.length === 0) {
                return res.status(404).json({ error: `Role '${roleName}' not found` });
            }
            await db.query(
                'UPDATE custom_roles SET permissions = $1 WHERE name = $2',
                [validPerms, roleName]
            );
        }

        // Apply changes immediately to all users with this role
        const usersResult = await db.query('SELECT id FROM app_user WHERE role = $1', [roleName]);
        for (const user of usersResult.rows) {
            // Delete existing permissions
            await db.query('DELETE FROM user_permissions WHERE user_id = $1', [user.id]);
            // Set new permissions
            for (const perm of validPerms) {
                await db.query(
                    `INSERT INTO user_permissions (user_id, permission_key, granted) 
                     VALUES ($1, $2, true)
                     ON CONFLICT (user_id, permission_key) DO UPDATE SET granted = true`,
                    [user.id, perm]
                );
            }
        }

        res.json({
            name: roleName,
            permissions: validPerms,
            is_builtin: isBuiltIn,
            affected_users: usersResult.rows.length,
        });
    } catch (err) {
        next(err);
    }
});

// DELETE a custom role
router.delete('/:roleName', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        const { roleName } = req.params;

        // Prevent deletion of built-in roles
        if (BUILT_IN_ROLES.includes(roleName)) {
            return res.status(403).json({ error: `Built-in role '${roleName}' cannot be deleted` });
        }

        // Check if any users are still assigned to this role
        const usersResult = await db.query('SELECT COUNT(*) as count FROM app_user WHERE role = $1', [roleName]);
        if (parseInt(usersResult.rows[0].count) > 0) {
            return res.status(409).json({
                error: `Cannot delete role '${roleName}' — ${usersResult.rows[0].count} user(s) are still assigned to it. Reassign them first.`
            });
        }

        const result = await db.query('DELETE FROM custom_roles WHERE name = $1 RETURNING *', [roleName]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: `Role '${roleName}' not found` });
        }

        res.json({ success: true, message: `Role '${roleName}' deleted` });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
module.exports.ALL_PERMISSIONS = ALL_PERMISSIONS;
module.exports.BUILT_IN_ROLES = BUILT_IN_ROLES;

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { DEFAULT_PERMISSIONS, setDefaultPermissions } = require('./auth');

// All system permission keys
const ALL_PERMISSIONS = [
    'page:dashboard', 'page:tasks', 'page:projects', 'page:resources',
    'page:governance', 'page:test-executions', 'page:reports', 'page:users',
    'page:my-tasks', 'page:task-history', 'page:roles',
    'action:tasks:create', 'action:tasks:edit', 'action:tasks:delete',
    'action:projects:create', 'action:projects:edit', 'action:projects:delete',
    'action:resources:create', 'action:resources:edit', 'action:resources:delete',
    'action:reports:generate',
    'action:my-tasks:create', 'action:my-tasks:edit', 'action:my-tasks:delete',
];

// Protected built-in roles that cannot be deleted
const BUILT_IN_ROLES = ['admin', 'manager', 'user', 'viewer', 'contributor'];

// GET all roles with their permissions
router.get('/', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        // Get custom roles from database
        const customResult = await db.query('SELECT * FROM custom_roles ORDER BY created_at ASC');
        const customRoles = customResult.rows;

        // Merge built-in and custom roles
        const roles = [];

        // Built-in roles
        for (const [roleName, perms] of Object.entries(DEFAULT_PERMISSIONS)) {
            roles.push({
                name: roleName,
                permissions: perms,
                is_builtin: true,
                is_protected: roleName === 'admin',
            });
        }

        // Custom roles
        for (const cr of customRoles) {
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

        if (!isBuiltIn) {
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

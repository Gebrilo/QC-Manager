const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth, requirePermission } = require('../middleware/authMiddleware');
const {
    ALL_PERMISSION_VALUES,
    BUILT_IN_ROLE_PERMISSION_DEFAULTS,
    ROLES,
    collectRolePermissions,
} = require('../../../shared/rbac/catalog.ts');

const ALL_PERMISSIONS = Object.freeze(ALL_PERMISSION_VALUES);

// Protected built-in roles that cannot be deleted
const BUILT_IN_ROLES = Object.freeze(Object.keys(ROLES));
const PROTECTED_BUILT_IN_ROLES = Object.freeze(new Set(BUILT_IN_ROLES));

function catalogPermissionsFor(roleName) {
    return BUILT_IN_ROLE_PERMISSION_DEFAULTS[roleName]
        || collectRolePermissions(roleName, new Set())
        || [];
}

async function loadRolePermissionMap() {
    const result = await db.query(`
        SELECT role_identifier, permission_key
        FROM role_permissions
        ORDER BY role_identifier, permission_key
    `);
    const map = new Map();
    for (const row of result.rows) {
        if (!map.has(row.role_identifier)) map.set(row.role_identifier, []);
        map.get(row.role_identifier).push(row.permission_key);
    }
    return map;
}

async function replaceRolePermissions(roleName, permissions, grantedBy) {
    await db.query('DELETE FROM role_permissions WHERE role_identifier = $1', [roleName]);
    for (const permission of permissions) {
        await db.query(
            `INSERT INTO role_permissions (role_identifier, permission_key, granted_by)
             VALUES ($1, $2, $3)
             ON CONFLICT (role_identifier, permission_key)
             DO UPDATE SET granted_by = EXCLUDED.granted_by`,
            [roleName, permission, grantedBy]
        );
    }
}

// GET all roles with their permissions
router.get('/', requireAuth, requirePermission('qc.admin.roles.view'), async (req, res, next) => {
    try {
        const [customResult, rolePermissionMap] = await Promise.all([
            db.query('SELECT name, created_at, created_by FROM custom_roles ORDER BY created_at ASC'),
            loadRolePermissionMap(),
        ]);
        const customRolesMap = new Map();
        for (const cr of customResult.rows) {
            customRolesMap.set(cr.name, cr);
        }

        // Merge built-in and custom roles
        const roles = [];

        // Built-in roles use role_permissions when present, otherwise catalog defaults.
        for (const roleName of BUILT_IN_ROLES) {
            const dbOverride = customRolesMap.get(roleName);
            const dbPermissions = rolePermissionMap.get(roleName) || [];
            roles.push({
                name: roleName,
                permissions: dbPermissions.length > 0 ? dbPermissions : catalogPermissionsFor(roleName),
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
                permissions: rolePermissionMap.get(cr.name) || [],
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
router.get('/permissions', requireAuth, requirePermission('qc.admin.roles.view'), async (req, res) => {
    res.json(ALL_PERMISSIONS);
});

// POST create a custom role
router.post('/', requireAuth, requirePermission('qc.admin.manage_roles'), async (req, res, next) => {
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

        const grantedBy = req.user?.email || 'system';
        await db.query(
            'INSERT INTO custom_roles (name, created_by) VALUES ($1, $2)',
            [normalizedName, grantedBy]
        );
        await replaceRolePermissions(normalizedName, validPerms, grantedBy);

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
router.patch('/:roleName', requireAuth, requirePermission('qc.admin.manage_roles'), async (req, res, next) => {
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

        const grantedBy = req.user?.email || 'system';
        const isBuiltIn = BUILT_IN_ROLES.includes(roleName);

        if (!isBuiltIn) {
            const existing = await db.query('SELECT name FROM custom_roles WHERE name = $1', [roleName]);
            if (existing.rows.length === 0) {
                return res.status(404).json({ error: `Role '${roleName}' not found` });
            }
        }

        await replaceRolePermissions(roleName, validPerms, grantedBy);

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
router.delete('/:roleName', requireAuth, requirePermission('qc.admin.manage_roles'), async (req, res, next) => {
    try {
        const { roleName } = req.params;

        // Prevent deletion of built-in roles
        if (PROTECTED_BUILT_IN_ROLES.has(roleName)) {
            return res.status(403).json({ error: `Built-in role '${roleName}' cannot be deleted` });
        }

        // Check if any users are still assigned to this role
        const usersResult = await db.query('SELECT COUNT(*) as count FROM app_user WHERE role = $1', [roleName]);
        if (parseInt(usersResult.rows[0].count) > 0) {
            return res.status(409).json({
                error: `Cannot delete role '${roleName}' — ${usersResult.rows[0].count} user(s) are still assigned to it. Reassign them first.`
            });
        }

        await db.query('DELETE FROM role_permissions WHERE role_identifier = $1', [roleName]);
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

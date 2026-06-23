'use strict';

const {
    ALL_PERMISSION_VALUES,
    ROLES,
    canonicalRole,
    collectRolePermissions,
} = require('../../../shared/rbac/catalog.ts');

const ALL_PERMISSIONS = Object.freeze(ALL_PERMISSION_VALUES);
const BUILT_IN_ROLES = Object.freeze(Object.keys(ROLES));
const ROLE_NAME_PATTERN = /^[a-z0-9_]+$/;

function isBuiltInRole(roleName) {
    return BUILT_IN_ROLES.includes(roleName);
}

function normalizeRoleName(name) {
    return typeof name === 'string' ? name.toLowerCase().trim() : '';
}

function validateRoleName(name) {
    const normalized = normalizeRoleName(name);
    if (!normalized) return { ok: false, error: 'Role name is required' };
    if (!ROLE_NAME_PATTERN.test(normalized)) {
        return { ok: false, error: 'Role name must be lowercase alphanumeric with underscores allowed' };
    }
    return { ok: true, name: normalized };
}

function validatePermissionList(permissions) {
    if (!Array.isArray(permissions)) return [];
    return [...new Set(permissions.filter(permission => ALL_PERMISSIONS.includes(permission)))];
}

function aliasesForCanonical(canonical) {
    return Object.keys(ROLES).filter(roleName => canonicalRole(roleName) === canonical);
}

function roleStorageNames(roleName) {
    const canonical = canonicalRole(roleName);
    if (BUILT_IN_ROLES.includes(canonical)) return [canonical];
    if (!isBuiltInRole(roleName)) return [roleName];
    const names = aliasesForCanonical(canonical);
    return names.length > 0 ? names : [roleName];
}

function defaultsForRole(roleName) {
    const defaults = collectRolePermissions(canonicalRole(roleName), new Set());
    if (defaults.includes('*')) return [...ALL_PERMISSIONS];
    return [...new Set(defaults.filter(permission => ALL_PERMISSIONS.includes(permission)))];
}

async function customRoleExists(client, roleName) {
    const result = await client.query('SELECT name FROM custom_roles WHERE name = $1', [roleName]);
    return result.rows.length > 0;
}

async function roleExists(client, roleName) {
    if (isBuiltInRole(roleName)) return true;
    return customRoleExists(client, roleName);
}

async function getRolePermissionSet(client, roleName) {
    if (roleName === 'admin') return new Set(ALL_PERMISSIONS);

    const canonical = canonicalRole(roleName);
    const normalizedResult = await client.query(
        'SELECT permission_key FROM role_permissions WHERE role_identifier = $1 ORDER BY permission_key',
        [canonical]
    );
    if (normalizedResult.rows.length > 0) {
        return new Set(normalizedResult.rows.map(row => row.permission_key));
    }

    if (isBuiltInRole(roleName)) {
        return new Set(defaultsForRole(roleName));
    }

    return new Set();
}

async function listRoles(client) {
    const customResult = await client.query('SELECT name, created_at, created_by FROM custom_roles ORDER BY created_at ASC');
    const customRoles = new Map(customResult.rows.map(row => [row.name, row]));
    const roles = [];

    for (const roleName of BUILT_IN_ROLES) {
        const permissionSet = await getRolePermissionSet(client, roleName);
        const permissions = [...permissionSet];
        roles.push({
            name: roleName,
            role_identifier: roleName,
            permissions,
            is_builtin: true,
            is_protected: roleName === 'admin',
            is_customized: customRoles.has(roleName) || customRoles.has(canonicalRole(roleName)),
        });
        customRoles.delete(roleName);
    }

    for (const [, row] of customRoles) {
        const permissionSet = await getRolePermissionSet(client, row.name);
        const permissions = [...permissionSet];
        roles.push({
            name: row.name,
            role_identifier: row.name,
            permissions,
            is_builtin: false,
            is_protected: false,
            created_at: row.created_at,
            created_by: row.created_by,
        });
    }

    return roles;
}

async function syncRolePermissions(client, roleName, permissions, actorEmail = 'system') {
    const normalizedPermissions = validatePermissionList(permissions);
    const canonical = canonicalRole(roleName);
    const storageNames = roleStorageNames(roleName);

    await client.query('DELETE FROM role_permissions WHERE role_identifier = $1', [canonical]);
    for (const permission of normalizedPermissions) {
        await client.query(
            `INSERT INTO role_permissions (role_identifier, permission_key, granted_by)
             VALUES ($1, $2, $3)
             ON CONFLICT (role_identifier, permission_key) DO UPDATE
             SET granted_by = EXCLUDED.granted_by`,
            [canonical, permission, actorEmail]
        );
    }

    for (const storageName of storageNames) {
        await client.query(
            `INSERT INTO custom_roles (name, created_by)
             VALUES ($1, $2)
             ON CONFLICT (name) DO NOTHING`,
            [storageName, actorEmail]
        );
    }

    // ADR 0010 (issue #263): the role-permission fan-out into per-user
    // user_permissions rows is removed. role_permissions is the canonical role
    // layer; the Access Engine resolver reads it directly. user_permissions is a
    // sparse delta of genuine per-user exceptions only, so a Matrix save must
    // not wipe or rewrite them (this also fixes the latent data-loss bug where
    // a save deleted real per-user exceptions).

    return { permissions: normalizedPermissions, affectedRoleNames: storageNames };
}

async function auditRolePermissionChange(client, { roleName, permissionKey, beforeGranted, afterGranted, actorEmail }) {
    const beforeState = { role_identifier: roleName, permission_key: permissionKey, granted: beforeGranted };
    const afterState = { role_identifier: roleName, permission_key: permissionKey, granted: afterGranted };
    await client.query(
        `INSERT INTO audit_log (
            entity_type, action, before_state, after_state, changed_fields, change_summary, user_email
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
            'role_permission',
            'UPDATE',
            JSON.stringify(beforeState),
            JSON.stringify(afterState),
            ['granted'],
            `${afterGranted ? 'Granted' : 'Revoked'} ${permissionKey} for ${roleName}`,
            actorEmail || 'system',
        ]
    );
}

module.exports = {
    ALL_PERMISSIONS,
    BUILT_IN_ROLES,
    canonicalRole,
    defaultsForRole,
    getRolePermissionSet,
    isBuiltInRole,
    listRoles,
    normalizeRoleName,
    roleExists,
    syncRolePermissions,
    auditRolePermissionChange,
    validatePermissionList,
    validateRoleName,
};

'use strict';

const db = require('../config/db');
const {
    BUILT_IN_ROLE_PERMISSION_DEFAULTS,
    ROLES,
    collectRolePermissions,
} = require('../../../shared/rbac/catalog.ts');

function canonicalRole(role) {
    const def = ROLES[role];
    if (def && def.aliasFor) return def.aliasFor;
    return role;
}

async function loadRolePermissions(roleIdentifier) {
    const result = await db.query(
        'SELECT permission_key FROM role_permissions WHERE role_identifier = $1',
        [roleIdentifier]
    );
    if (result.rows.length > 0) {
        return new Set(result.rows.map(r => r.permission_key));
    }
    // Fallback: role_permissions table empty for this role. Use the canonical
    // catalog defaults if available (admin/pm/team_manager/member/viewer/tester),
    // otherwise resolve via collectRolePermissions so any role defined in the
    // catalog (e.g. legacy `contributor`) still gets its permissions.
    if (BUILT_IN_ROLE_PERMISSION_DEFAULTS[roleIdentifier]) {
        return new Set(BUILT_IN_ROLE_PERMISSION_DEFAULTS[roleIdentifier]);
    }
    return new Set(collectRolePermissions(roleIdentifier, new Set()));
}

async function loadUserPermissions(userId) {
    const result = await db.query(
        'SELECT permission_key, granted FROM user_permissions WHERE user_id = $1',
        [userId]
    );
    return result.rows;
}

async function loadScope(userId) {
    const teamResult = await db.query(
        `SELECT u.team_id, tt.code AS team_type
         FROM app_user u
         LEFT JOIN teams t ON u.team_id = t.id
         LEFT JOIN team_types tt ON t.team_type_id = tt.id
         WHERE u.id = $1`,
        [userId]
    );
    const teamRow = teamResult.rows[0] || { team_id: null, team_type: null };

    const pmResult = await db.query(
        'SELECT project_id FROM project_managers WHERE user_id = $1',
        [userId]
    );
    return {
        team_id: teamRow.team_id,
        team_type: teamRow.team_type,
        pm_of_projects: pmResult.rows.map(r => r.project_id),
    };
}

async function resolve(user, req) {
    if (req && req._accessResolverCache) return req._accessResolverCache;

    const roleIdentifier = canonicalRole(user.role);
    const [rolePerms, userPerms, scope] = await Promise.all([
        loadRolePermissions(roleIdentifier),
        loadUserPermissions(user.id),
        loadScope(user.id),
    ]);

    const effective = new Set(rolePerms);
    for (const row of userPerms) {
        if (row.granted === false) effective.delete(row.permission_key);
        else effective.add(row.permission_key);
    }

    const result = { effectivePermissions: effective, scope };
    if (req) req._accessResolverCache = result;
    return result;
}

module.exports = { resolve, canonicalRole };

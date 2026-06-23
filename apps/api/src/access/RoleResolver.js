'use strict';

const db = require('../config/db');
const {
    ROLES,
    BUILT_IN_ROLE_PERMISSION_DEFAULTS,
    canonicalRole,
    collectRolePermissions,
    collectRoleScopes,
} = require('../../../shared/rbac/catalog.ts');
const { isRoleScopeSeeded } = require('./rbacScopeSeed');

async function loadRolePermissions(roleIdentifier) {
    const result = await db.query(
        'SELECT permission_key FROM role_permissions WHERE role_identifier = $1',
        [roleIdentifier]
    );

    if (result.rows.length > 0) {
        return new Set(result.rows.map(r => r.permission_key));
    }

    const catalogPermissions = BUILT_IN_ROLE_PERMISSION_DEFAULTS[roleIdentifier]
        || collectRolePermissions(roleIdentifier, new Set());
    return new Set(catalogPermissions);
}

async function loadUserPermissions(userId) {
    const result = await db.query(
        'SELECT permission_key, granted FROM user_permissions WHERE user_id = $1',
        [userId]
    );
    return result.rows;
}

async function loadRoleScopes(roleIdentifier) {
    const result = await db.query(
        'SELECT scope_key FROM role_scopes WHERE role_identifier = $1',
        [roleIdentifier]
    );

    if (result.rows.length > 0) {
        return new Set(result.rows.map(r => r.scope_key));
    }

    const seeded = await isRoleScopeSeeded(db, roleIdentifier);
    if (seeded) return new Set();

    const catalogScopes = collectRoleScopes(roleIdentifier, new Set());
    return new Set(catalogScopes);
}

async function loadUserScopes(userId) {
    const result = await db.query(
        'SELECT scope_key, granted FROM user_scopes WHERE user_id = $1',
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
    const [rolePerms, userPerms, roleScopes, userScopes, scope] = await Promise.all([
        loadRolePermissions(roleIdentifier),
        loadUserPermissions(user.id),
        loadRoleScopes(roleIdentifier),
        loadUserScopes(user.id),
        loadScope(user.id),
    ]);

    const effective = new Set(rolePerms);
    for (const row of userPerms) {
        if (row.granted === false) effective.delete(row.permission_key);
        else effective.add(row.permission_key);
    }

    // ADR 0010 §1: effectiveScopes = role_scopes ∪ user_scopes[granted=true] − user_scopes[granted=false].
    // The terminal-status floor (SUSPENDED/ARCHIVED → empty) is enforced in
    // requireStatusScope, not here — the resolver is a pure data function.
    const effectiveScopesSet = new Set(roleScopes);
    for (const row of userScopes) {
        if (row.granted === false) effectiveScopesSet.delete(row.scope_key);
        else effectiveScopesSet.add(row.scope_key);
    }

    const result = { effectivePermissions: effective, effectiveScopes: effectiveScopesSet, scope };
    if (req) req._accessResolverCache = result;
    return result;
}

module.exports = { resolve, canonicalRole };

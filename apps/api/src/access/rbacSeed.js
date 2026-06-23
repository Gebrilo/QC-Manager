'use strict';

const { BUILT_IN_ROLE_PERMISSION_DEFAULTS } = require('../../../shared/rbac/catalog.ts');

/**
 * ADR 0010 / issue #263 — collapse the role-permission fan-out.
 *
 * `role_permissions` is the canonical role layer (seeded once from the catalog,
 * then admin-editable). `user_permissions` is a SPARSE delta: only rows that
 * DIFFER from the role survive (`granted=true` = elevation above the role,
 * `granted=false` = restriction below it). This module performs the idempotent
 * bootstrap seed and the one-time collapse, both safe to re-run on every deploy.
 */

// app_user.role values that canonicalize to each built-in role_identifier.
// Migration 043 (issue #189) has already rewritten app_user.role to the canonical
// form, but the alias lists are kept as a safety net for partially-migrated DBs
// and for the collapse's role-matching.
const ROLE_STORAGE_NAMES = Object.freeze({
    admin: Object.freeze(['admin']),
    team_manager: Object.freeze(['team_manager', 'manager']),
    tester: Object.freeze(['tester', 'user', 'member']),
    pm: Object.freeze(['pm']),
    viewer: Object.freeze(['viewer']),
    contributor: Object.freeze(['contributor']),
});

async function isRoleSeeded(client, roleIdentifier) {
    const result = await client.query(
        'SELECT 1 FROM rbac_seed_marker WHERE role_identifier = $1',
        [roleIdentifier]
    );
    return result.rows.length > 0;
}

/**
 * Idempotently seed `role_permissions` for every built-in role NOT yet marked
 * seeded. The per-role marker (`rbac_seed_marker`) records that a role has been
 * initialized, so a role an admin has DELIBERATELY EMPTIED is never re-seeded —
 * the marker is independent of row count by design.
 *
 * Re-running is a no-op for every role that already has a marker.
 */
async function seedRolePermissions(client) {
    const seeded = [];
    for (const [roleIdentifier, permissions] of Object.entries(BUILT_IN_ROLE_PERMISSION_DEFAULTS)) {
        if (await isRoleSeeded(client, roleIdentifier)) continue;

        await client.query('DELETE FROM role_permissions WHERE role_identifier = $1', [roleIdentifier]);
        for (const permissionKey of permissions) {
            await client.query(
                `INSERT INTO role_permissions (role_identifier, permission_key, granted_by)
                 VALUES ($1, $2, 'system-seed')
                 ON CONFLICT (role_identifier, permission_key) DO NOTHING`,
                [roleIdentifier, permissionKey]
            );
        }
        await client.query(
            `INSERT INTO rbac_seed_marker (role_identifier) VALUES ($1) ON CONFLICT DO NOTHING`,
            [roleIdentifier]
        );
        seeded.push(roleIdentifier);
    }
    return seeded;
}

/**
 * Collapse `user_permissions` to a sparse delta: delete every `granted=true`
 * row whose key is already in the user's canonical role set (pure fan-out
 * residue). Genuine elevations (`granted=true` where the key is NOT in the
 * role) and restrictions (`granted=false`) survive — the `granted=true` guard
 * protects tombstones.
 */
async function collapseUserPermissions(client) {
    let collapsed = 0;
    for (const [canonical, storageNames] of Object.entries(ROLE_STORAGE_NAMES)) {
        const result = await client.query(
            `DELETE FROM user_permissions up
             USING role_permissions rp
             WHERE up.permission_key = rp.permission_key
               AND up.granted = true
               AND rp.role_identifier = $1
               AND up.user_id IN (SELECT id FROM app_user WHERE role = ANY($2::text[]))`,
            [canonical, storageNames]
        );
        collapsed += result.rowCount || 0;
    }
    return collapsed;
}

module.exports = {
    seedRolePermissions,
    collapseUserPermissions,
    isRoleSeeded,
    ROLE_STORAGE_NAMES,
};

'use strict';

const { auditRolePermissionChange } = require('../services/rolePermissions');

const MIGRATION_ID = 'issue-275-prune-own-decorative-permissions';

const OWN_PERMISSION_REWRITES = Object.freeze({
    'qc.tasks.view_own': 'qc.tasks.view',
    'qc.tasks.edit_own': 'qc.tasks.edit',
    'qc.tasks.delete_own': 'qc.tasks.delete',
    'qc.bugs.edit_own': 'qc.bugs.edit',
    'qc.testcases.view_own': 'qc.testcases.view',
    'qc.testcases.edit_own': 'qc.testcases.edit',
    'qc.testsuites.view_own': 'qc.testsuites.view',
    'qc.testsuites.edit_own': 'qc.testsuites.edit',
    'qc.testexecutions.view_own': 'qc.testexecutions.view',
    'qc.testexecutions.edit_own': 'qc.testexecutions.edit',
    'qc.user_stories.view_own': 'qc.user_stories.view',
    'qc.user_stories.edit_own': 'qc.user_stories.edit',
    'qc.user_stories.delete_own': 'qc.user_stories.delete',
    'qc.reports.view_own': 'qc.reports.view',
});

const DECORATIVE_PERMISSION_KEYS = Object.freeze([
    'qc.tasks.log_time',
    'qc.tasks.approve_completion',
    'qc.bugs.triage',
    'qc.bugs.reopen',
    'qc.bugs.close',
    'qc.testcases.approve',
    'qc.testcases.clone',
    'qc.testcases.import',
    'qc.testcases.export',
]);

const OWN_PERMISSION_KEYS = Object.freeze(Object.keys(OWN_PERMISSION_REWRITES));
const PRUNED_PERMISSION_KEYS = Object.freeze([...OWN_PERMISSION_KEYS, ...DECORATIVE_PERMISSION_KEYS]);

async function applyRbacPrunedPermissionMigration(client, actorEmail = 'system-migration') {
    await client.query(`
        CREATE TABLE IF NOT EXISTS rbac_permission_prune_marker (
            migration_id VARCHAR(120) PRIMARY KEY,
            applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
    `);

    const marker = await client.query(
        'SELECT 1 FROM rbac_permission_prune_marker WHERE migration_id = $1',
        [MIGRATION_ID]
    );
    if (marker.rows.length > 0) return { applied: false, convertedOwn: 0, pruned: 0 };

    const roleOwn = await client.query(
        `SELECT role_identifier, permission_key
         FROM role_permissions
         WHERE permission_key = ANY($1::text[])
         ORDER BY role_identifier, permission_key`,
        [OWN_PERMISSION_KEYS]
    );
    const rolePruned = await client.query(
        `SELECT role_identifier, permission_key
         FROM role_permissions
         WHERE permission_key = ANY($1::text[])
         ORDER BY role_identifier, permission_key`,
        [PRUNED_PERMISSION_KEYS]
    );

    const addedBareRoleRows = [];
    for (const row of roleOwn.rows) {
        const bareKey = OWN_PERMISSION_REWRITES[row.permission_key];
        const existingBare = await client.query(
            'SELECT 1 FROM role_permissions WHERE role_identifier = $1 AND permission_key = $2',
            [row.role_identifier, bareKey]
        );
        await client.query(
            `INSERT INTO role_permissions (role_identifier, permission_key, granted_by)
             VALUES ($1, $2, $3)
             ON CONFLICT (role_identifier, permission_key) DO NOTHING`,
            [row.role_identifier, bareKey, actorEmail]
        );
        if (existingBare.rows.length === 0) {
            addedBareRoleRows.push({ role_identifier: row.role_identifier, permission_key: bareKey });
        }
    }

    for (const row of addedBareRoleRows) {
        await auditRolePermissionChange(client, {
            roleName: row.role_identifier,
            permissionKey: row.permission_key,
            beforeGranted: false,
            afterGranted: true,
            actorEmail,
        });
    }
    for (const row of rolePruned.rows) {
        await auditRolePermissionChange(client, {
            roleName: row.role_identifier,
            permissionKey: row.permission_key,
            beforeGranted: true,
            afterGranted: false,
            actorEmail,
        });
    }

    for (const [oldKey, bareKey] of Object.entries(OWN_PERMISSION_REWRITES)) {
        await client.query(
            `INSERT INTO user_permissions (user_id, permission_key, granted)
             SELECT user_id, $2, granted
             FROM user_permissions
             WHERE permission_key = $1
             ON CONFLICT (user_id, permission_key) DO NOTHING`,
            [oldKey, bareKey]
        );
    }

    const deletedRoles = await client.query(
        'DELETE FROM role_permissions WHERE permission_key = ANY($1::text[])',
        [PRUNED_PERMISSION_KEYS]
    );
    const deletedUsers = await client.query(
        'DELETE FROM user_permissions WHERE permission_key = ANY($1::text[])',
        [PRUNED_PERMISSION_KEYS]
    );
    await client.query(
        'DELETE FROM permissions WHERE permission_key = ANY($1::text[])',
        [PRUNED_PERMISSION_KEYS]
    );
    await client.query(
        'INSERT INTO rbac_permission_prune_marker (migration_id) VALUES ($1)',
        [MIGRATION_ID]
    );

    return {
        applied: true,
        convertedOwn: roleOwn.rows.length,
        pruned: (deletedRoles.rowCount || 0) + (deletedUsers.rowCount || 0),
    };
}

module.exports = {
    applyRbacPrunedPermissionMigration,
    DECORATIVE_PERMISSION_KEYS,
    MIGRATION_ID,
    OWN_PERMISSION_KEYS,
    OWN_PERMISSION_REWRITES,
    PRUNED_PERMISSION_KEYS,
};

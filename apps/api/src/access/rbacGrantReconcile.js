'use strict';

const { auditRolePermissionChange } = require('../services/rolePermissions');

const MIGRATION_ID = 'rbac-reconcile-tester-broad-and-stale-viewown';

// One-shot reconciliation of prod `role_permissions` to the ADR 0011 spec.
// Built-in roles had drifted above the catalog via older seeds / forward-mint
// migrations; this removes the two genuinely over-broad tester grants plus the
// stray `qc.bugs.view_own` residue left by the `_own` prune-rewrite change.
//
//  - tester  qc.bugs.view_any   -> tester bug view is team-scoped, not "any"
//  - tester  qc.bugs.edit_team  -> tester bug edit is own + severity-only
//  - {tester, team_manager, contributor} qc.bugs.view_own -> redundant residue
//
// It only touches `role_permissions` (the keys stay valid vocabulary for other
// roles) and audits every removal so a built-in customisation is recoverable.
const RECONCILE_REVOKES = Object.freeze([
    Object.freeze({ role: 'tester', key: 'qc.bugs.view_any' }),
    Object.freeze({ role: 'tester', key: 'qc.bugs.edit_team' }),
    Object.freeze({ role: 'tester', key: 'qc.bugs.view_own' }),
    Object.freeze({ role: 'team_manager', key: 'qc.bugs.view_own' }),
    Object.freeze({ role: 'contributor', key: 'qc.bugs.view_own' }),
]);

async function applyRbacGrantReconcileMigration(client, actorEmail = 'system-migration') {
    await client.query(`
        CREATE TABLE IF NOT EXISTS rbac_grant_reconcile_marker (
            migration_id VARCHAR(120) PRIMARY KEY,
            applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
    `);

    const marker = await client.query(
        'SELECT 1 FROM rbac_grant_reconcile_marker WHERE migration_id = $1',
        [MIGRATION_ID]
    );
    if (marker.rows.length > 0) return { applied: false, revoked: 0 };

    let revoked = 0;
    for (const { role, key } of RECONCILE_REVOKES) {
        const removed = await client.query(
            'DELETE FROM role_permissions WHERE role_identifier = $1 AND permission_key = $2',
            [role, key]
        );
        if ((removed.rowCount || 0) > 0) {
            await auditRolePermissionChange(client, {
                roleName: role,
                permissionKey: key,
                beforeGranted: true,
                afterGranted: false,
                actorEmail,
            });
            revoked += 1;
        }
    }

    await client.query(
        'INSERT INTO rbac_grant_reconcile_marker (migration_id) VALUES ($1)',
        [MIGRATION_ID]
    );

    return { applied: true, revoked };
}

module.exports = {
    applyRbacGrantReconcileMigration,
    MIGRATION_ID,
    RECONCILE_REVOKES,
};

'use strict';

const {
    applyRbacPrunedPermissionMigration,
    MIGRATION_ID,
    OWN_PERMISSION_KEYS,
    PRUNED_PERMISSION_KEYS,
} = require('../src/access/rbacPrunedPermissions');

function rows(rows) {
    return { rows, rowCount: rows.length };
}

describe('applyRbacPrunedPermissionMigration', () => {
    test('converts _own role/user grants, prunes stale keys, audits role changes, and marks completion', async () => {
        const roleOwnRows = [
            { role_identifier: 'tester', permission_key: 'qc.tasks.delete_own' },
        ];
        const rolePrunedRows = [
            ...roleOwnRows,
            { role_identifier: 'team_manager', permission_key: 'qc.bugs.triage' },
        ];
        const calls = [];
        const client = {
            query: jest.fn(async (text, params = []) => {
                calls.push({ text: String(text), params });
                const sql = String(text);
                if (sql.includes('FROM rbac_permission_prune_marker') && sql.trim().startsWith('SELECT')) return rows([]);
                if (sql.includes('FROM role_permissions') && sql.includes('permission_key = ANY')) {
                    if (params[0] === OWN_PERMISSION_KEYS) return rows(roleOwnRows);
                    if (params[0] === PRUNED_PERMISSION_KEYS) return rows(rolePrunedRows);
                }
                if (sql.startsWith('DELETE FROM role_permissions')) return { rows: [], rowCount: 2 };
                if (sql.startsWith('DELETE FROM user_permissions')) return { rows: [], rowCount: 3 };
                return { rows: [], rowCount: 0 };
            }),
        };

        await expect(applyRbacPrunedPermissionMigration(client)).resolves.toEqual({
            applied: true,
            convertedOwn: 1,
            pruned: 5,
        });

        expect(calls).toEqual(expect.arrayContaining([
            expect.objectContaining({
                text: expect.stringContaining('INSERT INTO role_permissions'),
                params: ['tester', 'qc.tasks.delete', 'system-migration'],
            }),
            expect.objectContaining({
                text: expect.stringContaining('INSERT INTO user_permissions'),
                params: ['qc.tasks.delete_own', 'qc.tasks.delete'],
            }),
            expect.objectContaining({
                text: expect.stringContaining('DELETE FROM role_permissions'),
                params: [PRUNED_PERMISSION_KEYS],
            }),
            expect.objectContaining({
                text: expect.stringContaining('INSERT INTO rbac_permission_prune_marker'),
                params: [MIGRATION_ID],
            }),
        ]));

        const auditCalls = calls.filter(call => call.text.includes('INSERT INTO audit_log'));
        expect(auditCalls).toHaveLength(3);
        expect(auditCalls.map(call => call.params[5])).toEqual(expect.arrayContaining([
            'Granted qc.tasks.delete for tester',
            'Revoked qc.tasks.delete_own for tester',
            'Revoked qc.bugs.triage for team_manager',
        ]));
    });

    test('does nothing after the marker exists', async () => {
        const client = {
            query: jest.fn(async text => {
                if (String(text).includes('FROM rbac_permission_prune_marker')) {
                    return rows([{ '?column?': 1 }]);
                }
                return { rows: [], rowCount: 0 };
            }),
        };

        await expect(applyRbacPrunedPermissionMigration(client)).resolves.toEqual({
            applied: false,
            convertedOwn: 0,
            pruned: 0,
        });
        expect(client.query.mock.calls.some(([text]) => String(text).includes('DELETE FROM role_permissions'))).toBe(false);
    });
});

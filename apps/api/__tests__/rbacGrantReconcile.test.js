'use strict';

const {
    applyRbacGrantReconcileMigration,
    MIGRATION_ID,
    RECONCILE_REVOKES,
} = require('../src/access/rbacGrantReconcile');

function rows(rows) {
    return { rows, rowCount: rows.length };
}

describe('applyRbacGrantReconcileMigration', () => {
    test('targets exactly the agreed revokes (ADR 0011 spec)', () => {
        expect(RECONCILE_REVOKES).toEqual([
            { role: 'tester', key: 'qc.bugs.view_any' },
            { role: 'tester', key: 'qc.bugs.edit_team' },
            { role: 'tester', key: 'qc.bugs.view_own' },
            { role: 'team_manager', key: 'qc.bugs.view_own' },
            { role: 'contributor', key: 'qc.bugs.view_own' },
        ]);
    });

    test('deletes each grant, audits the removal, and marks completion', async () => {
        const calls = [];
        const client = {
            query: jest.fn(async (text, params = []) => {
                calls.push({ text: String(text), params });
                const sql = String(text);
                if (sql.includes('FROM rbac_grant_reconcile_marker') && sql.trim().startsWith('SELECT')) return rows([]);
                if (sql.startsWith('DELETE FROM role_permissions')) return { rows: [], rowCount: 1 };
                return { rows: [], rowCount: 0 };
            }),
        };

        await expect(applyRbacGrantReconcileMigration(client)).resolves.toEqual({
            applied: true,
            revoked: 5,
        });

        // every revoke issued as a scoped DELETE
        for (const { role, key } of RECONCILE_REVOKES) {
            expect(calls).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    text: expect.stringContaining('DELETE FROM role_permissions'),
                    params: [role, key],
                }),
            ]));
        }

        // every removal audited as a revoke
        const auditCalls = calls.filter(call => call.text.includes('INSERT INTO audit_log'));
        expect(auditCalls).toHaveLength(5);
        expect(auditCalls.map(call => call.params[5])).toEqual(expect.arrayContaining([
            'Revoked qc.bugs.view_any for tester',
            'Revoked qc.bugs.edit_team for tester',
            'Revoked qc.bugs.view_own for tester',
            'Revoked qc.bugs.view_own for team_manager',
            'Revoked qc.bugs.view_own for contributor',
        ]));

        // completion marker written
        expect(calls).toEqual(expect.arrayContaining([
            expect.objectContaining({
                text: expect.stringContaining('INSERT INTO rbac_grant_reconcile_marker'),
                params: [MIGRATION_ID],
            }),
        ]));
    });

    test('does not audit a grant that was already absent (idempotent on partial state)', async () => {
        const calls = [];
        const client = {
            query: jest.fn(async (text, params = []) => {
                calls.push({ text: String(text), params });
                const sql = String(text);
                if (sql.includes('FROM rbac_grant_reconcile_marker') && sql.trim().startsWith('SELECT')) return rows([]);
                if (sql.startsWith('DELETE FROM role_permissions')) {
                    // pretend only tester/view_any still existed; the rest were already cleaned
                    const present = params[0] === 'tester' && params[1] === 'qc.bugs.view_any';
                    return { rows: [], rowCount: present ? 1 : 0 };
                }
                return { rows: [], rowCount: 0 };
            }),
        };

        await expect(applyRbacGrantReconcileMigration(client)).resolves.toEqual({
            applied: true,
            revoked: 1,
        });
        expect(calls.filter(call => call.text.includes('INSERT INTO audit_log'))).toHaveLength(1);
    });

    test('does nothing after the marker exists', async () => {
        const client = {
            query: jest.fn(async text => {
                if (String(text).includes('FROM rbac_grant_reconcile_marker')) {
                    return rows([{ '?column?': 1 }]);
                }
                return { rows: [], rowCount: 0 };
            }),
        };

        await expect(applyRbacGrantReconcileMigration(client)).resolves.toEqual({
            applied: false,
            revoked: 0,
        });
        expect(client.query.mock.calls.some(([text]) => String(text).includes('DELETE FROM role_permissions'))).toBe(false);
    });
});

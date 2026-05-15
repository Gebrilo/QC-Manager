'use strict';

const {
    PERMISSIONS,
    SCOPES,
    canUserPerform,
    canUserUseScope,
    resolvePermissionKey,
} = require('../../shared/rbac/catalog.ts');

describe('RBAC catalog resolver', () => {
    test('admin role uses explicit wildcard bypass', () => {
        expect(canUserPerform({ role: 'admin' }, PERMISSIONS.QUALITY_TRACEABILITY_VIEW)).toBe(true);
        expect(canUserPerform({ role: 'admin' }, PERMISSIONS.TASKS_VIEW)).toBe(true);
        expect(canUserPerform({
            role: 'admin',
            permissionOverrides: [{ permission_key: PERMISSIONS.TASKS_VIEW, granted: false }],
        }, PERMISSIONS.TASKS_VIEW)).toBe(true);
    });

    test('manager inherits tester permissions', () => {
        expect(canUserPerform({ role: 'manager' }, PERMISSIONS.TESTCASES_CREATE)).toBe(true);
        expect(canUserPerform({ role: 'manager' }, PERMISSIONS.TESTRESULTS_UPLOAD)).toBe(true);
    });

    test('tester role can use task and test permissions without admin rights', () => {
        expect(canUserPerform({ role: 'tester' }, PERMISSIONS.TASKS_VIEW)).toBe(true);
        expect(canUserPerform({ role: 'tester' }, PERMISSIONS.TESTCASES_VIEW)).toBe(true);
        expect(canUserPerform({ role: 'tester' }, PERMISSIONS.GOVERNANCE_MANAGE_GATES)).toBe(false);
    });

    test('per-user override can deny a role-granted permission', () => {
        const user = {
            role: 'tester',
            permissionOverrides: [{ permission_key: PERMISSIONS.TASKS_VIEW, granted: false }],
        };

        expect(canUserPerform(user, PERMISSIONS.TASKS_VIEW)).toBe(false);
    });

    test('per-user override can grant a role-denied permission', () => {
        const user = {
            role: 'tester',
            permissionOverrides: [{ permission_key: PERMISSIONS.GOVERNANCE_MANAGE_GATES, granted: true }],
        };

        expect(canUserPerform(user, PERMISSIONS.GOVERNANCE_MANAGE_GATES)).toBe(true);
    });

    test('resolvePermissionKey is identity for canonical keys', () => {
        expect(resolvePermissionKey(PERMISSIONS.TASKS_VIEW)).toBe(PERMISSIONS.TASKS_VIEW);
    });

    test('team scope is declared in the catalog and granted to managers', () => {
        expect(canUserUseScope({ role: 'manager' }, SCOPES.TEAM.key)).toBe(true);
        expect(canUserUseScope({ role: 'tester' }, SCOPES.TEAM.key)).toBe(false);
    });
});

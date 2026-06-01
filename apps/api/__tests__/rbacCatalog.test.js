'use strict';

const {
    PERMISSIONS,
    ROLES,
    SCOPES,
    ALL_PERMISSION_VALUES,
    BUILT_IN_ROLE_PERMISSION_DEFAULTS,
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

describe('Access engine — expanded catalog (issue #80)', () => {
    test('catalog declares scoped variants for tasks/bugs/testcases/testsuites/testexecutions/user_stories/reports', () => {
        const scopedExpect = [];
        for (const artifact of ['tasks', 'bugs', 'testcases', 'testsuites', 'testexecutions', 'user_stories']) {
            for (const verb of ['view', 'edit', 'delete']) {
                for (const scope of ['own', 'team', 'any']) {
                    scopedExpect.push(`qc.${artifact}.${verb}_${scope}`);
                }
            }
        }
        for (const key of scopedExpect) {
            expect(ALL_PERMISSION_VALUES).toContain(key);
        }
        for (const key of ['qc.reports.view_own', 'qc.reports.view_team', 'qc.reports.view_project', 'qc.reports.export']) {
            expect(ALL_PERMISSION_VALUES).toContain(key);
        }
    });

    test('artifact-specific actions are declared', () => {
        const required = [
            'qc.tasks.log_time', 'qc.tasks.take_over', 'qc.tasks.approve_completion', 'qc.tasks.change_priority',
            'qc.bugs.triage', 'qc.bugs.change_severity', 'qc.bugs.change_priority', 'qc.bugs.reopen', 'qc.bugs.close',
            'qc.testcases.execute', 'qc.testcases.approve', 'qc.testcases.clone',
            'qc.testcases.import', 'qc.testcases.export', 'qc.testcases.view_steps', 'qc.testcases.edit_steps',
            'qc.admin.manage_users', 'qc.admin.manage_roles', 'qc.admin.manage_permissions',
            'qc.admin.manage_teams', 'qc.admin.manage_integrations', 'qc.admin.manage_settings',
            'qc.admin.view_audit_log',
        ];
        for (const key of required) {
            expect(ALL_PERMISSION_VALUES).toContain(key);
        }
    });

    test('new built-in roles exist: pm, team_manager, member, viewer; manager aliases team_manager', () => {
        expect(ROLES.pm).toBeDefined();
        expect(ROLES.team_manager).toBeDefined();
        expect(ROLES.member).toBeDefined();
        expect(ROLES.viewer).toBeDefined();
        expect(ROLES.manager.aliasFor).toBe('team_manager');
    });

    test('member seeded with union of legacy tester permissions (PRD risk #1)', () => {
        const legacyTester = BUILT_IN_ROLE_PERMISSION_DEFAULTS.tester;
        const member = BUILT_IN_ROLE_PERMISSION_DEFAULTS.member;
        for (const key of legacyTester) {
            expect(member).toContain(key);
        }
    });

    test('BUILT_IN_ROLE_PERMISSION_DEFAULTS exposes a key array per built-in role with resolved permissions', () => {
        for (const role of ['admin', 'pm', 'team_manager', 'member', 'viewer']) {
            expect(Array.isArray(BUILT_IN_ROLE_PERMISSION_DEFAULTS[role])).toBe(true);
        }
        expect(BUILT_IN_ROLE_PERMISSION_DEFAULTS.admin).toEqual(['*']);
        // team_manager defaults must include the resolved permissions from its own role + inherited tester
        expect(BUILT_IN_ROLE_PERMISSION_DEFAULTS.team_manager).toContain('qc.bugs.triage');
        expect(BUILT_IN_ROLE_PERMISSION_DEFAULTS.team_manager).toContain('qc.testresults.upload'); // inherited from tester
        // pm gets project-scope keys; viewer does not
        expect(BUILT_IN_ROLE_PERMISSION_DEFAULTS.pm).toContain('qc.reports.view_project');
        expect(BUILT_IN_ROLE_PERMISSION_DEFAULTS.viewer).not.toContain('qc.reports.view_project');
    });

    test('canUserPerform resolves manager → team_manager via aliasFor', () => {
        expect(canUserPerform({ role: 'manager' }, PERMISSIONS.TESTCASES_VIEW)).toBe(true);
    });
});

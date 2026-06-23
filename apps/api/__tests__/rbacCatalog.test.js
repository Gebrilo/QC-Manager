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

    test('team_manager inherits tester permissions', () => {
        expect(canUserPerform({ role: 'team_manager' }, PERMISSIONS.TESTCASES_CREATE)).toBe(true);
        expect(canUserPerform({ role: 'team_manager' }, PERMISSIONS.TESTRESULTS_UPLOAD)).toBe(true);
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

    test('team scope is declared in the catalog and granted to team managers', () => {
        expect(canUserUseScope({ role: 'team_manager' }, SCOPES.TEAM.key)).toBe(true);
        expect(canUserUseScope({ role: 'tester' }, SCOPES.TEAM.key)).toBe(false);
    });
});

describe('Access engine — expanded catalog (issue #80)', () => {
    test('catalog declares team/any scoped variants for tasks/bugs/testcases/testsuites/testexecutions/user_stories/reports', () => {
        const scopedExpect = [];
        for (const artifact of ['tasks', 'bugs', 'testcases', 'testsuites', 'testexecutions', 'user_stories']) {
            for (const verb of ['view', 'edit', 'delete']) {
                for (const scope of ['team', 'any']) {
                    scopedExpect.push(`qc.${artifact}.${verb}_${scope}`);
                }
            }
        }
        for (const key of scopedExpect) {
            expect(ALL_PERMISSION_VALUES).toContain(key);
        }
        for (const key of ['qc.reports.view_team', 'qc.reports.view_project', 'qc.reports.export']) {
            expect(ALL_PERMISSION_VALUES).toContain(key);
        }
    });

    test('artifact-specific actions are declared', () => {
        const required = [
            'qc.tasks.take_over', 'qc.tasks.change_priority',
            'qc.testcases.view_steps', 'qc.testcases.edit_steps',
            'qc.admin.manage_users', 'qc.admin.manage_roles', 'qc.admin.manage_permissions',
            'qc.admin.manage_teams', 'qc.admin.manage_integrations', 'qc.admin.manage_settings',
            'qc.admin.view_audit_log',
        ];
        for (const key of required) {
            expect(ALL_PERMISSION_VALUES).toContain(key);
        }
    });

    test('decorative and redundant _own keys are pruned from the catalog', () => {
        const pruned = [
            'qc.tasks.view_own', 'qc.tasks.edit_own', 'qc.tasks.delete_own',
            'qc.bugs.view_own', 'qc.bugs.edit_own', 'qc.bugs.delete_own',
            'qc.testcases.view_own', 'qc.testcases.edit_own', 'qc.testcases.delete_own',
            'qc.testsuites.view_own', 'qc.testsuites.edit_own', 'qc.testsuites.delete_own',
            'qc.testexecutions.view_own', 'qc.testexecutions.edit_own', 'qc.testexecutions.delete_own',
            'qc.user_stories.view_own', 'qc.user_stories.edit_own', 'qc.user_stories.delete_own',
            'qc.reports.view_own',
            'qc.tasks.log_time', 'qc.tasks.approve_completion',
            'qc.bugs.triage', 'qc.bugs.change_severity', 'qc.bugs.change_priority', 'qc.bugs.reopen', 'qc.bugs.close',
            'qc.testcases.execute', 'qc.testcases.approve', 'qc.testcases.clone', 'qc.testcases.import', 'qc.testcases.export',
        ];
        for (const key of pruned) {
            expect(ALL_PERMISSION_VALUES).not.toContain(key);
        }
    });

    test('consolidated built-in roles exist and legacy aliases are removed', () => {
        expect(Object.keys(ROLES).sort()).toEqual(['admin', 'contributor', 'pm', 'team_manager', 'tester', 'viewer']);
        expect(ROLES.pm).toBeDefined();
        expect(ROLES.team_manager).toBeDefined();
        expect(ROLES.tester).toBeDefined();
        expect(ROLES.viewer).toBeDefined();
        expect(ROLES.manager).toBeUndefined();
        expect(ROLES.user).toBeUndefined();
        expect(ROLES.member).toBeUndefined();
        expect(BUILT_IN_ROLE_PERMISSION_DEFAULTS.member).toBeUndefined();
    });

    test('tester includes former member scoped permissions', () => {
        const tester = BUILT_IN_ROLE_PERMISSION_DEFAULTS.tester;
        expect(tester).toContain(PERMISSIONS.TASKS_VIEW);
        expect(tester).toContain(PERMISSIONS.TASKS_VIEW_TEAM);
        expect(tester).toContain(PERMISSIONS.TASKS_DELETE);
        expect(tester).toContain(PERMISSIONS.BUGS_EDIT);
        expect(tester).toContain(PERMISSIONS.TESTCASES_VIEW_STEPS);
        expect(tester).toContain(PERMISSIONS.DASHBOARDS_MEMBER_VIEW);
        expect(tester).toContain(PERMISSIONS.REPORTS_VIEW_TEAM);
    });

    test('BUILT_IN_ROLE_PERMISSION_DEFAULTS exposes a key array per built-in role with resolved permissions', () => {
        for (const role of ['admin', 'pm', 'team_manager', 'tester', 'viewer', 'contributor']) {
            expect(Array.isArray(BUILT_IN_ROLE_PERMISSION_DEFAULTS[role])).toBe(true);
        }
        expect(BUILT_IN_ROLE_PERMISSION_DEFAULTS.admin).toEqual(['*']);
        // team_manager defaults must include the resolved permissions from its own role + inherited tester
        expect(BUILT_IN_ROLE_PERMISSION_DEFAULTS.team_manager).toContain('qc.bugs.edit_team');
        expect(BUILT_IN_ROLE_PERMISSION_DEFAULTS.team_manager).toContain('qc.testresults.upload'); // inherited from tester
        // pm gets project-scope keys; viewer does not
        expect(BUILT_IN_ROLE_PERMISSION_DEFAULTS.pm).toContain('qc.reports.view_project');
        expect(BUILT_IN_ROLE_PERMISSION_DEFAULTS.viewer).not.toContain('qc.reports.view_project');
    });

    test('pm can view global work and test-run routes without mutation permissions', () => {
        expect(canUserPerform({ role: 'pm' }, PERMISSIONS.TASKS_VIEW)).toBe(true);
        expect(canUserPerform({ role: 'pm' }, PERMISSIONS.BUGS_VIEW)).toBe(true);
        expect(canUserPerform({ role: 'pm' }, PERMISSIONS.TESTEXECUTIONS_VIEW)).toBe(true);
        expect(canUserPerform({ role: 'pm' }, PERMISSIONS.BUGS_CREATE)).toBe(false);
        expect(canUserPerform({ role: 'pm' }, PERMISSIONS.TESTEXECUTIONS_CREATE)).toBe(false);
    });

    test('contributor remains preparation-only and has no active quality permissions', () => {
        expect(canUserUseScope({ role: 'contributor' }, SCOPES.PREPARATION_ONLY.key)).toBe(true);
        expect(canUserUseScope({ role: 'contributor' }, SCOPES.ACTIVE_ONLY.key)).toBe(false);
        expect(BUILT_IN_ROLE_PERMISSION_DEFAULTS.contributor).toContain(PERMISSIONS.MY_TASKS_VIEW);
        expect(BUILT_IN_ROLE_PERMISSION_DEFAULTS.contributor).not.toContain(PERMISSIONS.PROJECTS_VIEW);
        expect(BUILT_IN_ROLE_PERMISSION_DEFAULTS.contributor).not.toContain(PERMISSIONS.TESTCASES_VIEW);
        expect(BUILT_IN_ROLE_PERMISSION_DEFAULTS.contributor).not.toContain(PERMISSIONS.BUGS_VIEW);
    });

    test('legacy role identifiers canonicalize during migration rollout', () => {
        expect(canUserPerform({ role: 'manager' }, PERMISSIONS.TESTCASES_VIEW)).toBe(true);
        expect(canUserPerform({ role: 'user' }, PERMISSIONS.TESTCASES_VIEW)).toBe(true);
        expect(canUserPerform({ role: 'member' }, PERMISSIONS.TESTCASES_VIEW_STEPS)).toBe(true);
    });
});

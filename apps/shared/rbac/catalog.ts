'use strict';

const PERMISSIONS = Object.freeze({
    TASKS_VIEW: 'qc.tasks.view',
    TASKS_CREATE: 'qc.tasks.create',
    TASKS_EDIT: 'qc.tasks.edit',
    TASKS_DELETE: 'qc.tasks.delete',

    PROJECTS_VIEW: 'qc.projects.view',
    PROJECTS_CREATE: 'qc.projects.create',
    PROJECTS_EDIT: 'qc.projects.edit',
    PROJECTS_DELETE: 'qc.projects.delete',

    RESOURCES_VIEW: 'qc.resources.view',
    RESOURCES_CREATE: 'qc.resources.create',
    RESOURCES_EDIT: 'qc.resources.edit',
    RESOURCES_DELETE: 'qc.resources.delete',

    MY_TASKS_VIEW: 'qc.mywork.tasks.view',
    MY_TASKS_CREATE: 'qc.mywork.tasks.create',
    MY_TASKS_EDIT: 'qc.mywork.tasks.edit',
    MY_TASKS_DELETE: 'qc.mywork.tasks.delete',
    MY_DASHBOARD_VIEW: 'qc.mywork.dashboard.view',
    TASK_HISTORY_VIEW: 'qc.tasks.history.view',

    DASHBOARD_VIEW: 'qc.dashboard.view',
    REPORTS_VIEW: 'qc.reports.view',
    REPORTS_GENERATE: 'qc.reports.generate',

    TESTCASES_VIEW: 'qc.testcases.view',
    TESTCASES_CREATE: 'qc.testcases.create',
    TESTCASES_EDIT: 'qc.testcases.edit',
    TESTCASES_DELETE: 'qc.testcases.delete',

    TESTSUITES_VIEW: 'qc.testsuites.view',
    TESTSUITES_CREATE: 'qc.testsuites.create',
    TESTSUITES_EDIT: 'qc.testsuites.edit',
    TESTSUITES_DELETE: 'qc.testsuites.delete',
    TESTSUITES_REORDER: 'qc.testsuites.reorder',

    TESTEXECUTIONS_VIEW: 'qc.testexecutions.view',
    TESTEXECUTIONS_CREATE: 'qc.testexecutions.create',
    TESTEXECUTIONS_EDIT: 'qc.testexecutions.edit',
    TESTEXECUTIONS_DELETE: 'qc.testexecutions.delete',
    TESTRESULTS_UPLOAD: 'qc.testresults.upload',
    TESTRESULTS_DELETE: 'qc.testresults.delete',

    BUGS_VIEW: 'qc.bugs.view',
    BUGS_CREATE: 'qc.bugs.create',
    BUGS_EDIT: 'qc.bugs.edit',
    BUGS_DELETE: 'qc.bugs.delete',

    GOVERNANCE_VIEW: 'qc.governance.view',
    GOVERNANCE_MANAGE_GATES: 'qc.governance.manage_gates',
    GOVERNANCE_APPROVE_RELEASE: 'qc.governance.approve_release',
    QUALITY_TRACEABILITY_VIEW: 'qc.quality.traceability.view',

    JOURNEYS_VIEW: 'qc.journeys.view',
    JOURNEYS_ASSIGN: 'qc.journeys.assign',
    JOURNEYS_VIEW_ASSIGNED: 'qc.journeys.view_assigned',
    JOURNEYS_VIEW_TEAM_PROGRESS: 'qc.journeys.view_team_progress',

    TEAM_VIEW: 'qc.team.view',
    TEAM_MANAGE: 'qc.team.manage',

    ADMIN_USERS_VIEW: 'qc.admin.users.view',
    ADMIN_ROLES_VIEW: 'qc.admin.roles.view',
    ADMIN_SETTINGS_VIEW: 'qc.admin.settings.view',
});

const SCOPES = Object.freeze({
    TEAM: Object.freeze({ key: 'team', description: 'Limit records to the actor team boundary.' }),
    PREPARATION_ONLY: Object.freeze({ key: 'preparation_only', statuses: Object.freeze(['PREPARATION']) }),
    ACTIVE_ONLY: Object.freeze({ key: 'active_only', statuses: Object.freeze(['ACTIVE']) }),
});

const LEGACY_PERMISSION_ALIASES = Object.freeze({
    'page:dashboard': PERMISSIONS.DASHBOARD_VIEW,
    'page:tasks': PERMISSIONS.TASKS_VIEW,
    'page:projects': PERMISSIONS.PROJECTS_VIEW,
    'page:resources': PERMISSIONS.RESOURCES_VIEW,
    'page:governance': PERMISSIONS.GOVERNANCE_VIEW,
    'page:test-executions': PERMISSIONS.TESTEXECUTIONS_VIEW,
    'page:reports': PERMISSIONS.REPORTS_VIEW,
    'page:users': PERMISSIONS.ADMIN_USERS_VIEW,
    'page:my-tasks': PERMISSIONS.MY_TASKS_VIEW,
    'page:my-dashboard': PERMISSIONS.MY_DASHBOARD_VIEW,
    'page:task-history': PERMISSIONS.TASK_HISTORY_VIEW,
    'page:roles': PERMISSIONS.ADMIN_ROLES_VIEW,
    'page:journeys': PERMISSIONS.JOURNEYS_VIEW,
    'page:teams': PERMISSIONS.TEAM_VIEW,
    'page:bugs': PERMISSIONS.BUGS_VIEW,
    'page:test-cases': PERMISSIONS.TESTCASES_VIEW,
    'page:test-suites': PERMISSIONS.TESTSUITES_VIEW,

    'action:tasks:create': PERMISSIONS.TASKS_CREATE,
    'action:tasks:edit': PERMISSIONS.TASKS_EDIT,
    'action:tasks:delete': PERMISSIONS.TASKS_DELETE,
    'action:projects:create': PERMISSIONS.PROJECTS_CREATE,
    'action:projects:edit': PERMISSIONS.PROJECTS_EDIT,
    'action:projects:delete': PERMISSIONS.PROJECTS_DELETE,
    'action:resources:create': PERMISSIONS.RESOURCES_CREATE,
    'action:resources:edit': PERMISSIONS.RESOURCES_EDIT,
    'action:resources:delete': PERMISSIONS.RESOURCES_DELETE,
    'action:reports:generate': PERMISSIONS.REPORTS_GENERATE,
    'action:my-tasks:create': PERMISSIONS.MY_TASKS_CREATE,
    'action:my-tasks:edit': PERMISSIONS.MY_TASKS_EDIT,
    'action:my-tasks:delete': PERMISSIONS.MY_TASKS_DELETE,
    'action:journeys:assign': PERMISSIONS.JOURNEYS_ASSIGN,
    'action:journeys:view_assigned': PERMISSIONS.JOURNEYS_VIEW_ASSIGNED,
    'action:journeys:view_team_progress': PERMISSIONS.JOURNEYS_VIEW_TEAM_PROGRESS,
    'action:teams:manage': PERMISSIONS.TEAM_MANAGE,
    'action:teams:view': PERMISSIONS.TEAM_VIEW,
    'action:test-cases:create': PERMISSIONS.TESTCASES_CREATE,
    'action:test-cases:edit': PERMISSIONS.TESTCASES_EDIT,
    'action:test-cases:delete': PERMISSIONS.TESTCASES_DELETE,
    'action:test-suites:create': PERMISSIONS.TESTSUITES_CREATE,
    'action:test-suites:edit': PERMISSIONS.TESTSUITES_EDIT,
    'action:test-suites:delete': PERMISSIONS.TESTSUITES_DELETE,
    'action:test-suites:reorder': PERMISSIONS.TESTSUITES_REORDER,
    'action:test-executions:create': PERMISSIONS.TESTEXECUTIONS_CREATE,
    'action:test-executions:edit': PERMISSIONS.TESTEXECUTIONS_EDIT,
    'action:test-executions:delete': PERMISSIONS.TESTEXECUTIONS_DELETE,
    'action:test-results:upload': PERMISSIONS.TESTRESULTS_UPLOAD,
    'action:test-results:delete': PERMISSIONS.TESTRESULTS_DELETE,
    'action:bugs:create': PERMISSIONS.BUGS_CREATE,
    'action:bugs:edit': PERMISSIONS.BUGS_EDIT,
    'action:bugs:delete': PERMISSIONS.BUGS_DELETE,
    'action:governance:manage_gates': PERMISSIONS.GOVERNANCE_MANAGE_GATES,
    'action:governance:approve_release': PERMISSIONS.GOVERNANCE_APPROVE_RELEASE,
});

const ROLE_DEFINITIONS = Object.freeze({
    admin: Object.freeze({
        permissions: Object.freeze(['*']),
        inherits: Object.freeze([]),
    }),
    manager: Object.freeze({
        inherits: Object.freeze(['tester']),
        permissions: Object.freeze([
            PERMISSIONS.DASHBOARD_VIEW,
            PERMISSIONS.PROJECTS_VIEW,
            PERMISSIONS.PROJECTS_CREATE,
            PERMISSIONS.PROJECTS_EDIT,
            PERMISSIONS.RESOURCES_VIEW,
            PERMISSIONS.RESOURCES_CREATE,
            PERMISSIONS.RESOURCES_EDIT,
            PERMISSIONS.REPORTS_VIEW,
            PERMISSIONS.REPORTS_GENERATE,
            PERMISSIONS.MY_TASKS_VIEW,
            PERMISSIONS.MY_TASKS_CREATE,
            PERMISSIONS.MY_TASKS_EDIT,
            PERMISSIONS.MY_TASKS_DELETE,
            PERMISSIONS.MY_DASHBOARD_VIEW,
            PERMISSIONS.TASK_HISTORY_VIEW,
            PERMISSIONS.JOURNEYS_ASSIGN,
            PERMISSIONS.JOURNEYS_VIEW_TEAM_PROGRESS,
            PERMISSIONS.TEAM_VIEW,
            PERMISSIONS.GOVERNANCE_VIEW,
            PERMISSIONS.GOVERNANCE_APPROVE_RELEASE,
        ]),
        scopes: Object.freeze([SCOPES.TEAM.key, SCOPES.ACTIVE_ONLY.key]),
    }),
    tester: Object.freeze({
        inherits: Object.freeze([]),
        permissions: Object.freeze([
            PERMISSIONS.DASHBOARD_VIEW,
            PERMISSIONS.TASKS_VIEW,
            PERMISSIONS.TASKS_CREATE,
            PERMISSIONS.TASKS_EDIT,
            PERMISSIONS.PROJECTS_VIEW,
            PERMISSIONS.RESOURCES_VIEW,
            PERMISSIONS.TESTCASES_VIEW,
            PERMISSIONS.TESTCASES_CREATE,
            PERMISSIONS.TESTCASES_EDIT,
            PERMISSIONS.TESTSUITES_VIEW,
            PERMISSIONS.TESTSUITES_CREATE,
            PERMISSIONS.TESTSUITES_EDIT,
            PERMISSIONS.TESTEXECUTIONS_VIEW,
            PERMISSIONS.TESTEXECUTIONS_CREATE,
            PERMISSIONS.TESTRESULTS_UPLOAD,
            PERMISSIONS.REPORTS_VIEW,
            PERMISSIONS.REPORTS_GENERATE,
            PERMISSIONS.BUGS_VIEW,
            PERMISSIONS.BUGS_CREATE,
            PERMISSIONS.MY_TASKS_VIEW,
            PERMISSIONS.MY_TASKS_CREATE,
            PERMISSIONS.MY_TASKS_EDIT,
            PERMISSIONS.MY_TASKS_DELETE,
            PERMISSIONS.MY_DASHBOARD_VIEW,
        ]),
        scopes: Object.freeze([SCOPES.ACTIVE_ONLY.key]),
    }),
    viewer: Object.freeze({
        inherits: Object.freeze([]),
        permissions: Object.freeze([
            PERMISSIONS.DASHBOARD_VIEW,
            PERMISSIONS.TASKS_VIEW,
            PERMISSIONS.PROJECTS_VIEW,
            PERMISSIONS.RESOURCES_VIEW,
            PERMISSIONS.TESTEXECUTIONS_VIEW,
            PERMISSIONS.REPORTS_VIEW,
            PERMISSIONS.MY_TASKS_VIEW,
            PERMISSIONS.MY_TASKS_CREATE,
            PERMISSIONS.MY_TASKS_EDIT,
            PERMISSIONS.MY_TASKS_DELETE,
            PERMISSIONS.MY_DASHBOARD_VIEW,
        ]),
        scopes: Object.freeze([SCOPES.ACTIVE_ONLY.key]),
    }),
    contributor: Object.freeze({
        inherits: Object.freeze([]),
        permissions: Object.freeze([
            PERMISSIONS.TASKS_VIEW,
            PERMISSIONS.TASKS_EDIT,
            PERMISSIONS.MY_TASKS_VIEW,
            PERMISSIONS.MY_TASKS_CREATE,
            PERMISSIONS.MY_TASKS_EDIT,
            PERMISSIONS.MY_TASKS_DELETE,
            PERMISSIONS.MY_DASHBOARD_VIEW,
        ]),
        scopes: Object.freeze([SCOPES.PREPARATION_ONLY.key]),
    }),
    user: Object.freeze({
        inherits: Object.freeze(['tester']),
        permissions: Object.freeze([]),
        aliasFor: 'tester',
    }),
});

const ROLES = ROLE_DEFINITIONS;
const ALL_PERMISSION_VALUES = Object.freeze(Object.values(PERMISSIONS));
const ALL_SCOPE_VALUES = Object.freeze(Object.values(SCOPES).map(scope => scope.key));

function resolvePermissionKey(key) {
    return LEGACY_PERMISSION_ALIASES[key] || key;
}

function isKnownPermissionKey(key) {
    const canonical = resolvePermissionKey(key);
    return ALL_PERMISSION_VALUES.includes(canonical);
}

function getPermissionLookupKeys(key) {
    const canonical = resolvePermissionKey(key);
    const keys = new Set([key, canonical]);
    for (const [legacyKey, canonicalKey] of Object.entries(LEGACY_PERMISSION_ALIASES)) {
        if (canonicalKey === canonical) keys.add(legacyKey);
    }
    return Array.from(keys);
}

function collectRolePermissions(roleName, seen) {
    const role = ROLES[roleName];
    if (!role || seen.has(roleName)) return [];
    seen.add(roleName);

    const inherited = (role.inherits || []).flatMap(parent => collectRolePermissions(parent, seen));
    return [...inherited, ...(role.permissions || [])];
}

function collectRoleScopes(roleName, seen) {
    const role = ROLES[roleName];
    if (!role || seen.has(roleName)) return [];
    seen.add(roleName);

    const inherited = (role.inherits || []).flatMap(parent => collectRoleScopes(parent, seen));
    return [...inherited, ...(role.scopes || [])];
}

function canUserUseScope(user, scopeKey) {
    if (!user || !scopeKey || !ALL_SCOPE_VALUES.includes(scopeKey)) return false;

    const rolePermissions = collectRolePermissions(user.role, new Set());
    if (rolePermissions.includes('*')) return true;

    const roleScopes = collectRoleScopes(user.role, new Set());
    return roleScopes.includes(scopeKey);
}

function getScope(scopeKey) {
    return Object.values(SCOPES).find(scope => scope.key === scopeKey) || null;
}

function normalizeOverrideMap(user) {
    const overrides = user && (user.permissionOverrides || user.permission_overrides || user.permissions || []);
    if (!overrides) return new Map();

    if (Array.isArray(overrides)) {
        return overrides.reduce((map, item) => {
            if (typeof item === 'string') {
                map.set(resolvePermissionKey(item), true);
                return map;
            }
            const key = item.permission_key || item.permissionKey || item.key;
            if (key) map.set(resolvePermissionKey(key), item.granted !== false);
            return map;
        }, new Map());
    }

    return Object.entries(overrides).reduce((map, [key, value]) => {
        map.set(resolvePermissionKey(key), value !== false);
        return map;
    }, new Map());
}

function canUserPerform(user, key) {
    if (!user || !key) return false;

    const canonicalKey = resolvePermissionKey(key);
    if (!isKnownPermissionKey(canonicalKey)) return false;

    const rolePermissions = collectRolePermissions(user.role, new Set());
    if (rolePermissions.includes('*')) return true;

    const overrides = normalizeOverrideMap(user);
    if (overrides.has(canonicalKey)) {
        return overrides.get(canonicalKey) === true;
    }

    return rolePermissions.includes(canonicalKey);
}

module.exports = {
    PERMISSIONS,
    ROLES,
    SCOPES,
    LEGACY_PERMISSION_ALIASES,
    ALL_PERMISSION_VALUES,
    ALL_SCOPE_VALUES,
    canUserPerform,
    canUserUseScope,
    collectRolePermissions,
    collectRoleScopes,
    getScope,
    getPermissionLookupKeys,
    isKnownPermissionKey,
    resolvePermissionKey,
};

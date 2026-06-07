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

    // --- Scoped action variants (issue #80 / Access Engine) ---
    TASKS_VIEW_OWN: 'qc.tasks.view_own',
    TASKS_VIEW_TEAM: 'qc.tasks.view_team',
    TASKS_VIEW_ANY: 'qc.tasks.view_any',
    TASKS_EDIT_OWN: 'qc.tasks.edit_own',
    TASKS_EDIT_TEAM: 'qc.tasks.edit_team',
    TASKS_EDIT_ANY: 'qc.tasks.edit_any',
    TASKS_DELETE_OWN: 'qc.tasks.delete_own',
    TASKS_DELETE_TEAM: 'qc.tasks.delete_team',
    TASKS_DELETE_ANY: 'qc.tasks.delete_any',

    BUGS_VIEW_OWN: 'qc.bugs.view_own',
    BUGS_VIEW_TEAM: 'qc.bugs.view_team',
    BUGS_VIEW_ANY: 'qc.bugs.view_any',
    BUGS_EDIT_OWN: 'qc.bugs.edit_own',
    BUGS_EDIT_TEAM: 'qc.bugs.edit_team',
    BUGS_EDIT_ANY: 'qc.bugs.edit_any',
    BUGS_DELETE_OWN: 'qc.bugs.delete_own',
    BUGS_DELETE_TEAM: 'qc.bugs.delete_team',
    BUGS_DELETE_ANY: 'qc.bugs.delete_any',

    TESTCASES_VIEW_OWN: 'qc.testcases.view_own',
    TESTCASES_VIEW_TEAM: 'qc.testcases.view_team',
    TESTCASES_VIEW_ANY: 'qc.testcases.view_any',
    TESTCASES_EDIT_OWN: 'qc.testcases.edit_own',
    TESTCASES_EDIT_TEAM: 'qc.testcases.edit_team',
    TESTCASES_EDIT_ANY: 'qc.testcases.edit_any',
    TESTCASES_DELETE_OWN: 'qc.testcases.delete_own',
    TESTCASES_DELETE_TEAM: 'qc.testcases.delete_team',
    TESTCASES_DELETE_ANY: 'qc.testcases.delete_any',

    TESTSUITES_VIEW_OWN: 'qc.testsuites.view_own',
    TESTSUITES_VIEW_TEAM: 'qc.testsuites.view_team',
    TESTSUITES_VIEW_ANY: 'qc.testsuites.view_any',
    TESTSUITES_EDIT_OWN: 'qc.testsuites.edit_own',
    TESTSUITES_EDIT_TEAM: 'qc.testsuites.edit_team',
    TESTSUITES_EDIT_ANY: 'qc.testsuites.edit_any',
    TESTSUITES_DELETE_OWN: 'qc.testsuites.delete_own',
    TESTSUITES_DELETE_TEAM: 'qc.testsuites.delete_team',
    TESTSUITES_DELETE_ANY: 'qc.testsuites.delete_any',

    TESTEXECUTIONS_VIEW_OWN: 'qc.testexecutions.view_own',
    TESTEXECUTIONS_VIEW_TEAM: 'qc.testexecutions.view_team',
    TESTEXECUTIONS_VIEW_ANY: 'qc.testexecutions.view_any',
    TESTEXECUTIONS_EDIT_OWN: 'qc.testexecutions.edit_own',
    TESTEXECUTIONS_EDIT_TEAM: 'qc.testexecutions.edit_team',
    TESTEXECUTIONS_EDIT_ANY: 'qc.testexecutions.edit_any',
    TESTEXECUTIONS_DELETE_OWN: 'qc.testexecutions.delete_own',
    TESTEXECUTIONS_DELETE_TEAM: 'qc.testexecutions.delete_team',
    TESTEXECUTIONS_DELETE_ANY: 'qc.testexecutions.delete_any',

    USER_STORIES_VIEW: 'qc.user_stories.view',
    USER_STORIES_CREATE: 'qc.user_stories.create',
    USER_STORIES_EDIT: 'qc.user_stories.edit',
    USER_STORIES_DELETE: 'qc.user_stories.delete',
    USER_STORIES_VIEW_OWN: 'qc.user_stories.view_own',
    USER_STORIES_VIEW_TEAM: 'qc.user_stories.view_team',
    USER_STORIES_VIEW_ANY: 'qc.user_stories.view_any',
    USER_STORIES_EDIT_OWN: 'qc.user_stories.edit_own',
    USER_STORIES_EDIT_TEAM: 'qc.user_stories.edit_team',
    USER_STORIES_EDIT_ANY: 'qc.user_stories.edit_any',
    USER_STORIES_DELETE_OWN: 'qc.user_stories.delete_own',
    USER_STORIES_DELETE_TEAM: 'qc.user_stories.delete_team',
    USER_STORIES_DELETE_ANY: 'qc.user_stories.delete_any',

    // --- Artifact-specific actions ---
    TASKS_LOG_TIME: 'qc.tasks.log_time',
    TASKS_TAKE_OVER: 'qc.tasks.take_over',
    TASKS_APPROVE_COMPLETION: 'qc.tasks.approve_completion',
    TASKS_CHANGE_PRIORITY: 'qc.tasks.change_priority',

    BUGS_TRIAGE: 'qc.bugs.triage',
    BUGS_CHANGE_SEVERITY: 'qc.bugs.change_severity',
    BUGS_CHANGE_PRIORITY: 'qc.bugs.change_priority',
    BUGS_REOPEN: 'qc.bugs.reopen',
    BUGS_CLOSE: 'qc.bugs.close',

    TESTCASES_EXECUTE: 'qc.testcases.execute',
    TESTCASES_APPROVE: 'qc.testcases.approve',
    TESTCASES_CLONE: 'qc.testcases.clone',
    TESTCASES_IMPORT: 'qc.testcases.import',
    TESTCASES_EXPORT: 'qc.testcases.export',
    TESTCASES_VIEW_STEPS: 'qc.testcases.view_steps',
    TESTCASES_EDIT_STEPS: 'qc.testcases.edit_steps',

    // --- Reports scoped + export ---
    REPORTS_VIEW_OWN: 'qc.reports.view_own',
    REPORTS_VIEW_TEAM: 'qc.reports.view_team',
    REPORTS_VIEW_PROJECT: 'qc.reports.view_project',
    REPORTS_EXPORT: 'qc.reports.export',

    // --- Admin management actions ---
    ADMIN_MANAGE_USERS: 'qc.admin.manage_users',
    ADMIN_MANAGE_ROLES: 'qc.admin.manage_roles',
    ADMIN_MANAGE_PERMISSIONS: 'qc.admin.manage_permissions',
    ADMIN_MANAGE_TEAMS: 'qc.admin.manage_teams',
    ADMIN_MANAGE_INTEGRATIONS: 'qc.admin.manage_integrations',
    ADMIN_MANAGE_SETTINGS: 'qc.admin.manage_settings',
    ADMIN_VIEW_AUDIT_LOG: 'qc.admin.view_audit_log',

    // --- Dashboards ---
    DASHBOARD_PM_VIEW: 'qc.dashboard.pm.view',
    DASHBOARDS_TEAM_MANAGER_VIEW: 'qc.dashboards.team_manager.view',
    DASHBOARDS_MEMBER_VIEW: 'qc.dashboards.member.view',
});

const SCOPES = Object.freeze({
    TEAM: Object.freeze({ key: 'team', description: 'Limit records to the actor team boundary.' }),
    PREPARATION_ONLY: Object.freeze({ key: 'preparation_only', statuses: Object.freeze(['PREPARATION']) }),
    ACTIVE_ONLY: Object.freeze({ key: 'active_only', statuses: Object.freeze(['ACTIVE']) }),
});

const ROLE_DEFINITIONS = Object.freeze({
    admin: Object.freeze({
        permissions: Object.freeze(['*']),
        inherits: Object.freeze([]),
    }),
    team_manager: Object.freeze({
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
            PERMISSIONS.DASHBOARDS_TEAM_MANAGER_VIEW,
            PERMISSIONS.TASKS_VIEW_TEAM,
            PERMISSIONS.TASKS_EDIT_TEAM,
            PERMISSIONS.TASKS_DELETE_TEAM,
            PERMISSIONS.TASKS_TAKE_OVER,
            PERMISSIONS.TASKS_APPROVE_COMPLETION,
            PERMISSIONS.TASKS_CHANGE_PRIORITY,
            PERMISSIONS.BUGS_VIEW_TEAM,
            PERMISSIONS.BUGS_EDIT_TEAM,
            PERMISSIONS.BUGS_TRIAGE,
            PERMISSIONS.BUGS_CHANGE_SEVERITY,
            PERMISSIONS.BUGS_CHANGE_PRIORITY,
            PERMISSIONS.BUGS_REOPEN,
            PERMISSIONS.BUGS_CLOSE,
            PERMISSIONS.TESTCASES_VIEW_TEAM,
            PERMISSIONS.TESTCASES_EDIT_TEAM,
            PERMISSIONS.TESTCASES_DELETE_TEAM,
            PERMISSIONS.TESTCASES_APPROVE,
            PERMISSIONS.TESTCASES_VIEW_STEPS,
            PERMISSIONS.TESTCASES_EDIT_STEPS,
            PERMISSIONS.TESTEXECUTIONS_VIEW_TEAM,
            PERMISSIONS.TESTEXECUTIONS_EDIT_TEAM,
            PERMISSIONS.TESTSUITES_VIEW_TEAM,
            PERMISSIONS.TESTSUITES_EDIT_TEAM,
            PERMISSIONS.USER_STORIES_VIEW_TEAM,
            PERMISSIONS.USER_STORIES_EDIT_TEAM,
            PERMISSIONS.REPORTS_VIEW_TEAM,
            PERMISSIONS.REPORTS_EXPORT,
        ]),
        scopes: Object.freeze([SCOPES.TEAM.key, SCOPES.ACTIVE_ONLY.key]),
    }),
    // `manager` is a legacy role identifier kept for backwards compatibility.
    // Issue #91 did not remove this alias because non-engine IDP/team/resource
    // paths still branch on role === 'manager'. Resolution happens via
    // `inherits: ['team_manager']`; `aliasFor` is informational metadata for
    // admin UI and tooling.
    manager: Object.freeze({
        inherits: Object.freeze(['team_manager']),
        permissions: Object.freeze([]),
        aliasFor: 'team_manager',
    }),
    pm: Object.freeze({
        inherits: Object.freeze([]),
        permissions: Object.freeze([
            PERMISSIONS.DASHBOARD_VIEW,
            PERMISSIONS.PROJECTS_VIEW,
            PERMISSIONS.RESOURCES_VIEW,
            PERMISSIONS.REPORTS_VIEW,
            PERMISSIONS.REPORTS_VIEW_PROJECT,
            PERMISSIONS.REPORTS_EXPORT,
            PERMISSIONS.MY_TASKS_VIEW,
            PERMISSIONS.MY_TASKS_CREATE,
            PERMISSIONS.MY_TASKS_EDIT,
            PERMISSIONS.MY_TASKS_DELETE,
            PERMISSIONS.MY_DASHBOARD_VIEW,
            PERMISSIONS.TASKS_VIEW_ANY,
            PERMISSIONS.TASKS_CREATE,
            PERMISSIONS.TASKS_CHANGE_PRIORITY,
            PERMISSIONS.BUGS_VIEW_ANY,
            PERMISSIONS.USER_STORIES_VIEW_ANY,
            PERMISSIONS.TESTEXECUTIONS_VIEW_ANY,
            PERMISSIONS.GOVERNANCE_VIEW,
            PERMISSIONS.QUALITY_TRACEABILITY_VIEW,
            PERMISSIONS.DASHBOARD_PM_VIEW,
            PERMISSIONS.TEAM_VIEW,
        ]),
        scopes: Object.freeze([SCOPES.ACTIVE_ONLY.key]),
    }),
    member: Object.freeze({
        // Day-1 parity for legacy tester users (PRD risk #1)
        inherits: Object.freeze(['tester']),
        permissions: Object.freeze([
            PERMISSIONS.TASKS_VIEW_OWN,
            PERMISSIONS.TASKS_VIEW_TEAM,
            PERMISSIONS.TASKS_EDIT_OWN,
            PERMISSIONS.TASKS_DELETE_OWN,
            PERMISSIONS.TASKS_LOG_TIME,
            PERMISSIONS.BUGS_VIEW_OWN,
            PERMISSIONS.BUGS_VIEW_TEAM,
            PERMISSIONS.BUGS_EDIT_OWN,
            PERMISSIONS.TESTCASES_VIEW_OWN,
            PERMISSIONS.TESTCASES_VIEW_TEAM,
            PERMISSIONS.TESTCASES_EDIT_OWN,
            PERMISSIONS.TESTCASES_VIEW_STEPS,
            PERMISSIONS.TESTEXECUTIONS_VIEW_OWN,
            PERMISSIONS.TESTEXECUTIONS_VIEW_TEAM,
            PERMISSIONS.TESTEXECUTIONS_EDIT_OWN,
            PERMISSIONS.TESTSUITES_VIEW_OWN,
            PERMISSIONS.TESTSUITES_VIEW_TEAM,
            PERMISSIONS.USER_STORIES_VIEW_OWN,
            PERMISSIONS.USER_STORIES_VIEW_TEAM,
            PERMISSIONS.DASHBOARDS_MEMBER_VIEW,
            PERMISSIONS.REPORTS_VIEW_OWN,
            PERMISSIONS.REPORTS_VIEW_TEAM,
        ]),
        scopes: Object.freeze([SCOPES.ACTIVE_ONLY.key]),
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
            PERMISSIONS.TASKS_VIEW_OWN,
            PERMISSIONS.TASKS_VIEW_TEAM,
            PERMISSIONS.PROJECTS_VIEW,
            PERMISSIONS.RESOURCES_VIEW,
            PERMISSIONS.TESTEXECUTIONS_VIEW,
            PERMISSIONS.TESTEXECUTIONS_VIEW_TEAM,
            PERMISSIONS.REPORTS_VIEW,
            PERMISSIONS.MY_TASKS_VIEW,
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
    return key;
}

function isKnownPermissionKey(key) {
    return ALL_PERMISSION_VALUES.includes(key);
}

function getPermissionLookupKeys(key) {
    return [key];
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

const BUILT_IN_ROLE_PERMISSION_DEFAULTS = Object.freeze({
    admin: Object.freeze(['*']),
    pm: Object.freeze([...new Set(collectRolePermissions('pm', new Set()))]),
    team_manager: Object.freeze([...new Set(collectRolePermissions('team_manager', new Set()))]),
    member: Object.freeze([...new Set(collectRolePermissions('member', new Set()))]),
    viewer: Object.freeze([...new Set(collectRolePermissions('viewer', new Set()))]),
    tester: Object.freeze([...new Set(collectRolePermissions('tester', new Set()))]),
});

module.exports = {
    PERMISSIONS,
    ROLES,
    SCOPES,
    ALL_PERMISSION_VALUES,
    ALL_SCOPE_VALUES,
    BUILT_IN_ROLE_PERMISSION_DEFAULTS,
    canUserPerform,
    canUserUseScope,
    collectRolePermissions,
    collectRoleScopes,
    getScope,
    getPermissionLookupKeys,
    isKnownPermissionKey,
    resolvePermissionKey,
};

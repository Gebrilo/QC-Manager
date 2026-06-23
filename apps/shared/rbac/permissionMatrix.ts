'use strict';

const DOMAIN_DEFINITIONS = Object.freeze([
    Object.freeze({ key: 'task', label: 'Tasks', domains: Object.freeze(['qc.tasks']), scoped: true }),
    Object.freeze({ key: 'bug', label: 'Bugs', domains: Object.freeze(['qc.bugs']), scoped: true }),
    Object.freeze({ key: 'test_case', label: 'Test Cases', domains: Object.freeze(['qc.testcases']), scoped: true }),
    Object.freeze({ key: 'test_suite', label: 'Test Suites', domains: Object.freeze(['qc.testsuites']), scoped: true }),
    Object.freeze({ key: 'test_execution', label: 'Test Runs / Executions', domains: Object.freeze(['qc.testexecutions', 'qc.testresults']), scoped: true }),
    Object.freeze({ key: 'user_story', label: 'User Stories', domains: Object.freeze(['qc.user_stories']), scoped: true }),
    Object.freeze({ key: 'projects', label: 'Projects', domains: Object.freeze(['qc.projects']), scoped: false }),
    Object.freeze({ key: 'resources', label: 'Resources', domains: Object.freeze(['qc.resources']), scoped: false }),
    Object.freeze({ key: 'reports', label: 'Reports', domains: Object.freeze(['qc.reports']), scoped: false }),
    Object.freeze({ key: 'governance', label: 'Governance', domains: Object.freeze(['qc.governance']), scoped: false }),
    Object.freeze({ key: 'journeys', label: 'Journeys', domains: Object.freeze(['qc.journeys']), scoped: false }),
    Object.freeze({ key: 'dev_plans', label: 'Dev Plans', domains: Object.freeze(['qc.dev_plans']), scoped: false }),
    Object.freeze({ key: 'team', label: 'Team', domains: Object.freeze(['qc.team']), scoped: false }),
    Object.freeze({ key: 'quality', label: 'Quality', domains: Object.freeze(['qc.quality']), scoped: false }),
    Object.freeze({ key: 'admin', label: 'Admin', domains: Object.freeze(['qc.admin']), scoped: false }),
    Object.freeze({ key: 'dashboard', label: 'Dashboards', domains: Object.freeze(['qc.dashboard', 'qc.dashboards']), scoped: false }),
    Object.freeze({ key: 'mywork', label: 'My Work', domains: Object.freeze(['qc.mywork']), scoped: false }),
]);

const ARTIFACT_TABS = Object.freeze(Object.fromEntries(
    DOMAIN_DEFINITIONS.map(definition => [definition.key, definition])
));

const SCOPE_VALUES = Object.freeze(['none', 'own', 'team', 'any']);

function permissionAction(permissionKey) {
    return permissionKey.split('.').pop();
}

function formatPermissionLabel(permissionKey) {
    return permissionAction(permissionKey)
        .replace(/_/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());
}

function permissionBelongsToTab(permissionKey, tab) {
    return tab.domains.some(domain => permissionKey === domain || permissionKey.startsWith(`${domain}.`));
}

function matrixDomains(allPermissions) {
    return DOMAIN_DEFINITIONS.filter(definition =>
        allPermissions.some(permission => permissionBelongsToTab(permission, definition))
    );
}

function scopedGroupFor(permissionKey, permissionSet, tab) {
    if (!tab.scoped) return null;
    const domain = tab.domains.find(item => permissionKey.startsWith(`${item}.`));
    if (!domain) return null;

    const suffix = permissionKey.slice(domain.length + 1);
    if (suffix.endsWith('_team') || suffix.endsWith('_any')) return null;

    const teamKey = `${domain}.${suffix}_team`;
    const anyKey = `${domain}.${suffix}_any`;
    if (!permissionSet.has(teamKey) && !permissionSet.has(anyKey)) return null;

    return {
        key: `${domain}.${suffix}`,
        mode: 'scope',
        action: suffix,
        label: formatPermissionLabel(`${domain}.${suffix}`),
        keys: {
            own: `${domain}.${suffix}`,
            team: permissionSet.has(teamKey) ? teamKey : null,
            any: permissionSet.has(anyKey) ? anyKey : null,
        },
        project_scope_warning: null,
    };
}

function toggleItem(permissionKey) {
    return {
        key: permissionKey,
        mode: 'toggle',
        action: permissionAction(permissionKey),
        label: formatPermissionLabel(permissionKey),
        project_scope_warning: permissionKey.endsWith('_project')
            ? 'Grants cross-team visibility within projects this role is project-scoped to'
            : null,
    };
}

function permissionsForArtifact(allPermissions, artifactType) {
    const tab = ARTIFACT_TABS[artifactType];
    if (!tab) return null;

    const permissionSet = new Set(allPermissions);
    const groups = [];
    const groupedKeys = new Set();
    const toggles = [];

    for (const permission of allPermissions.filter(key => permissionBelongsToTab(key, tab))) {
        const group = scopedGroupFor(permission, permissionSet, tab);
        if (group) {
            groups.push(group);
            groupedKeys.add(group.keys.own);
            if (group.keys.team) groupedKeys.add(group.keys.team);
            if (group.keys.any) groupedKeys.add(group.keys.any);
        }
    }

    for (const permission of allPermissions.filter(key => permissionBelongsToTab(key, tab))) {
        if (!groupedKeys.has(permission)) toggles.push(toggleItem(permission));
    }

    return [...groups, ...toggles]
        .sort((a, b) => a.action.localeCompare(b.action) || a.key.localeCompare(b.key));
}

function resolveScope(grantedSet, item) {
    if (!item || item.mode !== 'scope') return 'none';
    if (item.keys.any && grantedSet.has(item.keys.any)) return 'any';
    if (item.keys.team && grantedSet.has(item.keys.team)) return 'team';
    if (grantedSet.has(item.keys.own)) return 'own';
    return 'none';
}

function applyScopeToSet(permissionSet, item, scope) {
    if (!item || item.mode !== 'scope' || !SCOPE_VALUES.includes(scope)) return permissionSet;
    const next = new Set(permissionSet);
    next.delete(item.keys.own);
    if (item.keys.team) next.delete(item.keys.team);
    if (item.keys.any) next.delete(item.keys.any);

    if (scope === 'own' || scope === 'team' || scope === 'any') next.add(item.keys.own);
    if ((scope === 'team' || scope === 'any') && item.keys.team) next.add(item.keys.team);
    if (scope === 'any' && item.keys.any) next.add(item.keys.any);
    return next;
}

module.exports = {
    ARTIFACT_TABS,
    DOMAIN_DEFINITIONS,
    SCOPE_VALUES,
    applyScopeToSet,
    matrixDomains,
    permissionsForArtifact,
    resolveScope,
};

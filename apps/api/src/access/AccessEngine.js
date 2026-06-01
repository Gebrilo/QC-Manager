'use strict';

const db = require('../config/db');
const { resolve: resolveRole, canonicalRole } = require('./RoleResolver');

const DENIAL_REASONS = Object.freeze({
    ROLE_MISSING: 'role_missing',
    SCOPE_BLOCKED: 'scope_blocked',
    ACL_MISSING: 'acl_missing',
    TEAM_MISMATCH: 'team_mismatch',
    NOT_ASSIGNEE: 'not_assignee',
    NOT_PROJECT_MEMBER: 'not_project_member',
    UNKNOWN_ARTIFACT: 'unknown_artifact',
});

const ARTIFACT_TABLE_BY_TYPE = Object.freeze({
    bug: 'bugs',
    task: 'tasks',
    test_case: 'test_cases',
    test_execution: 'test_executions',
    test_suite: 'test_suites',
    user_story: 'user_stories',
});

const ARTIFACT_PERMISSION_NAMESPACE = Object.freeze({
    bug: 'bugs',
    task: 'tasks',
    test_case: 'testcases',
    test_execution: 'testexecutions',
    test_suite: 'testsuites',
    user_story: 'user_stories',
});

function permKey(artifactType, scope, verb) {
    const ns = ARTIFACT_PERMISSION_NAMESPACE[artifactType];
    if (!ns) return null;
    return `qc.${ns}.${verb}_${scope}`;
}

function hasAny(set, keys) {
    for (const k of keys) if (set.has(k)) return true;
    return false;
}

async function isAssignee(userId, resourceId) {
    if (!resourceId) return false;
    const r = await db.query(
        'SELECT 1 FROM resources WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL LIMIT 1',
        [resourceId, userId]
    );
    return r.rows.length > 0;
}

async function isTeammateOfAssignee(userTeamId, resourceId) {
    if (!userTeamId || !resourceId) return false;
    const r = await db.query(
        `SELECT 1
         FROM resources r
         JOIN app_user au ON au.id = r.user_id
         WHERE r.id = $1 AND au.team_id = $2 AND r.deleted_at IS NULL
         LIMIT 1`,
        [resourceId, userTeamId]
    );
    return r.rows.length > 0;
}

async function hasAclGrant(artifact, userId, userTeamId, roleIdentifier, verb) {
    const r = await db.query(
        `SELECT 1 FROM artifact_access
         WHERE artifact_type = $1 AND artifact_id = $2 AND action = $3
           AND (
               (subject_type = 'user' AND subject_id = $4)
            OR (subject_type = 'team' AND subject_id = $5)
            OR (subject_type = 'role' AND subject_id = $6)
           )
         LIMIT 1`,
        [artifact.type, artifact.id, verb, userId, userTeamId, roleIdentifier]
    );
    return r.rows.length > 0;
}

async function isProjectTeamMember(projectId, userTeamId) {
    if (!projectId || !userTeamId) return false;
    const r = await db.query(
        'SELECT 1 FROM project_teams WHERE project_id = $1 AND team_id = $2 LIMIT 1',
        [projectId, userTeamId]
    );
    return r.rows.length > 0;
}

async function canPerform(user, artifact, verb, req) {
    if (!artifact || !artifact.type || !ARTIFACT_PERMISSION_NAMESPACE[artifact.type]) {
        return { allowed: false, reason: DENIAL_REASONS.UNKNOWN_ARTIFACT };
    }

    const { effectivePermissions, scope } = await resolveRole(user, req);

    // Branch 1: admin wildcard
    if (effectivePermissions.has('*')) {
        return { allowed: true, branch: 'admin' };
    }

    const keyAny = permKey(artifact.type, 'any', verb);
    const keyTeam = permKey(artifact.type, 'team', verb);
    const keyOwn = permKey(artifact.type, 'own', verb);

    // Branch 2: project-scope role (PM of this project)
    if (artifact.project_id && scope.pm_of_projects.includes(artifact.project_id)) {
        if (effectivePermissions.has(keyAny) || effectivePermissions.has('qc.reports.view_project')) {
            return { allowed: true, branch: 'project_scope' };
        }
    }

    // Branch 3: owner_team match with view_team / edit_team etc.
    if (artifact.owner_team_id && scope.team_id && artifact.owner_team_id === scope.team_id) {
        if (effectivePermissions.has(keyTeam) || effectivePermissions.has(keyAny)) {
            return { allowed: true, branch: 'owner_team' };
        }
    }

    // Branch 4: assignee (resource bridge) with view_own / edit_own
    if (await isAssignee(user.id, artifact.assignee_resource_id)) {
        if (effectivePermissions.has(keyOwn) || effectivePermissions.has(keyTeam) || effectivePermissions.has(keyAny)) {
            return { allowed: true, branch: 'assignee' };
        }
    }

    // Branch 5: teammate of assignee with view_team
    if (scope.team_id && await isTeammateOfAssignee(scope.team_id, artifact.assignee_resource_id)) {
        if (effectivePermissions.has(keyTeam) || effectivePermissions.has(keyAny)) {
            return { allowed: true, branch: 'teammate_of_assignee' };
        }
    }

    // Branch 6: artifact_access ACL
    const roleIdentifier = canonicalRole(user.role);
    if (await hasAclGrant(artifact, user.id, scope.team_id, roleIdentifier, verb)) {
        return { allowed: true, branch: 'artifact_acl' };
    }

    // Branch 7: visibility_scope = project + user is member of any project team
    if (verb === 'view' && artifact.visibility_scope === 'project'
        && await isProjectTeamMember(artifact.project_id, scope.team_id)) {
        if (effectivePermissions.has(keyTeam) || effectivePermissions.has(keyAny)) {
            return { allowed: true, branch: 'project_visibility' };
        }
    }

    // Default deny — choose the most informative reason
    let reason = DENIAL_REASONS.ROLE_MISSING;
    if (hasAny(effectivePermissions, [keyAny, keyTeam, keyOwn]) && artifact.owner_team_id && scope.team_id && artifact.owner_team_id !== scope.team_id) {
        reason = DENIAL_REASONS.TEAM_MISMATCH;
    }

    return { allowed: false, reason };
}

/**
 * Composes a parameterized OR-chain WHERE fragment matching the branches
 * in canPerform. Returns { clause, params, nextIdx } for the caller to
 * bolt onto an existing WHERE.
 *
 * NOTE (Phase-1 follow-up): the assignee + teammate branches reference
 * columns by name (resource1_id / resource2_id / owner_resource_id /
 * submitted_by_resource_id) that exist on some artifact tables but not
 * others (e.g. test_cases has no resource1_id). This is fine while the
 * engine is dormant; the first slice that wires this into a real route
 * needs a per-artifact-type column map.
 */
async function buildListFilter(user, artifactType, verb, opts = {}) {
    const startIdx = opts.startIdx || 1;
    const tableAlias = opts.tableAlias || ARTIFACT_TABLE_BY_TYPE[artifactType];
    if (!tableAlias) throw new Error(`Unknown artifact type: ${artifactType}`);

    const { effectivePermissions, scope } = await resolveRole(user);

    if (effectivePermissions.has('*')) {
        return { clause: 'TRUE', params: [], nextIdx: startIdx };
    }

    const keyAny = permKey(artifactType, 'any', verb);
    const keyTeam = permKey(artifactType, 'team', verb);
    const keyOwn = permKey(artifactType, 'own', verb);
    const params = [];
    let idx = startIdx;
    const branches = [];
    const bind = (val) => { params.push(val); return `$${idx++}`; };

    // owner_team
    if (scope.team_id && (effectivePermissions.has(keyTeam) || effectivePermissions.has(keyAny))) {
        branches.push(`${tableAlias}.owner_team_id = ${bind(scope.team_id)}`);
    }

    // assignee (always bind user.id once, even if branch not added, since it's reused for ACL)
    const userBind = bind(user.id);
    if (effectivePermissions.has(keyOwn) || effectivePermissions.has(keyTeam) || effectivePermissions.has(keyAny)) {
        branches.push(
            `EXISTS (SELECT 1 FROM resources r WHERE r.user_id = ${userBind} AND r.deleted_at IS NULL AND (r.id = ${tableAlias}.resource1_id OR r.id = ${tableAlias}.resource2_id OR r.id = ${tableAlias}.owner_resource_id OR r.id = ${tableAlias}.submitted_by_resource_id))`
        );
    }

    // teammate of assignee
    if (scope.team_id && (effectivePermissions.has(keyTeam) || effectivePermissions.has(keyAny))) {
        const teamBind = bind(scope.team_id);
        branches.push(
            `EXISTS (SELECT 1 FROM resources r2 JOIN app_user au ON au.id = r2.user_id WHERE au.team_id = ${teamBind} AND r2.deleted_at IS NULL AND (r2.id = ${tableAlias}.resource1_id OR r2.id = ${tableAlias}.resource2_id OR r2.id = ${tableAlias}.owner_resource_id OR r2.id = ${tableAlias}.submitted_by_resource_id))`
        );
    }

    // artifact_access ACL
    {
        const roleBind = bind(canonicalRole(user.role));
        const teamForAcl = scope.team_id ? bind(scope.team_id) : 'NULL';
        const userForAcl = bind(user.id);
        const typeBind = bind(artifactType);
        const verbBind = bind(verb);
        branches.push(
            `EXISTS (SELECT 1 FROM artifact_access aa
               WHERE aa.artifact_type = ${typeBind} AND aa.artifact_id = ${tableAlias}.id AND aa.action = ${verbBind}
                 AND ((aa.subject_type='user' AND aa.subject_id=${userForAcl})
                   OR (aa.subject_type='team' AND aa.subject_id=${teamForAcl})
                   OR (aa.subject_type='role' AND aa.subject_id=${roleBind})))`
        );
    }

    // project_managers (PM of project)
    if (scope.pm_of_projects.length > 0) {
        const placeholders = scope.pm_of_projects.map(p => bind(p)).join(', ');
        branches.push(`${tableAlias}.project_id IN (${placeholders})`);
    }

    // visibility_scope = project + project_teams membership (view only)
    if (verb === 'view' && scope.team_id) {
        const tb = bind(scope.team_id);
        branches.push(
            `(${tableAlias}.visibility_scope = 'project' AND EXISTS (SELECT 1 FROM project_teams pt WHERE pt.project_id = ${tableAlias}.project_id AND pt.team_id = ${tb}))`
        );
    }

    const clause = branches.length ? `(${branches.join(' OR ')})` : 'FALSE';
    return { clause, params, nextIdx: idx };
}

function filterFields(_user, _type, row) { return row; }

module.exports = {
    canPerform,
    buildListFilter,
    filterFields,
    DENIAL_REASONS,
    ARTIFACT_TABLE_BY_TYPE,
    ARTIFACT_PERMISSION_NAMESPACE,
};

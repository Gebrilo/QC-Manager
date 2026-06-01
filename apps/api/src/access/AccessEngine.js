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
    const r = await db.query(
        `SELECT 1 FROM resources
         WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
           AND $1::text IS NOT NULL
         LIMIT 1`,
        [resourceId, userId]
    );
    return r.rows.length > 0;
}

async function isTeammateOfAssignee(userTeamId, resourceId) {
    const r = await db.query(
        `SELECT 1
         FROM resources r
         JOIN app_user au ON au.id = r.user_id
         WHERE r.id = $1 AND au.team_id = $2 AND r.deleted_at IS NULL
           AND $1::text IS NOT NULL AND $2::text IS NOT NULL
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

// Placeholder exports for buildListFilter and filterFields, filled in Tasks 6 & 7.
async function buildListFilter() { throw new Error('not implemented yet'); }
function filterFields(_user, _type, row) { return row; }

module.exports = {
    canPerform,
    buildListFilter,
    filterFields,
    DENIAL_REASONS,
    ARTIFACT_TABLE_BY_TYPE,
    ARTIFACT_PERMISSION_NAMESPACE,
};

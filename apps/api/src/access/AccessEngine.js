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
    test_case: 'test_case',
    test_execution: 'test_execution',
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

const SENSITIVE_FIELDS_BY_ARTIFACT = Object.freeze({
    test_case: Object.freeze([
        'description',
        'preconditions',
        'steps',
        'test_steps',
        'expected_result',
        'expected_results',
        'actual_result',
        'note',
    ]),
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
    const keyBare = `qc.${ARTIFACT_PERMISSION_NAMESPACE[artifact.type]}.${verb}`;
    const hasBareVerb = effectivePermissions.has(keyBare);

    // Branch 1b: verb_any short-circuit
    // Holding qc.{ns}.{verb}_any means "perform {verb} on any artifact of
    // this type" — see-all/edit-all without team/ownership constraints.
    // Without this, view_any only widened the existing narrow branches and
    // silently failed when the user matched no team or assignee.
    if (effectivePermissions.has(keyAny)) {
        return { allowed: true, branch: 'verb_any' };
    }

    // Branch 2: project-scope role (PM of this project).
    // keyAny short-circuited above; here we only honor the report-scope grant.
    if (artifact.project_id && scope.pm_of_projects.includes(artifact.project_id)) {
        if (verb === 'view' && effectivePermissions.has('qc.reports.view_project')) {
            return { allowed: true, branch: 'project_scope' };
        }
    }

    // Branch 3: owner_team match with view_team / edit_team etc.
    if (artifact.owner_team_id && scope.team_id && artifact.owner_team_id === scope.team_id) {
        if (effectivePermissions.has(keyTeam)) {
            return { allowed: true, branch: 'owner_team' };
        }
    }

    // Branch 4: assignee (resource bridge) with view_own / edit_own.
    // hasBareVerb (e.g. qc.tasks.view without _own/_team/_any) acts as a
    // legacy own-scope grant so roles whose catalog only grants the
    // unscoped verb (e.g. `contributor`, `tester` pre-matrix-edit) keep
    // their "see / edit my assigned items" behavior after the engine is
    // wired into the route.
    const ownScopeAllowed = hasBareVerb
        || effectivePermissions.has(keyOwn)
        || effectivePermissions.has(keyTeam);

    if (artifact.owner_user_id && artifact.owner_user_id === user.id && ownScopeAllowed) {
        return { allowed: true, branch: 'owner_user' };
    }

    if (artifact.assignee_user_id && artifact.assignee_user_id === user.id && ownScopeAllowed) {
        return { allowed: true, branch: 'assignee_user' };
    }

    if (await isAssignee(user.id, artifact.assignee_resource_id) && ownScopeAllowed) {
        return { allowed: true, branch: 'assignee' };
    }

    // Branch 5: teammate of assignee with view_team
    if (scope.team_id && await isTeammateOfAssignee(scope.team_id, artifact.assignee_resource_id)) {
        if (effectivePermissions.has(keyTeam)) {
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
        if (effectivePermissions.has(keyTeam)) {
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
    const projectExpr = opts.projectExpr || `${tableAlias}.project_id`;
    const ownerTeamExpr = opts.ownerTeamExpr === undefined ? `${tableAlias}.owner_team_id` : opts.ownerTeamExpr;
    const visibilityExpr = opts.visibilityExpr === undefined ? `${tableAlias}.visibility_scope` : opts.visibilityExpr;
    const assigneeResourceExprs = opts.assigneeResourceExprs || [
        `${tableAlias}.resource1_id`,
        `${tableAlias}.resource2_id`,
        `${tableAlias}.owner_resource_id`,
        `${tableAlias}.submitted_by_resource_id`,
    ];
    const userExprs = opts.userExprs || [`${tableAlias}.created_by_user_id`];

    const { effectivePermissions, scope } = await resolveRole(user, opts.req);

    if (effectivePermissions.has('*')) {
        return { clause: 'TRUE', params: [], nextIdx: startIdx };
    }

    const keyAny = permKey(artifactType, 'any', verb);
    const keyTeam = permKey(artifactType, 'team', verb);
    const keyOwn = permKey(artifactType, 'own', verb);
    const keyBare = `qc.${ARTIFACT_PERMISSION_NAMESPACE[artifactType]}.${verb}`;
    const hasBareVerb = effectivePermissions.has(keyBare);

    // verb_any short-circuit (mirrors canPerform Branch 1b).
    // qc.{ns}.{verb}_any means "see/edit any row of this type", so the
    // narrow team/own/ACL branches are redundant.
    if (effectivePermissions.has(keyAny)) {
        return { clause: 'TRUE', params: [], nextIdx: startIdx };
    }

    const params = [];
    let idx = startIdx;
    const branches = [];
    const bind = (val) => { params.push(val); return `$${idx++}`; };

    // owner_team
    if (ownerTeamExpr && scope.team_id && effectivePermissions.has(keyTeam)) {
        branches.push(`${ownerTeamExpr} = ${bind(scope.team_id)}`);
    }

    // owner/assignee user columns (created_by_user_id, assigned_to, executed_by...)
    // hasBareVerb activates this branch so legacy roles whose catalog grants
    // only the unscoped verb (qc.{ns}.{verb}, no _own/_team/_any) still see
    // their assigned items. Mirrors canPerform's ownScopeAllowed.
    if (hasBareVerb || effectivePermissions.has(keyOwn) || effectivePermissions.has(keyTeam)) {
        const userBind = bind(user.id);
        if (userExprs.length > 0) {
            branches.push(`(${userExprs.map(expr => `${expr} = ${userBind}`).join(' OR ')})`);
        }
        if (assigneeResourceExprs.length > 0) {
            branches.push(
                `EXISTS (SELECT 1 FROM resources r WHERE r.user_id = ${userBind} AND r.deleted_at IS NULL AND (${assigneeResourceExprs.map(expr => `r.id = ${expr}`).join(' OR ')}))`
            );
        }
    }

    // teammate of assignee (keyAny short-circuited above; only keyTeam reaches here)
    if (scope.team_id && assigneeResourceExprs.length > 0 && effectivePermissions.has(keyTeam)) {
        const teamBind = bind(scope.team_id);
        branches.push(
            `EXISTS (SELECT 1 FROM resources r2 JOIN app_user au ON au.id = r2.user_id WHERE au.team_id = ${teamBind} AND r2.deleted_at IS NULL AND (${assigneeResourceExprs.map(expr => `r2.id = ${expr}`).join(' OR ')}))`
        );
    }

    // artifact_access ACL
    // subject_id is varchar; the assignee branch above already bound user.id
    // in a uuid context (us.created_by_user_id = $N). Reusing that bind here
    // makes pg infer $N as uuid, then aa.subject_id (varchar) = $N (uuid)
    // fails with "operator does not exist: character varying = uuid".
    // Bind user.id again so this $N is inferred from the varchar context only.
    {
        const aclUserBind = bind(user.id);
        const roleBind = bind(canonicalRole(user.role));
        const teamForAcl = scope.team_id ? bind(scope.team_id) : 'NULL';
        const typeBind = bind(artifactType);
        const verbBind = bind(verb);
        branches.push(
            `EXISTS (SELECT 1 FROM artifact_access aa
               WHERE aa.artifact_type = ${typeBind} AND aa.artifact_id = ${tableAlias}.id AND aa.action = ${verbBind}
                 AND ((aa.subject_type='user' AND aa.subject_id=${aclUserBind})
                   OR (aa.subject_type='team' AND aa.subject_id=${teamForAcl})
                   OR (aa.subject_type='role' AND aa.subject_id=${roleBind})))`
        );
    }

    // project_managers (PM of project)
    if (scope.pm_of_projects.length > 0) {
        const placeholders = scope.pm_of_projects.map(p => bind(p)).join(', ');
        branches.push(`${projectExpr} IN (${placeholders})`);
    }

    // visibility_scope = project + project_teams membership (view only)
    if (verb === 'view' && visibilityExpr && scope.team_id) {
        const tb = bind(scope.team_id);
        branches.push(
            `(${visibilityExpr} = 'project' AND EXISTS (SELECT 1 FROM project_teams pt WHERE pt.project_id = ${projectExpr} AND pt.team_id = ${tb}))`
        );
    }

    const clause = branches.length ? `(${branches.join(' OR ')})` : 'FALSE';
    return { clause, params, nextIdx: idx };
}

function filterFields(resolvedUser, artifactType, row) {
    if (artifactType !== 'test_case') return row;
    if (resolvedUser && resolvedUser.effectivePermissions && resolvedUser.effectivePermissions.has('qc.testcases.view_steps')) {
        return row;
    }
    const clone = { ...row };
    for (const field of SENSITIVE_FIELDS_BY_ARTIFACT.test_case) {
        delete clone[field];
    }
    return clone;
}

module.exports = {
    canPerform,
    buildListFilter,
    filterFields,
    DENIAL_REASONS,
    ARTIFACT_TABLE_BY_TYPE,
    ARTIFACT_PERMISSION_NAMESPACE,
    SENSITIVE_FIELDS_BY_ARTIFACT,
};

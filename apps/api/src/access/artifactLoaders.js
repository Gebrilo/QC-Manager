'use strict';

const db = require('../config/db');
const { canPerform } = require('./AccessEngine');

// Load the task in the shape AccessEngine.canPerform expects.
// assignee_resource_id is resolved viewer-first so a secondary assignee still
// matches the isAssignee branch (mirrors resolveTaskAccessAssigneeResourceId).
async function loadTaskArtifact(taskId, user, req) {
    const t = await db.query(
        `SELECT id, task_id, task_name, project_id, owner_team_id, created_by_user_id, visibility_scope
           FROM tasks WHERE id = $1 AND deleted_at IS NULL`,
        [taskId]
    );
    if (t.rows.length === 0) return null;
    const row = t.rows[0];

    let assigneeResourceId = null;
    const a = await db.query(
        `SELECT tra.resource_id, r.user_id
           FROM task_resource_assignment tra
           JOIN resources r ON r.id = tra.resource_id
          WHERE tra.task_id = $1 AND r.deleted_at IS NULL
          ORDER BY (tra.assignment_type = 'PRIMARY') DESC, tra.created_at, tra.id`,
        [taskId]
    );
    if (a.rows.length > 0) {
        const mine = user && user.id ? a.rows.find(x => x.user_id === user.id) : null;
        assigneeResourceId = (mine || a.rows[0]).resource_id;
    }

    return {
        type: 'task',
        id: row.id,
        display_id: row.task_id || row.id,
        title: row.task_name || null,
        project_id: row.project_id,
        owner_team_id: row.owner_team_id,
        owner_user_id: row.created_by_user_id,
        assignee_user_id: null,
        assignee_resource_id: assigneeResourceId,
        visibility_scope: row.visibility_scope,
    };
}

// Load the bug in the shape AccessEngine.canPerform expects.
// `assigned_to` is a text field (Tuleap username) and is resolved to a
// resources.id so the AccessEngine's assignee branch can fire for whoever
// the bug is currently assigned to. The reporter is also surfaced via
// owner_resource_id (immutable) so it acts as a secondary assignee match.
async function loadBugArtifact(bugId, user, req) {
    const b = await db.query(
        `SELECT id, bug_id, title, project_id, owner_team_id, created_by_user_id, visibility_scope,
                assigned_to, owner_resource_id
           FROM bugs WHERE id = $1 AND deleted_at IS NULL`,
        [bugId]
    );
    if (b.rows.length === 0) return null;
    const row = b.rows[0];

    let assigneeResourceId = row.owner_resource_id || null;
    if (row.assigned_to) {
        const a = await db.query(
            `SELECT id FROM resources
              WHERE resource_name = $1 AND deleted_at IS NULL
              ORDER BY (user_id IS NOT NULL) DESC, id
              LIMIT 1`,
            [row.assigned_to]
        );
        if (a.rows[0] && !assigneeResourceId) {
            assigneeResourceId = a.rows[0].id;
        }
    }

    return {
        type: 'bug',
        id: row.id,
        display_id: row.bug_id || row.id,
        title: row.title || null,
        project_id: row.project_id,
        owner_team_id: row.owner_team_id,
        owner_user_id: row.created_by_user_id,
        assignee_user_id: null,
        assignee_resource_id: assigneeResourceId,
        visibility_scope: row.visibility_scope,
    };
}

// Load the user story in the shape AccessEngine.canPerform expects.
// Stories have no `assigned_to` text field, so the only owner surface is
// created_by_user_id (the story creator) — no assignee_resource_id is set.
async function loadUserStoryArtifact(storyId, user, req) {
    const s = await db.query(
        `SELECT id, title, tuleap_artifact_id, project_id, owner_team_id, created_by_user_id, visibility_scope
           FROM user_stories WHERE id = $1 AND deleted_at IS NULL`,
        [storyId]
    );
    if (s.rows.length === 0) return null;
    const row = s.rows[0];

    return {
        type: 'user_story',
        id: row.id,
        display_id: row.tuleap_artifact_id ? `US-${row.tuleap_artifact_id}` : row.id,
        title: row.title || null,
        project_id: row.project_id,
        owner_team_id: row.owner_team_id,
        owner_user_id: row.created_by_user_id,
        assignee_user_id: null,
        assignee_resource_id: null,
        visibility_scope: row.visibility_scope,
    };
}

// Load the test case in the shape AccessEngine.canPerform expects.
// The test_case table has `assigned_to` (UUID, an app_user id from the route
// that resolves a resource UUID to a user). We surface that as the
// assignee_user_id, and fall back to the executor (executed_by is set on
// the test_case row by later slices — if absent, owner_user_id stays as
// the creator).
async function loadTestCaseArtifact(testCaseId, user, req) {
    const t = await db.query(
        `SELECT id, test_case_id, title, project_id, owner_team_id, created_by_user_id, visibility_scope,
                assigned_to
           FROM test_case WHERE id = $1 AND deleted_at IS NULL`,
        [testCaseId]
    );
    if (t.rows.length === 0) return null;
    const row = t.rows[0];

    return {
        type: 'test_case',
        id: row.id,
        display_id: row.test_case_id || row.id,
        title: row.title || null,
        project_id: row.project_id,
        owner_team_id: row.owner_team_id,
        owner_user_id: row.created_by_user_id,
        assignee_user_id: row.assigned_to || null,
        assignee_resource_id: null,
        visibility_scope: row.visibility_scope,
    };
}

// Load the test suite in the shape AccessEngine.canPerform expects.
// Suites have no `assigned_to` column — only the creator is the owner.
async function loadTestSuiteArtifact(suiteId, user, req) {
    const s = await db.query(
        `SELECT id, project_id, owner_team_id, created_by_user_id, visibility_scope
           FROM test_suites WHERE id = $1 AND deleted_at IS NULL`,
        [suiteId]
    );
    if (s.rows.length === 0) return null;
    const row = s.rows[0];

    return {
        type: 'test_suite',
        id: row.id,
        project_id: row.project_id,
        owner_team_id: row.owner_team_id,
        owner_user_id: row.created_by_user_id,
        assignee_user_id: null,
        assignee_resource_id: null,
        visibility_scope: row.visibility_scope,
    };
}

// Load the test execution in the shape AccessEngine.canPerform expects.
// project_id/owner_team_id/created_by live on the parent test_run, so the
// loader joins to surface them. `assigned_to` on test_execution is an
// app_user id (a person — not a resource), so it's exposed as
// assignee_user_id. test_run_id is stashed on the returned artifact so
// link-builders can navigate to the parent run page.
async function loadTestExecutionArtifact(executionId, user, req) {
    const r = await db.query(
        `SELECT te.id, te.test_run_id, te.assigned_to, te.executed_by,
                tr.project_id, tr.owner_team_id, tr.created_by, tr.visibility_scope
           FROM test_execution te
           LEFT JOIN test_run tr ON tr.id = te.test_run_id
          WHERE te.id = $1`,
        [executionId]
    );
    if (r.rows.length === 0) return null;
    const row = r.rows[0];

    return {
        type: 'test_execution',
        id: row.id,
        project_id: row.project_id,
        owner_team_id: row.owner_team_id,
        owner_user_id: row.created_by,
        assignee_user_id: row.assigned_to || null,
        assignee_resource_id: null,
        visibility_scope: row.visibility_scope,
        test_run_id: row.test_run_id,
    };
}

// Project is a non-artifact entity: no access-engine coverage, no
// owner_team_id / visibility_scope on the row. We expose just enough
// fields for a manual canAccess to decide (see canAccessProject).
async function loadProjectArtifact(projectId, user, req) {
    const p = await db.query(
        `SELECT id, team_id FROM projects WHERE id = $1 AND deleted_at IS NULL`,
        [projectId]
    );
    if (p.rows.length === 0) return null;
    return {
        type: 'project',
        id: p.rows[0].id,
        project_id: p.rows[0].id,
        team_id: p.rows[0].team_id,
    };
}

// Manual access for projects: admin ∪ PM of this project ∪ member of a
// team that's linked to the project via project_teams. AccessEngine's
// canPerform only knows about artifact-shaped entities, so we replicate
// the rule here in SQL.
async function canAccessProject(user, artifact, req) {
    if (!user || !user.id) return false;
    if (user.role === 'admin') return true;
    const pm = await db.query(
        'SELECT 1 FROM project_managers WHERE project_id = $1 AND user_id = $2',
        [artifact.id, user.id]
    );
    if (pm.rows.length > 0) return true;
    if (!user.team_id) return false;
    const team = await db.query(
        'SELECT 1 FROM project_teams WHERE project_id = $1 AND team_id = $2',
        [artifact.id, user.team_id]
    );
    return team.rows.length > 0;
}

// Resource is a non-artifact entity: no access-engine coverage. We expose
// the linked user_id (and the user's team/manager) so the gate can decide.
async function loadResourceArtifact(resourceId, user, req) {
    const r = await db.query(
        `SELECT r.id, r.user_id, u.team_id, u.manager_id
           FROM resources r
           LEFT JOIN app_user u ON u.id = r.user_id
          WHERE r.id = $1 AND r.deleted_at IS NULL`,
        [resourceId]
    );
    if (r.rows.length === 0) return null;
    const row = r.rows[0];
    return {
        type: 'resource',
        id: row.id,
        user_id: row.user_id,
        team_id: row.team_id,
        manager_id: row.manager_id,
    };
}

// Manual access for resources: admin ∪ self (resources.user_id) ∪ the
// linked user's manager. Same reasoning as project — the access engine
// has no concept of these entities.
async function canAccessResource(user, artifact, req) {
    if (!user || !user.id) return false;
    if (user.role === 'admin') return true;
    if (artifact.user_id && artifact.user_id === user.id) return true;
    if (artifact.manager_id && artifact.manager_id === user.id) return true;
    return false;
}

// User is a non-artifact entity: the user record is the artifact itself.
// We only surface the role so canAccess can gate to admins. We don't load
// the full app_user row here to keep this loader cheap — the admin/users
// page is the canonical place to view user details.
async function loadUserArtifact(userId, user, req) {
    const u = await db.query(
        `SELECT id, role, active, status FROM app_user WHERE id = $1`,
        [userId]
    );
    if (u.rows.length === 0) return null;
    return {
        type: 'user',
        id: u.rows[0].id,
        role: u.rows[0].role,
        active: u.rows[0].active,
        status: u.rows[0].status,
    };
}

// Manual access for users: admin only. The admin/users page itself
// is gated by qc.admin.users.view — we re-enforce that here so a
// notification deep-link can never bypass it.
async function canAccessUser(user, artifact, req) {
    if (!user || !user.id) return false;
    return user.role === 'admin';
}

// Team is a non-artifact entity: admin-only gating.
async function loadTeamArtifact(teamId, user, req) {
    const t = await db.query(
        `SELECT id, name FROM teams WHERE id = $1 AND deleted_at IS NULL`,
        [teamId]
    );
    if (t.rows.length === 0) return null;
    return { type: 'team', id: t.rows[0].id, name: t.rows[0].name };
}

async function canAccessTeam(user, artifact, req) {
    if (!user || !user.id) return false;
    return user.role === 'admin';
}

// entity_type → { load(entityId, user, req), canAccess(user, artifact, req) }
const ARTIFACT_GATES = {
    task: {
        load: loadTaskArtifact,
        canAccess: async (user, artifact, req) => {
            const r = await canPerform(user, artifact, 'view', req);
            return !!r.allowed;
        },
    },
    bug: {
        load: loadBugArtifact,
        canAccess: async (user, artifact, req) => {
            const r = await canPerform(user, artifact, 'view', req);
            return !!r.allowed;
        },
    },
    user_story: {
        load: loadUserStoryArtifact,
        canAccess: async (user, artifact, req) => {
            const r = await canPerform(user, artifact, 'view', req);
            return !!r.allowed;
        },
    },
    test_case: {
        load: loadTestCaseArtifact,
        canAccess: async (user, artifact, req) => {
            const r = await canPerform(user, artifact, 'view', req);
            return !!r.allowed;
        },
    },
    test_suite: {
        load: loadTestSuiteArtifact,
        canAccess: async (user, artifact, req) => {
            const r = await canPerform(user, artifact, 'view', req);
            return !!r.allowed;
        },
    },
    test_execution: {
        load: loadTestExecutionArtifact,
        canAccess: async (user, artifact, req) => {
            const r = await canPerform(user, artifact, 'view', req);
            return !!r.allowed;
        },
    },
    project: {
        load: loadProjectArtifact,
        canAccess: canAccessProject,
    },
    resource: {
        load: loadResourceArtifact,
        canAccess: canAccessResource,
    },
    user: {
        load: loadUserArtifact,
        canAccess: canAccessUser,
    },
    team: {
        load: loadTeamArtifact,
        canAccess: canAccessTeam,
    },
};

// Returns { status: 'ok' | 'forbidden' | 'gone' | 'info' }
async function gateEntity(entityType, entityId, user, req) {
    const gate = ARTIFACT_GATES[entityType];
    if (!gate) return { status: 'info' }; // unsupported/non-navigable
    const artifact = await gate.load(entityId, user, req);
    if (!artifact) return { status: 'gone' };
    const allowed = await gate.canAccess(user, artifact, req);
    return { status: allowed ? 'ok' : 'forbidden' };
}

module.exports = { gateEntity, ARTIFACT_GATES };

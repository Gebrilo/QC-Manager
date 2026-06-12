'use strict';

const db = require('../config/db');
const { canPerform } = require('./AccessEngine');

// Load the task in the shape AccessEngine.canPerform expects.
// assignee_resource_id is resolved viewer-first so a secondary assignee still
// matches the isAssignee branch (mirrors resolveTaskAccessAssigneeResourceId).
async function loadTaskArtifact(taskId, user, req) {
    const t = await db.query(
        `SELECT id, project_id, owner_team_id, created_by_user_id, visibility_scope
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
        `SELECT id, project_id, owner_team_id, created_by_user_id, visibility_scope,
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
        `SELECT id, project_id, owner_team_id, created_by_user_id, visibility_scope
           FROM user_stories WHERE id = $1 AND deleted_at IS NULL`,
        [storyId]
    );
    if (s.rows.length === 0) return null;
    const row = s.rows[0];

    return {
        type: 'user_story',
        id: row.id,
        project_id: row.project_id,
        owner_team_id: row.owner_team_id,
        owner_user_id: row.created_by_user_id,
        assignee_user_id: null,
        assignee_resource_id: null,
        visibility_scope: row.visibility_scope,
    };
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

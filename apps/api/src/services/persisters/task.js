const { resolveLinks, drainPending } = require('../tuleapLinkResolver');
const {
  resolveEmailCreator,
  buildAccessDefaults,
  materializeAclGrants,
} = require('../accessDefaults');
const { applyTuleapPrimary, getTaskAssignmentSummary } = require('../assignments/taskAssignments');
const { auditLog } = require('../../middleware/audit');

// ADR 0009 §3 — Tracker Config setting: on reassignment, demote the previous
// primary to SECONDARY when it logged effort (default), else remove it.
function demoteOnReassign(config) {
  return config?.demote_previous_primary !== false;
}

const VALID_TASK_ACTIONS = new Set(['sync', 'delete', 'reject', 'archive']);

const TASK_STATUS_MAP = {
  'Backlog': 'Todo',
  'Cancelled': 'Canceled',
};

function normalizeTaskStatus(status) {
  if (!status) return 'Todo';
  return TASK_STATUS_MAP[status] ?? status;
}

async function generateTaskId(query) {
  const result = await query(
    `SELECT task_id
     FROM tasks
     WHERE task_id ~ '^TSK-[0-9]+$'
     ORDER BY (substring(task_id from 5))::int DESC
     LIMIT 1`
  );
  const lastId = result.rows.length > 0 ? parseInt(result.rows[0].task_id.slice(4), 10) : 0;

  if (!Number.isFinite(lastId)) {
    throw new Error(`Failed to parse last task_id: ${result.rows[0]?.task_id}`);
  }

  return `TSK-${String(lastId + 1).padStart(3, '0')}`;
}

async function dispatchAction(unified, config, deps) {
  const { query } = deps;
  const { action = 'sync' } = unified;

  if (!VALID_TASK_ACTIONS.has(action)) {
    const err = new Error(`Action '${action}' is not supported for artifact_type 'task'. Allowed: sync, delete, reject, archive`);
    err.statusCode = 400;
    throw err;
  }

  const tuleapArtifactId = unified.tuleap?.artifact_id;
  if (!tuleapArtifactId) {
    const err = new Error('tuleap.artifact_id is required');
    err.statusCode = 400;
    throw err;
  }

  if (action === 'reject') {
    return handleReject(unified, config, { query });
  }

  if (action === 'delete') {
    return handleDelete(unified, config, { query });
  }

  if (action === 'archive') {
    return handleArchive(unified, config, { query });
  }

  return handleSync(unified, config, { query });
}

async function handleReject(unified, config, { query }) {
  const tuleapArtifactId = unified.tuleap.artifact_id;
  const common = unified.common || {};
  const fields = unified.fields || {};

  await query(`
    INSERT INTO tuleap_task_history (
      tuleap_artifact_id, tuleap_url, task_name, notes, project_id,
      new_assignee_name, action, action_reason, raw_tuleap_payload
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `, [
    tuleapArtifactId,
    unified.tuleap?.url || null,
    common.title || '',
    common.description || null,
    unified.project_id || config.qc_project_id,
    fields.new_assignee_name || null,
    'rejected_new',
    fields.action_reason || null,
    JSON.stringify(unified.raw_payload || unified),
  ]);

  return { action: 'rejected', message: `Task rejected: ${common.title || tuleapArtifactId} (assigned to unknown user: ${fields.new_assignee_name || 'unknown'})` };
}

async function handleDelete(unified, config, { query }) {
  const tuleapArtifactId = unified.tuleap.artifact_id;

  const existing = await query(
    'SELECT * FROM tasks WHERE tuleap_artifact_id = $1 AND deleted_at IS NULL',
    [tuleapArtifactId]
  );

  if (existing.rows.length > 0) {
    const task = existing.rows[0];

    const assignmentSummary = await getTaskAssignmentSummary(query, task.id);

    await query(`
      INSERT INTO tuleap_task_history (
        original_task_id, tuleap_artifact_id, tuleap_url,
        task_name, notes, status, project_id,
        previous_resource_id, previous_resource_name,
        new_assignee_name, action, action_reason, raw_tuleap_payload
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      task.id, tuleapArtifactId, unified.tuleap?.url || null,
      task.task_name, task.notes, task.status, task.project_id,
      assignmentSummary.primary_resource_id, assignmentSummary.primary_resource_name,
      '', 'deleted_from_tuleap',
      `Artifact ${tuleapArtifactId} was deleted in Tuleap`,
      JSON.stringify(unified.raw_payload || unified),
    ]);

    await query(
      "UPDATE tasks SET deleted_at = NOW(), status = 'Canceled', updated_at = NOW() WHERE id = $1",
      [task.id]
    );
  }

  return { action: 'deleted', id: existing.rows.length > 0 ? existing.rows[0].id : null };
}

async function handleArchive(unified, config, { query }) {
  const tuleapArtifactId = unified.tuleap.artifact_id;
  const fields = unified.fields || {};

  const existing = await query(
    'SELECT * FROM tasks WHERE tuleap_artifact_id = $1 AND deleted_at IS NULL',
    [tuleapArtifactId]
  );

  if (existing.rows.length > 0) {
    const task = existing.rows[0];

    const assignmentSummary = await getTaskAssignmentSummary(query, task.id);

    await query(`
      INSERT INTO tuleap_task_history (
        original_task_id, tuleap_artifact_id, tuleap_url,
        task_name, notes, status, project_id,
        previous_resource_id, previous_resource_name,
        new_assignee_name, action, action_reason, raw_tuleap_payload
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      task.id, tuleapArtifactId, unified.tuleap?.url || null,
      task.task_name, task.notes, task.status, task.project_id,
      assignmentSummary.primary_resource_id, assignmentSummary.primary_resource_name,
      fields.new_assignee_name || null, 'reassigned_out',
      fields.action_reason || null,
      JSON.stringify(unified.raw_payload || unified),
    ]);

    await query(
      "UPDATE tasks SET deleted_at = NOW(), status = 'Canceled', updated_at = NOW() WHERE id = $1",
      [task.id]
    );

    return { action: 'archived', id: task.id };
  }

  return { action: 'archived', id: null, message: `Task not found for archiving: ${tuleapArtifactId}` };
}

async function handleSync(unified, config, { query }) {
  const common = unified.common || {};
  const fields = unified.fields || {};
  const tuleapArtifactId = unified.tuleap.artifact_id;
  const tuleapUrl = unified.tuleap?.url || null;
  const projectId = unified.project_id || config.qc_project_id;

  const links = common.links || [];
  const { resolved, pending } = await resolveLinks({
    qcProjectId: projectId,
    tuleapLinks: links,
    query,
  });

  const parentStoryLink = resolved.find(l => l.type === 'user_story') || null;
  const parentUserStoryId = parentStoryLink?.qc_id || null;
  const parentStoryTuleapArtifactId = parentStoryLink?.tuleap_id || fields.parent_story_id || null;

  const existing = await query(
    'SELECT * FROM tasks WHERE tuleap_artifact_id = $1 AND deleted_at IS NULL',
    [tuleapArtifactId]
  );

  if (existing.rows.length > 0) {
    const task = existing.rows[0];

    const assignedResourceId = common.assigned_to ? await resolveResourceByName(common.assigned_to, query) : null;

    const result = await query(`
      UPDATE tasks SET
        task_name = COALESCE($1, task_name),
        notes = COALESCE($2, notes),
        status = COALESCE($3, status),
        tuleap_url = COALESCE($4, tuleap_url),
        parent_story_id = CASE WHEN $5::integer IS NOT NULL THEN $5 ELSE parent_story_id END,
        parent_story_tuleap_artifact_id = CASE WHEN $5::integer IS NOT NULL THEN $5 ELSE parent_story_tuleap_artifact_id END,
        parent_user_story_id = CASE WHEN $6::uuid IS NOT NULL THEN $6 ELSE parent_user_story_id END,
        last_tuleap_sync = NOW(),
        sync_status = 'synced',
        last_sync_attempted_at = NOW(),
        last_sync_error = NULL,
        updated_at = NOW()
      WHERE id = $7
      RETURNING *
    `, [
      common.title || null,
      common.description || null,
      common.status ? normalizeTaskStatus(common.status) : null,
      tuleapUrl,
      parentStoryTuleapArtifactId,
      parentUserStoryId,
      task.id,
    ]);

    // ADR 0009 §3 — map assigned_to onto the PRIMARY assignment via the junction.
    await applyTuleapPrimary({
      query,
      taskId: result.rows[0].id,
      resourceId: assignedResourceId,
      demoteWhenEffort: demoteOnReassign(config),
    });

    await auditLog('tasks', result.rows[0].id, 'UPDATE', result.rows[0], task, 'tuleap');

    return { action: 'updated', id: result.rows[0].id, data: result.rows[0] };
  }

  const deleted = await query(
    "SELECT * FROM tasks WHERE tuleap_artifact_id = $1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 1",
    [tuleapArtifactId]
  );

  if (deleted.rows.length > 0) {
    const task = deleted.rows[0];

    const resourceId = common.assigned_to ? await resolveResourceByName(common.assigned_to, query) : null;

    const result = await query(`
      UPDATE tasks SET
        deleted_at = NULL,
        status = $1,
        task_name = $2,
        notes = $3,
        tuleap_url = $4,
        parent_story_id = $5,
        parent_story_tuleap_artifact_id = $5,
        parent_user_story_id = $6,
        last_tuleap_sync = NOW(),
        sync_status = 'synced',
        last_sync_attempted_at = NOW(),
        last_sync_error = NULL,
        updated_at = NOW()
      WHERE id = $7
      RETURNING *
    `, [normalizeTaskStatus(common.status), common.title, common.description, tuleapUrl,
      parentStoryTuleapArtifactId, parentUserStoryId, task.id]);

    // ADR 0009 §3 — assigned_to → PRIMARY assignment (junction is source of truth).
    await applyTuleapPrimary({
      query,
      taskId: result.rows[0].id,
      resourceId,
      demoteWhenEffort: demoteOnReassign(config),
    });

    if (resolved.length > 0) {
      await drainPending({
        qcProjectId: projectId,
        justPersistedQcId: result.rows[0].id,
        justPersistedQcType: 'task',
        justPersistedTuleapId: tuleapArtifactId,
        query,
      });
    }

    await auditLog('tasks', result.rows[0].id, 'UPDATE', result.rows[0], task, 'tuleap');

    return { action: 'revived', id: result.rows[0].id, data: result.rows[0] };
  }

  const resourceId = common.assigned_to ? await resolveResourceByName(common.assigned_to, query) : null;
  const task_id = await generateTaskId(query);

  const createdByUserId = await resolveEmailCreator({
    email: unified.created_by || null,
    query,
  });

  const accessDefaults = await buildAccessDefaults({
    tuleapConfig: config,
    artifactType: 'task',
    query,
  });

  const result = await query(`
    INSERT INTO tasks (
      task_id, task_name, notes, status,
      project_id,
      tuleap_artifact_id, tuleap_url, synced_from_tuleap, last_tuleap_sync,
      parent_story_id, parent_story_tuleap_artifact_id, parent_user_story_id,
      sync_status, last_sync_attempted_at, last_sync_error,
      owner_team_id, visibility_scope, created_by_user_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, NOW(), $8, $8, $9, 'synced', NOW(), NULL, $10, $11, $12)
    RETURNING *
  `, [
    task_id, common.title, common.description || '', normalizeTaskStatus(common.status),
    projectId,
    tuleapArtifactId, tuleapUrl, parentStoryTuleapArtifactId, parentUserStoryId,
    accessDefaults.owner_team_id,
    accessDefaults.visibility_scope,
    createdByUserId,
  ]);

  await materializeAclGrants({
    artifactType: 'task',
    artifactId: result.rows[0].id,
    grants: accessDefaults.default_acl_grants,
    grantedBy: createdByUserId,
    query,
  });

  // ADR 0009 §3 — assigned_to → PRIMARY assignment (junction is source of truth).
  await applyTuleapPrimary({
    query,
    taskId: result.rows[0].id,
    resourceId,
    demoteWhenEffort: demoteOnReassign(config),
  });

  if (resolved.length > 0) {
    await drainPending({
      qcProjectId: projectId,
      justPersistedQcId: result.rows[0].id,
      justPersistedQcType: 'task',
      justPersistedTuleapId: tuleapArtifactId,
      query,
    });
  }

  await auditLog('tasks', result.rows[0].id, 'CREATE', result.rows[0], null, 'tuleap');

  return { action: 'created', id: result.rows[0].id, data: result.rows[0] };
}

async function resolveResourceByName(name, query) {
  if (!name) return null;
  const result = await query(
    "SELECT id FROM resources WHERE deleted_at IS NULL AND (LOWER(resource_name) = LOWER($1) OR LOWER(email) = LOWER($1)) LIMIT 1",
    [name]
  );
  return result.rows.length > 0 ? result.rows[0].id : null;
}

module.exports = { dispatchAction, generateTaskId };

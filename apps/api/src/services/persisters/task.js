const { resolveLinks, drainPending } = require('../tuleapLinkResolver');

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
    "SELECT task_id FROM tasks WHERE task_id LIKE 'TSK-%' ORDER BY task_id DESC LIMIT 1"
  );
  const lastId = result.rows.length > 0 ? parseInt(result.rows[0].task_id.replace('TSK-', ''), 10) : 0;
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

    let previousResourceName = null;
    if (task.resource1_id) {
      const resRes = await query('SELECT resource_name FROM resources WHERE id = $1', [task.resource1_id]);
      if (resRes.rows.length > 0) previousResourceName = resRes.rows[0].resource_name;
    }

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
      task.resource1_id, previousResourceName,
      null, 'deleted_from_tuleap',
      `Artifact ${tuleapArtifactId} was deleted in Tuleap`,
      JSON.stringify(unified.raw_payload || unified),
    ]);

    await query(
      "UPDATE tasks SET deleted_at = NOW(), status = 'Cancelled', updated_at = NOW() WHERE id = $1",
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

    let previousResourceName = null;
    if (task.resource1_id) {
      const resRes = await query('SELECT resource_name FROM resources WHERE id = $1', [task.resource1_id]);
      if (resRes.rows.length > 0) previousResourceName = resRes.rows[0].resource_name;
    }

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
      task.resource1_id, previousResourceName,
      fields.new_assignee_name || null, 'reassigned_out',
      fields.action_reason || null,
      JSON.stringify(unified.raw_payload || unified),
    ]);

    await query(
      "UPDATE tasks SET deleted_at = NOW(), status = 'Cancelled', updated_at = NOW() WHERE id = $1",
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

    const result = await query(`
      UPDATE tasks SET
        task_name = COALESCE($1, task_name),
        notes = COALESCE($2, notes),
        status = COALESCE($3, status),
        resource1_id = COALESCE($4, resource1_id),
        tuleap_url = COALESCE($5, tuleap_url),
        parent_story_id = CASE WHEN $6::integer IS NOT NULL THEN $6 ELSE parent_story_id END,
        parent_story_tuleap_artifact_id = CASE WHEN $6::integer IS NOT NULL THEN $6 ELSE parent_story_tuleap_artifact_id END,
        parent_user_story_id = CASE WHEN $7::uuid IS NOT NULL THEN $7 ELSE parent_user_story_id END,
        last_tuleap_sync = NOW(),
        updated_at = NOW()
      WHERE id = $8
      RETURNING *
    `, [
      common.title || null,
      common.description || null,
      common.status ? normalizeTaskStatus(common.status) : null,
      common.assigned_to ? await resolveResourceByName(common.assigned_to, query) : null,
      tuleapUrl,
      parentStoryTuleapArtifactId,
      parentUserStoryId,
      task.id,
    ]);

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
        resource1_id = $4,
        tuleap_url = $5,
        parent_story_id = $6,
        parent_story_tuleap_artifact_id = $6,
        parent_user_story_id = $7,
        last_tuleap_sync = NOW(),
        updated_at = NOW()
      WHERE id = $8
      RETURNING *
    `, [normalizeTaskStatus(common.status), common.title, common.description, resourceId, tuleapUrl,
      parentStoryTuleapArtifactId, parentUserStoryId, task.id]);

    if (resolved.length > 0) {
      await drainPending({
        qcProjectId: projectId,
        justPersistedQcId: result.rows[0].id,
        justPersistedQcType: 'task',
        justPersistedTuleapId: tuleapArtifactId,
        query,
      });
    }

    return { action: 'revived', id: result.rows[0].id, data: result.rows[0] };
  }

  const resourceId = common.assigned_to ? await resolveResourceByName(common.assigned_to, query) : null;
  const task_id = await generateTaskId(query);

  const result = await query(`
    INSERT INTO tasks (
      task_id, task_name, notes, status,
      project_id, resource1_id,
      tuleap_artifact_id, tuleap_url, synced_from_tuleap, last_tuleap_sync,
      parent_story_id, parent_story_tuleap_artifact_id, parent_user_story_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, NOW(), $9, $9, $10)
    RETURNING *
  `, [
    task_id, common.title, common.description || '', normalizeTaskStatus(common.status),
    projectId, resourceId,
    tuleapArtifactId, tuleapUrl, parentStoryTuleapArtifactId, parentUserStoryId,
  ]);

  if (resolved.length > 0) {
    await drainPending({
      qcProjectId: projectId,
      justPersistedQcId: result.rows[0].id,
      justPersistedQcType: 'task',
      justPersistedTuleapId: tuleapArtifactId,
      query,
    });
  }

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

module.exports = { dispatchAction };

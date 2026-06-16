const { resolveLinks, drainPending } = require('../tuleapLinkResolver');
const {
  resolveEmailCreator,
  buildAccessDefaults,
  materializeAclGrants,
} = require('../accessDefaults');
const { hasUnsyncedLocalEdit } = require('./localEditGuard');

const VALID_USER_STORY_ACTIONS = new Set(['sync', 'delete']);

async function dispatchAction(unified, config, deps) {
  const { query } = deps;
  const { action = 'sync' } = unified;

  if (!VALID_USER_STORY_ACTIONS.has(action)) {
    const err = new Error(`Action '${action}' is not supported for artifact_type 'user_story'. Allowed: sync, delete`);
    err.statusCode = 400;
    throw err;
  }

  const tuleapArtifactId = unified.tuleap?.artifact_id;
  if (!tuleapArtifactId) {
    const err = new Error('tuleap.artifact_id is required');
    err.statusCode = 400;
    throw err;
  }

  if (action === 'delete') {
    return handleDelete(tuleapArtifactId, query);
  }

  return handleSync(unified, config, deps);
}

async function handleDelete(tuleapArtifactId, query) {
  const existing = await query(
    'SELECT id FROM user_stories WHERE tuleap_artifact_id = $1',
    [tuleapArtifactId]
  );

  if (existing.rows.length === 0) {
    return { action: 'deleted', id: null };
  }

  await query(
    'UPDATE user_stories SET deleted_at = NOW(), updated_at = NOW() WHERE tuleap_artifact_id = $1',
    [tuleapArtifactId]
  );

  return { action: 'deleted', id: existing.rows[0].id };
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

  const existing = await query(
    'SELECT id, deleted_at, sync_status FROM user_stories WHERE tuleap_artifact_id = $1 AND deleted_at IS NULL',
    [tuleapArtifactId]
  );

  if (existing.rows.length > 0) {
    // QC edit wins until synced: skip inbound overwrite of an unsynced local edit.
    if (hasUnsyncedLocalEdit(existing.rows[0])) {
      return { action: 'skipped_local_edit', id: existing.rows[0].id };
    }
    const result = await updateUserStory(existing.rows[0].id, unified, query);
    return { action: 'updated', id: result.rows[0].id, data: result.rows[0] };
  }

  const deleted = await query(
    'SELECT id FROM user_stories WHERE tuleap_artifact_id = $1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 1',
    [tuleapArtifactId]
  );

  if (deleted.rows.length > 0) {
    const result = await query(
      `UPDATE user_stories SET
         title = $1,
         description = $2,
         acceptance_criteria = $3,
         status = $4,
         requirement_version = $5,
         priority = $6,
         ba_author = $7,
         tuleap_url = $8,
         raw_tuleap_payload = COALESCE($9, raw_tuleap_payload),
         deleted_at = NULL,
         last_sync_at = NOW(),
         sync_status = 'synced',
         last_sync_attempted_at = NOW(),
         last_sync_error = NULL,
         updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [
        common.title || null,
        common.description || null,
        fields.acceptance_criteria || null,
        common.status || 'Draft',
        fields.requirement_version || null,
        common.priority || null,
        fields.ba_author || null,
        tuleapUrl,
        unified.raw_payload ? JSON.stringify(unified.raw_payload) : null,
        deleted.rows[0].id,
      ]
    );

    if (resolved.length > 0) {
      await drainPending({
        qcProjectId: projectId,
        justPersistedQcId: result.rows[0].id,
        justPersistedQcType: 'user_story',
        justPersistedTuleapId: tuleapArtifactId,
        query,
      });
    }

    return { action: 'revived', id: result.rows[0].id, data: result.rows[0] };
  }

  const createdByUserId = await resolveEmailCreator({
    email: unified.created_by || null,
    query,
  });

  const accessDefaults = await buildAccessDefaults({
    tuleapConfig: config,
    artifactType: 'user_story',
    query,
  });

  const insertResult = await query(
    `INSERT INTO user_stories (
       tuleap_artifact_id, tuleap_tracker_id, tuleap_url,
       title, description, acceptance_criteria, status,
       requirement_version, priority, ba_author,
       project_id, raw_tuleap_payload, last_sync_at, pending_links,
       sync_status, last_sync_attempted_at, last_sync_error,
       owner_team_id, visibility_scope, created_by_user_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), $13, 'synced', NOW(), NULL, $14, $15, $16)
     RETURNING *`,
    [
      tuleapArtifactId,
      config.tuleap_tracker_id || null,
      tuleapUrl,
      common.title || '',
      common.description || null,
      fields.acceptance_criteria || null,
      common.status || 'Draft',
      fields.requirement_version || null,
      common.priority || null,
      fields.ba_author || null,
      projectId,
      unified.raw_payload ? JSON.stringify(unified.raw_payload) : JSON.stringify(unified),
      JSON.stringify(pending),
      accessDefaults.owner_team_id,
      accessDefaults.visibility_scope,
      createdByUserId,
    ]
  );

  await materializeAclGrants({
    artifactType: 'user_story',
    artifactId: insertResult.rows[0].id,
    grants: accessDefaults.default_acl_grants,
    grantedBy: createdByUserId,
    query,
  });

  if (resolved.length > 0) {
    await drainPending({
      qcProjectId: projectId,
      justPersistedQcId: insertResult.rows[0].id,
      justPersistedQcType: 'user_story',
      justPersistedTuleapId: tuleapArtifactId,
      query,
    });
  }

  return { action: 'created', id: insertResult.rows[0].id, data: insertResult.rows[0] };
}

async function updateUserStory(id, unified, query) {
  const common = unified.common || {};
  const fields = unified.fields || {};

  return query(
    `UPDATE user_stories SET
       title = COALESCE($1, title),
       description = COALESCE($2, description),
       acceptance_criteria = COALESCE($3, acceptance_criteria),
       status = COALESCE($4, status),
       requirement_version = COALESCE($5, requirement_version),
       priority = COALESCE($6, priority),
       ba_author = COALESCE($7, ba_author),
       tuleap_url = COALESCE($8, tuleap_url),
       raw_tuleap_payload = COALESCE($9, raw_tuleap_payload),
       last_sync_at = NOW(),
       sync_status = 'synced',
       last_sync_attempted_at = NOW(),
       last_sync_error = NULL,
       updated_at = NOW()
     WHERE id = $10
     RETURNING *`,
    [
      common.title || null,
      common.description || null,
      fields.acceptance_criteria || null,
      common.status || null,
      fields.requirement_version || null,
      common.priority || null,
      fields.ba_author || null,
      unified.tuleap?.url || null,
      unified.raw_payload ? JSON.stringify(unified.raw_payload) : null,
      id,
    ]
  );
}

module.exports = { dispatchAction };

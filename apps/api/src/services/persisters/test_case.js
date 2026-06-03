const { resolveLinks, drainPending } = require('../tuleapLinkResolver');
const {
  resolveEmailCreator,
  buildAccessDefaults,
  materializeAclGrants,
} = require('../accessDefaults');

const VALID_TEST_CASE_ACTIONS = new Set(['sync', 'delete']);

const VALID_TEST_CASE_STATUSES = new Set(['None', 'Not Run', 'Review', 'Pass', 'Fail', 'Blocked']);

async function generateTestCaseId(query) {
  const result = await query("SELECT 'TC-' || LPAD(nextval('test_case_id_seq')::text, 5, '0') AS next_id");
  return result.rows[0].next_id;
}

function normalizeTestCaseStatus(status) {
  if (!status) return 'Not Run';
  if (VALID_TEST_CASE_STATUSES.has(status)) return status;
  const lower = status.toLowerCase().trim();
  if (['backlog', 'to do', 'todo', 'new', 'open', 'draft', 'active'].includes(lower)) return 'Not Run';
  if (['in review', 'review', 'wip'].includes(lower)) return 'Review';
  if (['done', 'closed', 'resolved', 'passed', 'complete', 'completed', 'pass'].includes(lower)) return 'Pass';
  if (['fail', 'failed'].includes(lower)) return 'Fail';
  if (['blocked', 'cancelled', 'canceled', 'rejected', 'archived', 'deprecated'].includes(lower)) return 'Blocked';
  return 'Not Run';
}

async function dispatchAction(unified, config, deps) {
  const { query } = deps;
  const { action = 'sync' } = unified;

  if (!VALID_TEST_CASE_ACTIONS.has(action)) {
    const err = new Error(`Action '${action}' is not supported for artifact_type 'test_case'. Allowed: sync, delete`);
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
    'SELECT id FROM test_case WHERE tuleap_artifact_id = $1 AND deleted_at IS NULL',
    [tuleapArtifactId]
  );

  if (existing.rows.length === 0) {
    return { action: 'deleted', id: null };
  }

  await query(
    "UPDATE test_case SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1",
    [existing.rows[0].id]
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
    'SELECT id, deleted_at FROM test_case WHERE tuleap_artifact_id = $1 AND deleted_at IS NULL',
    [tuleapArtifactId]
  );

  if (existing.rows.length > 0) {
    const result = await query(`
      UPDATE test_case SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        status = COALESCE($3::text, status),
        priority = COALESCE($4, priority),
        tuleap_url = COALESCE($5, tuleap_url),
        last_tuleap_sync = NOW(),
        sync_status = 'synced',
        last_sync_attempted_at = NOW(),
        last_sync_error = NULL,
        updated_at = NOW()
      WHERE id = $6
      RETURNING *
    `, [
      common.title || null,
      common.description || null,
      common.status ? normalizeTestCaseStatus(common.status) : null,
      common.priority || null,
      tuleapUrl,
      existing.rows[0].id,
    ]);

    return { action: 'updated', id: result.rows[0].id, data: result.rows[0] };
  }

  const deleted = await query(
    'SELECT id FROM test_case WHERE tuleap_artifact_id = $1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 1',
    [tuleapArtifactId]
  );

  if (deleted.rows.length > 0) {
    const result = await query(`
      UPDATE test_case SET
        title = $1,
        description = $2,
        status = $3,
        priority = $4,
        tuleap_url = $5,
        deleted_at = NULL,
        last_tuleap_sync = NOW(),
        sync_status = 'synced',
        last_sync_attempted_at = NOW(),
        last_sync_error = NULL,
        updated_at = NOW()
      WHERE id = $6
      RETURNING *
    `, [common.title || '', common.description || null, normalizeTestCaseStatus(common.status), common.priority || 'medium', tuleapUrl, deleted.rows[0].id]);

    if (resolved.length > 0) {
      await drainPending({
        qcProjectId: projectId,
        justPersistedQcId: result.rows[0].id,
        justPersistedQcType: 'test_case',
        justPersistedTuleapId: tuleapArtifactId,
        query,
      });
    }

    return { action: 'revived', id: result.rows[0].id, data: result.rows[0] };
  }

  const test_case_id = await generateTestCaseId(query);

  const createdByUserId = await resolveEmailCreator({
    email: unified.created_by || null,
    query,
  });

  const accessDefaults = await buildAccessDefaults({
    tuleapConfig: config,
    artifactType: 'test_case',
    query,
  });

  const result = await query(`
    INSERT INTO test_case (
      test_case_id, title, description, status, priority,
      project_id, tuleap_artifact_id, tuleap_tracker_id, tuleap_url,
      synced_from_tuleap, last_tuleap_sync, pending_links,
      sync_status, last_sync_attempted_at, last_sync_error,
      owner_team_id, visibility_scope, created_by_user_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, NOW(), $10, 'synced', NOW(), NULL, $11, $12, $13)
    RETURNING *
  `, [
    test_case_id,
    common.title || '',
    common.description || null,
    normalizeTestCaseStatus(common.status),
    common.priority || 'medium',
    projectId,
    tuleapArtifactId,
    config.tuleap_tracker_id || null,
    tuleapUrl,
    JSON.stringify(pending),
    accessDefaults.owner_team_id,
    accessDefaults.visibility_scope,
    createdByUserId,
  ]);

  await materializeAclGrants({
    artifactType: 'test_case',
    artifactId: result.rows[0].id,
    grants: accessDefaults.default_acl_grants,
    grantedBy: createdByUserId,
    query,
  });

  if (resolved.length > 0) {
    await drainPending({
      qcProjectId: projectId,
      justPersistedQcId: result.rows[0].id,
      justPersistedQcType: 'test_case',
      justPersistedTuleapId: tuleapArtifactId,
      query,
    });
  }

  return { action: 'created', id: result.rows[0].id, data: result.rows[0] };
}

module.exports = { dispatchAction };

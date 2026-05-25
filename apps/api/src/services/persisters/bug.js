const { resolveLinks, drainPending } = require('../tuleapLinkResolver');
const { UnifiedPayloadSchema } = require('../../schemas/tuleapUnified');
const { normalizeBugStatus, normalizeBugSeverity } = require('../normalizers/bug');

const VALID_BUG_ACTIONS = new Set(['sync', 'delete']);

async function dispatchAction(unified, config, deps) {
  const { query, skipUpdate = false } = deps;

  const { action = 'sync' } = unified;

  if (!VALID_BUG_ACTIONS.has(action)) {
    const err = new Error(`Action '${action}' is not supported for artifact_type 'bug'. Allowed: sync, delete`);
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
    'SELECT id FROM bugs WHERE tuleap_artifact_id = $1',
    [tuleapArtifactId]
  );

  if (existing.rows.length === 0) {
    return { action: 'deleted', id: null };
  }

  await query(
    "UPDATE bugs SET deleted_at = NOW(), updated_at = NOW() WHERE tuleap_artifact_id = $1",
    [tuleapArtifactId]
  );

  return { action: 'deleted', id: existing.rows[0].id };
}

async function handleSync(unified, config, deps) {
  const { query, skipUpdate = false } = deps;
  const tuleapArtifactId = unified.tuleap.artifact_id;
  const tuleapUrl = unified.tuleap?.url || null;
  const projectId = unified.project_id || config.qc_project_id;

  const links = unified.common?.links || [];
  const { resolved, pending } = await resolveLinks({
    qcProjectId: projectId,
    tuleapLinks: links,
    query,
  });

  const resolvedTestCases = resolved.filter(l => l.type === 'test_case');
  const source = resolvedTestCases.length > 0 ? 'TEST_CASE' : 'EXPLORATORY';

  const existing = await query(
    'SELECT id, deleted_at FROM bugs WHERE tuleap_artifact_id = $1',
    [tuleapArtifactId]
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];

    if (row.deleted_at) {
      const result = await updateBug(row.id, unified, config, projectId, source, resolvedTestCases, query);
      return { action: 'revived', id: row.id, data: result.rows[0] };
    }

    if (skipUpdate) {
      return { action: 'skipped', id: row.id };
    }

    const result = await updateBug(row.id, unified, config, projectId, source, resolvedTestCases, query);
    return { action: 'updated', id: row.id, data: result.rows[0] };
  }

  return createBug(unified, config, projectId, source, resolvedTestCases, pending, tuleapArtifactId, tuleapUrl, query);
}

async function createBug(unified, config, projectId, source, resolvedTestCases, pending, tuleapArtifactId, tuleapUrl, query) {
  const common = unified.common || {};
  const fields = unified.fields || {};

  const title = common.title || '';
  const description = common.description || '';
  const status = normalizeBugStatus(common.status);
  const severity = normalizeBugSeverity(fields.severity);
  const assignedTo = common.assigned_to || null;
  const priority = common.priority || 'medium';

  const reporterEmail = unified.reported_by || null;
  let ownerResourceId = null;

  if (reporterEmail) {
    const reporterRes = await query(
      "SELECT id FROM resources WHERE deleted_at IS NULL AND (LOWER(email) = LOWER($1) OR LOWER(resource_name) = LOWER($1))",
      [reporterEmail]
    );
    if (reporterRes.rows.length > 0) {
      ownerResourceId = reporterRes.rows[0].id;
    }
  }

  const bugId = `TLP-${tuleapArtifactId}`;
  const linkedTestCaseIds = resolvedTestCases.map(l => l.qc_id);

  const result = await query(
    `INSERT INTO bugs (
      tuleap_artifact_id, tuleap_tracker_id, tuleap_url, bug_id, title, description,
      status, severity, priority, bug_type, component, project_id,
      linked_test_case_ids, assigned_to, reported_by,
      reported_date, last_sync_at, raw_tuleap_payload, source,
      owner_resource_id, pending_links, environment, service_name,
      dev_fix_description, qc_verification_notes, initial_effort, remaining_effort, cc,
      sync_status, last_sync_attempted_at, last_sync_error
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW(),$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,'synced',NOW(),NULL)
    RETURNING *`,
    [
      tuleapArtifactId,
      config.tuleap_tracker_id,
      tuleapUrl,
      bugId,
      title,
      description,
      status,
      severity,
      priority,
      fields.bug_type || null,
      fields.component || null,
      projectId,
      linkedTestCaseIds.length > 0 ? linkedTestCaseIds : null,
      assignedTo,
      unified.reported_by || null,
      unified.reported_date || null,
      JSON.stringify(unified.raw_payload || unified),
      source,
      ownerResourceId,
      JSON.stringify(pending),
      fields.environment || null,
      fields.service_name || null,
      fields.dev_fix_description || null,
      fields.qc_verification_notes || null,
      fields.initial_effort != null ? fields.initial_effort : null,
      fields.remaining_effort != null ? fields.remaining_effort : null,
      Array.isArray(fields.cc) ? fields.cc : (fields.cc ? [fields.cc] : null),
    ]
  );

  if (resolvedTestCases.length > 0) {
    await drainPending({
      qcProjectId: projectId,
      justPersistedQcId: result.rows[0].id,
      justPersistedQcType: 'bug',
      justPersistedTuleapId: tuleapArtifactId,
      query,
    });
  }

  return { action: 'created', id: result.rows[0].id, data: result.rows[0] };
}

async function updateBug(bugId, unified, config, projectId, source, resolvedTestCases, query) {
  const common = unified.common || {};
  const fields = unified.fields || {};

  const linkedTestCaseIds = resolvedTestCases.map(l => l.qc_id);

  return query(
    `UPDATE bugs SET
      title = COALESCE($1, title),
      description = COALESCE($2, description),
      status = COALESCE($3, status),
      severity = COALESCE($4, severity),
      priority = COALESCE($5, priority),
      bug_type = COALESCE($6, bug_type),
      component = COALESCE($7, component),
      assigned_to = COALESCE($8, assigned_to),
      linked_test_case_ids = CASE WHEN $9::uuid[] IS NOT NULL THEN $9 ELSE linked_test_case_ids END,
      source = $10,
      environment = COALESCE($11, environment),
      service_name = COALESCE($12, service_name),
      dev_fix_description = COALESCE($13, dev_fix_description),
      qc_verification_notes = COALESCE($14, qc_verification_notes),
      initial_effort = COALESCE($15, initial_effort),
      remaining_effort = COALESCE($16, remaining_effort),
      cc = COALESCE($17, cc),
      last_sync_at = NOW(),
      sync_status = 'synced',
      last_sync_attempted_at = NOW(),
      last_sync_error = NULL,
      updated_at = NOW(),
      deleted_at = NULL,
      pending_links = '[]'::jsonb,
      raw_tuleap_payload = COALESCE($18, raw_tuleap_payload)
    WHERE id = $19
    RETURNING *`,
    [
      common.title || null,
      common.description || null,
      common.status ? normalizeBugStatus(common.status) : null,
      fields.severity ? normalizeBugSeverity(fields.severity) : null,
      common.priority || null,
      fields.bug_type || null,
      fields.component || null,
      common.assigned_to || null,
      linkedTestCaseIds.length > 0 ? linkedTestCaseIds : null,
      source,
      fields.environment || null,
      fields.service_name || null,
      fields.dev_fix_description || null,
      fields.qc_verification_notes || null,
      fields.initial_effort != null ? fields.initial_effort : null,
      fields.remaining_effort != null ? fields.remaining_effort : null,
      Array.isArray(fields.cc) ? fields.cc : (fields.cc ? [fields.cc] : null),
      unified.raw_payload ? JSON.stringify(unified.raw_payload) : null,
      bugId,
    ]
  );
}

module.exports = { dispatchAction };

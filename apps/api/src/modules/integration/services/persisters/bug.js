const { resolveLinks, drainPending } = require('../tuleapLinkResolver');
const { UnifiedPayloadSchema } = require('../../../../schemas/tuleapUnified');

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
  const qcProjectId = unified.project_id || config.qc_project_id;

  const links = unified.common?.links || [];
  const { resolved, pending } = await resolveLinks({
    qcProjectId,
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
const result = await updateBug(row.id, unified, config, qcProjectId, source, resolvedTestCases, query);
      return { action: 'revived', id: row.id, data: result.rows[0] };
    }

    if (skipUpdate) {
      return { action: 'skipped', id: row.id };
    }

    const result = await updateBug(row.id, unified, config, qcProjectId, source, resolvedTestCases, query);
    return { action: 'updated', id: row.id, data: result.rows[0] };
  }

  return createBug(unified, config, qcProjectId, source, resolvedTestCases, pending, tuleapArtifactId, tuleapUrl, query);
}

async function createBug(unified, config, qcProjectId, source, resolvedTestCases, pending, tuleapArtifactId, tuleapUrl, query) {
  const common = unified.common || {};
  const fields = unified.fields || {};

  const title = common.title || '';
  const description = common.description || '';
  const status = common.status || 'Open';
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

  const result = await query(
    `INSERT INTO bugs (
      tuleap_artifact_id, tuleap_tracker_id, tuleap_url, bug_id, title, description,
      status, severity, priority, bug_type, component, project_id,
      assigned_to, reported_by,
      reported_date, last_sync_at, raw_tuleap_payload, source,
      owner_resource_id, pending_links, environment, service_name
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),$16,$17,$18,$19,$20,$21)
    RETURNING *`,
    [
      tuleapArtifactId,
      config.tuleap_tracker_id,
      tuleapUrl,
      `TLP-${tuleapArtifactId}`,
      title,
      description,
      status,
      fields.severity || 'medium',
      priority,
      fields.bug_type || null,
      fields.component || null,
qcProjectId,
      assignedTo,
      unified.reported_by || null,
      unified.reported_date || null,
      JSON.stringify(unified.raw_payload || unified),
      source,
      ownerResourceId,
      JSON.stringify(pending),
      fields.environment || null,
      fields.service_name || null,
    ]
  );

  const bugId = result.rows[0].id;

  if (resolvedTestCases.length > 0) {
    for (const tc of resolvedTestCases) {
      await query(
        `INSERT INTO bug_test_cases (bug_id, test_case_id, source, relationship_type)
         VALUES ($1, $2, 'tuleap', 'reveals')
         ON CONFLICT (bug_id, test_case_id) DO NOTHING`,
        [bugId, tc.qc_id]
      );
    }
    await drainPending({
      qcProjectId,
      justPersistedQcId: bugId,
      justPersistedQcType: 'bug',
      justPersistedTuleapId: tuleapArtifactId,
      query,
    });
  }

  return { action: 'created', id: bugId, data: result.rows[0] };
}

async function updateBug(bugId, unified, config, qcProjectId, source, resolvedTestCases, query) {
  const common = unified.common || {};
  const fields = unified.fields || {};

  const result = await query(
    `UPDATE bugs SET
      title = COALESCE($1, title),
      description = COALESCE($2, description),
      status = COALESCE($3, status),
      severity = COALESCE($4, severity),
      priority = COALESCE($5, priority),
      bug_type = COALESCE($6, bug_type),
      component = COALESCE($7, component),
      assigned_to = COALESCE($8, assigned_to),
      source = $9,
      environment = COALESCE($10, environment),
      service_name = COALESCE($11, service_name),
      last_sync_at = NOW(),
      updated_at = NOW(),
      deleted_at = NULL,
      pending_links = '[]'::jsonb,
      raw_tuleap_payload = COALESCE($12, raw_tuleap_payload)
    WHERE id = $13
    RETURNING *`,
    [
      common.title || null,
      common.description || null,
      common.status || null,
      fields.severity || null,
      common.priority || null,
      fields.bug_type || null,
      fields.component || null,
      common.assigned_to || null,
      source,
      fields.environment || null,
      fields.service_name || null,
      unified.raw_payload ? JSON.stringify(unified.raw_payload) : null,
      bugId,
    ]
  );

  if (resolvedTestCases.length > 0) {
    await query(`DELETE FROM bug_test_cases WHERE bug_id = $1 AND source = 'tuleap'`, [bugId]);
    for (const tc of resolvedTestCases) {
      await query(
        `INSERT INTO bug_test_cases (bug_id, test_case_id, source, relationship_type)
         VALUES ($1, $2, 'tuleap', 'reveals')
         ON CONFLICT (bug_id, test_case_id) DO NOTHING`,
        [bugId, tc.qc_id]
      );
    }
  } else {
    await query(`DELETE FROM bug_test_cases WHERE bug_id = $1 AND source = 'tuleap'`, [bugId]);
  }

  return result;
}

module.exports = { dispatchAction };

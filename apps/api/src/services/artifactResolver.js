'use strict';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Canonical type -> how to resolve its public id to the internal UUID.
// humanColumn === null means "resolve via tuleap_artifact_id" (user_story has no human-id column).
const ARTIFACT_ID_CONFIG = {
  bug:        { table: 'bugs',         humanColumn: 'bug_id',       prefix: 'TLP-' },
  user_story: { table: 'user_stories', humanColumn: null,           prefix: 'US-'  },
  task:       { table: 'tasks',        humanColumn: 'task_id',      prefix: 'TSK-' },
  test_case:  { table: 'test_case',    humanColumn: 'test_case_id', prefix: 'TC-'  },
  test_run:   { table: 'test_runs',    humanColumn: 'run_id',       prefix: 'RUN-' },
  test_suite: { table: 'test_suites',  humanColumn: 'suite_id',     prefix: 'TS-'  },
};

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function resolveArtifactUuid(type, idParam, query) {
  const config = ARTIFACT_ID_CONFIG[type];
  if (!config) throw httpError(400, `Unknown artifact type '${type}'`);

  const value = String(idParam || '').trim();
  if (UUID_RE.test(value)) return value;
  if (!value) throw httpError(400, 'Missing artifact id');

  // user_story has no human-id column: resolve via tuleap_artifact_id (accept "US-123" or bare "123").
  if (config.humanColumn === null) {
    const numeric = value.replace(new RegExp(`^${config.prefix}`, 'i'), '');
    if (!/^\d+$/.test(numeric)) throw httpError(404, `${type} not found`);
    const result = await query(
      `SELECT id FROM ${config.table} WHERE tuleap_artifact_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [parseInt(numeric, 10)]
    );
    if (result.rows.length === 0) throw httpError(404, `${type} not found`);
    return result.rows[0].id;
  }

  const result = await query(
    `SELECT id FROM ${config.table} WHERE ${config.humanColumn} = $1 AND deleted_at IS NULL LIMIT 1`,
    [value]
  );
  if (result.rows.length === 0) throw httpError(404, `${type} not found`);
  return result.rows[0].id;
}

module.exports = { resolveArtifactUuid, ARTIFACT_ID_CONFIG, UUID_RE };

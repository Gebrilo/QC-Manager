'use strict';

const db = require('../config/db');
const { resolveArtifactUuid, ARTIFACT_ID_CONFIG } = require('../services/artifactResolver');

// Relaxed UUID pattern: accepts any 8-4-4-4-12 hex string regardless of
// RFC 4122 version/variant bits. Used so that test fixtures that use
// non-standard UUIDs (e.g. 'aaaaaaaa-0000-0000-0000-000000000001') still
// pass through without hitting the DB.
const UUID_LOOSE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Lazy DB query wrapper: only called when the resolver actually needs the DB
// (i.e. when the value is a human-readable id, not a UUID).
function dbQuery(...args) {
  return db.query(...args);
}

// Express param middleware: rewrites req.params.id (human id OR UUID) to the UUID.
// Resolution only happens when the value looks like a human-readable id:
//   - For most types: matches PREFIX followed by digits only (e.g. TSK-001, RUN-0004).
//   - For user_story: bare numeric or starts with "US-" + digits (tuleap_artifact_id).
//   - A loose UUID passes through unchanged (fast-path 1).
//   - Anything else returns 404 immediately to avoid PostgreSQL "invalid input
//     syntax for type uuid" errors when a non-UUID value reaches a uuid-typed column.
function resolveArtifactParam(type) {
  const config = ARTIFACT_ID_CONFIG[type];

  function looksLikeHumanId(value) {
    if (!config) return false;
    if (config.humanColumn === null) {
      // user_story: bare digits or US-<digits> (case-insensitive prefix)
      return /^\d+$/.test(value) || new RegExp(`^${config.prefix}\\d+$`, 'i').test(value);
    }
    // Standard prefix + digits only (e.g. TSK-001, BUG-042, RUN-0007, TC-003, TS-001).
    // Prefix match is CASE-SENSITIVE (uppercase) so that test fixtures like 'tc-1', 'run-1'
    // are not mistaken for human IDs and are passed through to the handler unchanged.
    return new RegExp(`^${config.prefix}\\d+$`).test(value);
  }

  return async function (req, res, next, value) {
    // Fast-path 1: value is already a UUID (strict RFC 4122 or loose hex format).
    if (UUID_LOOSE_RE.test(value)) {
      next();
      return;
    }
    // Fast-path 2: value does not look like a human-readable id for this type.
    // Return 404 immediately — passing a non-UUID string to a uuid-typed column
    // would cause PostgreSQL to throw "invalid input syntax for type uuid" (500).
    if (!looksLikeHumanId(value)) {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }
    try {
      req.params.id = await resolveArtifactUuid(type, value, dbQuery);
      next();
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ success: false, error: err.message });
    }
  };
}

module.exports = { resolveArtifactParam };

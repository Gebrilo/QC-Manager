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
//   - For most types: matches PREFIX + human-id charset [A-Z0-9-] (e.g. TSK-001, TSK-DIAG-001).
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
    // Generic human-id shape: an UPPERCASE prefix segment, a dash, then the
    // human-id charset (e.g. TLP-1, BUG-MQNNSVRS, TSK-DIAG-001, TC-00001, RUN-7).
    //
    // This is deliberately prefix-AGNOSTIC rather than keyed to one prefix per
    // type, because several artifacts carry more than one live prefix family
    // from different sources: bugs are 'TLP-' (Tuleap sync) OR 'BUG-' (QC-native
    // creation, bugs.js); test runs are 'RUN-' (created) OR 'TR-' (Excel import).
    // A single-prefix gate 404'd every BUG-*/TR-* artifact even though the row
    // exists. The actual resolution still queries the TEXT humanColumn, so a
    // wrong-shaped or wrong-prefix value simply returns 404 (never a uuid-cast
    // 500). The gate stays CASE-SENSITIVE (uppercase start) so lowercase test
    // fixtures like 'tc-1'/'run-1' and junk like 'garbage' 404 without a DB hit.
    return /^[A-Z][A-Z0-9]*-[A-Z0-9-]+$/.test(value);
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

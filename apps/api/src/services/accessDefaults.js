'use strict';

// Shared helpers for applying Access Engine defaults during artifact inserts.
// Slice 2 of issue #81 — engine remains dormant on reads; these helpers only
// populate ownership/visibility columns and materialize default ACL grants.

const { defaultsFor } = require('../access/ArtifactVisibilityDefaulter');

async function resolveTuleapCreator({ tuleapUsername, query }) {
    if (!tuleapUsername || !query) return null;
    const res = await query(
        `SELECT user_id FROM resources
         WHERE tuleap_username = $1 AND user_id IS NOT NULL AND deleted_at IS NULL
         LIMIT 1`,
        [tuleapUsername]
    );
    return res.rows[0]?.user_id || null;
}

async function resolveEmailCreator({ email, query }) {
    if (!email || !query) return null;
    const res = await query(
        `SELECT id FROM app_user WHERE LOWER(email) = LOWER($1) LIMIT 1`,
        [email]
    );
    return res.rows[0]?.id || null;
}

// Build the access-default fields for a new artifact.
//   - For Tuleap-synced artifacts, pass `tuleapConfig` (the tuleap_sync_config row).
//   - For human-created artifacts, pass `creator` ({ id }).
// Returns { owner_team_id, visibility_scope, default_acl_grants }.
async function buildAccessDefaults({ tuleapConfig, creator, artifactType, query }) {
    if (tuleapConfig) {
        return defaultsFor({
            tuleapDefaults: {
                default_owner_team_id: tuleapConfig.default_owner_team_id || null,
                default_visibility_scope: tuleapConfig.default_visibility_scope || null,
            },
            artifactType,
            query,
        });
    }
    return defaultsFor({
        creator: creator || { id: null },
        artifactType,
        query,
    });
}

// Materialize default_acl_grants into artifact_access rows. Uses ON CONFLICT
// DO NOTHING to stay idempotent (re-runs / revival paths shouldn't double-insert).
async function materializeAclGrants({ artifactType, artifactId, grants, grantedBy, query }) {
    if (!Array.isArray(grants) || grants.length === 0 || !artifactId) return 0;
    let inserted = 0;
    for (const grant of grants) {
        if (!grant || !grant.role || !grant.action) continue;
        const res = await query(
            `INSERT INTO artifact_access
                (artifact_type, artifact_id, subject_type, subject_id, action, granted_by)
             VALUES ($1, $2, 'role', $3, $4, $5)
             ON CONFLICT (artifact_type, artifact_id, subject_type, subject_id, action) DO NOTHING
             RETURNING id`,
            [artifactType, artifactId, grant.role, grant.action, grantedBy || null]
        );
        if (res.rows.length > 0) inserted += 1;
    }
    return inserted;
}

module.exports = {
    resolveTuleapCreator,
    resolveEmailCreator,
    buildAccessDefaults,
    materializeAclGrants,
};

'use strict';

const db = require('../../config/db');

// entity_type → function(entityId) → frontend href. Later slices add entries.
// test_execution is a child of test_run, so its link is built dynamically
// by resolving the test_run_id via DB lookup.
const STATIC_LINK_BUILDERS = {
    project: id => `/work/projects/${id}`,
    resource: id => `/team/resources/${id}`,
    user: id => `/admin/users?focus=${id}`,
    team: id => `/admin/teams?focus=${id}`,
    tuleap_sync: () => '/admin/integrations',
};

async function buildTestRunLinkForExecution(executionId) {
    const r = await db.query(
        `SELECT tr.run_id, tr.id AS test_run_uuid
         FROM test_execution te
         JOIN test_run tr ON tr.id = te.test_run_id
         WHERE te.id = $1 AND tr.deleted_at IS NULL`,
        [executionId]
    );
    if (!r.rows[0]) return null;
    const pub = r.rows[0].run_id || r.rows[0].test_run_uuid;
    return `/test/runs/${pub}`;
}

async function buildLink(entityType, entityId) {
    if (entityType === 'test_execution') {
        return buildTestRunLinkForExecution(entityId);
    }

    // Artifact types: look up the human id, fall back to UUID.
    if (entityType === 'bug') {
        const r = await db.query(
            `SELECT bug_id FROM bugs WHERE id = $1 AND deleted_at IS NULL`, [entityId]);
        const pub = r.rows[0]?.bug_id || entityId;
        return `/work/bugs/${pub}`;
    }
    if (entityType === 'task') {
        const r = await db.query(
            `SELECT task_id FROM tasks WHERE id = $1 AND deleted_at IS NULL`, [entityId]);
        const pub = r.rows[0]?.task_id || entityId;
        return `/work/tasks/${pub}`;
    }
    if (entityType === 'user_story') {
        // user_stories has no human-id column; the public id is US-<tuleap_artifact_id>
        // (same derivation as access/artifactLoaders.js and search.js).
        const r = await db.query(
            `SELECT tuleap_artifact_id, id::text AS uuid
             FROM user_stories WHERE id = $1 AND deleted_at IS NULL`, [entityId]);
        const row = r.rows[0];
        if (!row) return `/work/stories/${entityId}`;
        const pub = (row.tuleap_artifact_id ? `US-${row.tuleap_artifact_id}` : null)
            || row.uuid;
        return `/work/stories/${pub}`;
    }
    if (entityType === 'test_case') {
        const r = await db.query(
            `SELECT test_case_id FROM test_case WHERE id = $1 AND deleted_at IS NULL`, [entityId]);
        const pub = r.rows[0]?.test_case_id || entityId;
        return `/test/cases/${pub}`;
    }
    if (entityType === 'test_suite') {
        const r = await db.query(
            `SELECT suite_id FROM test_suites WHERE id = $1 AND deleted_at IS NULL`, [entityId]);
        const pub = r.rows[0]?.suite_id || entityId;
        return `/test/suites/${pub}`;
    }
    if (entityType === 'test_run') {
        const r = await db.query(
            `SELECT run_id FROM test_run WHERE id = $1 AND deleted_at IS NULL`, [entityId]);
        const pub = r.rows[0]?.run_id || entityId;
        return `/test/runs/${pub}`;
    }

    const fn = STATIC_LINK_BUILDERS[entityType];
    return fn ? fn(entityId) : null;
}

module.exports = { buildLink, STATIC_LINK_BUILDERS };

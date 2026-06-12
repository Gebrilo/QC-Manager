'use strict';

const db = require('../../config/db');

// entity_type → function(entityId) → frontend href. Later slices add entries.
// test_execution is a child of test_run, so its link is built dynamically
// by resolving the test_run_id via DB lookup.
const STATIC_LINK_BUILDERS = {
    task: id => `/work/tasks/${id}`,
    bug: id => `/work/bugs/${id}`,
    user_story: id => `/work/stories/${id}`,
    test_case: id => `/test/cases/${id}`,
    test_suite: id => `/test/suites/${id}`,
    project: id => `/work/projects/${id}`,
    resource: id => `/team/resources/${id}`,
    user: id => `/admin/users?focus=${id}`,
    team: id => `/admin/teams?focus=${id}`,
};

async function buildTestRunLinkForExecution(executionId) {
    const r = await db.query('SELECT test_run_id FROM test_execution WHERE id = $1', [executionId]);
    if (!r.rows[0] || !r.rows[0].test_run_id) return null;
    return `/test/runs/${r.rows[0].test_run_id}`;
}

async function buildLink(entityType, entityId) {
    if (entityType === 'test_execution') {
        return buildTestRunLinkForExecution(entityId);
    }
    const fn = STATIC_LINK_BUILDERS[entityType];
    return fn ? fn(entityId) : null;
}

module.exports = { buildLink, STATIC_LINK_BUILDERS };

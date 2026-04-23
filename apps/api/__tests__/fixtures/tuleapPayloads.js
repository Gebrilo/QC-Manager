/**
 * Shared test fixtures for Tuleap webhook tests.
 * Contains sample payloads matching the Tuleap artifact JSON structure.
 */

/**
 * Sample Tuleap task artifact payload (JSON format)
 * Used by the tuleap_task_sync.json n8n workflow
 */
const sampleTaskPayload = {
    action: 'update',
    user: {
        display_name: 'John Doe',
        username: 'jdoe',
        email: 'jdoe@example.com'
    },
    current: {
        id: 12345,
        tracker: { id: 101 },
        submitted_on: '2026-01-15T08:00:00+00:00',
        last_update_date: '2026-03-01T10:30:00+00:00',
        values: [
            { field_id: 201, type: 'string', value: 'Implement login page' },
            { field_id: 202, type: 'text', value: 'Create a responsive login page with OAuth support' },
            { field_id: 203, type: 'sb', values: [{ label: 'In Progress' }] },
            { field_id: 204, type: 'sb', values: [{ display_name: 'John Doe', username: 'jdoe' }] },
            { field_id: 205, type: 'date', value: '2026-03-15' },
            { field_id: 206, type: 'aid', value: 12345 },
            { field_id: 207, type: 'computed', value: 16 }
        ]
    }
};

/**
 * Sample Tuleap bug artifact payload
 * Used by the tuleap_bug_sync.json n8n workflow
 */
const sampleBugPayload = {
    action: 'update',
    user: {
        display_name: 'Jane Smith',
        username: 'jsmith'
    },
    current: {
        id: 67890,
        tracker: { id: 102 },
        submitted_on: '2026-02-20T14:00:00+00:00',
        last_update_date: '2026-03-01T16:00:00+00:00',
        values: [
            { field_id: 301, type: 'string', value: 'Button click does not submit form' },
            { field_id: 302, type: 'text', value: 'When clicking the submit button on the login page, nothing happens' },
            { field_id: 303, type: 'sb', values: [{ label: 'New' }] },
            { field_id: 304, type: 'sb', values: [{ label: 'Critical' }] },
            { field_id: 305, type: 'sb', values: [{ label: 'High' }] },
            { field_id: 306, type: 'sb', values: [{ label: 'UI Defect' }] },
            { field_id: 307, type: 'sb', values: [{ label: 'Frontend' }] },
            { field_id: 308, type: 'sb', values: [{ display_name: 'Bob Builder', username: 'bbuilder' }] }
        ]
    }
};

/**
 * Processed task data — what n8n sends to POST /tuleap-webhook/task
 * after the tuleap_task_sync.json workflow transforms the raw payload
 */
const processedTaskData = {
    tuleap_artifact_id: 12345,
    tuleap_url: 'https://tuleap.example.com/plugins/tracker/?aid=12345',
    task_name: 'Implement login page',
    notes: 'Create a responsive login page with OAuth support',
    tuleap_status: 'In Progress',  // Tuleap status label — mapped to QC status by the webhook handler
    resource1_id: null,
    project_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    assignee_name: 'John Doe',
    raw_tuleap_payload: sampleTaskPayload
};

/**
 * Processed bug data — what n8n sends to POST /tuleap-webhook/bug
 */
const processedBugData = {
    tuleap_artifact_id: 67890,
    tuleap_tracker_id: 102,
    tuleap_url: 'https://tuleap.example.com/plugins/tracker/?aid=67890',
    bug_id: 'TLP-67890',
    title: 'Button click does not submit form',
    description: 'When clicking the submit button on the login page, nothing happens',
    status: 'Open',
    severity: 'critical',
    priority: 'high',
    bug_type: 'UI Defect',
    component: 'Frontend',
    project_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    reported_by: 'Jane Smith',
    updated_by: 'Jane Smith',
    assigned_to: 'Bob Builder',
    reported_date: '2026-02-20T14:00:00+00:00',
    raw_tuleap_payload: sampleBugPayload
};

/**
 * Sample sync config for task tracker
 */
const sampleSyncConfig = {
    id: '11111111-2222-3333-4444-555555555555',
    tuleap_project_id: 42,
    tuleap_tracker_id: 101,
    tuleap_base_url: 'https://tuleap.example.com',
    tracker_type: 'task',
    qc_project_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    field_mappings: {
        title_field_id: '201',
        description_field_id: '202',
        assigned_to_field_id: '204'
    },
    status_mappings: {},
    is_active: true
};

/**
 * Sample resource matching an assignee
 */
const sampleResource = {
    id: 'ffffffff-eeee-dddd-cccc-bbbbbbbbbbbb',
    resource_name: 'John Doe',
    email: 'jdoe@example.com'
};

/**
 * Processed user story data — shape sent by n8n to POST /tuleap-webhook/user-story
 */
const processedUserStoryData = {
  tuleap_artifact_id: 5001,
  tuleap_tracker_id:  6,
  title:              'As a user I can log in with SSO',
  description:        '## Overview\nAllow users to authenticate via SSO.',
  acceptance_criteria:'## AC\n- Given a valid SSO token, the user is logged in.',
  status:             'Draft',
  requirement_version:'1',
  priority:           'P2-High',
  ba_author:          'BA-Team',
  project_id:         null,
  raw_tuleap_payload: { id: 5001, tracker: { id: 6 } },
};

module.exports = {
    sampleTaskPayload,
    sampleBugPayload,
    processedTaskData,
    processedBugData,
    sampleSyncConfig,
    sampleResource,
    processedUserStoryData
};

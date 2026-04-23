/**
 * Integration tests for unified Tuleap webhook flow (end-to-end)
 * Verifies: config lookup → field mapping → unified payload
 */

const mockQuery = jest.fn();
const mockAuditLog = jest.fn().mockResolvedValue(undefined);

jest.mock('../src/config/db', () => ({
    pool: { query: mockQuery },
}));
jest.mock('../src/middleware/audit', () => ({
    auditLog: mockAuditLog,
}));

const express = require('express');
const tuleapRouter = require('../src/routes/tuleapWebhook');
const request = require('supertest');

const app = express();
app.use(express.json());
app.use('/tuleap-webhook', tuleapRouter);

beforeEach(() => {
    mockQuery.mockReset();
    mockAuditLog.mockReset();
});

// ── Test Data ───────────────────────────────────────────────

const bugConfig = {
    id: 'cfg-1',
    tuleap_project_id: 101,
    tuleap_tracker_id: 1,
    tracker_type: 'bug',
    qc_project_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    tuleap_base_url: 'https://tuleap.windinfosys.com',
    artifact_fields: {
        bug_title: 'title',
        steps_to_reproduce: 'description',
        severity: 'severity',
        status: 'status',
        environment: 'environment',
        service_name: 'service_name',
    },
    status_value_map: {
        'New': 'Open',
        'In Progress': 'In Progress',
        'Fixed': 'Resolved',
    },
    is_active: true,
};

// Payload uses `values` array (with label object) so the route extractor
// can read select-box fields the same way the real Tuleap API returns them.
const artifactPayload = {
    tracker_id: 1,
    project_id: 101,
    action: 'update',
    artifact: {
        id: 140,
        uri: 'https://tuleap.windinfosys.com/plugins/tracker/?aid=140',
        values: [
            { field_name: 'bug_title', value: 'Login crashes on mobile' },
            { field_name: 'severity', values: [{ id: 303, label: 'Major impact' }] },
            { field_name: 'status', values: [{ id: 103, label: 'New' }] },
            { field_name: 'steps_to_reproduce', value: '1. Open login page\n2. Click submit' },
            { field_name: 'environment', values: [{ id: 203, label: 'DEV' }] },
        ],
    },
};

// ── Tests ───────────────────────────────────────────────────

describe('POST /tuleap-webhook/unified', () => {

    test('bug webhook through unified route → config lookup → field mapping → unified payload', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [bugConfig] })   // tracker lookup
            .mockResolvedValueOnce({ rows: [] });            // webhook log insert (ON CONFLICT)

        const res = await request(app)
            .post('/tuleap-webhook/unified')
            .send(artifactPayload);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.artifact_type).toBe('bug');
        expect(res.body.unified.common.title).toBe('Login crashes on mobile');
        // status mapped via status_value_map: 'New' → 'Open'
        expect(res.body.unified.common.status).toBe('Open');
        expect(res.body.unified.fields.severity).toBe('Major impact');
        expect(res.body.unified.fields.environment).toBe('DEV');
    });

    test('404 for unconfigured tracker', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [] })  // tracker lookup: empty
            .mockResolvedValueOnce({ rows: [] }); // project fallback: empty

        const res = await request(app)
            .post('/tuleap-webhook/unified')
            .send({
                tracker_id: 999,
                project_id: 999,
                action: 'update',
                artifact: { id: 123, values: [] },
            });

        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toContain('No sync config found');
    });

    test('project-level fallback when tracker has no direct match', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [] })           // tracker lookup: empty
            .mockResolvedValueOnce({ rows: [bugConfig] })  // project fallback: found
            .mockResolvedValueOnce({ rows: [] });          // webhook log insert

        const res = await request(app)
            .post('/tuleap-webhook/unified')
            .send({
                tracker_id: 999,
                project: { id: 101 },
                artifact: { id: 140, values: [] },
                action: 'update',
            });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.artifact_type).toBe('bug');
    });
});

describe('Config CRUD', () => {

    test('POST /config creates a config with artifact_fields and status_value_map', async () => {
        const newConfig = {
            ...bugConfig,
            id: 'cfg-new-1',
            created_at: new Date().toISOString(),
        };

        mockQuery.mockResolvedValueOnce({ rows: [newConfig] });

        const res = await request(app)
            .post('/tuleap-webhook/config')
            .send({
                tuleap_project_id: 101,
                tuleap_tracker_id: 1,
                tracker_type: 'bug',
                qc_project_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
                tuleap_base_url: 'https://tuleap.windinfosys.com',
                artifact_fields: bugConfig.artifact_fields,
                status_value_map: bugConfig.status_value_map,
                is_active: true,
            });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.artifact_fields).toEqual(bugConfig.artifact_fields);
        expect(res.body.data.status_value_map).toEqual(bugConfig.status_value_map);
        expect(res.body.data.tracker_type).toBe('bug');
    });

    test('PUT /config/:id updates artifact_fields', async () => {
        const updatedConfig = {
            ...bugConfig,
            artifact_fields: {
                ...bugConfig.artifact_fields,
                bug_title: 'summary',
            },
        };

        mockQuery.mockResolvedValueOnce({ rows: [updatedConfig] });

        const res = await request(app)
            .put('/tuleap-webhook/config/cfg-1')
            .send({
                artifact_fields: {
                    ...bugConfig.artifact_fields,
                    bug_title: 'summary',
                },
            });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.artifact_fields.bug_title).toBe('summary');
    });

    test('DELETE /config/:id soft-deletes by setting is_active = false', async () => {
        const deletedConfig = {
            ...bugConfig,
            is_active: false,
        };

        mockQuery.mockResolvedValueOnce({ rows: [deletedConfig] });

        const res = await request(app)
            .delete('/tuleap-webhook/config/cfg-1');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.is_active).toBe(false);
    });
});

describe('GET /tuleap-webhook/config', () => {

    test('returns configs with artifact_fields and status_value_map', async () => {
        const configs = [
            {
                ...bugConfig,
                qc_project_name: 'Test Project',
            },
        ];

        mockQuery.mockResolvedValueOnce({ rows: configs });

        const res = await request(app)
            .get('/tuleap-webhook/config');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.count).toBe(1);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].artifact_fields).toEqual(bugConfig.artifact_fields);
        expect(res.body.data[0].status_value_map).toEqual(bugConfig.status_value_map);
        expect(res.body.data[0].qc_project_name).toBe('Test Project');
    });
});

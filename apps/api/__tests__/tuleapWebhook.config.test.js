/**
 * Jest tests for config and resource endpoints
 * Tests: T031–T034 (US5 — Config Management)
 */

const { sampleSyncConfig, sampleResource } = require('./fixtures/tuleapPayloads');

const mockQuery = jest.fn();
const mockAuditLog = jest.fn().mockResolvedValue(undefined);

jest.mock('../src/config/db', () => ({
    pool: { query: mockQuery }
}));
jest.mock('../src/middleware/audit', () => ({
    auditLog: mockAuditLog
}));

const express = require('express');
const tuleapRouter = require('../src/routes/tuleapWebhook');

const app = express();
app.use(express.json());
app.use('/tuleap-webhook', tuleapRouter);

beforeEach(() => {
    mockQuery.mockReset();
    mockAuditLog.mockReset();
});

describe('POST /tuleap-webhook/config', () => {

    // T031: Create sync config
    test('T031: creates sync config and returns valid data', async () => {
        const configPayload = {
            tuleap_project_id: 42,
            tuleap_tracker_id: 101,
            tuleap_base_url: 'https://tuleap.example.com',
            tracker_type: 'task',
            qc_project_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            field_mappings: { title_field_id: '201' },
            is_active: true
        };

        mockQuery.mockResolvedValueOnce({
            rows: [{ ...sampleSyncConfig, ...configPayload }]
        });

        const mockReq = { body: configPayload };
        const mockRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json: jest.fn()
        };

        const routeLayer = tuleapRouter.stack.find(
            layer => layer.route && layer.route.path === '/config' && layer.route.methods.post
        );
        expect(routeLayer).toBeDefined();

        await routeLayer.route.stack[0].handle(mockReq, mockRes, jest.fn());

        const response = mockRes.json.mock.calls[0][0];
        expect(response.success).toBe(true);
        expect(response.data.tuleap_project_id).toBe(42);
        expect(response.data.tracker_type).toBe('task');
    });

    // T032: Upsert sync config
    test('T032: upserts config with same project/tracker pair', async () => {
        const configPayload = {
            tuleap_project_id: 42,
            tuleap_tracker_id: 101,
            tuleap_base_url: 'https://tuleap-updated.example.com',
            tracker_type: 'task',
            qc_project_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            field_mappings: { title_field_id: '201', description_field_id: '202' },
            is_active: true
        };

        mockQuery.mockResolvedValueOnce({
            rows: [{ ...sampleSyncConfig, ...configPayload }]
        });

        const mockReq = { body: configPayload };
        const mockRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json: jest.fn()
        };

        const routeLayer = tuleapRouter.stack.find(
            layer => layer.route && layer.route.path === '/config' && layer.route.methods.post
        );
        await routeLayer.route.stack[0].handle(mockReq, mockRes, jest.fn());

        const response = mockRes.json.mock.calls[0][0];
        expect(response.success).toBe(true);
        // Verify the INSERT ... ON CONFLICT was called (upsert)
        expect(mockQuery).toHaveBeenCalledTimes(1);
        const queryCall = mockQuery.mock.calls[0][0];
        expect(queryCall).toContain('ON CONFLICT');
    });

    // T033: Missing required fields
    test('T033: returns 400 when required fields missing', async () => {
        const configPayload = {
            // Missing tuleap_project_id, tuleap_tracker_id, tracker_type
            tuleap_base_url: 'https://tuleap.example.com'
        };

        const mockReq = { body: configPayload };
        const mockRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json: jest.fn()
        };

        const routeLayer = tuleapRouter.stack.find(
            layer => layer.route && layer.route.path === '/config' && layer.route.methods.post
        );
        await routeLayer.route.stack[0].handle(mockReq, mockRes, jest.fn());

        expect(mockRes.statusCode).toBe(400);
        const response = mockRes.json.mock.calls[0][0];
        expect(response.success).toBe(false);
    });
});

describe('GET /tuleap-webhook/resources', () => {

    // T034: Resource lookup by name
    test('T034: returns resource when name matches', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [sampleResource]
        });

        const mockReq = { query: { name: 'John Doe' } };
        const mockRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json: jest.fn()
        };

        const routeLayer = tuleapRouter.stack.find(
            layer => layer.route && layer.route.path === '/resources' && layer.route.methods.get
        );
        expect(routeLayer).toBeDefined();

        await routeLayer.route.stack[0].handle(mockReq, mockRes, jest.fn());

        const response = mockRes.json.mock.calls[0][0];
        expect(response.success).toBe(true);
        expect(response.count).toBe(1);
        expect(response.data[0].resource_name).toBe('John Doe');
    });

    test('T034b: returns empty when no resource matches', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: []
        });

        const mockReq = { query: { name: 'Unknown Person' } };
        const mockRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json: jest.fn()
        };

        const routeLayer = tuleapRouter.stack.find(
            layer => layer.route && layer.route.path === '/resources' && layer.route.methods.get
        );
        await routeLayer.route.stack[0].handle(mockReq, mockRes, jest.fn());

        const response = mockRes.json.mock.calls[0][0];
        expect(response.success).toBe(true);
        expect(response.count).toBe(0);
        expect(response.data).toEqual([]);
    });
});

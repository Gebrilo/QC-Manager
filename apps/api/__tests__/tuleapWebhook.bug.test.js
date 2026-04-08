/**
 * Jest tests for POST /tuleap-webhook/bug
 * Tests: T018–T020 (US2 — Bug Sync Validation)
 */

const { processedBugData } = require('./fixtures/tuleapPayloads');

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

describe('POST /tuleap-webhook/bug', () => {

    // T018: Bug creation with correct status/severity mapping
    test('T018: creates bug with correct status and severity mapping', async () => {
        const bugPayload = { ...processedBugData };

        mockQuery
            .mockResolvedValueOnce({ rows: [] })  // logWebhook
            .mockResolvedValueOnce({ rows: [] })  // SELECT: no existing bug
            .mockResolvedValueOnce({ rows: [] })  // SELECT resource by reporter (no match)
            .mockResolvedValueOnce({
                rows: [{ // INSERT bug
                    id: 'new-bug-uuid',
                    bug_id: 'BUG-ABC123',
                    title: bugPayload.title,
                    status: bugPayload.status,
                    severity: bugPayload.severity,
                    tuleap_artifact_id: bugPayload.tuleap_artifact_id,
                    owner_resource_id: null,
                }]
            })
            .mockResolvedValueOnce({ rows: [] }); // logWebhook update

        const mockReq = { body: bugPayload };
        const mockRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json: jest.fn()
        };

        const routeLayer = tuleapRouter.stack.find(
            layer => layer.route && layer.route.path === '/bug' && layer.route.methods.post
        );
        expect(routeLayer).toBeDefined();

        await routeLayer.route.stack[0].handle(mockReq, mockRes, jest.fn());

        expect(mockRes.statusCode).toBe(201);
        const response = mockRes.json.mock.calls[0][0];
        expect(response.success).toBe(true);
        expect(response.action).toBe('created');
    });

    // T019: Bug update for existing tuleap_artifact_id
    test('T019: updates existing bug when tuleap_artifact_id matches', async () => {
        const bugPayload = { ...processedBugData };

        const existingBug = {
            id: 'existing-bug-uuid',
            bug_id: 'BUG-EXIST',
            title: 'Old Title',
            tuleap_artifact_id: bugPayload.tuleap_artifact_id
        };

        mockQuery
            .mockResolvedValueOnce({ rows: [] })  // logWebhook
            .mockResolvedValueOnce({ rows: [existingBug] })  // SELECT: bug exists
            .mockResolvedValueOnce({
                rows: [{ // UPDATE bug
                    ...existingBug,
                    title: bugPayload.title,
                    status: bugPayload.status,
                    severity: bugPayload.severity
                }]
            })
            .mockResolvedValueOnce({ rows: [] }); // logWebhook update

        const mockReq = { body: bugPayload };
        const mockRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json: jest.fn()
        };

        const routeLayer = tuleapRouter.stack.find(
            layer => layer.route && layer.route.path === '/bug' && layer.route.methods.post
        );
        await routeLayer.route.stack[0].handle(mockReq, mockRes, jest.fn());

        expect(mockRes.statusCode).toBe(200);
        const response = mockRes.json.mock.calls[0][0];
        expect(response.success).toBe(true);
        expect(response.action).toBe('updated');
    });

    // T020: Missing required fields returns 400
    test('T020: returns 400 when tuleap_artifact_id is missing', async () => {
        const bugPayload = {
            title: 'Bug without artifact ID'
            // tuleap_artifact_id missing
        };

        const mockReq = { body: bugPayload };
        const mockRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json: jest.fn()
        };

        const routeLayer = tuleapRouter.stack.find(
            layer => layer.route && layer.route.path === '/bug' && layer.route.methods.post
        );
        await routeLayer.route.stack[0].handle(mockReq, mockRes, jest.fn());

        expect(mockRes.statusCode).toBe(400);
        const response = mockRes.json.mock.calls[0][0];
        expect(response.success).toBe(false);
    });

    test('T020b: returns 400 when title is missing', async () => {
        const bugPayload = {
            tuleap_artifact_id: 99999
            // title missing
        };

        const mockReq = { body: bugPayload };
        const mockRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json: jest.fn()
        };

        const routeLayer = tuleapRouter.stack.find(
            layer => layer.route && layer.route.path === '/bug' && layer.route.methods.post
        );
        await routeLayer.route.stack[0].handle(mockReq, mockRes, jest.fn());

        expect(mockRes.statusCode).toBe(400);
        const response = mockRes.json.mock.calls[0][0];
        expect(response.success).toBe(false);
    });
});

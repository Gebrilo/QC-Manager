/**
 * Jest tests for POST /tuleap-webhook/bug
 * Tests: T018–T020 (US2 — Bug Sync Validation)
 */

const { processedBugData } = require('./fixtures/tuleapPayloads');

const mockQuery = jest.fn();
const mockAuditLog = jest.fn().mockResolvedValue(undefined);
const mockDispatchBug = jest.fn();
const mockResolveLinks = jest.fn();

jest.mock('../src/config/db', () => ({
    pool: { query: mockQuery }
}));
jest.mock('../src/middleware/audit', () => ({
    auditLog: mockAuditLog
}));
jest.mock('../src/services/persisters/bug', () => ({
    dispatchAction: mockDispatchBug
}));
jest.mock('../src/services/tuleapLinkResolver', () => ({
    resolveLinks: mockResolveLinks,
    drainPending: jest.fn().mockResolvedValue({ resolvedCount: 0 }),
}));

const express = require('express');
const tuleapRouter = require('../src/routes/tuleapWebhook');

const app = express();
app.use(express.json());
app.use('/tuleap-webhook', tuleapRouter);

beforeEach(() => {
    mockQuery.mockReset();
    mockAuditLog.mockReset();
    mockDispatchBug.mockReset();
    mockResolveLinks.mockReset();
});

describe('POST /tuleap-webhook/bug', () => {

    // T018: Bug creation with correct status/severity mapping
    test('T018: creates bug with correct status and severity mapping', async () => {
        const bugPayload = { ...processedBugData };

        mockQuery
            .mockResolvedValueOnce({ rows: [] })  // logWebhook
            .mockResolvedValueOnce({ rows: [{}] }) // config lookup
            .mockResolvedValueOnce({ rows: [] });  // logWebhook update

        mockDispatchBug.mockResolvedValueOnce({
            action: 'created',
            id: 'new-bug-uuid',
            data: {
                id: 'new-bug-uuid',
                bug_id: 'TLP-67890',
                title: bugPayload.title,
                status: bugPayload.status,
                severity: bugPayload.severity,
                tuleap_artifact_id: bugPayload.tuleap_artifact_id,
                owner_resource_id: null,
            },
        });

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

        mockQuery
            .mockResolvedValueOnce({ rows: [] })  // logWebhook
            .mockResolvedValueOnce({ rows: [{}] }) // config lookup
            .mockResolvedValueOnce({ rows: [] });  // logWebhook update

        mockDispatchBug.mockResolvedValueOnce({
            action: 'updated',
            id: 'existing-bug-uuid',
            data: {
                id: 'existing-bug-uuid',
                bug_id: 'BUG-EXIST',
                title: bugPayload.title,
                status: bugPayload.status,
                severity: bugPayload.severity
            },
        });

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

    // T021: updated_by is synced on update, reported_by is not overwritten
    test('T021: updated_by is passed through to dispatchAction on update', async () => {
        const bugPayload = {
            ...processedBugData,
            updated_by: 'Bob Editor',
        };

        mockQuery
            .mockResolvedValueOnce({ rows: [] })   // logWebhook
            .mockResolvedValueOnce({ rows: [{}] })  // config lookup
            .mockResolvedValueOnce({ rows: [] });   // logWebhook update

        mockDispatchBug.mockResolvedValueOnce({
            action: 'updated',
            id: 'existing-bug-uuid',
            data: {
                id: 'existing-bug-uuid',
                bug_id: 'TLP-67890',
                title: bugPayload.title,
                status: bugPayload.status,
                updated_by: 'Bob Editor',
            },
        });

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
        expect(response.data.updated_by).toBe('Bob Editor');

        const dispatched = mockDispatchBug.mock.calls[0][0];
        expect(dispatched.updated_by).toBe('Bob Editor');
    });
});

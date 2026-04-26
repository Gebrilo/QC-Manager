/**
 * Jest tests for POST /tuleap-webhook/unified
 */

const mockQuery = jest.fn();
const mockAuditLog = jest.fn().mockResolvedValue(undefined);
const mockFromTuleap = jest.fn();

jest.mock('../src/config/db', () => ({
    pool: { query: mockQuery }
}));
jest.mock('../src/middleware/audit', () => ({
    auditLog: mockAuditLog
}));
jest.mock('../src/services/tuleapTransformEngine', () => ({
    fromTuleap: mockFromTuleap
}));

const express = require('express');
const tuleapRouter = require('../src/routes/tuleapWebhook');

const app = express();
app.use(express.json());
app.use('/tuleap-webhook', tuleapRouter);

beforeEach(() => {
    mockQuery.mockReset();
    mockAuditLog.mockReset();
    mockFromTuleap.mockReset();
});

describe('POST /tuleap-webhook/unified', () => {

    test('returns 400 when tracker_id is missing', async () => {
        const mockReq = { body: { artifact: { id: 123 } } };
        const mockRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json: jest.fn()
        };

        const routeLayer = tuleapRouter.stack.find(
            layer => layer.route && layer.route.path === '/unified' && layer.route.methods.post
        );
        expect(routeLayer).toBeDefined();

        await routeLayer.route.stack[0].handle(mockReq, mockRes, jest.fn());

        expect(mockRes.statusCode).toBe(400);
        const response = mockRes.json.mock.calls[0][0];
        expect(response.success).toBe(false);
        expect(response.error).toContain('tracker_id');
    });

    test('returns 404 when no sync config found for tracker', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const mockReq = { body: { tracker_id: 999, artifact: { id: 123 } } };
        const mockRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json: jest.fn()
        };

        const routeLayer = tuleapRouter.stack.find(
            layer => layer.route && layer.route.path === '/unified' && layer.route.methods.post
        );
        await routeLayer.route.stack[0].handle(mockReq, mockRes, jest.fn());

        expect(mockRes.statusCode).toBe(404);
        const response = mockRes.json.mock.calls[0][0];
        expect(response.success).toBe(false);
        expect(response.error).toContain('No sync config');
    });

    test('falls back to project-level config when tracker has no direct match', async () => {
        const syncConfig = {
            id: 'cfg-1',
            tuleap_project_id: 42,
            tuleap_tracker_id: 5,
            tracker_type: 'bug',
            qc_project_id: 'proj-1'
        };

        mockQuery
            .mockResolvedValueOnce({ rows: [] })             // tracker lookup
            .mockResolvedValueOnce({ rows: [syncConfig] })   // project fallback
            .mockResolvedValueOnce({ rows: [] });            // webhook log

        mockFromTuleap.mockReturnValue({ artifact_type: 'bug', common: { title: 'Bug' }, fields: {} });

        const mockReq = {
            body: {
                tracker_id: 999,
                project: { id: 42 },
                artifact: { id: 123, values: [] },
                action: 'update'
            }
        };
        const mockRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json: jest.fn()
        };

        const routeLayer = tuleapRouter.stack.find(
            layer => layer.route && layer.route.path === '/unified' && layer.route.methods.post
        );
        await routeLayer.route.stack[0].handle(mockReq, mockRes, jest.fn());

        expect(mockRes.statusCode).toBe(200);
        const response = mockRes.json.mock.calls[0][0];
        expect(response.success).toBe(true);
        expect(response.artifact_type).toBe('bug');
        expect(mockQuery).toHaveBeenCalledTimes(3);
    });

    test('returns 200 and processes valid bug payload', async () => {
        const syncConfig = {
            id: 'cfg-1',
            tuleap_project_id: 42,
            tuleap_tracker_id: 5,
            tracker_type: 'bug',
            qc_project_id: 'proj-1'
        };

        mockQuery
            .mockResolvedValueOnce({ rows: [syncConfig] }) // tracker lookup
            .mockResolvedValueOnce({ rows: [] });           // webhook log

        mockFromTuleap.mockReturnValue({
            artifact_type: 'bug',
            common: { title: 'Bug Title' },
            fields: { severity: 'high' }
        });

        const mockReq = {
            body: {
                tracker_id: 5,
                action: 'update',
                artifact: {
                    id: 123,
                    values: [
                        { field_id: 1, field_name: 'title', value: 'Bug Title' },
                        { field_id: 2, label: 'severity', value: 'high' }
                    ]
                }
            }
        };
        const mockRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json: jest.fn()
        };

        const routeLayer = tuleapRouter.stack.find(
            layer => layer.route && layer.route.path === '/unified' && layer.route.methods.post
        );
        await routeLayer.route.stack[0].handle(mockReq, mockRes, jest.fn());

        expect(mockRes.statusCode).toBe(200);
        const response = mockRes.json.mock.calls[0][0];
        expect(response.success).toBe(true);
        expect(response.unified).toEqual({
            artifact_type: 'bug',
            project_id: 'proj-1',
            tuleap: {
                artifact_id: 123,
                project_id: 42,
                tracker_id: 5
            },
            common: { title: 'Bug Title' },
            fields: { severity: 'high' }
        });
        expect(mockFromTuleap).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Bug Title', severity: 'high' }),
            syncConfig
        );
    });

    test('logs webhook to tuleap_webhook_log', async () => {
        const syncConfig = {
            id: 'cfg-1',
            tuleap_project_id: 42,
            tuleap_tracker_id: 5,
            tracker_type: 'bug',
            qc_project_id: 'proj-1'
        };

        mockQuery
            .mockResolvedValueOnce({ rows: [syncConfig] }) // tracker lookup
            .mockResolvedValueOnce({ rows: [] });           // webhook log

        mockFromTuleap.mockReturnValue({ artifact_type: 'bug', common: {}, fields: {} });

        const mockReq = {
            body: {
                tracker_id: 5,
                action: 'update',
                artifact: { id: 123, values: [] }
            }
        };
        const mockRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json: jest.fn()
        };

        const routeLayer = tuleapRouter.stack.find(
            layer => layer.route && layer.route.path === '/unified' && layer.route.methods.post
        );
        await routeLayer.route.stack[0].handle(mockReq, mockRes, jest.fn());

        expect(mockRes.statusCode).toBe(200);
        const response = mockRes.json.mock.calls[0][0];
        expect(response.success).toBe(true);

        // Find the webhook log insert call
        const logCall = mockQuery.mock.calls.find(call =>
            typeof call[0] === 'string' && call[0].includes('tuleap_webhook_log')
        );
        expect(logCall).toBeDefined();
        expect(logCall[0]).toContain('ON CONFLICT');
        expect(logCall[0]).toContain("processing_status = 'duplicate'");
    });
});

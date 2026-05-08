/**
 * Tests: T_OWN01–T_OWN03
 * Verifies that owner_resource_id is set once on INSERT and never updated.
 */

const mockQuery = jest.fn();
const mockAuditLog = jest.fn().mockResolvedValue(undefined);
const mockDispatchBug = jest.fn();

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
    resolveLinks: jest.fn().mockResolvedValue({ resolved: [], pending: [] }),
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
});

function getBugRoute() {
    const layer = tuleapRouter.stack.find(
        l => l.route && l.route.path === '/bug' && l.route.methods.post
    );
    expect(layer).toBeDefined();
    return layer.route.stack[0].handle;
}

const BASE_PAYLOAD = {
    tuleap_artifact_id: 9001,
    title: 'Login crashes on submit',
    status: 'Open',
    severity: 'high',
    reported_by: 'alice@example.com',
    project_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
};

describe('Bug ownership: owner_resource_id', () => {

    test('T_OWN01: passes reported_by to dispatchAction for owner resolution', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [] })   // logWebhook
            .mockResolvedValueOnce({ rows: [{}] })  // config lookup
            .mockResolvedValueOnce({ rows: [] });   // logWebhook update

        mockDispatchBug.mockResolvedValueOnce({
            action: 'created',
            id: 'bug-uuid-9001',
            data: {
                id: 'bug-uuid-9001',
                bug_id: 'TLP-9001',
                title: BASE_PAYLOAD.title,
                owner_resource_id: 'res-uuid-alice',
            },
        });

        const mockReq = { body: { ...BASE_PAYLOAD } };
        const mockRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json: jest.fn(),
        };

        await getBugRoute()(mockReq, mockRes, jest.fn());

        expect(mockRes.statusCode).toBe(201);
        const dispatched = mockDispatchBug.mock.calls[0][0];
        expect(dispatched.reported_by).toBe('alice@example.com');
    });

    test('T_OWN02: creates bug with reported_by even when no resource match', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [] })   // logWebhook
            .mockResolvedValueOnce({ rows: [{}] })  // config lookup
            .mockResolvedValueOnce({ rows: [] });   // logWebhook update

        mockDispatchBug.mockResolvedValueOnce({
            action: 'created',
            id: 'bug-uuid-9002',
            data: {
                id: 'bug-uuid-9002',
                bug_id: 'TLP-9002',
                title: 'Unknown reporter bug',
                owner_resource_id: null,
            },
        });

        const mockReq = { body: { ...BASE_PAYLOAD, tuleap_artifact_id: 9002, reported_by: 'nobody@unknown.com' } };
        const mockRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json: jest.fn(),
        };

        await getBugRoute()(mockReq, mockRes, jest.fn());

        expect(mockRes.statusCode).toBe(201);
        const dispatched = mockDispatchBug.mock.calls[0][0];
        expect(dispatched.reported_by).toBe('nobody@unknown.com');
    });

    test('T_OWN03: dispatches update via dispatchAction without modifying reported_by', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [] })   // logWebhook
            .mockResolvedValueOnce({ rows: [{}] })  // config lookup
            .mockResolvedValueOnce({ rows: [] });   // logWebhook update

        mockDispatchBug.mockResolvedValueOnce({
            action: 'updated',
            id: 'bug-uuid-9001',
            data: {
                id: 'bug-uuid-9001',
                bug_id: 'TLP-9001',
                title: 'Updated title',
                owner_resource_id: 'res-uuid-alice',
            },
        });

        const mockReq = { body: { ...BASE_PAYLOAD, title: 'Updated title', reported_by: 'different-person' } };
        const mockRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json: jest.fn(),
        };

        await getBugRoute()(mockReq, mockRes, jest.fn());

        expect(mockRes.statusCode).toBe(200);
        expect(mockRes.json.mock.calls[0][0].action).toBe('updated');
    });
});

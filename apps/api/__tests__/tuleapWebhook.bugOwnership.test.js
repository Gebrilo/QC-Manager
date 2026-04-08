/**
 * Tests: T_OWN01–T_OWN03
 * Verifies that owner_resource_id is set once on INSERT and never updated.
 */

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

    test('T_OWN01: sets owner_resource_id on INSERT when reporter matches resource by email', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [] })                         // logWebhook receive
            .mockResolvedValueOnce({ rows: [] })                         // SELECT: no existing bug
            .mockResolvedValueOnce({ rows: [{ id: 'res-uuid-alice' }] }) // SELECT resource by email
            .mockResolvedValueOnce({                                      // INSERT bug
                rows: [{
                    id: 'bug-uuid-9001',
                    bug_id: 'TLP-9001',
                    title: BASE_PAYLOAD.title,
                    owner_resource_id: 'res-uuid-alice',
                }]
            })
            .mockResolvedValueOnce({ rows: [] });                         // logWebhook processed

        const mockReq = { body: { ...BASE_PAYLOAD } };
        const mockRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json: jest.fn(),
        };

        await getBugRoute()(mockReq, mockRes, jest.fn());

        expect(mockRes.statusCode).toBe(201);
        const response = mockRes.json.mock.calls[0][0];
        expect(response.action).toBe('created');

        const insertCall = mockQuery.mock.calls.find(
            call => typeof call[0] === 'string' && call[0].includes('INSERT INTO bugs')
        );
        expect(insertCall).toBeDefined();
        expect(insertCall[1]).toContain('res-uuid-alice');
    });

    test('T_OWN02: inserts bug with owner_resource_id null when reporter matches no resource', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [] })  // logWebhook receive
            .mockResolvedValueOnce({ rows: [] })  // SELECT: no existing bug
            .mockResolvedValueOnce({ rows: [] })  // SELECT resource: no match
            .mockResolvedValueOnce({              // INSERT bug
                rows: [{
                    id: 'bug-uuid-9002',
                    bug_id: 'TLP-9002',
                    title: 'Unknown reporter bug',
                    owner_resource_id: null,
                }]
            })
            .mockResolvedValueOnce({ rows: [] }); // logWebhook processed

        const mockReq = { body: { ...BASE_PAYLOAD, tuleap_artifact_id: 9002, reported_by: 'nobody@unknown.com' } };
        const mockRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json: jest.fn(),
        };

        await getBugRoute()(mockReq, mockRes, jest.fn());

        expect(mockRes.statusCode).toBe(201);
        const response = mockRes.json.mock.calls[0][0];
        expect(response.action).toBe('created');

        const insertCall = mockQuery.mock.calls.find(
            call => typeof call[0] === 'string' && call[0].includes('INSERT INTO bugs')
        );
        expect(insertCall).toBeDefined();
    });

    test('T_OWN03: does NOT call resource lookup on UPDATE (owner_resource_id stays immutable)', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [] })  // logWebhook receive
            .mockResolvedValueOnce({ rows: [{ id: 'bug-uuid-9001', deleted_at: null }] }) // SELECT: bug exists
            .mockResolvedValueOnce({              // UPDATE bug (no resource lookup in between)
                rows: [{
                    id: 'bug-uuid-9001',
                    bug_id: 'TLP-9001',
                    title: 'Updated title',
                    owner_resource_id: 'res-uuid-alice',
                }]
            })
            .mockResolvedValueOnce({ rows: [] }); // logWebhook processed

        const mockReq = { body: { ...BASE_PAYLOAD, title: 'Updated title', reported_by: 'different-person' } };
        const mockRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json: jest.fn(),
        };

        await getBugRoute()(mockReq, mockRes, jest.fn());

        expect(mockRes.statusCode).toBe(200);
        const response = mockRes.json.mock.calls[0][0];
        expect(response.action).toBe('updated');

        const resourceLookup = mockQuery.mock.calls.find(
            call => typeof call[0] === 'string' && call[0].toLowerCase().includes('from resources')
        );
        expect(resourceLookup).toBeUndefined();

        const updateCall = mockQuery.mock.calls.find(
            call => typeof call[0] === 'string' && call[0].includes('UPDATE bugs SET')
        );
        expect(updateCall).toBeDefined();
        expect(updateCall[0]).not.toContain('owner_resource_id');
    });
});

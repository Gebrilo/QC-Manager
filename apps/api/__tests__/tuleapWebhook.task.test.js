/**
 * Jest tests for POST /tuleap-webhook/task
 * Tests: T009–T013 (US1 — Task Sync Validation)
 */

const { processedTaskData } = require('./fixtures/tuleapPayloads');

// ---- Mocks (must be before require) ----
const mockQuery = jest.fn();
const mockAuditLog = jest.fn().mockResolvedValue(undefined);

jest.mock('../src/config/db', () => ({
    pool: { query: mockQuery }
}));
jest.mock('../src/middleware/audit', () => ({
    auditLog: mockAuditLog
}));

const express = require('express');

// We use a lightweight approach without supertest — test the route handler directly
const tuleapRouter = require('../src/routes/tuleapWebhook');

const app = express();
app.use(express.json());
app.use('/tuleap-webhook', tuleapRouter);

// Helper to make requests
function postTask(body) {
    return new Promise((resolve) => {
        const req = {
            body,
            query: {}
        };
        const res = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json(data) { resolve({ statusCode: this.statusCode, body: data }); }
        };
        // We can't easily call the router directly, so let's use a simpler approach
        resolve(null);
    });
}

beforeEach(() => {
    mockQuery.mockReset();
    mockAuditLog.mockReset();
});

describe('POST /tuleap-webhook/task', () => {

    // T009: Task creation with action 'create'
    test('T009: creates a new task when action is create', async () => {
        const taskPayload = {
            ...processedTaskData,
            action: 'create'
        };

        // Mock: no existing task
        mockQuery
            .mockResolvedValueOnce({ rows: [] })  // logWebhook INSERT
            .mockResolvedValueOnce({ rows: [] })  // SELECT existing task
            .mockResolvedValueOnce({ rows: [{ task_id: 'TSK-001' }] }) // generateTaskId
            .mockResolvedValueOnce({
                rows: [{ // INSERT task
                    id: 'new-uuid',
                    task_id: 'TSK-002',
                    task_name: taskPayload.task_name,
                    synced_from_tuleap: true,
                    tuleap_artifact_id: taskPayload.tuleap_artifact_id
                }]
            })
            .mockResolvedValueOnce({ rows: [] }); // logWebhook update

        // Simulate HTTP request via Express internals
        const mockReq = { body: taskPayload };
        const mockRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json: jest.fn()
        };

        // Get the route handler
        const routeLayer = tuleapRouter.stack.find(
            layer => layer.route && layer.route.path === '/task' && layer.route.methods.post
        );
        expect(routeLayer).toBeDefined();

        await routeLayer.route.stack[0].handle(mockReq, mockRes, jest.fn());

        // Verify task was created
        expect(mockRes.json).toHaveBeenCalled();
        const response = mockRes.json.mock.calls[0][0];
        expect(response.success).toBe(true);
        expect(response.action).toBe('created');
        expect(response.data.synced_from_tuleap).toBe(true);
    });

    // T010: Task update for existing artifact
    test('T010: updates existing task when action is update and task exists', async () => {
        const taskPayload = {
            ...processedTaskData,
            action: 'update'
        };

        const existingTask = {
            id: 'existing-uuid',
            task_id: 'TSK-001',
            task_name: 'Old Name',
            tuleap_artifact_id: taskPayload.tuleap_artifact_id
        };

        mockQuery
            .mockResolvedValueOnce({ rows: [] })  // logWebhook
            .mockResolvedValueOnce({ rows: [existingTask] })  // SELECT existing task
            .mockResolvedValueOnce({
                rows: [{ // UPDATE task
                    ...existingTask,
                    task_name: taskPayload.task_name,
                    id: existingTask.id,
                    task_id: 'TSK-001'
                }]
            })
            .mockResolvedValueOnce({ rows: [] }); // logWebhook update

        const mockReq = { body: taskPayload };
        const mockRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json: jest.fn()
        };

        const routeLayer = tuleapRouter.stack.find(
            layer => layer.route && layer.route.path === '/task' && layer.route.methods.post
        );
        await routeLayer.route.stack[0].handle(mockReq, mockRes, jest.fn());

        const response = mockRes.json.mock.calls[0][0];
        expect(response.success).toBe(true);
        expect(response.action).toBe('updated');
    });

    // T011: Update falls through to create when task doesn't exist
    test('T011: update action creates task when it does not exist', async () => {
        const taskPayload = {
            ...processedTaskData,
            action: 'update',
            task_name: 'New task via update'
        };

        mockQuery
            .mockResolvedValueOnce({ rows: [] })  // logWebhook
            .mockResolvedValueOnce({ rows: [] })  // SELECT: no existing task
            .mockResolvedValueOnce({ rows: [{ task_id: 'TSK-001' }] }) // generateTaskId
            .mockResolvedValueOnce({
                rows: [{ // INSERT
                    id: 'new-uuid',
                    task_id: 'TSK-002',
                    task_name: taskPayload.task_name,
                    synced_from_tuleap: true
                }]
            })
            .mockResolvedValueOnce({ rows: [] }); // logWebhook update

        const mockReq = { body: taskPayload };
        const mockRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json: jest.fn()
        };

        const routeLayer = tuleapRouter.stack.find(
            layer => layer.route && layer.route.path === '/task' && layer.route.methods.post
        );
        await routeLayer.route.stack[0].handle(mockReq, mockRes, jest.fn());

        const response = mockRes.json.mock.calls[0][0];
        expect(response.success).toBe(true);
        // Falls through from update to create
        expect(response.action).toBe('created');
    });

    // T012: Missing task_name returns 400
    test('T012: returns 400 when task_name is missing on create', async () => {
        const taskPayload = {
            tuleap_artifact_id: 99999,
            action: 'create'
            // task_name intentionally missing
        };

        mockQuery
            .mockResolvedValueOnce({ rows: [] })  // logWebhook
            .mockResolvedValueOnce({ rows: [] }); // SELECT: no existing task

        const mockReq = { body: taskPayload };
        const mockRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json: jest.fn()
        };

        const routeLayer = tuleapRouter.stack.find(
            layer => layer.route && layer.route.path === '/task' && layer.route.methods.post
        );
        await routeLayer.route.stack[0].handle(mockReq, mockRes, jest.fn());

        expect(mockRes.statusCode).toBe(400);
        const response = mockRes.json.mock.calls[0][0];
        expect(response.success).toBe(false);
    });

    // T013: Duplicate task returns 'exists'
    test('T013: returns exists when task already exists on create action', async () => {
        const existingTask = {
            id: 'existing-uuid',
            task_id: 'TSK-001',
            task_name: 'Existing Task',
            tuleap_artifact_id: 12345
        };

        const taskPayload = {
            ...processedTaskData,
            action: 'create'
        };

        mockQuery
            .mockResolvedValueOnce({ rows: [] })  // logWebhook
            .mockResolvedValueOnce({ rows: [existingTask] }); // SELECT: task exists

        const mockReq = { body: taskPayload };
        const mockRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json: jest.fn()
        };

        const routeLayer = tuleapRouter.stack.find(
            layer => layer.route && layer.route.path === '/task' && layer.route.methods.post
        );
        await routeLayer.route.stack[0].handle(mockReq, mockRes, jest.fn());

        const response = mockRes.json.mock.calls[0][0];
        expect(response.success).toBe(true);
        expect(response.action).toBe('exists');
    });

    // T017: Missing tuleap_artifact_id returns 400
    test('T017: returns 400 when tuleap_artifact_id is missing', async () => {
        const taskPayload = {
            task_name: 'Some task'
            // tuleap_artifact_id missing
        };

        const mockReq = { body: taskPayload };
        const mockRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json: jest.fn()
        };

        const routeLayer = tuleapRouter.stack.find(
            layer => layer.route && layer.route.path === '/task' && layer.route.methods.post
        );
        await routeLayer.route.stack[0].handle(mockReq, mockRes, jest.fn());

        expect(mockRes.statusCode).toBe(400);
        const response = mockRes.json.mock.calls[0][0];
        expect(response.success).toBe(false);
    });
});

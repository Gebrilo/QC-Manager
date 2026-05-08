/**
 * Jest tests for POST /tuleap-webhook/task
 * Tests the task shim: translate legacy payload → unified → dispatchTask()
 */

const { processedTaskData } = require('./fixtures/tuleapPayloads');

const mockQuery = jest.fn();
const mockAuditLog = jest.fn().mockResolvedValue(undefined);
const mockDispatchTask = jest.fn();

jest.mock('../src/config/db', () => ({
    pool: { query: mockQuery }
}));
jest.mock('../src/middleware/audit', () => ({
    auditLog: mockAuditLog
}));
jest.mock('../src/services/persisters/task', () => ({
    dispatchAction: mockDispatchTask
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
    mockDispatchTask.mockReset();
});

describe('POST /tuleap-webhook/task', () => {

    // T009: Task creation via shim → dispatchTask
    test('T009: creates a new task when action is create', async () => {
        const taskPayload = {
            ...processedTaskData,
            action: 'create'
        };

        mockQuery
            .mockResolvedValueOnce({ rows: [] })   // logWebhook INSERT
            .mockResolvedValueOnce({ rows: [{}] })  // config lookup
            .mockResolvedValueOnce({ rows: [] });   // logWebhook update

        mockDispatchTask.mockResolvedValueOnce({
            action: 'created',
            id: 'new-uuid',
            data: {
                id: 'new-uuid',
                task_id: 'TSK-002',
                task_name: taskPayload.task_name,
                synced_from_tuleap: true,
                tuleap_artifact_id: taskPayload.tuleap_artifact_id
            },
        });

        const mockReq = { body: taskPayload };
        const mockRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json: jest.fn()
        };

        const routeLayer = tuleapRouter.stack.find(
            layer => layer.route && layer.route.path === '/task' && layer.route.methods.post
        );
        expect(routeLayer).toBeDefined();

        await routeLayer.route.stack[0].handle(mockReq, mockRes, jest.fn());

        expect(mockRes.statusCode).toBe(201);
        const response = mockRes.json.mock.calls[0][0];
        expect(response.success).toBe(true);
        expect(response.action).toBe('created');
        expect(response.data.synced_from_tuleap).toBe(true);
    });

    // T010: Task update via shim → dispatchTask
    test('T010: updates existing task when action is update and task exists', async () => {
        const taskPayload = {
            ...processedTaskData,
            action: 'update'
        };

        mockQuery
            .mockResolvedValueOnce({ rows: [] })   // logWebhook INSERT
            .mockResolvedValueOnce({ rows: [{}] })  // config lookup
            .mockResolvedValueOnce({ rows: [] });   // logWebhook update

        mockDispatchTask.mockResolvedValueOnce({
            action: 'updated',
            id: 'existing-uuid',
            data: {
                id: 'existing-uuid',
                task_id: 'TSK-001',
                task_name: taskPayload.task_name,
                tuleap_artifact_id: taskPayload.tuleap_artifact_id
            },
        });

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

        expect(mockRes.statusCode).toBe(200);
        const response = mockRes.json.mock.calls[0][0];
        expect(response.success).toBe(true);
        expect(response.action).toBe('updated');
    });

    // T011: Update action creates task when it does not exist (falls through to sync→create)
    test('T011: update action creates task when it does not exist', async () => {
        const taskPayload = {
            ...processedTaskData,
            action: 'update',
            task_name: 'New task via update'
        };

        mockQuery
            .mockResolvedValueOnce({ rows: [] })   // logWebhook INSERT
            .mockResolvedValueOnce({ rows: [{}] })  // config lookup
            .mockResolvedValueOnce({ rows: [] });   // logWebhook update

        mockDispatchTask.mockResolvedValueOnce({
            action: 'created',
            id: 'new-uuid',
            data: {
                id: 'new-uuid',
                task_id: 'TSK-003',
                task_name: taskPayload.task_name,
                synced_from_tuleap: true
            },
        });

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
        expect(response.action).toBe('created');
    });

    // T012: Missing task_name — persister handles it, shim only validates tuleap_artifact_id
    test('T012: returns 500 when dispatchTask throws for missing data', async () => {
        const taskPayload = {
            tuleap_artifact_id: 99999,
            action: 'create'
        };

        mockQuery
            .mockResolvedValueOnce({ rows: [] });  // logWebhook INSERT

        mockDispatchTask.mockRejectedValueOnce(new Error('task_name is required'));

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

        expect(mockRes.statusCode).toBe(500);
        const response = mockRes.json.mock.calls[0][0];
        expect(response.success).toBe(false);
    });

    // T013: Already-existing task — persister returns 'updated' for sync
    test('T013: returns updated when task already exists on create action', async () => {
        const taskPayload = {
            ...processedTaskData,
            action: 'create'
        };

        mockQuery
            .mockResolvedValueOnce({ rows: [] })   // logWebhook INSERT
            .mockResolvedValueOnce({ rows: [{}] })  // config lookup
            .mockResolvedValueOnce({ rows: [] });   // logWebhook update

        mockDispatchTask.mockResolvedValueOnce({
            action: 'updated',
            id: 'existing-uuid',
            data: {
                id: 'existing-uuid',
                task_id: 'TSK-001',
                task_name: 'Existing Task',
                tuleap_artifact_id: 12345
            },
        });

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

    // T017: Missing tuleap_artifact_id returns 400
    test('T017: returns 400 when tuleap_artifact_id is missing', async () => {
        const taskPayload = {
            task_name: 'Some task'
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

    // T014: delete action
    test('T014: deletes a task when action is delete', async () => {
        const taskPayload = {
            ...processedTaskData,
            action: 'delete'
        };

        mockQuery
            .mockResolvedValueOnce({ rows: [] })   // logWebhook INSERT
            .mockResolvedValueOnce({ rows: [{}] })  // config lookup
            .mockResolvedValueOnce({ rows: [] });   // logWebhook update

        mockDispatchTask.mockResolvedValueOnce({
            action: 'deleted',
            id: 'existing-uuid',
        });

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

        expect(mockRes.statusCode).toBe(200);
        const response = mockRes.json.mock.calls[0][0];
        expect(response.success).toBe(true);
        expect(response.action).toBe('deleted');
    });

    // T015: reject action
    test('T015: rejects a task when action is reject', async () => {
        const taskPayload = {
            ...processedTaskData,
            action: 'reject',
            new_assignee_name: 'Unknown Person',
            action_reason: 'No matching resource'
        };

        mockQuery
            .mockResolvedValueOnce({ rows: [] })   // logWebhook INSERT
            .mockResolvedValueOnce({ rows: [{}] })  // config lookup
            .mockResolvedValueOnce({ rows: [] });   // logWebhook update

        mockDispatchTask.mockResolvedValueOnce({
            action: 'rejected',
            message: 'Task rejected: Implement login page (assigned to unknown user: Unknown Person)'
        });

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

        expect(mockRes.statusCode).toBe(200);
        const response = mockRes.json.mock.calls[0][0];
        expect(response.success).toBe(true);
        expect(response.action).toBe('rejected');
    });

    // T016: archive action
    test('T016: archives a task when action is archive', async () => {
        const taskPayload = {
            ...processedTaskData,
            action: 'archive',
            new_assignee_name: 'New Team',
            action_reason: 'Reassigned to another team'
        };

        mockQuery
            .mockResolvedValueOnce({ rows: [] })   // logWebhook INSERT
            .mockResolvedValueOnce({ rows: [{}] })  // config lookup
            .mockResolvedValueOnce({ rows: [] });   // logWebhook update

        mockDispatchTask.mockResolvedValueOnce({
            action: 'archived',
            id: 'existing-uuid',
        });

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

        expect(mockRes.statusCode).toBe(200);
        const response = mockRes.json.mock.calls[0][0];
        expect(response.success).toBe(true);
        expect(response.action).toBe('archived');
    });
});
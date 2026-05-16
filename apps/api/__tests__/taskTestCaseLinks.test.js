const mockQuery = jest.fn();

jest.mock('../src/config/db', () => ({
    pool: { query: mockQuery },
}));

jest.mock('../src/middleware/authMiddleware', () => ({
    requireAuth: (req, res, next) => {
        req.user = {
            id: '22222222-2222-2222-2222-222222222222',
            role: 'admin',
        };
        next();
    },
    requirePermission: () => (req, res, next) => next(),
}));

jest.mock('../src/middleware/audit', () => ({
    auditLog: jest.fn().mockResolvedValue(undefined),
}));

const express = require('express');
const request = require('supertest');

const { taskSide: taskTcRouter, tcSide: tcTaskRouter } = require('../src/modules/work/links.routes');

describe('Task-Test Case Linking API', () => {
    let app;

    beforeEach(() => {
        app = express();
        app.use(express.json());
        app.use('/tasks', taskTcRouter);
        app.use('/test-cases', tcTaskRouter);
        jest.clearAllMocks();
    });

    const taskId = '11111111-1111-1111-1111-111111111111';
    const testCaseId = '33333333-3333-3333-3333-333333333333';
    const linkId = '44444444-4444-4444-4444-444444444444';

    describe('GET /tasks/:taskId/test-cases', () => {
        test('returns 404 when task not found', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            const res = await request(app).get(`/tasks/${taskId}/test-cases`);

            expect(res.status).toBe(404);
            expect(res.body.error).toBe('Task not found');
        });

        test('returns linked test cases', async () => {
            mockQuery
                .mockResolvedValueOnce({ rows: [{ id: taskId }] })
                .mockResolvedValueOnce({
                    rows: [{
                        id: linkId,
                        task_id: taskId,
                        test_case_id: testCaseId,
                        relationship_type: 'covers',
                        test_case_display_id: 'TC-001',
                        test_case_title: 'Login test',
                        test_case_status: 'active',
                        test_case_priority: 'high',
                    }],
                });

            const res = await request(app).get(`/tasks/${taskId}/test-cases`);

            expect(res.status).toBe(200);
            expect(res.body.data).toHaveLength(1);
            expect(res.body.data[0].test_case_id).toBe(testCaseId);
        });
    });

    describe('POST /tasks/:taskId/test-cases', () => {
        test('returns 400 when test_case_id missing', async () => {
            const res = await request(app)
                .post(`/tasks/${taskId}/test-cases`)
                .send({});

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('test_case_id is required');
        });

        test('returns 404 when task not found', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            const res = await request(app)
                .post(`/tasks/${taskId}/test-cases`)
                .send({ test_case_id: testCaseId });

            expect(res.status).toBe(404);
            expect(res.body.error).toBe('Task not found');
        });

        test('returns 404 when test case not found', async () => {
            mockQuery
                .mockResolvedValueOnce({ rows: [{ id: taskId }] })
                .mockResolvedValueOnce({ rows: [] });

            const res = await request(app)
                .post(`/tasks/${taskId}/test-cases`)
                .send({ test_case_id: testCaseId });

            expect(res.status).toBe(404);
            expect(res.body.error).toBe('Test case not found');
        });

        test('creates link and returns 201', async () => {
            const linkRow = {
                id: linkId, task_id: taskId, test_case_id: testCaseId,
                relationship_type: 'covers', created_by: '22222222-2222-2222-2222-222222222222',
            };
            mockQuery
                .mockResolvedValueOnce({ rows: [{ id: taskId }] })
                .mockResolvedValueOnce({ rows: [{ id: testCaseId }] })
                .mockResolvedValueOnce({ rows: [linkRow] });

            const res = await request(app)
                .post(`/tasks/${taskId}/test-cases`)
                .send({ test_case_id: testCaseId });

            expect(res.status).toBe(201);
            expect(res.body.data.test_case_id).toBe(testCaseId);
        });

        test('returns 409 on duplicate link', async () => {
            mockQuery
                .mockResolvedValueOnce({ rows: [{ id: taskId }] })
                .mockResolvedValueOnce({ rows: [{ id: testCaseId }] })
                .mockResolvedValueOnce({ rows: [] });

            const res = await request(app)
                .post(`/tasks/${taskId}/test-cases`)
                .send({ test_case_id: testCaseId });

            expect(res.status).toBe(409);
        });
    });

    describe('DELETE /tasks/:taskId/test-cases/:testCaseId', () => {
        test('returns 404 when link not found', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            const res = await request(app).delete(`/tasks/${taskId}/test-cases/${testCaseId}`);

            expect(res.status).toBe(404);
        });

        test('deletes link successfully', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [{ id: linkId, task_id: taskId, test_case_id: testCaseId }],
            });

            const res = await request(app).delete(`/tasks/${taskId}/test-cases/${testCaseId}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    describe('GET /test-cases/:testCaseId/tasks', () => {
        test('returns 404 when test case not found', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            const res = await request(app).get(`/test-cases/${testCaseId}/tasks`);

            expect(res.status).toBe(404);
            expect(res.body.error).toBe('Test case not found');
        });

        test('returns linked tasks', async () => {
            mockQuery
                .mockResolvedValueOnce({ rows: [{ id: testCaseId }] })
                .mockResolvedValueOnce({
                    rows: [{
                        id: linkId, task_id: taskId, test_case_id: testCaseId,
                        relationship_type: 'covers', task_display_id: 'TSK-001',
                        task_name: 'Build login', task_status: 'In Progress',
                    }],
                });

            const res = await request(app).get(`/test-cases/${testCaseId}/tasks`);

            expect(res.status).toBe(200);
            expect(res.body.data).toHaveLength(1);
            expect(res.body.data[0].task_id).toBe(taskId);
        });
    });

    describe('POST /test-cases/:testCaseId/tasks', () => {
        test('returns 400 when task_id missing', async () => {
            const res = await request(app)
                .post(`/test-cases/${testCaseId}/tasks`)
                .send({});

            expect(res.status).toBe(400);
        });

        test('returns 404 when test case not found', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            const res = await request(app)
                .post(`/test-cases/${testCaseId}/tasks`)
                .send({ task_id: taskId });

            expect(res.status).toBe(404);
        });

        test('creates link and returns 201', async () => {
            const linkRow = {
                id: linkId, task_id: taskId, test_case_id: testCaseId,
                relationship_type: 'covers', created_by: '22222222-2222-2222-2222-222222222222',
            };
            mockQuery
                .mockResolvedValueOnce({ rows: [{ id: testCaseId }] })
                .mockResolvedValueOnce({ rows: [{ id: taskId }] })
                .mockResolvedValueOnce({ rows: [linkRow] });

            const res = await request(app)
                .post(`/test-cases/${testCaseId}/tasks`)
                .send({ task_id: taskId });

            expect(res.status).toBe(201);
            expect(res.body.data.task_id).toBe(taskId);
        });

        test('returns 409 on duplicate link', async () => {
            mockQuery
                .mockResolvedValueOnce({ rows: [{ id: testCaseId }] })
                .mockResolvedValueOnce({ rows: [{ id: taskId }] })
                .mockResolvedValueOnce({ rows: [] });

            const res = await request(app)
                .post(`/test-cases/${testCaseId}/tasks`)
                .send({ task_id: taskId });

            expect(res.status).toBe(409);
        });
    });

    describe('DELETE /test-cases/:testCaseId/tasks/:taskId', () => {
        test('returns 404 when link not found', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            const res = await request(app).delete(`/test-cases/${testCaseId}/tasks/${taskId}`);

            expect(res.status).toBe(404);
        });

        test('deletes link successfully', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [{ id: linkId, test_case_id: testCaseId, task_id: taskId }],
            });

            const res = await request(app).delete(`/test-cases/${testCaseId}/tasks/${taskId}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });
});
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
    blockContributors: (req, res, next) => next(),
    requirePermission: () => (req, res, next) => next(),
}));

jest.mock('../src/services/emitters/bug', () => ({
    emitToTuleap: jest.fn(),
}));
jest.mock('../src/services/tuleapClient', () => ({
    defaultClient: {},
}));
jest.mock('../src/services/tuleapFieldRegistry', () => ({
    defaultRegistry: {},
}));

const express = require('express');
const request = require('supertest');
const bugsRouter = require('../src/routes/bugs');

describe('Bug Linking API', () => {
    let app;

    beforeEach(() => {
        app = express();
        app.use(express.json());
        app.use('/bugs', bugsRouter);
        jest.clearAllMocks();
    });

    const bugId = '55555555-5555-5555-5555-555555555555';
    const executionId = '66666666-6666-6666-6666-666666666666';
    const taskId = '11111111-1111-1111-1111-111111111111';

    describe('GET /bugs/:id/test-executions', () => {
        test('returns 404 when bug not found', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            const res = await request(app).get(`/bugs/${bugId}/test-executions`);

            expect(res.status).toBe(404);
            expect(res.body.error).toBe('Bug not found');
        });

        test('returns linked test executions', async () => {
            mockQuery
                .mockResolvedValueOnce({ rows: [{ id: bugId }] })
                .mockResolvedValueOnce({
                    rows: [{
                        id: 'link-id', bug_id: bugId, test_execution_id: executionId,
                        execution_status: 'fail', execution_notes: 'Button broken',
                        executed_at: new Date(), test_run_id: 'run-uuid', test_run_name: 'Sprint 42',
                    }],
                });

            const res = await request(app).get(`/bugs/${bugId}/test-executions`);

            expect(res.status).toBe(200);
            expect(res.body.data).toHaveLength(1);
        });
    });

    describe('POST /bugs/:id/test-executions', () => {
        test('returns 400 when test_execution_id missing', async () => {
            const res = await request(app)
                .post(`/bugs/${bugId}/test-executions`)
                .send({});

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('test_execution_id is required');
        });

        test('returns 404 when bug not found', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            const res = await request(app)
                .post(`/bugs/${bugId}/test-executions`)
                .send({ test_execution_id: executionId });

            expect(res.status).toBe(404);
        });

        test('returns 404 when execution not found', async () => {
            mockQuery
                .mockResolvedValueOnce({ rows: [{ id: bugId }] })
                .mockResolvedValueOnce({ rows: [] });

            const res = await request(app)
                .post(`/bugs/${bugId}/test-executions`)
                .send({ test_execution_id: executionId });

            expect(res.status).toBe(404);
            expect(res.body.error).toBe('Test execution not found');
        });

        test('creates link and auto-triages bug', async () => {
            const linkRow = {
                id: 'link-id', bug_id: bugId, test_execution_id: executionId,
                created_by: '22222222-2222-2222-2222-222222222222',
            };
            mockQuery
                .mockResolvedValueOnce({ rows: [{ id: bugId }] })
                .mockResolvedValueOnce({ rows: [{ id: executionId }] })
                .mockResolvedValueOnce({ rows: [linkRow] })
                .mockResolvedValueOnce({ rows: [] });

            const res = await request(app)
                .post(`/bugs/${bugId}/test-executions`)
                .send({ test_execution_id: executionId });

            expect(res.status).toBe(201);
            expect(res.body.data.test_execution_id).toBe(executionId);

            const triageCall = mockQuery.mock.calls.find(
                c => c[0].includes("triage_status = 'triaged'")
            );
            expect(triageCall).toBeTruthy();
        });

        test('returns 409 on duplicate link', async () => {
            mockQuery
                .mockResolvedValueOnce({ rows: [{ id: bugId }] })
                .mockResolvedValueOnce({ rows: [{ id: executionId }] })
                .mockResolvedValueOnce({ rows: [] });

            const res = await request(app)
                .post(`/bugs/${bugId}/test-executions`)
                .send({ test_execution_id: executionId });

            expect(res.status).toBe(409);
        });
    });

    describe('DELETE /bugs/:id/test-executions/:executionId', () => {
        test('returns 404 when link not found', async () => {
            mockQuery
                .mockResolvedValueOnce({ rows: [] });

            const res = await request(app).delete(`/bugs/${bugId}/test-executions/${executionId}`);

            expect(res.status).toBe(404);
        });

        test('deletes link and downgrades to untriaged when no evidence remains', async () => {
            mockQuery
                .mockResolvedValueOnce({ rows: [{ id: 'link-id' }] })
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] });

            const res = await request(app).delete(`/bugs/${bugId}/test-executions/${executionId}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

            const untriagedCall = mockQuery.mock.calls.find(
                c => c[0].includes("triage_status = 'untriaged'")
            );
            expect(untriagedCall).toBeTruthy();
        });

        test('keeps triaged status when other evidence remains', async () => {
            mockQuery
                .mockResolvedValueOnce({ rows: [{ id: 'link-id' }] })
                .mockResolvedValueOnce({ rows: [{ id: 'still-here' }] });

            const res = await request(app).delete(`/bugs/${bugId}/test-executions/${executionId}`);

            expect(res.status).toBe(200);

            const untriagedCall = mockQuery.mock.calls.find(
                c => c[0].includes("triage_status = 'untriaged'")
            );
            expect(untriagedCall).toBeFalsy();
        });
    });

    describe('GET /bugs/:id/tasks', () => {
        test('returns 404 when bug not found', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            const res = await request(app).get(`/bugs/${bugId}/tasks`);

            expect(res.status).toBe(404);
        });

        test('returns linked tasks', async () => {
            mockQuery
                .mockResolvedValueOnce({ rows: [{ id: bugId }] })
                .mockResolvedValueOnce({
                    rows: [{
                        id: 'link-id', bug_id: bugId, task_id: taskId,
                        relationship_type: 'reported_against',
                        task_display_id: 'TSK-001', task_name: 'Build login', task_status: 'In Progress',
                    }],
                });

            const res = await request(app).get(`/bugs/${bugId}/tasks`);

            expect(res.status).toBe(200);
            expect(res.body.data).toHaveLength(1);
        });
    });

    describe('POST /bugs/:id/tasks', () => {
        test('returns 400 when task_id missing', async () => {
            const res = await request(app)
                .post(`/bugs/${bugId}/tasks`)
                .send({});

            expect(res.status).toBe(400);
        });

        test('creates link and auto-triages bug', async () => {
            const linkRow = {
                id: 'link-id', bug_id: bugId, task_id: taskId,
                relationship_type: 'reported_against', created_by: '22222222-2222-2222-2222-222222222222',
            };
            mockQuery
                .mockResolvedValueOnce({ rows: [{ id: bugId }] })
                .mockResolvedValueOnce({ rows: [{ id: taskId }] })
                .mockResolvedValueOnce({ rows: [linkRow] })
                .mockResolvedValueOnce({ rows: [] });

            const res = await request(app)
                .post(`/bugs/${bugId}/tasks`)
                .send({ task_id: taskId });

            expect(res.status).toBe(201);
            expect(res.body.data.task_id).toBe(taskId);
        });
    });

    describe('DELETE /bugs/:id/tasks/:taskId', () => {
        test('returns 404 when link not found', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            const res = await request(app).delete(`/bugs/${bugId}/tasks/${taskId}`);

            expect(res.status).toBe(404);
        });

        test('deletes link and auto-downgrades when no evidence', async () => {
            mockQuery
                .mockResolvedValueOnce({ rows: [{ id: 'link-id' }] })
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] });

            const res = await request(app).delete(`/bugs/${bugId}/tasks/${taskId}`);

            expect(res.status).toBe(200);

            const untriagedCall = mockQuery.mock.calls.find(
                c => c[0].includes("triage_status = 'untriaged'")
            );
            expect(untriagedCall).toBeTruthy();
        });
    });
});

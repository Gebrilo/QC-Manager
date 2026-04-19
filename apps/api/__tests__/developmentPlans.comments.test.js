'use strict';

process.env.SUPABASE_JWT_SECRET = 'test-secret';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery }));

jest.mock('jsonwebtoken', () => ({
    verify: jest.fn().mockReturnValue({ sub: 'supabase-uid' }),
}));

jest.mock('../src/middleware/authMiddleware', () => ({
    requireAuth: (req, _res, next) => next(),
    requireRole: () => (req, _res, next) => next(),
}));

jest.mock('../src/middleware/teamAccess', () => ({
    canAccessUser: jest.fn(),
    getManagerTeamId: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const { canAccessUser } = require('../src/middleware/teamAccess');
const router = require('../src/routes/developmentPlans');

function makeUserApp() {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { id: 'user-1', role: 'user' }; next(); });
    app.use('/development-plans', router);
    return app;
}

function makeManagerApp() {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { id: 'manager-1', role: 'manager' }; next(); });
    app.use('/development-plans', router);
    return app;
}

afterEach(() => jest.resetAllMocks());

describe('GET /development-plans/my/tasks/:taskId/comments', () => {
    test('returns comment list ordered oldest-first', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'task-1' }] })
            .mockResolvedValueOnce({ rows: [
                { id: 'c-1', body: 'first', author_id: 'user-1', author_name: 'Alice', author_role: 'user', created_at: '2026-04-01T00:00:00Z' },
                { id: 'c-2', body: 'second', author_id: 'manager-1', author_name: 'Bob', author_role: 'manager', created_at: '2026-04-02T00:00:00Z' },
            ] });

        const res = await request(makeUserApp())
            .get('/development-plans/my/tasks/task-1/comments');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
        expect(res.body[0].body).toBe('first');
        expect(res.body[0].author_name).toBe('Alice');
        expect(res.body[0].author_role).toBe('user');
        expect(res.body[1].author_name).toBe('Bob');

        const listQuery = mockQuery.mock.calls[2][0];
        expect(listQuery).toMatch(/ORDER BY c\.created_at ASC/);
        expect(listQuery).toMatch(/LEFT JOIN app_user/);
    });

    test('returns 404 if task is not in user\'s plan', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [] });

        const res = await request(makeUserApp())
            .get('/development-plans/my/tasks/task-999/comments');
        expect(res.status).toBe(404);
    });
});

describe('POST /development-plans/my/tasks/:taskId/comments', () => {
    test('creates a comment with author_id = caller', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'task-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'c-new' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'c-new', body: 'hello', author_id: 'user-1', author_name: 'Alice', author_role: 'user' }] });

        const res = await request(makeUserApp())
            .post('/development-plans/my/tasks/task-1/comments')
            .send({ body: 'hello' });

        expect(res.status).toBe(201);
        expect(res.body.body).toBe('hello');
        expect(res.body.author_name).toBe('Alice');

        const insertCall = mockQuery.mock.calls[2];
        expect(insertCall[0]).toMatch(/INSERT INTO idp_task_comment/);
        expect(insertCall[1]).toEqual(['user-1', 'task-1', 'user-1', 'hello']);

        const selectCall = mockQuery.mock.calls[3][0];
        expect(selectCall).toMatch(/LEFT JOIN app_user/);
    });

    test('rejects empty body', async () => {
        const res = await request(makeUserApp())
            .post('/development-plans/my/tasks/task-1/comments')
            .send({ body: '   ' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/body/i);
    });
});

describe('GET /development-plans/:userId/tasks/:taskId/comments (manager)', () => {
    test('returns 403 when manager cannot access user', async () => {
        canAccessUser.mockResolvedValueOnce(false);
        const res = await request(makeManagerApp())
            .get('/development-plans/user-1/tasks/task-1/comments');
        expect(res.status).toBe(403);
    });

    test('returns comments for a reachable user', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'task-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'c-1', body: 'hi', author_id: 'user-1', author_name: 'Alice', author_role: 'user' }] });

        const res = await request(makeManagerApp())
            .get('/development-plans/user-1/tasks/task-1/comments');
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].author_name).toBe('Alice');
    });
});

describe('POST /development-plans/:userId/tasks/:taskId/comments (manager)', () => {
    test('creates a comment with author_id = manager and user_id = target user', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'task-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'c-new' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'c-new', body: 'nudge', author_id: 'manager-1', author_name: 'Mgr', author_role: 'manager' }] });

        const res = await request(makeManagerApp())
            .post('/development-plans/user-1/tasks/task-1/comments')
            .send({ body: 'nudge' });

        expect(res.status).toBe(201);
        expect(res.body.author_name).toBe('Mgr');
        expect(res.body.author_role).toBe('manager');
        const insertCall = mockQuery.mock.calls[2];
        expect(insertCall[1]).toEqual(['user-1', 'task-1', 'manager-1', 'nudge']);
    });

    test('returns 403 when manager cannot access user', async () => {
        canAccessUser.mockResolvedValueOnce(false);
        const res = await request(makeManagerApp())
            .post('/development-plans/user-1/tasks/task-1/comments')
            .send({ body: 'x' });
        expect(res.status).toBe(403);
    });
});

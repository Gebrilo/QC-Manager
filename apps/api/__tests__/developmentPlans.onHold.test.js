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
const router = require('../src/routes/developmentPlans');

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { id: 'user-1', role: 'user' }; next(); });
    app.use('/development-plans', router);
    return app;
}

afterEach(() => jest.resetAllMocks());

describe('PATCH /development-plans/my/tasks/:taskId/status ON_HOLD handling', () => {
    test('returns 400 when status=ON_HOLD and comment missing', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] });
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'task-1' }] });

        const res = await request(makeApp())
            .patch('/development-plans/my/tasks/task-1/status')
            .send({ status: 'ON_HOLD' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/comment/i);
    });

    test('returns 400 when status=ON_HOLD and comment is only whitespace', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] });
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'task-1' }] });

        const res = await request(makeApp())
            .patch('/development-plans/my/tasks/task-1/status')
            .send({ status: 'ON_HOLD', comment: '   ' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/comment/i);
    });

    test('upserts completion with hold_reason and inserts a comment when entering ON_HOLD', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] });
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'task-1' }] });
        mockQuery.mockResolvedValueOnce({
            rows: [{ task_id: 'task-1', progress_status: 'ON_HOLD', hold_reason: 'Blocked on Bob' }],
        });
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'c-1' }] });

        const res = await request(makeApp())
            .patch('/development-plans/my/tasks/task-1/status')
            .send({ status: 'ON_HOLD', comment: 'Blocked on Bob' });

        expect(res.status).toBe(200);
        expect(res.body.progress_status).toBe('ON_HOLD');
        expect(res.body.hold_reason).toBe('Blocked on Bob');

        const upsertCall = mockQuery.mock.calls[2];
        expect(upsertCall[0]).toMatch(/INSERT INTO user_task_completions/);
        expect(upsertCall[0]).toMatch(/hold_reason/);
        expect(upsertCall[1]).toEqual(['user-1', 'task-1', 'ON_HOLD', 'Blocked on Bob']);

        const commentCall = mockQuery.mock.calls[3];
        expect(commentCall[0]).toMatch(/INSERT INTO idp_task_comment/);
        expect(commentCall[1]).toEqual(['user-1', 'task-1', 'user-1', 'Blocked on Bob']);
    });

    test('clears hold_reason when transitioning from ON_HOLD to IN_PROGRESS', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] });
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'task-1' }] });
        mockQuery.mockResolvedValueOnce({
            rows: [{ task_id: 'task-1', progress_status: 'IN_PROGRESS', hold_reason: null }],
        });

        const res = await request(makeApp())
            .patch('/development-plans/my/tasks/task-1/status')
            .send({ status: 'IN_PROGRESS' });

        expect(res.status).toBe(200);
        expect(res.body.progress_status).toBe('IN_PROGRESS');
        expect(res.body.hold_reason).toBeNull();

        const upsertCall = mockQuery.mock.calls[2];
        expect(upsertCall[0]).toMatch(/hold_reason\s*=\s*NULL/i);
    });

    test('rejects unknown status values', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] });

        const res = await request(makeApp())
            .patch('/development-plans/my/tasks/task-1/status')
            .send({ status: 'BOGUS' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/status must be one of/);
        expect(res.body.error).toMatch(/ON_HOLD/);
    });
});

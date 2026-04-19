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

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.user = { id: 'manager-1', role: 'manager' };
        next();
    });
    app.use('/development-plans', router);
    return app;
}

afterEach(() => jest.clearAllMocks());

describe('PATCH /development-plans/:userId/tasks/:taskId — completed-task guard', () => {
    test('succeeds when task has no completion row (TODO)', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] }) // plan
            .mockResolvedValueOnce({ rows: [] }) // no completion row
            .mockResolvedValueOnce({ rows: [{ id: 't-1', title: 'Updated', priority: 'low' }] }); // UPDATE
        const res = await request(makeApp())
            .patch('/development-plans/user-1/tasks/t-1')
            .send({ title: 'Updated', priority: 'low' });
        expect(res.status).toBe(200);
        expect(res.body.title).toBe('Updated');
    });

    test('succeeds when task is IN_PROGRESS', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [{ progress_status: 'IN_PROGRESS' }] }) // completion row
            .mockResolvedValueOnce({ rows: [{ id: 't-1', title: 'Updated' }] }); // UPDATE
        const res = await request(makeApp())
            .patch('/development-plans/user-1/tasks/t-1')
            .send({ title: 'Updated' });
        expect(res.status).toBe(200);
        expect(res.body.title).toBe('Updated');
    });

    test('returns 409 when task is DONE', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [{ progress_status: 'DONE' }] }); // completion row = DONE
        const res = await request(makeApp())
            .patch('/development-plans/user-1/tasks/t-1')
            .send({ title: 'Updated' });
        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/completed task/i);
    });
});

describe('PATCH /development-plans/:userId/plan/:planId — edit plan fields', () => {
    test('succeeds when updating title', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: 'plan-1', title: 'New Title', description: 'desc', updated_at: '2026-04-19' }],
        });
        const res = await request(makeApp())
            .patch('/development-plans/user-1/plan/plan-1')
            .send({ title: 'New Title' });
        expect(res.status).toBe(200);
        expect(res.body.title).toBe('New Title');
    });

    test('returns 400 when no fields to update', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        const res = await request(makeApp())
            .patch('/development-plans/user-1/plan/plan-1')
            .send({});
        expect(res.status).toBe(400);
    });

    test('returns 404 when plan not found', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery.mockResolvedValueOnce({ rows: [] });
        const res = await request(makeApp())
            .patch('/development-plans/user-1/plan/plan-999')
            .send({ title: 'New Title' });
        expect(res.status).toBe(404);
    });

    test('returns 403 when manager cannot access user', async () => {
        canAccessUser.mockResolvedValueOnce(false);
        const res = await request(makeApp())
            .patch('/development-plans/user-1/plan/plan-1')
            .send({ title: 'New Title' });
        expect(res.status).toBe(403);
    });
});

describe('DELETE /development-plans/:userId/tasks/:taskId — completed-task guard', () => {
    test('returns 409 when task is DONE', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [{ progress_status: 'DONE' }] }); // completion row = DONE
        const res = await request(makeApp())
            .delete('/development-plans/user-1/tasks/t-1');
        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/completed task/i);
    });

    test('succeeds when task is not DONE', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [] }) // no completion row
            .mockResolvedValueOnce({ rows: [{ id: 't-1' }] }) // task found
            .mockResolvedValueOnce({ rows: [] }); // DELETE
        const res = await request(makeApp())
            .delete('/development-plans/user-1/tasks/t-1');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});

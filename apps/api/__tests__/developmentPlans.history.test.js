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

function makeApp(userId = 'user-1') {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.user = { id: userId, role: 'user' };
        next();
    });
    app.use('/development-plans', router);
    return app;
}

afterEach(() => jest.clearAllMocks());

// ─── GET /my/history — list archived IDP plans ────────────────────────────────

describe('GET /development-plans/my/history', () => {
    test('returns empty array when no archived plans', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });
        const res = await request(makeApp())
            .get('/development-plans/my/history');
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    test('returns archived plans with progress summary', async () => {
        mockQuery
            .mockResolvedValueOnce({
                rows: [
                    { id: 'plan-a', title: 'Q1 Plan', description: 'desc', created_at: '2026-01-05', archived_at: '2026-03-31' },
                    { id: 'plan-b', title: 'Q2 Plan', description: null, created_at: '2026-04-01', archived_at: '2026-06-30' },
                ],
            })
            .mockResolvedValueOnce({
                rows: [
                    { plan_id: 'plan-a', total_tasks: '10', mandatory_tasks: '6', done_tasks: '9', mandatory_done: '6' },
                    { plan_id: 'plan-b', total_tasks: '5', mandatory_tasks: '3', done_tasks: '5', mandatory_done: '3' },
                ],
            });

        const res = await request(makeApp())
            .get('/development-plans/my/history');
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);

        const planA = res.body.find(p => p.id === 'plan-a');
        expect(planA).toBeDefined();
        expect(planA.title).toBe('Q1 Plan');
        expect(planA.progress).toEqual({
            total_tasks: 10,
            done_tasks: 9,
            completion_pct: 90,
            mandatory_tasks: 6,
            mandatory_done: 6,
        });
    });

    test('handles zero tasks gracefully', async () => {
        mockQuery
            .mockResolvedValueOnce({
                rows: [{ id: 'plan-c', title: 'Empty', description: null, created_at: '2026-01-01', archived_at: '2026-02-01' }],
            })
            .mockResolvedValueOnce({ rows: [] });

        const res = await request(makeApp())
            .get('/development-plans/my/history');
        expect(res.status).toBe(200);
        expect(res.body[0].progress).toEqual({
            total_tasks: 0,
            done_tasks: 0,
            completion_pct: 0,
            mandatory_tasks: 0,
            mandatory_done: 0,
        });
    });
});

// ─── GET /my/history/:planId — single archived plan detail ────────────────────

describe('GET /development-plans/my/history/:planId', () => {
    test('returns 404 when plan not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });
        const res = await request(makeApp())
            .get('/development-plans/my/history/nonexistent');
        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/not found/i);
    });

    test('returns archived plan detail with objectives and tasks', async () => {
        mockQuery
            .mockResolvedValueOnce({
                rows: [{
                    id: 'plan-archived', title: 'Archived Plan', description: 'desc',
                    plan_type: 'idp', is_active: false, created_at: '2026-01-01', updated_at: '2026-06-01',
                }],
            })
            .mockResolvedValueOnce({
                rows: [{ id: 'ch-1', title: 'Objective 1', description: 'obj desc', start_date: null, due_date: '2026-03-01', sort_order: 0, journey_id: 'plan-archived' }],
            })
            .mockResolvedValueOnce({
                rows: [{ id: 'q-1', title: 'Tasks', chapter_id: 'ch-1', sort_order: 0 }],
            })
            .mockResolvedValueOnce({
                rows: [{ id: 't-1', title: 'Task 1', description: null, start_date: null, due_date: '2026-02-01', priority: null, difficulty: null, is_mandatory: true, sort_order: 0, quest_id: 'q-1' }],
            })
            .mockResolvedValueOnce({
                rows: [{ task_id: 't-1', user_id: 'user-1', progress_status: 'DONE', completed_at: '2026-01-15', hold_reason: null }],
            });

        const res = await request(makeApp())
            .get('/development-plans/my/history/plan-archived');
        expect(res.status).toBe(200);
        expect(res.body.id).toBe('plan-archived');
        expect(res.body.is_active).toBe(false);
        expect(res.body.archived_at).toBe('2026-06-01');
        expect(Array.isArray(res.body.objectives)).toBe(true);
        expect(res.body.objectives).toHaveLength(1);
        expect(res.body.objectives[0].tasks).toHaveLength(1);
        expect(res.body.objectives[0].tasks[0].progress_status).toBe('DONE');
        expect(res.body.progress).toBeDefined();
        expect(res.body.progress.total_tasks).toBe(1);
        expect(res.body.progress.done_tasks).toBe(1);
    });

    test('returns 404 when plan is active (not archived)', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });
        const res = await request(makeApp())
            .get('/development-plans/my/history/active-plan-id');
        expect(res.status).toBe(404);
    });

    test('handles plan with no chapters', async () => {
        mockQuery
            .mockResolvedValueOnce({
                rows: [{
                    id: 'plan-empty', title: 'Empty Plan', description: null,
                    plan_type: 'idp', is_active: false, created_at: '2026-01-01', updated_at: '2026-02-01',
                }],
            })
            .mockResolvedValueOnce({ rows: [] });

        const res = await request(makeApp())
            .get('/development-plans/my/history/plan-empty');
        expect(res.status).toBe(200);
        expect(res.body.objectives).toEqual([]);
        expect(res.body.progress.total_tasks).toBe(0);
    });
});

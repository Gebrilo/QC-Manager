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
    canAccessUser: jest.fn().mockResolvedValue(true),
    getManagerTeamId: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const router = require('../src/routes/developmentPlans');

function makeUserApp() {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { id: 'user-1', role: 'user' }; next(); });
    app.use('/development-plans', router);
    return app;
}

afterEach(() => jest.resetAllMocks());

function stubIDPFixture({ completion }) {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'plan-1', title: 'Q2', owner_user_id: 'user-1', plan_type: 'idp', is_active: true, created_at: '2026-01-01' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'ch-1', title: 'Obj 1', sort_order: 1 }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'q-1', chapter_id: 'ch-1' }] });
    mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'task-1', quest_id: 'q-1', title: 'Ship X', due_date: '2026-03-01', is_mandatory: true }],
    });
    mockQuery.mockResolvedValueOnce({ rows: [completion] });
}

function firstPlan(res) {
    return res.body[0];
}

describe('GET /development-plans/my — hold_reason + completed_late surface', () => {
    test('completed_late=true when DONE and completed_at > due_date', async () => {
        stubIDPFixture({
            completion: {
                task_id: 'task-1',
                progress_status: 'DONE',
                completed_at: new Date('2026-03-05T00:00:00Z'),
                hold_reason: null,
            },
        });
        const res = await request(makeUserApp()).get('/development-plans/my');
        expect(res.status).toBe(200);
        expect(firstPlan(res).objectives[0].tasks[0].completed_late).toBe(true);
        expect(firstPlan(res).objectives[0].tasks[0].hold_reason).toBeNull();
    });

    test('completed_late=false when DONE and completed_at <= due_date', async () => {
        stubIDPFixture({
            completion: {
                task_id: 'task-1',
                progress_status: 'DONE',
                completed_at: new Date('2026-02-15T00:00:00Z'),
                hold_reason: null,
            },
        });
        const res = await request(makeUserApp()).get('/development-plans/my');
        expect(firstPlan(res).objectives[0].tasks[0].completed_late).toBe(false);
    });

    test('completed_late=null when task is not DONE', async () => {
        stubIDPFixture({
            completion: {
                task_id: 'task-1',
                progress_status: 'ON_HOLD',
                completed_at: null,
                hold_reason: 'Blocked on Bob',
            },
        });
        const res = await request(makeUserApp()).get('/development-plans/my');
        const task = firstPlan(res).objectives[0].tasks[0];
        expect(task.completed_late).toBeNull();
        expect(task.hold_reason).toBe('Blocked on Bob');
        expect(task.progress_status).toBe('ON_HOLD');
    });

    test('plan.progress.on_hold_tasks counts ON_HOLD completions', async () => {
        stubIDPFixture({
            completion: {
                task_id: 'task-1',
                progress_status: 'ON_HOLD',
                completed_at: null,
                hold_reason: 'Waiting',
            },
        });
        const res = await request(makeUserApp()).get('/development-plans/my');
        expect(firstPlan(res).progress.on_hold_tasks).toBe(1);
    });
});

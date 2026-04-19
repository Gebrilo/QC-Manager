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

afterEach(() => jest.resetAllMocks());

// ─── POST /:userId — create plan ─────────────────────────────────────────────

describe('POST /development-plans/:userId', () => {
    test('returns 404 when user not found', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery.mockResolvedValueOnce({ rows: [] });
        const res = await request(makeApp())
            .post('/development-plans/user-1')
            .send({ title: 'Q2 Plan' });
        expect(res.status).toBe(404);
    });

    test('returns 400 when user is not ACTIVE', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: 'user-1', status: 'PREPARATION', name: 'Sara' }],
        });
        const res = await request(makeApp())
            .post('/development-plans/user-1')
            .send({ title: 'Q2 Plan' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/ACTIVE/);
    });

    test('creates a second plan (multi-plan) and returns 201', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'user-1', status: 'ACTIVE', name: 'Sara' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'plan-2', title: 'Q2 Plan', plan_type: 'idp', owner_user_id: 'user-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'assign-1' }] });
        const res = await request(makeApp())
            .post('/development-plans/user-1')
            .send({ title: 'Q2 Plan', description: 'Focus on leadership' });
        expect(res.status).toBe(201);
        expect(res.body.plan_type).toBe('idp');
        expect(res.body.owner_user_id).toBe('user-1');
    });

    test('returns 403 when manager cannot access user', async () => {
        canAccessUser.mockResolvedValueOnce(false);
        const res = await request(makeApp())
            .post('/development-plans/user-1')
            .send({ title: 'Q2 Plan' });
        expect(res.status).toBe(403);
    });

    test('creates plan and returns 201 on success', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'user-1', status: 'ACTIVE', name: 'Sara' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1', title: 'Q2 Plan', plan_type: 'idp', owner_user_id: 'user-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'assign-1' }] });
        const res = await request(makeApp())
            .post('/development-plans/user-1')
            .send({ title: 'Q2 Plan', description: 'Focus on leadership' });
        expect(res.status).toBe(201);
        expect(res.body.plan_type).toBe('idp');
        expect(res.body.owner_user_id).toBe('user-1');
    });
});

// ─── GET /:userId — get plans (array) or single plan with ?planId= ────────────

describe('GET /development-plans/:userId', () => {
    test('returns 404 when no active IDP plan exists', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery.mockResolvedValueOnce({ rows: [] });
        const res = await request(makeApp()).get('/development-plans/user-1');
        expect(res.status).toBe(404);
    });

    test('returns array of plans with objectives', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1', title: 'Q2 Plan', plan_type: 'idp', owner_user_id: 'user-1', is_active: true }] })
            .mockResolvedValueOnce({ rows: [{ id: 'ch-1', title: 'Leadership', due_date: '2026-06-01', journey_id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'q-1', chapter_id: 'ch-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 't-1', quest_id: 'q-1', title: 'Read book', due_date: '2026-05-01', priority: 'high', is_mandatory: true }] })
            .mockResolvedValueOnce({ rows: [{ task_id: 't-1', progress_status: 'DONE' }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });
        const res = await request(makeApp()).get('/development-plans/user-1');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].objectives).toHaveLength(1);
        expect(res.body[0].progress.completion_pct).toBe(100);
    });

    test('returns single plan with ?planId=', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1', title: 'Q2 Plan', plan_type: 'idp', owner_user_id: 'user-1', is_active: true }] })
            .mockResolvedValueOnce({ rows: [{ id: 'ch-1', title: 'Leadership', due_date: '2026-06-01', journey_id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'q-1', chapter_id: 'ch-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 't-1', quest_id: 'q-1', title: 'Read book', due_date: '2026-05-01', priority: 'high', is_mandatory: true }] })
            .mockResolvedValueOnce({ rows: [{ task_id: 't-1', progress_status: 'DONE' }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });
        const res = await request(makeApp()).get('/development-plans/user-1?planId=plan-1');
        expect(res.status).toBe(200);
        expect(res.body.objectives).toHaveLength(1);
        expect(res.body.progress.completion_pct).toBe(100);
    });

    test('returns 403 when manager cannot access user', async () => {
        canAccessUser.mockResolvedValueOnce(false);
        const res = await request(makeApp()).get('/development-plans/user-1');
        expect(res.status).toBe(403);
    });
});

// ─── POST /:userId/objectives ─────────────────────────────────────────────────

describe('POST /development-plans/:userId/objectives', () => {
    test('returns 404 when no active plan exists', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery.mockResolvedValueOnce({ rows: [] });
        const res = await request(makeApp())
            .post('/development-plans/user-1/objectives')
            .send({ title: 'Leadership' });
        expect(res.status).toBe(404);
    });

    test('creates objective (chapter + system quest) and returns 201', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1', plan_type: 'idp' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'ch-1', title: 'Leadership', journey_id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'q-1' }] });
        const res = await request(makeApp())
            .post('/development-plans/user-1/objectives')
            .send({ title: 'Leadership', due_date: '2026-06-01' });
        expect(res.status).toBe(201);
        expect(res.body.id).toBe('ch-1');
    });
});

// ─── PATCH /:userId/objectives/:chapterId ────────────────────────────────────

describe('PATCH /development-plans/:userId/objectives/:chapterId', () => {
    test('returns 404 when objective not found in plan', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery.mockResolvedValueOnce({ rows: [] });
        const res = await request(makeApp())
            .patch('/development-plans/user-1/objectives/ch-99')
            .send({ title: 'Updated' });
        expect(res.status).toBe(404);
    });

    test('updates objective and returns 200', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ journey_id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'ch-1', title: 'Updated', due_date: '2026-07-01' }] });
        const res = await request(makeApp())
            .patch('/development-plans/user-1/objectives/ch-1')
            .send({ title: 'Updated', due_date: '2026-07-01' });
        expect(res.status).toBe(200);
        expect(res.body.title).toBe('Updated');
    });
});

// ─── DELETE /:userId/objectives/:chapterId ───────────────────────────────────

describe('DELETE /development-plans/:userId/objectives/:chapterId', () => {
    test('returns 404 when objective not found', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery.mockResolvedValueOnce({ rows: [] });
        const res = await request(makeApp())
            .delete('/development-plans/user-1/objectives/ch-99');
        expect(res.status).toBe(404);
    });

    test('deletes objective and returns 200', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ journey_id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [] });
        const res = await request(makeApp())
            .delete('/development-plans/user-1/objectives/ch-1');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});

// ─── POST /:userId/objectives/:chapterId/tasks ────────────────────────────────

describe('POST /development-plans/:userId/objectives/:chapterId/tasks', () => {
    test('returns 404 when objective not found for chapter', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery.mockResolvedValueOnce({ rows: [] });
        const res = await request(makeApp())
            .post('/development-plans/user-1/objectives/ch-1/tasks')
            .send({ title: 'Read book' });
        expect(res.status).toBe(404);
    });

    test('creates task and returns 201', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ journey_id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'q-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 't-1', title: 'Read book', quest_id: 'q-1' }] });
        const res = await request(makeApp())
            .post('/development-plans/user-1/objectives/ch-1/tasks')
            .send({ title: 'Read book', due_date: '2026-05-01', priority: 'high' });
        expect(res.status).toBe(201);
        expect(res.body.title).toBe('Read book');
    });
});

// ─── PATCH /:userId/tasks/:taskId ────────────────────────────────────────────

describe('PATCH /development-plans/:userId/tasks/:taskId', () => {
    test('returns 404 when task not found', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery.mockResolvedValueOnce({ rows: [] });
        const res = await request(makeApp())
            .patch('/development-plans/user-1/tasks/t-99')
            .send({ title: 'Updated' });
        expect(res.status).toBe(404);
    });

    test('updates task fields and returns 200', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ journey_id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ id: 't-1', title: 'Updated', priority: 'low' }] });
        const res = await request(makeApp())
            .patch('/development-plans/user-1/tasks/t-1')
            .send({ title: 'Updated', priority: 'low' });
        expect(res.status).toBe(200);
        expect(res.body.priority).toBe('low');
    });
});

// ─── DELETE /:userId/tasks/:taskId ───────────────────────────────────────────

describe('DELETE /development-plans/:userId/tasks/:taskId', () => {
    test('deletes task and returns 200', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ journey_id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });
        const res = await request(makeApp())
            .delete('/development-plans/user-1/tasks/t-1');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});

// ─── User app — makeApp with user role ────────────────────────────────────────

function makeUserApp(userId = 'user-1') {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.user = { id: userId, role: 'user' };
        next();
    });
    app.use('/development-plans', router);
    return app;
}

// ─── GET /my ─────────────────────────────────────────────────────────────────

describe('GET /development-plans/my', () => {
    test('returns empty array when user has no active IDP plan', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });
        const res = await request(makeUserApp()).get('/development-plans/my');
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    test('returns array of plans with objectives for ACTIVE user', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1', title: 'Q2 Plan', plan_type: 'idp', owner_user_id: 'user-1', is_active: true }] })
            .mockResolvedValueOnce({ rows: [] });
        const res = await request(makeUserApp()).get('/development-plans/my');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].title).toBe('Q2 Plan');
    });
});

// ─── PATCH /my/tasks/:taskId/status ─────────────────────────────────────────

describe('PATCH /development-plans/my/tasks/:taskId/status', () => {
    test('returns 400 for invalid status value', async () => {
        const res = await request(makeUserApp())
            .patch('/development-plans/my/tasks/t-1/status')
            .send({ status: 'INVALID' });
        expect(res.status).toBe(400);
    });

    test('inserts IN_PROGRESS completion row', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 't-1' }] })
            .mockResolvedValueOnce({ rows: [{ task_id: 't-1', progress_status: 'IN_PROGRESS' }] });
        const res = await request(makeUserApp())
            .patch('/development-plans/my/tasks/t-1/status')
            .send({ status: 'IN_PROGRESS' });
        expect(res.status).toBe(200);
        expect(res.body.progress_status).toBe('IN_PROGRESS');
    });

    test('deletes completion row when status is TODO', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 't-1' }] })
            .mockResolvedValueOnce({ rows: [] });
        const res = await request(makeUserApp())
            .patch('/development-plans/my/tasks/t-1/status')
            .send({ status: 'TODO' });
        expect(res.status).toBe(200);
        expect(res.body.progress_status).toBe('TODO');
    });
});

// ─── POST /:userId/complete ───────────────────────────────────────────────────

describe('POST /development-plans/:userId/complete', () => {
    test('returns 400 when mandatory tasks are incomplete', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1', required_xp: 100 }] })
            .mockResolvedValueOnce({ rows: [{ incomplete_mandatory: '2' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1', required_xp: 100, owner_user_id: 'user-1' }] });
        const res = await request(makeApp())
            .post('/development-plans/user-1/complete')
            .send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/incomplete/i);
    });

    test('marks plan complete and awards XP', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1', required_xp: 100, owner_user_id: 'user-1' }] })
            .mockResolvedValueOnce({ rows: [{ incomplete_mandatory: '0' }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });
        const res = await request(makeApp())
            .post('/development-plans/user-1/complete')
            .send({ planId: 'plan-1' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});

// ─── GET /:userId/report ────────────────────────────────────────────────────

describe('GET /development-plans/:userId/report', () => {
    test('returns 404 when no plan exists', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'u-1', name: 'Sara', email: 's@test.com' }] })
            .mockResolvedValueOnce({ rows: [] });
        const res = await request(makeApp()).get('/development-plans/user-1/report');
        expect(res.status).toBe(404);
    });

    test('returns report with summary and objectives', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'u-1', name: 'Sara', email: 's@test.com' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1', title: 'Q2', created_at: '2026-01-01', is_active: true }] })
            .mockResolvedValueOnce({ rows: [{ id: 'ch-1', title: 'Leadership', due_date: '2026-06-01' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'q-1', chapter_id: 'ch-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 't-1', quest_id: 'q-1', title: 'Read book', due_date: '2026-05-01', is_mandatory: true }] })
            .mockResolvedValueOnce({ rows: [{ task_id: 't-1', progress_status: 'DONE', completed_at: '2026-04-10' }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });
        const res = await request(makeApp()).get('/development-plans/user-1/report?planId=plan-1');
        expect(res.status).toBe(200);
        expect(res.body.summary.total_tasks).toBe(1);
        expect(res.body.summary.completed_tasks).toBe(1);
        expect(res.body.objectives).toHaveLength(1);
        expect(res.body.plan.status).toBe('active');
    });
});

describe('GET /development-plans/:userId/report on_hold_tasks', () => {
    test('summary.on_hold_tasks counts ON_HOLD completions across all objectives', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'user-1', name: 'Sara', email: 's@e.com' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1', title: 'Q2', created_at: '2026-01-01', is_active: true }] })
            .mockResolvedValueOnce({ rows: [{ id: 'ch-1', title: 'Obj', sort_order: 1 }] })
            .mockResolvedValueOnce({ rows: [{ id: 'q-1', chapter_id: 'ch-1' }] })
            .mockResolvedValueOnce({ rows: [
                { id: 't-1', quest_id: 'q-1', title: 'A', is_mandatory: true, due_date: '2026-03-01' },
                { id: 't-2', quest_id: 'q-1', title: 'B', is_mandatory: true, due_date: '2026-03-15' },
            ] })
            .mockResolvedValueOnce({ rows: [
                { task_id: 't-1', progress_status: 'ON_HOLD', completed_at: null },
                { task_id: 't-2', progress_status: 'DONE',    completed_at: new Date('2026-03-10T00:00:00Z') },
            ] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        const res = await request(makeApp()).get('/development-plans/user-1/report?planId=plan-1');
        expect(res.body.summary.on_hold_tasks).toBe(1);
        expect(res.body.summary.completed_tasks).toBe(1);
    });
});
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

describe('POST /:userId/tasks/:taskId/links — manager adds a link', () => {
    test('returns 201 with inserted link', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'task-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'link-1', task_id: 'task-1', url: 'https://example.com', label: 'Example', created_by: 'manager-1' }] });

        const res = await request(makeManagerApp())
            .post('/development-plans/user-1/tasks/task-1/links')
            .send({ url: 'https://example.com', label: 'Example' });

        expect(res.status).toBe(201);
        expect(res.body.url).toBe('https://example.com');
        expect(res.body.label).toBe('Example');
    });

    test('returns 404 when task not found', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const res = await request(makeManagerApp())
            .post('/development-plans/user-1/tasks/task-999/links')
            .send({ url: 'https://example.com', label: 'Test' });

        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/not found/i);
    });
});

describe('GET /my/tasks/:taskId/links — resource views links', () => {
    test('returns 200 with link array', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [
                { id: 'link-1', url: 'https://example.com', label: 'Guide', created_at: '2026-04-01T00:00:00Z', created_by_name: 'Manager Bob' },
            ],
        });

        const res = await request(makeUserApp())
            .get('/development-plans/my/tasks/task-1/links');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].url).toBe('https://example.com');
        expect(res.body[0].created_by_name).toBe('Manager Bob');
    });
});

describe('DELETE /:userId/tasks/:taskId/links/:linkId — manager deletes link', () => {
    test('returns 200 with deleted: true', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'link-1' }] });

        const res = await request(makeManagerApp())
            .delete('/development-plans/user-1/tasks/task-1/links/link-1');

        expect(res.status).toBe(200);
        expect(res.body.deleted).toBe(true);
    });

    test('returns 404 when link not found', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const res = await request(makeManagerApp())
            .delete('/development-plans/user-1/tasks/task-1/links/link-999');

        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/not found/i);
    });
});

describe('POST /my/tasks/:taskId/links — resource blocked', () => {
    test('returns 403', async () => {
        const res = await request(makeUserApp())
            .post('/development-plans/my/tasks/task-1/links')
            .send({ url: 'https://example.com', label: 'Test' });

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/manager/i);
    });
});

describe('Link validation', () => {
    test('rejects invalid URL', async () => {
        const res = await request(makeManagerApp())
            .post('/development-plans/user-1/tasks/task-1/links')
            .send({ url: 'not-a-url', label: 'Test' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/url/i);
    });

    test('rejects empty label', async () => {
        const res = await request(makeManagerApp())
            .post('/development-plans/user-1/tasks/task-1/links')
            .send({ url: 'https://example.com', label: '' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/label/i);
    });
});

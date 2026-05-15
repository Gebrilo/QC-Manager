'use strict';

process.env.SUPABASE_JWT_SECRET = 'test-secret';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery }));

jest.mock('jsonwebtoken', () => ({
    verify: jest.fn().mockReturnValue({ sub: 'supabase-123' }),
}));

const express = require('express');
const request = require('supertest');
const { SCOPES } = require('../../shared/rbac/catalog.ts');
const { requireAuth, requireStatus, requireStatusScope } = require('../src/middleware/authMiddleware');

function makeApp(statuses) {
    const app = express();
    app.use(express.json());
    app.get('/test', requireAuth, requireStatus(...statuses), (_req, res) => res.json({ ok: true }));
    return app;
}

afterEach(() => jest.clearAllMocks());

test('allows request when user status matches', async () => {
    mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'u1', email: 'a@b.com', name: 'A', role: 'user', active: true, status: 'ACTIVE', team_membership_active: true }],
    });
    const res = await request(makeApp(['ACTIVE']))
        .get('/test')
        .set('Authorization', 'Bearer fake-token');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
});

test('returns 403 when user status does not match', async () => {
    mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'u1', email: 'a@b.com', name: 'A', role: 'user', active: true, status: 'PREPARATION', team_membership_active: false }],
    });
    const res = await request(makeApp(['ACTIVE']))
        .get('/test')
        .set('Authorization', 'Bearer fake-token');
    expect(res.status).toBe(403);
    expect(res.body.current).toBe('PREPARATION');
});

test('allows when one of multiple statuses matches', async () => {
    mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'u1', email: 'a@b.com', name: 'A', role: 'user', active: true, status: 'PREPARATION', team_membership_active: false }],
    });
    const res = await request(makeApp(['PREPARATION', 'ACTIVE']))
        .get('/test')
        .set('Authorization', 'Bearer fake-token');
    expect(res.status).toBe(200);
});

test('allows request when catalog status scope matches', async () => {
    mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'u1', email: 'a@b.com', name: 'A', role: 'user', active: true, status: 'ACTIVE', team_membership_active: true }],
    });

    const app = express();
    app.get('/test', requireAuth, requireStatusScope(SCOPES.ACTIVE_ONLY.key), (_req, res) => res.json({ ok: true }));

    const res = await request(app)
        .get('/test')
        .set('Authorization', 'Bearer fake-token');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
});

'use strict';

// Integration tests for the GET /notifications query params
// (pagination + entity_type + type + unread_only).
// Issues #211: dedicated inbox page with filters.

const mockQuery = jest.fn();

jest.mock('../src/config/db', () => ({
    query: (...args) => mockQuery(...args),
    pool: { query: (...args) => mockQuery(...args) },
}));

jest.mock('../src/middleware/authMiddleware', () => ({
    requireAuth: (req, _res, next) => { req.user = { id: 'user-1' }; next(); },
    requirePermission: () => (_req, _res, next) => next(),
}));

// resolveNotificationTarget is only used by /:id/open — stub it so requiring
// the route file doesn't pull in access/AccessEngine.
jest.mock('../src/services/notifications/open', () => ({
    resolveNotificationTarget: jest.fn(),
}));

jest.mock('../src/services/notifications/dispatcher', () => ({
    insertNotification: jest.fn(),
}));

const request = require('supertest');
const express = require('express');
const router = require('../src/routes/notifications');

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use('/notifications', router);
    return app;
}

beforeEach(() => mockQuery.mockReset());

// ── Helpers ────────────────────────────────────────────────────────────────
function queuedRows(rows) {
    return Promise.resolve({ rows });
}

function getSqlCall(idx) {
    return mockQuery.mock.calls[idx][0];
}

function getSqlParams(idx) {
    return mockQuery.mock.calls[idx][1];
}

describe('GET /notifications — pagination & filters (issue #211)', () => {
    test('returns the default page/limit shape and unread_count when no params are provided', async () => {
        // 1) data query
        // 2) count query (filtered)
        // 3) unread-count query (unfiltered)
        mockQuery
            .mockResolvedValueOnce(queuedRows([{ id: 'n1', type: 'bug_created' }]))
            .mockResolvedValueOnce(queuedRows([{ count: '1' }]))
            .mockResolvedValueOnce(queuedRows([{ count: '0' }]));

        const res = await request(makeApp()).get('/notifications');

        expect(res.status).toBe(200);
        expect(res.body).toEqual(expect.objectContaining({
            notifications: [{ id: 'n1', type: 'bug_created' }],
            unread_count: 0,
            total: 1,
            page: 1,
            limit: 20,
            total_pages: 1,
        }));

        // Default limit=20 means offset 0
        const dataParams = getSqlParams(0);
        expect(dataParams).toEqual(['user-1', 20, 0]);
    });

    test('honors ?page=2&limit=5 (offset = (page-1) * limit)', async () => {
        mockQuery
            .mockResolvedValueOnce(queuedRows([{ id: 'n6' }, { id: 'n7' }]))
            .mockResolvedValueOnce(queuedRows([{ count: '42' }]))
            .mockResolvedValueOnce(queuedRows([{ count: '7' }]));

        const res = await request(makeApp()).get('/notifications?page=2&limit=5');

        expect(res.status).toBe(200);
        expect(res.body.page).toBe(2);
        expect(res.body.limit).toBe(5);
        expect(res.body.total).toBe(42);
        expect(res.body.total_pages).toBe(9); // ceil(42/5)
        expect(getSqlParams(0)).toEqual(['user-1', 5, 5]);
    });

    test('clamps limit to a max of 100', async () => {
        mockQuery
            .mockResolvedValueOnce(queuedRows([]))
            .mockResolvedValueOnce(queuedRows([{ count: '0' }]))
            .mockResolvedValueOnce(queuedRows([{ count: '0' }]));

        const huge = await request(makeApp()).get('/notifications?limit=9999');
        expect(huge.status).toBe(200);
        expect(huge.body.limit).toBe(100);
    });

    test('limit=0 falls through to default 20', async () => {
        mockQuery
            .mockResolvedValueOnce(queuedRows([]))
            .mockResolvedValueOnce(queuedRows([{ count: '0' }]))
            .mockResolvedValueOnce(queuedRows([{ count: '0' }]));

        const zero = await request(makeApp()).get('/notifications?limit=0');
        expect(zero.body.limit).toBe(20);
    });

    test('negative limit gets clamped to 1', async () => {
        mockQuery
            .mockResolvedValueOnce(queuedRows([]))
            .mockResolvedValueOnce(queuedRows([{ count: '0' }]))
            .mockResolvedValueOnce(queuedRows([{ count: '0' }]));

        const neg = await request(makeApp()).get('/notifications?limit=-5');
        expect(neg.body.limit).toBe(1);
    });

    test('clamps page to a min of 1 (invalid input → 1)', async () => {
        mockQuery
            .mockResolvedValueOnce(queuedRows([]))
            .mockResolvedValueOnce(queuedRows([{ count: '0' }]))
            .mockResolvedValueOnce(queuedRows([{ count: '0' }]));

        const res = await request(makeApp()).get('/notifications?page=0');
        expect(res.status).toBe(200);
        expect(res.body.page).toBe(1);
    });

    test('?unread_only=true adds the read = false predicate to the filtered queries', async () => {
        mockQuery
            .mockResolvedValueOnce(queuedRows([{ id: 'u1' }]))
            .mockResolvedValueOnce(queuedRows([{ count: '1' }]))
            .mockResolvedValueOnce(queuedRows([{ count: '1' }]));

        const res = await request(makeApp()).get('/notifications?unread_only=true');

        expect(res.status).toBe(200);
        // The data + count queries should both contain "read = false".
        const dataSql = getSqlCall(0);
        const countSql = getSqlCall(1);
        expect(dataSql).toMatch(/read = false/i);
        expect(countSql).toMatch(/read = false/i);
        expect(res.body.unread_count).toBe(1);
    });

    test('?entity_type=bug adds the entity_type predicate and is parameterised', async () => {
        mockQuery
            .mockResolvedValueOnce(queuedRows([]))
            .mockResolvedValueOnce(queuedRows([{ count: '0' }]))
            .mockResolvedValueOnce(queuedRows([{ count: '0' }]));

        const res = await request(makeApp()).get('/notifications?entity_type=bug');

        expect(res.status).toBe(200);
        // Param order: user_id, entity_type, limit, offset
        const dataParams = getSqlParams(0);
        expect(dataParams).toEqual(['user-1', 'bug', 20, 0]);
        expect(getSqlCall(0)).toMatch(/entity_type = \$2/);
    });

    test('?type=bug_created adds the type predicate', async () => {
        mockQuery
            .mockResolvedValueOnce(queuedRows([]))
            .mockResolvedValueOnce(queuedRows([{ count: '0' }]))
            .mockResolvedValueOnce(queuedRows([{ count: '0' }]));

        const res = await request(makeApp()).get('/notifications?type=bug_created');

        expect(res.status).toBe(200);
        const dataParams = getSqlParams(0);
        expect(dataParams).toEqual(['user-1', 'bug_created', 20, 0]);
        expect(getSqlCall(0)).toMatch(/type = \$2/);
    });

    test('combines all three filters with sequential $n placeholders', async () => {
        mockQuery
            .mockResolvedValueOnce(queuedRows([]))
            .mockResolvedValueOnce(queuedRows([{ count: '0' }]))
            .mockResolvedValueOnce(queuedRows([{ count: '0' }]));

        const res = await request(makeApp()).get(
            '/notifications?unread_only=true&entity_type=bug&type=bug_created&page=3&limit=10'
        );

        expect(res.status).toBe(200);
        // user_id, read predicate is boolean (no param), entity_type, type, limit, offset
        const dataParams = getSqlParams(0);
        expect(dataParams).toEqual(['user-1', 'bug', 'bug_created', 10, 20]);
        // All three filter clauses appear in the SQL
        const sql = getSqlCall(0);
        expect(sql).toMatch(/read = false/i);
        expect(sql).toMatch(/entity_type = \$2/);
        expect(sql).toMatch(/type = \$3/);
        expect(res.body.page).toBe(3);
        expect(res.body.limit).toBe(10);
    });

    test('total_pages = 1 when total = 0 (no division-by-zero)', async () => {
        mockQuery
            .mockResolvedValueOnce(queuedRows([]))
            .mockResolvedValueOnce(queuedRows([{ count: '0' }]))
            .mockResolvedValueOnce(queuedRows([{ count: '0' }]));

        const res = await request(makeApp()).get('/notifications');

        expect(res.status).toBe(200);
        expect(res.body.total).toBe(0);
        expect(res.body.total_pages).toBe(1);
    });
});

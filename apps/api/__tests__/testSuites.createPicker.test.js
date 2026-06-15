'use strict';

// Tests for issue #216 — suite create picker (Suggested / All / Search
// before the suite exists) and the new GET /test-cases filters.
//
// Verifies:
//   - GET /test-cases now accepts category, suite_title, created_by,
//     tags, and match_suite_title (+ suite_name) query params.
//   - match_suite_title applies normalized exact match against a
//     caller-supplied suite name (no suite row exists at create time).
//   - The new filters are appended to the WHERE clause, scoped via
//     project_id, and don't break the existing search/priority/etc.
//     filters.
//   - POST /test-suites accepts test_case_ids[] and links the selected
//     cases via the existing test_suite_cases insert loop.
//   - Cross-project test case ids are rejected by the suite create
//     endpoint (existing behaviour, now exercised end-to-end).

const queries = [];
let queryHandler = async () => ({ rows: [] });

const mockQuery = jest.fn(async (sql, params) => {
    queries.push({ sql, params });
    return queryHandler(sql, params);
});

const mockClient = { query: mockQuery, release: jest.fn() };

jest.mock('../src/config/db', () => ({
    query: (...args) => mockQuery(...args),
    pool: {
        query: (...args) => mockQuery(...args),
        connect: jest.fn().mockResolvedValue(mockClient),
    },
}));

const mockCurrentUser = { value: null };
jest.mock('../src/middleware/authMiddleware', () => ({
    requireAuth: (req, _res, next) => { req.user = mockCurrentUser.value; next(); },
    blockContributors: (_req, _res, next) => next(),
    requirePermission: () => (_req, _res, next) => next(),
}));

jest.mock('../src/access/RoleResolver', () => ({
    resolve: jest.fn(),
    canonicalRole: (role) => (role === 'manager' ? 'team_manager' : role),
}));

jest.mock('../src/middleware/audit', () => ({
    auditLog: jest.fn(async () => {}),
    auditMiddleware: (_req, _res, next) => next(),
}));

jest.mock('../src/services/notifications/dispatcher', () => ({
    dispatchFromAudit: jest.fn(() => Promise.resolve()),
}));

const express = require('express');
const request = require('supertest');
const testSuitesRouter = require('../src/routes/testSuites');
const testCasesRouter = require('../src/routes/testCases');

function makeTestCasesApp() {
    const a = express();
    a.use(express.json());
    a.use('/test-cases', testCasesRouter);
    return a;
}

function makeTestSuitesApp() {
    const a = express();
    a.use(express.json());
    a.use('/test-suites', testSuitesRouter);
    return a;
}

function setUser() {
    mockCurrentUser.value = { id: 'u-1', email: 'user@x.io', role: 'admin' };
}

function findListQuery() {
    return queries.find(q =>
        /FROM v_test_case_summary/i.test(q.sql) && /ORDER BY/i.test(q.sql)
    );
}

beforeEach(() => {
    jest.clearAllMocks();
    queries.length = 0;
    setUser();
    queryHandler = async (sql) => {
        if (/^SELECT COUNT/i.test(sql)) return { rows: [{ total: '0' }] };
        if (/COUNT\(\*\) FILTER/i.test(sql)) return { rows: [{ active_count: '0', critical_count: '0', automated_count: '0' }] };
        return { rows: [] };
    };
});

// ── GET /test-cases new filters ──────────────────────────────────────────────

describe('GET /test-cases — new filters for create-page picker', () => {
    test('category adds a parameterized = clause', async () => {
        const res = await request(makeTestCasesApp())
            .get('/test-cases')
            .query({ category: 'functional' });
        expect(res.status).toBe(200);
        const q = findListQuery();
        expect(q.sql).toMatch(/category\s*=\s*\$\d+/i);
        expect(q.params).toContain('functional');
    });

    test('suite_title adds a parameterized = clause', async () => {
        const res = await request(makeTestCasesApp())
            .get('/test-cases')
            .query({ suite_title: 'Auth / Login' });
        expect(res.status).toBe(200);
        const q = findListQuery();
        expect(q.sql).toMatch(/suite_title\s*=\s*\$\d+/i);
        expect(q.params).toContain('Auth / Login');
    });

    test('created_by adds a parameterized = clause', async () => {
        const res = await request(makeTestCasesApp())
            .get('/test-cases')
            .query({ created_by: 'u-creator' });
        expect(res.status).toBe(200);
        const q = findListQuery();
        expect(q.sql).toMatch(/created_by\s*=\s*\$\d+/i);
        expect(q.params).toContain('u-creator');
    });

    test('tags (comma-separated) adds a tags && $N::text[] clause', async () => {
        const res = await request(makeTestCasesApp())
            .get('/test-cases')
            .query({ tags: 'login, smoke' });
        expect(res.status).toBe(200);
        const q = findListQuery();
        expect(q.sql).toMatch(/tags\s*&&\s*\$\d+::text\[\]/i);
        const arrayParam = q.params.find(p => Array.isArray(p) && p.length === 2);
        expect(arrayParam).toEqual(['login', 'smoke']);
    });

    test('match_suite_title=true without suite_name adds no match clause', async () => {
        const res = await request(makeTestCasesApp())
            .get('/test-cases')
            .query({ match_suite_title: 'true' });
        expect(res.status).toBe(200);
        const q = findListQuery();
        expect(q.sql).not.toMatch(/lower\(regexp_replace\(trim\(suite_title\)/i);
    });

    test('match_suite_title + suite_name applies normalized match against the typed name', async () => {
        const res = await request(makeTestCasesApp())
            .get('/test-cases')
            .query({ match_suite_title: 'true', suite_name: 'Auth Suite' });
        expect(res.status).toBe(200);
        const q = findListQuery();
        // Both sides of the comparison must be normalized.
        expect(q.sql).toMatch(/lower\(regexp_replace\(trim\(suite_title\), '\\s\+', ' ', 'g'\)\)/i);
        expect(q.sql).toMatch(/lower\(regexp_replace\(trim\(\$\d+\), '\\s\+', ' ', 'g'\)\)/i);
        // The right-hand side is the caller-supplied name.
        expect(q.params).toContain('Auth Suite');
    });

    test('match_suite_title requires project_id is also applied when provided', async () => {
        const res = await request(makeTestCasesApp())
            .get('/test-cases')
            .query({
                match_suite_title: 'true',
                suite_name: 'Auth',
                project_id: '11111111-1111-1111-1111-111111111111',
            });
        expect(res.status).toBe(200);
        const q = findListQuery();
        expect(q.sql).toMatch(/project_id\s*=\s*\$\d+/i);
        expect(q.params).toContain('11111111-1111-1111-1111-111111111111');
        expect(q.params).toContain('Auth');
    });
});

// ── POST /test-suites with test_case_ids ─────────────────────────────────────

describe('POST /test-suites — test_case_ids[] linking at create time', () => {
    test('links the provided test_case_ids via INSERT into test_suite_cases', async () => {
        const suiteName = 'Auth Suite';
        const projectId = '11111111-1111-1111-1111-111111111111';
        const validIds = ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'];
        queryHandler = async (sql, params) => {
            if (/SELECT COALESCE\(MAX\(CAST\(SUBSTRING\(suite_id/i.test(sql)) {
                return { rows: [{ next_id: 1 }] };
            }
            if (/INSERT INTO test_suites/i.test(sql)) {
                return { rows: [{
                    id: 'suite-new', suite_id: 'TS-00001', name: suiteName, project_id: projectId,
                }] };
            }
            if (/SELECT id, project_id FROM test_case WHERE id = ANY/i.test(sql)) {
                return { rows: validIds.map(id => ({ id, project_id: projectId })) };
            }
            if (/SELECT ts\.\*,.*COUNT.*FROM test_suites ts LEFT JOIN/i.test(sql)) {
                return { rows: [{
                    id: 'suite-new', suite_id: 'TS-00001', name: suiteName, project_id: projectId,
                    test_case_count: 0, project_name: 'Test',
                }] };
            }
            return { rows: [] };
        };
        const res = await request(makeTestSuitesApp())
            .post('/test-suites')
            .send({ name: suiteName, project_id: projectId, test_case_ids: validIds });
        expect(res.status).toBe(201);
        const inserts = queries.filter(q => /INSERT INTO test_suite_cases/i.test(q.sql));
        expect(inserts.length).toBe(2);
        // sort_order is 1, 2.
        expect(inserts[0].params[2]).toBe(1);
        expect(inserts[1].params[2]).toBe(2);
    });

    test('rejects cross-project test_case_ids with 400', async () => {
        const suiteName = 'Auth Suite';
        const projectId = '11111111-1111-1111-1111-111111111111';
        const validIds = ['11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333'];
        queryHandler = async (sql, params) => {
            if (/SELECT COALESCE\(MAX/i.test(sql)) {
                return { rows: [{ next_id: 1 }] };
            }
            if (/INSERT INTO test_suites/i.test(sql)) {
                return { rows: [{
                    id: 'suite-new', suite_id: 'TS-00001', name: suiteName, project_id: projectId,
                }] };
            }
            if (/SELECT id, project_id FROM test_case WHERE id = ANY/i.test(sql)) {
                // One cross-project id.
                return { rows: [
                    { id: validIds[0], project_id: projectId },
                    { id: validIds[1], project_id: 'p-other' },
                ] };
            }
            return { rows: [] };
        };
        const res = await request(makeTestSuitesApp())
            .post('/test-suites')
            .send({ name: suiteName, project_id: projectId, test_case_ids: validIds });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/same project/i);
        expect(res.body.details).toBeDefined();
        expect(res.body.details.cross_project_test_case_ids).toContain(validIds[1]);
        // No test_suite_cases rows should have been inserted (transaction rolled back).
        const inserts = queries.filter(q => /INSERT INTO test_suite_cases/i.test(q.sql));
        expect(inserts.length).toBe(0);
    });

    test('omitted test_case_ids creates the suite with no cases (backward-compatible)', async () => {
        const projectId = '11111111-1111-1111-1111-111111111111';
        queryHandler = async (sql) => {
            if (/SELECT COALESCE\(MAX/i.test(sql)) {
                return { rows: [{ next_id: 1 }] };
            }
            if (/INSERT INTO test_suites/i.test(sql)) {
                return { rows: [{
                    id: 'suite-new', suite_id: 'TS-00001', name: 'Auth Suite', project_id: projectId,
                }] };
            }
            if (/SELECT ts\.\*,.*COUNT.*FROM test_suites ts LEFT JOIN/i.test(sql)) {
                return { rows: [{
                    id: 'suite-new', suite_id: 'TS-00001', name: 'Auth Suite', project_id: projectId,
                    test_case_count: 0, project_name: 'Test',
                }] };
            }
            return { rows: [] };
        };
        const res = await request(makeTestSuitesApp())
            .post('/test-suites')
            .send({ name: 'Auth Suite', project_id: projectId });
        expect(res.status).toBe(201);
        const inserts = queries.filter(q => /INSERT INTO test_suite_cases/i.test(q.sql));
        expect(inserts.length).toBe(0);
    });
});

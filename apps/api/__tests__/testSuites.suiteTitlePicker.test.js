'use strict';

// Tests for issue #215 — suite edit picker (Suggested / All / Search).
// Verifies:
//   - GET /test-suites/:id/available-test-cases accepts match_suite_title,
//     suite_title, created_by, tags query parameters and applies them as
//     WHERE clauses scoped to the suite's project.
//   - match_suite_title uses normalized exact match (lower + trim + collapse
//     internal whitespace) against the suite's name.
//   - Linked cases (test_suite_cases) are still excluded (NOT EXISTS guard).
//   - 404 is returned when the suite does not exist.
//   - Each filter appends a parameterized clause to the SQL.

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
const router = require('../src/routes/testSuites');

function makeApp() {
    const a = express();
    a.use(express.json());
    a.use('/test-suites', router);
    return a;
}

function setUser() {
    mockCurrentUser.value = { id: 'u-1', email: 'user@x.io', role: 'admin' };
}

function setSuite(name = 'Authentication / Login') {
    queryHandler = async (sql) => {
        if (/SELECT id, project_id, name FROM test_suites/i.test(sql)) {
            return { rows: [{ id: 'suite-1', project_id: 'p-1', name }] };
        }
        if (/^SELECT COUNT/i.test(sql)) return { rows: [{ total: '0' }] };
        return { rows: [] };
    };
}

function findAvailableQuery() {
    return queries.find(q =>
        /FROM test_case tc/i.test(q.sql) && /ORDER BY tc\.test_case_id/i.test(q.sql)
    );
}

function findCountQuery() {
    return queries.find(q =>
        /SELECT COUNT\(\*\) AS total FROM test_case tc/i.test(q.sql)
    );
}

beforeEach(() => {
    jest.clearAllMocks();
    queries.length = 0;
    setUser();
});

// ── match_suite_title normalized match ──────────────────────────────────────

describe('GET /test-suites/:id/available-test-cases — match_suite_title', () => {
    test('applies normalized-exact match against the suite name', async () => {
        setSuite('Authentication / Login');
        const res = await request(makeApp())
            .get('/test-suites/suite-1/available-test-cases')
            .query({ match_suite_title: 'true' });
        expect(res.status).toBe(200);
        const q = findAvailableQuery();
        expect(q).toBeDefined();
        // Both sides of the comparison must use the same normalization:
        // lower + trim + collapse internal whitespace.
        expect(q.sql).toMatch(/lower\(regexp_replace\(trim\(tc\.suite_title\), '\\s\+', ' ', 'g'\)\)/i);
        expect(q.sql).toMatch(/lower\(regexp_replace\(trim\(\$\d+\), '\\s\+', ' ', 'g'\)\)/i);
        // The right-hand side is the suite's name (with the same normalize).
        expect(q.params).toContain('Authentication / Login');
    });

    test('suite-name value comes from the suite row, not the request body', async () => {
        setSuite('Suite  Name  With  Spaces');
        const res = await request(makeApp())
            .get('/test-suites/suite-1/available-test-cases')
            .query({ match_suite_title: 'true' });
        expect(res.status).toBe(200);
        const q = findAvailableQuery();
        // The trim+collapse happens in SQL, so the param holds the raw name;
        // the SQL function then normalizes it.
        expect(q.params).toContain('Suite  Name  With  Spaces');
    });

    test('no match_suite_title → no suite_title match clause is added', async () => {
        setSuite('Auth');
        const res = await request(makeApp())
            .get('/test-suites/suite-1/available-test-cases')
            .query({ status: 'Not Run' });
        expect(res.status).toBe(200);
        const q = findAvailableQuery();
        expect(q.sql).not.toMatch(/lower\(regexp_replace\(trim\(tc\.suite_title\)/i);
    });
});

// ── New filter parameters ──────────────────────────────────────────────────

describe('GET /test-suites/:id/available-test-cases — new filter params', () => {
    test('suite_title adds a parameterized = clause', async () => {
        setSuite();
        const res = await request(makeApp())
            .get('/test-suites/suite-1/available-test-cases')
            .query({ suite_title: 'Auth / Login' });
        expect(res.status).toBe(200);
        const q = findAvailableQuery();
        expect(q.sql).toMatch(/tc\.suite_title\s*=\s*\$\d+/i);
        expect(q.params).toContain('Auth / Login');
    });

    test('created_by adds a parameterized = clause', async () => {
        setSuite();
        const res = await request(makeApp())
            .get('/test-suites/suite-1/available-test-cases')
            .query({ created_by: 'u-creator' });
        expect(res.status).toBe(200);
        const q = findAvailableQuery();
        expect(q.sql).toMatch(/tc\.created_by\s*=\s*\$\d+/i);
        expect(q.params).toContain('u-creator');
    });

    test('tags (comma-separated) adds a tags && $N::text[] clause', async () => {
        setSuite();
        const res = await request(makeApp())
            .get('/test-suites/suite-1/available-test-cases')
            .query({ tags: 'login, smoke' });
        expect(res.status).toBe(200);
        const q = findAvailableQuery();
        expect(q.sql).toMatch(/tc\.tags\s*&&\s*\$\d+::text\[\]/i);
        // The tag list is passed as a real array so PG can use the GIN index.
        const arrayParam = q.params.find(p => Array.isArray(p) && p.length === 2);
        expect(arrayParam).toEqual(['login', 'smoke']);
    });

    test('empty / missing tags adds no tag clause', async () => {
        setSuite();
        const res = await request(makeApp())
            .get('/test-suites/suite-1/available-test-cases')
            .query({ tags: '   ' });
        expect(res.status).toBe(200);
        const q = findAvailableQuery();
        expect(q.sql).not.toMatch(/tc\.tags\s*&&/i);
    });

    test('search filter remains backward-compatible (title/description/test_case_id)', async () => {
        setSuite();
        const res = await request(makeApp())
            .get('/test-suites/suite-1/available-test-cases')
            .query({ search: 'login' });
        expect(res.status).toBe(200);
        const q = findAvailableQuery();
        expect(q.sql).toMatch(/tc\.title ILIKE/i);
        expect(q.params).toContain('%login%');
    });
});

// ── Project scoping and linked-exclusion (already-required behaviour) ─────

describe('GET /test-suites/:id/available-test-cases — scoping & exclusion', () => {
    test('project scope comes from the suite row, not the request', async () => {
        setSuite();
        const res = await request(makeApp())
            .get('/test-suites/suite-1/available-test-cases')
            .query({ match_suite_title: 'true' });
        expect(res.status).toBe(200);
        const q = findAvailableQuery();
        // First param is the project_id pulled from the suite row.
        expect(q.params[0]).toBe('p-1');
        expect(q.sql).toMatch(/tc\.project_id\s*=\s*\$1/i);
    });

    test('linked cases (test_suite_cases) are excluded via NOT EXISTS', async () => {
        setSuite();
        const res = await request(makeApp())
            .get('/test-suites/suite-1/available-test-cases');
        expect(res.status).toBe(200);
        const q = findAvailableQuery();
        expect(q.sql).toMatch(/NOT EXISTS/i);
        expect(q.sql).toMatch(/test_suite_cases tsc/i);
        expect(q.sql).toMatch(/tsc\.suite_id\s*=\s*\$2/i);
    });

    test('404 when the suite does not exist', async () => {
        queryHandler = async (sql) => {
            if (/SELECT id, project_id, name FROM test_suites/i.test(sql)) {
                return { rows: [] };
            }
            return { rows: [] };
        };
        const res = await request(makeApp())
            .get('/test-suites/missing/available-test-cases')
            .query({ match_suite_title: 'true' });
        expect(res.status).toBe(404);
    });

    test('count query uses the same filter clauses as the data query', async () => {
        setSuite();
        const res = await request(makeApp())
            .get('/test-suites/suite-1/available-test-cases')
            .query({ match_suite_title: 'true', status: 'Not Run' });
        expect(res.status).toBe(200);
        const cnt = findCountQuery();
        const dq = findAvailableQuery();
        expect(cnt).toBeDefined();
        expect(dq).toBeDefined();
        // Count and data queries share the WHERE clause contents. The count
        // query is "SELECT COUNT(*) AS total FROM test_case tc WHERE <clauses>"
        // (no ORDER BY / LIMIT), so we match it differently.
        const norm = (s) => s.replace(/\s+/g, ' ').trim();
        const cntWhere = norm(cnt.sql).match(/FROM test_case tc WHERE (.*)$/i);
        const dqWhere = norm(dq.sql).match(/WHERE (.*) ORDER BY/i);
        expect(cntWhere).not.toBeNull();
        expect(dqWhere).not.toBeNull();
        // Both must include the match_suite_title normalization.
        expect(cntWhere[1]).toMatch(/lower\(regexp_replace\(trim\(tc\.suite_title\)/i);
        expect(dqWhere[1]).toMatch(/lower\(regexp_replace\(trim\(tc\.suite_title\)/i);
    });
});

// ── Add-cases endpoint dup-prevention ───────────────────────────────────────

describe('POST /test-suites/:id/test-cases — duplicate prevention', () => {
    test('re-adding an already-linked case is a no-op (does not error)', async () => {
        queryHandler = async (sql, params) => {
            if (/SELECT \* FROM test_suites WHERE id = \$1/i.test(sql)) {
                return { rows: [{
                    id: 'suite-1', suite_id: 'TS-00001', project_id: 'p-1', deleted_at: null,
                }] };
            }
            if (/SELECT id, project_id FROM test_case WHERE id = ANY/i.test(sql)) {
                return { rows: [
                    { id: 'tc-a', project_id: 'p-1' },
                    { id: 'tc-b', project_id: 'p-1' },
                ] };
            }
            if (/SELECT COALESCE\(MAX\(sort_order\), 0\)/i.test(sql)) {
                return { rows: [{ max_sort: 3 }] };
            }
            if (/SELECT test_case_id FROM test_suite_cases WHERE suite_id = \$1/i.test(sql)) {
                // tc-a is already in the suite; tc-b is not.
                return { rows: [{ test_case_id: 'tc-a' }] };
            }
            return { rows: [] };
        };
        const res = await request(makeApp())
            .post('/test-suites/suite-1/test-cases')
            .send({ test_case_ids: ['tc-a', 'tc-b'] });
        expect(res.status).toBe(200);
        expect(res.body.added).toBe(1);
        // Exactly one INSERT (for tc-b, the new one). tc-a was skipped.
        const inserts = queries.filter(q => /INSERT INTO test_suite_cases/i.test(q.sql));
        expect(inserts.length).toBe(1);
    });
});

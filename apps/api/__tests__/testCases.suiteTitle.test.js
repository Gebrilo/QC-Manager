'use strict';

// Tests for issue #213 — suite_title field on test_case.
// Verifies:
//   - The test_case.suite_title column is added idempotently via db.js startup
//     bootstrap (no standalone migration).
//   - A functional index on (project_id, lower(regexp_replace(trim(suite_title),
//     '\\s+', ' ', 'g'))) is created.
//   - v_test_case_summary exposes suite_title.
//   - POST /test-cases persists suite_title and trims/normalises blank
//     inputs to NULL.
//   - PATCH /test-cases/:id updates suite_title and trims/normalises blank
//     inputs to NULL.
//   - POST /test-cases/bulk-import persists suite_title.

const fs = require('fs');
const path = require('path');

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

jest.mock('../src/services/tuleapClient', () => ({
    defaultClient: {},
}));

jest.mock('../src/services/tuleapFieldRegistry', () => ({
    defaultRegistry: {},
}));

jest.mock('../src/services/emitters/test_case', () => ({
    emitToTuleap: jest.fn(),
}));

jest.mock('../src/services/accessDefaults', () => ({
    buildAccessDefaults: jest.fn(async () => ({
        owner_team_id: null,
        visibility_scope: 'private',
        default_acl_grants: [],
    })),
    materializeAclGrants: jest.fn(async () => 0),
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
const router = require('../src/routes/testCases');

function makeApp() {
    const a = express();
    a.use(express.json());
    a.use('/test-cases', router);
    return a;
}

function setUser() {
    mockCurrentUser.value = { id: 'u-1', email: 'user@x.io', role: 'admin' };
}

function setExistingSuiteTitle(value) {
    queryHandler = async (sql, params) => {
        if (/SELECT 'TC-'/.test(sql) || /SELECT 'TC-' \|\| LPAD/.test(sql)) {
            return { rows: [{ next_id: 'TC-00001' }] };
        }
        if (/v_test_case_summary/i.test(sql) && /WHERE id = \$1/i.test(sql)) {
            return { rows: [{
                id: 'tc-1', test_case_id: 'TC-00001', title: 'Sample',
                suite_title: value,
            }] };
        }
        if (/SELECT \* FROM test_case WHERE id = \$1 AND deleted_at IS NULL/i.test(sql)) {
            return { rows: [{
                id: 'tc-1', test_case_id: 'TC-00001', title: 'Sample',
                category: 'other', suite_title: value, project_id: 'p-1',
            }] };
        }
        return { rows: [] };
    };
}

function findInsertTestCase() {
    return queries.find(q => /INSERT INTO test_case/i.test(q.sql));
}

function findUpdateTestCase() {
    return queries.find(q =>
        /UPDATE test_case SET/i.test(q.sql) && /WHERE id = \$/i.test(q.sql)
    );
}

const dbSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'config', 'db.js'),
    'utf8'
);

beforeEach(() => {
    jest.clearAllMocks();
    queries.length = 0;
    setUser();
    queryHandler = async (sql) => {
        if (/SELECT 'TC-'/.test(sql)) return { rows: [{ next_id: 'TC-00001' }] };
        if (/SELECT 'TC-' \|\| LPAD/.test(sql)) return { rows: [{ next_id: 'TC-00001' }] };
        if (/INSERT INTO test_case/i.test(sql)) {
            return { rows: [{
                id: 'tc-new', test_case_id: 'TC-00001', title: 'Sample',
                suite_title: null, project_id: 'p-1', created_by: 'u-1',
            }] };
        }
        if (/UPDATE test_case SET/i.test(sql) && /RETURNING \*$/i.test(sql)) {
            return { rows: [{
                id: 'tc-1', test_case_id: 'TC-00001', title: 'Sample',
                suite_title: null, project_id: 'p-1',
            }] };
        }
        if (/v_test_case_summary/i.test(sql) && /WHERE id = \$1/i.test(sql)) {
            return { rows: [{
                id: 'tc-1', test_case_id: 'TC-00001', title: 'Sample',
                suite_title: 'Auth / Login',
            }] };
        }
        if (/SELECT \* FROM test_case WHERE id = \$1 AND deleted_at IS NULL/i.test(sql)) {
            return { rows: [{
                id: 'tc-1', test_case_id: 'TC-00001', title: 'Sample',
                category: 'other', suite_title: null, project_id: 'p-1',
            }] };
        }
        if (/^SELECT 1$/i.test(sql.trim())) return { rows: [{ '?column?': 1 }] };
        return { rows: [] };
    };
});

// ── Schema presence (db.js) ─────────────────────────────────────────────────

describe('db.js startup bootstrap — suite_title foundation (issue #213)', () => {
    test('test_case.suite_title column is added via ADD COLUMN IF NOT EXISTS', () => {
        const match = dbSource.match(
            /ALTER TABLE test_case ADD COLUMN IF NOT EXISTS suite_title[^\n]*/i
        );
        expect(match).not.toBeNull();
        // Column must be VARCHAR(255) per the issue's max-length requirement.
        expect(match[0]).toMatch(/VARCHAR\(255\)/i);
    });

    test('functional index on normalized suite_title is created scoped with project_id', () => {
        const match = dbSource.match(
            /CREATE INDEX IF NOT EXISTS idx_test_case_suite_title_norm[^\n;]*/i
        );
        expect(match).not.toBeNull();
        const ddl = match[0];
        // Must include project_id as the leading key (scoped lookup per project).
        expect(ddl).toMatch(/\(project_id,\s*lower\(/i);
        // Must apply the normalization: lower, trim, and collapse internal whitespace.
        expect(ddl).toMatch(/lower\(/i);
        expect(ddl).toMatch(/trim\(/i);
        // Must include regexp_replace with a whitespace-collapse pattern. The
        // pattern is encoded as the SQL string literal '\\s+' (two backslashes
        // + s+ in the on-disk source) inside regexp_replace(...).
        expect(ddl).toMatch(/regexp_replace\(/i);
        // eslint-disable-next-line no-useless-escape
        expect(ddl).toContain("'\\\\s+'");
        // Must restrict to non-deleted, non-null rows so NULLs don't bloat the index.
        expect(ddl).toMatch(/suite_title IS NOT NULL/i);
        expect(ddl).toMatch(/deleted_at IS NULL/i);
    });

    test('v_test_case_summary exposes suite_title', () => {
        // The view CREATE block must select tc.suite_title (we don't ship a
        // legacy DB so we can read the CREATE statement directly).
        const viewBlock = dbSource.match(
            /CREATE OR REPLACE VIEW v_test_case_summary[\s\S]*?WHERE tc\.deleted_at IS NULL/i
        );
        expect(viewBlock).not.toBeNull();
        expect(viewBlock[0]).toMatch(/tc\.suite_title/i);
    });
});

// ── Create / Update persistence ─────────────────────────────────────────────

describe('POST /test-cases — suite_title persistence and normalisation', () => {
    test('persists a non-empty suite_title verbatim', async () => {
        const res = await request(makeApp())
            .post('/test-cases')
            .send({
                title: 'Sample',
                project_id: '11111111-1111-1111-1111-111111111111',
                suite_title: 'Authentication / Login',
            });
        if (res.status >= 400) {
            console.error('Test got non-2xx:', res.status, res.body, res.text);
        }
        expect([200, 201]).toContain(res.status);
        const insert = findInsertTestCase();
        expect(insert).toBeDefined();
        // Column list must include suite_title.
        expect(insert.sql).toMatch(/suite_title/i);
        // The value passed to PG should be the raw trimmed string.
        const valueParams = insert.params.filter(p => p === 'Authentication / Login');
        expect(valueParams.length).toBe(1);
    });

    test('trims surrounding whitespace and persists the trimmed value', async () => {
        const res = await request(makeApp())
            .post('/test-cases')
            .send({
                title: 'Sample',
                project_id: '11111111-1111-1111-1111-111111111111',
                suite_title: '   Auth Suite   ',
            });
        expect([200, 201]).toContain(res.status);
        const insert = findInsertTestCase();
        expect(insert).toBeDefined();
        expect(insert.params).toContain('Auth Suite');
        expect(insert.params).not.toContain('   Auth Suite   ');
    });

    test('blank / whitespace-only suite_title stores NULL', async () => {
        for (const blank of ['', '   ', '\t\n  ']) {
            queries.length = 0;
            const res = await request(makeApp())
                .post('/test-cases')
                .send({
                    title: `t-${Math.random()}`,
                    project_id: '11111111-1111-1111-1111-111111111111',
                    suite_title: blank,
                });
            expect([200, 201]).toContain(res.status);
            const insert = findInsertTestCase();
            expect(insert).toBeDefined();
            // The parameter slot for suite_title must be NULL (not the blank string).
            const idx = insert.sql.split(',').findIndex(s => /suite_title/i.test(s));
            expect(idx).toBeGreaterThanOrEqual(0);
            // Pull the Nth positional parameter that aligns with suite_title.
            // Counting $ placeholders in the INSERT statement is the most robust
            // way; we just check that the value at the suite_title slot is null
            // by finding the slot via the column-list position.
            const colList = insert.sql.match(/INSERT INTO test_case\s*\(([^)]+)\)/i);
            expect(colList).not.toBeNull();
            const cols = colList[1].split(',').map(s => s.trim());
            const stColIdx = cols.indexOf('suite_title');
            expect(stColIdx).toBeGreaterThanOrEqual(0);
            // Values are positional $1..$N starting after test_case_id.
            // The 0th column is test_case_id, so suite_title is at stColIdx.
            expect(insert.params[stColIdx]).toBeNull();
        }
    });

    test('omitted suite_title is accepted and stored as NULL', async () => {
        const res = await request(makeApp())
            .post('/test-cases')
            .send({
                title: 'No suite',
                project_id: '11111111-1111-1111-1111-111111111111',
            });
        expect([200, 201]).toContain(res.status);
        const insert = findInsertTestCase();
        expect(insert).toBeDefined();
        const colList = insert.sql.match(/INSERT INTO test_case\s*\(([^)]+)\)/i);
        const cols = colList[1].split(',').map(s => s.trim());
        const stColIdx = cols.indexOf('suite_title');
        expect(insert.params[stColIdx]).toBeNull();
    });
});

describe('PATCH /test-cases/:id — suite_title persistence and normalisation', () => {
    test('suite_title is in the updatable fields list and persists a new value', async () => {
        const res = await request(makeApp())
            .patch('/test-cases/tc-1')
            .send({ suite_title: 'Payments / Checkout' });
        expect(res.status).toBe(200);
        const upd = findUpdateTestCase();
        expect(upd).toBeDefined();
        expect(upd.sql).toMatch(/suite_title\s*=\s*\$\d+/i);
        expect(upd.params).toContain('Payments / Checkout');
    });

    test('trims surrounding whitespace on update', async () => {
        const res = await request(makeApp())
            .patch('/test-cases/tc-1')
            .send({ suite_title: '   Spaced   ' });
        expect(res.status).toBe(200);
        const upd = findUpdateTestCase();
        expect(upd.params).toContain('Spaced');
    });

    test('blank suite_title on update stores NULL (clear existing value)', async () => {
        setExistingSuiteTitle('Old Suite');
        const res = await request(makeApp())
            .patch('/test-cases/tc-1')
            .send({ suite_title: '   ' });
        expect(res.status).toBe(200);
        const upd = findUpdateTestCase();
        expect(upd).toBeDefined();
        const match = upd.sql.match(/suite_title\s*=\s*\$(\d+)/i);
        expect(match).not.toBeNull();
        const placeholderIdx = parseInt(match[1], 10) - 1;
        expect(upd.params[placeholderIdx]).toBeNull();
    });
});

describe('POST /test-cases/bulk-import — suite_title persistence', () => {
    test('each row can carry a suite_title and it is persisted', async () => {
        const res = await request(makeApp())
            .post('/test-cases/bulk-import')
            .send({
                project_id: '11111111-1111-1111-1111-111111111111',
                test_cases: [
                    { title: 'Bulk 1', suite_title: 'Suite A' },
                    { title: 'Bulk 2', suite_title: '   ' },
                ],
            });
        expect(res.status).toBe(200);
        const inserts = queries.filter(q => /INSERT INTO test_case/i.test(q.sql));
        expect(inserts.length).toBeGreaterThanOrEqual(2);
        const firstColList = inserts[0].sql.match(/INSERT INTO test_case\s*\(([^)]+)\)/i);
        const cols = firstColList[1].split(',').map(s => s.trim());
        const stColIdx = cols.indexOf('suite_title');
        expect(inserts[0].params[stColIdx]).toBe('Suite A');
        // Whitespace-only row should land as NULL.
        expect(inserts[1].params[stColIdx]).toBeNull();
    });
});

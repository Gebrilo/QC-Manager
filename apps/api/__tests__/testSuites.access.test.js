'use strict';

// Per-route access integration tests for issue #82 (slice 3) — test_suites.
// Exercises the real AccessEngine + enforcement.js wiring against the testSuites
// router; only the role/permission resolver and pg pool are stubbed.

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

const roleResolver = require('../src/access/RoleResolver');

const express = require('express');
const request = require('supertest');
const router = require('../src/routes/testSuites');

function makeApp() {
    const a = express();
    a.use(express.json());
    a.use('/test-suites', router);
    return a;
}

const ROLE_FIXTURES = {
    admin: {
        user: { id: 'u-admin', email: 'admin@x.io', role: 'admin' },
        resolved: { effectivePermissions: new Set(['*']), scope: { team_id: null, team_type: null, pm_of_projects: [] } },
    },
    pm: {
        user: { id: 'u-pm', email: 'pm@x.io', role: 'pm' },
        resolved: {
            effectivePermissions: new Set([
                'qc.testsuites.view_any', 'qc.testsuites.edit_any', 'qc.testsuites.delete_any',
            ]),
            scope: { team_id: null, team_type: 'pm', pm_of_projects: ['proj-pm'] },
        },
    },
    team_manager: {
        user: { id: 'u-tm', email: 'tm@x.io', role: 'team_manager' },
        resolved: {
            effectivePermissions: new Set([
                'qc.testsuites.view_team', 'qc.testsuites.edit_team', 'qc.testsuites.delete_team',
            ]),
            scope: { team_id: 'team-tm', team_type: 'qc', pm_of_projects: [] },
        },
    },
    member: {
        user: { id: 'u-member', email: 'member@x.io', role: 'member' },
        resolved: {
            effectivePermissions: new Set([
                'qc.testsuites.view_own', 'qc.testsuites.edit_own',
            ]),
            scope: { team_id: 'team-member', team_type: 'qc', pm_of_projects: [] },
        },
    },
    viewer: {
        user: { id: 'u-viewer', email: 'viewer@x.io', role: 'viewer' },
        resolved: {
            effectivePermissions: new Set(['qc.testsuites.view_team']),
            scope: { team_id: 'team-viewer', team_type: 'qc', pm_of_projects: [] },
        },
    },
};

function setRole(name) {
    mockCurrentUser.value = ROLE_FIXTURES[name].user;
    roleResolver.resolve.mockResolvedValue(ROLE_FIXTURES[name].resolved);
}

function findDataQuery() {
    return queries.find(q =>
        /FROM test_suites ts/i.test(q.sql) && /ORDER BY ts\./i.test(q.sql)
    );
}

beforeEach(() => {
    jest.clearAllMocks();
    queries.length = 0;
    queryHandler = async (sql) => {
        if (/SELECT COUNT/i.test(sql)) return { rows: [{ total: '0' }] };
        if (/active_count/i.test(sql)) return { rows: [{ active_count: '0', archived_count: '0', total_cases: '0' }] };
        return { rows: [] };
    };
});

describe('GET /test-suites — per-role list visibility', () => {
    test('admin: filter clause is TRUE (sees all suites)', async () => {
        setRole('admin');
        const res = await request(makeApp()).get('/test-suites');
        expect(res.status).toBe(200);
        const dq = findDataQuery();
        expect(dq).toBeDefined();
        expect(dq.sql).toMatch(/AND TRUE/);
    });

    test('pm with view_any: filter clause is TRUE (sees all suites)', async () => {
        setRole('pm');
        const res = await request(makeApp()).get('/test-suites');
        expect(res.status).toBe(200);
        const dq = findDataQuery();
        expect(dq.sql).toMatch(/AND TRUE/);
    });

    test('team_manager: filter includes ts.owner_team_id branch', async () => {
        setRole('team_manager');
        const res = await request(makeApp()).get('/test-suites');
        expect(res.status).toBe(200);
        const dq = findDataQuery();
        expect(dq.sql).toMatch(/ts\.owner_team_id = /);
        expect(dq.params).toContain('team-tm');
    });

    test('member: filter scopes by creator user columns only (no owner_team)', async () => {
        setRole('member');
        const res = await request(makeApp()).get('/test-suites');
        expect(res.status).toBe(200);
        const dq = findDataQuery();
        expect(dq.sql).toMatch(/ts\.created_by_user_id = /);
        expect(dq.sql).toMatch(/ts\.created_by = /);
        expect(dq.sql).not.toMatch(/ts\.owner_team_id = /);
        expect(dq.params).toContain('u-member');
    });

    test('viewer: filter includes team + visibility_scope=project branches', async () => {
        setRole('viewer');
        const res = await request(makeApp()).get('/test-suites');
        expect(res.status).toBe(200);
        const dq = findDataQuery();
        expect(dq.sql).toMatch(/ts\.owner_team_id = /);
        expect(dq.sql).toMatch(/ts\.visibility_scope = 'project'/);
    });
});

describe('GET /test-suites/:id — detail enforcement', () => {
    test('admin can view any suite → 200 with _can payload', async () => {
        setRole('admin');
        queryHandler = async (sql) => {
            if (/FROM test_suites ts\s+LEFT JOIN projects/i.test(sql) && /WHERE ts\.id = \$1/i.test(sql)) {
                return { rows: [{
                    id: 'suite-1', suite_id: 'TS-1', deleted_at: null,
                    project_id: 'p-other', owner_team_id: 'team-other',
                    created_by: 'u-other', created_by_user_id: 'u-other',
                    visibility_scope: 'team', name: 'Foreign',
                }] };
            }
            return { rows: [] };
        };
        const res = await request(makeApp()).get('/test-suites/suite-1');
        expect(res.status).toBe(200);
        expect(res.body._can).toBeDefined();
    });

    test('member viewing a foreign suite → 403 (manipulation guard)', async () => {
        setRole('member');
        queryHandler = async (sql) => {
            if (/FROM test_suites ts\s+LEFT JOIN projects/i.test(sql) && /WHERE ts\.id = \$1/i.test(sql)) {
                return { rows: [{
                    id: 'suite-1', suite_id: 'TS-1', deleted_at: null,
                    project_id: 'p-other', owner_team_id: 'team-other',
                    created_by: 'u-other', created_by_user_id: 'u-other',
                    visibility_scope: 'team', name: 'Foreign',
                }] };
            }
            return { rows: [] };
        };
        const res = await request(makeApp()).get('/test-suites/suite-1');
        expect(res.status).toBe(403);
        expect(res.body.reason).toBeDefined();
    });
});

describe('DELETE /test-suites/:id — manipulation guard', () => {
    test('member denied deleting a foreign suite → 403, transaction rolled back', async () => {
        setRole('member');
        queryHandler = async (sql) => {
            if (/SELECT \* FROM test_suites WHERE id = \$1 AND deleted_at IS NULL/i.test(sql)) {
                return { rows: [{
                    id: 'suite-1', suite_id: 'TS-1', deleted_at: null,
                    project_id: 'p-other', owner_team_id: 'team-other',
                    created_by: 'u-other', created_by_user_id: 'u-other',
                    visibility_scope: 'team',
                }] };
            }
            return { rows: [] };
        };
        const res = await request(makeApp()).delete('/test-suites/suite-1');
        expect(res.status).toBe(403);
        const rollback = queries.find(q => /ROLLBACK/i.test(q.sql));
        expect(rollback).toBeDefined();
    });
});

describe('GET /test-suites/:id — enforced denial', () => {
    test('member viewing a foreign suite gets 403', async () => {
        setRole('member');
        queryHandler = async (sql) => {
            if (/FROM test_suites ts\s+LEFT JOIN projects/i.test(sql) && /WHERE ts\.id = \$1/i.test(sql)) {
                return { rows: [{
                    id: 'suite-1', suite_id: 'TS-1', deleted_at: null,
                    project_id: 'p-other', owner_team_id: 'team-other',
                    created_by: 'u-other', created_by_user_id: 'u-other',
                    visibility_scope: 'team', name: 'Foreign',
                }] };
            }
            return { rows: [] };
        };
        const res = await request(makeApp()).get('/test-suites/suite-1');
        expect(res.status).toBe(403);
        expect(res.body.reason).toBeDefined();
    });
});

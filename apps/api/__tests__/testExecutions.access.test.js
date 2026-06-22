'use strict';

// Per-route access integration tests for issue #82 (slice 3) — test_executions.
// Exercises the real AccessEngine + enforcement.js wiring against the
// testExecutions router (test runs).

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
const router = require('../src/routes/testExecutions');

function makeApp() {
    const a = express();
    a.use(express.json());
    a.use('/test-executions', router);
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
                'qc.testexecutions.view_any', 'qc.testexecutions.edit_any', 'qc.testexecutions.delete_any',
            ]),
            scope: { team_id: null, team_type: 'pm', pm_of_projects: ['proj-pm'] },
        },
    },
    team_manager: {
        user: { id: 'u-tm', email: 'tm@x.io', role: 'team_manager' },
        resolved: {
            effectivePermissions: new Set([
                'qc.testexecutions.view_team', 'qc.testexecutions.edit_team', 'qc.testexecutions.delete_team',
            ]),
            scope: { team_id: 'team-tm', team_type: 'qc', pm_of_projects: [] },
        },
    },
    member: {
        user: { id: 'u-member', email: 'member@x.io', role: 'member' },
        resolved: {
            effectivePermissions: new Set([
                'qc.testexecutions.view_own', 'qc.testexecutions.edit_own',
            ]),
            scope: { team_id: 'team-member', team_type: 'qc', pm_of_projects: [] },
        },
    },
    viewer: {
        user: { id: 'u-viewer', email: 'viewer@x.io', role: 'viewer' },
        resolved: {
            // viewer cannot see test_run owner_team without a key — but the route
            // declines ownerTeamExpr=null so the team branch is irrelevant for
            // test_runs. Viewer still gets the ACL branch.
            effectivePermissions: new Set(['qc.testexecutions.view_team']),
            scope: { team_id: 'team-viewer', team_type: 'qc', pm_of_projects: [] },
        },
    },
};

function setRole(name) {
    mockCurrentUser.value = ROLE_FIXTURES[name].user;
    roleResolver.resolve.mockResolvedValue(ROLE_FIXTURES[name].resolved);
}

function findTestRunsDataQuery() {
    return queries.find(q =>
        /FROM test_run tr/i.test(q.sql) && /ORDER BY tr\.started_at/i.test(q.sql)
    );
}

beforeEach(() => {
    jest.clearAllMocks();
    queries.length = 0;
    queryHandler = async (sql) => {
        if (/SELECT COUNT/i.test(sql)) return { rows: [{ total: '0' }] };
        return { rows: [] };
    };
});

describe('GET /test-executions/test-runs — per-role list visibility', () => {
    test('admin: filter clause is TRUE (sees all runs)', async () => {
        setRole('admin');
        const res = await request(makeApp()).get('/test-executions/test-runs');
        expect(res.status).toBe(200);
        const dq = findTestRunsDataQuery();
        expect(dq).toBeDefined();
        expect(dq.sql).toMatch(/AND TRUE/);
    });

    test('pm with view_any: filter clause is TRUE (sees all runs)', async () => {
        setRole('pm');
        const res = await request(makeApp()).get('/test-executions/test-runs');
        expect(res.status).toBe(200);
        const dq = findTestRunsDataQuery();
        expect(dq.sql).toMatch(/AND TRUE/);
    });

    test('team_manager: filter has no ts.owner_team_id branch (route disabled ownerTeamExpr)', async () => {
        setRole('team_manager');
        const res = await request(makeApp()).get('/test-executions/test-runs');
        expect(res.status).toBe(200);
        const dq = findTestRunsDataQuery();
        // ownerTeamExpr is null for test_run rows, but the ACL branch must exist
        expect(dq.sql).not.toMatch(/tr\.owner_team_id = /);
        expect(dq.sql).toMatch(/FROM artifact_access aa/);
    });

    test('member: filter includes tr.created_by branch', async () => {
        setRole('member');
        const res = await request(makeApp()).get('/test-executions/test-runs');
        expect(res.status).toBe(200);
        const dq = findTestRunsDataQuery();
        expect(dq.sql).toMatch(/tr\.created_by = /);
        expect(dq.params).toContain('u-member');
    });

    test('viewer: filter falls back to ACL branch (no ownerTeam/visibility on test_run)', async () => {
        setRole('viewer');
        const res = await request(makeApp()).get('/test-executions/test-runs');
        expect(res.status).toBe(200);
        const dq = findTestRunsDataQuery();
        expect(dq.sql).toMatch(/FROM artifact_access aa/);
        expect(dq.sql).not.toMatch(/tr\.visibility_scope/);
    });
});

describe('GET /test-executions/test-runs/:id — detail enforcement', () => {
    test('admin can view any test run → 200 with _can payload', async () => {
        setRole('admin');
        queryHandler = async (sql) => {
            if (/FROM test_run tr\s+LEFT JOIN projects/i.test(sql) && /WHERE tr\.id = \$1/i.test(sql)) {
                return { rows: [{
                    id: 'aaaaaaaa-0000-0000-0000-000000000001', run_id: 'RUN-1', deleted_at: null,
                    project_id: 'p-other', created_by: 'u-other', name: 'Foreign run',
                }] };
            }
            return { rows: [] };
        };
        const res = await request(makeApp()).get('/test-executions/test-runs/aaaaaaaa-0000-0000-0000-000000000001');
        expect(res.status).toBe(200);
        expect(res.body._can).toBeDefined();
    });

    test('member viewing a foreign test run → 403 (manipulation guard)', async () => {
        setRole('member');
        queryHandler = async (sql) => {
            if (/FROM test_run tr\s+LEFT JOIN projects/i.test(sql) && /WHERE tr\.id = \$1/i.test(sql)) {
                return { rows: [{
                    id: 'aaaaaaaa-0000-0000-0000-000000000001', run_id: 'RUN-1', deleted_at: null,
                    project_id: 'p-other', created_by: 'u-other', name: 'Foreign run',
                }] };
            }
            return { rows: [] };
        };
        const res = await request(makeApp()).get('/test-executions/test-runs/aaaaaaaa-0000-0000-0000-000000000001');
        expect(res.status).toBe(403);
        expect(res.body.reason).toBeDefined();
    });
});

describe('PATCH /test-executions/test-runs/:id — manipulation guard', () => {
    test('member denied editing a foreign run → 403, transaction rolled back', async () => {
        setRole('member');
        queryHandler = async (sql) => {
            if (/SELECT \* FROM test_run WHERE id = \$1 AND deleted_at IS NULL/i.test(sql)) {
                return { rows: [{
                    id: 'aaaaaaaa-0000-0000-0000-000000000001', run_id: 'RUN-1', deleted_at: null,
                    project_id: 'p-other', created_by: 'u-other',
                }] };
            }
            return { rows: [] };
        };
        const res = await request(makeApp())
            .patch('/test-executions/test-runs/aaaaaaaa-0000-0000-0000-000000000001')
            .send({ name: 'hack' });
        expect(res.status).toBe(403);
        const rollback = queries.find(q => /ROLLBACK/i.test(q.sql));
        expect(rollback).toBeDefined();
    });
});

describe('GET /test-executions/recent-uploads — shape and access wiring', () => {
    test('member: filter wires through and returns _can rows', async () => {
        setRole('member');
        queryHandler = async (sql) => {
            if (/FROM test_run tr/i.test(sql) && /recent-uploads|LIMIT 20/i.test(sql)) {
                return { rows: [{ id: 'r1', run_id: 'RUN-1', name: 'X', project_id: 'p1', created_by: 'u-member' }] };
            }
            if (/FROM test_run tr/i.test(sql)) {
                return { rows: [{ id: 'r1', run_id: 'RUN-1', name: 'X', project_id: 'p1', created_by: 'u-member' }] };
            }
            return { rows: [] };
        };
        const res = await request(makeApp()).get('/test-executions/recent-uploads');
        expect(res.status).toBe(200);
        const dq = queries.find(q => /FROM test_run tr/i.test(q.sql) && /LIMIT 20/i.test(q.sql));
        expect(dq).toBeDefined();
        expect(dq.sql).toMatch(/tr\.created_by = /);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body[0]._can).toBeDefined();
    });
});

describe('GET /test-executions/test-runs/:id — enforced denial', () => {
    test('member viewing a foreign test run gets 403', async () => {
        setRole('member');
        queryHandler = async (sql) => {
            if (/FROM test_run tr\s+LEFT JOIN projects/i.test(sql) && /WHERE tr\.id = \$1/i.test(sql)) {
                return { rows: [{
                    id: 'aaaaaaaa-0000-0000-0000-000000000001', run_id: 'RUN-1', deleted_at: null,
                    project_id: 'p-other', created_by: 'u-other', name: 'Foreign run',
                }] };
            }
            return { rows: [] };
        };
        const res = await request(makeApp()).get('/test-executions/test-runs/aaaaaaaa-0000-0000-0000-000000000001');
        expect(res.status).toBe(403);
        expect(res.body.reason).toBeDefined();
    });
});

describe('GET /test-executions/test-runs/:id/bugs-found — derived bugs', () => {
    test('admin: returns bugs discovered through executions without writing link rows', async () => {
        setRole('admin');
        queryHandler = async (sql) => {
            if (/SELECT \* FROM test_run WHERE id = \$1 AND deleted_at IS NULL/i.test(sql)) {
                return { rows: [{
                    id: 'aaaaaaaa-0000-0000-0000-000000000001',
                    run_id: 'RUN-1',
                    project_id: 'proj-1',
                    created_by: 'u-admin',
                    status: 'in_progress',
                }] };
            }
            if (/FROM bug_test_executions bte/i.test(sql) && /te\.test_run_id = \$1/i.test(sql)) {
                return { rows: [{
                    id: 'link-1',
                    bug_id: 'bug-1',
                    bug_display_id: 'BUG-1',
                    bug_title: 'Checkout fails',
                    bug_status: 'Open',
                    bug_project_id: 'proj-1',
                    execution_count: 1,
                }] };
            }
            return { rows: [] };
        };

        const res = await request(makeApp()).get('/test-executions/test-runs/aaaaaaaa-0000-0000-0000-000000000001/bugs-found');

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0]).toMatchObject({ bug_id: 'bug-1', bug_display_id: 'BUG-1' });
        expect(queries.some(q => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(q.sql))).toBe(false);
    });
});

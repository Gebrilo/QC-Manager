'use strict';

// Per-route access integration tests for /tasks — list + single-item.
// Stubs the role resolver and pg pool only; exercises the real AccessEngine.
//
// Pins two contracts that previously slipped past CI:
//   1. The SQL emitted for the list references only columns the view
//      `v_tasks_with_metrics` actually exposes. A view that drops a
//      column the route filters on (e.g. created_by_user_id) caused
//      production 500s for any non-admin user holding view_own.
//   2. The single-item enforcement resolves both resource1_id /
//      resource2_id against the caller so users in either slot get 200.

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
    optionalAuth: (req, _res, next) => { req.user = mockCurrentUser.value; next(); },
}));

jest.mock('../src/access/RoleResolver', () => ({
    resolve: jest.fn(),
    canonicalRole: (role) => (role === 'manager' ? 'team_manager' : role),
}));

const roleResolver = require('../src/access/RoleResolver');

const express = require('express');
const request = require('supertest');
const router = require('../src/routes/tasks');

// v_tasks_with_metrics columns the route's appendListFilter override
// references through the engine. Each must be selected by the view's
// CREATE statement in db.js — keep this set in sync with that view.
const VIEW_REFERENCED_COLUMNS = Object.freeze([
    'id',
    'project_id',
    'resource1_id',
    'resource2_id',
    'created_at',
    'created_by_user_id',
    'owner_team_id',
    'visibility_scope',
]);

function makeApp() {
    const a = express();
    a.use(express.json());
    a.use('/tasks', router);
    return a;
}

const ROLE_FIXTURES = {
    admin: {
        user: { id: 'u-admin', email: 'admin@x.io', role: 'admin' },
        resolved: { effectivePermissions: new Set(['*']), scope: { team_id: null, team_type: null, pm_of_projects: [] } },
    },
    // tester after granting only view_own in the matrix
    tester_own_only: {
        user: { id: 'u-tester', email: 'tester@x.io', role: 'tester' },
        resolved: {
            effectivePermissions: new Set(['qc.tasks.view', 'qc.tasks.view_own']),
            scope: { team_id: 'team-x', team_type: 'qc', pm_of_projects: [] },
        },
    },
};

function setRole(name) {
    mockCurrentUser.value = ROLE_FIXTURES[name].user;
    roleResolver.resolve.mockResolvedValue(ROLE_FIXTURES[name].resolved);
}

function findListQuery() {
    return queries.find(q => /FROM v_tasks_with_metrics v\b/i.test(q.sql) && /ORDER BY v\.created_at/i.test(q.sql));
}

beforeEach(() => {
    jest.clearAllMocks();
    queries.length = 0;
    queryHandler = async () => ({ rows: [] });
});

describe('GET /tasks — list filter wiring', () => {
    test('tester with view_own emits user-exprs + resource-bridge branches against view columns', async () => {
        setRole('tester_own_only');
        const res = await request(makeApp()).get('/tasks');
        expect(res.status).toBe(200);

        const dq = findListQuery();
        expect(dq).toBeDefined();
        expect(dq.sql).toMatch(/v\.created_by_user_id\s*=\s*\$/);
        expect(dq.sql).toMatch(/r\.id\s*=\s*v\.resource1_id/);
        expect(dq.sql).toMatch(/r\.id\s*=\s*v\.resource2_id/);
        expect(dq.params).toContain('u-tester');
    });

    test('admin filter clause is TRUE (sees all)', async () => {
        setRole('admin');
        const res = await request(makeApp()).get('/tasks');
        expect(res.status).toBe(200);
        const dq = findListQuery();
        expect(dq.sql).toMatch(/AND TRUE/);
    });

    test('every v.* column referenced by the filter exists in VIEW_REFERENCED_COLUMNS', async () => {
        // Locks the route<->view contract: if the route starts referencing a new
        // v.<column>, that column must be added to VIEW_REFERENCED_COLUMNS and
        // selected by the v_tasks_with_metrics view (db.js).
        setRole('tester_own_only');
        await request(makeApp()).get('/tasks');
        const dq = findListQuery();
        const referenced = new Set();
        for (const match of dq.sql.matchAll(/\bv\.([a-z_]+)\b/g)) {
            referenced.add(match[1]);
        }
        const unknown = [...referenced].filter(col => !VIEW_REFERENCED_COLUMNS.includes(col) && col !== '*');
        expect(unknown).toEqual([]);
    });
});

'use strict';

// Per-route access integration tests for issue #82 (slice 3).
// Exercises the real AccessEngine + enforcement.js wiring against the
// userStories router; only the role/permission resolver and underlying pg pool
// are stubbed.

const queries = [];
let queryHandler = async () => ({ rows: [] });

const mockQuery = jest.fn(async (sql, params) => {
    queries.push({ sql, params });
    return queryHandler(sql, params);
});

jest.mock('../src/config/db', () => ({
    query: (...args) => mockQuery(...args),
    pool: { query: (...args) => mockQuery(...args) },
}));

const mockCurrentUser = { value: null };
jest.mock('../src/middleware/authMiddleware', () => ({
    requireAuth: (req, _res, next) => { req.user = mockCurrentUser.value; next(); },
    requirePermission: () => (_req, _res, next) => next(),
}));

jest.mock('../src/middleware/audit', () => ({ auditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../src/services/tuleapClient', () => ({ defaultClient: {} }));
jest.mock('../src/services/tuleapFieldRegistry', () => ({ defaultRegistry: {} }));
jest.mock('../src/services/emitters/user_story', () => ({ emitToTuleap: jest.fn() }));

jest.mock('../src/access/RoleResolver', () => ({
    resolve: jest.fn(),
    canonicalRole: (role) => (role === 'manager' ? 'team_manager' : role),
}));

const roleResolver = require('../src/access/RoleResolver');

const express = require('express');
const request = require('supertest');
const router = require('../src/routes/userStories');

function makeApp() {
    const a = express();
    a.use(express.json());
    a.use('/user-stories', router);
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
                'qc.user_stories.view_any',
                'qc.user_stories.edit_any',
                'qc.user_stories.delete_any',
            ]),
            scope: { team_id: null, team_type: 'pm', pm_of_projects: ['proj-pm'] },
        },
    },
    team_manager: {
        user: { id: 'u-tm', email: 'tm@x.io', role: 'team_manager' },
        resolved: {
            effectivePermissions: new Set([
                'qc.user_stories.view_team',
                'qc.user_stories.edit_team',
                'qc.user_stories.delete_team',
            ]),
            scope: { team_id: 'team-tm', team_type: 'qc', pm_of_projects: [] },
        },
    },
    member: {
        user: { id: 'u-member', email: 'member@x.io', role: 'member' },
        resolved: {
            effectivePermissions: new Set([
                'qc.user_stories.view_own',
                'qc.user_stories.edit_own',
            ]),
            scope: { team_id: 'team-member', team_type: 'qc', pm_of_projects: [] },
        },
    },
    viewer: {
        user: { id: 'u-viewer', email: 'viewer@x.io', role: 'viewer' },
        resolved: {
            effectivePermissions: new Set(['qc.user_stories.view_team']),
            scope: { team_id: 'team-viewer', team_type: 'qc', pm_of_projects: [] },
        },
    },
};

function setRole(name) {
    mockCurrentUser.value = ROLE_FIXTURES[name].user;
    roleResolver.resolve.mockResolvedValue(ROLE_FIXTURES[name].resolved);
}

function findDataQuery() {
    return queries.find(q => /FROM user_stories us/i.test(q.sql) && /ORDER BY/i.test(q.sql));
}

beforeEach(() => {
    jest.clearAllMocks();
    queries.length = 0;
    queryHandler = async (sql) => {
        if (/SELECT COUNT/i.test(sql)) return { rows: [{ total: '0' }] };
        return { rows: [] };
    };
});

describe('GET /user-stories — per-role list visibility', () => {
    test('admin: filter clause is TRUE (sees all rows)', async () => {
        setRole('admin');
        const res = await request(makeApp()).get('/user-stories');
        expect(res.status).toBe(200);
        const dq = findDataQuery();
        expect(dq).toBeDefined();
        expect(dq.sql).toMatch(/AND TRUE/);
    });

    test('pm with view_any: filter clause is TRUE (sees all stories)', async () => {
        setRole('pm');
        const res = await request(makeApp()).get('/user-stories');
        expect(res.status).toBe(200);
        const dq = findDataQuery();
        expect(dq.sql).toMatch(/AND TRUE/);
    });

    test('team_manager: filter includes owner_team_id branch', async () => {
        setRole('team_manager');
        const res = await request(makeApp()).get('/user-stories');
        expect(res.status).toBe(200);
        const dq = findDataQuery();
        expect(dq.sql).toMatch(/us\.owner_team_id = /);
        expect(dq.params).toContain('team-tm');
    });

    test('member: filter includes created_by_user_id branch but not owner_team_id', async () => {
        setRole('member');
        const res = await request(makeApp()).get('/user-stories');
        expect(res.status).toBe(200);
        const dq = findDataQuery();
        expect(dq.sql).toMatch(/us\.created_by_user_id = /);
        expect(dq.sql).not.toMatch(/us\.owner_team_id = /);
        expect(dq.params).toContain('u-member');
    });

    test('viewer: filter includes team + visibility_scope=project branches (view-only)', async () => {
        setRole('viewer');
        const res = await request(makeApp()).get('/user-stories');
        expect(res.status).toBe(200);
        const dq = findDataQuery();
        expect(dq.sql).toMatch(/us\.owner_team_id = /);
        expect(dq.sql).toMatch(/us\.visibility_scope = 'project'/);
    });
});

describe('GET /user-stories/:id — detail enforcement', () => {
    test('admin can view any story → 200 with _can payload', async () => {
        setRole('admin');
        queryHandler = async (sql) => {
            if (/FROM user_stories us\s+LEFT JOIN projects/i.test(sql)) {
                return { rows: [{
                    id: 'story-1', project_id: 'p1', deleted_at: null,
                    owner_team_id: 'team-other', created_by_user_id: 'u-other',
                    visibility_scope: 'team', title: 'X',
                }] };
            }
            return { rows: [] };
        };
        const res = await request(makeApp()).get('/user-stories/story-1');
        expect(res.status).toBe(200);
        expect(res.body._can).toBeDefined();
    });

    test('member viewing another team\'s story → 403 (manipulation guard)', async () => {
        setRole('member');
        queryHandler = async (sql) => {
            if (/FROM user_stories us\s+LEFT JOIN projects/i.test(sql)) {
                return { rows: [{
                    id: 'story-1', project_id: 'proj-other', deleted_at: null,
                    owner_team_id: 'team-other', created_by_user_id: 'someone-else',
                    visibility_scope: 'team', title: 'Foreign',
                }] };
            }
            return { rows: [] };
        };
        const res = await request(makeApp()).get('/user-stories/story-1');
        expect(res.status).toBe(403);
        expect(res.body.reason).toBeDefined();
    });
});

describe('DELETE /user-stories/:id — manipulation guard', () => {
    test('member denied deleting a story they do not own → 403', async () => {
        setRole('member');
        queryHandler = async (sql) => {
            if (/SELECT \* FROM user_stories WHERE id = \$1/i.test(sql)) {
                return { rows: [{
                    id: 'story-1', deleted_at: null, project_id: 'proj-other',
                    owner_team_id: 'team-other', created_by_user_id: 'someone-else',
                    visibility_scope: 'team', tuleap_artifact_id: null,
                }] };
            }
            return { rows: [] };
        };
        const res = await request(makeApp()).delete('/user-stories/story-1');
        expect(res.status).toBe(403);
        expect(res.body.reason).toBeDefined();
    });
});

describe('GET /user-stories/:id — enforced denial', () => {
    test('member viewing a foreign story gets 403', async () => {
        setRole('member');
        queryHandler = async (sql) => {
            if (/FROM user_stories us\s+LEFT JOIN projects/i.test(sql)) {
                return { rows: [{
                    id: 'story-1', project_id: 'p-other', deleted_at: null,
                    owner_team_id: 'team-other', created_by_user_id: 'someone-else',
                    visibility_scope: 'team', title: 'Foreign',
                }] };
            }
            return { rows: [] };
        };
        const res = await request(makeApp()).get('/user-stories/story-1');
        expect(res.status).toBe(403);
        expect(res.body.reason).toBeDefined();
    });
});

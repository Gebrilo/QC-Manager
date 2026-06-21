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

jest.mock('../src/services/accessDefaults', () => ({
    buildAccessDefaults: jest.fn().mockResolvedValue({
        owner_team_id: 'team-x',
        visibility_scope: 'team',
        default_acl_grants: [],
    }),
    materializeAclGrants: jest.fn().mockResolvedValue(0),
}));

jest.mock('../src/middleware/audit', () => ({
    auditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/utils/n8n', () => ({
    triggerWorkflow: jest.fn(),
}));

jest.mock('../src/services/notifications/dispatcher', () => ({
    dispatchTaskAssignment: jest.fn().mockResolvedValue(undefined),
    dispatchFromAudit: jest.fn().mockResolvedValue(undefined),
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
    team_editor: {
        user: { id: 'u-editor', email: 'editor@x.io', role: 'team_manager' },
        resolved: {
            effectivePermissions: new Set(['qc.tasks.view_team', 'qc.tasks.edit_team']),
            scope: { team_id: 'team-x', team_type: 'qc', pm_of_projects: [] },
        },
    },
    team_viewer: {
        user: { id: 'u-viewer', email: 'viewer@x.io', role: 'viewer' },
        resolved: {
            effectivePermissions: new Set(['qc.tasks.view_team']),
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

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

describe('POST/PATCH /tasks — description column mapping', () => {
    function wireTaskWriteQueries(row) {
        queryHandler = async (sql) => {
            if (/INSERT INTO tasks/i.test(sql)) return { rows: [row] };
            if (/SELECT \* FROM tasks WHERE id = \$1/.test(sql)) return { rows: [row] };
            if (/UPDATE tasks SET description = \$1, updated_at = NOW\(\) WHERE id = \$2 RETURNING \*/.test(sql)) {
                return { rows: [{ ...row, description: 'Updated task details' }] };
            }
            if (/FROM tuleap_sync_config/.test(sql)) return { rows: [] };
            if (/UPDATE tasks SET sync_status = 'standalone'/.test(sql)) return { rows: [row] };
            if (/SELECT \* FROM v_tasks_with_metrics WHERE id = \$1/.test(sql)) return { rows: [row] };
            if (/FROM task_resource_assignment tra\s+JOIN resources res/.test(sql)) return { rows: [] };
            return { rows: [] };
        };
    }

    test('create persists description in tasks.description without copying it into notes', async () => {
        setRole('admin');
        wireTaskWriteQueries({
            id: 'task-created',
            project_id: PROJECT_ID,
            task_name: 'Mapped task',
            description: 'Task details',
            notes: null,
        });

        const res = await request(makeApp())
            .post('/tasks')
            .send({
                task_id: 'TSK-MAPPED-1',
                project_id: PROJECT_ID,
                task_name: 'Mapped task',
                description: 'Task details',
            });

        expect(res.status).toBe(201);
        const insert = queries.find(q => /INSERT INTO tasks/i.test(q.sql));
        expect(insert).toBeDefined();
        expect(insert.sql).toMatch(/task_name, description, status/);
        expect(insert.sql).toMatch(/tags, notes, completed_date/);
        expect(insert.params[3]).toBe('Task details');
        expect(insert.params[9]).toBeNull();
    });

    test('create persists parent_user_story_id when provided', async () => {
        const parentUserStoryId = '22222222-2222-4222-8222-222222222222';
        setRole('admin');
        wireTaskWriteQueries({
            id: 'task-created',
            project_id: PROJECT_ID,
            task_name: 'Mapped task',
            parent_user_story_id: parentUserStoryId,
        });

        const res = await request(makeApp())
            .post('/tasks')
            .send({
                task_id: 'TSK-PARENT-1',
                project_id: PROJECT_ID,
                task_name: 'Mapped task',
                parent_user_story_id: parentUserStoryId,
            });

        expect(res.status).toBe(201);
        const insert = queries.find(q => /INSERT INTO tasks/i.test(q.sql));
        expect(insert).toBeDefined();
        expect(insert.sql).toMatch(/parent_user_story_id/);
        expect(insert.params).toContain(parentUserStoryId);
    });

    test('update maps description patches to tasks.description, not notes', async () => {
        setRole('admin');
        wireTaskWriteQueries({
            id: 'bbbbbbbb-0000-0000-0000-000000000001',
            project_id: PROJECT_ID,
            task_name: 'Mapped task',
            status: 'Todo',
            owner_team_id: 'team-x',
            visibility_scope: 'team',
            created_by_user_id: 'u-admin',
            description: 'Old task details',
            notes: 'Existing notes',
        });

        const res = await request(makeApp())
            .patch('/tasks/bbbbbbbb-0000-0000-0000-000000000001')
            .send({ description: 'Updated task details' });

        expect(res.status).toBe(200);
        const update = queries.find(q => /UPDATE tasks SET description = \$1, updated_at = NOW\(\) WHERE id = \$2 RETURNING \*/.test(q.sql));
        expect(update).toBeDefined();
        expect(update.sql).not.toMatch(/notes =/);
        expect(update.params).toEqual(['Updated task details', 'bbbbbbbb-0000-0000-0000-000000000001']);
    });

    test('update accepts parent_user_story_id null and writes it for audit-backed clearing', async () => {
        const parentUserStoryId = '22222222-2222-4222-8222-222222222222';
        setRole('admin');
        wireTaskWriteQueries({
            id: 'bbbbbbbb-0000-0000-0000-000000000001',
            project_id: PROJECT_ID,
            task_name: 'Mapped task',
            status: 'Todo',
            owner_team_id: 'team-x',
            visibility_scope: 'team',
            created_by_user_id: 'u-admin',
            parent_user_story_id: parentUserStoryId,
        });
        queryHandler = async (sql) => {
            if (/SELECT \* FROM tasks WHERE id = \$1/.test(sql)) {
                return { rows: [{
                    id: 'bbbbbbbb-0000-0000-0000-000000000001',
                    project_id: PROJECT_ID,
                    task_name: 'Mapped task',
                    status: 'Todo',
                    owner_team_id: 'team-x',
                    visibility_scope: 'team',
                    created_by_user_id: 'u-admin',
                    parent_user_story_id: parentUserStoryId,
                }] };
            }
            if (/UPDATE tasks SET parent_user_story_id = \$1, updated_at = NOW\(\) WHERE id = \$2 RETURNING \*/.test(sql)) {
                return { rows: [{
                    id: 'bbbbbbbb-0000-0000-0000-000000000001',
                    project_id: PROJECT_ID,
                    task_name: 'Mapped task',
                    status: 'Todo',
                    parent_user_story_id: null,
                }] };
            }
            if (/FROM tuleap_sync_config/.test(sql)) return { rows: [] };
            if (/UPDATE tasks SET sync_status = 'standalone'/.test(sql)) return { rows: [] };
            if (/SELECT \* FROM v_tasks_with_metrics WHERE id = \$1/.test(sql)) {
                return { rows: [{ id: 'bbbbbbbb-0000-0000-0000-000000000001', parent_user_story_id: null }] };
            }
            return { rows: [] };
        };

        const res = await request(makeApp())
            .patch('/tasks/bbbbbbbb-0000-0000-0000-000000000001')
            .send({ parent_user_story_id: null });

        expect(res.status).toBe(200);
        const update = queries.find(q => /UPDATE tasks SET parent_user_story_id = \$1, updated_at = NOW\(\) WHERE id = \$2 RETURNING \*/.test(q.sql));
        expect(update).toBeDefined();
        expect(update.params).toEqual([null, 'bbbbbbbb-0000-0000-0000-000000000001']);
    });
});

describe('GET /tasks — list filter wiring', () => {
    test('tester with view_own emits user-exprs + junction assignee branch against view columns', async () => {
        // ADR 0009 / #192 — the list resolves assignees through the
        // task_resource_assignment junction (any assignee, incl. the 3rd+
        // secondary) rather than the two cached resource slots.
        setRole('tester_own_only');
        const res = await request(makeApp()).get('/tasks');
        expect(res.status).toBe(200);

        const dq = findListQuery();
        expect(dq).toBeDefined();
        expect(dq.sql).toMatch(/v\.created_by_user_id\s*=\s*\$/);
        expect(dq.sql).toMatch(
            /FROM task_resource_assignment tra JOIN resources r ON r\.id = tra\.resource_id WHERE tra\.task_id = v\.id/
        );
        expect(dq.sql).not.toMatch(/r\.id\s*=\s*v\.resource1_id/);
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

describe('GET /tasks/:id — single-item enforcement via junction', () => {
    // ADR 0009 / #192 — single-item access resolves through
    // task_resource_assignment so any assignee (primary OR the 3rd+ secondary,
    // which the two cached slots cannot hold) gets the assignee branch.

    // task owned by a different team, created by someone else, private — so the
    // ONLY branch that can grant is the resource assignee branch.
    const TASK = Object.freeze({
        id: 'bbbbbbbb-0000-0000-0000-000000000001',
        project_id: 'p-1',
        resource1_id: 'res-primary',
        resource2_id: 'res-sec1',
        owner_team_id: 'other-team',
        visibility_scope: 'private',
        created_by_user_id: 'someone-else',
        assigned_to: null,
    });

    // Routes the query sequence GET /:id issues: the view fetch,
    // getTaskAssignments, resolveTaskAccessAssigneeResourceId, then
    // AccessEngine.isAssignee. callerResourceId is what the junction returns
    // for this caller (null = not assigned); ownedResources is the set of
    // resource ids the caller's user_id owns.
    function wireQueries({ callerResourceId, ownedResources, assignmentRows = [] }) {
        queryHandler = async (sql, params) => {
            if (/FROM v_tasks_with_metrics WHERE id = \$1/.test(sql)) return { rows: [TASK] };
            if (/SELECT tra\.\*, res\.resource_name[\s\S]*FROM task_resource_assignment tra/.test(sql)) {
                return { rows: assignmentRows };
            }
            if (/SELECT tra\.resource_id, r\.user_id, au\.team_id/.test(sql)) {
                if (!callerResourceId) {
                    return { rows: [
                        { resource_id: TASK.resource1_id, user_id: 'other-user', team_id: 'other-team' },
                    ] };
                }
                return { rows: [
                    { resource_id: callerResourceId, user_id: 'u-tester', team_id: 'team-x' },
                ] };
            }
            if (/SELECT 1 FROM resources WHERE id = \$1 AND user_id = \$2/.test(sql)) {
                return { rows: ownedResources.includes(params[0]) ? [{ ok: 1 }] : [] };
            }
            return { rows: [] };
        };
    }

    test('a 3rd+ secondary (absent from both cached slots) resolves view → 200', async () => {
        setRole('tester_own_only');
        wireQueries({ callerResourceId: 'res-third', ownedResources: ['res-third'] });
        const res = await request(makeApp()).get('/tasks/bbbbbbbb-0000-0000-0000-000000000001');
        expect(res.status).toBe(200);
        expect(res.body.id).toBe('bbbbbbbb-0000-0000-0000-000000000001');
    });

    test('the primary still resolves view → 200', async () => {
        setRole('tester_own_only');
        wireQueries({ callerResourceId: 'res-primary', ownedResources: ['res-primary'] });
        const res = await request(makeApp()).get('/tasks/bbbbbbbb-0000-0000-0000-000000000001');
        expect(res.status).toBe(200);
    });

    test('response includes all assignment rows for edit round-trip', async () => {
        const assignmentRows = [
            { resource_id: 'res-primary', resource_name: 'Primary', assignment_type: 'PRIMARY', estimate_hrs: 16, actual_hrs: 8 },
            { resource_id: 'res-sec1', resource_name: 'Secondary 1', assignment_type: 'SECONDARY', estimate_hrs: 4, actual_hrs: 2 },
            { resource_id: 'res-third', resource_name: 'Secondary 2', assignment_type: 'SECONDARY', estimate_hrs: 12, actual_hrs: 10 },
        ];
        setRole('tester_own_only');
        wireQueries({ callerResourceId: 'res-third', ownedResources: ['res-third'], assignmentRows });

        const res = await request(makeApp()).get('/tasks/bbbbbbbb-0000-0000-0000-000000000001');

        expect(res.status).toBe(200);
        expect(res.body.assignments).toEqual(assignmentRows);
        expect(queries.some(q => /SELECT tra\.\*, res\.resource_name/.test(q.sql))).toBe(true);
    });

    test('a non-assignee without team/role scope is denied → 403', async () => {
        setRole('tester_own_only');
        wireQueries({ callerResourceId: null, ownedResources: [] });
        const res = await request(makeApp()).get('/tasks/bbbbbbbb-0000-0000-0000-000000000001');
        expect(res.status).toBe(403);
    });

    test('team editor gets _can.edit=true while team viewer gets _can.edit=false', async () => {
        const teamTask = {
            id: 'cccccccc-0000-0000-0000-000000000001',
            project_id: 'p-1',
            resource1_id: null,
            resource2_id: null,
            owner_team_id: 'team-x',
            visibility_scope: 'team',
            created_by_user_id: 'someone-else',
            assigned_to: null,
        };

        queryHandler = async (sql) => {
            if (/FROM v_tasks_with_metrics WHERE id = \$1/.test(sql)) return { rows: [teamTask] };
            if (/SELECT tra\.\*, res\.resource_name[\s\S]*FROM task_resource_assignment tra/.test(sql)) return { rows: [] };
            if (/SELECT tra\.resource_id, r\.user_id, au\.team_id/.test(sql)) return { rows: [] };
            if (/SELECT 1 FROM artifact_access/i.test(sql)) return { rows: [] };
            return { rows: [] };
        };

        setRole('team_editor');
        const editorRes = await request(makeApp()).get('/tasks/cccccccc-0000-0000-0000-000000000001');
        expect(editorRes.status).toBe(200);
        expect(editorRes.body._can.edit).toBe(true);

        queries.length = 0;
        setRole('team_viewer');
        const viewerRes = await request(makeApp()).get('/tasks/cccccccc-0000-0000-0000-000000000001');
        expect(viewerRes.status).toBe(200);
        expect(viewerRes.body._can.edit).toBe(false);
    });
});

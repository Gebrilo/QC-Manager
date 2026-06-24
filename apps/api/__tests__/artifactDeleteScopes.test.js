'use strict';

const queries = [];
let queryHandler = async () => ({ rows: [] });
const mockCurrentUser = { value: null };

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

jest.mock('../src/middleware/authMiddleware', () => ({
    requireAuth: (req, _res, next) => { req.user = mockCurrentUser.value; next(); },
    requirePermission: () => (_req, _res, next) => next(),
    requireAnyPermission: () => (_req, _res, next) => next(),
    optionalAuth: (req, _res, next) => { req.user = mockCurrentUser.value; next(); },
}));

jest.mock('../src/access/RoleResolver', () => ({
    resolve: jest.fn(),
    canonicalRole: (role) => (role === 'manager' ? 'team_manager' : role),
}));

jest.mock('../src/middleware/teamAccess', () => ({
    getManagerTeamId: jest.fn().mockResolvedValue('team-1'),
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

jest.mock('../src/services/accessDefaults', () => ({
    buildAccessDefaults: jest.fn().mockResolvedValue({
        owner_team_id: 'team-1',
        visibility_scope: 'team',
        default_acl_grants: [],
    }),
    materializeAclGrants: jest.fn().mockResolvedValue(0),
}));

const mockEmitBug = jest.fn();
const mockEmitTask = jest.fn();
const mockEmitUserStory = jest.fn();

jest.mock('../src/services/emitters/bug', () => ({ emitToTuleap: (...args) => mockEmitBug(...args) }));
jest.mock('../src/services/emitters/task', () => ({
    emitToTuleap: (...args) => mockEmitTask(...args),
    buildTaskEmitUnified: jest.fn(),
}));
jest.mock('../src/services/emitters/user_story', () => ({ emitToTuleap: (...args) => mockEmitUserStory(...args) }));
jest.mock('../src/services/emitters/test_case', () => ({ emitToTuleap: jest.fn() }));
jest.mock('../src/services/tuleapClient', () => ({ defaultClient: {} }));
jest.mock('../src/services/tuleapFieldRegistry', () => ({ defaultRegistry: {} }));

const roleResolver = require('../src/access/RoleResolver');
const express = require('express');
const request = require('supertest');
const bugsRouter = require('../src/routes/bugs');
const tasksRouter = require('../src/routes/tasks');
const testCasesRouter = require('../src/routes/testCases');
const userStoriesRouter = require('../src/routes/userStories');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const ARTIFACT_ID = '33333333-3333-4333-8333-333333333333';
const PROJECT_ID = '44444444-4444-4444-8444-444444444444';
const TEAM_ID = '55555555-5555-4555-8555-555555555555';

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use('/bugs', bugsRouter);
    app.use('/tasks', tasksRouter);
    app.use('/test-cases', testCasesRouter);
    app.use('/user-stories', userStoriesRouter);
    return app;
}

function setResolvedUser({ role, permissions, scope }) {
    mockCurrentUser.value = { id: USER_ID, email: `${role}@example.test`, role };
    roleResolver.resolve.mockResolvedValue({
        effectivePermissions: new Set(permissions),
        scope: {
            team_id: null,
            team_type: null,
            pm_of_projects: [],
            ...scope,
        },
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    queries.length = 0;
    queryHandler = async (sql) => {
        if (/FROM artifact_access/i.test(sql)) return { rows: [] };
        return { rows: [] };
    };
});

describe('artifact delete scope and Tuleap propagation', () => {
    test('tester soft-deletes own Tuleap-linked bug locally without emitting to Tuleap', async () => {
        setResolvedUser({
            role: 'tester',
            permissions: ['qc.bugs.delete_own'],
        });
        queryHandler = async (sql) => {
            if (/SELECT \* FROM bugs WHERE id = \$1/i.test(sql)) {
                return { rows: [{ id: ARTIFACT_ID, title: 'Bug', project_id: PROJECT_ID, created_by_user_id: USER_ID, tuleap_artifact_id: 123, deleted_at: null }] };
            }
            if (/UPDATE bugs SET deleted_at = NOW\(\)/i.test(sql)) {
                return { rows: [{ id: ARTIFACT_ID, title: 'Bug', deleted_at: 'now' }] };
            }
            return { rows: [] };
        };

        const res = await request(makeApp()).delete(`/bugs/${ARTIFACT_ID}`);

        expect(res.status).toBe(200);
        expect(mockEmitBug).not.toHaveBeenCalled();
        expect(queries.some(q => /FROM tuleap_sync_config/i.test(q.sql))).toBe(false);
    });

    test('admin delete of a Tuleap-linked bug still emits to Tuleap', async () => {
        setResolvedUser({ role: 'admin', permissions: ['*'] });
        mockEmitBug.mockResolvedValueOnce({ deleted: true });
        queryHandler = async (sql) => {
            if (/SELECT \* FROM bugs WHERE id = \$1/i.test(sql)) {
                return { rows: [{ id: ARTIFACT_ID, title: 'Bug', project_id: PROJECT_ID, created_by_user_id: OTHER_ID, tuleap_artifact_id: 123, deleted_at: null }] };
            }
            if (/FROM tuleap_sync_config/i.test(sql)) {
                return { rows: [{ id: 'cfg-1', qc_project_id: PROJECT_ID, tuleap_tracker_id: 99 }] };
            }
            return { rows: [{ id: ARTIFACT_ID, title: 'Bug', deleted_at: 'now' }] };
        };

        const res = await request(makeApp()).delete(`/bugs/${ARTIFACT_ID}`);

        expect(res.status).toBe(200);
        expect(mockEmitBug).toHaveBeenCalledWith(
            expect.objectContaining({ tuleap: { artifact_id: 123 } }),
            expect.objectContaining({ tuleap_tracker_id: 99 }),
            'delete',
            expect.any(Object)
        );
    });

    test('team manager soft-deletes team task locally without emitting to Tuleap', async () => {
        setResolvedUser({
            role: 'team_manager',
            permissions: ['qc.tasks.delete_team'],
            scope: { team_id: TEAM_ID, team_type: 'qc' },
        });
        queryHandler = async (sql) => {
            if (/SELECT \* FROM tasks WHERE id = \$1/i.test(sql)) {
                return { rows: [{ id: ARTIFACT_ID, task_name: 'Task', project_id: PROJECT_ID, owner_team_id: TEAM_ID, tuleap_artifact_id: 456, deleted_at: null }] };
            }
            if (/SELECT id FROM projects WHERE id = \$1 AND team_id = \$2/i.test(sql)) {
                return { rows: [{ id: PROJECT_ID }] };
            }
            if (/UPDATE tasks SET deleted_at = NOW\(\)/i.test(sql)) {
                return { rows: [{ id: ARTIFACT_ID, task_name: 'Task', deleted_at: 'now' }] };
            }
            return { rows: [] };
        };

        const res = await request(makeApp()).delete(`/tasks/${ARTIFACT_ID}`);

        expect(res.status).toBe(200);
        expect(mockEmitTask).not.toHaveBeenCalled();
        expect(queries.some(q => /FROM tuleap_sync_config/i.test(q.sql))).toBe(false);
    });

    test('tester soft-deletes own test case through row-level delete scope', async () => {
        setResolvedUser({
            role: 'tester',
            permissions: ['qc.testcases.delete_own'],
        });
        queryHandler = async (sql) => {
            if (/SELECT \* FROM test_case WHERE id = \$1 AND deleted_at IS NULL/i.test(sql)) {
                return { rows: [{ id: ARTIFACT_ID, test_case_id: 'TC-1', project_id: PROJECT_ID, created_by_user_id: USER_ID, deleted_at: null }] };
            }
            if (/UPDATE test_case SET deleted_at = CURRENT_TIMESTAMP/i.test(sql)) {
                return { rows: [{ id: ARTIFACT_ID, deleted_at: 'now' }] };
            }
            return { rows: [] };
        };

        const res = await request(makeApp()).delete(`/test-cases/${ARTIFACT_ID}`);

        expect(res.status).toBe(204);
        expect(queries.some(q => /UPDATE test_case SET deleted_at/i.test(q.sql))).toBe(true);
    });

    test('PM soft-deletes a managed-project user story locally without emitting to Tuleap', async () => {
        setResolvedUser({
            role: 'pm',
            permissions: ['qc.user_stories.delete'],
            scope: { team_type: 'pm', pm_of_projects: [PROJECT_ID] },
        });
        queryHandler = async (sql) => {
            if (/SELECT \* FROM user_stories WHERE id = \$1/i.test(sql)) {
                return { rows: [{ id: ARTIFACT_ID, title: 'Story', project_id: PROJECT_ID, created_by_user_id: OTHER_ID, tuleap_artifact_id: 789, deleted_at: null }] };
            }
            if (/UPDATE user_stories SET deleted_at = NOW\(\)/i.test(sql)) {
                return { rows: [{ id: ARTIFACT_ID, title: 'Story', deleted_at: 'now' }] };
            }
            return { rows: [] };
        };

        const res = await request(makeApp()).delete(`/user-stories/${ARTIFACT_ID}`);

        expect(res.status).toBe(200);
        expect(mockEmitUserStory).not.toHaveBeenCalled();
        expect(queries.some(q => /FROM tuleap_sync_config/i.test(q.sql))).toBe(false);
    });
});

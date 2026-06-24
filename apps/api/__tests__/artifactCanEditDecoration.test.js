'use strict';

// Issue #219 — Tasks, Bugs, and Test Cases GET responses expose per-row
// `_can.edit` so the UI can render inline status controls accurately.

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
    requireAnyPermission: () => (_req, _res, next) => next(),
}));

jest.mock('../src/access/RoleResolver', () => ({
    resolve: jest.fn(),
    canonicalRole: (role) => (role === 'manager' ? 'team_manager' : role),
}));

jest.mock('../src/middleware/audit', () => ({
    auditLog: jest.fn(async () => {}),
    auditMiddleware: (_req, _res, next) => next(),
}));

jest.mock('../src/services/tuleapClient', () => ({ defaultClient: {} }));
jest.mock('../src/services/tuleapFieldRegistry', () => ({ defaultRegistry: {} }));
jest.mock('../src/services/emitters/bug', () => ({ emitToTuleap: jest.fn() }));
jest.mock('../src/services/emitters/test_case', () => ({ emitToTuleap: jest.fn() }));

const express = require('express');
const request = require('supertest');
const roleResolver = require('../src/access/RoleResolver');
const bugsRouter = require('../src/routes/bugs');
const testCasesRouter = require('../src/routes/testCases');

const TEAM_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const BUG_ID = '33333333-3333-4333-8333-333333333333';
const TEST_CASE_ID = '44444444-4444-4444-8444-444444444444';

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use('/bugs', bugsRouter);
    app.use('/test-cases', testCasesRouter);
    return app;
}

const app = makeApp();

const ROLE_FIXTURES = {
    bug_editor: {
        user: { id: '55555555-5555-4555-8555-555555555555', email: 'editor@x.io', role: 'team_manager' },
        resolved: {
            effectivePermissions: new Set(['qc.bugs.view_team', 'qc.bugs.edit_team']),
            scope: { team_id: TEAM_ID, team_type: 'qc', pm_of_projects: [] },
        },
    },
    bug_viewer: {
        user: { id: '66666666-6666-4666-8666-666666666666', email: 'viewer@x.io', role: 'viewer' },
        resolved: {
            effectivePermissions: new Set(['qc.bugs.view_team']),
            scope: { team_id: TEAM_ID, team_type: 'qc', pm_of_projects: [] },
        },
    },
    test_case_editor: {
        user: { id: '77777777-7777-4777-8777-777777777777', email: 'editor@x.io', role: 'team_manager' },
        resolved: {
            effectivePermissions: new Set(['qc.testcases.view_team', 'qc.testcases.edit_team', 'qc.testcases.view_steps']),
            scope: { team_id: TEAM_ID, team_type: 'qc', pm_of_projects: [] },
        },
    },
};

function setRole(name) {
    mockCurrentUser.value = ROLE_FIXTURES[name].user;
    roleResolver.resolve.mockResolvedValue(ROLE_FIXTURES[name].resolved);
}

const bugRow = Object.freeze({
    id: BUG_ID,
    bug_id: 'BUG-1',
    title: 'Login bug',
    project_id: PROJECT_ID,
    owner_team_id: TEAM_ID,
    visibility_scope: 'team',
    created_by_user_id: '99999999-9999-4999-8999-999999999999',
    submitted_by_resource_id: null,
    assigned_to: null,
});

const testCaseRow = Object.freeze({
    id: TEST_CASE_ID,
    test_case_id: 'TC-1',
    title: 'Login test',
    project_id: PROJECT_ID,
    owner_team_id: TEAM_ID,
    visibility_scope: 'team',
    created_by_user_id: '99999999-9999-4999-8999-999999999999',
    assigned_to: null,
});

beforeEach(() => {
    jest.clearAllMocks();
    queries.length = 0;
    queryHandler = async (sql) => {
        if (/FROM artifact_access/i.test(sql)) return { rows: [] };
        return { rows: [] };
    };
});

describe('GET /bugs — _can.edit decoration', () => {
    test('list and detail include _can.edit, with editor/viewer decisions per row', async () => {
        queryHandler = async (sql) => {
            if (/SELECT\s+b\.\*,[\s\S]*FROM bugs b/i.test(sql)) return { rows: [bugRow] };
            if (/SELECT COUNT\(\*\) FROM bugs/i.test(sql)) return { rows: [{ count: '1' }] };
            if (/FROM artifact_access/i.test(sql)) return { rows: [] };
            return { rows: [] };
        };

        setRole('bug_editor');
        const editorList = await request(app).get('/bugs');
        expect(editorList.status).toBe(200);
        expect(editorList.body.data[0]._can.edit).toBe(true);

        setRole('bug_viewer');
        const viewerList = await request(app).get('/bugs');
        expect(viewerList.status).toBe(200);
        expect(viewerList.body.data[0]._can.edit).toBe(false);

        setRole('bug_editor');
        const detail = await request(app).get(`/bugs/${BUG_ID}`);
        expect(detail.status).toBe(200);
        expect(detail.body.data._can.edit).toBe(true);
    });
});

describe('GET /test-cases — _can.edit decoration', () => {
    test('list and detail include _can.edit', async () => {
        queryHandler = async (sql) => {
            if (/COUNT\(\*\) FILTER/i.test(sql)) {
                return { rows: [{ active_count: '1', critical_count: '0', automated_count: '0' }] };
            }
            if (/SELECT COUNT\(\*\) as total/i.test(sql)) return { rows: [{ total: '1' }] };
            if (/FROM v_test_case_summary/i.test(sql) && /ORDER BY/i.test(sql)) return { rows: [testCaseRow] };
            if (/FROM v_test_case_summary WHERE id = \$1/i.test(sql)) return { rows: [testCaseRow] };
            if (/FROM test_execution te/i.test(sql)) return { rows: [] };
            if (/FROM test_case_history/i.test(sql)) return { rows: [] };
            if (/FROM artifact_access/i.test(sql)) return { rows: [] };
            return { rows: [] };
        };

        setRole('test_case_editor');
        const list = await request(app).get('/test-cases');
        expect(list.status).toBe(200);
        expect(list.body.data[0]._can.edit).toBe(true);

        const detail = await request(app).get(`/test-cases/${TEST_CASE_ID}`);
        expect(detail.status).toBe(200);
        expect(detail.body._can.edit).toBe(true);
    });
});

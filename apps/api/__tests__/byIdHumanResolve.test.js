// apps/api/__tests__/byIdHumanResolve.test.js
// Integration test: by-id task routes accept human id (TSK-001) and UUID interchangeably.
// Uses the same full-mock strategy as list-endpoints.smoke.test.js (no real DB).

const TASK_UUID = '22222222-2222-4222-8222-222222222222';
const TASK_HUMAN_ID = 'TSK-001';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery }));

jest.mock('../src/middleware/authMiddleware', () => ({
  requireAuth: (req, _res, next) => { req.user = { id: 'user-1', role: 'admin' }; next(); },
  blockContributors: (_req, _res, next) => next(),
  requirePermission: () => (_req, _res, next) => next(),
  optionalAuth: (req, _res, next) => { req.user = { id: 'user-1', role: 'admin' }; next(); },
  requireRole: () => (_req, _res, next) => next(),
  requireStatusScope: () => (_req, _res, next) => next(),
}));

jest.mock('../src/middleware/audit', () => ({ auditLog: jest.fn() }));
jest.mock('../src/middleware/teamAccess', () => ({
  getManagerTeamId: jest.fn().mockResolvedValue(null),
  canAccessUser: jest.fn().mockResolvedValue(true),
  getTeamScopeFilter: jest.fn().mockResolvedValue({ clause: '1=1', params: [] }),
}));
jest.mock('../src/utils/n8n', () => ({ triggerWorkflow: jest.fn() }));
jest.mock('../src/services/emitters/task', () => ({
  emitToTuleap: jest.fn(),
  buildTaskEmitUnified: jest.fn(),
}));
jest.mock('../src/services/tuleapClient', () => ({ defaultClient: {} }));
jest.mock('../src/services/tuleapFieldRegistry', () => ({ defaultRegistry: {} }));
jest.mock('../src/access/RoleResolver', () => ({
  resolve: jest.fn().mockReturnValue({ role: 'admin', scope: {} }),
}));
jest.mock('../src/services/dashboards/teamMemberDashboards', () => ({
  canEditTask: jest.fn(),
  canTakeOverTask: jest.fn(),
}));
jest.mock('../src/services/accessDefaults', () => ({
  buildAccessDefaults: jest.fn().mockResolvedValue({
    owner_team_id: null,
    visibility_scope: 'global',
    default_acl_grants: [],
  }),
  materializeAclGrants: jest.fn(),
}));
jest.mock('../src/services/access/enforcement', () => ({
  appendListFilter: jest.fn().mockResolvedValue({ nextIdx: 1, clause: '1=1' }),
  enforceArtifact: jest.fn().mockResolvedValue({ allowed: true }),
  decorateRows: jest.fn().mockImplementation((_req, _type, rows) => Promise.resolve(rows)),
  shadowList: jest.fn(),
}));
jest.mock('../src/utils/workingDays', () => ({ computeTaskTimeline: jest.fn() }));
jest.mock('../src/routes/artifactAttachments', () => ({ adoptStagedAttachments: jest.fn() }));
jest.mock('../src/schemas/task', () => ({
  createTaskSchema: { parse: jest.fn(), safeParse: jest.fn() },
  updateTaskSchema: { parse: jest.fn(), safeParse: jest.fn() },
}));
jest.mock('../src/services/notifications/dispatcher', () => ({ dispatchTaskAssignment: jest.fn() }));
jest.mock('../src/services/assignments/taskAssignments', () => ({
  assignmentsFromPayload: jest.fn().mockReturnValue([]),
  validateAssignments: jest.fn(),
  replaceTaskAssignments: jest.fn(),
  getTaskAssignments: jest.fn().mockResolvedValue([]),
  getTaskAssignmentSummary: jest.fn().mockResolvedValue({}),
  primaryOf: jest.fn(),
}));
// shared/rbac is a TS file – virtual mock it
jest.mock('../../../shared/rbac/catalog.ts', () => ({ isTeamManagerRole: jest.fn().mockReturnValue(false) }), { virtual: true });

const express = require('express');
const request = require('supertest');

const seededRow = {
  id: TASK_UUID,
  task_id: TASK_HUMAN_ID,
  task_name: 'Seeded Task',
  status: 'open',
  deleted_at: null,
};

function makeApp() {
  const tasksRouter = require('../src/routes/tasks');
  const app = express();
  app.use(express.json());
  app.use('/tasks', tasksRouter);
  return app;
}

describe('by-id routes accept human id and UUID', () => {
  let app;
  const authHeader = { Authorization: 'Bearer test-token' };

  beforeAll(() => {
    app = makeApp();
  });

  beforeEach(() => {
    mockQuery.mockReset();
    // Default: resolver lookup by human id -> UUID
    mockQuery.mockImplementation((sql, params) => {
      const p = params || [];
      const first = p[0];

      // Artifact resolver: SELECT id FROM tasks WHERE task_id = $1 AND deleted_at IS NULL
      if (sql.includes('WHERE task_id = $1') && first === TASK_HUMAN_ID) {
        return Promise.resolve({ rows: [{ id: TASK_UUID }] });
      }

      // tasks GET /:id via v_tasks_with_metrics
      if (sql.includes('v_tasks_with_metrics') && first === TASK_UUID) {
        return Promise.resolve({ rows: [seededRow] });
      }

      // getTaskAssignments / resolveTaskAccessAssigneeResourceId
      return Promise.resolve({ rows: [] });
    });
  });

  test('human id resolves', async () => {
    const res = await request(app).get('/tasks/TSK-001').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(TASK_UUID);
  });

  test('uuid still resolves', async () => {
    const res = await request(app).get(`/tasks/${TASK_UUID}`).set(authHeader);
    expect(res.status).toBe(200);
  });

  test('unknown human id is 404', async () => {
    // Override: resolver finds nothing for TSK-999
    mockQuery.mockImplementation((sql) => {
      if (sql.includes('WHERE task_id = $1')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });
    const res = await request(app).get('/tasks/TSK-999').set(authHeader);
    expect(res.status).toBe(404);
  });
});

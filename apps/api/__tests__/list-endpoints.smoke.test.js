const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ pool: { query: mockQuery } }));

const express = require('express');
const request = require('supertest');

jest.mock('../src/middleware/authMiddleware', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 'user-1', role: 'admin' }; next(); },
  requirePermission: () => (req, res, next) => next(),
  requireRole: () => (req, res, next) => next(),
  optionalAuth: (req, res, next) => { req.user = { id: 'user-1', role: 'admin' }; next(); },
  requireStatusScope: () => (req, res, next) => next(),
}));

jest.mock('../src/middleware/audit', () => ({
  auditLog: jest.fn(),
}));

jest.mock('../src/middleware/teamAccess', () => ({
  getManagerTeamId: jest.fn().mockResolvedValue(null),
  canAccessUser: jest.fn().mockResolvedValue(true),
  getTeamScopeFilter: jest.fn().mockResolvedValue({ clause: '1=1', params: [] }),
}));

jest.mock('../src/utils/n8n', () => ({
  triggerWorkflow: jest.fn(),
}));

jest.mock('../src/services/emitters/task', () => ({
  emitToTuleap: jest.fn(),
}));

jest.mock('../src/services/tuleapClient', () => ({
  defaultClient: { getArtifact: jest.fn() },
}));

jest.mock('../src/services/tuleapFieldRegistry', () => ({
  defaultRegistry: { resolve: jest.fn() },
}));

jest.mock('../src/access/RoleResolver', () => ({
  resolve: jest.fn().mockReturnValue({ role: 'admin' }),
}));

jest.mock('../src/services/dashboards/teamMemberDashboards', () => ({
  canEditTask: jest.fn(),
  canTakeOverTask: jest.fn(),
}));

jest.mock('../src/services/accessDefaults', () => ({
  buildAccessDefaults: jest.fn(),
  materializeAclGrants: jest.fn(),
}));

jest.mock('../src/services/access/enforcement', () => ({
  appendListFilter: jest.fn(),
  enforceArtifact: jest.fn(),
  decorateRows: jest.fn(),
}));

jest.mock('../src/utils/workingDays', () => ({
  computeTaskTimeline: jest.fn(),
}));

jest.mock('../src/routes/artifactAttachments', () => ({
  adoptStagedAttachments: jest.fn(),
}));

jest.mock('../src/schemas/project', () => ({
  createProjectSchema: { safeParse: jest.fn() },
  updateProjectSchema: { safeParse: jest.fn() },
}));

jest.mock('../src/schemas/task', () => ({
  createTaskSchema: { safeParse: jest.fn() },
  updateTaskSchema: { safeParse: jest.fn() },
}));

jest.mock('../src/schemas/resource', () => ({
  createResourceSchema: { safeParse: jest.fn() },
  updateResourceSchema: { safeParse: jest.fn() },
}));

const emptyRows = { rows: [] };

function makeApp() {
  const app = express();
  app.use(express.json());

  const apiRouter = express.Router();
  apiRouter.use('/bugs', require('../src/routes/bugs'));
  apiRouter.use('/governance', require('../src/routes/governance'));

  app.use('/api', apiRouter);
  return app;
}

const endpoints = [
  { path: '/api/bugs/summary', minCalls: 2 },
  { path: '/api/governance/release-readiness', minCalls: 1 },
  { path: '/api/governance/quality-risks', minCalls: 1 },
  { path: '/api/governance/workload-balance', minCalls: 1 },
  { path: '/api/governance/project-health', minCalls: 1 },
  { path: '/api/governance/quality-metrics', minCalls: 1 },
  { path: '/api/governance/blocked-analysis', minCalls: 1 },
  { path: '/api/governance/execution-progress', minCalls: 1 },
  { path: '/api/governance/test-coverage', minCalls: 1 },
  { path: '/api/governance/execution-trend', minCalls: 1 },
];

let app;

beforeAll(() => {
  app = makeApp();
});

afterEach(() => jest.clearAllMocks());

describe('list-endpoint smoke tests', () => {
  test.each(endpoints)('$path does not return 500 on empty data', async ({ path, minCalls }) => {
    mockQuery.mockResolvedValue(emptyRows);
    const res = await request(app).get(path);
    expect(res.status).not.toBe(500);
    expect(mockQuery.mock.calls.length).toBeGreaterThanOrEqual(minCalls || 1);
  });
});

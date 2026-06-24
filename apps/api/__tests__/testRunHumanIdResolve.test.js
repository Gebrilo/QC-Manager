// apps/api/__tests__/testRunHumanIdResolve.test.js
// Regression: the GET /test-executions/test-runs/:id route resolves human run
// ids for BOTH live prefix families — 'RUN-' (created via POST) and 'TR-'
// (Excel import). The original gate (/^RUN-\d+$/) 404'd every TR-* run at the
// top of the handler even though the row exists. Full-mock strategy (no real DB),
// mirroring byIdHumanResolve.test.js.

const RUN_UUID = '49a7cb0f-21f6-452b-98a9-8ae0ac9905f3';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({
  query: (...args) => mockQuery(...args),
  pool: { query: (...args) => mockQuery(...args), connect: jest.fn() },
}));

jest.mock('../src/middleware/authMiddleware', () => ({
  requireAuth: (req, _res, next) => { req.user = { id: 'user-1', role: 'admin' }; next(); },
  blockContributors: (_req, _res, next) => next(),
  requirePermission: () => (_req, _res, next) => next(),
  requireAnyPermission: () => (_req, _res, next) => next(),
}));

jest.mock('../src/middleware/audit', () => ({ auditLog: jest.fn() }));
jest.mock('../src/services/access/enforcement', () => ({
  appendListFilter: jest.fn().mockResolvedValue({ nextIdx: 1, clause: '1=1' }),
  enforceArtifact: jest.fn().mockResolvedValue({ allowed: true }),
  decorateRows: jest.fn().mockImplementation((_req, _type, rows) => Promise.resolve(rows)),
  shadowList: jest.fn(),
}));

const express = require('express');
const request = require('supertest');

function makeApp() {
  const router = require('../src/routes/testExecutions');
  const app = express();
  app.use(express.json());
  app.use('/test-executions', router);
  return app;
}

function seededRun(runId) {
  return { id: RUN_UUID, run_id: runId, name: 'Seeded Run', status: 'in_progress', deleted_at: null };
}

describe('GET /test-executions/test-runs/:id resolves human ids across prefix families', () => {
  let app;
  const authHeader = { Authorization: 'Bearer test-token' };

  beforeAll(() => { app = makeApp(); });

  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockImplementation((sql) => {
      // Artifact resolver: SELECT id FROM test_run WHERE run_id = $1 ...
      if (sql.includes('run_id = $1')) return Promise.resolve({ rows: [{ id: RUN_UUID }] });
      // Executions list for the run
      if (sql.includes('te.test_run_id = $1')) return Promise.resolve({ rows: [] });
      // Run detail row
      if (sql.includes('FROM test_run tr')) return Promise.resolve({ rows: [seededRun('TR-00002')] });
      return Promise.resolve({ rows: [] });
    });
  });

  test.each(['TR-00002', 'RUN-1'])('human run id %s resolves to 200', async (humanId) => {
    const res = await request(app).get(`/test-executions/test-runs/${humanId}`).set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(RUN_UUID);
  });

  test('uuid still resolves to 200', async () => {
    const res = await request(app).get(`/test-executions/test-runs/${RUN_UUID}`).set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(RUN_UUID);
  });

  test('lowercase id (tr-1) is rejected at the gate with a 404 and no DB hit', async () => {
    const res = await request(app).get('/test-executions/test-runs/tr-1').set(authHeader);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false });
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

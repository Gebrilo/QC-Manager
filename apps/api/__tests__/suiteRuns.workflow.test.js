const mockPoolQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockRelease = jest.fn();
const mockConnect = jest.fn();
const mockClient = { query: mockClientQuery, release: mockRelease };

jest.mock('../src/config/db', () => ({
  pool: {
    query: mockPoolQuery,
    connect: mockConnect,
  },
  query: mockPoolQuery,
}));

jest.mock('../src/middleware/authMiddleware', () => ({
  requireAuth: (req, res, next) => {
    req.user = { id: '11111111-1111-1111-1111-111111111111', email: 'tester@example.com' };
    next();
  },
  blockContributors: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next(),
  requireAnyPermission: () => (req, res, next) => next(),
}));

const express = require('express');
const request = require('supertest');
const testSuitesRouter = require('../src/routes/testSuites');
const testExecutionsRouter = require('../src/routes/testExecutions');

const app = express();
app.use(express.json());
app.use('/test-suites', testSuitesRouter);
app.use('/test-executions', testExecutionsRouter);

const suiteId = '22222222-2222-2222-2222-222222222222';
const runId = '33333333-3333-3333-3333-333333333333';
const projectId = '44444444-4444-4444-4444-444444444444';
const otherProjectId = '55555555-5555-5555-5555-555555555555';
const caseId = '66666666-6666-6666-6666-666666666666';
const caseId2 = '77777777-7777-7777-7777-777777777777';
const executionId = '88888888-8888-8888-8888-888888888888';

beforeEach(() => {
  mockConnect.mockResolvedValue(mockClient);
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('suite-based test run workflow', () => {
  test('available test cases are scoped to the suite project and exclude existing suite cases', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ id: suiteId, project_id: projectId }] })
      .mockResolvedValueOnce({ rows: [{ total: '1' }] })
      .mockResolvedValueOnce({
        rows: [{ id: caseId, test_case_id: 'TC-0001', title: 'Login works', status: 'active', priority: 'high' }],
      });

    const res = await request(app)
      .get(`/test-suites/${suiteId}/available-test-cases?status=active&priority=high&page=2&limit=10`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(mockPoolQuery.mock.calls[1][0]).toContain('tc.project_id = $1');
    expect(mockPoolQuery.mock.calls[1][0]).toContain('NOT EXISTS');
    expect(mockPoolQuery.mock.calls[1][1]).toEqual([projectId, suiteId, 'active', 'high']);
  });

  test('adding a cross-project test case to a suite returns 400', async () => {
    mockClientQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: suiteId, suite_id: 'TS-00001', project_id: projectId }] })
      .mockResolvedValueOnce({ rows: [{ id: caseId, project_id: otherProjectId }] })
      .mockResolvedValueOnce({});

    const res = await request(app)
      .post(`/test-suites/${suiteId}/test-cases`)
      .send({ test_case_ids: [caseId] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/same project/);
    expect(mockClientQuery.mock.calls.some(call => /INSERT INTO test_suite_cases/i.test(call[0]))).toBe(false);
  });

  test('creating a run from an empty suite returns 400 before inserting a run', async () => {
    mockClientQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: suiteId, suite_id: 'TS-00001', project_id: projectId }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({});

    const res = await request(app)
      .post('/test-executions/test-runs/from-suite')
      .send({ suite_id: suiteId, name: 'Empty suite run', project_id: otherProjectId });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/empty suite/);
    expect(mockClientQuery.mock.calls.some(call => /INSERT INTO test_run/i.test(call[0]))).toBe(false);
  });

  test('creating a run from a suite snapshots cases and uses the suite project', async () => {
    mockClientQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: suiteId, suite_id: 'TS-00001', project_id: projectId, description: 'Regression' }] })
      .mockResolvedValueOnce({
        rows: [
          { test_case_id: caseId, sort_order: 1, title: 'Login works', test_steps: 'Open login', expected_result: 'Dashboard' },
          { test_case_id: caseId2, sort_order: 2, title: 'Logout works', test_steps: 'Click logout', expected_result: 'Logged out' },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ next_id: 7 }] })
      .mockResolvedValueOnce({ rows: [{ id: runId, run_id: 'TR-00007', project_id: projectId, source: 'suite' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: executionId, test_case_id: caseId, status: 'not_run', sort_order: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: '99999999-9999-9999-9999-999999999999', test_case_id: caseId2, status: 'not_run', sort_order: 2 }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const res = await request(app)
      .post('/test-executions/test-runs/from-suite')
      .send({ suite_id: suiteId, name: 'Regression run', project_id: otherProjectId });

    expect(res.status).toBe(201);
    expect(res.body.total_cases).toBe(2);

    const runInsert = mockClientQuery.mock.calls.find(call => /INSERT INTO test_run/i.test(call[0]));
    expect(runInsert[1][3]).toBe(projectId);

    const snapshotInserts = mockClientQuery.mock.calls.filter(call => /INSERT INTO test_suite_cases/i.test(call[0]));
    expect(snapshotInserts).toHaveLength(2);
    expect(snapshotInserts[0][1][3]).toBe(runId);

    const normalizedSnapshotInserts = mockClientQuery.mock.calls.filter(call => /INSERT INTO test_run_suite_cases/i.test(call[0]));
    expect(normalizedSnapshotInserts).toHaveLength(2);
    expect(normalizedSnapshotInserts[0][1]).toEqual([runId, suiteId, caseId, 1, 'Login works', 'Open login', 'Dashboard']);

    const executionInserts = mockClientQuery.mock.calls.filter(call => /INSERT INTO test_execution/i.test(call[0]));
    expect(executionInserts).toHaveLength(2);
    expect(executionInserts[0][0]).toContain('executed_at');
    expect(executionInserts[0][1]).toEqual([runId, caseId, 'Login works', 'Open login', 'Dashboard', 1]);
  });

  test('test run detail reads canonical test_case with snapshot-first display fields', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ id: runId, run_id: 'TR-00007', project_id: projectId, status: 'in_progress' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get(`/test-executions/test-runs/${runId}`);

    expect(res.status).toBe(200);
    const executionSql = mockPoolQuery.mock.calls[1][0];
    expect(executionSql).toContain('LEFT JOIN test_case tc');
    expect(executionSql).toContain('COALESCE(te.test_case_title, tc.title)');
    expect(executionSql).toContain('COALESCE(te.test_case_steps, tc.test_steps)');
    expect(executionSql).toContain('COALESCE(te.expected_result, tc.expected_result)');
  });

  test('updating execution status away from not_run stamps executor and timestamp', async () => {
    mockClientQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: executionId, status: 'not_run' }] })
      .mockResolvedValueOnce({ rows: [{ id: executionId, status: 'pass' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const res = await request(app)
      .patch(`/test-executions/executions/${executionId}`)
      .send({ status: 'pass' });

    expect(res.status).toBe(200);
    const updateSql = mockClientQuery.mock.calls[2][0];
    expect(updateSql).toContain('executed_by');
    expect(updateSql).toContain('executed_at = CURRENT_TIMESTAMP');
    expect(mockClientQuery.mock.calls[2][1]).toContain('11111111-1111-1111-1111-111111111111');
  });
});

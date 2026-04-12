const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ pool: { query: mockQuery } }));

const express = require('express');
const request = require('supertest');

jest.mock('../src/middleware/authMiddleware', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 'user-1' }; next(); },
  requirePermission: () => (req, res, next) => next(),
}));

const governanceRouter = require('../src/routes/governance');
const app = express();
app.use(express.json());
app.use('/governance', governanceRouter);

afterEach(() => jest.clearAllMocks());

describe('GET /governance/quality-metrics', () => {
  test('returns quality metrics for all projects', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        project_id: 'proj-1',
        project_name: 'Alpha',
        execution_coverage_pct: '75.00',
        requirement_coverage_pct: '60.00',
        gross_progress_pct: '80.00',
        net_progress_pct: '65.00',
        total_planned_tests: 20,
        executed_tests: 15,
        covered_requirements: 3,
        total_requirements: 5,
        defects_from_testing: 4,
        total_tests_run: 15,
        effectiveness_pct: '26.67',
      }]
    });
    const res = await request(app).get('/governance/quality-metrics');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].execution_coverage_pct).toBe('75.00');
    expect(res.body.data[0].effectiveness_pct).toBe('26.67');
  });

  test('filters by project_id when provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/governance/quality-metrics?project_id=proj-1');
    expect(res.status).toBe(200);
    const callSql = mockQuery.mock.calls[0][0];
    expect(callSql).toMatch(/ep\.project_id = \$1/);
  });

  test('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db down'));
    const res = await request(app).get('/governance/quality-metrics');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /governance/blocked-analysis', () => {
  test('returns blocked module rows', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        project_id: 'proj-1',
        project_name: 'Alpha',
        module_name: 'Login',
        total_tests: 8,
        blocked_count: 5,
        blocked_pct: '62.50',
        pivot_required: true,
        retest_hrs: '3.00',
        blocked_hrs: '10.00',
      }]
    });
    const res = await request(app).get('/governance/blocked-analysis');
    expect(res.status).toBe(200);
    expect(res.body.data[0].pivot_required).toBe(true);
    expect(res.body.data[0].blocked_pct).toBe('62.50');
  });

  test('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db down'));
    const res = await request(app).get('/governance/blocked-analysis');
    expect(res.status).toBe(500);
  });
});

describe('GET /governance/execution-progress', () => {
  test('returns gross/net progress per project', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        project_id: 'proj-1',
        project_name: 'Alpha',
        total_in_scope: 20,
        passed_count: 12,
        failed_count: 2,
        blocked_count: 3,
        not_run_count: 3,
        rejected_count: 0,
        gross_progress_pct: '85.00',
        net_progress_pct: '70.00',
        total_planned_tests: 20,
        executed_tests: 17,
        execution_coverage_pct: '85.00',
        covered_requirements: 0,
        total_requirements: 0,
        requirement_coverage_pct: null,
      }]
    });
    const res = await request(app).get('/governance/execution-progress');
    expect(res.status).toBe(200);
    expect(res.body.data[0].gross_progress_pct).toBe('85.00');
    expect(res.body.data[0].net_progress_pct).toBe('70.00');
    expect(res.body.data[0].requirement_coverage_pct).toBeNull();
  });
});

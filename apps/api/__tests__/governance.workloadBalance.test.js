'use strict';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ pool: { query: mockQuery } }));

jest.mock('../src/middleware/authMiddleware', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 'user-1' }; next(); },
  blockContributors: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next(),
}));

const express = require('express');
const request = require('supertest');
const governanceRouter = require('../src/routes/governance');

const app = express();
app.use(express.json());
app.use('/governance', governanceRouter);

afterEach(() => jest.clearAllMocks());

describe('GET /governance/workload-balance', () => {
  function rowsFixture() {
    return {
      rows: [
        { project_id: 'p-bal',   project_name: 'Balanced', total_tasks: 7, total_tests: 7,  tests_per_task_ratio: '1.00' },
        { project_id: 'p-over',  project_name: 'Over',     total_tasks: 7, total_tests: 10, tests_per_task_ratio: '1.43' },
        { project_id: 'p-under', project_name: 'Under',    total_tasks: 7, total_tests: 5,  tests_per_task_ratio: '0.71' },
        { project_id: 'p-none',  project_name: 'NoRuns',   total_tasks: 5, total_tests: 0,  tests_per_task_ratio: null },
        { project_id: 'p-empty', project_name: 'NoTasks',  total_tasks: 0, total_tests: 0,  tests_per_task_ratio: null },
      ],
    };
  }

  test('classifies balance_status using completed-runs-per-task bands', async () => {
    mockQuery.mockResolvedValueOnce(rowsFixture());

    const res = await request(app).get('/governance/workload-balance');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const byId = Object.fromEntries(res.body.data.map(r => [r.project_id, r.balance_status]));
    expect(byId['p-bal']).toBe('BALANCED');
    expect(byId['p-over']).toBe('OVER_TESTED');
    expect(byId['p-under']).toBe('UNDER_TESTED');
    expect(byId['p-none']).toBe('NO_TESTS');
    expect(byId['p-empty']).toBe('NO_TASKS');
  });

  test('passes through total_tests and total_tasks unchanged', async () => {
    mockQuery.mockResolvedValueOnce(rowsFixture());
    const res = await request(app).get('/governance/workload-balance');
    const over = res.body.data.find(r => r.project_id === 'p-over');
    expect(over.total_tests).toBe(10);
    expect(over.total_tasks).toBe(7);
  });

  test('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db down'));
    const res = await request(app).get('/governance/workload-balance');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

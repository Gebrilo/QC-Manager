const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ pool: { query: mockQuery } }));

const express = require('express');
const request = require('supertest');

jest.mock('../src/middleware/authMiddleware', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 'user-1' }; next(); },
  requirePermission: () => (req, res, next) => next(),
}));

jest.mock('../src/middleware/audit', () => ({
  auditLog: jest.fn(),
}));

const bugsRouter = require('../src/routes/bugs');
const app = express();
app.use(express.json());
app.use('/bugs', bugsRouter);

afterEach(() => jest.clearAllMocks());

const globalRow = {
  total_bugs: '10',
  open_bugs: '6',
  closed_bugs: '4',
  critical_bugs: '2',
  high_bugs: '3',
  medium_bugs: '3',
  low_bugs: '2',
  bugs_from_testing: '5',
  standalone_bugs: '5',
  bugs_from_test_cases: '5',
  bugs_from_exploratory: '5',
};

const projectId = 'aaaaaaaa-0000-0000-0000-000000000001';
const projectRow = {
  project_id: projectId,
  project_name: 'Project A',
  total_bugs: '3',
  open_bugs: '2',
  closed_bugs: '1',
  critical_bugs: '1',
  high_bugs: '1',
  medium_bugs: '1',
  low_bugs: '0',
  bugs_from_test_cases: '1',
  bugs_from_exploratory: '2',
};

const emptyByProject = { rows: [] };
const emptyRecent = { rows: [] };

describe('GET /bugs/summary', () => {
  test('global totals (no project_id) queries v_bug_summary_global', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [globalRow] })
      .mockResolvedValueOnce(emptyByProject)
      .mockResolvedValueOnce(emptyRecent);

    const res = await request(app).get('/bugs/summary');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const firstCallSQL = mockQuery.mock.calls[0][0];
    expect(firstCallSQL).toContain('v_bug_summary_global');

    expect(res.body.data.totals).toEqual({
      total_bugs: 10,
      open_bugs: 6,
      closed_bugs: 4,
      bugs_from_testing: 5,
      standalone_bugs: 5,
    });
  });

  test('project-scoped totals queries v_bug_summary with WHERE project_id', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [projectRow] })
      .mockResolvedValueOnce({ rows: [projectRow] })
      .mockResolvedValueOnce(emptyRecent);

    const res = await request(app).get(`/bugs/summary?project_id=${projectId}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const firstCallSQL = mockQuery.mock.calls[0][0];
    expect(firstCallSQL).toContain('v_bug_summary');
    expect(firstCallSQL).not.toContain('v_bug_summary_global');
    expect(firstCallSQL).toContain('WHERE project_id');

    expect(mockQuery.mock.calls[0][1]).toEqual([projectId]);
  });

  test('project-scoped defaults bugs_from_testing and standalone_bugs to 0', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [projectRow] })
      .mockResolvedValueOnce({ rows: [projectRow] })
      .mockResolvedValueOnce(emptyRecent);

    const res = await request(app).get(`/bugs/summary?project_id=${projectId}`);

    expect(res.body.data.totals.bugs_from_testing).toBe(0);
    expect(res.body.data.totals.standalone_bugs).toBe(0);
    expect(res.body.data.totals.total_bugs).toBe(3);
    expect(res.body.data.totals.open_bugs).toBe(2);
    expect(res.body.data.totals.closed_bugs).toBe(1);
  });

  test('project-scoped severity and source use project row values', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [projectRow] })
      .mockResolvedValueOnce({ rows: [projectRow] })
      .mockResolvedValueOnce(emptyRecent);

    const res = await request(app).get(`/bugs/summary?project_id=${projectId}`);

    expect(res.body.data.by_severity).toEqual({
      critical: 1,
      high: 1,
      medium: 1,
      low: 0,
    });
    expect(res.body.data.by_source).toEqual({
      test_case: 1,
      exploratory: 2,
    });
  });
});

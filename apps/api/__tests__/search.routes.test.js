const mockQuery = jest.fn();

jest.mock('../src/config/db', () => ({
  pool: { query: mockQuery },
}));

jest.mock('../src/middleware/authMiddleware', () => ({
  requireAuth: (req, res, next) => {
    req.user = {
      id: '11111111-1111-1111-1111-111111111111',
      role: req.headers['x-test-role'] || 'admin',
    };
    next();
  },
}));

const express = require('express');
const request = require('supertest');
const searchRouter = require('../src/routes/search');

const app = express();
app.use(express.json());
app.use('/search', searchRouter);

afterEach(() => jest.clearAllMocks());

describe('GET /search', () => {
  test('returns empty results for short queries without hitting the database', async () => {
    const res = await request(app).get('/search?q=a');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('admin can scope search to one requested type', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        type: 'task',
        id: 'task-1',
        display_id: 'TSK-001',
        title: 'Login task',
        url: '/tasks/task-1',
      }],
    });

    const res = await request(app).get('/search?q=login&type=task&limit=5');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.types).toEqual(['task']);

    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toContain('FROM tasks t');
    expect(sql).not.toContain('FROM bugs b');
    expect(mockQuery.mock.calls[0][1]).toEqual(['%login%', 5]);
  });

  test('non-admin results are limited to granted page permissions', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ permission_key: 'page:bugs' }] })
      .mockResolvedValueOnce({
        rows: [{
          type: 'bug',
          id: 'bug-1',
          display_id: 'BUG-1',
          title: 'Login fails',
          url: '/bugs/bug-1',
        }],
      });

    const res = await request(app)
      .get('/search?q=login&type=bug,task')
      .set('x-test-role', 'user');

    expect(res.status).toBe(200);
    expect(res.body.meta.types).toEqual(['bug']);

    expect(mockQuery.mock.calls[0][0]).toContain('FROM user_permissions');
    expect(mockQuery.mock.calls[0][1]).toEqual([
      '11111111-1111-1111-1111-111111111111',
      'page:bugs',
      'page:tasks',
    ]);

    const sql = mockQuery.mock.calls[1][0];
    expect(sql).toContain('FROM bugs b');
    expect(sql).not.toContain('FROM tasks t');
  });

  test('rejects invalid type filters', async () => {
    const res = await request(app).get('/search?q=login&type=unknown');

    expect(res.status).toBe(400);
    expect(res.body.invalid_types).toEqual(['unknown']);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  describe('Server-side filters (#242)', () => {
    test('status filter is applied as a WHERE clause against the type status column', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await request(app).get('/search?q=login&type=task&status=In%20Progress');

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('t.status = $3');
      // params: [%login%, limit, statusValue]
      expect(mockQuery.mock.calls[0][1]).toEqual(['%login%', 10, 'In Progress']);
    });

    test('priority filter applies to task and is parameterised', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await request(app).get('/search?q=login&type=task&priority=High');

      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('t.priority = $3');
      expect(mockQuery.mock.calls[0][1]).toEqual(['%login%', 10, 'High']);
    });

    test('bug priority filter uses severity (not priority) column', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await request(app).get('/search?q=crash&type=bug&priority=Critical%20Impact');

      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('b.severity = $3');
      expect(mockQuery.mock.calls[0][1]).toEqual(['%crash%', 10, 'Critical Impact']);
    });

    test('assignee filter for task uses task_resource_assignment EXISTS clause', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await request(app).get('/search?q=login&type=task&assignee=user-123');

      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('EXISTS');
      expect(sql).toContain('task_resource_assignment tra');
      expect(sql).toContain('r.user_id = $3');
      expect(mockQuery.mock.calls[0][1]).toEqual(['%login%', 10, 'user-123']);
    });

    test('assignee filter for test_case uses direct UUID equality (tc.assigned_to)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await request(app).get('/search?q=login&type=test_case&assignee=user-123');

      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('tc.assigned_to = $3');
    });

    test('priority filter excludes suite/run fragments (no priority column)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/search?q=run&type=test_suite,test_run&priority=High');

      // Both fragments are dropped → query is null → no SQL hit.
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    test('assignee filter excludes story/suite/run fragments', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/search?q=foo&type=user_story,test_suite&assignee=user-9');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    test('combined status + priority + assignee filters use distinct placeholders', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/search?q=login&type=task&status=Active&priority=High&assignee=u-1');

      expect(res.status).toBe(200);
      expect(mockQuery).toHaveBeenCalled();
      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('t.status = $3');
      expect(sql).toContain('t.priority = $4');
      expect(sql).toContain('r.user_id = $5');
      expect(mockQuery.mock.calls[0][1]).toEqual(['%login%', 10, 'Active', 'High', 'u-1']);
    });

    test('priority and assignee_name columns are returned in the SELECT list', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await request(app).get('/search?q=login&type=task');

      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('priority');
      expect(sql).toContain('assignee_name');
    });
  });
});

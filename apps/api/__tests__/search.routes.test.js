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
const searchRouter = require('../src/modules/work/search.routes');

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
});

const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockClient = { query: mockQuery, release: mockRelease };

jest.mock('../src/config/db', () => ({
  pool: { connect: jest.fn().mockResolvedValue(mockClient) }
}));

jest.mock('../src/middleware/authMiddleware', () => ({
  requireAuth: (req, res, next) => {
    req.user = { id: 'user-1', email: 'tester@example.com' };
    next();
  },
  requirePermission: () => (req, res, next) => next(),
}));

const express = require('express');
const request = require('supertest');
const testExecutionsRouter = require('../src/routes/testExecutions');

const app = express();
app.use(express.json());
app.use('/test-executions', testExecutionsRouter);

afterEach(() => jest.clearAllMocks());

describe('DELETE /test-executions/test-runs/:id', () => {
  test('soft-deletes test_run AND deletes test_result rows for same project+date', async () => {
    mockQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{
          id: 'run-uuid-1',
          run_id: 'TR-001',
          project_id: 'proj-uuid-1',
          started_at: '2026-04-10',
        }]
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const res = await request(app).delete('/test-executions/test-runs/run-uuid-1');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Test run deleted successfully');

    const deleteCall = mockQuery.mock.calls[3];
    expect(deleteCall[0]).toMatch(/DELETE FROM test_result/i);
    expect(deleteCall[0]).toMatch(/project_id\s*=\s*\$1/i);
    expect(deleteCall[0]).toMatch(/executed_at/i);
    expect(deleteCall[1][0]).toBe('proj-uuid-1');
    expect(deleteCall[1][1]).toBe('2026-04-10');
  });

  test('returns 404 when test run does not exist', async () => {
    mockQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({});

    const res = await request(app).delete('/test-executions/test-runs/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Test run not found');
  });

  test('rolls back and returns 500 on DB error during delete', async () => {
    mockQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{ id: 'run-uuid-1', run_id: 'TR-001', project_id: 'proj-uuid-1', started_at: '2026-04-10' }]
      })
      .mockRejectedValueOnce(new Error('DB connection lost'));

    const res = await request(app).delete('/test-executions/test-runs/run-uuid-1');

    expect(res.status).toBe(500);
  });
});

const express = require('express');
const request = require('supertest');

jest.mock('../src/config/db', () => ({
  pool: { query: jest.fn() },
}));
jest.mock('../src/middleware/authMiddleware', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 'u1', role: 'admin', email: 'a@b.c' }; next(); },
  blockContributors: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next(),
  requireAnyPermission: () => (req, res, next) => next(),
}));
jest.mock('../src/services/emitters/test_case', () => ({ emitToTuleap: jest.fn() }));
jest.mock('../src/services/tuleapClient', () => ({
  createTuleapClient: jest.fn(),
  defaultClient: { post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('../src/services/tuleapFieldRegistry', () => ({
  FieldRegistry: jest.fn(),
  defaultRegistry: { getField: jest.fn(), getFieldId: jest.fn(), resolveBindValue: jest.fn() },
}));

const db = require('../src/config/db');
const { emitToTuleap: emitTestCase } = require('../src/services/emitters/test_case');

describe('POST /test-cases/:id/sync — retry endpoint', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/test-cases', require('../src/routes/testCases'));
  });

  beforeEach(() => {
    db.pool.query.mockReset();
    emitTestCase.mockReset();
  });

  it('returns 404 if test case not found', async () => {
    db.pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/test-cases/00000000-0000-0000-0000-000000000000/sync');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Test case not found');
  });

  it('returns standalone when no sync config exists', async () => {
    db.pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'ffffffff-0000-0000-0000-000000000002', project_id: 'p1', title: 'TC', status: 'Not Run', deleted_at: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'ffffffff-0000-0000-0000-000000000002', sync_status: 'standalone' }] });

    const res = await request(app).post('/test-cases/ffffffff-0000-0000-0000-000000000002/sync');
    expect(res.status).toBe(200);
    expect(res.body.data.sync_status).toBe('standalone');
  });

  it('writes synced on successful emit (create mode)', async () => {
    db.pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'ffffffff-0000-0000-0000-000000000002', project_id: 'p1', title: 'TC', status: 'Not Run', deleted_at: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'cfg1', tuleap_tracker_id: 7, tuleap_base_url: 'https://tuleap.example.com' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ffffffff-0000-0000-0000-000000000002', sync_status: 'pending' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ffffffff-0000-0000-0000-000000000002', sync_status: 'synced', tuleap_artifact_id: 6001 }] });

    emitTestCase.mockResolvedValueOnce({ tuleap_artifact_id: 6001, tuleap_url: 'https://tuleap.example.com/plugins/tracker/?aid=6001' });

    const res = await request(app).post('/test-cases/ffffffff-0000-0000-0000-000000000002/sync');
    expect(res.status).toBe(200);
    expect(res.body.data.sync_status).toBe('synced');
    expect(emitTestCase).toHaveBeenCalledTimes(1);
  });

  it('writes failed when emit throws', async () => {
    db.pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'ffffffff-0000-0000-0000-000000000002', project_id: 'p1', title: 'TC', status: 'Not Run', deleted_at: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'cfg1', tuleap_tracker_id: 7, tuleap_base_url: 'https://tuleap.example.com' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ffffffff-0000-0000-0000-000000000002', sync_status: 'pending' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ffffffff-0000-0000-0000-000000000002', sync_status: 'failed', last_sync_error: 'Connection refused' }] });

    emitTestCase.mockRejectedValueOnce(new Error('Connection refused'));

    const res = await request(app).post('/test-cases/ffffffff-0000-0000-0000-000000000002/sync');
    expect(res.status).toBe(200);
    expect(res.body.data.sync_status).toBe('failed');
  });

  it('uses update mode when tuleap_artifact_id exists', async () => {
    db.pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'ffffffff-0000-0000-0000-000000000002', project_id: 'p1', title: 'TC', status: 'Not Run', tuleap_artifact_id: 6001, deleted_at: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'cfg1', tuleap_tracker_id: 7, tuleap_base_url: 'https://tuleap.example.com' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ffffffff-0000-0000-0000-000000000002', sync_status: 'pending' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ffffffff-0000-0000-0000-000000000002', sync_status: 'synced', tuleap_artifact_id: 6001 }] });

    emitTestCase.mockResolvedValueOnce({ tuleap_artifact_id: 6001 });

    await request(app).post('/test-cases/ffffffff-0000-0000-0000-000000000002/sync');
    const callArgs = emitTestCase.mock.calls[0];
    expect(callArgs[2]).toBe('update');
  });
});

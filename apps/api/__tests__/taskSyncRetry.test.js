const express = require('express');
const request = require('supertest');

jest.mock('../src/config/db', () => ({
  query: jest.fn(),
  pool: { query: jest.fn() },
}));
jest.mock('../src/middleware/authMiddleware', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 'u1', role: 'admin', email: 'a@b.c' }; next(); },
  requirePermission: () => (req, res, next) => next(),
}));
jest.mock('../src/middleware/audit', () => ({ auditLog: jest.fn() }));
jest.mock('../src/utils/n8n', () => ({ triggerWorkflow: jest.fn() }));
jest.mock('../src/middleware/teamAccess', () => ({ getManagerTeamId: jest.fn() }));
jest.mock('../src/services/emitters/task', () => ({ emitToTuleap: jest.fn() }));
jest.mock('../src/services/tuleapClient', () => ({
  createTuleapClient: jest.fn(),
  defaultClient: { post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('../src/services/tuleapFieldRegistry', () => ({
  FieldRegistry: jest.fn(),
  defaultRegistry: { getField: jest.fn(), getFieldId: jest.fn(), resolveBindValue: jest.fn() },
}));
jest.mock('../src/routes/artifactAttachments', () => ({
  adoptStagedAttachments: jest.fn().mockResolvedValue(undefined),
}));

const db = require('../src/config/db');
const { emitToTuleap: emitTask } = require('../src/services/emitters/task');

describe('POST /tasks/:id/sync — retry endpoint', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/tasks', require('../src/routes/tasks'));
  });

  beforeEach(() => {
    db.query.mockReset();
    db.pool.query.mockReset();
    emitTask.mockReset();
  });

  it('returns 404 if task not found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/tasks/nonexistent/sync');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Task not found');
  });

  it('returns standalone when no sync config exists', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 't1', project_id: 'p1', task_name: 'T', status: 'Backlog', deleted_at: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 't1', sync_status: 'standalone' }] });

    const res = await request(app).post('/tasks/t1/sync');
    expect(res.status).toBe(200);
    expect(res.body.data.sync_status).toBe('standalone');
  });

  it('writes synced on successful emit (create mode)', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 't1', project_id: 'p1', task_name: 'T', status: 'Backlog', deleted_at: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'cfg1', tuleap_tracker_id: 5, tuleap_base_url: 'https://tuleap.example.com' }] })
      .mockResolvedValueOnce({ rows: [{ id: 't1', sync_status: 'pending' }] })
      .mockResolvedValueOnce({ rows: [{ id: 't1', sync_status: 'synced', tuleap_artifact_id: 88888 }] });

    emitTask.mockResolvedValueOnce({ tuleap_artifact_id: 88888, tuleap_url: 'https://tuleap.example.com/plugins/tracker/?aid=88888' });

    const res = await request(app).post('/tasks/t1/sync');
    expect(res.status).toBe(200);
    expect(res.body.data.sync_status).toBe('synced');
    expect(emitTask).toHaveBeenCalledTimes(1);
  });

  it('writes failed when emit throws', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 't1', project_id: 'p1', task_name: 'T', status: 'Backlog', deleted_at: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'cfg1', tuleap_tracker_id: 5, tuleap_base_url: 'https://tuleap.example.com' }] })
      .mockResolvedValueOnce({ rows: [{ id: 't1', sync_status: 'pending' }] })
      .mockResolvedValueOnce({ rows: [{ id: 't1', sync_status: 'failed', last_sync_error: 'Connection refused' }] });

    emitTask.mockRejectedValueOnce(new Error('Connection refused'));

    const res = await request(app).post('/tasks/t1/sync');
    expect(res.status).toBe(200);
    expect(res.body.data.sync_status).toBe('failed');
  });

  it('uses update mode when tuleap_artifact_id exists', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 't1', project_id: 'p1', task_name: 'T', status: 'Backlog', tuleap_artifact_id: 12345, deleted_at: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'cfg1', tuleap_tracker_id: 5, tuleap_base_url: 'https://tuleap.example.com' }] })
      .mockResolvedValueOnce({ rows: [{ id: 't1', sync_status: 'pending' }] })
      .mockResolvedValueOnce({ rows: [{ id: 't1', sync_status: 'synced', tuleap_artifact_id: 12345 }] });

    emitTask.mockResolvedValueOnce({ tuleap_artifact_id: 12345 });

    await request(app).post('/tasks/t1/sync');
    const callArgs = emitTask.mock.calls[0];
    expect(callArgs[2]).toBe('update');
  });
});
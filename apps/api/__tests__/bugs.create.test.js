const { createBugSchema, updateBugSchema } = require('../src/schemas/bug');
const { normalizeBugStatus, normalizeBugSeverity } = require('../src/services/normalizers/bug');

jest.mock('../src/config/db', () => ({
  pool: { query: jest.fn() },
}));
jest.mock('../src/middleware/audit', () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/middleware/authMiddleware', () => ({
  requireAuth: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next(),
}));
jest.mock('../src/services/tuleapClient', () => ({
  defaultClient: {},
}));
jest.mock('../src/services/tuleapFieldRegistry', () => ({
  defaultRegistry: {},
}));
jest.mock('../src/services/emitters/bug', () => ({
  emitToTuleap: jest.fn(),
}));
jest.mock('../src/routes/artifactAttachments', () => ({
  adoptStagedAttachments: jest.fn().mockResolvedValue(undefined),
}));

const { pool } = require('../src/config/db');
const { emitToTuleap: emitBug } = require('../src/services/emitters/bug');
const request = require('supertest');
const express = require('express');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/bugs', require('../src/routes/bugs'));
  app.use((err, req, res, _next) => {
    res.status(500).json({ error: err.message });
  });
  return app;
}

const PID = '00000000-0000-0000-0000-000000000001';

const ok = (overrides = {}) => ({ rows: [{ id: 'b1', project_id: PID, sync_status: 'pending', ...overrides }] });

describe('POST /bugs — create with Zod + normalizer + sync', () => {
  beforeEach(() => jest.clearAllMocks());

  const validPayload = {
    title: 'Login crash',
    project_id: PID,
    status: 'New',
    severity: 'None',
    description: 'App crashes on login',
    priority: 'medium',
  };

  it('returns 400 with Zod path when title is missing', async () => {
    const res = await request(createApp())
      .post('/bugs')
      .send({ ...validPayload, title: '' });
    expect(res.status).toBe(400);
    expect(res.body.details.find(d => d.path.includes('title'))).toBeDefined();
  });

  it('returns 400 with Zod path when project_id is missing', async () => {
    const res = await request(createApp())
      .post('/bugs')
      .send({ ...validPayload, project_id: undefined });
    expect(res.status).toBe(400);
    expect(res.body.details.find(d => d.path.includes('project_id'))).toBeDefined();
  });

  it('returns 201 with sync_status=synced when Tuleap mock succeeds', async () => {
    pool.query
      .mockResolvedValueOnce(ok({ sync_status: 'pending' }))
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'cfg-1', tuleap_tracker_id: 102 }] })
      .mockResolvedValueOnce(ok({ sync_status: 'synced', tuleap_artifact_id: 999, tuleap_url: 'https://tuleap.example.com/?aid=999' }));

    emitBug.mockResolvedValueOnce({ tuleap_artifact_id: 999, tuleap_url: 'https://tuleap.example.com/?aid=999', qc_id: null });

    const res = await request(createApp()).post('/bugs').send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body.data.sync_status).toBe('synced');
    expect(emitBug).toHaveBeenCalledTimes(1);
  });

  it('returns 201 with sync_status=failed and populated last_sync_error when Tuleap mock rejects', async () => {
    pool.query
      .mockResolvedValueOnce(ok({ sync_status: 'pending' }))
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'cfg-1', tuleap_tracker_id: 102 }] })
      .mockResolvedValueOnce(ok({ sync_status: 'failed', last_sync_error: 'Tuleap unavailable' }));

    emitBug.mockRejectedValueOnce(new Error('Tuleap unavailable'));

    const res = await request(createApp()).post('/bugs').send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body.data.sync_status).toBe('failed');
    expect(res.body.data.last_sync_error).toBe('Tuleap unavailable');
  });

  it('returns 201 with sync_status=standalone when no tuleap_sync_config exists', async () => {
    pool.query
      .mockResolvedValueOnce(ok({ sync_status: 'pending' }))
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce(ok({ sync_status: 'standalone' }));

    const res = await request(createApp()).post('/bugs').send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body.data.sync_status).toBe('standalone');
    expect(emitBug).not.toHaveBeenCalled();
  });

  it('normalizes raw status "open" to "New" before INSERT', async () => {
    const insertCall = jest.fn().mockResolvedValue(ok({ status: 'New' }));
    pool.query
      .mockImplementationOnce(insertCall)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce(ok({ sync_status: 'standalone' }));

    await request(createApp()).post('/bugs').send({ ...validPayload, status: 'open' });

    const params = insertCall.mock.calls[0][1];
    expect(params).toContain('New');
    // 23 original params + 3 access columns (owner_team_id, visibility_scope, created_by_user_id)
    expect(params).toHaveLength(26);
    expect(insertCall.mock.calls[0][0]).toContain('$24,$25,$26');
  });

  it('normalizes raw severity "Critical impact" to "Critical Impact" before INSERT', async () => {
    const insertCall = jest.fn().mockResolvedValue(ok({ severity: 'Critical Impact' }));
    pool.query
      .mockImplementationOnce(insertCall)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce(ok({ sync_status: 'standalone' }));

    await request(createApp()).post('/bugs').send({ ...validPayload, severity: 'Critical impact' });

    const params = insertCall.mock.calls[0][1];
    expect(params).toContain('Critical Impact');
  });

  it('local INSERT always succeeds even when Tuleap mock throws', async () => {
    pool.query
      .mockResolvedValueOnce(ok({ sync_status: 'pending' }))
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'cfg-1', tuleap_tracker_id: 102 }] })
      .mockResolvedValueOnce(ok({ sync_status: 'failed', last_sync_error: 'Network error' }));

    emitBug.mockRejectedValueOnce(new Error('Network error'));

    const res = await request(createApp()).post('/bugs').send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sync_status).toBe('failed');
  });
});

describe('Zod schemas', () => {
  it('createBugSchema rejects invalid environment', () => {
    const result = createBugSchema.safeParse({
      title: 'Test', project_id: PID, status: 'New', environment: 'INVALID',
    });
    expect(result.success).toBe(false);
  });

  it('updateBugSchema allows partial updates without project_id', () => {
    const result = updateBugSchema.safeParse({ title: 'Updated' });
    expect(result.success).toBe(true);
  });

  it('updateBugSchema preserves project_id', () => {
    const result = updateBugSchema.safeParse({ project_id: PID, title: 'X' });
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('project_id', PID);
  });
});

describe('Normalizer integration', () => {
  it('normalizeBugStatus maps "open" to "New"', () => {
    expect(normalizeBugStatus('open')).toBe('New');
  });

  it('normalizeBugSeverity maps "Critical impact" to "Critical Impact"', () => {
    expect(normalizeBugSeverity('Critical impact')).toBe('Critical Impact');
  });

  it('normalizeBugStatus defaults to "New" for unknown values', () => {
    expect(normalizeBugStatus('unknown_status')).toBe('New');
  });

  it('normalizeBugSeverity defaults to "None" for unknown values', () => {
    expect(normalizeBugSeverity('unknown_severity')).toBe('None');
  });
});

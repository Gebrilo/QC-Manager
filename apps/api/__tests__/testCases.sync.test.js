const { pool } = require('../src/config/db');
const { emitToTuleap: emitTestCase } = require('../src/services/emitters/test_case');
const request = require('supertest');
const express = require('express');

jest.mock('../src/config/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../src/middleware/authMiddleware', () => ({
  requireAuth: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next(),
}));
jest.mock('../src/services/tuleapClient', () => ({ defaultClient: {} }));
jest.mock('../src/services/tuleapFieldRegistry', () => ({ defaultRegistry: {} }));
jest.mock('../src/services/emitters/test_case', () => ({ emitToTuleap: jest.fn() }));

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/test-cases', require('../src/routes/testCases'));
  app.use((err, req, res, _next) => res.status(500).json({ error: err.message }));
  return app;
}

const PID = '00000000-0000-0000-0000-000000000001';
const existingRow = {
  id: 'tc1', project_id: PID, sync_status: 'failed', tuleap_artifact_id: null,
  title: 'Test', status: 'Not Run', description: null, preconditions: null,
  test_steps: null, expected_result: null
};

describe('POST /test-cases/:id/sync — retry endpoint', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 404 when test case not found', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(createApp()).post('/test-cases/nonexistent/sync');
    expect(res.status).toBe(404);
  });

  it('returns sync_status=standalone when no tuleap_sync_config', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [existingRow] })   // SELECT test_case
      .mockResolvedValueOnce({ rows: [] })               // resolveTestCaseSyncConfig → no config
      .mockResolvedValueOnce({ rows: [{ ...existingRow, sync_status: 'standalone', last_sync_attempted_at: new Date().toISOString() }] }); // UPDATE standalone

    const res = await request(createApp()).post('/test-cases/tc1/sync');
    expect(res.status).toBe(200);
    expect(res.body.data.sync_status).toBe('standalone');
  });

  it('returns sync_status=synced when emit succeeds', async () => {
    const syncedRow = { ...existingRow, sync_status: 'synced', tuleap_artifact_id: 202, last_sync_attempted_at: new Date().toISOString(), last_sync_error: null };
    pool.query
      .mockResolvedValueOnce({ rows: [existingRow] })
      .mockResolvedValueOnce({ rows: [{ tuleap_tracker_id: 7 }] })  // resolveTestCaseSyncConfig
      .mockResolvedValueOnce(undefined)                              // UPDATE pending
      .mockResolvedValueOnce({ rows: [syncedRow] });                 // UPDATE synced

    emitTestCase.mockResolvedValueOnce({ tuleap_artifact_id: 202 });

    const res = await request(createApp()).post('/test-cases/tc1/sync');
    expect(res.status).toBe(200);
    expect(res.body.data.sync_status).toBe('synced');
    expect(res.body.data.tuleap_artifact_id).toBe(202);
  });

  it('returns sync_status=failed when emit throws', async () => {
    const failedRow = { ...existingRow, sync_status: 'failed', last_sync_error: 'timeout', last_sync_attempted_at: new Date().toISOString() };
    pool.query
      .mockResolvedValueOnce({ rows: [existingRow] })
      .mockResolvedValueOnce({ rows: [{ tuleap_tracker_id: 7 }] })  // resolveTestCaseSyncConfig
      .mockResolvedValueOnce(undefined)                              // UPDATE pending
      .mockResolvedValueOnce({ rows: [failedRow] });                 // UPDATE failed

    emitTestCase.mockRejectedValueOnce(new Error('timeout'));

    const res = await request(createApp()).post('/test-cases/tc1/sync');
    expect(res.status).toBe(200);
    expect(res.body.data.sync_status).toBe('failed');
    expect(res.body.data.last_sync_error).toBe('timeout');
  });
});

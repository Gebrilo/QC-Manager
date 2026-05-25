const { pool } = require('../src/config/db');
const { emitToTuleap: emitTestCase } = require('../src/services/emitters/test_case');
const request = require('supertest');
const express = require('express');

// client mock: handles BEGIN, nextval, INSERT, history, audit_log, COMMIT/ROLLBACK inside the transaction
const mockClientQuery = jest.fn();
const mockClient = { query: mockClientQuery, release: jest.fn() };

jest.mock('../src/config/db', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));
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

// Helper: mock pool.connect + pool.query responses for a successful INSERT flow.
//
// validPayload has no assigned_to, so the assigned_to lookup (pool.query) is skipped.
// Transaction queries go through client.query (BEGIN, nextval, INSERT, history, audit_log, COMMIT).
// Non-transactional pool.query calls: view SELECT (after COMMIT).
// Additional pool.query mocks for sync config lookup + UPDATE writeback are added per test.
function mockInsert(overrides = {}) {
  const row = { id: 'tc1', project_id: PID, sync_status: 'pending', ...overrides };

  // pool.connect returns the mock client
  pool.connect.mockResolvedValue(mockClient);

  // pool.query: view SELECT (first call after COMMIT)
  pool.query.mockResolvedValueOnce({ rows: [row] });

  // client.query sequence inside transaction
  mockClientQuery
    .mockResolvedValueOnce(undefined)                             // BEGIN
    .mockResolvedValueOnce({ rows: [{ next_id: 'TC-00001' }] }) // nextval
    .mockResolvedValueOnce({ rows: [row] })                       // INSERT
    .mockResolvedValueOnce(undefined)                             // history
    .mockResolvedValueOnce(undefined)                             // audit_log
    .mockResolvedValueOnce(undefined);                            // COMMIT
}

const validPayload = {
  title: 'Login test case',
  project_id: PID,
  status: 'Not Run',
  priority: 'medium',
};

describe('POST /test-cases — sync_status writeback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClientQuery.mockReset();
    mockClient.release.mockReset();
  });

  it('writes sync_status=synced when Tuleap emit succeeds', async () => {
    mockInsert();
    // tuleap_sync_config lookup
    pool.query.mockResolvedValueOnce({ rows: [{ tuleap_tracker_id: 7, tuleap_base_url: 'https://t.example.com' }] });
    emitTestCase.mockResolvedValueOnce({ tuleap_artifact_id: 101 });
    // UPDATE synced
    pool.query.mockResolvedValueOnce({ rows: [{ id: 'tc1', sync_status: 'synced', tuleap_artifact_id: 101, last_sync_attempted_at: new Date().toISOString(), last_sync_error: null }] });

    const res = await request(createApp()).post('/test-cases').send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body.sync_status).toBe('synced');
    // Verify the UPDATE included last_sync_attempted_at and last_sync_error columns
    const updateCall = pool.query.mock.calls.find(c => typeof c[0] === 'string' && c[0].includes("sync_status = 'synced'"));
    expect(updateCall).toBeDefined();
    expect(updateCall[0]).toMatch(/last_sync_attempted_at/);
    expect(updateCall[0]).toMatch(/last_sync_error/);
  });

  it('writes sync_status=failed when Tuleap emit throws', async () => {
    mockInsert();
    pool.query.mockResolvedValueOnce({ rows: [{ tuleap_tracker_id: 7 }] });
    emitTestCase.mockRejectedValueOnce(new Error('network timeout'));
    pool.query.mockResolvedValueOnce({ rows: [{ id: 'tc1', sync_status: 'failed', last_sync_error: 'network timeout', last_sync_attempted_at: new Date().toISOString() }] });

    const res = await request(createApp()).post('/test-cases').send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body.sync_status).toBe('failed');
    const failUpdate = pool.query.mock.calls.find(c => typeof c[0] === 'string' && c[0].includes("sync_status = 'failed'"));
    expect(failUpdate).toBeDefined();
    expect(failUpdate[0]).toMatch(/last_sync_attempted_at/);
    expect(failUpdate[1]).toContain('network timeout');
  });

  it('writes sync_status=standalone when no tuleap_sync_config', async () => {
    mockInsert();
    pool.query.mockResolvedValueOnce({ rows: [] }); // no config
    pool.query.mockResolvedValueOnce({ rows: [{ id: 'tc1', sync_status: 'standalone' }] });

    const res = await request(createApp()).post('/test-cases').send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body.sync_status).toBe('standalone');
    const standaloneUpdate = pool.query.mock.calls.find(c => typeof c[0] === 'string' && c[0].includes("sync_status = 'standalone'"));
    expect(standaloneUpdate).toBeDefined();
    expect(standaloneUpdate[0]).toMatch(/last_sync_attempted_at/);
  });
});

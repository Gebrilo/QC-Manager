// Regression for "Failed to delete in Tuleap" 404 propagating to the client.
// When the Tuleap artifact is already gone (manual delete, never created, or
// stale id), the local soft-delete must still succeed so the user is not
// stuck with an undeletable record.

jest.mock('../src/middleware/authMiddleware', () => ({
  requireAuth: (req, _res, next) => { req.user = { id: 'test-user' }; next(); },
  requirePermission: () => (_req, _res, next) => next(),
}));

jest.mock('../src/middleware/audit', () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
}));

const mockEmit = jest.fn();
jest.mock('../src/services/emitters/user_story', () => ({
  emitToTuleap: (...args) => mockEmit(...args),
}));

jest.mock('../src/services/tuleapClient', () => ({ defaultClient: {} }));
jest.mock('../src/services/tuleapFieldRegistry', () => ({ defaultRegistry: {} }));

const mockPoolQuery = jest.fn();
jest.mock('../src/config/db', () => ({
  pool: { query: (...args) => mockPoolQuery(...args) },
}));

const express = require('express');
const request = require('supertest');
const userStoriesRouter = require('../src/routes/userStories');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/user-stories', userStoriesRouter);
  return app;
}

describe('DELETE /user-stories/:id — Tuleap 404 tolerance', () => {
  beforeEach(() => {
    mockEmit.mockReset();
    mockPoolQuery.mockReset();
  });

  it('soft-deletes locally when Tuleap returns 404 (artifact already gone)', async () => {
    const storyId = 'dd314ea0-d509-4ab0-bde5-96d21eb8b54b';

    mockPoolQuery
      // SELECT * FROM user_stories WHERE id = $1
      .mockResolvedValueOnce({ rows: [{
        id: storyId,
        title: 'orphaned story',
        tuleap_artifact_id: 335,
        project_id: 'proj-uuid',
        deleted_at: null,
      }] })
      // SELECT tuleap_sync_config
      .mockResolvedValueOnce({ rows: [{
        qc_project_id: 'proj-uuid',
        tracker_type: 'user_story',
        tuleap_tracker_id: 19,
      }] })
      // UPDATE user_stories SET deleted_at = NOW() ...
      .mockResolvedValueOnce({ rows: [] })
      // SELECT refreshed row
      .mockResolvedValueOnce({ rows: [{
        id: storyId,
        title: 'orphaned story',
        tuleap_artifact_id: 335,
        deleted_at: new Date().toISOString(),
      }] });

    const tuleap404 = new Error('Not Found');
    tuleap404.status = 404;
    mockEmit.mockRejectedValueOnce(tuleap404);

    const res = await request(buildApp()).delete(`/user-stories/${storyId}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.tuleap_already_gone).toBe(true);
    // The local UPDATE ... deleted_at = NOW() must have run
    const updateCall = mockPoolQuery.mock.calls.find(c => /UPDATE user_stories SET deleted_at/i.test(c[0]));
    expect(updateCall).toBeDefined();
  });

  it('still surfaces non-404 Tuleap delete errors to the client', async () => {
    const storyId = 'cafefeed-0000-0000-0000-000000000001';

    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{
        id: storyId,
        title: 'gated story',
        tuleap_artifact_id: 999,
        project_id: 'proj-uuid',
        deleted_at: null,
      }] })
      .mockResolvedValueOnce({ rows: [{
        qc_project_id: 'proj-uuid',
        tracker_type: 'user_story',
        tuleap_tracker_id: 19,
      }] });

    const tuleap403 = new Error('Forbidden');
    tuleap403.status = 403;
    mockEmit.mockRejectedValueOnce(tuleap403);

    const res = await request(buildApp()).delete(`/user-stories/${storyId}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Failed to delete in Tuleap');
  });
});

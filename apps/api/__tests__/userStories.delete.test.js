// Non-admin deletes are local soft-deletes only. Tuleap propagation remains an
// admin-only operation so broader delete grants cannot hard-delete upstream
// artifacts.

jest.mock('../src/middleware/authMiddleware', () => ({
  requireAuth: (req, _res, next) => { req.user = { id: 'test-user' }; next(); },
  requirePermission: () => (_req, _res, next) => next(),
  requireAnyPermission: () => (_req, _res, next) => next(),
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

describe('DELETE /user-stories/:id — non-admin local delete', () => {
  beforeEach(() => {
    mockEmit.mockReset();
    mockPoolQuery.mockReset();
  });

  it('soft-deletes locally without emitting to Tuleap', async () => {
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
      // UPDATE user_stories SET deleted_at = NOW() ...
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
    expect(mockEmit).not.toHaveBeenCalled();
    const updateCall = mockPoolQuery.mock.calls.find(c => /UPDATE user_stories SET deleted_at/i.test(c[0]));
    expect(updateCall).toBeDefined();
    expect(mockPoolQuery.mock.calls.some(c => /FROM tuleap_sync_config/i.test(c[0]))).toBe(false);
  });

  it('does not return the Tuleap failure path for non-admin deletes', async () => {
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
        id: storyId,
        title: 'gated story',
        tuleap_artifact_id: 999,
        project_id: 'proj-uuid',
        deleted_at: new Date().toISOString(),
      }] });

    const tuleap403 = new Error('Forbidden');
    tuleap403.status = 403;
    mockEmit.mockRejectedValueOnce(tuleap403);

    const res = await request(buildApp()).delete(`/user-stories/${storyId}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockEmit).not.toHaveBeenCalled();
  });
});

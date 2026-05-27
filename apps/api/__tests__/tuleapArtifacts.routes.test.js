const request = require('supertest');
const express = require('express');

jest.mock('../src/services/tuleapClient', () => ({
  defaultClient: {
    post:   jest.fn(),
    put:    jest.fn(),
    delete: jest.fn(),
    get:    jest.fn(),
  },
  createTuleapClient: jest.fn(),
}));

jest.mock('../src/services/tuleapFieldRegistry', () => ({
  defaultRegistry: {
    getFieldId:       jest.fn().mockResolvedValue(42),
    resolveBindValue: jest.fn().mockResolvedValue({ id: 100 }),
    getField:         jest.fn().mockResolvedValue({ field_id: 42, type: 'string', values: [] }),
  },
  FieldRegistry: jest.fn(),
}));

jest.mock('../src/middleware/authMiddleware', () => ({
  requireAuth:       (req, res, next) => { req.user = { email: 'test@test.com' }; next(); },
  requireRole:       jest.fn(),
  requirePermission: jest.fn(),
  requireAnyPermission: jest.fn(),
  optionalAuth:      jest.fn(),
  requireStatus:     jest.fn(),
}));

const mockEmitBug = jest.fn();
jest.mock('../src/services/emitters/bug', () => ({
  emitToTuleap: mockEmitBug,
}));

const mockEmitTask = jest.fn();
jest.mock('../src/services/emitters/task', () => ({
  emitToTuleap: mockEmitTask,
}));

const mockEmitUserStory = jest.fn();
jest.mock('../src/services/emitters/user_story', () => ({
  emitToTuleap: mockEmitUserStory,
}));

const mockPoolQuery = jest.fn();
jest.mock('../src/config/db', () => ({
  pool: { query: mockPoolQuery },
  query: mockPoolQuery,
}));

process.env.TULEAP_BASE_URL          = 'https://tuleap.example.com';
process.env.TULEAP_TRACKER_USER_STORY = '10';
process.env.TULEAP_TRACKER_TEST_CASE  = '20';
process.env.TULEAP_TRACKER_TASK       = '5';
process.env.TULEAP_TRACKER_BUG        = '30';

const { defaultClient }   = require('../src/services/tuleapClient');
const { defaultRegistry } = require('../src/services/tuleapFieldRegistry');

const app = express();
app.use(express.json());
app.use('/tuleap/artifacts', require('../src/routes/tuleapArtifacts'));

beforeEach(() => {
  jest.clearAllMocks();
  mockEmitBug.mockReset();
  mockEmitTask.mockReset();
  mockEmitUserStory.mockReset();
  mockPoolQuery.mockReset();
});

// ── Existing POST tests (keep passing) ───────────────────────────────────────
describe('POST /tuleap/artifacts/user-story', () => {
  it('returns 201 with tuleap_artifact_id on success', async () => {
    defaultClient.post.mockResolvedValue({ data: { id: 1234, xref: 'story #1234' } });
    const res = await request(app)
      .post('/tuleap/artifacts/user-story')
      .send({ summary: 'Login flow', status: 'Draft', requirementVersion: '1' });
    expect(res.status).toBe(201);
    expect(res.body.tuleap_artifact_id).toBe(1234);
    expect(res.body.artifact_type).toBe('user-story');
  });

  it('returns 400 when summary is missing', async () => {
    const res = await request(app)
      .post('/tuleap/artifacts/user-story')
      .send({ status: 'Draft', requirementVersion: '1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/summary/i);
  });
});

describe('POST /tuleap/artifacts/user-story (unified emitter path)', () => {
  it('routes a unified user_story payload through emitUserStory', async () => {
    const config = {
      id: 'cfg-us',
      tuleap_tracker_id: 10,
      qc_project_id: '11111111-2222-3333-4444-555555555555',
      tracker_type: 'user_story',
      artifact_fields: {},
      value_maps: {},
    };
    mockPoolQuery.mockResolvedValueOnce({ rows: [config] });
    mockEmitUserStory.mockResolvedValueOnce({
      tuleap_artifact_id: 4242,
      tuleap_url: 'https://tuleap.example.com/plugins/tracker/?aid=4242',
      artifact_type: 'user_story',
      xref: 'story #4242',
    });

    const res = await request(app)
      .post('/tuleap/artifacts/user-story')
      .send({
        artifact_type: 'user_story',
        project_id: '11111111-2222-3333-4444-555555555555',
        common: { title: 'New story', status: 'Draft' },
        fields: { acceptance_criteria: 'AC', requirement_version: '1' },
      });

    expect(res.status).toBe(201);
    expect(res.body.tuleap_artifact_id).toBe(4242);
    expect(mockEmitUserStory).toHaveBeenCalledTimes(1);
    const [unified, , mode] = mockEmitUserStory.mock.calls[0];
    expect(unified.artifact_type).toBe('user_story');
    expect(unified.common.title).toBe('New story');
    expect(mode).toBe('create');
  });
});

describe('PATCH /tuleap/artifacts/:id with unified user_story payload', () => {
  it('routes a unified user_story PATCH payload through emitUserStory with mode=update', async () => {
    const config = {
      id: 'cfg-us',
      tuleap_tracker_id: 10,
      qc_project_id: '11111111-2222-3333-4444-555555555555',
      tracker_type: 'user_story',
      artifact_fields: {},
      value_maps: {},
    };
    mockPoolQuery.mockResolvedValueOnce({ rows: [config] });
    mockEmitUserStory.mockResolvedValueOnce({ updated: true, tuleap_artifact_id: 4242 });

    const res = await request(app)
      .patch('/tuleap/artifacts/4242')
      .send({
        artifact_type: 'user_story',
        project_id: '11111111-2222-3333-4444-555555555555',
        common: { title: 'Updated story' },
        fields: { requirement_version: '2' },
      });

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(true);
    expect(mockEmitUserStory).toHaveBeenCalledTimes(1);
    const [unified, , mode] = mockEmitUserStory.mock.calls[0];
    expect(mode).toBe('update');
    expect(unified.artifact_type).toBe('user_story');
    expect(unified.tuleap.artifact_id).toBe(4242);
  });
});

describe('POST /tuleap/artifacts/task', () => {
  it('returns 201 with task via emitToTuleap', async () => {
    const config = {
      id: 'cfg-task',
      tuleap_tracker_id: 5,
      tuleap_base_url: 'https://tuleap.example.com',
      qc_project_id: 'proj-1',
      tracker_type: 'task',
      artifact_fields: {},
      status_value_map: {},
      value_maps: {},
    };

    mockPoolQuery.mockResolvedValueOnce({ rows: [config] });
    mockEmitTask.mockResolvedValueOnce({
      tuleap_artifact_id: 9999,
      tuleap_url: 'https://tuleap.example.com/plugins/tracker/?aid=9999',
      artifact_type: 'task',
      xref: 'task #9999',
    });

    const res = await request(app)
      .post('/tuleap/artifacts/task')
      .send({ project_id: 'proj-1', taskTitle: 'Impl auth', assignedTo: 'bob', team: 'QA-Team', status: 'Todo', parentStoryArtifactId: 888 });
    expect(res.status).toBe(201);
    expect(res.body.tuleap_artifact_id).toBe(9999);
    expect(mockEmitTask).toHaveBeenCalledTimes(1);
  });
});

describe('Required field validation', () => {
  it('returns 400 when project_id is missing for bug', async () => {
    const res = await request(app).post('/tuleap/artifacts/bug').send({ bugTitle: 'Crash' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/project_id/i);
  });

  it('returns 404 for unknown artifact type', async () => {
    const res = await request(app).post('/tuleap/artifacts/unknown-type').send({});
    expect(res.status).toBe(404);
  });
});

// ── New: PATCH tests ──────────────────────────────────────────────────────────
describe('PATCH /tuleap/artifacts/:id', () => {
  it('returns 200 { updated: true } on success', async () => {
    defaultClient.put.mockResolvedValue({ data: {} });
    const res = await request(app)
      .patch('/tuleap/artifacts/555')
      .send({ type: 'user-story', fields: { story_title: 'New title' } });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(true);
    expect(defaultClient.put).toHaveBeenCalledWith(
      '/artifacts/555',
      expect.objectContaining({ values: expect.any(Array) })
    );
  });

  it('uses bind_value_ids when field type is sb', async () => {
    defaultRegistry.getField.mockResolvedValue({ field_id: 44, type: 'sb', values: [] });
    defaultClient.put.mockResolvedValue({ data: {} });
    const res = await request(app)
      .patch('/tuleap/artifacts/555')
      .send({ type: 'user-story', fields: { status: 'Review' } });
    expect(res.status).toBe(200);
    expect(defaultClient.put).toHaveBeenCalledWith(
      '/artifacts/555',
      expect.objectContaining({
        values: expect.arrayContaining([
          expect.objectContaining({ bind_value_ids: [100] })
        ])
      })
    );
  });

  it('returns 400 when type is missing', async () => {
    const res = await request(app)
      .patch('/tuleap/artifacts/555')
      .send({ fields: { story_title: 'x' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/type.*required/i);
  });

  it('returns 400 when fields is empty', async () => {
    const res = await request(app)
      .patch('/tuleap/artifacts/555')
      .send({ type: 'user-story', fields: {} });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/fields.*required/i);
  });

  it('returns 400 when field name is unknown', async () => {
    defaultRegistry.getField.mockRejectedValue(new Error("Field 'bad_field' not found in tracker 10"));
    const res = await request(app)
      .patch('/tuleap/artifacts/555')
      .send({ type: 'user-story', fields: { bad_field: 'x' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/bad_field/);
  });

  it('returns 502 on Tuleap error', async () => {
    defaultRegistry.getField.mockResolvedValue({ field_id: 42, type: 'string', values: [] });
    defaultClient.put.mockRejectedValue(Object.assign(new Error('Server error'), { status: 500 }));
    const res = await request(app)
      .patch('/tuleap/artifacts/555')
      .send({ type: 'user-story', fields: { story_title: 'x' } });
    expect(res.status).toBe(500);
  });

  it('routes a unified bug PATCH payload through emitBug with mode=update', async () => {
    const bugConfig = {
      id: 'cfg-bug',
      tuleap_tracker_id: 30,
      qc_project_id: '11111111-2222-3333-4444-555555555555',
      tracker_type: 'bug',
      artifact_fields: {},
      value_maps: {},
    };
    mockPoolQuery.mockResolvedValueOnce({ rows: [bugConfig] });
    mockEmitBug.mockResolvedValueOnce({ updated: true, tuleap_artifact_id: 555 });

    const res = await request(app)
      .patch('/tuleap/artifacts/555')
      .send({
        artifact_type: 'bug',
        project_id: '11111111-2222-3333-4444-555555555555',
        common: { title: 'Updated title' },
        fields: { severity: 'high' },
      });

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(true);
    expect(mockEmitBug).toHaveBeenCalledTimes(1);
    const [unified, config, mode] = mockEmitBug.mock.calls[0];
    expect(mode).toBe('update');
    expect(unified.artifact_type).toBe('bug');
    expect(unified.tuleap.artifact_id).toBe(555);
    expect(unified.common.title).toBe('Updated title');
    expect(config.tracker_type).toBe('bug');
  });

  it('returns 400 when unified bug PATCH payload fails UnifiedPatchSchema (missing project_id)', async () => {
    const res = await request(app)
      .patch('/tuleap/artifacts/555')
      .send({
        artifact_type: 'bug',
        common: { title: 'Updated title' },
      });
    expect(res.status).toBe(400);
    expect(mockEmitBug).not.toHaveBeenCalled();
  });

  it('returns 400 when no config exists for the unified bug PATCH project', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .patch('/tuleap/artifacts/555')
      .send({
        artifact_type: 'bug',
        project_id: '11111111-2222-3333-4444-555555555555',
        common: { title: 'Updated title' },
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/config/i);
    expect(mockEmitBug).not.toHaveBeenCalled();
  });

  it('routes a unified task PATCH payload through emitTask with mode=update', async () => {
    const taskConfig = {
      id: 'cfg-task',
      tuleap_tracker_id: 5,
      qc_project_id: '11111111-2222-3333-4444-555555555555',
      tracker_type: 'task',
      artifact_fields: {},
      value_maps: {},
    };
    mockPoolQuery.mockResolvedValueOnce({ rows: [taskConfig] });
    mockEmitTask.mockResolvedValueOnce({ updated: true, tuleap_artifact_id: 888 });

    const res = await request(app)
      .patch('/tuleap/artifacts/888')
      .send({
        artifact_type: 'task',
        project_id: '11111111-2222-3333-4444-555555555555',
        common: { title: 'Updated task title', status: 'In Progress' },
        fields: { team: 'Alpha' },
      });

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(true);
    expect(mockEmitTask).toHaveBeenCalledTimes(1);
    const [unified, config, mode] = mockEmitTask.mock.calls[0];
    expect(mode).toBe('update');
    expect(unified.artifact_type).toBe('task');
    expect(unified.tuleap.artifact_id).toBe(888);
    expect(unified.common.title).toBe('Updated task title');
    expect(config.tracker_type).toBe('task');
  });

  it('returns 400 when no config exists for the unified task PATCH project', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .patch('/tuleap/artifacts/888')
      .send({
        artifact_type: 'task',
        project_id: '11111111-2222-3333-4444-555555555555',
        common: { title: 'Updated' },
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/config/i);
    expect(mockEmitTask).not.toHaveBeenCalled();
  });
});

// ── New: DELETE tests ─────────────────────────────────────────────────────────
describe('DELETE /tuleap/artifacts/:id', () => {
  it('returns 200 { deleted: true } on success', async () => {
    defaultClient.delete.mockResolvedValue({ data: {} });
    const res = await request(app).delete('/tuleap/artifacts/777');
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect(defaultClient.delete).toHaveBeenCalledWith('/artifacts/777');
  });

  it('returns 404 when Tuleap returns 404', async () => {
    defaultClient.delete.mockRejectedValue(Object.assign(new Error('Not found'), { status: 404 }));
    const res = await request(app).delete('/tuleap/artifacts/999');
    expect(res.status).toBe(404);
  });

  it('returns 502 on Tuleap 503', async () => {
    defaultClient.delete.mockRejectedValue(Object.assign(new Error('Service unavailable'), { status: 503 }));
    const res = await request(app).delete('/tuleap/artifacts/999');
    expect(res.status).toBe(503);
  });
});

// ── New: GET /:type — list ────────────────────────────────────────────────────
describe('GET /tuleap/artifacts/:type', () => {
  it('returns 200 with data array on success', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ tuleap_tracker_id: 10, qc_project_id: 'proj-1', tracker_type: 'user_story', is_active: true, artifact_fields: {}, value_maps: {} }] });
    defaultClient.get.mockResolvedValue({ data: [{ id: 1 }, { id: 2 }] });
    const res = await request(app).get('/tuleap/artifacts/user-story?project_id=11111111-2222-3333-4444-555555555555');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.total).toBe(2);
    expect(defaultClient.get).toHaveBeenCalledWith(
      '/trackers/10/artifacts',
      expect.objectContaining({ params: expect.objectContaining({ limit: 50, offset: 0 }) })
    );
  });

  it('passes limit and offset query params to Tuleap', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ tuleap_tracker_id: 30, qc_project_id: 'proj-1', tracker_type: 'bug', is_active: true, artifact_fields: {}, value_maps: {} }] });
    defaultClient.get.mockResolvedValue({ data: [] });
    await request(app).get('/tuleap/artifacts/bug?limit=10&offset=20&project_id=11111111-2222-3333-4444-555555555555');
    expect(defaultClient.get).toHaveBeenCalledWith(
      '/trackers/30/artifacts',
      expect.objectContaining({ params: expect.objectContaining({ limit: 10, offset: 20 }) })
    );
  });

  it('returns 404 for unknown type', async () => {
    const res = await request(app).get('/tuleap/artifacts/unknown-type');
    expect(res.status).toBe(404);
  });
});

// ── New: GET /:type/:id — single ──────────────────────────────────────────────
describe('GET /tuleap/artifacts/:type/:id', () => {
  it('returns 200 with artifact on success', async () => {
    defaultClient.get.mockResolvedValue({ data: { id: 42, xref: 'bug #42' } });
    const res = await request(app).get('/tuleap/artifacts/bug/42');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(42);
    expect(defaultClient.get).toHaveBeenCalledWith('/artifacts/42');
  });

  it('returns 404 when Tuleap returns 404', async () => {
    defaultClient.get.mockRejectedValue(Object.assign(new Error('Not found'), { status: 404 }));
    const res = await request(app).get('/tuleap/artifacts/bug/99999');
    expect(res.status).toBe(404);
  });
});

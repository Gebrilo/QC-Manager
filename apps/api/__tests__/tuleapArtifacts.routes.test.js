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

beforeEach(() => jest.clearAllMocks());

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

describe('POST /tuleap/artifacts/task', () => {
  it('returns 201 with parent link', async () => {
    defaultClient.post.mockResolvedValue({ data: { id: 9999, xref: 'task #9999' } });
    const res = await request(app)
      .post('/tuleap/artifacts/task')
      .send({ taskTitle: 'Impl auth', assignedTo: 'bob', team: 'QA-Team', status: 'Todo', parentStoryArtifactId: 888 });
    expect(res.status).toBe(201);
    expect(res.body.tuleap_artifact_id).toBe(9999);
  });
});

describe('Required field validation', () => {
  it('returns 400 with missing fields for bug', async () => {
    const res = await request(app).post('/tuleap/artifacts/bug').send({ bugTitle: 'Crash' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/environment.*serviceName|serviceName.*environment/i);
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

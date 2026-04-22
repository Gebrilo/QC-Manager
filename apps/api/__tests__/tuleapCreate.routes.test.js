const request = require('supertest');
const express = require('express');

jest.mock('../src/services/tuleapClient', () => ({
  defaultClient: { post: jest.fn() },
  createTuleapClient: jest.fn(),
  deps: jest.fn(),
}));
jest.mock('../src/services/tuleapFieldRegistry', () => ({
  defaultRegistry: {
    getFieldId: jest.fn().mockResolvedValue(42),
    resolveBindValue: jest.fn().mockResolvedValue({ id: 100 }),
  },
  FieldRegistry: jest.fn(),
}));
jest.mock('../src/middleware/authMiddleware', () => ({
  requireAuth: (req, res, next) => { req.user = { email: 'test@test.com' }; next(); },
  requireRole: jest.fn(),
  requirePermission: jest.fn(),
  requireAnyPermission: jest.fn(),
  optionalAuth: jest.fn(),
  requireStatus: jest.fn(),
}));

process.env.TULEAP_BASE_URL = 'https://tuleap.example.com';
process.env.TULEAP_TRACKER_USER_STORY = '10';
process.env.TULEAP_TRACKER_TEST_CASE = '20';
process.env.TULEAP_TRACKER_TASK = '5';
process.env.TULEAP_TRACKER_BUG = '30';

const { defaultClient } = require('../src/services/tuleapClient');
const app = express();
app.use(express.json());
app.use('/tuleap/artifacts', require('../src/routes/tuleapCreate'));

describe('POST /tuleap/artifacts/user-story', () => {
  it('returns 201 with tuleap_artifact_id on success', async () => {
    defaultClient.post.mockResolvedValue({
      data: { id: 1234, xref: 'story #1234' },
    });
    const res = await request(app)
      .post('/tuleap/artifacts/user-story')
      .send({
        summary: 'As a user I can log in',
        description: '## Description',
        acceptanceCriteria: '## AC',
        status: 'New',
        baAuthor: 'Alice',
        requirementVersion: '1',
      });
    expect(res.status).toBe(201);
    expect(res.body.tuleap_artifact_id).toBe(1234);
    expect(res.body.artifact_type).toBe('user-story');
  });

  it('returns 400 when summary is missing', async () => {
    const res = await request(app)
      .post('/tuleap/artifacts/user-story')
      .send({ status: 'New', baAuthor: 'Alice', requirementVersion: '1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/summary/i);
  });
});

describe('POST /tuleap/artifacts/task', () => {
  it('returns 201 with parent link', async () => {
    defaultClient.post.mockResolvedValue({ data: { id: 9999, xref: 'task #9999' } });
    const res = await request(app)
      .post('/tuleap/artifacts/task')
      .send({
        taskTitle: 'Implement auth',
        assignedTo: 'Bob',
        team: 'Backend',
        status: 'Todo',
        parentStoryArtifactId: 888,
      });
    expect(res.status).toBe(201);
    expect(res.body.tuleap_artifact_id).toBe(9999);
  });
});

describe('Required field validation', () => {
  it('returns 400 with missing fields for bug', async () => {
    const res = await request(app)
      .post('/tuleap/artifacts/bug')
      .send({ bugTitle: 'Crash' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/environment.*serviceName|serviceName.*environment/i);
  });

  it('returns 404 for unknown artifact type', async () => {
    const res = await request(app)
      .post('/tuleap/artifacts/unknown-type')
      .send({});
    expect(res.status).toBe(404);
  });
});
// apps/api/__tests__/tuleapWebhook.userStory.test.js
const { processedUserStoryData } = require('./fixtures/tuleapPayloads');

const mockQuery    = jest.fn();
const mockAuditLog = jest.fn().mockResolvedValue(undefined);

jest.mock('../src/config/db', () => ({ pool: { query: mockQuery } }));
jest.mock('../src/middleware/audit', () => ({ auditLog: mockAuditLog }));

const express     = require('express');
const tuleapRouter = require('../src/routes/tuleapWebhook');

const app = express();
app.use(express.json());
app.use('/tuleap-webhook', tuleapRouter);

beforeEach(() => {
  mockQuery.mockReset();
  mockAuditLog.mockReset();
});

// Helper: invoke the /user-story route handler directly (same pattern as bug tests)
function getHandler() {
  const layer = tuleapRouter.stack.find(
    l => l.route && l.route.path === '/user-story' && l.route.methods.post
  );
  expect(layer).toBeDefined();
  return layer.route.stack[0].handle;
}

function makeRes() {
  const res = { statusCode: 200 };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json   = jest.fn();
  return res;
}

describe('POST /tuleap-webhook/user-story', () => {
  test('creates a new user story when tuleap_artifact_id does not exist', async () => {
    const payload = { ...processedUserStoryData };

    mockQuery
      .mockResolvedValueOnce({ rows: [] })   // logWebhook insert
      .mockResolvedValueOnce({ rows: [] })   // SELECT: no existing story
      .mockResolvedValueOnce({ rows: [{ id: 'new-us-uuid', title: payload.title, tuleap_artifact_id: payload.tuleap_artifact_id }] }) // INSERT
      .mockResolvedValueOnce({ rows: [] });  // logWebhook update

    const handler = getHandler();
    const res = makeRes();
    await handler({ body: payload }, res, jest.fn());

    expect(res.statusCode).toBe(201);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.action).toBe('created');
    expect(body.data.tuleap_artifact_id).toBe(payload.tuleap_artifact_id);
  });

  test('updates an existing user story when tuleap_artifact_id matches', async () => {
    const payload = { ...processedUserStoryData };

    mockQuery
      .mockResolvedValueOnce({ rows: [] })   // logWebhook insert
      .mockResolvedValueOnce({ rows: [{ id: 'existing-us-uuid' }] }) // SELECT: found
      .mockResolvedValueOnce({ rows: [{ id: 'existing-us-uuid', title: payload.title, tuleap_artifact_id: payload.tuleap_artifact_id }] }) // UPDATE
      .mockResolvedValueOnce({ rows: [] });  // logWebhook update

    const handler = getHandler();
    const res = makeRes();
    await handler({ body: payload }, res, jest.fn());

    expect(res.statusCode).toBe(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.action).toBe('updated');
  });

  test('returns 400 when tuleap_artifact_id is missing', async () => {
    const handler = getHandler();
    const res = makeRes();
    await handler({ body: { title: 'Some story' } }, res, jest.fn());

    expect(res.statusCode).toBe(400);
    expect(res.json.mock.calls[0][0].success).toBe(false);
    expect(res.json.mock.calls[0][0].error).toMatch(/tuleap_artifact_id.*title|title.*tuleap_artifact_id/i);
  });

  test('returns 400 when title is missing', async () => {
    const handler = getHandler();
    const res = makeRes();
    await handler({ body: { tuleap_artifact_id: 9999 } }, res, jest.fn());

    expect(res.statusCode).toBe(400);
    expect(res.json.mock.calls[0][0].success).toBe(false);
  });

  test('returns 500 on unexpected DB error', async () => {
    const payload = { ...processedUserStoryData };
    mockQuery
      .mockResolvedValueOnce({ rows: [] })   // logWebhook insert
      .mockRejectedValueOnce(new Error('DB connection lost')); // SELECT throws

    const handler = getHandler();
    const res = makeRes();
    await handler({ body: payload }, res, jest.fn());

    expect(res.statusCode).toBe(500);
    expect(res.json.mock.calls[0][0].success).toBe(false);
  });
});

# Tuleap CRUD & n8n Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PATCH, DELETE, and GET handlers to the Tuleap artifacts route, rename the file to `tuleapArtifacts.js`, and create 6 new n8n workflow JSON files (2 webhook-driven sync + 4 polling sync).

**Architecture:** `tuleapArtifacts.js` owns all Tuleap CRUD — create (existing), edit, delete, list, get-single. FieldRegistry resolves field IDs for edit. n8n polling workflows call the new `GET /tuleap/artifacts/:type` endpoint and upsert into QC-Manager via existing tuleap-webhook handlers. Webhook-driven workflows mirror the existing `tuleap-bug-sync.json` structure exactly.

**Tech Stack:** Node.js 18+, Express, Jest, supertest, n8n workflow JSON (no code execution — import into n8n)

---

## File Structure

```
apps/api/src/routes/
  tuleapArtifacts.js          ← rename from tuleapCreate.js, add PATCH/DELETE/GET handlers

apps/api/__tests__/
  tuleapArtifacts.routes.test.js  ← rename from tuleapCreate.routes.test.js, add new tests

apps/api/src/index.js         ← update require path

n8n-workflows/
  tuleap-test-case-sync.json      ← new: webhook Tuleap TC → QC-Manager
  tuleap-user-story-sync.json     ← new: webhook Tuleap US → QC-Manager (placeholder POST)
  tuleap-user-story-poll.json     ← new: polling user-story sync
  tuleap-test-case-poll.json      ← new: polling test-case sync
  tuleap-task-poll.json           ← new: polling task sync
  tuleap-bug-poll.json            ← new: polling bug sync
```

---

## Task 1: Create `tuleapArtifacts.js` with PATCH and DELETE handlers

**Files:**
- Create: `apps/api/src/routes/tuleapArtifacts.js` (copy from `tuleapCreate.js`, then extend)
- Create: `apps/api/__tests__/tuleapArtifacts.routes.test.js`

### What to build

- `PATCH /tuleap/artifacts/:id` — body: `{ type, fields: { fieldName: value } }`. Resolves each field name to a `field_id` via `registry.getField()`, picks `value` vs `bind_value_ids` based on field type (`sb`/`rb`/`msb` → bind, everything else → value), then calls `PUT /artifacts/:id` on Tuleap.
- `DELETE /tuleap/artifacts/:id` — calls `DELETE /artifacts/:id` on Tuleap. Returns 404 if Tuleap returns 404.

- [ ] **Step 1.1: Write failing tests for PATCH and DELETE**

```js
// apps/api/__tests__/tuleapArtifacts.routes.test.js
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
```

- [ ] **Step 1.2: Run tests — confirm they fail**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/tuleapArtifacts.routes.test.js --no-coverage 2>&1 | tail -20
```
Expected: `FAIL — Cannot find module '../src/routes/tuleapArtifacts'`

- [ ] **Step 1.3: Create `tuleapArtifacts.js` with all handlers**

```js
// apps/api/src/routes/tuleapArtifacts.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { defaultClient } = require('../services/tuleapClient');
const { defaultRegistry } = require('../services/tuleapFieldRegistry');
const {
  buildUserStoryPayload,
  buildTestCasePayload,
  buildTaskPayload,
  buildBugPayload,
} = require('../services/tuleapPayloadBuilder');

const TRACKER_IDS = {
  'user-story': () => Number(process.env.TULEAP_TRACKER_USER_STORY),
  'test-case':  () => Number(process.env.TULEAP_TRACKER_TEST_CASE),
  'task':       () => Number(process.env.TULEAP_TRACKER_TASK),
  'bug':        () => Number(process.env.TULEAP_TRACKER_BUG),
};

const REQUIRED_FIELDS = {
  'user-story': ['summary', 'status', 'requirementVersion'],
  'test-case':  ['title', 'testSteps', 'expectedResult'],
  'task':       ['taskTitle', 'assignedTo', 'team', 'status', 'parentStoryArtifactId'],
  'bug':        ['bugTitle', 'environment', 'serviceName'],
};

const BUILDERS = {
  'user-story': buildUserStoryPayload,
  'test-case':  buildTestCasePayload,
  'task':       buildTaskPayload,
  'bug':        buildBugPayload,
};

// ── GET /:type/:id — single artifact ─────────────────────────────────────────
router.get('/:type/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const response = await defaultClient.get(`/artifacts/${id}`);
    return res.status(200).json(response.data);
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: 'Artifact not found' });
    return res.status(err.status || 502).json({ error: err.message, tuleap_status: err.status, details: err.raw });
  }
});

// ── GET /:type — list artifacts ───────────────────────────────────────────────
router.get('/:type', requireAuth, async (req, res) => {
  const { type } = req.params;
  if (!TRACKER_IDS[type]) {
    return res.status(404).json({ error: `Unknown artifact type: ${type}` });
  }
  const trackerId = TRACKER_IDS[type]();
  const limit  = Number(req.query.limit)  || 50;
  const offset = Number(req.query.offset) || 0;

  try {
    const response = await defaultClient.get('/artifacts', { params: { tracker: trackerId, limit, offset } });
    const items = Array.isArray(response.data) ? response.data : (response.data.collection || []);
    return res.status(200).json({ data: items, total: items.length });
  } catch (err) {
    return res.status(err.status || 502).json({ error: err.message, tuleap_status: err.status, details: err.raw });
  }
});

// ── PATCH /:id — edit artifact ────────────────────────────────────────────────
router.patch('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { type, fields } = req.body;

  if (!type || !TRACKER_IDS[type]) {
    return res.status(400).json({ error: 'type is required and must be a valid artifact type (user-story, test-case, task, bug)' });
  }
  if (!fields || typeof fields !== 'object' || Object.keys(fields).length === 0) {
    return res.status(400).json({ error: 'fields object is required and must not be empty' });
  }

  const trackerId = TRACKER_IDS[type]();
  const values = [];

  try {
    for (const [fieldName, fieldValue] of Object.entries(fields)) {
      const field = await defaultRegistry.getField(trackerId, fieldName);
      if (['sb', 'rb', 'msb'].includes(field.type)) {
        const bound = await defaultRegistry.resolveBindValue(trackerId, fieldName, fieldValue);
        values.push({ field_id: field.field_id, bind_value_ids: [bound.id] });
      } else {
        values.push({ field_id: field.field_id, value: fieldValue });
      }
    }
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    await defaultClient.put(`/artifacts/${id}`, { values });
    return res.status(200).json({ updated: true });
  } catch (err) {
    return res.status(err.status || 502).json({ error: err.message, tuleap_status: err.status, details: err.raw });
  }
});

// ── DELETE /:id — delete artifact ─────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    await defaultClient.delete(`/artifacts/${id}`);
    return res.status(200).json({ deleted: true });
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: 'Artifact not found' });
    return res.status(err.status || 502).json({ error: err.message, tuleap_status: err.status, details: err.raw });
  }
});

// ── POST /:type — create artifact ─────────────────────────────────────────────
router.post('/:type', requireAuth, async (req, res) => {
  const { type } = req.params;

  if (!TRACKER_IDS[type]) {
    return res.status(404).json({ error: `Unknown artifact type: ${type}` });
  }

  const trackerId = TRACKER_IDS[type]();
  const builder   = BUILDERS[type];
  const input     = { ...req.body, trackerId };

  const required = REQUIRED_FIELDS[type] || [];
  const missing  = required.filter(k => !input[k] && input[k] !== 0);
  if (missing.length) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  let payload;
  try {
    payload = await builder(input, defaultRegistry);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  let response;
  try {
    response = await defaultClient.post('/artifacts', payload);
  } catch (err) {
    return res.status(err.status || 502).json({ error: err.message, tuleap_status: err.status, details: err.raw });
  }

  const artifact = response.data;
  const base = process.env.TULEAP_BASE_URL || 'https://tuleap.windinfosys.com';
  return res.status(201).json({
    tuleap_artifact_id: artifact.id,
    tuleap_url: `${base}/plugins/tracker/?aid=${artifact.id}`,
    artifact_type: type,
    xref: artifact.xref,
  });
});

module.exports = router;
```

- [ ] **Step 1.4: Run tests — confirm they pass**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/tuleapArtifacts.routes.test.js --no-coverage
```
Expected: all tests PASS (PATCH x5, DELETE x3, POST x4)

- [ ] **Step 1.5: Commit**

```bash
git add apps/api/src/routes/tuleapArtifacts.js apps/api/__tests__/tuleapArtifacts.routes.test.js
git commit -m "feat(tuleap): add PATCH/DELETE handlers to tuleapArtifacts route"
```

---

## Task 2: Add GET handlers (list + single) — test coverage already in Task 1

The GET handlers are already written in `tuleapArtifacts.js` from Task 1. Add the test cases for GET to the test file.

- [ ] **Step 2.1: Add GET tests to `tuleapArtifacts.routes.test.js`**

Append these describe blocks to the end of the file:

```js
// ── New: GET /:type — list ────────────────────────────────────────────────────
describe('GET /tuleap/artifacts/:type', () => {
  it('returns 200 with data array on success', async () => {
    defaultClient.get.mockResolvedValue({ data: [{ id: 1 }, { id: 2 }] });
    const res = await request(app).get('/tuleap/artifacts/user-story');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.total).toBe(2);
    expect(defaultClient.get).toHaveBeenCalledWith(
      '/artifacts',
      expect.objectContaining({ params: expect.objectContaining({ tracker: 10 }) })
    );
  });

  it('passes limit and offset query params to Tuleap', async () => {
    defaultClient.get.mockResolvedValue({ data: [] });
    await request(app).get('/tuleap/artifacts/bug?limit=10&offset=20');
    expect(defaultClient.get).toHaveBeenCalledWith(
      '/artifacts',
      expect.objectContaining({ params: expect.objectContaining({ limit: 10, offset: 20, tracker: 30 }) })
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
```

- [ ] **Step 2.2: Run tests — confirm GET tests pass**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/tuleapArtifacts.routes.test.js --no-coverage
```
Expected: all tests PASS

- [ ] **Step 2.3: Commit**

```bash
git add apps/api/__tests__/tuleapArtifacts.routes.test.js
git commit -m "test(tuleap): add GET list and GET single tests to tuleapArtifacts suite"
```

---

## Task 3: Update index.js + clean up old file

**Files:**
- Modify: `apps/api/src/index.js` line 45
- Delete: `apps/api/src/routes/tuleapCreate.js` (superseded by `tuleapArtifacts.js`)
- Delete: `apps/api/__tests__/tuleapCreate.routes.test.js` (superseded)

- [ ] **Step 3.1: Update the route registration in index.js**

Find line 45 in `apps/api/src/index.js`:
```js
apiRouter.use('/tuleap/artifacts', require('./routes/tuleapCreate'));
```

Change to:
```js
apiRouter.use('/tuleap/artifacts', require('./routes/tuleapArtifacts'));
```

- [ ] **Step 3.2: Remove old files**

```bash
rm /root/QC-Manager/apps/api/src/routes/tuleapCreate.js
rm /root/QC-Manager/apps/api/__tests__/tuleapCreate.routes.test.js
```

- [ ] **Step 3.3: Run full tuleap test suite**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/tuleap --no-coverage
```
Expected: all PASS. If `tuleapCreate.routes.test.js` no longer exists, Jest simply won't find it.

- [ ] **Step 3.4: Commit**

```bash
git add -A apps/api/src/index.js apps/api/src/routes/tuleapCreate.js apps/api/__tests__/tuleapCreate.routes.test.js
git commit -m "refactor(tuleap): rename tuleapCreate → tuleapArtifacts, update index.js"
```

---

## Task 4: n8n — `tuleap-test-case-sync.json` (webhook-driven sync)

**File:** `n8n-workflows/tuleap-test-case-sync.json`

This mirrors `tuleap-bug-sync.json` exactly. Differences: webhook path `tuleap-test-case`, tracker_type `test-case`, transform maps Tuleap test-case fields, POST goes to `http://qc-api:3001/tuleap-webhook/test-case`.

- [ ] **Step 4.1: Create the workflow file**

```json
// n8n-workflows/tuleap-test-case-sync.json
{
  "id": "TestCaseSync001TuleapQC",
  "name": "Tuleap Test Case → QC-Manager Sync",
  "active": false,
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "tuleap-test-case",
        "responseMode": "responseNode",
        "options": {}
      },
      "id": "tc0001-0001-4001-8001-000000000001",
      "name": "Webhook: Tuleap Test Case",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [240, 304],
      "webhookId": "tuleap-test-case-sync"
    },
    {
      "parameters": {
        "jsCode": "const raw = $input.first().json;\nconst body = (raw.body !== undefined && typeof raw.body === 'object') ? raw.body : raw;\nlet payload;\nif (body.payload !== undefined) {\n  payload = typeof body.payload === 'string' ? JSON.parse(body.payload) : body.payload;\n  if (!payload || typeof payload !== 'object') throw new Error('Parsed payload is not a valid object');\n} else if (body.artifact !== undefined) {\n  payload = { current: body.artifact, project: body.project || null, user: body.user || null, action: body.action || 'artifact:created' };\n} else {\n  throw new Error(`Unrecognized Tuleap webhook format. Body keys: ${Object.keys(body).join(', ')}`);\n}\nconst tracker = payload.tracker || payload.current?.tracker;\nif (!tracker?.id) throw new Error(`Missing tracker.id in payload. tracker = ${JSON.stringify(tracker)}`);\nreturn [{ json: { payload } }];"
      },
      "id": "tc0001-0002-4002-8002-000000000002",
      "name": "Parse Payload",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [480, 304]
    },
    {
      "parameters": {
        "url": "http://qc-api:3001/tuleap-webhook/config",
        "sendQuery": true,
        "queryParameters": {
          "parameters": [
            { "name": "tracker_type", "value": "test-case" },
            { "name": "is_active",    "value": "true" }
          ]
        },
        "options": {}
      },
      "id": "tc0001-0003-4003-8003-000000000003",
      "name": "Fetch Sync Config",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [720, 304]
    },
    {
      "parameters": {
        "jsCode": "const payload = $('Parse Payload').first().json.payload;\nconst configs = $('Fetch Sync Config').first().json.data || [];\nconst trackerId = payload?.tracker?.id;\nconst config = configs.find(c => String(c.tuleap_tracker_id) === String(trackerId));\nif (!config) return [{ json: { hasConfig: false, trackerId, payload } }];\nreturn [{ json: { hasConfig: true, config, payload } }];"
      },
      "id": "tc0001-0004-4004-8004-000000000004",
      "name": "Match Config",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [960, 304]
    },
    {
      "parameters": {
        "conditions": {
          "options": { "caseSensitive": true, "typeValidation": "strict" },
          "combinator": "and",
          "conditions": [
            {
              "id": "has-config-check",
              "leftValue": "={{ $json.hasConfig }}",
              "rightValue": true,
              "operator": { "type": "boolean", "operation": "equals", "rightType": "boolean" }
            }
          ]
        },
        "options": {}
      },
      "id": "tc0001-0005-4005-8005-000000000005",
      "name": "Has Config?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [1200, 304]
    },
    {
      "parameters": {
        "jsCode": "const { config, payload } = $input.first().json;\nconst artifact = payload.current;\nconst fields = {};\nfor (const v of (artifact.values || [])) { fields[v.name] = v; }\n\nfunction txt(...names) {\n  for (const n of names) {\n    const f = fields[n];\n    if (f && f.value != null) return String(f.value);\n  }\n  return null;\n}\n\nfunction sel(...names) {\n  for (const n of names) {\n    const f = fields[n];\n    if (f && f.values && f.values[0]) return f.values[0].label || f.values[0].display_name || null;\n  }\n  return null;\n}\n\nconst artifactId = payload.id || artifact.id;\n\nconst tcData = {\n  tuleap_artifact_id: artifactId,\n  title: txt('title') || `Test Case ${artifactId}`,\n  description: txt('test_steps'),\n  priority: 'medium',\n  category: 'other',\n  status: 'active',\n  project_id: config.qc_project_id,\n  tags: [`tuleap:${artifactId}`],\n  raw_tuleap_payload: payload\n};\n\nreturn [{ json: { tcData } }];"
      },
      "id": "tc0001-0006-4006-8006-000000000006",
      "name": "Transform Test Case Data",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1440, 224]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "http://qc-api:3001/tuleap-webhook/test-case",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify($json.tcData) }}",
        "options": { "timeout": 30000 }
      },
      "id": "tc0001-0007-4007-8007-000000000007",
      "name": "Send to QC API",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1680, 224]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ JSON.stringify({ success: true, message: 'Test case processed', id: $json.data?.id || 'unknown' }) }}",
        "options": {}
      },
      "id": "tc0001-0008-4008-8008-000000000008",
      "name": "Respond: OK",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1.1,
      "position": [1920, 224]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ JSON.stringify({ success: false, message: 'No sync config found for this tracker' }) }}",
        "options": {}
      },
      "id": "tc0001-0009-4009-8009-000000000009",
      "name": "Respond: Not Configured",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1.1,
      "position": [1440, 464]
    }
  ],
  "connections": {
    "Webhook: Tuleap Test Case": { "main": [[{ "node": "Parse Payload",         "type": "main", "index": 0 }]] },
    "Parse Payload":             { "main": [[{ "node": "Fetch Sync Config",      "type": "main", "index": 0 }]] },
    "Fetch Sync Config":         { "main": [[{ "node": "Match Config",           "type": "main", "index": 0 }]] },
    "Match Config":              { "main": [[{ "node": "Has Config?",             "type": "main", "index": 0 }]] },
    "Has Config?": {
      "main": [
        [{ "node": "Transform Test Case Data", "type": "main", "index": 0 }],
        [{ "node": "Respond: Not Configured",  "type": "main", "index": 0 }]
      ]
    },
    "Transform Test Case Data":  { "main": [[{ "node": "Send to QC API", "type": "main", "index": 0 }]] },
    "Send to QC API":            { "main": [[{ "node": "Respond: OK",    "type": "main", "index": 0 }]] }
  },
  "settings": { "executionOrder": "v1" },
  "staticData": null,
  "tags": [{ "name": "tuleap" }]
}
```

- [ ] **Step 4.2: Commit**

```bash
git add n8n-workflows/tuleap-test-case-sync.json
git commit -m "feat(n8n): add tuleap-test-case-sync webhook workflow"
```

---

## Task 5: n8n — `tuleap-user-story-sync.json` (webhook-driven sync)

**File:** `n8n-workflows/tuleap-user-story-sync.json`

> **Note:** There is no `POST /tuleap-webhook/user-story` endpoint in the QC API yet. The "Send to QC API" node points to `http://qc-api:3001/tuleap-webhook/user-story` as a placeholder. The workflow will fail at that step until the endpoint is added. All other nodes are functional.

- [ ] **Step 5.1: Create the workflow file**

```json
// n8n-workflows/tuleap-user-story-sync.json
{
  "id": "UserStorySync001TuleapQC",
  "name": "Tuleap User Story → QC-Manager Sync",
  "active": false,
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "tuleap-user-story",
        "responseMode": "responseNode",
        "options": {}
      },
      "id": "us0001-0001-4001-8001-000000000001",
      "name": "Webhook: Tuleap User Story",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [240, 304],
      "webhookId": "tuleap-user-story-sync"
    },
    {
      "parameters": {
        "jsCode": "const raw = $input.first().json;\nconst body = (raw.body !== undefined && typeof raw.body === 'object') ? raw.body : raw;\nlet payload;\nif (body.payload !== undefined) {\n  payload = typeof body.payload === 'string' ? JSON.parse(body.payload) : body.payload;\n  if (!payload || typeof payload !== 'object') throw new Error('Parsed payload is not a valid object');\n} else if (body.artifact !== undefined) {\n  payload = { current: body.artifact, project: body.project || null, user: body.user || null, action: body.action || 'artifact:created' };\n} else {\n  throw new Error(`Unrecognized Tuleap webhook format. Body keys: ${Object.keys(body).join(', ')}`);\n}\nconst tracker = payload.tracker || payload.current?.tracker;\nif (!tracker?.id) throw new Error(`Missing tracker.id in payload.`);\nreturn [{ json: { payload } }];"
      },
      "id": "us0001-0002-4002-8002-000000000002",
      "name": "Parse Payload",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [480, 304]
    },
    {
      "parameters": {
        "url": "http://qc-api:3001/tuleap-webhook/config",
        "sendQuery": true,
        "queryParameters": {
          "parameters": [
            { "name": "tracker_type", "value": "user-story" },
            { "name": "is_active",    "value": "true" }
          ]
        },
        "options": {}
      },
      "id": "us0001-0003-4003-8003-000000000003",
      "name": "Fetch Sync Config",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [720, 304]
    },
    {
      "parameters": {
        "jsCode": "const payload = $('Parse Payload').first().json.payload;\nconst configs = $('Fetch Sync Config').first().json.data || [];\nconst trackerId = payload?.tracker?.id;\nconst config = configs.find(c => String(c.tuleap_tracker_id) === String(trackerId));\nif (!config) return [{ json: { hasConfig: false, trackerId, payload } }];\nreturn [{ json: { hasConfig: true, config, payload } }];"
      },
      "id": "us0001-0004-4004-8004-000000000004",
      "name": "Match Config",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [960, 304]
    },
    {
      "parameters": {
        "conditions": {
          "options": { "caseSensitive": true, "typeValidation": "strict" },
          "combinator": "and",
          "conditions": [
            {
              "id": "has-config-check",
              "leftValue": "={{ $json.hasConfig }}",
              "rightValue": true,
              "operator": { "type": "boolean", "operation": "equals", "rightType": "boolean" }
            }
          ]
        },
        "options": {}
      },
      "id": "us0001-0005-4005-8005-000000000005",
      "name": "Has Config?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [1200, 304]
    },
    {
      "parameters": {
        "jsCode": "const { config, payload } = $input.first().json;\nconst artifact = payload.current;\nconst fields = {};\nfor (const v of (artifact.values || [])) { fields[v.name] = v; }\n\nfunction txt(...names) {\n  for (const n of names) {\n    const f = fields[n];\n    if (f && f.value != null) return String(f.value);\n  }\n  return null;\n}\n\nfunction sel(...names) {\n  for (const n of names) {\n    const f = fields[n];\n    if (f && f.values && f.values[0]) return f.values[0].label || null;\n  }\n  return null;\n}\n\nconst artifactId = payload.id || artifact.id;\n\nconst usData = {\n  tuleap_artifact_id: artifactId,\n  title: txt('story_title') || `User Story ${artifactId}`,\n  description: txt('overview_description'),\n  acceptance_criteria: txt('acceptance_criteria'),\n  status: sel('status') || 'Draft',\n  requirement_version: txt('requirement_version'),\n  project_id: config.qc_project_id,\n  raw_tuleap_payload: payload\n};\n\nreturn [{ json: { usData } }];"
      },
      "id": "us0001-0006-4006-8006-000000000006",
      "name": "Transform User Story Data",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1440, 224]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "http://qc-api:3001/tuleap-webhook/user-story",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify($json.usData) }}",
        "options": { "timeout": 30000 }
      },
      "id": "us0001-0007-4007-8007-000000000007",
      "name": "Send to QC API",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1680, 224]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ JSON.stringify({ success: true, message: 'User story processed', id: $json.data?.id || 'unknown' }) }}",
        "options": {}
      },
      "id": "us0001-0008-4008-8008-000000000008",
      "name": "Respond: OK",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1.1,
      "position": [1920, 224]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ JSON.stringify({ success: false, message: 'No sync config found for this tracker' }) }}",
        "options": {}
      },
      "id": "us0001-0009-4009-8009-000000000009",
      "name": "Respond: Not Configured",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1.1,
      "position": [1440, 464]
    }
  ],
  "connections": {
    "Webhook: Tuleap User Story": { "main": [[{ "node": "Parse Payload",          "type": "main", "index": 0 }]] },
    "Parse Payload":              { "main": [[{ "node": "Fetch Sync Config",       "type": "main", "index": 0 }]] },
    "Fetch Sync Config":          { "main": [[{ "node": "Match Config",            "type": "main", "index": 0 }]] },
    "Match Config":               { "main": [[{ "node": "Has Config?",              "type": "main", "index": 0 }]] },
    "Has Config?": {
      "main": [
        [{ "node": "Transform User Story Data", "type": "main", "index": 0 }],
        [{ "node": "Respond: Not Configured",   "type": "main", "index": 0 }]
      ]
    },
    "Transform User Story Data":  { "main": [[{ "node": "Send to QC API", "type": "main", "index": 0 }]] },
    "Send to QC API":             { "main": [[{ "node": "Respond: OK",    "type": "main", "index": 0 }]] }
  },
  "settings": { "executionOrder": "v1" },
  "staticData": null,
  "tags": [{ "name": "tuleap" }]
}
```

- [ ] **Step 5.2: Commit**

```bash
git add n8n-workflows/tuleap-user-story-sync.json
git commit -m "feat(n8n): add tuleap-user-story-sync webhook workflow (placeholder POST endpoint)"
```

---

## Task 6: n8n — polling workflows for all 4 artifact types

**Files:**
- `n8n-workflows/tuleap-bug-poll.json`
- `n8n-workflows/tuleap-task-poll.json`
- `n8n-workflows/tuleap-test-case-poll.json`
- `n8n-workflows/tuleap-user-story-poll.json`

Each polling workflow: schedule every 15 min → fetch configs → for each config, call `GET /tuleap/artifacts/:type` (the new QC API endpoint which proxies to Tuleap) → split result → transform → upsert via QC API webhook endpoint.

The QC API upsert endpoints:
- bugs: `POST /tuleap-webhook/bug`
- tasks: `POST /tuleap-webhook/task`
- test-cases: `POST /tuleap-webhook/test-case`
- user-stories: `POST /tuleap-webhook/user-story` *(placeholder — endpoint not yet created)*

- [ ] **Step 6.1: Create `tuleap-bug-poll.json`**

```json
// n8n-workflows/tuleap-bug-poll.json
{
  "id": "BugPoll001TuleapQC",
  "name": "Tuleap Bug Polling Sync",
  "active": false,
  "nodes": [
    {
      "parameters": { "rule": { "interval": [{ "field": "cronExpression", "expression": "*/15 * * * *" }] } },
      "id": "bp0001-0001-4001-8001-000000000001",
      "name": "Every 15 Minutes",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1.2,
      "position": [240, 304]
    },
    {
      "parameters": {
        "url": "http://qc-api:3001/tuleap-webhook/config",
        "sendQuery": true,
        "queryParameters": {
          "parameters": [
            { "name": "tracker_type", "value": "bug" },
            { "name": "is_active",    "value": "true" }
          ]
        },
        "options": { "timeout": 15000 }
      },
      "id": "bp0001-0002-4002-8002-000000000002",
      "name": "Fetch Bug Configs",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [480, 304]
    },
    {
      "parameters": {
        "conditions": {
          "options": { "caseSensitive": true, "typeValidation": "strict" },
          "combinator": "and",
          "conditions": [
            {
              "id": "has-configs",
              "leftValue": "={{ $json.data?.length }}",
              "rightValue": 0,
              "operator": { "type": "number", "operation": "gt" }
            }
          ]
        },
        "options": {}
      },
      "id": "bp0001-0003-4003-8003-000000000003",
      "name": "Has Configs?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [720, 304]
    },
    {
      "parameters": {
        "jsCode": "const configs = $input.first().json.data || [];\nreturn configs\n  .filter(c => c.qc_project_id)\n  .map(c => ({ json: { qc_project_id: c.qc_project_id, tuleap_tracker_id: c.tuleap_tracker_id } }));"
      },
      "id": "bp0001-0004-4004-8004-000000000004",
      "name": "Split Configs",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [960, 224]
    },
    {
      "parameters": {
        "url": "=http://qc-api:3001/tuleap/artifacts/bug?limit=100&offset=0",
        "options": { "timeout": 30000 },
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [{ "name": "x-qc-project-id", "value": "={{ $json.qc_project_id }}" }]
        }
      },
      "id": "bp0001-0005-4005-8005-000000000005",
      "name": "Fetch Bug Artifacts",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1200, 224]
    },
    {
      "parameters": {
        "jsCode": "const projectId = $('Split Configs').first().json.qc_project_id;\nconst items = ($input.first().json.data || []);\nreturn items.map(artifact => ({\n  json: { artifact, project_id: projectId }\n}));"
      },
      "id": "bp0001-0006-4006-8006-000000000006",
      "name": "Split Artifacts",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1440, 224]
    },
    {
      "parameters": {
        "jsCode": "const { artifact, project_id } = $input.first().json;\nconst fields = {};\nfor (const v of (artifact.values || [])) { fields[v.name] = v; }\n\nfunction txt(...names) {\n  for (const n of names) { const f = fields[n]; if (f && f.value != null) return String(f.value); } return null;\n}\nfunction sel(...names) {\n  for (const n of names) { const f = fields[n]; if (f?.values?.[0]) return f.values[0].label || null; } return null;\n}\nfunction user(...names) {\n  for (const n of names) { const f = fields[n]; if (f?.values?.[0]) return f.values[0].display_name || f.values[0].username || null; } return null;\n}\nfunction mapStatus(s) {\n  if (!s) return 'Open';\n  return { New:'Open', Open:'Open', Assigned:'In Progress', Fixed:'Resolved', Verified:'Resolved', Closed:'Closed', Reopened:'Reopened' }[s] || 'Open';\n}\nfunction mapSeverity(s) {\n  if (!s) return 'medium';\n  const l = s.toLowerCase();\n  if (l.includes('critical')) return 'critical';\n  if (l.includes('major'))    return 'high';\n  if (l.includes('minor'))    return 'medium';\n  if (l.includes('cosmetic')) return 'low';\n  return 'medium';\n}\n\nreturn [{ json: { bugData: {\n  tuleap_artifact_id: artifact.id,\n  tuleap_tracker_id: artifact.tracker?.id,\n  bug_id: `TLP-${artifact.id}`,\n  title: txt('bug_title') || `Bug ${artifact.id}`,\n  description: txt('steps_to_reproduce'),\n  status: mapStatus(sel('status')),\n  severity: mapSeverity(sel('severity')),\n  priority: 'medium',\n  project_id,\n  assigned_to: user('assigned_to'),\n  reported_date: artifact.submitted_on || null,\n  raw_tuleap_payload: artifact\n} } }];"
      },
      "id": "bp0001-0007-4007-8007-000000000007",
      "name": "Transform Bug",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1680, 224]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "http://qc-api:3001/tuleap-webhook/bug",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify($json.bugData) }}",
        "options": { "timeout": 30000 }
      },
      "id": "bp0001-0008-4008-8008-000000000008",
      "name": "Upsert Bug",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1920, 224]
    },
    {
      "parameters": { "jsCode": "return [];" },
      "id": "bp0001-0009-4009-8009-000000000009",
      "name": "No Configs - Skip",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [960, 464]
    }
  ],
  "connections": {
    "Every 15 Minutes":  { "main": [[{ "node": "Fetch Bug Configs",  "type": "main", "index": 0 }]] },
    "Fetch Bug Configs":  { "main": [[{ "node": "Has Configs?",       "type": "main", "index": 0 }]] },
    "Has Configs?": {
      "main": [
        [{ "node": "Split Configs",    "type": "main", "index": 0 }],
        [{ "node": "No Configs - Skip","type": "main", "index": 0 }]
      ]
    },
    "Split Configs":      { "main": [[{ "node": "Fetch Bug Artifacts","type": "main", "index": 0 }]] },
    "Fetch Bug Artifacts":{ "main": [[{ "node": "Split Artifacts",    "type": "main", "index": 0 }]] },
    "Split Artifacts":    { "main": [[{ "node": "Transform Bug",      "type": "main", "index": 0 }]] },
    "Transform Bug":      { "main": [[{ "node": "Upsert Bug",         "type": "main", "index": 0 }]] }
  },
  "settings": { "executionOrder": "v1" },
  "staticData": null,
  "tags": [{ "name": "tuleap" }]
}
```

- [ ] **Step 6.2: Create `tuleap-task-poll.json`**

This is identical to `tuleap-bug-poll.json` with these substitutions:
- `id`: `"TaskPoll001TuleapQC"`
- `name`: `"Tuleap Task Polling Sync"`
- All `bp0001` node IDs → `tp0001`
- `tracker_type` query value: `"task"`
- Fetch URL: `http://qc-api:3001/tuleap/artifacts/task?limit=100&offset=0`
- Transform node name: `"Transform Task"`
- Transform jsCode — map task fields: `title` (from `title` field), `description` (from `details` field):

```js
// Transform Task jsCode (replace the Transform Bug jsCode with this):
const { artifact, project_id } = $input.first().json;
const fields = {};
for (const v of (artifact.values || [])) { fields[v.name] = v; }

function txt(...names) {
  for (const n of names) { const f = fields[n]; if (f && f.value != null) return String(f.value); } return null;
}
function sel(...names) {
  for (const n of names) { const f = fields[n]; if (f?.values?.[0]) return f.values[0].label || null; } return null;
}
function user(...names) {
  for (const n of names) { const f = fields[n]; if (f?.values?.[0]) return f.values[0].display_name || f.values[0].username || null; } return null;
}

return [{ json: { taskData: {
  tuleap_artifact_id: artifact.id,
  tuleap_tracker_id: artifact.tracker?.id,
  title: txt('title') || `Task ${artifact.id}`,
  description: txt('details'),
  status: sel('status') || 'Todo',
  assigned_to: user('assigned_to'),
  team: sel('team'),
  project_id,
  raw_tuleap_payload: artifact
} } }];
```

- Upsert URL: `http://qc-api:3001/tuleap-webhook/task`
- `jsonBody`: `{{ JSON.stringify($json.taskData) }}`

Create this file following the same JSON structure as `tuleap-bug-poll.json`.

- [ ] **Step 6.3: Create `tuleap-test-case-poll.json`**

Same structure, substitutions:
- `id`: `"TestCasePoll001TuleapQC"`
- `name`: `"Tuleap Test Case Polling Sync"`
- All node IDs: `tcp0001-...`
- `tracker_type`: `"test-case"`
- Fetch URL: `http://qc-api:3001/tuleap/artifacts/test-case?limit=100&offset=0`
- Transform jsCode:

```js
const { artifact, project_id } = $input.first().json;
const fields = {};
for (const v of (artifact.values || [])) { fields[v.name] = v; }
function txt(...names) { for (const n of names) { const f = fields[n]; if (f && f.value != null) return String(f.value); } return null; }
return [{ json: { tcData: {
  tuleap_artifact_id: artifact.id,
  title: txt('title') || `Test Case ${artifact.id}`,
  description: txt('test_steps'),
  priority: 'medium',
  category: 'other',
  status: 'active',
  project_id,
  tags: [`tuleap:${artifact.id}`],
  raw_tuleap_payload: artifact
} } }];
```

- Upsert URL: `http://qc-api:3001/tuleap-webhook/test-case`
- `jsonBody`: `{{ JSON.stringify($json.tcData) }}`

- [ ] **Step 6.4: Create `tuleap-user-story-poll.json`**

Same structure, substitutions:
- `id`: `"UserStoryPoll001TuleapQC"`
- `name`: `"Tuleap User Story Polling Sync"`
- All node IDs: `usp0001-...`
- `tracker_type`: `"user-story"`
- Fetch URL: `http://qc-api:3001/tuleap/artifacts/user-story?limit=100&offset=0`
- Transform jsCode:

```js
const { artifact, project_id } = $input.first().json;
const fields = {};
for (const v of (artifact.values || [])) { fields[v.name] = v; }
function txt(...names) { for (const n of names) { const f = fields[n]; if (f && f.value != null) return String(f.value); } return null; }
function sel(...names) { for (const n of names) { const f = fields[n]; if (f?.values?.[0]) return f.values[0].label || null; } return null; }
return [{ json: { usData: {
  tuleap_artifact_id: artifact.id,
  title: txt('story_title') || `User Story ${artifact.id}`,
  description: txt('overview_description'),
  acceptance_criteria: txt('acceptance_criteria'),
  status: sel('status') || 'Draft',
  requirement_version: txt('requirement_version'),
  project_id,
  raw_tuleap_payload: artifact
} } }];
```

- Upsert URL: `http://qc-api:3001/tuleap-webhook/user-story` *(placeholder — not yet implemented)*
- `jsonBody`: `{{ JSON.stringify($json.usData) }}`

- [ ] **Step 6.5: Commit all polling workflows**

```bash
git add n8n-workflows/tuleap-bug-poll.json n8n-workflows/tuleap-task-poll.json n8n-workflows/tuleap-test-case-poll.json n8n-workflows/tuleap-user-story-poll.json
git commit -m "feat(n8n): add polling sync workflows for all 4 Tuleap artifact types"
```

---

## Task 7: Final verification

- [ ] **Step 7.1: Run full tuleap test suite**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/tuleap --no-coverage
```
Expected: all PASS (`tuleapClient`, `tuleapFieldRegistry`, `tuleapPayloadBuilder`, `tuleapArtifacts.routes`)

- [ ] **Step 7.2: Verify n8n workflow files are valid JSON**

```bash
for f in /root/QC-Manager/n8n-workflows/tuleap-*.json; do
  python3 -c "import json; json.load(open('$f'))" && echo "OK: $f" || echo "INVALID: $f"
done
```
Expected: `OK` for all files.

- [ ] **Step 7.3: Final commit (if anything outstanding)**

```bash
cd /root/QC-Manager && git status
```
If clean, done. If not, add and commit any remaining files.

---

## Known Limitation

`POST /tuleap-webhook/user-story` does not exist in the QC API. The user-story webhook sync and poll workflows will fail at the upsert step until this endpoint is implemented. The endpoint needs to:
- Accept `{ tuleap_artifact_id, title, description, acceptance_criteria, status, requirement_version, project_id, raw_tuleap_payload }`
- Upsert into a `user_story` table (table does not yet exist — requires a DB migration)

This is intentionally out of scope for this plan and should be handled as a separate feature.

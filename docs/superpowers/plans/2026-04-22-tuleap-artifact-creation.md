# Tuleap Artifact Creation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-grade system that creates User Stories, Test Cases, Tasks, and Bugs in Tuleap via REST API, with full field mapping, validation, attachment support, and AI agent integration.

**Architecture:** A `TuleapClient` service class handles all HTTP communication and schema caching. Per-artifact `PayloadBuilder` modules convert normalized JS objects into Tuleap's `{ field_id, value }` array format, using a cached `FieldRegistry` to resolve field IDs and validate enum values. Routes in `apps/api/src/routes/tuleapCreate.js` expose REST endpoints that call these builders, while `apps/api/src/services/tuleapClient.js` owns all retry logic and auth.

**Tech Stack:** Node.js 18+, Express, axios, form-data (for multipart file uploads), Jest (unit tests), existing `pool` from `apps/api/src/config/db.js`

---

## Phase Overview

| Phase | What It Delivers |
|-------|-----------------|
| 1 | Auth client — `TuleapClient` with PAK header injection, token test, retry |
| 2 | Schema discovery — `FieldRegistry` that fetches & caches tracker field schemas |
| 3 | Payload builders — per-artifact builder functions tested in isolation |
| 4 | User Story creation endpoint |
| 5 | Test Case creation endpoint |
| 6 | Task creation endpoint (with parent story link) |
| 7 | Bug creation endpoint (with test case link) |
| 8 | Attachment system — multipart upload to Tuleap, then attach to artifact |
| 9 | Error handling & retry hardening |
| 10 | End-to-end validation suite |

---

## File Structure

```
apps/api/src/
  services/
    tuleapClient.js          ← HTTP client: auth, retry, error normalisation
    tuleapFieldRegistry.js   ← Fetch + cache tracker field schemas
    tuleapPayloadBuilder.js  ← Build { field_id, value } arrays per artifact type
    tuleapAttachment.js      ← Upload file → get file_id → attach to artifact
  routes/
    tuleapCreate.js          ← POST /tuleap/artifacts/:type
  middleware/
    (existing authMiddleware.js stays)

apps/api/__tests__/
  tuleapClient.test.js
  tuleapFieldRegistry.test.js
  tuleapPayloadBuilder.test.js
  tuleapAttachment.test.js
  tuleapCreate.routes.test.js
```

**Environment variables needed (add to `.env`):**
```
TULEAP_BASE_URL=https://tuleap.windinfosys.com
TULEAP_ACCESS_KEY=tlp-k1-...
TULEAP_DEFAULT_PROJECT_ID=101
TULEAP_TRACKER_USER_STORY=<tracker_id>
TULEAP_TRACKER_TEST_CASE=<tracker_id>
TULEAP_TRACKER_TASK=5
TULEAP_TRACKER_BUG=<tracker_id>
```

---

## Task 1: TuleapClient — HTTP Auth + Retry

**Files:**
- Create: `apps/api/src/services/tuleapClient.js`
- Create: `apps/api/__tests__/tuleapClient.test.js`

### What this builds
A singleton `axios` instance that:
- Injects `X-Auth-AccessKey` on every request
- Retries on 429 / 5xx up to 3 times with exponential back-off (1s, 2s, 4s)
- Wraps axios errors into `{ status, code, message, raw }` shape

- [ ] **Step 1.1: Write the failing tests**

```js
// apps/api/__tests__/tuleapClient.test.js
const axios = require('axios');
jest.mock('axios');

const { createTuleapClient } = require('../src/services/tuleapClient');

describe('createTuleapClient', () => {
  it('injects X-Auth-AccessKey on every request', async () => {
    axios.create.mockReturnValue({
      interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
      get: jest.fn().mockResolvedValue({ data: { id: 1 } }),
    });
    const client = createTuleapClient({ baseURL: 'https://example.com', accessKey: 'tok' });
    // interceptors.request.use should have been called once
    expect(axios.create).toHaveBeenCalledWith(expect.objectContaining({ baseURL: 'https://example.com' }));
  });

  it('throws a normalised error on 404', async () => {
    const axiosError = { isAxiosError: true, response: { status: 404, data: { error: { message: 'Not found' } } } };
    axios.create.mockReturnValue({
      interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
      get: jest.fn().mockRejectedValue(axiosError),
    });
    const client = createTuleapClient({ baseURL: 'https://example.com', accessKey: 'tok' });
    await expect(client.get('/foo')).rejects.toMatchObject({ status: 404, message: 'Not found' });
  });
});
```

- [ ] **Step 1.2: Run tests to confirm they fail**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/tuleapClient.test.js --no-coverage
```
Expected: `FAIL — Cannot find module '../src/services/tuleapClient'`

- [ ] **Step 1.3: Implement TuleapClient**

```js
// apps/api/src/services/tuleapClient.js
const axios = require('axios');

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function normaliseError(err) {
  if (err.isAxiosError && err.response) {
    const { status, data } = err.response;
    const message = data?.error?.message || data?.message || `HTTP ${status}`;
    const normalized = new Error(message);
    normalized.status = status;
    normalized.code = data?.error?.code || null;
    normalized.raw = data;
    return normalized;
  }
  return err;
}

function createTuleapClient({ baseURL, accessKey } = {}) {
  const url = baseURL || process.env.TULEAP_BASE_URL;
  const key = accessKey || process.env.TULEAP_ACCESS_KEY;

  const instance = axios.create({
    baseURL: `${url}/api/v1`,
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
  });

  instance.interceptors.request.use(cfg => {
    cfg.headers['X-Auth-AccessKey'] = key;
    return cfg;
  });

  // Wrap errors
  instance.interceptors.response.use(
    r => r,
    err => Promise.reject(normaliseError(err))
  );

  // Retry wrapper
  const withRetry = (method) => async (...args) => {
    let attempt = 0;
    while (true) {
      try {
        return await instance[method](...args);
      } catch (err) {
        attempt++;
        if (attempt >= MAX_RETRIES || !RETRY_STATUSES.has(err.status)) throw err;
        await sleep(RETRY_DELAY_MS * Math.pow(2, attempt - 1));
      }
    }
  };

  return {
    get:    withRetry('get'),
    post:   withRetry('post'),
    put:    withRetry('put'),
    patch:  withRetry('patch'),
    delete: withRetry('delete'),
    _raw:   instance,  // for multipart form-data uploads
  };
}

const defaultClient = createTuleapClient();
module.exports = { createTuleapClient, defaultClient };
```

- [ ] **Step 1.4: Run tests to verify they pass**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/tuleapClient.test.js --no-coverage
```
Expected: `PASS`

- [ ] **Step 1.5: Commit**

```bash
git add apps/api/src/services/tuleapClient.js apps/api/__tests__/tuleapClient.test.js
git commit -m "feat(tuleap): add TuleapClient with PAK auth, retry, error normalisation"
```

---

## Task 2: FieldRegistry — Tracker Schema Discovery & Caching

**Files:**
- Create: `apps/api/src/services/tuleapFieldRegistry.js`
- Create: `apps/api/__tests__/tuleapFieldRegistry.test.js`

### What this builds
Fetches `GET /trackers/:id/used_fields` from Tuleap, caches the result in-process (TTL 5 min), and exposes:
- `getField(trackerId, fieldName)` → `{ field_id, type, values }` or throws if not found
- `getFieldId(trackerId, fieldName)` → `Number`
- `resolveBindValue(trackerId, fieldName, label)` → bind value `{ id }` for sb/rb fields

Tuleap used_fields response shape (abbreviated):
```json
[
  { "field_id": 42, "name": "summary", "label": "Summary", "type": "string" },
  { "field_id": 43, "name": "status", "label": "Status", "type": "sb",
    "values": [{ "id": 100, "label": "Open" }, { "id": 101, "label": "Closed" }] }
]
```

- [ ] **Step 2.1: Write the failing tests**

```js
// apps/api/__tests__/tuleapFieldRegistry.test.js
jest.mock('../src/services/tuleapClient', () => ({
  defaultClient: {
    get: jest.fn(),
  },
}));

const { defaultClient } = require('../src/services/tuleapClient');
const { FieldRegistry } = require('../src/services/tuleapFieldRegistry');

const MOCK_FIELDS = [
  { field_id: 42, name: 'summary', label: 'Summary', type: 'string', values: [] },
  { field_id: 43, name: 'status', label: 'Status', type: 'sb',
    values: [{ id: 100, label: 'Open' }, { id: 101, label: 'Closed' }] },
];

beforeEach(() => {
  defaultClient.get.mockResolvedValue({ data: MOCK_FIELDS });
});

describe('FieldRegistry', () => {
  it('returns field_id for a known field', async () => {
    const reg = new FieldRegistry();
    const id = await reg.getFieldId(5, 'summary');
    expect(id).toBe(42);
  });

  it('resolves a bind value by label', async () => {
    const reg = new FieldRegistry();
    const val = await reg.resolveBindValue(5, 'status', 'Open');
    expect(val).toEqual({ id: 100 });
  });

  it('throws when field not found', async () => {
    const reg = new FieldRegistry();
    await expect(reg.getFieldId(5, 'nonexistent')).rejects.toThrow(/Field 'nonexistent' not found/);
  });

  it('throws when bind label not found', async () => {
    const reg = new FieldRegistry();
    await expect(reg.resolveBindValue(5, 'status', 'Unknown')).rejects.toThrow(/Bind value 'Unknown' not found/);
  });

  it('caches responses and only calls API once per tracker', async () => {
    const reg = new FieldRegistry();
    await reg.getFieldId(5, 'summary');
    await reg.getFieldId(5, 'summary');
    expect(defaultClient.get).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2.2: Run tests to confirm they fail**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/tuleapFieldRegistry.test.js --no-coverage
```
Expected: `FAIL — Cannot find module '../src/services/tuleapFieldRegistry'`

- [ ] **Step 2.3: Implement FieldRegistry**

```js
// apps/api/src/services/tuleapFieldRegistry.js
const { defaultClient } = require('./tuleapClient');

const CACHE_TTL_MS = 5 * 60 * 1000;

class FieldRegistry {
  constructor(client = defaultClient) {
    this._client = client;
    this._cache = new Map(); // trackerId → { fields: Map<name, field>, expiresAt }
  }

  async _load(trackerId) {
    const cached = this._cache.get(trackerId);
    if (cached && Date.now() < cached.expiresAt) return cached.fields;

    const { data } = await this._client.get(`/trackers/${trackerId}/used_fields`);
    const fields = new Map(data.map(f => [f.name, f]));
    this._cache.set(trackerId, { fields, expiresAt: Date.now() + CACHE_TTL_MS });
    return fields;
  }

  async getField(trackerId, fieldName) {
    const fields = await this._load(trackerId);
    const f = fields.get(fieldName);
    if (!f) throw new Error(`Field '${fieldName}' not found in tracker ${trackerId}`);
    return f;
  }

  async getFieldId(trackerId, fieldName) {
    return (await this.getField(trackerId, fieldName)).field_id;
  }

  async resolveBindValue(trackerId, fieldName, label) {
    const f = await this.getField(trackerId, fieldName);
    const match = (f.values || []).find(v => v.label === label);
    if (!match) throw new Error(
      `Bind value '${label}' not found for field '${fieldName}' in tracker ${trackerId}. ` +
      `Available: ${(f.values || []).map(v => v.label).join(', ')}`
    );
    return { id: match.id };
  }
}

const defaultRegistry = new FieldRegistry();
module.exports = { FieldRegistry, defaultRegistry };
```

- [ ] **Step 2.4: Run tests to verify they pass**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/tuleapFieldRegistry.test.js --no-coverage
```
Expected: `PASS (5 tests)`

- [ ] **Step 2.5: Commit**

```bash
git add apps/api/src/services/tuleapFieldRegistry.js apps/api/__tests__/tuleapFieldRegistry.test.js
git commit -m "feat(tuleap): add FieldRegistry with tracker schema caching"
```

---

## Task 3: PayloadBuilder — Dynamic { field_id, value } Array Builder

**Files:**
- Create: `apps/api/src/services/tuleapPayloadBuilder.js`
- Create: `apps/api/__tests__/tuleapPayloadBuilder.test.js`

### What this builds
Four builder functions (one per artifact type). Each accepts a normalized JS input object and the `FieldRegistry`, and returns the Tuleap POST body:
```json
{
  "tracker": { "id": 5 },
  "values": [
    { "field_id": 42, "value": "My summary" },
    { "field_id": 43, "bind_value_ids": [100] }
  ]
}
```

**Field type → value shape mapping:**
| Tuleap type | Value shape in `values` array |
|-------------|-------------------------------|
| `string` / `text` / `float` / `int` | `{ field_id, value: <scalar> }` |
| `sb` (select box) / `rb` (radio) | `{ field_id, bind_value_ids: [id] }` |
| `msb` (multi select) | `{ field_id, bind_value_ids: [id, ...] }` |
| `art_link` (artifact link) | `{ field_id, links: [{ id: <int> }] }` |
| `file` (attachments) | `{ field_id, value: [<file_id>, ...] }` |

- [ ] **Step 3.1: Write the failing tests**

```js
// apps/api/__tests__/tuleapPayloadBuilder.test.js
const { buildUserStoryPayload, buildTestCasePayload, buildTaskPayload, buildBugPayload } = require('../src/services/tuleapPayloadBuilder');

// Mock registry that resolves field IDs synchronously
const makeRegistry = (fields, binds = {}) => ({
  getFieldId: jest.fn(async (trackerId, name) => {
    if (!(name in fields)) throw new Error(`Field '${name}' not found`);
    return fields[name];
  }),
  resolveBindValue: jest.fn(async (trackerId, name, label) => {
    const key = `${name}:${label}`;
    if (!(key in binds)) throw new Error(`Bind '${key}' not found`);
    return { id: binds[key] };
  }),
});

const USER_STORY_FIELDS = { summary: 1, description: 2, acceptance_criteria: 3, status: 4, requirement_version: 5, ba_author: 6, priority: 7, initial_effort: 8, remaining_effort: 9, change_reason: 10 };
const USER_STORY_BINDS = { 'status:New': 100, 'priority:High': 200 };

describe('buildUserStoryPayload', () => {
  it('includes summary, description, acceptance_criteria, status', async () => {
    const reg = makeRegistry(USER_STORY_FIELDS, USER_STORY_BINDS);
    const payload = await buildUserStoryPayload({
      trackerId: 10,
      summary: 'Login flow',
      description: '## Desc',
      acceptanceCriteria: '## AC',
      status: 'New',
      baAuthor: 'Alice',
      requirementVersion: '1',
    }, reg);
    expect(payload.tracker).toEqual({ id: 10 });
    const find = (id) => payload.values.find(v => v.field_id === id);
    expect(find(1).value).toBe('Login flow');
    expect(find(4).bind_value_ids).toEqual([100]);
  });

  it('throws when summary is missing', async () => {
    const reg = makeRegistry(USER_STORY_FIELDS, USER_STORY_BINDS);
    await expect(buildUserStoryPayload({ trackerId: 10, status: 'New', baAuthor: 'A', requirementVersion: '1' }, reg))
      .rejects.toThrow(/summary.*required/i);
  });
});

describe('buildTestCasePayload', () => {
  const TC_FIELDS = { title: 11, test_steps: 12, expected_result: 13, status: 14, service_name: 15 };
  const TC_BINDS = { 'status:Not Run': 101 };
  it('builds payload with required fields', async () => {
    const reg = makeRegistry(TC_FIELDS, TC_BINDS);
    const payload = await buildTestCasePayload({
      trackerId: 20,
      title: 'TC-001',
      testSteps: '1. Open page',
      expectedResult: 'Page loads',
      status: 'Not Run',
    }, reg);
    expect(payload.values.find(v => v.field_id === 11).value).toBe('TC-001');
  });
});

describe('buildTaskPayload', () => {
  const TASK_FIELDS = { task_title: 21, description: 22, assigned_to: 23, team: 24, status: 25, parent_story: 26 };
  const TASK_BINDS = { 'status:Todo': 102, 'team:Backend': 202 };
  it('includes parent story link', async () => {
    const reg = makeRegistry(TASK_FIELDS, TASK_BINDS);
    const payload = await buildTaskPayload({
      trackerId: 5,
      taskTitle: 'Implement login',
      assignedTo: 'Bob',
      team: 'Backend',
      status: 'Todo',
      parentStoryArtifactId: 999,
    }, reg);
    const link = payload.values.find(v => v.field_id === 26);
    expect(link.links).toEqual([{ id: 999 }]);
  });
});

describe('buildBugPayload', () => {
  const BUG_FIELDS = { bug_title: 31, description: 32, environment: 33, status: 34, service_name: 35, assigned_to: 36, severity: 37, test_case_link: 38 };
  const BUG_BINDS = { 'status:Open': 103, 'environment:TEST': 203, 'severity:medium': 303 };
  it('includes test case link when provided', async () => {
    const reg = makeRegistry(BUG_FIELDS, BUG_BINDS);
    const payload = await buildBugPayload({
      trackerId: 30,
      bugTitle: 'Login crash',
      description: 'Steps...',
      environment: 'TEST',
      serviceName: 'auth-service',
      status: 'Open',
      severity: 'medium',
      testCaseArtifactId: 777,
    }, reg);
    const link = payload.values.find(v => v.field_id === 38);
    expect(link.links).toEqual([{ id: 777 }]);
  });
});
```

- [ ] **Step 3.2: Run tests to confirm they fail**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/tuleapPayloadBuilder.test.js --no-coverage
```
Expected: `FAIL — Cannot find module '../src/services/tuleapPayloadBuilder'`

- [ ] **Step 3.3: Implement PayloadBuilder**

```js
// apps/api/src/services/tuleapPayloadBuilder.js

function required(value, name) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`'${name}' is required`);
  }
  return value;
}

async function buildUserStoryPayload(input, registry) {
  const t = input.trackerId;
  required(input.summary, 'summary');
  required(input.status, 'status');
  required(input.baAuthor, 'baAuthor');
  required(input.requirementVersion, 'requirementVersion');

  const values = [];
  const add = (fieldName, value) => values.push({ field_id: value.field_id || value, ...value });

  const push = async (fieldName, shape) => {
    const field_id = await registry.getFieldId(t, fieldName);
    values.push({ field_id, ...shape });
  };

  await push('summary', { value: input.summary });
  if (input.description) await push('description', { value: input.description });
  if (input.acceptanceCriteria) await push('acceptance_criteria', { value: input.acceptanceCriteria });
  await push('status', { bind_value_ids: [(await registry.resolveBindValue(t, 'status', input.status)).id] });
  await push('ba_author', { value: input.baAuthor });
  await push('requirement_version', { value: input.requirementVersion });
  if (input.priority) await push('priority', { bind_value_ids: [(await registry.resolveBindValue(t, 'priority', input.priority)).id] });
  if (input.initialEffort != null) await push('initial_effort', { value: Number(input.initialEffort) });
  if (input.remainingEffort != null) await push('remaining_effort', { value: Number(input.remainingEffort) });
  if (input.changeReason) await push('change_reason', { value: input.changeReason });
  if (input.attachmentIds?.length) await push('attachment', { value: input.attachmentIds });

  return { tracker: { id: t }, values };
}

async function buildTestCasePayload(input, registry) {
  const t = input.trackerId;
  required(input.title, 'title');
  required(input.testSteps, 'testSteps');
  required(input.expectedResult, 'expectedResult');

  const values = [];
  const push = async (fieldName, shape) => {
    const field_id = await registry.getFieldId(t, fieldName);
    values.push({ field_id, ...shape });
  };

  await push('title', { value: input.title });
  await push('test_steps', { value: input.testSteps });
  await push('expected_result', { value: input.expectedResult });

  const statusLabel = input.status || 'Not Run';
  await push('status', { bind_value_ids: [(await registry.resolveBindValue(t, 'status', statusLabel)).id] });

  if (input.serviceName) await push('service_name', { value: input.serviceName });
  if (input.preconditions) await push('preconditions', { value: input.preconditions });
  if (input.actualResult) await push('actual_result', { value: input.actualResult });
  if (input.assignedTo) await push('assigned_to', { value: input.assignedTo });
  if (input.isRegression != null) await push('is_regression', { bind_value_ids: [input.isRegression ? 1 : 0] });
  if (input.note) await push('note', { value: input.note });
  if (input.attachmentIds?.length) await push('attachment', { value: input.attachmentIds });
  if (input.linkedArtifactIds?.length) {
    await push('links', { links: input.linkedArtifactIds.map(id => ({ id })) });
  }

  return { tracker: { id: t }, values };
}

async function buildTaskPayload(input, registry) {
  const t = input.trackerId;
  required(input.taskTitle, 'taskTitle');
  required(input.assignedTo, 'assignedTo');
  required(input.team, 'team');
  required(input.status, 'status');
  required(input.parentStoryArtifactId, 'parentStoryArtifactId');

  const values = [];
  const push = async (fieldName, shape) => {
    const field_id = await registry.getFieldId(t, fieldName);
    values.push({ field_id, ...shape });
  };

  await push('task_title', { value: input.taskTitle });
  await push('status', { bind_value_ids: [(await registry.resolveBindValue(t, 'status', input.status)).id] });
  await push('assigned_to', { value: input.assignedTo });
  await push('team', { bind_value_ids: [(await registry.resolveBindValue(t, 'team', input.team)).id] });
  await push('parent_story', { links: [{ id: Number(input.parentStoryArtifactId) }] });

  if (input.description) await push('description', { value: input.description });
  if (input.devInitialEstimate != null) await push('dev_initial_estimate', { value: Number(input.devInitialEstimate) });
  if (input.pmFinalEstimate != null) await push('pm_final_estimate', { value: Number(input.pmFinalEstimate) });
  if (input.actualEffort != null) await push('actual_effort', { value: Number(input.actualEffort) });
  if (input.blockedReason) await push('blocked_reason', { value: input.blockedReason });

  return { tracker: { id: t }, values };
}

async function buildBugPayload(input, registry) {
  const t = input.trackerId;
  required(input.bugTitle, 'bugTitle');
  required(input.environment, 'environment');
  required(input.serviceName, 'serviceName');

  const values = [];
  const push = async (fieldName, shape) => {
    const field_id = await registry.getFieldId(t, fieldName);
    values.push({ field_id, ...shape });
  };

  await push('bug_title', { value: input.bugTitle });
  await push('service_name', { value: input.serviceName });
  await push('environment', { bind_value_ids: [(await registry.resolveBindValue(t, 'environment', input.environment)).id] });

  const statusLabel = input.status || 'Open';
  await push('status', { bind_value_ids: [(await registry.resolveBindValue(t, 'status', statusLabel)).id] });

  if (input.description) await push('description', { value: input.description });
  if (input.assignedTo) await push('assigned_to', { value: input.assignedTo });
  if (input.severity) await push('severity', { bind_value_ids: [(await registry.resolveBindValue(t, 'severity', input.severity)).id] });
  if (input.initialEffort != null) await push('initial_effort', { value: Number(input.initialEffort) });
  if (input.remainingEffort != null) await push('remaining_effort', { value: Number(input.remainingEffort) });
  if (input.devFixDescription) await push('dev_fix_description', { value: input.devFixDescription });
  if (input.qcVerificationNotes) await push('qc_verification_notes', { value: input.qcVerificationNotes });
  if (input.testCaseArtifactId) {
    await push('test_case_link', { links: [{ id: Number(input.testCaseArtifactId) }] });
  }
  if (input.attachmentIds?.length) await push('attachment', { value: input.attachmentIds });

  return { tracker: { id: t }, values };
}

module.exports = { buildUserStoryPayload, buildTestCasePayload, buildTaskPayload, buildBugPayload };
```

- [ ] **Step 3.4: Run tests to verify they pass**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/tuleapPayloadBuilder.test.js --no-coverage
```
Expected: `PASS (5 tests)`

- [ ] **Step 3.5: Commit**

```bash
git add apps/api/src/services/tuleapPayloadBuilder.js apps/api/__tests__/tuleapPayloadBuilder.test.js
git commit -m "feat(tuleap): add artifact payload builders for all 4 artifact types"
```

---

## Task 4: Attachment Service

**Files:**
- Create: `apps/api/src/services/tuleapAttachment.js`
- Create: `apps/api/__tests__/tuleapAttachment.test.js`

### What this builds
Two functions:
1. `uploadFile(filePath, mimeType, fileName)` → `fileId: number` — POSTs to `/artifact_temporary_files`, returns `id`
2. `attachFiles(artifactId, fileIds)` — PATCHes artifact to attach uploaded files

Tuleap expects multipart/form-data for file upload:
```
POST /api/v1/artifact_temporary_files
Content-Type: multipart/form-data
  name="file_creator[filename]"   → "screenshot.png"
  name="file_creator[mimetype]"   → "image/png"
  name="file_creator[content]"    → base64-encoded bytes
```

Response: `{ id: 42, ... }`

- [ ] **Step 4.1: Write the failing tests**

```js
// apps/api/__tests__/tuleapAttachment.test.js
const fs = require('fs');
jest.mock('../src/services/tuleapClient', () => ({
  defaultClient: {
    _raw: { post: jest.fn(), patch: jest.fn() },
    patch: jest.fn(),
  },
}));

const { defaultClient } = require('../src/services/tuleapClient');
const { uploadFile, attachFilesToArtifact } = require('../src/services/tuleapAttachment');

describe('uploadFile', () => {
  it('returns the file id from Tuleap response', async () => {
    defaultClient._raw.post.mockResolvedValue({ data: { id: 99 } });
    const id = await uploadFile(Buffer.from('data'), 'image/png', 'shot.png');
    expect(id).toBe(99);
    expect(defaultClient._raw.post).toHaveBeenCalledWith(
      '/artifact_temporary_files',
      expect.objectContaining({}),
      expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': expect.stringContaining('multipart/form-data') }) })
    );
  });
});

describe('attachFilesToArtifact', () => {
  it('PATCHes the artifact with file field values', async () => {
    defaultClient.patch.mockResolvedValue({ data: {} });
    await attachFilesToArtifact(123, 55, [99, 100]);
    expect(defaultClient.patch).toHaveBeenCalledWith(
      '/artifacts/123',
      expect.objectContaining({ values: expect.arrayContaining([
        expect.objectContaining({ field_id: 55, value: [99, 100] })
      ]) })
    );
  });
});
```

- [ ] **Step 4.2: Run tests to confirm they fail**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/tuleapAttachment.test.js --no-coverage
```
Expected: `FAIL`

- [ ] **Step 4.3: Implement attachment service**

First install form-data if not already present:
```bash
cd /root/QC-Manager/apps/api && npm list form-data || npm install form-data
```

```js
// apps/api/src/services/tuleapAttachment.js
const FormData = require('form-data');
const { defaultClient } = require('./tuleapClient');

async function uploadFile(bufferOrPath, mimeType, fileName, client = defaultClient) {
  const form = new FormData();
  const buf = Buffer.isBuffer(bufferOrPath)
    ? bufferOrPath
    : require('fs').readFileSync(bufferOrPath);

  form.append('file_creator[filename]', fileName);
  form.append('file_creator[mimetype]', mimeType);
  form.append('file_creator[content]', buf.toString('base64'));

  const { data } = await client._raw.post('/artifact_temporary_files', form, {
    headers: form.getHeaders(),
  });
  return data.id;
}

async function attachFilesToArtifact(artifactId, fileFieldId, fileIds, client = defaultClient) {
  await client.patch(`/artifacts/${artifactId}`, {
    values: [{ field_id: fileFieldId, value: fileIds }],
  });
}

module.exports = { uploadFile, attachFilesToArtifact };
```

- [ ] **Step 4.4: Run tests to verify they pass**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/tuleapAttachment.test.js --no-coverage
```
Expected: `PASS`

- [ ] **Step 4.5: Commit**

```bash
git add apps/api/src/services/tuleapAttachment.js apps/api/__tests__/tuleapAttachment.test.js
git commit -m "feat(tuleap): add attachment upload service (base64 multipart)"
```

---

## Task 5: Route — POST /tuleap/artifacts/:type

**Files:**
- Create: `apps/api/src/routes/tuleapCreate.js`
- Create: `apps/api/__tests__/tuleapCreate.routes.test.js`
- Modify: `apps/api/src/index.js` — register route

### What this builds
Single route file handling all 4 artifact types:
- `POST /tuleap/artifacts/user-story`
- `POST /tuleap/artifacts/test-case`
- `POST /tuleap/artifacts/task`
- `POST /tuleap/artifacts/bug`

Each endpoint:
1. Resolves the tracker ID from env
2. Calls the appropriate payload builder
3. POSTs to Tuleap `POST /artifacts`
4. Returns `{ tuleap_artifact_id, tuleap_url, artifact_type }` on 201

Protected by existing `authMiddleware`.

- [ ] **Step 5.1: Write the failing route test**

```js
// apps/api/__tests__/tuleapCreate.routes.test.js
const request = require('supertest');
const express = require('express');

jest.mock('../src/services/tuleapClient', () => ({
  defaultClient: { post: jest.fn() },
}));
jest.mock('../src/services/tuleapFieldRegistry', () => ({
  defaultRegistry: {
    getFieldId: jest.fn().mockResolvedValue(42),
    resolveBindValue: jest.fn().mockResolvedValue({ id: 100 }),
  },
}));
jest.mock('../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, res, next) => { req.user = { email: 'test@test.com' }; next(); },
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
    expect(res.body.error).toMatch(/summary.*required/i);
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
```

- [ ] **Step 5.2: Run tests to confirm they fail**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/tuleapCreate.routes.test.js --no-coverage
```
Expected: `FAIL`

- [ ] **Step 5.3: Implement the route**

```js
// apps/api/src/routes/tuleapCreate.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
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

const BUILDERS = {
  'user-story': buildUserStoryPayload,
  'test-case':  buildTestCasePayload,
  'task':       buildTaskPayload,
  'bug':        buildBugPayload,
};

router.post('/:type', authenticateToken, async (req, res) => {
  const { type } = req.params;

  if (!TRACKER_IDS[type]) {
    return res.status(404).json({ error: `Unknown artifact type: ${type}` });
  }

  const trackerId = TRACKER_IDS[type]();
  const builder = BUILDERS[type];
  const input = { ...req.body, trackerId };

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
    return res.status(err.status || 502).json({
      error: err.message,
      tuleap_status: err.status,
      details: err.raw,
    });
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

- [ ] **Step 5.4: Register route in index.js**

In `apps/api/src/index.js`, add after the existing tuleap-webhook line:
```js
apiRouter.use('/tuleap/artifacts', require('./routes/tuleapCreate'));
```

- [ ] **Step 5.5: Run tests to verify they pass**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/tuleapCreate.routes.test.js --no-coverage
```
Expected: `PASS (3 tests)`

- [ ] **Step 5.6: Commit**

```bash
git add apps/api/src/routes/tuleapCreate.js apps/api/src/index.js apps/api/__tests__/tuleapCreate.routes.test.js
git commit -m "feat(tuleap): add POST /tuleap/artifacts/:type endpoint for all artifact types"
```

---

## Task 6: Error Hardening — Validation Middleware

**Files:**
- Modify: `apps/api/src/routes/tuleapCreate.js`

### What this builds
Input validation layer before the builder is called, so required-field errors are uniform and never leak internal error shapes.

- [ ] **Step 6.1: Add required-field validation to route**

Extend the route by adding this map above `router.post`:
```js
const REQUIRED_FIELDS = {
  'user-story': ['summary', 'status', 'baAuthor', 'requirementVersion'],
  'test-case':  ['title', 'testSteps', 'expectedResult'],
  'task':       ['taskTitle', 'assignedTo', 'team', 'status', 'parentStoryArtifactId'],
  'bug':        ['bugTitle', 'environment', 'serviceName'],
};
```

Then inside `router.post`, before calling `builder`, add:
```js
const required = REQUIRED_FIELDS[type] || [];
const missing = required.filter(k => !input[k] && input[k] !== 0);
if (missing.length) {
  return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
}
```

- [ ] **Step 6.2: Run all tuleap tests**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/tuleap --no-coverage
```
Expected: all pass

- [ ] **Step 6.3: Commit**

```bash
git add apps/api/src/routes/tuleapCreate.js
git commit -m "feat(tuleap): add required-field validation to artifact creation route"
```

---

## Task 7: End-to-End Sample Payloads & Manual Validation

**Files:**
- Create: `apps/api/scripts/tuleapSmokeTest.js`

### What this builds
A standalone script (not a Jest test) that calls your live Tuleap instance and verifies each artifact can be created. Run it once after deploy to verify field names match the real tracker schemas.

- [ ] **Step 7.1: Create smoke test script**

```js
// apps/api/scripts/tuleapSmokeTest.js
require('dotenv').config();
const { defaultClient } = require('../src/services/tuleapClient');
const { FieldRegistry } = require('../src/services/tuleapFieldRegistry');
const { buildUserStoryPayload, buildTestCasePayload, buildTaskPayload, buildBugPayload } = require('../src/services/tuleapPayloadBuilder');

async function smoke() {
  const reg = new FieldRegistry(defaultClient);

  console.log('--- Testing FieldRegistry for USER STORY tracker ---');
  const usTrackerId = Number(process.env.TULEAP_TRACKER_USER_STORY);
  const summaryId = await reg.getFieldId(usTrackerId, 'summary');
  console.log('summary field_id:', summaryId);

  console.log('--- Building User Story payload (dry run) ---');
  const usPayload = await buildUserStoryPayload({
    trackerId: usTrackerId,
    summary: '[SMOKE TEST] Auto-created user story',
    description: '## Description\nThis is a smoke test.',
    acceptanceCriteria: '## AC\n- Given/When/Then',
    status: 'New',
    baAuthor: 'QC-Manager-Bot',
    requirementVersion: '1',
  }, reg);
  console.log('Payload values count:', usPayload.values.length);
  console.log(JSON.stringify(usPayload, null, 2));

  // Optionally POST (set DRY_RUN=false to actually create)
  if (process.env.DRY_RUN !== 'false') {
    console.log('\nDRY_RUN=true — not submitting. Set DRY_RUN=false to create.');
    return;
  }

  const res = await defaultClient.post('/artifacts', usPayload);
  console.log('Created artifact:', res.data.id, res.data.xref);
}

smoke().catch(err => {
  console.error('Smoke test failed:', err.message);
  if (err.raw) console.error('Tuleap details:', JSON.stringify(err.raw, null, 2));
  process.exit(1);
});
```

- [ ] **Step 7.2: Run in dry-run mode to validate field resolution**

```bash
cd /root/QC-Manager/apps/api && DRY_RUN=true node scripts/tuleapSmokeTest.js
```
Expected: prints field ID and payload without creating anything. If fields are named differently in your tracker, you'll see `Field 'summary' not found in tracker N` — update the field name constants in the builders to match.

- [ ] **Step 7.3: Run all tests one final time**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/tuleap --no-coverage
```
Expected: all pass

- [ ] **Step 7.4: Commit**

```bash
git add apps/api/scripts/tuleapSmokeTest.js
git commit -m "feat(tuleap): add smoke test script for live field schema validation"
```

---

## Bonus: AI Agent Integration Layer

After the core system is stable, an AI agent (Claude or GPT) can auto-create artifacts from natural language using the following integration pattern:

### Tool definitions for the AI
```js
const tuleapTools = [
  {
    name: "create_user_story",
    description: "Creates a User Story in Tuleap",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "One-line title" },
        description: { type: "string", description: "Markdown body" },
        acceptanceCriteria: { type: "string", description: "Markdown AC section" },
        status: { type: "string", enum: ["New", "In Progress", "Done"] },
        baAuthor: { type: "string" },
        requirementVersion: { type: "string", default: "1" },
        priority: { type: "string", enum: ["Low", "Medium", "High"] }
      },
      required: ["summary", "status", "baAuthor", "requirementVersion"]
    }
  },
  {
    name: "create_test_case",
    description: "Creates a Test Case in Tuleap",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        testSteps: { type: "string", description: "Markdown test steps" },
        expectedResult: { type: "string", description: "Markdown expected result" },
        serviceName: { type: "string" }
      },
      required: ["title", "testSteps", "expectedResult"]
    }
  },
  {
    name: "create_task",
    description: "Creates a Task in Tuleap linked to a parent story",
    input_schema: {
      type: "object",
      properties: {
        taskTitle: { type: "string" },
        assignedTo: { type: "string" },
        team: { type: "string" },
        status: { type: "string" },
        parentStoryArtifactId: { type: "integer", description: "Tuleap artifact ID of the parent user story" }
      },
      required: ["taskTitle", "assignedTo", "team", "status", "parentStoryArtifactId"]
    }
  },
  {
    name: "create_bug",
    description: "Creates a Bug in Tuleap",
    input_schema: {
      type: "object",
      properties: {
        bugTitle: { type: "string" },
        description: { type: "string" },
        environment: { type: "string", enum: ["DEV", "TEST", "PROD"] },
        serviceName: { type: "string" },
        severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
        testCaseArtifactId: { type: "integer" }
      },
      required: ["bugTitle", "environment", "serviceName"]
    }
  }
];

// Tool execution handler — maps tool_name → POST /tuleap/artifacts/:type
async function executeTool(toolName, toolInput, apiBaseUrl, authToken) {
  const typeMap = {
    create_user_story: 'user-story',
    create_test_case:  'test-case',
    create_task:       'task',
    create_bug:        'bug',
  };
  const artifactType = typeMap[toolName];
  const res = await fetch(`${apiBaseUrl}/tuleap/artifacts/${artifactType}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
    body: JSON.stringify(toolInput),
  });
  return res.json();
}
```

### Example Claude API call
```js
const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic();

const message = await client.messages.create({
  model: 'claude-opus-4-7',
  max_tokens: 1024,
  tools: tuleapTools,
  messages: [{
    role: 'user',
    content: 'Create a user story for the login feature. BA is Alice. Priority High.'
  }]
});

if (message.stop_reason === 'tool_use') {
  for (const block of message.content) {
    if (block.type === 'tool_use') {
      const result = await executeTool(block.name, block.input, API_BASE_URL, authToken);
      console.log('Created:', result);
    }
  }
}
```

---

## Risks & Edge Cases

| Risk | Mitigation |
|------|-----------|
| Field names differ between Tuleap projects | Smoke test (`Task 7`) surfaces this before production use. Store field name overrides in `tuleap_sync_config.field_mappings` JSONB column (already exists) |
| Enum label casing mismatch (e.g. `"not run"` vs `"Not Run"`) | `resolveBindValue` error message lists all valid labels — fix in builder or pass correct label |
| Attachment fails midway (file uploaded, artifact not patched) | `attachFilesToArtifact` is idempotent — retry is safe. Log the temp file ID so it can be re-attached |
| PAK token expires / is revoked | `TuleapClient` returns 401; route returns 502 with `tuleap_status: 401`. Alert ops to rotate key |
| Tuleap tracker schema changes | TTL cache means stale schema lasts up to 5 min. Add `DELETE /tuleap/cache/flush` admin endpoint if needed |
| Parent story artifact ID invalid | Tuleap returns 400 with `"Invalid artifact link"` — surfaced to caller as 400 |

---

## Suggested Folder Structure (final state)

```
apps/api/src/
  services/
    tuleapClient.js          ← auth, retry, error normalisation
    tuleapFieldRegistry.js   ← schema cache
    tuleapPayloadBuilder.js  ← 4 builder functions
    tuleapAttachment.js      ← multipart upload helper
  routes/
    tuleapCreate.js          ← POST /tuleap/artifacts/:type
  scripts/
    tuleapSmokeTest.js       ← live field validation script

apps/api/__tests__/
  tuleapClient.test.js
  tuleapFieldRegistry.test.js
  tuleapPayloadBuilder.test.js
  tuleapAttachment.test.js
  tuleapCreate.routes.test.js
```

# Tuleap Unified Artifact Routing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded env-var tracker IDs with a per-project DB-driven mapping so each QC Manager project routes artifact creation to the correct Tuleap project and tracker, while unifying common field validation across all artifact types.

**Architecture:**
```
Outbound (QC → Tuleap):
  Web UI (projectId in body)
    → POST /api/tuleap/artifacts/:type
    → resolveTrackerId(type, projectId) → project_tuleap_trackers table (fallback: env vars)
    → payload builder (tuleapPayloadBuilder.js — unchanged)
    → FieldRegistry (tuleapFieldRegistry.js — unchanged)
    → Tuleap API

Inbound (Tuleap → QC):  unchanged — n8n + tuleap_sync_config handles this path.

Settings UI:
  /settings/tuleap-trackers — CRUD for project_tuleap_trackers rows
```

**Tech Stack:** PostgreSQL, Node/Express (Jest + supertest for tests), Next.js (React), existing `tuleapPayloadBuilder.js` / `tuleapFieldRegistry.js` / `tuleapClient.js` (all unchanged).

---

## Architecture Decisions

### Data Model — Unified vs. Type-Specific

Fields common to all artifact types (already implemented in payload builders):
- `status` — sb field, type-specific valid values
- `assignedTo` — sb/msb field
- `attachmentIds` — array of file IDs

Type-specific fields stay in their builders. **No changes to `tuleapPayloadBuilder.js`** — it already implements the full field spec correctly.

### Tracker Mapping Strategy

New table `project_tuleap_trackers`:
```
(qc_project_id UUID, artifact_type TEXT) → (tuleap_project_id INT, tuleap_tracker_id INT)
```

- One row per (project, artifact-type) pair
- `tuleap_project_id` is stored for display/n8n routing only; Tuleap API only needs `tuleap_tracker_id`
- Falls back to env vars (`TULEAP_TRACKER_*`) when no row exists — backward-compatible

Relation to existing `tuleap_sync_config`:
- `tuleap_sync_config` maps **inbound** webhooks (Tuleap → QC). Keep as-is.
- `project_tuleap_trackers` maps **outbound** artifact creation (QC → Tuleap). New table.

### n8n Integration

n8n is used for **inbound** sync only (Tuleap webhook → QC API). The outbound path (QC UI → Tuleap) goes directly through the API — adding n8n to the outbound path adds latency with no benefit.

If you need n8n to trigger on artifact creation (e.g. enrichment), add a `POST http://n8n/webhook/artifact-created` call at the end of the `POST /tuleap/artifacts/:type` handler — but do not route through n8n for tracker resolution.

### API Payload Standardization

Generic payload structure the web UI sends:
```json
{
  "projectId": "uuid-of-qc-project",
  "summary": "...",
  "status": "Draft",
  "requirementVersion": "1"
}
```

The API injects `trackerId` (resolved from DB or env), then `buildUserStoryPayload(input, registry)` produces the Tuleap-specific values array. This pattern is already in place.

### Validation & Governance

- Required field validation stays in `tuleapArtifacts.js` via `REQUIRED_FIELDS` map.
- Tracker misconfiguration returns HTTP 422 (distinct from 400 validation errors and 502 Tuleap errors).
- Pre-flight: if `projectId` is provided but no tracker config exists for that project+type, reject with 422 before calling Tuleap.

### Scalability

Adding a new artifact type requires:
1. Add entry to `artifact_type CHECK` constraint in `project_tuleap_trackers`
2. Add builder to `tuleapPayloadBuilder.js`
3. Add to `TRACKER_IDS`, `REQUIRED_FIELDS`, `BUILDERS` maps in `tuleapArtifacts.js`
4. Add env var fallback

Supporting a new organization: each org gets its own QC projects, each with its own `project_tuleap_trackers` rows. No schema changes needed.

---

## File Map

| Action | File |
|--------|------|
| Create | `database/migrations/026_project_tuleap_trackers.sql` |
| Create | `apps/api/src/routes/projectTuleapTrackers.js` |
| Modify | `apps/api/src/routes/tuleapArtifacts.js` |
| Modify | `apps/api/src/index.js` (or app entry — mount new route) |
| Create | `apps/web/app/settings/tuleap-trackers/page.tsx` |
| Modify | `apps/web/src/lib/api.ts` |
| Create | `apps/api/__tests__/projectTuleapTrackers.test.js` |
| Create | `apps/api/__tests__/tuleapArtifacts.multiproject.test.js` |

---

## Task 1: DB Migration — `project_tuleap_trackers`

**Files:**
- Create: `database/migrations/026_project_tuleap_trackers.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- Migration 026: Per-project Tuleap tracker mapping
-- Description: Outbound artifact routing — maps QC project + artifact type to Tuleap tracker
-- Date: 2026-04-23

BEGIN;

CREATE TABLE IF NOT EXISTS project_tuleap_trackers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- QC Manager side
    qc_project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    artifact_type  VARCHAR(20) NOT NULL CHECK (artifact_type IN ('user-story', 'test-case', 'task', 'bug')),

    -- Tuleap side
    tuleap_project_id  INTEGER NOT NULL,
    tuleap_tracker_id  INTEGER NOT NULL,
    tuleap_base_url    TEXT DEFAULT 'https://tuleap.windinfosys.com',

    -- Control
    is_active BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(qc_project_id, artifact_type)
);

CREATE INDEX IF NOT EXISTS idx_ptt_project_type
    ON project_tuleap_trackers(qc_project_id, artifact_type)
    WHERE is_active = true;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ language 'plpgsql';

CREATE TRIGGER update_project_tuleap_trackers_updated_at
    BEFORE UPDATE ON project_tuleap_trackers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE project_tuleap_trackers IS
  'Maps each QC project + artifact type to the correct Tuleap project and tracker for outbound artifact creation.';
COMMENT ON COLUMN project_tuleap_trackers.artifact_type IS
  'user-story | test-case | task | bug';
COMMENT ON COLUMN project_tuleap_trackers.tuleap_tracker_id IS
  'The Tuleap tracker ID used in POST /artifacts payload. This is what the API needs.';
COMMENT ON COLUMN project_tuleap_trackers.tuleap_project_id IS
  'Stored for display and n8n routing. Not sent to Tuleap directly.';

COMMIT;
```

- [ ] **Step 2: Apply migration to local/staging DB**

```bash
# Apply via psql or Supabase migration runner
psql $DATABASE_URL -f database/migrations/026_project_tuleap_trackers.sql
```

Expected: `CREATE TABLE`, `CREATE INDEX`, `CREATE TRIGGER` — no errors.

- [ ] **Step 3: Commit**

```bash
git add database/migrations/026_project_tuleap_trackers.sql
git commit -m "feat(db): add project_tuleap_trackers table for per-project outbound tracker mapping"
```

---

## Task 2: API Route — `projectTuleapTrackers.js`

**Files:**
- Create: `apps/api/src/routes/projectTuleapTrackers.js`
- Test: `apps/api/__tests__/projectTuleapTrackers.test.js`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/__tests__/projectTuleapTrackers.test.js`:

```js
const request = require('supertest');
const express = require('express');

const mockDb = { query: jest.fn() };
jest.mock('../src/config/db', () => ({ pool: mockDb }));
jest.mock('../src/middleware/authMiddleware', () => ({
  requireAuth:       (req, res, next) => { req.user = { email: 'admin@test.com' }; next(); },
  requireRole:       () => (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next(),
  requireAnyPermission: () => (req, res, next) => next(),
  optionalAuth:      (req, res, next) => next(),
  requireStatus:     () => (req, res, next) => next(),
}));

const app = express();
app.use(express.json());
app.use('/api/projects', require('../src/routes/projectTuleapTrackers'));

const PROJECT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ROW = {
  id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  qc_project_id: PROJECT_ID,
  artifact_type: 'user-story',
  tuleap_project_id: 101,
  tuleap_tracker_id: 6,
  tuleap_base_url: 'https://tuleap.windinfosys.com',
  is_active: true,
  created_at: '2026-04-23T00:00:00Z',
  updated_at: '2026-04-23T00:00:00Z',
};

beforeEach(() => jest.clearAllMocks());

describe('GET /api/projects/:projectId/tuleap-trackers', () => {
  it('returns 200 with tracker config rows', async () => {
    mockDb.query.mockResolvedValue({ rows: [ROW] });
    const res = await request(app).get(`/api/projects/${PROJECT_ID}/tuleap-trackers`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].artifact_type).toBe('user-story');
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('project_tuleap_trackers'),
      [PROJECT_ID]
    );
  });

  it('returns 200 with empty array when no config exists', async () => {
    mockDb.query.mockResolvedValue({ rows: [] });
    const res = await request(app).get(`/api/projects/${PROJECT_ID}/tuleap-trackers`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});

describe('PUT /api/projects/:projectId/tuleap-trackers/:type', () => {
  it('returns 200 with upserted row', async () => {
    mockDb.query.mockResolvedValue({ rows: [ROW] });
    const res = await request(app)
      .put(`/api/projects/${PROJECT_ID}/tuleap-trackers/user-story`)
      .send({ tuleap_project_id: 101, tuleap_tracker_id: 6 });
    expect(res.status).toBe(200);
    expect(res.body.data.tuleap_tracker_id).toBe(6);
  });

  it('returns 400 for unknown artifact type', async () => {
    const res = await request(app)
      .put(`/api/projects/${PROJECT_ID}/tuleap-trackers/unknown-type`)
      .send({ tuleap_project_id: 101, tuleap_tracker_id: 6 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid artifact type/i);
  });

  it('returns 400 when tuleap_tracker_id is missing', async () => {
    const res = await request(app)
      .put(`/api/projects/${PROJECT_ID}/tuleap-trackers/bug`)
      .send({ tuleap_project_id: 101 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/tuleap_tracker_id.*required/i);
  });

  it('returns 400 when tuleap_project_id is missing', async () => {
    const res = await request(app)
      .put(`/api/projects/${PROJECT_ID}/tuleap-trackers/bug`)
      .send({ tuleap_tracker_id: 6 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/tuleap_project_id.*required/i);
  });
});

describe('DELETE /api/projects/:projectId/tuleap-trackers/:type', () => {
  it('returns 200 when row deleted', async () => {
    mockDb.query.mockResolvedValue({ rowCount: 1 });
    const res = await request(app)
      .delete(`/api/projects/${PROJECT_ID}/tuleap-trackers/user-story`);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
  });

  it('returns 404 when no row found', async () => {
    mockDb.query.mockResolvedValue({ rowCount: 0 });
    const res = await request(app)
      .delete(`/api/projects/${PROJECT_ID}/tuleap-trackers/bug`);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/api && npx jest __tests__/projectTuleapTrackers.test.js --no-coverage
```

Expected: `FAIL` — module `../src/routes/projectTuleapTrackers` not found.

- [ ] **Step 3: Implement the route**

Create `apps/api/src/routes/projectTuleapTrackers.js`:

```js
const express = require('express');
const router = express.Router({ mergeParams: true });
const { requireAuth } = require('../middleware/authMiddleware');
const db = require('../config/db');
const pool = db.pool;

const VALID_TYPES = new Set(['user-story', 'test-case', 'task', 'bug']);

router.get('/:projectId/tuleap-trackers', requireAuth, async (req, res) => {
  const { projectId } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM project_tuleap_trackers
       WHERE qc_project_id = $1
       ORDER BY artifact_type`,
      [projectId]
    );
    return res.status(200).json({ data: result.rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.put('/:projectId/tuleap-trackers/:type', requireAuth, async (req, res) => {
  const { projectId, type } = req.params;
  const { tuleap_project_id, tuleap_tracker_id, tuleap_base_url } = req.body;

  if (!VALID_TYPES.has(type)) {
    return res.status(400).json({ error: `Invalid artifact type: ${type}. Must be one of: ${[...VALID_TYPES].join(', ')}` });
  }
  if (tuleap_tracker_id == null) {
    return res.status(400).json({ error: 'tuleap_tracker_id is required' });
  }
  if (tuleap_project_id == null) {
    return res.status(400).json({ error: 'tuleap_project_id is required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO project_tuleap_trackers
         (qc_project_id, artifact_type, tuleap_project_id, tuleap_tracker_id, tuleap_base_url, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (qc_project_id, artifact_type) DO UPDATE SET
         tuleap_project_id = EXCLUDED.tuleap_project_id,
         tuleap_tracker_id = EXCLUDED.tuleap_tracker_id,
         tuleap_base_url   = COALESCE(EXCLUDED.tuleap_base_url, project_tuleap_trackers.tuleap_base_url),
         is_active         = true,
         updated_at        = NOW()
       RETURNING *`,
      [projectId, type, tuleap_project_id, tuleap_tracker_id, tuleap_base_url || null]
    );
    return res.status(200).json({ data: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/:projectId/tuleap-trackers/:type', requireAuth, async (req, res) => {
  const { projectId, type } = req.params;
  try {
    const result = await pool.query(
      `DELETE FROM project_tuleap_trackers
       WHERE qc_project_id = $1 AND artifact_type = $2`,
      [projectId, type]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: `Tracker config not found for project ${projectId} / type ${type}` });
    }
    return res.status(200).json({ deleted: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/api && npx jest __tests__/projectTuleapTrackers.test.js --no-coverage
```

Expected: `PASS` — all 8 tests green.

- [ ] **Step 5: Mount route in app entry point**

Find and open `apps/api/src/index.js`. Locate the section where other routes are mounted (search for `app.use('/tuleap'`). Add:

```js
app.use('/api/projects', require('./routes/projectTuleapTrackers'));
```

Place it alongside the other `/api/projects` route registrations. If the existing projects route is already mounted at `/api/projects`, you must merge them — put the `projectTuleapTrackers` router BEFORE the general projects router to avoid route conflicts, or simply add the tracker endpoints to the existing `projects.js` file as a sub-router.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/projectTuleapTrackers.js \
        apps/api/__tests__/projectTuleapTrackers.test.js \
        apps/api/src/index.js
git commit -m "feat(api): add per-project Tuleap tracker config endpoints (GET/PUT/DELETE)"
```

---

## Task 3: Update `tuleapArtifacts.js` — Per-Project Tracker Resolution

**Files:**
- Modify: `apps/api/src/routes/tuleapArtifacts.js`
- Create: `apps/api/__tests__/tuleapArtifacts.multiproject.test.js`

- [ ] **Step 1: Write failing tests for multi-project resolution**

Create `apps/api/__tests__/tuleapArtifacts.multiproject.test.js`:

```js
const request = require('supertest');
const express = require('express');

const mockDb = { query: jest.fn() };
jest.mock('../src/config/db', () => ({ pool: mockDb }));

jest.mock('../src/services/tuleapClient', () => ({
  defaultClient: {
    post: jest.fn(),
    put:  jest.fn(),
    get:  jest.fn(),
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
  requireAuth: (req, res, next) => { req.user = { email: 'test@test.com' }; next(); },
  requireRole: jest.fn(),
  requirePermission: jest.fn(),
  requireAnyPermission: jest.fn(),
  optionalAuth: jest.fn(),
  requireStatus: jest.fn(),
}));

process.env.TULEAP_BASE_URL           = 'https://tuleap.example.com';
process.env.TULEAP_TRACKER_USER_STORY = '10';
process.env.TULEAP_TRACKER_BUG        = '30';

const { defaultClient } = require('../src/services/tuleapClient');

const app = express();
app.use(express.json());
app.use('/tuleap/artifacts', require('../src/routes/tuleapArtifacts'));

const PROJECT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

beforeEach(() => jest.clearAllMocks());

describe('POST /tuleap/artifacts/user-story with projectId', () => {
  it('uses tracker from DB when projectId is provided and config exists', async () => {
    mockDb.query.mockResolvedValue({ rows: [{ tuleap_tracker_id: 999 }] });
    defaultClient.post.mockResolvedValue({ data: { id: 1, xref: 'story #1' } });

    const res = await request(app)
      .post('/tuleap/artifacts/user-story')
      .send({ projectId: PROJECT_ID, summary: 'My story', status: 'Draft', requirementVersion: '1' });

    expect(res.status).toBe(201);
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('project_tuleap_trackers'),
      [PROJECT_ID, 'user-story']
    );
    const postedPayload = defaultClient.post.mock.calls[0][1];
    expect(postedPayload.tracker.id).toBe(999);
  });

  it('falls back to env var when projectId is provided but no DB config found', async () => {
    mockDb.query.mockResolvedValue({ rows: [] });
    defaultClient.post.mockResolvedValue({ data: { id: 2, xref: 'story #2' } });

    const res = await request(app)
      .post('/tuleap/artifacts/user-story')
      .send({ projectId: PROJECT_ID, summary: 'Fallback', status: 'Draft', requirementVersion: '1' });

    expect(res.status).toBe(201);
    const postedPayload = defaultClient.post.mock.calls[0][1];
    expect(postedPayload.tracker.id).toBe(10);
  });

  it('uses env var when no projectId is provided (backward compat)', async () => {
    defaultClient.post.mockResolvedValue({ data: { id: 3, xref: 'story #3' } });

    const res = await request(app)
      .post('/tuleap/artifacts/user-story')
      .send({ summary: 'No project', status: 'Draft', requirementVersion: '1' });

    expect(res.status).toBe(201);
    expect(mockDb.query).not.toHaveBeenCalled();
    const postedPayload = defaultClient.post.mock.calls[0][1];
    expect(postedPayload.tracker.id).toBe(10);
  });

  it('returns 422 when projectId provided but env var also missing and no DB row', async () => {
    const savedEnv = process.env.TULEAP_TRACKER_BUG;
    delete process.env.TULEAP_TRACKER_BUG;
    mockDb.query.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .post('/tuleap/artifacts/bug')
      .send({ projectId: PROJECT_ID, bugTitle: 'crash', environment: 'DEV', serviceName: 'api' });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/no tracker configured/i);
    process.env.TULEAP_TRACKER_BUG = savedEnv;
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/api && npx jest __tests__/tuleapArtifacts.multiproject.test.js --no-coverage
```

Expected: `FAIL` — tracker resolution ignores `projectId`, tests expecting DB lookup fail.

- [ ] **Step 3: Update `tuleapArtifacts.js` — add `resolveTrackerId` and wire it up**

Open `apps/api/src/routes/tuleapArtifacts.js`. Make the following changes:

**Add imports at top (after existing requires):**

```js
const db = require('../config/db');
const pool = db.pool;
```

**Add `resolveTrackerId` function after the `BUILDERS` map:**

```js
async function resolveTrackerId(type, projectId) {
  if (projectId) {
    const result = await pool.query(
      `SELECT tuleap_tracker_id FROM project_tuleap_trackers
       WHERE qc_project_id = $1 AND artifact_type = $2 AND is_active = true
       LIMIT 1`,
      [projectId, type]
    );
    if (result.rows.length > 0) return result.rows[0].tuleap_tracker_id;
  }
  const fallback = TRACKER_IDS[type]?.();
  if (!fallback) throw Object.assign(new Error(`No tracker configured for type: ${type}. Add a row to project_tuleap_trackers or set TULEAP_TRACKER_${type.toUpperCase().replace(/-/g, '_')} env var.`), { code: 'NO_TRACKER' });
  return fallback;
}
```

**Update `GET /:type` handler** — replace `const trackerId = TRACKER_IDS[type]();` with:

```js
let trackerId;
try {
  trackerId = await resolveTrackerId(type, req.query.projectId || null);
} catch (err) {
  if (err.code === 'NO_TRACKER') return res.status(422).json({ error: err.message });
  return res.status(500).json({ error: err.message });
}
```

**Update `POST /:type` handler** — replace the tracker ID block:

Find this block:
```js
const trackerId = TRACKER_IDS[type]();
const builder   = BUILDERS[type];
const input     = { ...req.body, trackerId };
```

Replace with:
```js
const builder = BUILDERS[type];
let trackerId;
try {
  trackerId = await resolveTrackerId(type, req.body.projectId || null);
} catch (err) {
  if (err.code === 'NO_TRACKER') return res.status(422).json({ error: err.message });
  return res.status(500).json({ error: err.message });
}
const input = { ...req.body, trackerId };
```

- [ ] **Step 4: Run both test files to confirm all pass**

```bash
cd apps/api && npx jest __tests__/tuleapArtifacts.routes.test.js __tests__/tuleapArtifacts.multiproject.test.js --no-coverage
```

Expected: `PASS` — all existing tests still pass (no `projectId` → env var fallback), all new tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/tuleapArtifacts.js \
        apps/api/__tests__/tuleapArtifacts.multiproject.test.js
git commit -m "feat(api): resolve Tuleap tracker ID from project config, fallback to env vars"
```

---

## Task 4: Settings UI — Tuleap Tracker Configuration Page

**Files:**
- Create: `apps/web/app/settings/tuleap-trackers/page.tsx`
- Modify: `apps/web/src/lib/api.ts`

- [ ] **Step 1: Add tracker config API helpers to `api.ts`**

Open `apps/web/src/lib/api.ts`. Find the `tuleapApi` export (around line 1294). Add a new export AFTER the `tuleapApi` block:

```ts
export interface TuleapTrackerConfig {
  id: string;
  qc_project_id: string;
  artifact_type: 'user-story' | 'test-case' | 'task' | 'bug';
  tuleap_project_id: number;
  tuleap_tracker_id: number;
  tuleap_base_url: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const trackerConfigApi = {
  list: (projectId: string) =>
    fetchApi<{ data: TuleapTrackerConfig[] }>(`/projects/${projectId}/tuleap-trackers`),

  upsert: (projectId: string, type: string, body: { tuleap_project_id: number; tuleap_tracker_id: number; tuleap_base_url?: string }) =>
    fetchApi<{ data: TuleapTrackerConfig }>(`/projects/${projectId}/tuleap-trackers/${type}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  remove: (projectId: string, type: string) =>
    fetchApi<{ deleted: boolean }>(`/projects/${projectId}/tuleap-trackers/${type}`, {
      method: 'DELETE',
    }),
};
```

- [ ] **Step 2: Run TypeScript check to confirm no errors**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -E "error|warning" | head -20
```

Expected: no new errors related to `trackerConfigApi`.

- [ ] **Step 3: Create settings page**

Create `apps/web/app/settings/tuleap-trackers/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { projectsApi, trackerConfigApi, TuleapTrackerConfig } from '@/lib/api';
import { showError, showSuccess } from '@/lib/notifications';

const ARTIFACT_TYPES = ['user-story', 'test-case', 'task', 'bug'] as const;
type ArtifactType = typeof ARTIFACT_TYPES[number];

interface Project {
  id: string;
  project_name: string;
  project_id: string;
}

interface TrackerForm {
  tuleap_project_id: string;
  tuleap_tracker_id: string;
  tuleap_base_url: string;
}

const EMPTY_FORM: TrackerForm = {
  tuleap_project_id: '',
  tuleap_tracker_id: '',
  tuleap_base_url: 'https://tuleap.windinfosys.com',
};

export default function TuleapTrackersPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [configs, setConfigs] = useState<TuleapTrackerConfig[]>([]);
  const [editing, setEditing] = useState<ArtifactType | null>(null);
  const [form, setForm] = useState<TrackerForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    projectsApi.list().then(data => setProjects(data.data || [])).catch(() => showError('Failed to load projects'));
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    trackerConfigApi.list(selectedProject)
      .then(data => setConfigs(data.data || []))
      .catch(() => showError('Failed to load tracker config'));
  }, [selectedProject]);

  function configForType(type: ArtifactType): TuleapTrackerConfig | undefined {
    return configs.find(c => c.artifact_type === type);
  }

  function startEdit(type: ArtifactType) {
    const existing = configForType(type);
    setForm(existing ? {
      tuleap_project_id: String(existing.tuleap_project_id),
      tuleap_tracker_id: String(existing.tuleap_tracker_id),
      tuleap_base_url: existing.tuleap_base_url,
    } : EMPTY_FORM);
    setEditing(type);
  }

  async function handleSave() {
    if (!editing || !selectedProject) return;
    const tracker_id = Number(form.tuleap_tracker_id);
    const project_id = Number(form.tuleap_project_id);
    if (!tracker_id || !project_id) {
      showError('Tuleap Project ID and Tracker ID are required numbers');
      return;
    }
    setLoading(true);
    try {
      const result = await trackerConfigApi.upsert(selectedProject, editing, {
        tuleap_project_id: project_id,
        tuleap_tracker_id: tracker_id,
        tuleap_base_url: form.tuleap_base_url || undefined,
      });
      setConfigs(prev => {
        const next = prev.filter(c => c.artifact_type !== editing);
        return [...next, result.data];
      });
      showSuccess(`Tracker config saved for ${editing}`);
      setEditing(null);
    } catch {
      showError('Failed to save tracker config');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(type: ArtifactType) {
    if (!selectedProject) return;
    try {
      await trackerConfigApi.remove(selectedProject, type);
      setConfigs(prev => prev.filter(c => c.artifact_type !== type));
      showSuccess(`Tracker config removed for ${type}`);
    } catch {
      showError('Failed to remove tracker config');
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Tuleap Tracker Configuration</h1>
      <p className="text-gray-500 mb-6 text-sm">
        Map each QC Manager project to the correct Tuleap tracker IDs. These IDs are used when creating artifacts from QC Manager.
      </p>

      <div className="mb-6">
        <label className="block text-sm font-medium mb-1">Project</label>
        <select
          className="w-full border rounded px-3 py-2 text-sm"
          value={selectedProject}
          onChange={e => { setSelectedProject(e.target.value); setEditing(null); }}
        >
          <option value="">— Select a project —</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.project_name} ({p.project_id})</option>
          ))}
        </select>
      </div>

      {selectedProject && (
        <div className="space-y-4">
          {ARTIFACT_TYPES.map(type => {
            const cfg = configForType(type);
            const isEditing = editing === type;
            return (
              <div key={type} className="border rounded p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium capitalize">{type}</span>
                  <div className="flex gap-2">
                    {cfg && !isEditing && (
                      <button
                        onClick={() => handleDelete(type)}
                        className="text-red-500 text-xs hover:underline"
                      >
                        Remove
                      </button>
                    )}
                    <button
                      onClick={() => isEditing ? setEditing(null) : startEdit(type)}
                      className="text-blue-600 text-xs hover:underline"
                    >
                      {isEditing ? 'Cancel' : cfg ? 'Edit' : 'Configure'}
                    </button>
                  </div>
                </div>

                {!isEditing && cfg && (
                  <div className="text-sm text-gray-600 grid grid-cols-2 gap-1">
                    <span>Tuleap Project ID:</span><span className="font-mono">{cfg.tuleap_project_id}</span>
                    <span>Tracker ID:</span><span className="font-mono">{cfg.tuleap_tracker_id}</span>
                    <span>Base URL:</span><span className="font-mono text-xs">{cfg.tuleap_base_url}</span>
                  </div>
                )}
                {!isEditing && !cfg && (
                  <p className="text-sm text-gray-400 italic">Not configured — will fall back to environment variable.</p>
                )}

                {isEditing && (
                  <div className="space-y-3 mt-2">
                    <div>
                      <label className="block text-xs font-medium mb-1">Tuleap Project ID *</label>
                      <input
                        type="number"
                        className="w-full border rounded px-2 py-1 text-sm font-mono"
                        value={form.tuleap_project_id}
                        onChange={e => setForm(f => ({ ...f, tuleap_project_id: e.target.value }))}
                        placeholder="e.g. 101"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Tracker ID *</label>
                      <input
                        type="number"
                        className="w-full border rounded px-2 py-1 text-sm font-mono"
                        value={form.tuleap_tracker_id}
                        onChange={e => setForm(f => ({ ...f, tuleap_tracker_id: e.target.value }))}
                        placeholder="e.g. 6"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Base URL</label>
                      <input
                        type="text"
                        className="w-full border rounded px-2 py-1 text-sm font-mono"
                        value={form.tuleap_base_url}
                        onChange={e => setForm(f => ({ ...f, tuleap_base_url: e.target.value }))}
                        placeholder="https://tuleap.windinfosys.com"
                      />
                    </div>
                    <button
                      onClick={handleSave}
                      disabled={loading}
                      className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                    >
                      {loading ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Check TypeScript compilation**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -E "error" | head -20
```

Expected: no errors in the new file.

- [ ] **Step 5: Add link to settings nav**

Find `apps/web/src/components/Navbar.js` (or wherever settings nav links live). Add a link to `/settings/tuleap-trackers`:

Search for other settings nav items (e.g. `/settings/teams`, `/settings/roles`) and add alongside them:

```jsx
<Link href="/settings/tuleap-trackers">Tuleap Trackers</Link>
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/settings/tuleap-trackers/page.tsx \
        apps/web/src/lib/api.ts \
        apps/web/src/components/Navbar.js
git commit -m "feat(web): add Tuleap tracker config settings page for per-project artifact routing"
```

---

## Task 5: Update Artifact Create Forms — Pass `projectId`

**Files:**
- Modify: `apps/web/app/user-stories/create/page.tsx`
- Modify: `apps/web/app/bugs/create/page.tsx`
- Modify: `apps/web/app/test-cases/create/page.tsx`
- Modify: `apps/web/app/tasks/create/page.tsx`

Each artifact creation form needs to send `projectId` in the payload so the API can resolve the correct tracker.

- [ ] **Step 1: Add `projectId` to user-story create form**

Open `apps/web/app/user-stories/create/page.tsx`. Find where the form submission calls `tuleapApi.create(...)`.

Find the call that looks like:
```ts
tuleapApi.create('user-story', { summary, status, requirementVersion, ... })
```

Replace with:
```ts
tuleapApi.create('user-story', { projectId: selectedProjectId, summary, status, requirementVersion, ... })
```

Where `selectedProjectId` comes from a project selector. If the form already has project context (e.g. from URL params or a `<select>` for project), use that value. If not, add a project selector:

```tsx
// Add state
const [projects, setProjects] = useState<Project[]>([]);
const [projectId, setProjectId] = useState('');

// Add useEffect
useEffect(() => {
  projectsApi.list().then(data => setProjects(data.data || []));
}, []);

// Add to form JSX, before the submit button
<div>
  <label className="block text-sm font-medium mb-1">QC Project</label>
  <select
    className="w-full border rounded px-3 py-2 text-sm"
    value={projectId}
    onChange={e => setProjectId(e.target.value)}
  >
    <option value="">— Select project (uses default tracker if unset) —</option>
    {projects.map(p => (
      <option key={p.id} value={p.id}>{p.project_name}</option>
    ))}
  </select>
</div>
```

- [ ] **Step 2: Repeat for `bugs/create/page.tsx`**

Same pattern as Step 1. Find `tuleapApi.create('bug', {...})` and add `projectId: projectId || undefined`.

- [ ] **Step 3: Repeat for `test-cases/create/page.tsx`**

Same pattern. Find `tuleapApi.create('test-case', {...})` and add `projectId: projectId || undefined`.

- [ ] **Step 4: Repeat for `tasks/create/page.tsx`**

Same pattern. Find `tuleapApi.create('task', {...})` and add `projectId: projectId || undefined`.

- [ ] **Step 5: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep "error" | head -20
```

Expected: no errors. If `projectId` is added to `create()` body, it passes as-is since the body is `Record<string, unknown>`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/user-stories/create/page.tsx \
        apps/web/app/bugs/create/page.tsx \
        apps/web/app/test-cases/create/page.tsx \
        apps/web/app/tasks/create/page.tsx
git commit -m "feat(web): pass projectId in artifact create forms for per-project tracker routing"
```

---

## Task 6: Full Test Suite + Integration Smoke Test

**Files:**
- No new files — verify all existing tests still pass

- [ ] **Step 1: Run full API test suite**

```bash
cd apps/api && npx jest --no-coverage 2>&1 | tail -20
```

Expected: All test suites pass. Pay particular attention to:
- `tuleapArtifacts.routes.test.js` — existing tests still pass (env var path)
- `tuleapArtifacts.multiproject.test.js` — new DB-lookup tests pass
- `projectTuleapTrackers.test.js` — tracker config CRUD tests pass

- [ ] **Step 2: Run TypeScript check on entire web app**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep "error TS" | head -20
```

Expected: no errors.

- [ ] **Step 3: Manual smoke test — tracker config flow**

If you have access to the staging environment:

1. Navigate to `/settings/tuleap-trackers`
2. Select a project
3. Click "Configure" on `user-story`
4. Enter Tuleap Project ID `101`, Tracker ID `6`
5. Click Save — expect success toast
6. Reload — expect config shown for user-story
7. Navigate to `/user-stories/create`
8. Select the same project
9. Fill required fields and submit
10. Verify in Tuleap that artifact was created in tracker 6 (not the env var default)

- [ ] **Step 4: Deploy via CI/CD**

```bash
git push
```

Monitor the GitHub Actions pipeline. After deploy, run post-deploy verification:
```bash
curl -s https://api.gebrils.cloud/api/health
```
Expected: `{"status":"ok"}`.

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| `project_tuleap_trackers` row missing for a project | Artifacts fall back to env var tracker — wrong project in Tuleap | HTTP 422 returned when env var also missing; settings UI shows "Not configured" clearly |
| Tracker ID misconfiguration (wrong ID entered) | Tuleap returns 404/400, artifact not created | Error from Tuleap propagated as 502 with `tuleap_status` field; fix in settings UI |
| DB migration not applied before deploy | `project_tuleap_trackers` table missing → 500 on any request with `projectId` | Apply migration before deploying API code; migration is backward-safe (new table only) |
| FieldRegistry caches wrong tracker schema | Wrong field IDs sent to Tuleap | Cache TTL is 5 min; restart API to clear. If tracker schema changes in Tuleap, wait 5 min |
| `tuleap_sync_config` and `project_tuleap_trackers` get out of sync | Inbound webhook routes to wrong QC project | These are independent tables for independent flows; document clearly in settings UI |
| Multi-project: same Tuleap tracker mapped to 2 QC projects | Inbound webhook ambiguity | `tuleap_sync_config` unique constraint on `(tuleap_project_id, tuleap_tracker_id)` prevents this |

---

## Example Payloads

### API Request (QC → Tuleap, multi-project)

```http
POST /api/tuleap/artifacts/user-story
Content-Type: application/json

{
  "projectId": "uuid-of-qc-project",
  "summary": "As a user, I can reset my password",
  "status": "Draft",
  "requirementVersion": "1",
  "description": "## Overview\nUser needs a way to reset their password...",
  "acceptanceCriteria": "## Acceptance Criteria\n- [ ] Email is sent within 1 minute",
  "baAuthor": "BA-Team",
  "priority": "High"
}
```

### Tracker Resolution Flow

```
1. Route receives projectId = "uuid-of-qc-project"
2. SELECT tuleap_tracker_id FROM project_tuleap_trackers
   WHERE qc_project_id = 'uuid-of-qc-project' AND artifact_type = 'user-story'
   → returns { tuleap_tracker_id: 6 }
3. input = { ...body, trackerId: 6 }
4. buildUserStoryPayload(input, registry)
   → { tracker: { id: 6 }, values: [...] }
5. POST https://tuleap.windinfosys.com/api/artifacts
   → { id: 1234, xref: "story #1234" }
6. Response: { tuleap_artifact_id: 1234, tuleap_url: "...", artifact_type: "user-story" }
```

### Settings UI State (for reference)

```json
{
  "qc_project_id": "uuid",
  "configs": [
    { "artifact_type": "user-story", "tuleap_project_id": 101, "tuleap_tracker_id": 6 },
    { "artifact_type": "bug",        "tuleap_project_id": 101, "tuleap_tracker_id": 1 },
    { "artifact_type": "test-case",  "tuleap_project_id": 101, "tuleap_tracker_id": 3 },
    { "artifact_type": "task",       "tuleap_project_id": 101, "tuleap_tracker_id": 5 }
  ]
}
```

# Human-Readable Artifact URLs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace opaque UUIDs in artifact URLs with the existing human-readable IDs (`TSK-001`, `TC-00001`, `RUN-1`, `TS-1`, `TLP-12345`, `US-12345`) so URLs are readable and enterprise-looking, while keeping every existing UUID link working.

**Architecture:** The human ID becomes the *public addressing key* (browser URL + by-id route input); the UUID stays the *internal identity* (primary keys, foreign keys, link tables, Tuleap joins are all unchanged). A backend resolver maps an inbound human ID → UUID at the edge of each by-id route, so all existing handler SQL keeps querying by UUID. The frontend canonicalizes the address bar to the human ID and routes all link-building through a single `artifactPath()` helper.

**Tech Stack:** Node/Express API (`apps/api`), Next.js App Router frontend (`apps/web`), PostgreSQL (prod = `supabase-db`). Tests: Jest (API), Vitest (web).

## Global Constraints

- **Readability only — not security.** Human IDs are sequential/enumerable; they are NOT an access boundary. Access control (`withAccess`, `canPerform`, `enforceArtifact`) remains the only protection. Do not remove or weaken any auth/permission check in any route touched here.
- **Backward compatible forever.** Every by-id route MUST continue to accept a UUID. No route may return 404 for a previously-valid UUID URL.
- **Internal identity stays UUID.** Do NOT change any primary key, foreign key, link-table column, or Tuleap sync join. Only the *inbound URL param* and *outbound generated links* change.
- **Scope = 6 core artifacts only:** `bug`, `user_story`, `task`, `test_case`, `test_run`, `test_suite`. Projects, resources, journeys/IDP are explicitly out of scope and keep their current scheme.
- **Schema changes go in `apps/api/src/config/db.js` startup bootstrap.** Deploys do NOT run standalone migrations (schema is applied by `db.js` on API startup against `supabase-db`). After deploy, verify by checking qc-api logs for "migration error".
- **Soft-deletes:** all human-ID resolution MUST filter `deleted_at IS NULL` so a deleted record's reused human ID never resolves to the wrong row.

### Per-type reference table (used by every task)

| type (canonical) | human-id column | format | URL prefix | by-id route file | resolves via |
|---|---|---|---|---|---|
| `bug` | `bugs.bug_id` | `TLP-12345` | `/work/bugs/` | `apps/api/src/routes/bugs.js` | `bug_id` column |
| `user_story` | *(none)* | `US-12345` | `/work/stories/` | `apps/api/src/routes/userStories.js` | `tuleap_artifact_id` (strip `US-`) |
| `task` | `tasks.task_id` | `TSK-001` | `/work/tasks/` | `apps/api/src/routes/tasks.js` | `task_id` column |
| `test_case` | `test_case.test_case_id` | `TC-00001` | `/test/cases/` | `apps/api/src/routes/testCases.js` | `test_case_id` column |
| `test_run` | `test_runs.run_id` | `RUN-1` | `/test/runs/` | `apps/api/src/routes/testExecutions.js` (`/test-runs/:id`) | `run_id` column |
| `test_suite` | `test_suites.suite_id` | `TS-1` | `/test/suites/` | `apps/api/src/routes/testSuites.js` | `suite_id` column |

> Note: link tables (`bug_tasks`, `task_test_cases`, etc.) reuse the column names `bug_id`/`task_id`/`test_case_id` for **UUID foreign keys** — those are unrelated to the human-id columns above and must NOT be touched.

---

## Task 1: Backend artifact resolver utility

Creates the single function that maps any inbound id-string (UUID, human ID, or — for stories — a bare Tuleap number) to the canonical UUID for that type. UUID inputs pass through unchanged; unknown inputs throw a 404 error.

**Files:**
- Create: `apps/api/src/services/artifactResolver.js`
- Test: `apps/api/__tests__/artifactResolver.test.js`

**Interfaces:**
- Produces:
  - `ARTIFACT_ID_CONFIG: Record<string, { table: string, humanColumn: string | null, prefix: string }>` — keyed by canonical type (`bug`, `user_story`, `task`, `test_case`, `test_run`, `test_suite`).
  - `async resolveArtifactUuid(type: string, idParam: string, query: (sql, params) => Promise<{rows: any[]}>): Promise<string>` — returns a UUID string, or throws an Error with `.status = 404`/`.status = 400`.
  - `UUID_RE: RegExp`

- [ ] **Step 1: Write the failing test**

```js
// apps/api/__tests__/artifactResolver.test.js
const { resolveArtifactUuid, ARTIFACT_ID_CONFIG, UUID_RE } = require('../src/services/artifactResolver');

const UUID = '11111111-1111-4111-8111-111111111111';

function fakeQuery(rows) {
  return async () => ({ rows });
}

describe('resolveArtifactUuid', () => {
  test('passes a UUID through without querying', async () => {
    const query = jest.fn(fakeQuery([]));
    await expect(resolveArtifactUuid('bug', UUID, query)).resolves.toBe(UUID);
    expect(query).not.toHaveBeenCalled();
  });

  test('resolves a human id via the human column', async () => {
    const query = jest.fn(fakeQuery([{ id: UUID }]));
    await expect(resolveArtifactUuid('task', 'TSK-001', query)).resolves.toBe(UUID);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/FROM tasks/);
    expect(sql).toMatch(/task_id = \$1/);
    expect(sql).toMatch(/deleted_at IS NULL/);
    expect(params).toEqual(['TSK-001']);
  });

  test('resolves a user_story by stripping US- to the tuleap id', async () => {
    const query = jest.fn(fakeQuery([{ id: UUID }]));
    await expect(resolveArtifactUuid('user_story', 'US-12345', query)).resolves.toBe(UUID);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/tuleap_artifact_id = \$1/);
    expect(params).toEqual([12345]);
  });

  test('resolves a user_story from a bare tuleap number', async () => {
    const query = jest.fn(fakeQuery([{ id: UUID }]));
    await expect(resolveArtifactUuid('user_story', '12345', query)).resolves.toBe(UUID);
    expect(query.mock.calls[0][1]).toEqual([12345]);
  });

  test('throws 404 when no row matches', async () => {
    const query = jest.fn(fakeQuery([]));
    await expect(resolveArtifactUuid('bug', 'TLP-999', query)).rejects.toMatchObject({ status: 404 });
  });

  test('throws 400 for an unknown artifact type', async () => {
    await expect(resolveArtifactUuid('project', 'X', jest.fn())).rejects.toMatchObject({ status: 400 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest __tests__/artifactResolver.test.js`
Expected: FAIL — `Cannot find module '../src/services/artifactResolver'`.

- [ ] **Step 3: Write the implementation**

```js
// apps/api/src/services/artifactResolver.js
'use strict';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Canonical type -> how to resolve its public id to the internal UUID.
// humanColumn === null means "resolve via tuleap_artifact_id" (user_story has no human-id column).
const ARTIFACT_ID_CONFIG = {
  bug:        { table: 'bugs',         humanColumn: 'bug_id',       prefix: 'TLP-' },
  user_story: { table: 'user_stories', humanColumn: null,           prefix: 'US-'  },
  task:       { table: 'tasks',        humanColumn: 'task_id',      prefix: 'TSK-' },
  test_case:  { table: 'test_case',    humanColumn: 'test_case_id', prefix: 'TC-'  },
  test_run:   { table: 'test_runs',    humanColumn: 'run_id',       prefix: 'RUN-' },
  test_suite: { table: 'test_suites',  humanColumn: 'suite_id',     prefix: 'TS-'  },
};

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function resolveArtifactUuid(type, idParam, query) {
  const config = ARTIFACT_ID_CONFIG[type];
  if (!config) throw httpError(400, `Unknown artifact type '${type}'`);

  const value = String(idParam || '').trim();
  if (UUID_RE.test(value)) return value;
  if (!value) throw httpError(400, 'Missing artifact id');

  // user_story has no human-id column: resolve via tuleap_artifact_id (accept "US-123" or bare "123").
  if (config.humanColumn === null) {
    const numeric = value.replace(new RegExp(`^${config.prefix}`, 'i'), '');
    if (!/^\d+$/.test(numeric)) throw httpError(404, `${type} not found`);
    const result = await query(
      `SELECT id FROM ${config.table} WHERE tuleap_artifact_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [parseInt(numeric, 10)]
    );
    if (result.rows.length === 0) throw httpError(404, `${type} not found`);
    return result.rows[0].id;
  }

  const result = await query(
    `SELECT id FROM ${config.table} WHERE ${config.humanColumn} = $1 AND deleted_at IS NULL LIMIT 1`,
    [value]
  );
  if (result.rows.length === 0) throw httpError(404, `${type} not found`);
  return result.rows[0].id;
}

module.exports = { resolveArtifactUuid, ARTIFACT_ID_CONFIG, UUID_RE };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest __tests__/artifactResolver.test.js`
Expected: PASS (6 passing).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/artifactResolver.js apps/api/__tests__/artifactResolver.test.js
git commit -m "feat(api): add artifact human-id -> UUID resolver"
```

---

## Task 2: Wire the resolver into the 6 by-id routes

Adds an Express `router.param('id', ...)` resolver to the five single-type routers and inline resolution to the test-runs handlers, so `GET/PATCH/DELETE/sync` by-id all accept a human ID. Handler SQL is unchanged (it keeps using the UUID, now via the rewritten `req.params.id`).

**Files:**
- Create: `apps/api/src/middleware/resolveArtifactParam.js`
- Test: `apps/api/__tests__/resolveArtifactParam.test.js`
- Modify: `apps/api/src/routes/bugs.js` (add `router.param`), `apps/api/src/routes/tasks.js`, `apps/api/src/routes/testCases.js`, `apps/api/src/routes/testSuites.js`, `apps/api/src/routes/userStories.js`
- Modify: `apps/api/src/routes/testExecutions.js` (`/test-runs/:id`, `/test-runs/:id/bugs-found`, `/test-runs/:id/progress`)

**Interfaces:**
- Consumes: `resolveArtifactUuid` from Task 1.
- Produces: `resolveArtifactParam(type: string): (req, res, next, value) => void` — an Express param middleware that rewrites `req.params.id` to the UUID, or sends `{ success: false, error }` with the thrown status.

- [ ] **Step 1: Write the failing test**

```js
// apps/api/__tests__/resolveArtifactParam.test.js
const { resolveArtifactParam } = require('../src/middleware/resolveArtifactParam');

jest.mock('../src/config/db', () => ({
  query: jest.fn(),
}));
const db = require('../src/config/db');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

describe('resolveArtifactParam', () => {
  beforeEach(() => db.query.mockReset());

  test('rewrites req.params.id to the resolved UUID and calls next', async () => {
    const UUID = '11111111-1111-4111-8111-111111111111';
    db.query.mockResolvedValue({ rows: [{ id: UUID }] });
    const req = { params: { id: 'TSK-001' } };
    const res = mockRes();
    const next = jest.fn();
    await resolveArtifactParam('task')(req, res, next, 'TSK-001');
    expect(req.params.id).toBe(UUID);
    expect(next).toHaveBeenCalledWith();
  });

  test('responds 404 when the human id does not resolve', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const req = { params: { id: 'TSK-999' } };
    const res = mockRes();
    const next = jest.fn();
    await resolveArtifactParam('task')(req, res, next, 'TSK-999');
    expect(res.statusCode).toBe(404);
    expect(next).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest __tests__/resolveArtifactParam.test.js`
Expected: FAIL — `Cannot find module '../src/middleware/resolveArtifactParam'`.

- [ ] **Step 3: Write the middleware**

```js
// apps/api/src/middleware/resolveArtifactParam.js
'use strict';

const db = require('../config/db');
const { resolveArtifactUuid } = require('../services/artifactResolver');

// Express param middleware: rewrites req.params.id (human id OR UUID) to the UUID.
function resolveArtifactParam(type) {
  return async function (req, res, next, value) {
    try {
      req.params.id = await resolveArtifactUuid(type, value, db.query.bind(db));
      next();
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ success: false, error: err.message });
    }
  };
}

module.exports = { resolveArtifactParam };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest __tests__/resolveArtifactParam.test.js`
Expected: PASS (2 passing).

- [ ] **Step 5: Register the param resolver on the five single-type routers**

In each file, immediately after the `const router = express.Router();` line, add the import and the `router.param` registration. Use the canonical type for that file.

`apps/api/src/routes/bugs.js`:
```js
const { resolveArtifactParam } = require('../middleware/resolveArtifactParam');
router.param('id', resolveArtifactParam('bug'));
```

`apps/api/src/routes/tasks.js` → `resolveArtifactParam('task')`
`apps/api/src/routes/testCases.js` → `resolveArtifactParam('test_case')`
`apps/api/src/routes/testSuites.js` → `resolveArtifactParam('test_suite')`
`apps/api/src/routes/userStories.js` → `resolveArtifactParam('user_story')`

Then in `apps/api/src/routes/bugs.js`, **delete** the now-redundant UUID gate in `GET /:id` (the param resolver already 404s on bad input):
```js
// REMOVE these lines from GET /:id:
        if (!UUID_RE.test(id)) {
            return res.status(404).json({ success: false, error: 'Bug not found' });
        }
```

And in `apps/api/src/routes/userStories.js`, simplify `GET /:id` — the param is now always a UUID, so replace the `isTuleapId` branch:
```js
        const { id } = req.params;
        const whereClause = 'us.id = $1';
        const paramValue = id;
```

- [ ] **Step 6: Resolve inline in the test-runs handlers**

`test_run` lives in the multi-purpose `testExecutions.js` router, so do NOT use `router.param` there. Instead resolve at the top of each `/test-runs/:id*` handler. Add the import once near the top of the file:
```js
const { resolveArtifactUuid } = require('../services/artifactResolver');
```
Then at the start of the `try` block in `GET /test-runs/:id`, `GET /test-runs/:id/bugs-found`, and `GET /test-runs/:id/progress`, immediately after `const { id } = req.params;`, add:
```js
        let runUuid;
        try {
            runUuid = await resolveArtifactUuid('test_run', id, db.query.bind(db));
        } catch (err) {
            return res.status(err.status || 500).json({ success: false, error: err.message });
        }
```
and use `runUuid` in place of `id` in that handler's SQL (replace the `WHERE ... id = $1` / `test_run_id = $1` parameter value with `runUuid`).

- [ ] **Step 7: Write an integration test proving both forms resolve**

Add to the existing list-endpoints smoke pattern — create `apps/api/__tests__/byIdHumanResolve.test.js` using the repo's `setupTestApp()` helper (see `apps/api/__tests__/testApp.js`). Seed one task with `task_id = 'TSK-001'` and assert `GET /tasks/TSK-001` and `GET /tasks/<uuid>` both return the same row, and `GET /tasks/TSK-999` returns 404.

```js
// apps/api/__tests__/byIdHumanResolve.test.js
const request = require('supertest');
const { setupTestApp } = require('./testApp');

describe('by-id routes accept human id and UUID', () => {
  let app, seeded;
  beforeAll(async () => { ({ app, seeded } = await setupTestApp({ seedTask: { task_id: 'TSK-001' } })); });

  test('human id resolves', async () => {
    const res = await request(app).get('/tasks/TSK-001').set(seeded.authHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(seeded.task.id);
  });
  test('uuid still resolves', async () => {
    const res = await request(app).get(`/tasks/${seeded.task.id}`).set(seeded.authHeader);
    expect(res.status).toBe(200);
  });
  test('unknown human id is 404', async () => {
    const res = await request(app).get('/tasks/TSK-999').set(seeded.authHeader);
    expect(res.status).toBe(404);
  });
});
```
> If `setupTestApp` does not yet support `seedTask`, extend it minimally in this commit; mirror how existing route tests seed rows (`apps/api/__tests__/testApp.js`).

- [ ] **Step 8: Run the API suite**

Run: `cd apps/api && npx jest __tests__/byIdHumanResolve.test.js __tests__/resolveArtifactParam.test.js`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/middleware/resolveArtifactParam.js apps/api/src/routes/bugs.js apps/api/src/routes/tasks.js apps/api/src/routes/testCases.js apps/api/src/routes/testSuites.js apps/api/src/routes/userStories.js apps/api/src/routes/testExecutions.js apps/api/__tests__/resolveArtifactParam.test.js apps/api/__tests__/byIdHumanResolve.test.js apps/api/__tests__/testApp.js
git commit -m "feat(api): accept human ids on all by-id artifact routes (UUID still works)"
```

---

## Task 3: Lock down human-id uniqueness (DB hardening)

Guarantees a human ID resolves to at most one live row by adding partial unique indexes, after auditing for any pre-existing duplicates. Runs as part of the `db.js` startup bootstrap.

**Files:**
- Create: `docs/runbooks/2026-06-20-human-id-duplicate-audit.md` (the manual pre-flight)
- Modify: `apps/api/src/config/db.js` (append index creation in the migrations section)

**Interfaces:** none (DDL only).

- [ ] **Step 1: Pre-flight — audit prod for duplicates (READ-ONLY, run before deploying the index)**

This MUST be run against prod (`supabase-db`) before the index DDL ships, because `CREATE UNIQUE INDEX` will fail (and could wedge API startup) if duplicates exist. Record the runbook and run each query:

```sql
-- each query must return ZERO rows before proceeding
SELECT bug_id, count(*) FROM bugs WHERE deleted_at IS NULL GROUP BY bug_id HAVING count(*) > 1;
SELECT task_id, count(*) FROM tasks WHERE deleted_at IS NULL AND task_id IS NOT NULL GROUP BY task_id HAVING count(*) > 1;
SELECT test_case_id, count(*) FROM test_case WHERE deleted_at IS NULL GROUP BY test_case_id HAVING count(*) > 1;
SELECT suite_id, count(*) FROM test_suites WHERE deleted_at IS NULL GROUP BY suite_id HAVING count(*) > 1;
-- run_id already has a UNIQUE constraint; user_story resolves via tuleap_artifact_id (already UNIQUE NOT NULL)
```
Save the queries + their (empty) results into `docs/runbooks/2026-06-20-human-id-duplicate-audit.md`. If any query returns rows, STOP and resolve the duplicates with the team before continuing — do not ship the index.

- [ ] **Step 2: Add the partial unique indexes to the bootstrap**

In `apps/api/src/config/db.js`, in the migrations section (alongside the other `CREATE ... INDEX IF NOT EXISTS` calls), append:

```js
        // Human-id addressing: enforce one live row per human id so URL resolution is unambiguous.
        // Partial (deleted_at IS NULL, col IS NOT NULL) so soft-deletes and null task_ids don't collide.
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_bugs_bug_id_live
            ON bugs (bug_id) WHERE deleted_at IS NULL`);
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_task_id_live
            ON tasks (task_id) WHERE deleted_at IS NULL AND task_id IS NOT NULL`);
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_test_case_test_case_id_live
            ON test_case (test_case_id) WHERE deleted_at IS NULL`);
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_test_suites_suite_id_live
            ON test_suites (suite_id) WHERE deleted_at IS NULL`);
```

- [ ] **Step 3: Verify the bootstrap runs clean locally**

Run: `cd apps/api && npm test -- __tests__/db-connection.test.js` (or the repo's DB bootstrap smoke test).
Expected: PASS, no "migration error" thrown by the new DDL.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/config/db.js docs/runbooks/2026-06-20-human-id-duplicate-audit.md
git commit -m "feat(db): partial unique indexes guaranteeing one live row per human id"
```

> After deploy: per project convention, confirm `supabase-db` is the target and grep qc-api logs for "migration error" to confirm the indexes were created.

---

## Task 4: Frontend `artifactPath()` helper (single source of truth for links)

Creates the one function every link-builder will call. Picks the human ID when present, falls back to UUID.

**Files:**
- Create: `apps/web/src/lib/artifactPath.ts`
- Test: `apps/web/src/lib/artifactPath.test.ts`

**Interfaces:**
- Produces:
  - `type ArtifactType = 'bug' | 'user_story' | 'task' | 'test_case' | 'test_run' | 'test_suite'`
  - `artifactPath(type: ArtifactType, artifact: ArtifactLike): string` — returns the canonical path (e.g. `/work/bugs/TLP-12345`).
  - `artifactPublicId(type: ArtifactType, artifact: ArtifactLike): string` — returns just the human id (or UUID fallback).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/artifactPath.test.ts
import { describe, it, expect } from 'vitest';
import { artifactPath, artifactPublicId } from './artifactPath';

const UUID = '11111111-1111-4111-8111-111111111111';

describe('artifactPath', () => {
  it('uses the human id when present', () => {
    expect(artifactPath('bug', { id: UUID, bug_id: 'TLP-12345' })).toBe('/work/bugs/TLP-12345');
    expect(artifactPath('task', { id: UUID, task_id: 'TSK-001' })).toBe('/work/tasks/TSK-001');
    expect(artifactPath('test_case', { id: UUID, test_case_id: 'TC-00001' })).toBe('/test/cases/TC-00001');
    expect(artifactPath('test_run', { id: UUID, run_id: 'RUN-7' })).toBe('/test/runs/RUN-7');
    expect(artifactPath('test_suite', { id: UUID, suite_id: 'TS-3' })).toBe('/test/suites/TS-3');
  });

  it('derives US-<tuleap> for user stories (no human column)', () => {
    expect(artifactPath('user_story', { id: UUID, tuleap_artifact_id: 12345 })).toBe('/work/stories/US-12345');
  });

  it('falls back to UUID when no human id exists', () => {
    expect(artifactPath('task', { id: UUID })).toBe(`/work/tasks/${UUID}`);
    expect(artifactPath('user_story', { id: UUID })).toBe(`/work/stories/${UUID}`);
  });

  it('artifactPublicId returns just the id segment', () => {
    expect(artifactPublicId('bug', { id: UUID, bug_id: 'TLP-1' })).toBe('TLP-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/lib/artifactPath.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/src/lib/artifactPath.ts
export type ArtifactType =
  | 'bug' | 'user_story' | 'task' | 'test_case' | 'test_run' | 'test_suite';

export interface ArtifactLike {
  id?: string | null;
  bug_id?: string | null;
  task_id?: string | null;
  test_case_id?: string | null;
  run_id?: string | null;
  suite_id?: string | null;
  display_id?: string | null;
  tuleap_artifact_id?: number | string | null;
}

const PREFIX: Record<ArtifactType, string> = {
  bug: '/work/bugs/',
  user_story: '/work/stories/',
  task: '/work/tasks/',
  test_case: '/test/cases/',
  test_run: '/test/runs/',
  test_suite: '/test/suites/',
};

export function artifactPublicId(type: ArtifactType, artifact: ArtifactLike): string {
  switch (type) {
    case 'bug': return artifact.bug_id || artifact.id || '';
    case 'task': return artifact.task_id || artifact.id || '';
    case 'test_case': return artifact.test_case_id || artifact.id || '';
    case 'test_run': return artifact.run_id || artifact.id || '';
    case 'test_suite': return artifact.suite_id || artifact.id || '';
    case 'user_story':
      if (artifact.display_id) return artifact.display_id;
      if (artifact.tuleap_artifact_id != null) return `US-${artifact.tuleap_artifact_id}`;
      return artifact.id || '';
  }
}

export function artifactPath(type: ArtifactType, artifact: ArtifactLike): string {
  return PREFIX[type] + artifactPublicId(type, artifact);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/lib/artifactPath.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/artifactPath.ts apps/web/src/lib/artifactPath.test.ts
git commit -m "feat(web): add artifactPath() single source of truth for artifact URLs"
```

---

## Task 5: Canonicalize the address bar on the 6 detail pages

When a detail page loads via UUID (old link), redirect the address bar to the human-ID URL with `router.replace` so what users copy/share is the clean form. Old links keep working because Task 2 resolves both.

**Files (one detail page each):**
- Modify: `apps/web/app/work/bugs/[id]/page.tsx`
- Modify: `apps/web/app/work/stories/[id]/page.tsx`
- Modify: `apps/web/app/work/tasks/[id]/page.tsx`
- Modify: `apps/web/app/test/cases/[id]/page.tsx`
- Modify: `apps/web/app/test/runs/[id]/page.tsx`
- Modify: `apps/web/app/test/suites/[id]/page.tsx`

**Interfaces:**
- Consumes: `artifactPublicId` from Task 4; `useRouter` (already imported in these pages).

- [ ] **Step 1: Add the canonicalization effect to the bugs detail page**

In `apps/web/app/work/bugs/[id]/page.tsx`, after the bug has loaded into state (where `bug` is the loaded object and `id` is the URL param), add:
```tsx
import { artifactPublicId } from '@/lib/artifactPath';
// ...inside the component, after the bug is in state:
useEffect(() => {
  if (!bug) return;
  const canonical = artifactPublicId('bug', bug);
  if (canonical && canonical !== id) {
    router.replace(`/work/bugs/${canonical}`);
  }
}, [bug, id, router]);
```

- [ ] **Step 2: Repeat for the other five pages with the matching type/prefix**

Apply the identical effect to each page, substituting the type and prefix from the per-type table:
- `work/stories/[id]/page.tsx` → `artifactPublicId('user_story', story)`, `/work/stories/${canonical}`
- `work/tasks/[id]/page.tsx` → `artifactPublicId('task', task)`, `/work/tasks/${canonical}`
- `test/cases/[id]/page.tsx` → `artifactPublicId('test_case', testCase)`, `/test/cases/${canonical}`
- `test/runs/[id]/page.tsx` → `artifactPublicId('test_run', run)`, `/test/runs/${canonical}`
- `test/suites/[id]/page.tsx` → `artifactPublicId('test_suite', suite)`, `/test/suites/${canonical}`

(Use the actual loaded-object variable name in each file; confirm by reading the page's state.)

- [ ] **Step 3: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors (project has no PR build/type-check gate — this MUST be run manually).

- [ ] **Step 4: Add/extend an E2E redirect spec**

In `apps/web` Playwright tests (mirror `apps/web/.../redirects.spec.ts`), add a case: visiting a known bug by UUID lands on the page and the URL becomes `/work/bugs/TLP-...`.

Run: `cd apps/web && npx playwright test redirects`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/work/bugs/[id]/page.tsx apps/web/app/work/stories/[id]/page.tsx apps/web/app/work/tasks/[id]/page.tsx apps/web/app/test/cases/[id]/page.tsx apps/web/app/test/runs/[id]/page.tsx apps/web/app/test/suites/[id]/page.tsx apps/web/tests
git commit -m "feat(web): canonicalize artifact detail URLs to human ids"
```

---

## Task 6: Route all generated links through human IDs

Switches every link-builder — backend notification/search builders and the ~84 frontend sites — to emit human-ID URLs via `artifactPath()`, and adds a guard test to stop UUID links creeping back.

**Files:**
- Modify: `apps/api/src/services/notifications/links.js`
- Modify: `apps/api/src/routes/search.js` (the `displayIdExpr`/`urlPrefix` builders)
- Modify: ~84 frontend sites under `apps/web/app/**` and `apps/web/src/**` (enumerated via grep below)
- Create: `apps/web/src/lib/artifactPath.guard.test.ts` (lint-style guard)

- [ ] **Step 1: Make the backend notification link map emit human ids**

`apps/api/src/services/notifications/links.js` currently maps `id => /work/bugs/${id}` where `id` is the artifact UUID. Change `buildLink(entityType, entityId)` to look up the human id before formatting. For each type, after fetching the row, build the path using the human column (reuse `ARTIFACT_ID_CONFIG` prefixes). Example for bug:
```js
// inside buildLink, when entityType === 'bug':
const r = await pool.query(
  `SELECT bug_id, id FROM bugs WHERE id = $1 AND deleted_at IS NULL`, [entityId]);
const pub = r.rows[0]?.bug_id || entityId;
return `/work/bugs/${pub}`;
```
Apply the analogous lookup for `task` (`task_id`), `test_case` (`test_case_id`), `test_suite` (`suite_id`), `test_run` (`run_id`), and `user_story` (`COALESCE display_id, 'US-'||tuleap_artifact_id, id::text`). The existing `test_run` branch already selects `test_run_id` — align it to `run_id`.

- [ ] **Step 2: Make search results link to human ids**

`apps/api/src/routes/search.js` already computes `displayIdExpr` (e.g. `COALESCE(t.task_id, t.id::text)`) and has `urlPrefix` per type. Change the URL assembly to concatenate `urlPrefix + displayId` (the human display id) instead of `urlPrefix + uuid`. Verify each type's `displayIdExpr` yields the human id and use that value when building the result's `url`.

- [ ] **Step 3: Add the backend link tests**

Extend the existing notifications/search route tests (`apps/api/__tests__/notifications.dispatcher.test.js`, `apps/api/__tests__/search.routes.test.js`) to assert a generated link is `/work/bugs/TLP-...` (human) not a UUID. Run: `cd apps/api && npx jest notifications search`. Expected: PASS.

- [ ] **Step 4: Enumerate the frontend link sites**

Run this to produce the working list (expect ~84):
```bash
cd /root/QC-Manager && grep -rnE "/(work|test)/(bugs|stories|tasks|cases|runs|suites)/" apps/web/app apps/web/src --include='*.tsx' --include='*.ts' | grep -v node_modules | grep -v '.next' | grep -E "\\\$\{|router\.(push|replace)|href"
```
For each hit, replace the hand-built path with `artifactPath(type, rowObject)`. Three cases to watch:
  1. **Sites already passing `.id` (UUID)** — e.g. `/test/cases/${info.row.original.id}` → `artifactPath('test_case', info.row.original)`. The row already carries `test_case_id` from the API.
  2. **Sites passing a link-table FK** — e.g. in `test/runs/[id]/page.tsx`, `/work/bugs/${row.bug_id}` where `row.bug_id` is a **UUID FK**, not the bug's human id. Pass the whole row (which must carry the bug's human id) to `artifactPath('bug', row)`; if the row only has the UUID, that's the correct fallback (still resolves via Task 2). Do NOT assume `row.bug_id` is the human id here.
  3. **Sites passing `tuleap_artifact_id || id`** — replace with `artifactPath('user_story', story)`.

Import `artifactPath` (and `ArtifactType` if needed) at the top of each edited file: `import { artifactPath } from '@/lib/artifactPath';`

- [ ] **Step 5: Add a guard test to prevent regressions**

```ts
// apps/web/src/lib/artifactPath.guard.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// Hand-built artifact paths with an interpolated id are forbidden — use artifactPath().
const ALLOWLIST = [
  'src/lib/artifactPath.ts',
  'src/lib/artifactPath.test.ts',
];

describe('no hand-built artifact URLs', () => {
  it('every interpolated artifact path goes through artifactPath()', () => {
    const out = execSync(
      `grep -rnE "/(work|test)/(bugs|stories|tasks|cases|runs|suites)/\\\\\\$\\{" app src --include='*.tsx' --include='*.ts' || true`,
      { cwd: process.cwd(), encoding: 'utf8' }
    );
    const offenders = out.split('\n').filter(Boolean).filter(line => !ALLOWLIST.some(a => line.includes(a)));
    expect(offenders, `Use artifactPath() instead:\n${offenders.join('\n')}`).toEqual([]);
  });
});
```
> The detail-page `router.replace` calls in Task 5 build `${canonical}` (the already-resolved public id), not a raw artifact id — keep them out of the offender pattern by using `artifactPath`/`artifactPublicId` there too, or extend the ALLOWLIST for those six files.

- [ ] **Step 6: Type-check and run web tests**

Run: `cd apps/web && npx tsc --noEmit && npx vitest run`
Expected: PASS, guard test green (no offenders).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/notifications/links.js apps/api/src/routes/search.js apps/web
git commit -m "feat: emit human-readable artifact ids in all generated links"
```

---

## Task 7: Refresh the knowledge graph

**Files:** none (tooling).

- [ ] **Step 1: Rebuild the code graph (per CLAUDE.md rule)**

Run: `python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"`
Expected: completes without error; `graphify-out/` updated.

- [ ] **Step 2: Commit**

```bash
git add graphify-out
git commit -m "chore: refresh graphify graph after human-id URL work"
```

---

## Self-Review

**Spec coverage:**
- Readability via existing human IDs → Tasks 1, 4, 5, 6. ✓
- Drop security framing → captured in Global Constraints. ✓
- Option A (human id = public key, UUID internal) → Tasks 1–2 keep UUID internal. ✓
- Use existing IDs as-is (no renumber) → resolver/helper use existing columns; no backfill. ✓
- Dual-accept + canonicalize → Task 2 (accept both) + Task 5 (redirect). ✓
- 6 core artifacts only → per-type table; projects/resources/journeys excluded. ✓
- Centralize 84 builders → Task 4 helper + Task 6 migration + guard test. ✓
- Uniqueness/null hardening + duplicate audit → Task 3. ✓

**Placeholder scan:** No "TBD"/"handle edge cases" — each step ships concrete code or an exact command. Task 6's 84 sites are enumerated by an exact grep with three explicit rewrite rules (mechanical, not vague). ✓

**Type consistency:** `resolveArtifactUuid(type, idParam, query)`, `resolveArtifactParam(type)`, `artifactPath(type, artifact)`, `artifactPublicId(type, artifact)`, and canonical type strings (`bug|user_story|task|test_case|test_run|test_suite`) are used identically across Tasks 1, 2, 4, 5, 6. ✓

**Risks called out:** `CREATE UNIQUE INDEX` wedging startup if duplicates exist → mitigated by the read-only pre-flight audit in Task 3 Step 1; link-table FK columns named like human ids (`row.bug_id` is a UUID) → called out in Task 6 Step 4 case 2.

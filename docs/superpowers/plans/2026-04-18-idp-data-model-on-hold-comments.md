# IDP Data Model: On-Hold Status + Task Comments + Late-Completion Flag — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the IDP backend + type layer so a user can put a task On Hold (with a required comment), so late-completed tasks are visible in the API payload, and so each IDP task carries a comment thread shared between the user and their manager. This plan ships only the data + API + type layer — no UI changes.

**Architecture:**
- New DB migration `023_idp_hold_and_comments.sql` widens `user_task_completions.progress_status` to include `ON_HOLD`, adds a `hold_reason` column, and introduces a new `idp_task_comment` table keyed by `(user_id, task_id)`.
- `apps/api/src/routes/developmentPlans.js` gains: an `ON_HOLD` branch in the status endpoint (requiring a `comment`), a computed `completed_late` field on task reads, and four new `/comments` routes (user + manager halves).
- `apps/web/src/lib/api.ts` extends the `IDPTask` / `IDPPlan` / `IDPReport` types with the new fields and exposes a typed comments API. No React component is modified in this plan — Plan B consumes these additions.

**Tech Stack:** PostgreSQL (Supabase self-hosted), Node.js/Express API, Jest + Supertest for API tests, TypeScript for the web client.

**Conventions captured from the existing codebase:**
- Migrations are hand-written SQL files in `database/migrations/NNN_name.sql`, wrapped in `BEGIN; … COMMIT;`, using `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` for re-runnability. See `database/migrations/022_idp_support.sql` for the reference shape.
- API route tests live in `apps/api/__tests__/*.test.js` and use jest mocks on `../src/config/db` (see `apps/api/__tests__/developmentPlans.test.js` for the mock harness pattern we reuse).
- `live` DB is Supabase: never `qc-postgres`. User table is `app_user` (not `users`).
- The existing status endpoint is `PATCH /development-plans/my/tasks/:taskId/status` (`apps/api/src/routes/developmentPlans.js:120-157`). The code-level `VALID` array plus the DB `CHECK` constraint both enforce the status whitelist — both must be updated together.
- Manager-scoped routes always pair `requireRole('admin', 'manager')` with `await canAccessUser(req.user, userId)` for team scoping (`apps/api/src/middleware/teamAccess.js`).

---

## File Structure

**Files created:**
- `database/migrations/023_idp_hold_and_comments.sql` — widens status CHECK, adds `hold_reason`, creates `idp_task_comment` table.
- `apps/api/__tests__/developmentPlans.onHold.test.js` — tests for the ON_HOLD transition path.
- `apps/api/__tests__/developmentPlans.comments.test.js` — tests for the comments routes (user + manager).
- `apps/api/__tests__/developmentPlans.lateCompleted.test.js` — tests for the `completed_late` computed flag.

**Files modified:**
- `apps/api/src/routes/developmentPlans.js` — status endpoint widened, comments routes added, `GET /my` and `GET /:userId` emit `hold_reason` + `completed_late`, `/report` summary gains `on_hold_tasks`.
- `apps/web/src/lib/api.ts` — `IDPTask`, `IDPPlan`, `IDPReport` type updates; new `IDPTaskComment` interface; new `developmentPlansApi` methods for comments and widened `updateMyTaskStatus` signature.

No React component files are touched by this plan. The goal is a safe backend/type expansion that Plan B will consume.

---

## Task 1: DB Migration — ON_HOLD status, hold_reason column, idp_task_comment table

**Files:**
- Create: `database/migrations/023_idp_hold_and_comments.sql`

- [ ] **Step 1: Write the migration SQL**

Create `database/migrations/023_idp_hold_and_comments.sql` with this content:

```sql
-- database/migrations/023_idp_hold_and_comments.sql
-- Migration 023: Adds ON_HOLD status + hold_reason to user_task_completions,
--                and creates the idp_task_comment table for per-(user, task) threads.

BEGIN;

-- 1. Widen the progress_status whitelist.
--    Drop and recreate the CHECK so it includes ON_HOLD alongside the existing states.
ALTER TABLE user_task_completions
    DROP CONSTRAINT IF EXISTS user_task_completions_progress_status_check;

ALTER TABLE user_task_completions
    ADD CONSTRAINT user_task_completions_progress_status_check
    CHECK (progress_status IN ('TODO', 'IN_PROGRESS', 'ON_HOLD', 'DONE'));

-- 2. Capture the reason a task is on hold at the completion-row level.
--    Nullable: non-null only while progress_status = 'ON_HOLD'.
ALTER TABLE user_task_completions
    ADD COLUMN IF NOT EXISTS hold_reason TEXT;

COMMENT ON COLUMN user_task_completions.hold_reason
    IS 'Reason the task is currently On Hold. Cleared when progress_status leaves ON_HOLD.';

-- 3. Per-(user, task) comment thread. Keyed on (user_id, task_id) so comments
--    survive TODO transitions (which delete the user_task_completions row).
CREATE TABLE IF NOT EXISTS idp_task_comment (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    task_id     UUID        NOT NULL REFERENCES journey_tasks(id) ON DELETE CASCADE,
    author_id   UUID        NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
    body        TEXT        NOT NULL CHECK (length(body) > 0),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_idp_task_comment_user_task
    ON idp_task_comment(user_id, task_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_idp_task_comment_author
    ON idp_task_comment(author_id);

COMMENT ON TABLE idp_task_comment
    IS 'Discussion thread per (user, IDP task). Visible to the user and their managers.';

COMMIT;
```

- [ ] **Step 2: Apply the migration against the live Supabase DB**

The project uses Supabase (container `supabase-db`, see CLAUDE.md). Apply with the Supabase MCP `apply_migration` tool OR via psql against the Supabase container. Prefer the MCP tool so the migration is tracked.

If using psql directly:
```bash
docker exec -i supabase-db psql -U postgres -d postgres < database/migrations/023_idp_hold_and_comments.sql
```

- [ ] **Step 3: Verify the schema changes landed**

```bash
docker exec -i supabase-db psql -U postgres -d postgres -c "\d user_task_completions" | grep -E "progress_status|hold_reason"
docker exec -i supabase-db psql -U postgres -d postgres -c "\d idp_task_comment"
docker exec -i supabase-db psql -U postgres -d postgres -c "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'user_task_completions_progress_status_check';"
```

Expected:
- `progress_status` column listed with CHECK containing `'ON_HOLD'`.
- `hold_reason` column listed as `text`.
- `idp_task_comment` table exists with 7 columns matching the DDL above.

- [ ] **Step 4: Commit**

```bash
git add database/migrations/023_idp_hold_and_comments.sql
git commit -m "feat(db): migration 023 adds ON_HOLD status, hold_reason, and idp_task_comment table"
```

---

## Task 2: Widen status endpoint to accept ON_HOLD with a required comment

**Files:**
- Create: `apps/api/__tests__/developmentPlans.onHold.test.js`
- Modify: `apps/api/src/routes/developmentPlans.js:120-157`

Current endpoint at `apps/api/src/routes/developmentPlans.js:120` restricts `status` to `['TODO', 'IN_PROGRESS', 'DONE']` and deletes the completion row on TODO. We widen to include `ON_HOLD`, require a non-empty `comment` when entering ON_HOLD, persist `hold_reason`, and clear `hold_reason` when leaving ON_HOLD.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/__tests__/developmentPlans.onHold.test.js`:

```javascript
'use strict';

process.env.SUPABASE_JWT_SECRET = 'test-secret';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery }));

jest.mock('jsonwebtoken', () => ({
    verify: jest.fn().mockReturnValue({ sub: 'supabase-uid' }),
}));

jest.mock('../src/middleware/authMiddleware', () => ({
    requireAuth: (req, _res, next) => next(),
    requireRole: () => (req, _res, next) => next(),
}));

jest.mock('../src/middleware/teamAccess', () => ({
    canAccessUser: jest.fn(),
    getManagerTeamId: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const router = require('../src/routes/developmentPlans');

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { id: 'user-1', role: 'user' }; next(); });
    app.use('/development-plans', router);
    return app;
}

afterEach(() => jest.clearAllMocks());

describe('PATCH /development-plans/my/tasks/:taskId/status ON_HOLD handling', () => {
    test('returns 400 when status=ON_HOLD and comment missing', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] });               // getPlanForUser
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'task-1' }] });               // taskCheck

        const res = await request(makeApp())
            .patch('/development-plans/my/tasks/task-1/status')
            .send({ status: 'ON_HOLD' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/comment/i);
    });

    test('returns 400 when status=ON_HOLD and comment is only whitespace', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] });
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'task-1' }] });

        const res = await request(makeApp())
            .patch('/development-plans/my/tasks/task-1/status')
            .send({ status: 'ON_HOLD', comment: '   ' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/comment/i);
    });

    test('upserts completion with hold_reason and inserts a comment when entering ON_HOLD', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] });               // getPlanForUser
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'task-1' }] });               // taskCheck
        mockQuery.mockResolvedValueOnce({                                            // upsert completion
            rows: [{ task_id: 'task-1', progress_status: 'ON_HOLD', hold_reason: 'Blocked on Bob' }],
        });
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'c-1' }] });                  // insert comment

        const res = await request(makeApp())
            .patch('/development-plans/my/tasks/task-1/status')
            .send({ status: 'ON_HOLD', comment: 'Blocked on Bob' });

        expect(res.status).toBe(200);
        expect(res.body.progress_status).toBe('ON_HOLD');
        expect(res.body.hold_reason).toBe('Blocked on Bob');

        const upsertCall = mockQuery.mock.calls[2];
        expect(upsertCall[0]).toMatch(/INSERT INTO user_task_completions/);
        expect(upsertCall[0]).toMatch(/hold_reason/);
        expect(upsertCall[1]).toEqual(['user-1', 'task-1', 'ON_HOLD', 'Blocked on Bob']);

        const commentCall = mockQuery.mock.calls[3];
        expect(commentCall[0]).toMatch(/INSERT INTO idp_task_comment/);
        expect(commentCall[1]).toEqual(['user-1', 'task-1', 'user-1', 'Blocked on Bob']);
    });

    test('clears hold_reason when transitioning from ON_HOLD to IN_PROGRESS', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] });
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'task-1' }] });
        mockQuery.mockResolvedValueOnce({
            rows: [{ task_id: 'task-1', progress_status: 'IN_PROGRESS', hold_reason: null }],
        });

        const res = await request(makeApp())
            .patch('/development-plans/my/tasks/task-1/status')
            .send({ status: 'IN_PROGRESS' });

        expect(res.status).toBe(200);
        expect(res.body.progress_status).toBe('IN_PROGRESS');
        expect(res.body.hold_reason).toBeNull();

        const upsertCall = mockQuery.mock.calls[2];
        expect(upsertCall[0]).toMatch(/hold_reason\s*=\s*NULL/i);
    });

    test('rejects unknown status values', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] });

        const res = await request(makeApp())
            .patch('/development-plans/my/tasks/task-1/status')
            .send({ status: 'BOGUS' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/status must be one of/);
        expect(res.body.error).toMatch(/ON_HOLD/);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && npx jest __tests__/developmentPlans.onHold.test.js
```

Expected: all 5 tests FAIL — the current code rejects `ON_HOLD` as an invalid status, so every hold-path test errors with a 400 for the wrong reason or the whitespace/comment checks never execute.

- [ ] **Step 3: Update the status endpoint**

In `apps/api/src/routes/developmentPlans.js`, replace the block starting at line 120 (`router.patch('/my/tasks/:taskId/status', ...`) and ending at line 157 with:

```javascript
router.patch('/my/tasks/:taskId/status', requireAuth, async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { taskId } = req.params;
        const { status, comment } = req.body;

        const VALID = ['TODO', 'IN_PROGRESS', 'ON_HOLD', 'DONE'];
        if (!VALID.includes(status)) {
            return res.status(400).json({ error: `status must be one of: ${VALID.join(', ')}` });
        }

        const trimmedComment = typeof comment === 'string' ? comment.trim() : '';
        if (status === 'ON_HOLD' && trimmedComment.length === 0) {
            return res.status(400).json({ error: 'A comment is required when placing a task On Hold' });
        }

        const plan = await getPlanForUser(userId);
        if (!plan) return res.status(404).json({ error: 'No active IDP plan found' });

        const taskCheck = await db.query(
            `SELECT jt.id FROM journey_tasks jt
             JOIN journey_quests jq ON jt.quest_id = jq.id
             JOIN journey_chapters jc ON jq.chapter_id = jc.id
             WHERE jt.id = $1 AND jc.journey_id = $2`,
            [taskId, plan.id]
        );
        if (taskCheck.rows.length === 0) return res.status(404).json({ error: 'Task not found in your plan' });

        if (status === 'TODO') {
            await db.query(`DELETE FROM user_task_completions WHERE user_id = $1 AND task_id = $2`, [userId, taskId]);
            return res.json({ task_id: taskId, progress_status: 'TODO', hold_reason: null });
        }

        if (status === 'ON_HOLD') {
            const upsert = await db.query(
                `INSERT INTO user_task_completions (user_id, task_id, progress_status, hold_reason)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (user_id, task_id)
                 DO UPDATE SET progress_status = $3, hold_reason = $4, completed_at = NULL
                 RETURNING *`,
                [userId, taskId, 'ON_HOLD', trimmedComment]
            );
            await db.query(
                `INSERT INTO idp_task_comment (user_id, task_id, author_id, body)
                 VALUES ($1, $2, $3, $4)`,
                [userId, taskId, userId, trimmedComment]
            );
            return res.json(upsert.rows[0]);
        }

        // status ∈ { IN_PROGRESS, DONE } — always clear hold_reason on transition
        const result = await db.query(
            `INSERT INTO user_task_completions (user_id, task_id, progress_status, hold_reason)
             VALUES ($1, $2, $3, NULL)
             ON CONFLICT (user_id, task_id)
             DO UPDATE SET
                progress_status = $3,
                hold_reason = NULL,
                completed_at = CASE WHEN $3 = 'DONE' THEN NOW() ELSE NULL END
             RETURNING *`,
            [userId, taskId, status]
        );
        res.json(result.rows[0]);
    } catch (err) { next(err); }
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api && npx jest __tests__/developmentPlans.onHold.test.js
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Run the existing developmentPlans test suite to confirm no regression**

```bash
cd apps/api && npx jest __tests__/developmentPlans.test.js
```

Expected: the pre-existing suite still passes. If a test was asserting the old 3-value error message, update the assertion to match the new `must be one of: TODO, IN_PROGRESS, ON_HOLD, DONE` message — this is acceptable since the old message was an implementation detail.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/developmentPlans.js apps/api/__tests__/developmentPlans.onHold.test.js
git commit -m "feat(idp): accept ON_HOLD status with required comment, persist hold_reason"
```

---

## Task 3: Emit `hold_reason` and `completed_late` from GET /my and GET /:userId

**Files:**
- Create: `apps/api/__tests__/developmentPlans.lateCompleted.test.js`
- Modify: `apps/api/src/routes/developmentPlans.js:45-116` (GET /my) and `apps/api/src/routes/developmentPlans.js:205-292` (GET /:userId)

Current task objects in both GETs expose `progress_status` but not `hold_reason`, and do not compute a late-completion flag. We add both fields to every task payload and to the plan-level `progress` summary we add `on_hold_tasks`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/__tests__/developmentPlans.lateCompleted.test.js`:

```javascript
'use strict';

process.env.SUPABASE_JWT_SECRET = 'test-secret';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery }));

jest.mock('jsonwebtoken', () => ({
    verify: jest.fn().mockReturnValue({ sub: 'supabase-uid' }),
}));

jest.mock('../src/middleware/authMiddleware', () => ({
    requireAuth: (req, _res, next) => next(),
    requireRole: () => (req, _res, next) => next(),
}));

jest.mock('../src/middleware/teamAccess', () => ({
    canAccessUser: jest.fn().mockResolvedValue(true),
    getManagerTeamId: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const router = require('../src/routes/developmentPlans');

function makeUserApp() {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { id: 'user-1', role: 'user' }; next(); });
    app.use('/development-plans', router);
    return app;
}

afterEach(() => jest.clearAllMocks());

function stubIDPFixture({ completion }) {
    // getPlanForUser → chapters → quests → tasks → completions
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'plan-1', title: 'Q2', owner_user_id: 'user-1', plan_type: 'idp', is_active: true, created_at: '2026-01-01' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'ch-1', title: 'Obj 1', sort_order: 1 }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'q-1', chapter_id: 'ch-1' }] });
    mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'task-1', quest_id: 'q-1', title: 'Ship X', due_date: '2026-03-01', is_mandatory: true }],
    });
    mockQuery.mockResolvedValueOnce({ rows: [completion] });
}

describe('GET /development-plans/my — hold_reason + completed_late surface', () => {
    test('completed_late=true when DONE and completed_at > due_date', async () => {
        stubIDPFixture({
            completion: {
                task_id: 'task-1',
                progress_status: 'DONE',
                completed_at: new Date('2026-03-05T00:00:00Z'),
                hold_reason: null,
            },
        });
        const res = await request(makeUserApp()).get('/development-plans/my');
        expect(res.status).toBe(200);
        expect(res.body.objectives[0].tasks[0].completed_late).toBe(true);
        expect(res.body.objectives[0].tasks[0].hold_reason).toBeNull();
    });

    test('completed_late=false when DONE and completed_at <= due_date', async () => {
        stubIDPFixture({
            completion: {
                task_id: 'task-1',
                progress_status: 'DONE',
                completed_at: new Date('2026-02-15T00:00:00Z'),
                hold_reason: null,
            },
        });
        const res = await request(makeUserApp()).get('/development-plans/my');
        expect(res.body.objectives[0].tasks[0].completed_late).toBe(false);
    });

    test('completed_late=null when task is not DONE', async () => {
        stubIDPFixture({
            completion: {
                task_id: 'task-1',
                progress_status: 'ON_HOLD',
                completed_at: null,
                hold_reason: 'Blocked on Bob',
            },
        });
        const res = await request(makeUserApp()).get('/development-plans/my');
        const task = res.body.objectives[0].tasks[0];
        expect(task.completed_late).toBeNull();
        expect(task.hold_reason).toBe('Blocked on Bob');
        expect(task.progress_status).toBe('ON_HOLD');
    });

    test('plan.progress.on_hold_tasks counts ON_HOLD completions', async () => {
        stubIDPFixture({
            completion: {
                task_id: 'task-1',
                progress_status: 'ON_HOLD',
                completed_at: null,
                hold_reason: 'Waiting',
            },
        });
        const res = await request(makeUserApp()).get('/development-plans/my');
        expect(res.body.progress.on_hold_tasks).toBe(1);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && npx jest __tests__/developmentPlans.lateCompleted.test.js
```

Expected: all 4 tests FAIL because `completed_late`, `hold_reason`, and `progress.on_hold_tasks` are not in the response.

- [ ] **Step 3: Update `buildProgress` and the task mapper**

In `apps/api/src/routes/developmentPlans.js`, replace the `buildProgress` function (lines 9-33) with:

```javascript
function buildProgress(tasks, completions) {
    const completionMap = new Map(completions.map(c => [c.task_id, c]));
    const total = tasks.length;
    const mandatory = tasks.filter(t => t.is_mandatory).length;
    let done = 0;
    let mandatoryDone = 0;
    let overdue = 0;
    let onHold = 0;
    const today = new Date().toISOString().slice(0, 10);

    for (const t of tasks) {
        const c = completionMap.get(t.id);
        const isDone = c?.progress_status === 'DONE';
        if (isDone) { done++; if (t.is_mandatory) mandatoryDone++; }
        if (c?.progress_status === 'ON_HOLD') onHold++;
        if (!isDone && t.due_date && t.due_date < today) overdue++;
    }

    return {
        total_tasks: total,
        done_tasks: done,
        completion_pct: total > 0 ? Math.round((done / total) * 100) : 0,
        mandatory_tasks: mandatory,
        mandatory_done: mandatoryDone,
        overdue_tasks: overdue,
        on_hold_tasks: onHold,
    };
}
```

Add this helper immediately below `buildProgress`:

```javascript
function computeCompletedLate(task, completion) {
    if (completion?.progress_status !== 'DONE') return null;
    if (!task.due_date || !completion.completed_at) return null;
    const completedDate = completion.completed_at instanceof Date
        ? completion.completed_at.toISOString().slice(0, 10)
        : String(completion.completed_at).slice(0, 10);
    return completedDate > task.due_date;
}
```

Then in `GET /my`, inside the `objectives` mapping at lines 94-110, replace the returned task object with:

```javascript
tasks: chTasks.map(t => {
    const c = completionMap.get(t.id);
    const progressStatus = c?.progress_status || 'TODO';
    const notDone = progressStatus !== 'DONE';
    return {
        id: t.id,
        title: t.title,
        description: t.description,
        start_date: t.start_date,
        due_date: t.due_date,
        priority: t.priority,
        difficulty: t.difficulty,
        is_mandatory: t.is_mandatory,
        progress_status: progressStatus,
        is_overdue: notDone && !!t.due_date && t.due_date < today,
        completed_at: c?.completed_at || null,
        completed_late: computeCompletedLate(t, c),
        hold_reason: c?.hold_reason ?? null,
    };
}),
```

Make the same change in `GET /:userId` at lines 270-283 (the manager-facing view):

```javascript
tasks: chTasks.map(t => {
    const c = completionMap.get(t.id);
    return {
        id: t.id,
        title: t.title,
        description: t.description,
        start_date: t.start_date,
        due_date: t.due_date,
        priority: t.priority,
        difficulty: t.difficulty,
        is_mandatory: t.is_mandatory,
        progress_status: c?.progress_status || 'TODO',
        completed_at: c?.completed_at || null,
        completed_late: computeCompletedLate(t, c),
        hold_reason: c?.hold_reason ?? null,
    };
}),
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api && npx jest __tests__/developmentPlans.lateCompleted.test.js __tests__/developmentPlans.test.js __tests__/developmentPlans.onHold.test.js
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/developmentPlans.js apps/api/__tests__/developmentPlans.lateCompleted.test.js
git commit -m "feat(idp): expose hold_reason, completed_late, and on_hold_tasks in /my and /:userId"
```

---

## Task 4: Report summary — add `on_hold_tasks`

**Files:**
- Modify: `apps/api/src/routes/developmentPlans.js:535-623` (the `GET /:userId/report` handler)

`IDPReport.summary` already carries `on_time_completed` and `late_completed`. Add `on_hold_tasks` so managers can report on blocked work.

- [ ] **Step 1: Add a test to `developmentPlans.test.js`**

Append this test to `apps/api/__tests__/developmentPlans.test.js` inside an existing `describe('GET /development-plans/:userId/report')` block (create the block if it does not exist):

```javascript
describe('GET /development-plans/:userId/report on_hold_tasks', () => {
    test('summary.on_hold_tasks counts ON_HOLD completions across all objectives', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'user-1', name: 'Sara', email: 's@e.com' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1', title: 'Q2', created_at: '2026-01-01', is_active: true }] })
            .mockResolvedValueOnce({ rows: [{ id: 'ch-1', title: 'Obj', sort_order: 1 }] })
            .mockResolvedValueOnce({ rows: [{ id: 'q-1', chapter_id: 'ch-1' }] })
            .mockResolvedValueOnce({ rows: [
                { id: 't-1', quest_id: 'q-1', title: 'A', is_mandatory: true, due_date: '2026-03-01' },
                { id: 't-2', quest_id: 'q-1', title: 'B', is_mandatory: true, due_date: '2026-03-15' },
            ] })
            .mockResolvedValueOnce({ rows: [
                { task_id: 't-1', progress_status: 'ON_HOLD', completed_at: null },
                { task_id: 't-2', progress_status: 'DONE',    completed_at: new Date('2026-03-10T00:00:00Z') },
            ] });

        const res = await request(makeApp()).get('/development-plans/user-1/report');
        expect(res.status).toBe(200);
        expect(res.body.summary.on_hold_tasks).toBe(1);
        expect(res.body.summary.completed_tasks).toBe(1);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/api && npx jest __tests__/developmentPlans.test.js -t "on_hold_tasks"
```

Expected: FAIL with `expected 1, received undefined` (the key doesn't exist yet).

- [ ] **Step 3: Update the report summary**

In `apps/api/src/routes/developmentPlans.js`, modify the summary object inside the `GET /:userId/report` handler (currently around line 612-619). First, above the `res.json` call, add:

```javascript
const onHoldTasks = completions.filter(c => c.progress_status === 'ON_HOLD').length;
```

Then extend the `summary` block:

```javascript
summary: {
    total_tasks: totalTasks,
    completed_tasks: completedTasks,
    completion_pct: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    overdue_tasks: overdueTasks,
    on_time_completed: doneOnTime,
    late_completed: doneLate,
    on_hold_tasks: onHoldTasks,
},
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/api && npx jest __tests__/developmentPlans.test.js -t "on_hold_tasks"
```

Expected: PASS. Also run the full file to confirm no regressions: `npx jest __tests__/developmentPlans.test.js`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/developmentPlans.js apps/api/__tests__/developmentPlans.test.js
git commit -m "feat(idp): add on_hold_tasks to report summary"
```

---

## Task 5: User-facing comments routes — GET + POST `/my/tasks/:taskId/comments`

**Files:**
- Create: `apps/api/__tests__/developmentPlans.comments.test.js`
- Modify: `apps/api/src/routes/developmentPlans.js` — add two new handlers

We add `GET /my/tasks/:taskId/comments` (lists comments on a task in the caller's own IDP) and `POST /my/tasks/:taskId/comments` (appends a comment as the caller).

- [ ] **Step 1: Write the failing tests**

Create `apps/api/__tests__/developmentPlans.comments.test.js`:

```javascript
'use strict';

process.env.SUPABASE_JWT_SECRET = 'test-secret';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery }));

jest.mock('jsonwebtoken', () => ({
    verify: jest.fn().mockReturnValue({ sub: 'supabase-uid' }),
}));

jest.mock('../src/middleware/authMiddleware', () => ({
    requireAuth: (req, _res, next) => next(),
    requireRole: () => (req, _res, next) => next(),
}));

jest.mock('../src/middleware/teamAccess', () => ({
    canAccessUser: jest.fn(),
    getManagerTeamId: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const { canAccessUser } = require('../src/middleware/teamAccess');
const router = require('../src/routes/developmentPlans');

function makeUserApp() {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { id: 'user-1', role: 'user' }; next(); });
    app.use('/development-plans', router);
    return app;
}

function makeManagerApp() {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { id: 'manager-1', role: 'manager' }; next(); });
    app.use('/development-plans', router);
    return app;
}

afterEach(() => jest.clearAllMocks());

describe('GET /development-plans/my/tasks/:taskId/comments', () => {
    test('returns comment list ordered oldest-first', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] })            // getPlanForUser
            .mockResolvedValueOnce({ rows: [{ id: 'task-1' }] })            // task scope check
            .mockResolvedValueOnce({ rows: [                                 // comments
                { id: 'c-1', body: 'first', author_id: 'user-1', created_at: '2026-04-01T00:00:00Z' },
                { id: 'c-2', body: 'second', author_id: 'manager-1', created_at: '2026-04-02T00:00:00Z' },
            ] });

        const res = await request(makeUserApp())
            .get('/development-plans/my/tasks/task-1/comments');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
        expect(res.body[0].body).toBe('first');

        const listQuery = mockQuery.mock.calls[2][0];
        expect(listQuery).toMatch(/ORDER BY created_at ASC/);
    });

    test('returns 404 if task is not in user\'s plan', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [] });                            // task scope miss

        const res = await request(makeUserApp())
            .get('/development-plans/my/tasks/task-999/comments');
        expect(res.status).toBe(404);
    });
});

describe('POST /development-plans/my/tasks/:taskId/comments', () => {
    test('creates a comment with author_id = caller', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'task-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'c-new', body: 'hello', author_id: 'user-1' }] });

        const res = await request(makeUserApp())
            .post('/development-plans/my/tasks/task-1/comments')
            .send({ body: 'hello' });

        expect(res.status).toBe(201);
        expect(res.body.body).toBe('hello');

        const insertCall = mockQuery.mock.calls[2];
        expect(insertCall[0]).toMatch(/INSERT INTO idp_task_comment/);
        expect(insertCall[1]).toEqual(['user-1', 'task-1', 'user-1', 'hello']);
    });

    test('rejects empty body', async () => {
        const res = await request(makeUserApp())
            .post('/development-plans/my/tasks/task-1/comments')
            .send({ body: '   ' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/body/i);
    });
});

describe('GET /development-plans/:userId/tasks/:taskId/comments (manager)', () => {
    test('returns 403 when manager cannot access user', async () => {
        canAccessUser.mockResolvedValueOnce(false);
        const res = await request(makeManagerApp())
            .get('/development-plans/user-1/tasks/task-1/comments');
        expect(res.status).toBe(403);
    });

    test('returns comments for a reachable user', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'task-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'c-1', body: 'hi', author_id: 'user-1' }] });

        const res = await request(makeManagerApp())
            .get('/development-plans/user-1/tasks/task-1/comments');
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
    });
});

describe('POST /development-plans/:userId/tasks/:taskId/comments (manager)', () => {
    test('creates a comment with author_id = manager and user_id = target user', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'task-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'c-new', body: 'nudge', author_id: 'manager-1' }] });

        const res = await request(makeManagerApp())
            .post('/development-plans/user-1/tasks/task-1/comments')
            .send({ body: 'nudge' });

        expect(res.status).toBe(201);
        const insertCall = mockQuery.mock.calls[2];
        expect(insertCall[1]).toEqual(['user-1', 'task-1', 'manager-1', 'nudge']);
    });

    test('returns 403 when manager cannot access user', async () => {
        canAccessUser.mockResolvedValueOnce(false);
        const res = await request(makeManagerApp())
            .post('/development-plans/user-1/tasks/task-1/comments')
            .send({ body: 'x' });
        expect(res.status).toBe(403);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && npx jest __tests__/developmentPlans.comments.test.js
```

Expected: all tests FAIL — routes don't exist, so Supertest returns 404 for every POST/GET.

- [ ] **Step 3: Add a shared `assertTaskInPlan` helper + the four handlers**

In `apps/api/src/routes/developmentPlans.js`, add this helper just below `getPlanForUser` (around line 42):

```javascript
async function assertTaskInPlan(planId, taskId) {
    const r = await db.query(
        `SELECT jt.id FROM journey_tasks jt
         JOIN journey_quests jq ON jt.quest_id = jq.id
         JOIN journey_chapters jc ON jq.chapter_id = jc.id
         WHERE jt.id = $1 AND jc.journey_id = $2`,
        [taskId, planId]
    );
    return r.rows.length > 0;
}
```

Then, immediately after the existing `PATCH /my/tasks/:taskId/status` handler (after line 157 in the current file), add these four handlers:

```javascript
// ─── GET /my/tasks/:taskId/comments — list own task comments ─────────────────

router.get('/my/tasks/:taskId/comments', requireAuth, async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { taskId } = req.params;
        const plan = await getPlanForUser(userId);
        if (!plan) return res.status(404).json({ error: 'No active IDP plan found' });
        if (!(await assertTaskInPlan(plan.id, taskId))) {
            return res.status(404).json({ error: 'Task not found in your plan' });
        }
        const result = await db.query(
            `SELECT id, user_id, task_id, author_id, body, created_at, updated_at
             FROM idp_task_comment
             WHERE user_id = $1 AND task_id = $2
             ORDER BY created_at ASC`,
            [userId, taskId]
        );
        res.json(result.rows);
    } catch (err) { next(err); }
});

// ─── POST /my/tasks/:taskId/comments — add own comment ───────────────────────

router.post('/my/tasks/:taskId/comments', requireAuth, async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { taskId } = req.params;
        const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
        if (body.length === 0) return res.status(400).json({ error: 'body is required' });

        const plan = await getPlanForUser(userId);
        if (!plan) return res.status(404).json({ error: 'No active IDP plan found' });
        if (!(await assertTaskInPlan(plan.id, taskId))) {
            return res.status(404).json({ error: 'Task not found in your plan' });
        }
        const result = await db.query(
            `INSERT INTO idp_task_comment (user_id, task_id, author_id, body)
             VALUES ($1, $2, $3, $4)
             RETURNING id, user_id, task_id, author_id, body, created_at, updated_at`,
            [userId, taskId, userId, body]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) { next(err); }
});

// ─── GET /:userId/tasks/:taskId/comments — manager reads ─────────────────────

router.get('/:userId/tasks/:taskId/comments', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { userId, taskId } = req.params;
        const allowed = await canAccessUser(req.user, userId);
        if (!allowed) return res.status(403).json({ error: 'User is not in your team' });

        const plan = await getPlanForUser(userId);
        if (!plan) return res.status(404).json({ error: 'No active IDP plan found' });
        if (!(await assertTaskInPlan(plan.id, taskId))) {
            return res.status(404).json({ error: 'Task not found in this plan' });
        }
        const result = await db.query(
            `SELECT id, user_id, task_id, author_id, body, created_at, updated_at
             FROM idp_task_comment
             WHERE user_id = $1 AND task_id = $2
             ORDER BY created_at ASC`,
            [userId, taskId]
        );
        res.json(result.rows);
    } catch (err) { next(err); }
});

// ─── POST /:userId/tasks/:taskId/comments — manager comments ─────────────────

router.post('/:userId/tasks/:taskId/comments', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { userId, taskId } = req.params;
        const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
        if (body.length === 0) return res.status(400).json({ error: 'body is required' });

        const allowed = await canAccessUser(req.user, userId);
        if (!allowed) return res.status(403).json({ error: 'User is not in your team' });

        const plan = await getPlanForUser(userId);
        if (!plan) return res.status(404).json({ error: 'No active IDP plan found' });
        if (!(await assertTaskInPlan(plan.id, taskId))) {
            return res.status(404).json({ error: 'Task not found in this plan' });
        }
        const result = await db.query(
            `INSERT INTO idp_task_comment (user_id, task_id, author_id, body)
             VALUES ($1, $2, $3, $4)
             RETURNING id, user_id, task_id, author_id, body, created_at, updated_at`,
            [userId, taskId, req.user.id, body]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) { next(err); }
});
```

**Route-ordering note:** Express matches routes top-to-bottom. The new `/:userId/tasks/...` handlers must be declared **before** the catch-all `/:userId` handler at line 205, otherwise `GET /:userId/tasks/:taskId/comments` could be shadowed. Verify by reading the file top-to-bottom after the insert and moving blocks if needed.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api && npx jest __tests__/developmentPlans.comments.test.js
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Run the full developmentPlans suite**

```bash
cd apps/api && npx jest __tests__/developmentPlans
```

Expected: everything green.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/developmentPlans.js apps/api/__tests__/developmentPlans.comments.test.js
git commit -m "feat(idp): add task comments endpoints for user and manager"
```

---

## Task 6: Update web TypeScript types

**Files:**
- Modify: `apps/web/src/lib/api.ts:966-1013` (IDP type block) and `apps/web/src/lib/api.ts:1015-1038` (IDPReport) and `apps/web/src/lib/api.ts:1044+` (developmentPlansApi)

Source of truth: the backend payload changes we shipped above. The TypeScript compiler is our test harness — we rely on `tsc --noEmit` to confirm the types are well-formed.

- [ ] **Step 1: Widen `IDPTask` and add `IDPTaskComment`**

In `apps/web/src/lib/api.ts`, replace the `IDPTask` interface (lines 966-978) with:

```typescript
export interface IDPTask {
    id: string;
    title: string;
    description?: string;
    start_date?: string;
    due_date?: string;
    priority?: 'low' | 'medium' | 'high';
    difficulty?: 'easy' | 'medium' | 'hard';
    is_mandatory: boolean;
    progress_status: 'TODO' | 'IN_PROGRESS' | 'ON_HOLD' | 'DONE';
    is_overdue?: boolean;
    completed_at?: string | null;
    completed_late?: boolean | null;
    hold_reason?: string | null;
}

export interface IDPTaskComment {
    id: string;
    user_id: string;
    task_id: string;
    author_id: string;
    body: string;
    created_at: string;
    updated_at: string;
}
```

- [ ] **Step 2: Extend `IDPPlan.progress` with `on_hold_tasks`**

Update the `progress` object in `IDPPlan` (lines 1005-1012):

```typescript
    progress: {
        total_tasks: number;
        done_tasks: number;
        completion_pct: number;
        mandatory_tasks: number;
        mandatory_done: number;
        overdue_tasks: number;
        on_hold_tasks: number;
    };
```

- [ ] **Step 3: Extend `IDPReport.summary` with `on_hold_tasks`**

Update the `summary` object in `IDPReport` (lines 1018-1025):

```typescript
    summary: {
        total_tasks: number;
        completed_tasks: number;
        completion_pct: number;
        overdue_tasks: number;
        on_time_completed: number;
        late_completed: number;
        on_hold_tasks: number;
    };
```

- [ ] **Step 4: Widen `updateMyTaskStatus` signature and add comments methods**

Locate `updateMyTaskStatus` near line 1111. Replace it and append the new methods so the end of the `developmentPlansApi` object looks like:

```typescript
    // User: get own plan
    getMy: () =>
        fetchApi<IDPPlan>('/api/development-plans/my'),

    // User: update a task's progress status (optionally with a comment — required for ON_HOLD)
    updateMyTaskStatus: (
        taskId: string,
        status: 'TODO' | 'IN_PROGRESS' | 'ON_HOLD' | 'DONE',
        comment?: string
    ) =>
        fetchApi<IDPTask>(`/api/development-plans/my/tasks/${taskId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status, comment }),
        }),

    // User: list comments on a task in own plan
    listMyTaskComments: (taskId: string) =>
        fetchApi<IDPTaskComment[]>(`/api/development-plans/my/tasks/${taskId}/comments`),

    // User: add a comment to a task in own plan
    addMyTaskComment: (taskId: string, body: string) =>
        fetchApi<IDPTaskComment>(`/api/development-plans/my/tasks/${taskId}/comments`, {
            method: 'POST',
            body: JSON.stringify({ body }),
        }),

    // Manager: list comments on a task in another user's plan
    listTaskComments: (userId: string, taskId: string) =>
        fetchApi<IDPTaskComment[]>(`/api/development-plans/${userId}/tasks/${taskId}/comments`),

    // Manager: add a comment to a task in another user's plan
    addTaskComment: (userId: string, taskId: string, body: string) =>
        fetchApi<IDPTaskComment>(`/api/development-plans/${userId}/tasks/${taskId}/comments`, {
            method: 'POST',
            body: JSON.stringify({ body }),
        }),
```

Keep the rest of `developmentPlansApi` (`getForUser`, `create`, `addObjective`, etc.) untouched.

- [ ] **Step 5: Typecheck the web app**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors. If errors appear in unrelated files, they are pre-existing and not introduced by this plan — note them in the commit but do not fix in this plan.

- [ ] **Step 6: Verify the journeys page still compiles (no behavior change expected)**

`apps/web/app/journeys/page.tsx:55-64` already calls `updateMyTaskStatus` with a 2-arg signature. The new optional `comment` parameter keeps the existing call site valid. Confirm:

```bash
cd apps/web && npx tsc --noEmit apps/web/app/journeys/page.tsx 2>&1 | grep -i error || echo "clean"
```

Expected: `clean`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat(idp): extend TS types with ON_HOLD, hold_reason, completed_late, comments API"
```

---

## Task 7: Smoke-test end-to-end against live Supabase

This is a manual verification pass — no code changes. It catches migration drift, route-ordering bugs, and `hold_reason` mis-persistence that unit tests can mask.

- [ ] **Step 1: Deploy the API changes**

Use the quick hotfix path from CLAUDE.md (preferred for iterative verification):

```bash
docker cp apps/api/src/routes/developmentPlans.js qc-api:/app/src/routes/developmentPlans.js && docker restart qc-api
docker ps | grep qc-api    # wait for (healthy)
```

- [ ] **Step 2: Pick an ACTIVE user with an IDP plan and get an auth token**

From the browser, sign in as that user and copy the Supabase access token from localStorage (key: `sb-<project>-auth-token`) — the `access_token` JSON field.

```bash
TOKEN="<paste token here>"
TASK_ID="<pick a task id from their plan via GET /my>"
curl -s https://api.gebrils.cloud/api/development-plans/my -H "Authorization: Bearer $TOKEN" | jq '.objectives[0].tasks[0]'
```

Expected: the task object includes `completed_late` and `hold_reason` keys (possibly null).

- [ ] **Step 3: Put a task On Hold — verify rejection without comment, acceptance with comment**

```bash
# Missing comment → 400
curl -s -o /dev/null -w "%{http_code}\n" \
    -X PATCH "https://api.gebrils.cloud/api/development-plans/my/tasks/$TASK_ID/status" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d '{"status":"ON_HOLD"}'
# Expected: 400

# With comment → 200 and hold_reason set
curl -s -X PATCH "https://api.gebrils.cloud/api/development-plans/my/tasks/$TASK_ID/status" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d '{"status":"ON_HOLD","comment":"Blocked on external review"}' | jq
# Expected: progress_status=ON_HOLD, hold_reason="Blocked on external review"
```

- [ ] **Step 4: Verify a comment row was created and GET returns it**

```bash
curl -s "https://api.gebrils.cloud/api/development-plans/my/tasks/$TASK_ID/comments" \
    -H "Authorization: Bearer $TOKEN" | jq
# Expected: array with 1 entry whose body matches the hold comment
```

- [ ] **Step 5: Transition out of ON_HOLD, verify hold_reason clears**

```bash
curl -s -X PATCH "https://api.gebrils.cloud/api/development-plans/my/tasks/$TASK_ID/status" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d '{"status":"IN_PROGRESS"}' | jq
# Expected: progress_status=IN_PROGRESS, hold_reason=null
```

- [ ] **Step 6: Verify on_hold_tasks count updates in GET /my**

```bash
curl -s https://api.gebrils.cloud/api/development-plans/my \
    -H "Authorization: Bearer $TOKEN" | jq '.progress.on_hold_tasks'
# Expected: 0 (or the prior count minus 1)
```

- [ ] **Step 7: Smoke manager side — fetch comments for that user + task**

Using a manager token who is in that user's team scope:

```bash
MGR_TOKEN="<manager token>"
USER_ID="<target user>"
curl -s "https://api.gebrils.cloud/api/development-plans/$USER_ID/tasks/$TASK_ID/comments" \
    -H "Authorization: Bearer $MGR_TOKEN" | jq
# Expected: same comment list
```

- [ ] **Step 8: Run the graphify refresh so the knowledge graph reflects the new handlers**

Per `CLAUDE.md` rule for this project:

```bash
python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"
```

- [ ] **Step 9: Final commit — any docs or graph files updated**

```bash
git add graphify-out/ docs/superpowers/plans/2026-04-18-idp-data-model-on-hold-comments.md
git commit -m "docs(idp): add Plan A implementation plan and refresh graph"
```

---

## Self-Review Checklist

- **Spec coverage:**
  - ON_HOLD as a status (not a flag) → Task 1 (DB) + Task 2 (API).
  - Comment required when entering ON_HOLD → Task 2 (validation + 400 test).
  - Comment thread per task → Task 1 (table) + Task 5 (routes) + Task 6 (types).
  - Late-completion flag per task → Task 3 (compute) + Task 6 (type).
  - `on_hold_tasks` in plan progress + report summary → Task 3 + Task 4.
  - Manager access to comments scoped by `canAccessUser` → Task 5 (403 test).
- **Placeholder scan:** Every code step shows full code. No "TBD", no "similar to Task N," no "add error handling."
- **Type consistency:** `computeCompletedLate(task, completion)` is defined once in Task 3 and used identically by both `GET /my` and `GET /:userId`. The TS union `'TODO' | 'IN_PROGRESS' | 'ON_HOLD' | 'DONE'` matches the SQL CHECK constraint list and the JS `VALID` array exactly.
- **No UI work in this plan** — Plan B will consume the new fields and endpoints.
- **Route ordering** called out explicitly in Task 5 Step 3 (the `/:userId/tasks/...` handlers must precede the catch-all `/:userId` handler).
- **Migration safety:** uses `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`; the CHECK constraint is dropped + recreated so rolling the migration onto existing prod data is non-destructive (existing rows already satisfy the wider constraint).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-18-idp-data-model-on-hold-comments.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?

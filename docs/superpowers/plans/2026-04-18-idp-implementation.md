# Individual Development Planning (IDP) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing Journeys system to support per-user IDP plans for ACTIVE users, with manager oversight, progress tracking, and performance reporting.

**Architecture:** New `/development-plans` route namespace backed by existing `journeys/journey_chapters/journey_tasks` tables. IDP plans are distinguished by `plan_type = 'idp'` and bound to exactly one user via `owner_user_id`. The frontend `/journeys` page already title-switches for ACTIVE users — we extend it to fetch IDP data.

**Tech Stack:** Node/Express (API), PostgreSQL via `db.query()`, Jest + supertest (tests), Next.js/React + TypeScript (frontend), Tailwind CSS.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `database/migrations/022_idp_support.sql` | Schema changes for IDP |
| Create | `apps/api/src/routes/developmentPlans.js` | All IDP API endpoints |
| Create | `apps/api/__tests__/developmentPlans.test.js` | Unit tests for IDP routes |
| Modify | `apps/api/src/index.js` | Mount `/development-plans` route |
| Modify | `apps/api/src/routes/journeys.js` | Filter IDP plans from onboarding list |
| Modify | `apps/web/src/lib/api.ts` | Add IDP types + API client functions |
| Create | `apps/web/app/manage-development-plans/page.tsx` | Manager team IDP overview |
| Create | `apps/web/app/manage-development-plans/[userId]/page.tsx` | Manager IDP builder + progress |
| Modify | `apps/web/app/journeys/page.tsx` | Fetch IDP data for ACTIVE users |

---

## Task 1: Database Migration

**Files:**
- Create: `database/migrations/022_idp_support.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- database/migrations/022_idp_support.sql
-- Migration 022: IDP support — extends journeys system for per-user development plans

BEGIN;

-- 1. Distinguish IDP from onboarding journeys; bind IDP to one user
ALTER TABLE journeys
  ADD COLUMN IF NOT EXISTS plan_type TEXT NOT NULL DEFAULT 'onboarding'
    CHECK (plan_type IN ('onboarding', 'idp')),
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES app_user(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_by_manager UUID REFERENCES app_user(id);

-- 2. Objective-level due date (journey_chapters = Objectives in IDP)
ALTER TABLE journey_chapters
  ADD COLUMN IF NOT EXISTS due_date DATE;

-- 3. Task-level due date, priority, difficulty
ALTER TABLE journey_tasks
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS priority TEXT CHECK (priority IN ('low', 'medium', 'high')),
  ADD COLUMN IF NOT EXISTS difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard'));

-- 4. Tri-state task progress for IDP (TODO / IN_PROGRESS / DONE).
--    DEFAULT 'DONE' means all existing onboarding completion rows remain valid.
ALTER TABLE user_task_completions
  ADD COLUMN IF NOT EXISTS progress_status TEXT NOT NULL DEFAULT 'DONE'
    CHECK (progress_status IN ('TODO', 'IN_PROGRESS', 'DONE'));

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_journeys_owner_user ON journeys(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_journeys_plan_type  ON journeys(plan_type);

COMMENT ON COLUMN journeys.plan_type           IS 'onboarding = shared template; idp = per-user development plan';
COMMENT ON COLUMN journeys.owner_user_id       IS 'For IDP plans only: the ACTIVE user this plan belongs to';
COMMENT ON COLUMN journeys.created_by_manager  IS 'Manager who created this IDP plan';

COMMIT;
```

- [ ] **Step 2: Apply migration to the database**

```bash
docker exec -i supabase-db psql -U postgres -d postgres \
  < database/migrations/022_idp_support.sql
```

Expected output:
```
BEGIN
ALTER TABLE
ALTER TABLE
ALTER TABLE
ALTER TABLE
CREATE INDEX
CREATE INDEX
COMMENT
COMMENT
COMMENT
COMMIT
```

- [ ] **Step 3: Verify columns exist**

```bash
docker exec supabase-db psql -U postgres -d postgres -c \
  "\d journeys" | grep -E "plan_type|owner_user|created_by"
```

Expected: three rows showing the new columns.

- [ ] **Step 4: Commit**

```bash
git add database/migrations/022_idp_support.sql
git commit -m "feat(idp): add migration 022 — IDP schema extensions"
```

---

## Task 2: API Route — Create Plan & Get Plan

**Files:**
- Create: `apps/api/src/routes/developmentPlans.js`
- Create: `apps/api/__tests__/developmentPlans.test.js`

- [ ] **Step 1: Write failing tests for POST /:userId and GET /:userId**

Create `apps/api/__tests__/developmentPlans.test.js`:

```js
'use strict';

process.env.SUPABASE_JWT_SECRET = 'test-secret';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery }));

jest.mock('jsonwebtoken', () => ({
    verify: jest.fn().mockReturnValue({ sub: 'supabase-uid' }),
}));

jest.mock('../src/middleware/teamAccess', () => ({
    canAccessUser: jest.fn(),
    getManagerTeamId: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const { canAccessUser } = require('../src/middleware/teamAccess');
const router = require('../src/routes/developmentPlans');

function makeApp() {
    const app = express();
    app.use(express.json());
    // Inject authenticated manager user
    app.use((req, _res, next) => {
        req.user = { id: 'manager-1', role: 'manager' };
        next();
    });
    app.use('/development-plans', router);
    return app;
}

afterEach(() => jest.clearAllMocks());

// ─── POST /:userId — create plan ─────────────────────────────────────────────

describe('POST /development-plans/:userId', () => {
    test('returns 404 when user not found', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery.mockResolvedValueOnce({ rows: [] }); // user lookup
        const res = await request(makeApp())
            .post('/development-plans/user-1')
            .send({ title: 'Q2 Plan' });
        expect(res.status).toBe(404);
    });

    test('returns 400 when user is not ACTIVE', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: 'user-1', status: 'PREPARATION', name: 'Sara' }],
        });
        const res = await request(makeApp())
            .post('/development-plans/user-1')
            .send({ title: 'Q2 Plan' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/ACTIVE/);
    });

    test('returns 409 when user already has an active IDP plan', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'user-1', status: 'ACTIVE', name: 'Sara' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'existing-plan' }] }); // existing plan check
        const res = await request(makeApp())
            .post('/development-plans/user-1')
            .send({ title: 'Q2 Plan' });
        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/already has/i);
    });

    test('returns 403 when manager cannot access user', async () => {
        canAccessUser.mockResolvedValueOnce(false);
        const res = await request(makeApp())
            .post('/development-plans/user-1')
            .send({ title: 'Q2 Plan' });
        expect(res.status).toBe(403);
    });

    test('creates plan and returns 201 on success', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'user-1', status: 'ACTIVE', name: 'Sara' }] })
            .mockResolvedValueOnce({ rows: [] })  // no existing plan
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1', title: 'Q2 Plan', plan_type: 'idp', owner_user_id: 'user-1' }] }) // INSERT journey
            .mockResolvedValueOnce({ rows: [{ id: 'assign-1' }] }); // INSERT user_journey_assignments
        const res = await request(makeApp())
            .post('/development-plans/user-1')
            .send({ title: 'Q2 Plan', description: 'Focus on leadership' });
        expect(res.status).toBe(201);
        expect(res.body.plan_type).toBe('idp');
        expect(res.body.owner_user_id).toBe('user-1');
    });
});

// ─── GET /:userId — get plan with progress ────────────────────────────────────

describe('GET /development-plans/:userId', () => {
    test('returns 404 when no active IDP plan exists', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery.mockResolvedValueOnce({ rows: [] }); // no plan
        const res = await request(makeApp()).get('/development-plans/user-1');
        expect(res.status).toBe(404);
    });

    test('returns plan with objectives and progress', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1', title: 'Q2 Plan', plan_type: 'idp', owner_user_id: 'user-1', is_active: true }] })
            .mockResolvedValueOnce({ rows: [{ id: 'ch-1', title: 'Leadership', due_date: '2026-06-01', journey_id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'q-1', chapter_id: 'ch-1' }] }) // system quest
            .mockResolvedValueOnce({ rows: [{ id: 't-1', quest_id: 'q-1', title: 'Read book', due_date: '2026-05-01', priority: 'high', is_mandatory: true }] })
            .mockResolvedValueOnce({ rows: [{ task_id: 't-1', progress_status: 'DONE' }] }); // completions
        const res = await request(makeApp()).get('/development-plans/user-1');
        expect(res.status).toBe(200);
        expect(res.body.objectives).toHaveLength(1);
        expect(res.body.progress.completion_pct).toBe(100);
    });

    test('returns 403 when manager cannot access user', async () => {
        canAccessUser.mockResolvedValueOnce(false);
        const res = await request(makeApp()).get('/development-plans/user-1');
        expect(res.status).toBe(403);
    });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/developmentPlans.test.js --no-coverage 2>&1 | tail -20
```

Expected: `Cannot find module '../src/routes/developmentPlans'`

- [ ] **Step 3: Create the route file with POST and GET implementations**

Create `apps/api/src/routes/developmentPlans.js`:

```js
'use strict';

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { canAccessUser } = require('../middleware/teamAccess');

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildProgress(tasks, completions) {
    const completionMap = new Map(completions.map(c => [c.task_id, c]));
    const total = tasks.length;
    const mandatory = tasks.filter(t => t.is_mandatory).length;
    let done = 0;
    let mandatoryDone = 0;
    let overdue = 0;
    const today = new Date().toISOString().slice(0, 10);

    for (const t of tasks) {
        const c = completionMap.get(t.id);
        const isDone = c?.progress_status === 'DONE';
        if (isDone) { done++; if (t.is_mandatory) mandatoryDone++; }
        if (!isDone && t.due_date && t.due_date < today) overdue++;
    }

    return {
        total_tasks: total,
        done_tasks: done,
        completion_pct: total > 0 ? Math.round((done / total) * 100) : 0,
        mandatory_tasks: mandatory,
        mandatory_done: mandatoryDone,
        overdue_tasks: overdue,
    };
}

async function getPlanForUser(userId) {
    const planResult = await db.query(
        `SELECT * FROM journeys WHERE owner_user_id = $1 AND plan_type = 'idp' AND is_active = true AND deleted_at IS NULL LIMIT 1`,
        [userId]
    );
    return planResult.rows[0] || null;
}

// ─── POST /:userId — create IDP plan ─────────────────────────────────────────

router.post('/:userId', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { title, description, required_xp = 0 } = req.body;

        if (!title) return res.status(400).json({ error: 'title is required' });

        const allowed = await canAccessUser(req.user, userId);
        if (!allowed) return res.status(403).json({ error: 'User is not in your team' });

        const userResult = await db.query(
            `SELECT id, status, name FROM app_user WHERE id = $1 AND active = true`,
            [userId]
        );
        if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });

        const user = userResult.rows[0];
        if (user.status !== 'ACTIVE') {
            return res.status(400).json({ error: 'IDP plans can only be created for ACTIVE users' });
        }

        const existingPlan = await db.query(
            `SELECT id FROM journeys WHERE owner_user_id = $1 AND plan_type = 'idp' AND is_active = true AND deleted_at IS NULL`,
            [userId]
        );
        if (existingPlan.rows.length > 0) {
            return res.status(409).json({ error: 'User already has an active IDP plan' });
        }

        const slug = `idp-${userId}-${Date.now()}`;
        const planResult = await db.query(
            `INSERT INTO journeys (slug, title, description, plan_type, owner_user_id, created_by_manager, is_active, required_xp)
             VALUES ($1, $2, $3, 'idp', $4, $5, true, $6) RETURNING *`,
            [slug, title, description || null, userId, req.user.id, required_xp]
        );
        const plan = planResult.rows[0];

        await db.query(
            `INSERT INTO user_journey_assignments (user_id, journey_id) VALUES ($1, $2)`,
            [userId, plan.id]
        );

        res.status(201).json(plan);
    } catch (err) { next(err); }
});

// ─── GET /:userId — get plan with objectives, tasks, progress ─────────────────

router.get('/:userId', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { userId } = req.params;

        const allowed = await canAccessUser(req.user, userId);
        if (!allowed) return res.status(403).json({ error: 'User is not in your team' });

        const plan = await getPlanForUser(userId);
        if (!plan) return res.status(404).json({ error: 'No active IDP plan found for this user' });

        const chapters = await db.query(
            `SELECT * FROM journey_chapters WHERE journey_id = $1 ORDER BY sort_order`,
            [plan.id]
        );
        const chapterIds = chapters.rows.map(c => c.id);

        let quests = [];
        let tasks = [];
        let completions = [];

        if (chapterIds.length > 0) {
            quests = (await db.query(
                `SELECT * FROM journey_quests WHERE chapter_id = ANY($1)`, [chapterIds]
            )).rows;
            const questIds = quests.map(q => q.id);
            if (questIds.length > 0) {
                tasks = (await db.query(
                    `SELECT * FROM journey_tasks WHERE quest_id = ANY($1) ORDER BY sort_order`, [questIds]
                )).rows;
                const taskIds = tasks.map(t => t.id);
                if (taskIds.length > 0) {
                    completions = (await db.query(
                        `SELECT * FROM user_task_completions WHERE user_id = $1 AND task_id = ANY($2)`,
                        [userId, taskIds]
                    )).rows;
                }
            }
        }

        const completionMap = new Map(completions.map(c => [c.task_id, c]));
        const today = new Date().toISOString().slice(0, 10);

        const objectives = chapters.rows.map(ch => {
            const chQuest = quests.find(q => q.chapter_id === ch.id);
            const chTasks = chQuest ? tasks.filter(t => t.quest_id === chQuest.id) : [];
            const chCompletions = chTasks.map(t => completionMap.get(t.id)).filter(Boolean);
            const done = chCompletions.filter(c => c.progress_status === 'DONE').length;
            const overdue = chTasks.filter(t => {
                const c = completionMap.get(t.id);
                return (!c || c.progress_status !== 'DONE') && t.due_date && t.due_date < today;
            }).length;

            return {
                id: ch.id,
                title: ch.title,
                description: ch.description,
                due_date: ch.due_date,
                sort_order: ch.sort_order,
                progress: {
                    total: chTasks.length,
                    done,
                    completion_pct: chTasks.length > 0 ? Math.round((done / chTasks.length) * 100) : 0,
                    overdue,
                },
                tasks: chTasks.map(t => {
                    const c = completionMap.get(t.id);
                    return {
                        id: t.id,
                        title: t.title,
                        description: t.description,
                        due_date: t.due_date,
                        priority: t.priority,
                        difficulty: t.difficulty,
                        is_mandatory: t.is_mandatory,
                        progress_status: c?.progress_status || 'TODO',
                        completed_at: c?.completed_at || null,
                    };
                }),
            };
        });

        const allProgress = buildProgress(tasks, completions);

        res.json({ ...plan, objectives, progress: allProgress });
    } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/developmentPlans.test.js --no-coverage 2>&1 | tail -20
```

Expected: all tests in the `POST` and `GET` describe blocks pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/developmentPlans.js apps/api/__tests__/developmentPlans.test.js
git commit -m "feat(idp): add POST and GET /development-plans/:userId"
```

---

## Task 3: API Route — Objectives CRUD

**Files:**
- Modify: `apps/api/src/routes/developmentPlans.js`
- Modify: `apps/api/__tests__/developmentPlans.test.js`

- [ ] **Step 1: Add failing tests for objective endpoints**

Append to `apps/api/__tests__/developmentPlans.test.js`:

```js
// ─── POST /:userId/objectives ─────────────────────────────────────────────────

describe('POST /development-plans/:userId/objectives', () => {
    test('returns 404 when no active plan exists', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery.mockResolvedValueOnce({ rows: [] }); // no plan
        const res = await request(makeApp())
            .post('/development-plans/user-1/objectives')
            .send({ title: 'Leadership' });
        expect(res.status).toBe(404);
    });

    test('creates objective (chapter + system quest) and returns 201', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1', plan_type: 'idp' }] }) // plan lookup
            .mockResolvedValueOnce({ rows: [{ id: 'ch-1', title: 'Leadership', journey_id: 'plan-1' }] }) // INSERT chapter
            .mockResolvedValueOnce({ rows: [{ id: 'q-1' }] }); // INSERT system quest
        const res = await request(makeApp())
            .post('/development-plans/user-1/objectives')
            .send({ title: 'Leadership', due_date: '2026-06-01' });
        expect(res.status).toBe(201);
        expect(res.body.id).toBe('ch-1');
    });
});

// ─── PATCH /:userId/objectives/:chapterId ────────────────────────────────────

describe('PATCH /development-plans/:userId/objectives/:chapterId', () => {
    test('returns 404 when objective not found in plan', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] }) // plan
            .mockResolvedValueOnce({ rows: [] }); // chapter not found
        const res = await request(makeApp())
            .patch('/development-plans/user-1/objectives/ch-99')
            .send({ title: 'Updated' });
        expect(res.status).toBe(404);
    });

    test('updates objective and returns 200', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'ch-1', title: 'Updated', due_date: '2026-07-01' }] });
        const res = await request(makeApp())
            .patch('/development-plans/user-1/objectives/ch-1')
            .send({ title: 'Updated', due_date: '2026-07-01' });
        expect(res.status).toBe(200);
        expect(res.body.title).toBe('Updated');
    });
});

// ─── DELETE /:userId/objectives/:chapterId ───────────────────────────────────

describe('DELETE /development-plans/:userId/objectives/:chapterId', () => {
    test('returns 404 when objective not found', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [] }); // chapter not found
        const res = await request(makeApp())
            .delete('/development-plans/user-1/objectives/ch-99');
        expect(res.status).toBe(404);
    });

    test('deletes objective and returns 200', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'ch-1' }] }) // chapter found
            .mockResolvedValueOnce({ rows: [] }); // DELETE chapter
        const res = await request(makeApp())
            .delete('/development-plans/user-1/objectives/ch-1');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/developmentPlans.test.js --no-coverage 2>&1 | grep -E "FAIL|PASS|✓|✗|×|●" | tail -20
```

Expected: new describe blocks fail with 404 errors (routes don't exist yet).

- [ ] **Step 3: Add objective endpoints to the route file**

Append before `module.exports = router;` in `apps/api/src/routes/developmentPlans.js`:

```js
// ─── POST /:userId/objectives — add objective (chapter + system quest) ────────

router.post('/:userId/objectives', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { title, description, due_date, sort_order = 0 } = req.body;
        if (!title) return res.status(400).json({ error: 'title is required' });

        const allowed = await canAccessUser(req.user, userId);
        if (!allowed) return res.status(403).json({ error: 'User is not in your team' });

        const plan = await getPlanForUser(userId);
        if (!plan) return res.status(404).json({ error: 'No active IDP plan found' });

        const slug = `obj-${Date.now()}`;
        const chapterResult = await db.query(
            `INSERT INTO journey_chapters (journey_id, slug, title, description, due_date, sort_order, is_mandatory, xp_reward)
             VALUES ($1, $2, $3, $4, $5, $6, true, 0) RETURNING *`,
            [plan.id, slug, title, description || null, due_date || null, sort_order]
        );
        const chapter = chapterResult.rows[0];

        // Auto-create the single system quest that holds all tasks for this objective
        await db.query(
            `INSERT INTO journey_quests (chapter_id, slug, title, sort_order, is_mandatory)
             VALUES ($1, $2, 'Tasks', 0, true)`,
            [chapter.id, `idp-tasks-${chapter.id}`]
        );

        res.status(201).json(chapter);
    } catch (err) { next(err); }
});

// ─── PATCH /:userId/objectives/:chapterId — update objective ──────────────────

router.patch('/:userId/objectives/:chapterId', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { userId, chapterId } = req.params;
        const { title, description, due_date, sort_order } = req.body;

        const allowed = await canAccessUser(req.user, userId);
        if (!allowed) return res.status(403).json({ error: 'User is not in your team' });

        const plan = await getPlanForUser(userId);
        if (!plan) return res.status(404).json({ error: 'No active IDP plan found' });

        const fields = [];
        const values = [];
        let idx = 1;
        if (title !== undefined)       { fields.push(`title = $${idx++}`);       values.push(title); }
        if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
        if (due_date !== undefined)    { fields.push(`due_date = $${idx++}`);    values.push(due_date); }
        if (sort_order !== undefined)  { fields.push(`sort_order = $${idx++}`);  values.push(sort_order); }
        if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

        fields.push(`updated_at = NOW()`);
        values.push(chapterId, plan.id);
        const result = await db.query(
            `UPDATE journey_chapters SET ${fields.join(', ')} WHERE id = $${idx} AND journey_id = $${idx + 1} RETURNING *`,
            values
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Objective not found' });
        res.json(result.rows[0]);
    } catch (err) { next(err); }
});

// ─── DELETE /:userId/objectives/:chapterId — delete objective ─────────────────

router.delete('/:userId/objectives/:chapterId', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { userId, chapterId } = req.params;

        const allowed = await canAccessUser(req.user, userId);
        if (!allowed) return res.status(403).json({ error: 'User is not in your team' });

        const plan = await getPlanForUser(userId);
        if (!plan) return res.status(404).json({ error: 'No active IDP plan found' });

        // Verify chapter belongs to this plan
        const check = await db.query(
            `SELECT id FROM journey_chapters WHERE id = $1 AND journey_id = $2`, [chapterId, plan.id]
        );
        if (check.rows.length === 0) return res.status(404).json({ error: 'Objective not found' });

        // Cascade: delete chapter (quests and tasks cascade via FK in DB)
        await db.query(`DELETE FROM journey_chapters WHERE id = $1`, [chapterId]);

        res.json({ success: true });
    } catch (err) { next(err); }
});
```

- [ ] **Step 4: Run all tests and confirm they pass**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/developmentPlans.test.js --no-coverage 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/developmentPlans.js apps/api/__tests__/developmentPlans.test.js
git commit -m "feat(idp): add objective CRUD endpoints"
```

---

## Task 4: API Route — Tasks CRUD

**Files:**
- Modify: `apps/api/src/routes/developmentPlans.js`
- Modify: `apps/api/__tests__/developmentPlans.test.js`

- [ ] **Step 1: Add failing tests for task endpoints**

Append to `apps/api/__tests__/developmentPlans.test.js`:

```js
// ─── POST /:userId/objectives/:chapterId/tasks ────────────────────────────────

describe('POST /development-plans/:userId/objectives/:chapterId/tasks', () => {
    test('returns 404 when system quest not found for chapter', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] }) // plan
            .mockResolvedValueOnce({ rows: [] }); // no system quest found
        const res = await request(makeApp())
            .post('/development-plans/user-1/objectives/ch-1/tasks')
            .send({ title: 'Read book' });
        expect(res.status).toBe(404);
    });

    test('creates task and returns 201', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'q-1' }] }) // system quest
            .mockResolvedValueOnce({ rows: [{ id: 't-1', title: 'Read book', quest_id: 'q-1' }] }); // INSERT task
        const res = await request(makeApp())
            .post('/development-plans/user-1/objectives/ch-1/tasks')
            .send({ title: 'Read book', due_date: '2026-05-01', priority: 'high' });
        expect(res.status).toBe(201);
        expect(res.body.title).toBe('Read book');
    });
});

// ─── PATCH /:userId/tasks/:taskId ────────────────────────────────────────────

describe('PATCH /development-plans/:userId/tasks/:taskId', () => {
    test('returns 404 when task not in plan', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [] }); // task not found
        const res = await request(makeApp())
            .patch('/development-plans/user-1/tasks/t-99')
            .send({ title: 'Updated' });
        expect(res.status).toBe(404);
    });

    test('updates task fields and returns 200', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 't-1', title: 'Updated', priority: 'low' }] });
        const res = await request(makeApp())
            .patch('/development-plans/user-1/tasks/t-1')
            .send({ title: 'Updated', priority: 'low' });
        expect(res.status).toBe(200);
        expect(res.body.priority).toBe('low');
    });
});

// ─── DELETE /:userId/tasks/:taskId ───────────────────────────────────────────

describe('DELETE /development-plans/:userId/tasks/:taskId', () => {
    test('deletes task and returns 200', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 't-1' }] }) // task found
            .mockResolvedValueOnce({ rows: [] }); // DELETE
        const res = await request(makeApp())
            .delete('/development-plans/user-1/tasks/t-1');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/developmentPlans.test.js --no-coverage 2>&1 | grep -E "FAIL|✗|×|●" | head -10
```

- [ ] **Step 3: Add task endpoints to the route file**

Append before `module.exports = router;` in `apps/api/src/routes/developmentPlans.js`:

```js
// ─── POST /:userId/objectives/:chapterId/tasks — add action item ──────────────

router.post('/:userId/objectives/:chapterId/tasks', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { userId, chapterId } = req.params;
        const { title, description, due_date, priority, difficulty, is_mandatory = true, sort_order = 0 } = req.body;
        if (!title) return res.status(400).json({ error: 'title is required' });

        const allowed = await canAccessUser(req.user, userId);
        if (!allowed) return res.status(403).json({ error: 'User is not in your team' });

        const plan = await getPlanForUser(userId);
        if (!plan) return res.status(404).json({ error: 'No active IDP plan found' });

        // Find the system quest for this chapter
        const questResult = await db.query(
            `SELECT jq.id FROM journey_quests jq
             JOIN journey_chapters jc ON jq.chapter_id = jc.id
             WHERE jq.chapter_id = $1 AND jc.journey_id = $2 LIMIT 1`,
            [chapterId, plan.id]
        );
        if (questResult.rows.length === 0) return res.status(404).json({ error: 'Objective not found' });
        const questId = questResult.rows[0].id;

        const slug = `task-${Date.now()}`;
        const taskResult = await db.query(
            `INSERT INTO journey_tasks (quest_id, slug, title, description, due_date, priority, difficulty, is_mandatory, sort_order, validation_type, validation_config)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'none', '{}') RETURNING *`,
            [questId, slug, title, description || null, due_date || null, priority || null, difficulty || null, is_mandatory, sort_order]
        );
        res.status(201).json(taskResult.rows[0]);
    } catch (err) { next(err); }
});

// ─── PATCH /:userId/tasks/:taskId — update task ───────────────────────────────

router.patch('/:userId/tasks/:taskId', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { userId, taskId } = req.params;
        const { title, description, due_date, priority, difficulty, is_mandatory, sort_order } = req.body;

        const allowed = await canAccessUser(req.user, userId);
        if (!allowed) return res.status(403).json({ error: 'User is not in your team' });

        const plan = await getPlanForUser(userId);
        if (!plan) return res.status(404).json({ error: 'No active IDP plan found' });

        const fields = [];
        const values = [];
        let idx = 1;
        if (title !== undefined)        { fields.push(`title = $${idx++}`);        values.push(title); }
        if (description !== undefined)  { fields.push(`description = $${idx++}`);  values.push(description); }
        if (due_date !== undefined)     { fields.push(`due_date = $${idx++}`);     values.push(due_date); }
        if (priority !== undefined)     { fields.push(`priority = $${idx++}`);     values.push(priority); }
        if (difficulty !== undefined)   { fields.push(`difficulty = $${idx++}`);   values.push(difficulty); }
        if (is_mandatory !== undefined) { fields.push(`is_mandatory = $${idx++}`); values.push(is_mandatory); }
        if (sort_order !== undefined)   { fields.push(`sort_order = $${idx++}`);   values.push(sort_order); }
        if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

        fields.push(`updated_at = NOW()`);
        values.push(taskId);

        // Verify task belongs to this plan
        const result = await db.query(
            `UPDATE journey_tasks SET ${fields.join(', ')}
             WHERE id = $${idx}
               AND quest_id IN (
                 SELECT jq.id FROM journey_quests jq
                 JOIN journey_chapters jc ON jq.chapter_id = jc.id
                 WHERE jc.journey_id = $${idx + 1}
               )
             RETURNING *`,
            [...values, plan.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found in this plan' });
        res.json(result.rows[0]);
    } catch (err) { next(err); }
});

// ─── DELETE /:userId/tasks/:taskId — delete task ──────────────────────────────

router.delete('/:userId/tasks/:taskId', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { userId, taskId } = req.params;

        const allowed = await canAccessUser(req.user, userId);
        if (!allowed) return res.status(403).json({ error: 'User is not in your team' });

        const plan = await getPlanForUser(userId);
        if (!plan) return res.status(404).json({ error: 'No active IDP plan found' });

        const check = await db.query(
            `SELECT jt.id FROM journey_tasks jt
             JOIN journey_quests jq ON jt.quest_id = jq.id
             JOIN journey_chapters jc ON jq.chapter_id = jc.id
             WHERE jt.id = $1 AND jc.journey_id = $2`,
            [taskId, plan.id]
        );
        if (check.rows.length === 0) return res.status(404).json({ error: 'Task not found in this plan' });

        await db.query(`DELETE FROM journey_tasks WHERE id = $1`, [taskId]);
        res.json({ success: true });
    } catch (err) { next(err); }
});
```

- [ ] **Step 4: Run all tests and confirm they pass**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/developmentPlans.test.js --no-coverage 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/developmentPlans.js apps/api/__tests__/developmentPlans.test.js
git commit -m "feat(idp): add task CRUD endpoints"
```

---

## Task 5: API Route — User endpoints, Complete Plan, Report

**Files:**
- Modify: `apps/api/src/routes/developmentPlans.js`
- Modify: `apps/api/__tests__/developmentPlans.test.js`

- [ ] **Step 1: Add failing tests**

Append to `apps/api/__tests__/developmentPlans.test.js`:

```js
// ─── User app — makeApp with user role ────────────────────────────────────────

function makeUserApp(userId = 'user-1') {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.user = { id: userId, role: 'user' };
        next();
    });
    app.use('/development-plans', router);
    return app;
}

// ─── GET /my ─────────────────────────────────────────────────────────────────

describe('GET /development-plans/my', () => {
    test('returns 404 when user has no active IDP plan', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });
        const res = await request(makeUserApp()).get('/development-plans/my');
        expect(res.status).toBe(404);
    });

    test('returns plan with objectives for ACTIVE user', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1', title: 'Q2 Plan', plan_type: 'idp', owner_user_id: 'user-1', is_active: true }] })
            .mockResolvedValueOnce({ rows: [] }) // chapters
            .mockResolvedValueOnce({ rows: [] }) // no quests
            .mockResolvedValueOnce({ rows: [] }) // no tasks
            .mockResolvedValueOnce({ rows: [] }); // no completions
        const res = await request(makeUserApp()).get('/development-plans/my');
        expect(res.status).toBe(200);
        expect(res.body.title).toBe('Q2 Plan');
    });
});

// ─── PATCH /my/tasks/:taskId/status ─────────────────────────────────────────

describe('PATCH /development-plans/my/tasks/:taskId/status', () => {
    test('returns 400 for invalid status value', async () => {
        const res = await request(makeUserApp())
            .patch('/development-plans/my/tasks/t-1/status')
            .send({ status: 'INVALID' });
        expect(res.status).toBe(400);
    });

    test('inserts IN_PROGRESS completion row', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] }) // plan
            .mockResolvedValueOnce({ rows: [{ id: 't-1' }] }) // task in plan
            .mockResolvedValueOnce({ rows: [{ task_id: 't-1', progress_status: 'IN_PROGRESS' }] }); // upsert
        const res = await request(makeUserApp())
            .patch('/development-plans/my/tasks/t-1/status')
            .send({ status: 'IN_PROGRESS' });
        expect(res.status).toBe(200);
        expect(res.body.progress_status).toBe('IN_PROGRESS');
    });

    test('deletes completion row when status is TODO', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 't-1' }] })
            .mockResolvedValueOnce({ rows: [] }); // DELETE
        const res = await request(makeUserApp())
            .patch('/development-plans/my/tasks/t-1/status')
            .send({ status: 'TODO' });
        expect(res.status).toBe(200);
        expect(res.body.progress_status).toBe('TODO');
    });
});

// ─── POST /:userId/complete ───────────────────────────────────────────────────

describe('POST /development-plans/:userId/complete', () => {
    test('returns 400 when mandatory tasks are incomplete', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1', required_xp: 100 }] }) // plan
            .mockResolvedValueOnce({ rows: [{ incomplete_mandatory: '2' }] }); // incomplete check
        const res = await request(makeApp())
            .post('/development-plans/user-1/complete');
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/incomplete/i);
    });

    test('marks plan complete and awards XP', async () => {
        canAccessUser.mockResolvedValueOnce(true);
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'plan-1', required_xp: 100, owner_user_id: 'user-1' }] })
            .mockResolvedValueOnce({ rows: [{ incomplete_mandatory: '0' }] }) // all done
            .mockResolvedValueOnce({ rows: [] }) // UPDATE journeys is_active=false
            .mockResolvedValueOnce({ rows: [] }) // UPDATE user_journey_assignments total_xp
            .mockResolvedValueOnce({ rows: [] }); // INSERT notification
        const res = await request(makeApp())
            .post('/development-plans/user-1/complete');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/developmentPlans.test.js --no-coverage 2>&1 | grep -c "●"
```

Expected: several failures.

- [ ] **Step 3: Add user endpoints and complete + report endpoints**

Append before `module.exports = router;` in `apps/api/src/routes/developmentPlans.js`:

```js
// ─── GET /my — user views own IDP plan ───────────────────────────────────────

router.get('/my', requireAuth, async (req, res, next) => {
    try {
        const userId = req.user.id;
        const plan = await getPlanForUser(userId);
        if (!plan) return res.status(404).json({ error: 'No active IDP plan found' });

        const chapters = await db.query(
            `SELECT * FROM journey_chapters WHERE journey_id = $1 ORDER BY sort_order`, [plan.id]
        );
        const chapterIds = chapters.rows.map(c => c.id);
        let quests = [], tasks = [], completions = [];

        if (chapterIds.length > 0) {
            quests = (await db.query(`SELECT * FROM journey_quests WHERE chapter_id = ANY($1)`, [chapterIds])).rows;
            const questIds = quests.map(q => q.id);
            if (questIds.length > 0) {
                tasks = (await db.query(`SELECT * FROM journey_tasks WHERE quest_id = ANY($1) ORDER BY sort_order`, [questIds])).rows;
                const taskIds = tasks.map(t => t.id);
                if (taskIds.length > 0) {
                    completions = (await db.query(
                        `SELECT * FROM user_task_completions WHERE user_id = $1 AND task_id = ANY($2)`, [userId, taskIds]
                    )).rows;
                }
            }
        }

        const completionMap = new Map(completions.map(c => [c.task_id, c]));
        const today = new Date().toISOString().slice(0, 10);

        const objectives = chapters.rows.map(ch => {
            const chQuest = quests.find(q => q.chapter_id === ch.id);
            const chTasks = chQuest ? tasks.filter(t => t.quest_id === chQuest.id) : [];
            const done = chTasks.filter(t => completionMap.get(t.id)?.progress_status === 'DONE').length;
            return {
                id: ch.id,
                title: ch.title,
                description: ch.description,
                due_date: ch.due_date,
                progress: {
                    total: chTasks.length,
                    done,
                    completion_pct: chTasks.length > 0 ? Math.round((done / chTasks.length) * 100) : 0,
                },
                tasks: chTasks.map(t => {
                    const c = completionMap.get(t.id);
                    const isOverdue = !c || c.progress_status !== 'DONE';
                    return {
                        id: t.id,
                        title: t.title,
                        description: t.description,
                        due_date: t.due_date,
                        priority: t.priority,
                        difficulty: t.difficulty,
                        is_mandatory: t.is_mandatory,
                        progress_status: c?.progress_status || 'TODO',
                        is_overdue: isOverdue && t.due_date && t.due_date < today,
                        completed_at: c?.completed_at || null,
                    };
                }),
            };
        });

        res.json({ ...plan, objectives, progress: buildProgress(tasks, completions) });
    } catch (err) { next(err); }
});

// ─── PATCH /my/tasks/:taskId/status — update task status ─────────────────────

router.patch('/my/tasks/:taskId/status', requireAuth, async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { taskId } = req.params;
        const { status } = req.body;

        const VALID = ['TODO', 'IN_PROGRESS', 'DONE'];
        if (!VALID.includes(status)) {
            return res.status(400).json({ error: `status must be one of: ${VALID.join(', ')}` });
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
            return res.json({ task_id: taskId, progress_status: 'TODO' });
        }

        const result = await db.query(
            `INSERT INTO user_task_completions (user_id, task_id, progress_status)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, task_id) DO UPDATE SET progress_status = $3, completed_at = CASE WHEN $3 = 'DONE' THEN NOW() ELSE null END
             RETURNING *`,
            [userId, taskId, status]
        );
        res.json(result.rows[0]);
    } catch (err) { next(err); }
});

// ─── POST /:userId/complete — mark plan complete + award XP ──────────────────

router.post('/:userId/complete', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { userId } = req.params;

        const allowed = await canAccessUser(req.user, userId);
        if (!allowed) return res.status(403).json({ error: 'User is not in your team' });

        const plan = await getPlanForUser(userId);
        if (!plan) return res.status(404).json({ error: 'No active IDP plan found' });

        // Check no incomplete mandatory tasks remain
        const incompleteResult = await db.query(
            `SELECT COUNT(*) AS incomplete_mandatory
             FROM journey_tasks jt
             JOIN journey_quests jq ON jt.quest_id = jq.id
             JOIN journey_chapters jc ON jq.chapter_id = jc.id
             WHERE jc.journey_id = $1 AND jt.is_mandatory = true
               AND NOT EXISTS (
                 SELECT 1 FROM user_task_completions utc
                 WHERE utc.task_id = jt.id AND utc.user_id = $2 AND utc.progress_status = 'DONE'
               )`,
            [plan.id, userId]
        );
        const incomplete = parseInt(incompleteResult.rows[0].incomplete_mandatory) || 0;
        if (incomplete > 0) {
            return res.status(400).json({ error: `${incomplete} mandatory task(s) are still incomplete` });
        }

        await db.query(`UPDATE journeys SET is_active = false, updated_at = NOW() WHERE id = $1`, [plan.id]);
        await db.query(
            `UPDATE user_journey_assignments SET total_xp = total_xp + $1 WHERE user_id = $2 AND journey_id = $3`,
            [plan.required_xp || 0, userId, plan.id]
        );
        await db.query(
            `INSERT INTO notification (user_id, type, title, message) VALUES ($1, 'IDP_COMPLETED', 'Development Plan Completed', 'Congratulations! Your development plan has been marked complete.')`,
            [userId]
        );

        res.json({ success: true });
    } catch (err) { next(err); }
});

// ─── GET /:userId/report — performance report ─────────────────────────────────

router.get('/:userId/report', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { userId } = req.params;

        const allowed = await canAccessUser(req.user, userId);
        if (!allowed) return res.status(403).json({ error: 'User is not in your team' });

        const userResult = await db.query(`SELECT id, name, email FROM app_user WHERE id = $1`, [userId]);
        if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });

        const plan = await getPlanForUser(userId);
        if (!plan) return res.status(404).json({ error: 'No active IDP plan found' });

        const chapters = await db.query(
            `SELECT * FROM journey_chapters WHERE journey_id = $1 ORDER BY sort_order`, [plan.id]
        );
        const chapterIds = chapters.rows.map(c => c.id);
        let quests = [], tasks = [], completions = [];

        if (chapterIds.length > 0) {
            quests = (await db.query(`SELECT * FROM journey_quests WHERE chapter_id = ANY($1)`, [chapterIds])).rows;
            const questIds = quests.map(q => q.id);
            if (questIds.length > 0) {
                tasks = (await db.query(`SELECT * FROM journey_tasks WHERE quest_id = ANY($1)`, [questIds])).rows;
                const taskIds = tasks.map(t => t.id);
                if (taskIds.length > 0) {
                    completions = (await db.query(
                        `SELECT * FROM user_task_completions WHERE user_id = $1 AND task_id = ANY($2)`, [userId, taskIds]
                    )).rows;
                }
            }
        }

        const completionMap = new Map(completions.map(c => [c.task_id, c]));
        const today = new Date().toISOString().slice(0, 10);

        let doneOnTime = 0;
        let doneLate = 0;

        const objectivesReport = chapters.rows.map(ch => {
            const chQuest = quests.find(q => q.chapter_id === ch.id);
            const chTasks = chQuest ? tasks.filter(t => t.quest_id === chQuest.id) : [];
            const done = chTasks.filter(t => completionMap.get(t.id)?.progress_status === 'DONE').length;

            return {
                title: ch.title,
                due_date: ch.due_date,
                completion_pct: chTasks.length > 0 ? Math.round((done / chTasks.length) * 100) : 0,
                tasks: chTasks.map(t => {
                    const c = completionMap.get(t.id);
                    const isDone = c?.progress_status === 'DONE';
                    const completedDate = c?.completed_at ? c.completed_at.toISOString?.().slice(0, 10) : null;
                    const onTime = isDone && t.due_date ? completedDate <= t.due_date : null;
                    if (isDone) { onTime ? doneOnTime++ : doneLate++; }
                    return {
                        title: t.title,
                        status: c?.progress_status || 'TODO',
                        due_date: t.due_date,
                        completed_at: c?.completed_at || null,
                        on_time: onTime,
                    };
                }),
            };
        });

        const totalTasks = tasks.length;
        const completedTasks = completions.filter(c => c.progress_status === 'DONE').length;
        const overdueTasks = tasks.filter(t => {
            const c = completionMap.get(t.id);
            return (!c || c.progress_status !== 'DONE') && t.due_date && t.due_date < today;
        }).length;

        res.json({
            user: userResult.rows[0],
            plan: { title: plan.title, created_at: plan.created_at, is_active: plan.is_active },
            summary: {
                total_tasks: totalTasks,
                completed_tasks: completedTasks,
                completion_pct: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
                overdue_tasks: overdueTasks,
                on_time_completed: doneOnTime,
                late_completed: doneLate,
            },
            objectives: objectivesReport,
        });
    } catch (err) { next(err); }
});
```

- [ ] **Step 4: Run all tests and confirm they pass**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/developmentPlans.test.js --no-coverage 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/developmentPlans.js apps/api/__tests__/developmentPlans.test.js
git commit -m "feat(idp): add user endpoints, plan completion, and report"
```

---

## Task 6: Mount Route + Filter Onboarding Queries

**Files:**
- Modify: `apps/api/src/index.js:48-51`
- Modify: `apps/api/src/routes/journeys.js:18-36`

- [ ] **Step 1: Mount the development-plans route in index.js**

In `apps/api/src/index.js`, add after line 50 (`apiRouter.use('/manager', ...)`):

```js
apiRouter.use('/development-plans', require('./routes/developmentPlans'));
```

- [ ] **Step 2: Filter IDP plans from the onboarding journeys list**

In `apps/api/src/routes/journeys.js`, the `GET /journeys` query at line 20 currently fetches all journeys. Add `AND j.plan_type = 'onboarding'` to exclude IDP plans:

```js
// Change this (line ~20):
WHERE j.deleted_at IS NULL

// To this:
WHERE j.deleted_at IS NULL AND (j.plan_type = 'onboarding' OR j.plan_type IS NULL)
```

- [ ] **Step 3: Verify the API starts without errors**

```bash
docker logs qc-api --tail 20 2>&1 | grep -E "error|Error|running"
```

Or do a quick local test:

```bash
cd /root/QC-Manager/apps/api && node -e "require('./src/routes/developmentPlans'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 4: Run the full test suite to check for regressions**

```bash
cd /root/QC-Manager/apps/api && npx jest --no-coverage 2>&1 | tail -10
```

Expected: all existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/index.js apps/api/src/routes/journeys.js
git commit -m "feat(idp): mount development-plans route, filter IDPs from onboarding list"
```

---

## Task 7: Frontend — API Types and Client Functions

**Files:**
- Modify: `apps/web/src/lib/api.ts`

- [ ] **Step 1: Add IDP types and API functions**

Append to `apps/web/src/lib/api.ts`:

```ts
// ============================================================================
// IDP — Individual Development Plan Types
// ============================================================================

export interface IDPTask {
    id: string;
    title: string;
    description?: string;
    due_date?: string;
    priority?: 'low' | 'medium' | 'high';
    difficulty?: 'easy' | 'medium' | 'hard';
    is_mandatory: boolean;
    progress_status: 'TODO' | 'IN_PROGRESS' | 'DONE';
    is_overdue?: boolean;
    completed_at?: string | null;
}

export interface IDPObjective {
    id: string;
    title: string;
    description?: string;
    due_date?: string;
    sort_order: number;
    progress: {
        total: number;
        done: number;
        completion_pct: number;
        overdue?: number;
    };
    tasks: IDPTask[];
}

export interface IDPPlan {
    id: string;
    title: string;
    description?: string;
    plan_type: 'idp';
    owner_user_id: string;
    is_active: boolean;
    created_at: string;
    objectives: IDPObjective[];
    progress: {
        total_tasks: number;
        done_tasks: number;
        completion_pct: number;
        mandatory_tasks: number;
        mandatory_done: number;
        overdue_tasks: number;
    };
}

export interface IDPReport {
    user: { id: string; name: string; email: string };
    plan: { title: string; created_at: string; is_active: boolean };
    summary: {
        total_tasks: number;
        completed_tasks: number;
        completion_pct: number;
        overdue_tasks: number;
        on_time_completed: number;
        late_completed: number;
    };
    objectives: Array<{
        title: string;
        due_date?: string;
        completion_pct: number;
        tasks: Array<{
            title: string;
            status: 'TODO' | 'IN_PROGRESS' | 'DONE';
            due_date?: string;
            completed_at?: string | null;
            on_time?: boolean | null;
        }>;
    }>;
}

// ============================================================================
// IDP — API Client
// ============================================================================

export const developmentPlansApi = {
    // Manager: get plan for a user
    getForUser: (userId: string) =>
        fetchApi<IDPPlan>(`/api/development-plans/${userId}`),

    // Manager: create plan
    create: (userId: string, data: { title: string; description?: string; required_xp?: number }) =>
        fetchApi<IDPPlan>(`/api/development-plans/${userId}`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    // Manager: add objective
    addObjective: (userId: string, data: { title: string; description?: string; due_date?: string }) =>
        fetchApi<IDPObjective>(`/api/development-plans/${userId}/objectives`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    // Manager: update objective
    updateObjective: (userId: string, chapterId: string, data: { title?: string; description?: string; due_date?: string }) =>
        fetchApi<IDPObjective>(`/api/development-plans/${userId}/objectives/${chapterId}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        }),

    // Manager: delete objective
    deleteObjective: (userId: string, chapterId: string) =>
        fetchApi<{ success: boolean }>(`/api/development-plans/${userId}/objectives/${chapterId}`, {
            method: 'DELETE',
        }),

    // Manager: add task to objective
    addTask: (userId: string, chapterId: string, data: { title: string; description?: string; due_date?: string; priority?: string; difficulty?: string; is_mandatory?: boolean }) =>
        fetchApi<IDPTask>(`/api/development-plans/${userId}/objectives/${chapterId}/tasks`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    // Manager: update task
    updateTask: (userId: string, taskId: string, data: Partial<Pick<IDPTask, 'title' | 'description' | 'due_date' | 'priority' | 'difficulty' | 'is_mandatory'>>) =>
        fetchApi<IDPTask>(`/api/development-plans/${userId}/tasks/${taskId}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        }),

    // Manager: delete task
    deleteTask: (userId: string, taskId: string) =>
        fetchApi<{ success: boolean }>(`/api/development-plans/${userId}/tasks/${taskId}`, {
            method: 'DELETE',
        }),

    // Manager: complete plan
    completePlan: (userId: string) =>
        fetchApi<{ success: boolean }>(`/api/development-plans/${userId}/complete`, {
            method: 'POST',
        }),

    // Manager: get report
    getReport: (userId: string) =>
        fetchApi<IDPReport>(`/api/development-plans/${userId}/report`),

    // User: get own plan
    getMy: () =>
        fetchApi<IDPPlan>('/api/development-plans/my'),

    // User: update task status
    updateMyTaskStatus: (taskId: string, status: 'TODO' | 'IN_PROGRESS' | 'DONE') =>
        fetchApi<{ task_id: string; progress_status: string }>(`/api/development-plans/my/tasks/${taskId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status }),
        }),
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /root/QC-Manager/apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat(idp): add IDP types and API client functions"
```

---

## Task 8: Frontend — Manager IDP Team Overview Page

**Files:**
- Create: `apps/web/app/manage-development-plans/page.tsx`

- [ ] **Step 1: Create the manager team IDP overview page**

Create `apps/web/app/manage-development-plans/page.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { developmentPlansApi, IDPPlan } from '../../../src/lib/api';
import { fetchApi } from '../../../src/lib/api';

interface TeamMember {
    id: string;
    name: string;
    email: string;
    status: string;
}

interface MemberWithPlan extends TeamMember {
    plan: IDPPlan | null;
    planLoading: boolean;
}

export default function ManageDevelopmentPlansPage() {
    const [members, setMembers] = useState<MemberWithPlan[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        async function load() {
            try {
                const team = await fetchApi<TeamMember[]>('/api/manager/team?status=ACTIVE');
                const withPlans: MemberWithPlan[] = team.map(m => ({ ...m, plan: null, planLoading: true }));
                setMembers(withPlans);
                setIsLoading(false);

                // Load plans in parallel
                const planResults = await Promise.allSettled(
                    team.map(m => developmentPlansApi.getForUser(m.id))
                );
                setMembers(team.map((m, i) => ({
                    ...m,
                    plan: planResults[i].status === 'fulfilled' ? planResults[i].value : null,
                    planLoading: false,
                })));
            } catch {
                setIsLoading(false);
            }
        }
        load();
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto px-4 py-8">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Development Plans</h1>
            <p className="text-slate-500 dark:text-slate-400 mb-8">Manage individual development plans for your active team members.</p>

            {members.length === 0 ? (
                <div className="text-center py-16 text-slate-500 dark:text-slate-400">
                    No active team members found.
                </div>
            ) : (
                <div className="space-y-3">
                    {members.map(member => (
                        <div key={member.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold text-slate-900 dark:text-white truncate">{member.name}</p>
                                <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{member.email}</p>
                            </div>

                            <div className="flex-1 min-w-0">
                                {member.planLoading ? (
                                    <div className="h-2 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                                ) : member.plan ? (
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                                {member.plan.progress.completion_pct}%
                                            </span>
                                            {member.plan.progress.overdue_tasks > 0 && (
                                                <span className="text-xs bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 px-2 py-0.5 rounded-full">
                                                    {member.plan.progress.overdue_tasks} overdue
                                                </span>
                                            )}
                                        </div>
                                        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
                                            <div
                                                className="bg-indigo-500 h-1.5 rounded-full transition-all"
                                                style={{ width: `${member.plan.progress.completion_pct}%` }}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <span className="text-sm text-slate-400 dark:text-slate-500">No plan yet</span>
                                )}
                            </div>

                            <button
                                onClick={() => router.push(`/manage-development-plans/${member.id}`)}
                                className="shrink-0 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                            >
                                {member.plan ? 'View Plan' : 'Create Plan'}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /root/QC-Manager/apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/manage-development-plans/page.tsx
git commit -m "feat(idp): add manager team IDP overview page"
```

---

## Task 9: Frontend — Manager IDP Builder Page

**Files:**
- Create: `apps/web/app/manage-development-plans/[userId]/page.tsx`

- [ ] **Step 1: Create the IDP builder and progress page**

Create `apps/web/app/manage-development-plans/[userId]/page.tsx`:

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { developmentPlansApi, IDPPlan, IDPObjective } from '../../../../src/lib/api';

function showError(msg: string) { alert(msg); }
function showSuccess(msg: string) { console.log(msg); }

export default function IDPBuilderPage() {
    const params = useParams();
    const userId = params.userId as string;

    const [plan, setPlan] = useState<IDPPlan | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [noplan, setNoPlan] = useState(false);

    // New plan form
    const [newPlanTitle, setNewPlanTitle] = useState('');
    const [newPlanDesc, setNewPlanDesc] = useState('');
    const [creatingPlan, setCreatingPlan] = useState(false);

    // New objective form
    const [showObjForm, setShowObjForm] = useState(false);
    const [newObjTitle, setNewObjTitle] = useState('');
    const [newObjDue, setNewObjDue] = useState('');

    // New task form per objective
    const [addingTaskFor, setAddingTaskFor] = useState<string | null>(null);
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [newTaskDue, setNewTaskDue] = useState('');
    const [newTaskPriority, setNewTaskPriority] = useState<'low' | 'medium' | 'high'>('medium');

    const loadPlan = useCallback(async () => {
        try {
            const data = await developmentPlansApi.getForUser(userId);
            setPlan(data);
        } catch (err: any) {
            if (err.message?.includes('404') || err.status === 404) setNoPlan(true);
        } finally {
            setIsLoading(false);
        }
    }, [userId]);

    useEffect(() => { loadPlan(); }, [loadPlan]);

    async function handleCreatePlan() {
        if (!newPlanTitle.trim()) return;
        setCreatingPlan(true);
        try {
            await developmentPlansApi.create(userId, { title: newPlanTitle, description: newPlanDesc });
            setNoPlan(false);
            await loadPlan();
        } catch (err: any) {
            showError(err.message);
        } finally {
            setCreatingPlan(false);
        }
    }

    async function handleAddObjective() {
        if (!plan || !newObjTitle.trim()) return;
        try {
            await developmentPlansApi.addObjective(userId, { title: newObjTitle, due_date: newObjDue || undefined });
            setNewObjTitle('');
            setNewObjDue('');
            setShowObjForm(false);
            await loadPlan();
        } catch (err: any) {
            showError(err.message);
        }
    }

    async function handleDeleteObjective(chapterId: string) {
        if (!plan || !confirm('Delete this objective and all its tasks?')) return;
        try {
            await developmentPlansApi.deleteObjective(userId, chapterId);
            await loadPlan();
        } catch (err: any) {
            showError(err.message);
        }
    }

    async function handleAddTask(chapterId: string) {
        if (!plan || !newTaskTitle.trim()) return;
        try {
            await developmentPlansApi.addTask(userId, chapterId, {
                title: newTaskTitle,
                due_date: newTaskDue || undefined,
                priority: newTaskPriority,
            });
            setNewTaskTitle('');
            setNewTaskDue('');
            setNewTaskPriority('medium');
            setAddingTaskFor(null);
            await loadPlan();
        } catch (err: any) {
            showError(err.message);
        }
    }

    async function handleDeleteTask(taskId: string) {
        if (!plan || !confirm('Delete this task?')) return;
        try {
            await developmentPlansApi.deleteTask(userId, taskId);
            await loadPlan();
        } catch (err: any) {
            showError(err.message);
        }
    }

    async function handleCompletePlan() {
        if (!plan || !confirm('Mark this plan as complete? This action cannot be undone.')) return;
        try {
            await developmentPlansApi.completePlan(userId);
            showSuccess('Plan marked as complete!');
            await loadPlan();
        } catch (err: any) {
            showError(err.message);
        }
    }

    async function handleExportReport() {
        if (!plan) return;
        try {
            const report = await developmentPlansApi.getReport(userId);
            const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `idp-report-${userId}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err: any) {
            showError(err.message);
        }
    }

    const priorityColors: Record<string, string> = {
        low: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
        medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
        high: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    };

    const statusColors: Record<string, string> = {
        TODO: 'text-slate-400',
        IN_PROGRESS: 'text-indigo-500',
        DONE: 'text-emerald-500',
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
            </div>
        );
    }

    if (noplan) {
        return (
            <div className="max-w-xl mx-auto px-4 py-16">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Create Development Plan</h2>
                <p className="text-slate-500 dark:text-slate-400 mb-6">No active IDP plan exists for this user. Create one to get started.</p>
                <div className="space-y-3">
                    <input
                        className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="Plan title (e.g. Q2 2026 Development Plan)"
                        value={newPlanTitle}
                        onChange={e => setNewPlanTitle(e.target.value)}
                    />
                    <textarea
                        className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                        placeholder="Description (optional)"
                        rows={3}
                        value={newPlanDesc}
                        onChange={e => setNewPlanDesc(e.target.value)}
                    />
                    <button
                        onClick={handleCreatePlan}
                        disabled={creatingPlan || !newPlanTitle.trim()}
                        className="w-full py-2 px-4 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                        {creatingPlan ? 'Creating…' : 'Create Plan'}
                    </button>
                </div>
            </div>
        );
    }

    if (!plan) return null;

    const allMandatoryDone = plan.progress.mandatory_done >= plan.progress.mandatory_tasks && plan.progress.mandatory_tasks > 0;

    return (
        <div className="max-w-4xl mx-auto px-4 py-8">
            {/* Header */}
            <div className="flex items-start justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{plan.title}</h1>
                    {plan.description && <p className="text-slate-500 dark:text-slate-400 mt-1">{plan.description}</p>}
                    <div className="flex items-center gap-3 mt-3">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{plan.progress.completion_pct}% complete</span>
                        {plan.progress.overdue_tasks > 0 && (
                            <span className="text-xs bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 px-2 py-0.5 rounded-full">
                                {plan.progress.overdue_tasks} overdue
                            </span>
                        )}
                    </div>
                    <div className="mt-2 w-64 bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                        <div className="bg-indigo-500 h-2 rounded-full transition-all" style={{ width: `${plan.progress.completion_pct}%` }} />
                    </div>
                </div>
                <div className="flex gap-2 shrink-0">
                    <button onClick={handleExportReport} className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                        Export Report
                    </button>
                    {plan.is_active && (
                        <button
                            onClick={handleCompletePlan}
                            disabled={!allMandatoryDone}
                            className="px-3 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors"
                            title={!allMandatoryDone ? 'Complete all mandatory tasks first' : ''}
                        >
                            Mark Complete
                        </button>
                    )}
                </div>
            </div>

            {/* Objectives */}
            <div className="space-y-6">
                {plan.objectives.map((obj: IDPObjective) => (
                    <div key={obj.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                        <div className="flex items-start justify-between mb-3">
                            <div>
                                <h3 className="font-semibold text-slate-900 dark:text-white">{obj.title}</h3>
                                {obj.due_date && <p className="text-xs text-slate-400 mt-0.5">Due {obj.due_date}</p>}
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-sm text-slate-500">{obj.progress.completion_pct}%</span>
                                <button onClick={() => handleDeleteObjective(obj.id)} className="text-xs text-red-400 hover:text-red-600 transition-colors">Delete</button>
                            </div>
                        </div>

                        {/* Tasks */}
                        <div className="space-y-2 mb-3">
                            {obj.tasks.map(task => (
                                <div key={task.id} className="flex items-center gap-3 py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                                    <span className={`text-xs font-mono ${statusColors[task.progress_status]}`}>{task.progress_status}</span>
                                    <span className="flex-1 text-sm text-slate-800 dark:text-slate-200">{task.title}</span>
                                    {task.priority && (
                                        <span className={`text-xs px-2 py-0.5 rounded-full ${priorityColors[task.priority]}`}>{task.priority}</span>
                                    )}
                                    {task.due_date && <span className="text-xs text-slate-400">{task.due_date}</span>}
                                    <button onClick={() => handleDeleteTask(task.id)} className="text-xs text-red-400 hover:text-red-600 transition-colors">×</button>
                                </div>
                            ))}
                        </div>

                        {/* Add task form */}
                        {addingTaskFor === obj.id ? (
                            <div className="flex gap-2 flex-wrap mt-2">
                                <input
                                    className="flex-1 min-w-[180px] px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="Task title"
                                    value={newTaskTitle}
                                    onChange={e => setNewTaskTitle(e.target.value)}
                                />
                                <input
                                    type="date"
                                    className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none"
                                    value={newTaskDue}
                                    onChange={e => setNewTaskDue(e.target.value)}
                                />
                                <select
                                    className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none"
                                    value={newTaskPriority}
                                    onChange={e => setNewTaskPriority(e.target.value as 'low' | 'medium' | 'high')}
                                >
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                </select>
                                <button onClick={() => handleAddTask(obj.id)} className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">Add</button>
                                <button onClick={() => setAddingTaskFor(null)} className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">Cancel</button>
                            </div>
                        ) : (
                            <button onClick={() => setAddingTaskFor(obj.id)} className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                                + Add task
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {/* Add objective form */}
            {showObjForm ? (
                <div className="mt-6 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                    <h4 className="font-medium text-slate-900 dark:text-white mb-3">New Objective</h4>
                    <div className="flex gap-3 flex-wrap">
                        <input
                            className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="Objective title"
                            value={newObjTitle}
                            onChange={e => setNewObjTitle(e.target.value)}
                        />
                        <input
                            type="date"
                            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none"
                            value={newObjDue}
                            onChange={e => setNewObjDue(e.target.value)}
                        />
                        <button onClick={handleAddObjective} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium">Add</button>
                        <button onClick={() => setShowObjForm(false)} className="px-4 py-2 text-slate-500 hover:text-slate-700 text-sm transition-colors">Cancel</button>
                    </div>
                </div>
            ) : (
                <button
                    onClick={() => setShowObjForm(true)}
                    className="mt-6 w-full py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl text-slate-500 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors text-sm font-medium"
                >
                    + Add Objective
                </button>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /root/QC-Manager/apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/manage-development-plans/[userId]/page.tsx
git commit -m "feat(idp): add manager IDP builder page"
```

---

## Task 10: Frontend — Extend /journeys for ACTIVE Users

**Files:**
- Modify: `apps/web/app/journeys/page.tsx`

- [ ] **Step 1: Extend the journeys page to fetch IDP data for ACTIVE users**

In `apps/web/app/journeys/page.tsx`, replace the `useEffect` load function and add the IDP plan state. The existing file already has `userStatus` from `useAuth`. Replace the full file content:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { myJourneysApi, developmentPlansApi, AssignedJourney, IDPPlan } from '../../src/lib/api';
import { useAuth } from '../../src/components/providers/AuthProvider';

export default function JourneysPage() {
    const [journeys, setJourneys] = useState<AssignedJourney[]>([]);
    const [idpPlan, setIdpPlan] = useState<IDPPlan | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();
    const { userStatus } = useAuth();

    const isActive = userStatus === 'ACTIVE';
    const pageTitle   = isActive ? 'My Development Plan' : 'My Journeys';
    const pageSubtitle = isActive
        ? 'Your ongoing development journey as an active resource.'
        : 'Track your onboarding progress and complete assigned tasks.';
    const statusBadge = isActive
        ? { label: 'Active',         classes: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300' }
        : { label: 'In Preparation', classes: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' };

    useEffect(() => {
        async function load() {
            try {
                if (isActive) {
                    try {
                        const plan = await developmentPlansApi.getMy();
                        setIdpPlan(plan);
                    } catch {
                        // No IDP plan yet — show empty state
                    }
                } else {
                    const data = await myJourneysApi.list();
                    setJourneys(data);
                }
            } catch (err) {
                console.error('Failed to load journeys:', err);
            } finally {
                setIsLoading(false);
            }
        }
        load();
    }, [isActive]);

    async function handleUpdateTaskStatus(taskId: string, currentStatus: string) {
        const next = currentStatus === 'TODO' ? 'IN_PROGRESS' : currentStatus === 'IN_PROGRESS' ? 'DONE' : 'TODO';
        try {
            await developmentPlansApi.updateMyTaskStatus(taskId, next as 'TODO' | 'IN_PROGRESS' | 'DONE');
            const updated = await developmentPlansApi.getMy();
            setIdpPlan(updated);
        } catch (err) {
            console.error('Failed to update task status:', err);
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
            </div>
        );
    }

    return (
        <div>
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-1">
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{pageTitle}</h1>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusBadge.classes}`}>
                        {statusBadge.label}
                    </span>
                </div>
                <p className="text-slate-500 dark:text-slate-400">{pageSubtitle}</p>
            </div>

            {/* ACTIVE: show IDP plan */}
            {isActive && (
                <>
                    {!idpPlan ? (
                        <div className="text-center py-16 text-slate-500 dark:text-slate-400">
                            <p className="text-lg font-medium mb-1">No Development Plan Yet</p>
                            <p className="text-sm">Your manager will create your development plan. Check back soon.</p>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            <div className="flex items-center gap-4 mb-4">
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                    {idpPlan.progress.completion_pct}% complete
                                </span>
                                <div className="flex-1 max-w-xs bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                                    <div className="bg-indigo-500 h-2 rounded-full transition-all" style={{ width: `${idpPlan.progress.completion_pct}%` }} />
                                </div>
                                {idpPlan.progress.overdue_tasks > 0 && (
                                    <span className="text-xs bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 px-2 py-0.5 rounded-full">
                                        {idpPlan.progress.overdue_tasks} overdue
                                    </span>
                                )}
                            </div>

                            {idpPlan.objectives.map(obj => (
                                <div key={obj.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                                    <div className="flex items-start justify-between mb-3">
                                        <div>
                                            <h3 className="font-semibold text-slate-900 dark:text-white">{obj.title}</h3>
                                            {obj.due_date && <p className="text-xs text-slate-400 mt-0.5">Due {obj.due_date}</p>}
                                        </div>
                                        <span className="text-sm text-slate-500">{obj.progress.completion_pct}%</span>
                                    </div>
                                    <div className="space-y-2">
                                        {obj.tasks.map(task => (
                                            <div key={task.id} className={`flex items-center gap-3 py-2 border-b border-slate-100 dark:border-slate-700 last:border-0 ${task.is_overdue ? 'opacity-80' : ''}`}>
                                                <button
                                                    onClick={() => handleUpdateTaskStatus(task.id, task.progress_status)}
                                                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors
                                                        ${task.progress_status === 'DONE' ? 'bg-emerald-500 border-emerald-500' :
                                                          task.progress_status === 'IN_PROGRESS' ? 'bg-indigo-200 border-indigo-500' :
                                                          'border-slate-300 dark:border-slate-600'}`}
                                                    title={`Click to advance: ${task.progress_status}`}
                                                >
                                                    {task.progress_status === 'DONE' && (
                                                        <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                                                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                                                        </svg>
                                                    )}
                                                </button>
                                                <span className={`flex-1 text-sm ${task.progress_status === 'DONE' ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-200'}`}>
                                                    {task.title}
                                                </span>
                                                {task.is_overdue && (
                                                    <span className="text-xs text-red-500">overdue</span>
                                                )}
                                                {task.due_date && !task.is_overdue && (
                                                    <span className="text-xs text-slate-400">{task.due_date}</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* PREPARATION: show onboarding journeys (existing behaviour) */}
            {!isActive && journeys.length === 0 && (
                <div className="text-center py-20">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">No Journeys Assigned</h3>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">You don&apos;t have any journeys assigned yet.</p>
                </div>
            )}

            {!isActive && journeys.length > 0 && (
                <div className="space-y-4">
                    {journeys.map(j => (
                        <div
                            key={j.id}
                            onClick={() => router.push(`/journeys/${j.journey_id}`)}
                            className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 cursor-pointer hover:border-indigo-400 transition-colors"
                        >
                            <p className="font-semibold text-slate-900 dark:text-white">{j.title}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /root/QC-Manager/apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors. If `AssignedJourney` needs `journey_id` confirmed, check the existing type definition in `api.ts` before adjusting.

- [ ] **Step 3: Run full API test suite one final time**

```bash
cd /root/QC-Manager/apps/api && npx jest --no-coverage 2>&1 | tail -10
```

Expected: all tests pass, no regressions.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/journeys/page.tsx
git commit -m "feat(idp): extend journeys page to show IDP plan for ACTIVE users"
```

---

## Task 11: Deploy and Verify

- [ ] **Step 1: Push to trigger CI/CD**

```bash
git push
```

- [ ] **Step 2: Wait for deploy and verify health**

```bash
# Wait ~2 min for CI/CD pipeline, then:
curl -s https://api.gebrils.cloud/api/health
```

Expected: `{"status":"ok",...}`

- [ ] **Step 3: Verify new route is mounted**

```bash
curl -s https://api.gebrils.cloud/api/development-plans/some-fake-id \
  -H "Authorization: Bearer <valid-token>" | head -50
```

Expected: `401` or `403` (not 404 "route not found" — confirms route is mounted).

- [ ] **Step 4: Post-deploy auth check (standard protocol)**

```bash
docker exec qc-api printenv SUPABASE_JWT_SECRET | wc -c
```

Expected: 41 (40 chars + newline). If 1, follow the post-deploy auth fix in the QC-Manager project memory.

---

## Self-Review Notes

**Spec coverage check:**
- ✅ Management structure enforcement → `canAccessUser()` on every route
- ✅ IDP only for ACTIVE users → validated on `POST /:userId`
- ✅ One active plan per user → 409 guard on create
- ✅ Plan builder (objectives + tasks + due dates + priority) → Tasks 3 & 4
- ✅ Manager dashboard → Task 8 (overview) + Task 9 (builder)
- ✅ Progress tracking (% per objective, overall, overdue) → `buildProgress()` helper + GET response
- ✅ Plan completion + XP award → Task 5 (`POST /:userId/complete`)
- ✅ Performance report → Task 5 (`GET /:userId/report`)
- ✅ Export → download JSON in Task 9 frontend
- ✅ User view of own plan + task status update → Task 5 (`GET /my`, `PATCH /my/tasks/:taskId/status`)
- ✅ Access control (manager/admin/user) → all endpoints
- ✅ No duplication of journeys system → reuses all existing tables

**Type consistency confirmed:**
- `IDPPlan.objectives` → `IDPObjective[]` used consistently in Tasks 7–10
- `IDPTask.progress_status` → `'TODO' | 'IN_PROGRESS' | 'DONE'` used consistently
- `buildProgress()` helper defined once in Task 2, called in Tasks 2 and 5
- `getPlanForUser()` helper defined once in Task 2, called in Tasks 3, 4, 5

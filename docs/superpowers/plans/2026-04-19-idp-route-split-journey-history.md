# IDP Route Split & Journey History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give ACTIVE resources a dedicated `/development-plan` route (with a companion `/development-plan/history` page for archived plans), and strip the IDP branch out of `/journeys` so it goes back to serving only PREPARATION onboarding.

**Architecture:** Keep `/journeys` as the onboarding experience for PREPARATION users only. Add `/development-plan` (current active IDP) and `/development-plan/history` (archived IDPs) for ACTIVE users. Sidebar entries key off `user.status` via a new `statusVisibility` field on `RouteConfig`. Backend gains `GET /api/development-plans/my/history` that lists archived IDPs (journeys with `plan_type='idp' AND is_active=false AND deleted_at IS NULL`) including a per-plan summary.

**Tech Stack:** Next.js 14 App Router, React 18 client components, Express, PostgreSQL (Supabase), Playwright e2e, existing `developmentPlansApi` client, Lucide icons (GraduationCap / History).

---

## Prerequisites

Plan A (IDP data model with `progress_status`, `hold_reason`, `completed_at`) and Plan B (My Development Plan interactions) must be landed. This plan assumes:

- `apps/web/app/journeys/page.tsx` currently renders **both** the PREPARATION onboarding list and the ACTIVE IDP plan (`isActive` branching).
- `apps/web/src/config/routes.ts` has `{ path: '/journeys', label: 'My Journeys', … showInNavbar: true, navOrder: 1.5 }` serving both statuses.
- Backend has `GET /api/development-plans/my` returning the active IDP, and `journeys` rows are archived by `UPDATE journeys SET is_active = false` (see `apps/api/src/routes/developmentPlans.js:669`).
- `developmentPlansApi` client exists with `getMy()`, `updateMyTaskStatus`, etc.
- `TaskStatusControl`, `TaskStatusBadge`, `HoldTaskDialog`, `TaskCommentsPanel` components exist under `apps/web/src/components/idp/`.

---

## File Structure

**Backend:**
- Modify: `apps/api/src/routes/developmentPlans.js` — add `GET /my/history` handler after the existing `GET /my` handler (~line 180).

**Frontend — new pages:**
- Create: `apps/web/app/development-plan/page.tsx` — current active IDP (moved from `/journeys` IDP branch).
- Create: `apps/web/app/development-plan/history/page.tsx` — list of archived IDPs (read-only summary cards).
- Create: `apps/web/app/development-plan/history/[planId]/page.tsx` — archived IDP detail (read-only).

**Frontend — shared routing:**
- Modify: `apps/web/src/config/routes.ts` — add `statusVisibility` field, new route entries.
- Modify: `apps/web/src/components/layout/Sidebar.tsx` (or equivalent nav component) — filter by `user.status` when `statusVisibility` is set.

**Frontend — existing pages:**
- Modify: `apps/web/app/journeys/page.tsx` — strip the `isActive` branch, keep only the PREPARATION onboarding list; active users get redirected to `/development-plan` via `useEffect` + `router.replace`.

**Frontend — API client & types:**
- Modify: `apps/web/src/lib/api.ts` — add `IDPHistoryEntry` type and `developmentPlansApi.listMyHistory()` / `getMyHistoryPlan()` methods.

**Tests:**
- Create: `apps/api/__tests__/developmentPlans.history.test.js` — Jest integration tests for `/my/history`.
- Create: `apps/web/e2e/idp-route-split.spec.ts` — Playwright tests covering nav visibility, redirect, and history page.

---

## Conventions

- **Dark-mode contrast:** muted labels use `text-slate-400 dark:text-slate-500`, headings use `text-slate-900 dark:text-white`.
- **Empty states:** a centered block with heading + one-line hint (matches `/journeys` empty state at `apps/web/app/journeys/page.tsx:179-184`).
- **Date formatting:** reuse `fmtDate(v)` pattern (`v.slice(0, 10)` when present, `''` otherwise).
- **Error surfacing:** use `useToast()` from `apps/web/src/components/ui/Toast.tsx`; never `alert()` / `console.log`.

---

## Task 1: Backend — GET /api/development-plans/my/history

**Files:**
- Modify: `apps/api/src/routes/developmentPlans.js` (insert new handler after existing `router.get('/my', …)` block, before the manager-scoped routes)
- Test: `apps/api/__tests__/developmentPlans.history.test.js` (new file)

Shape of the response (one entry per archived plan):
```json
[
  {
    "id": "uuid",
    "title": "Q1 2026 Development Plan",
    "description": "…",
    "archived_at": "2026-03-31T…",
    "created_at": "2026-01-05T…",
    "progress": {
      "total_tasks": 12,
      "done_tasks": 11,
      "completion_pct": 92,
      "mandatory_tasks": 8,
      "mandatory_done": 8
    }
  }
]
```

- [ ] **Step 1: Write the failing test**

Create `apps/api/__tests__/developmentPlans.history.test.js`:

```javascript
'use strict';

const request = require('supertest');
const app = require('../src/index');
const db = require('../src/config/db');
const { signToken } = require('../src/utils/tokens'); // existing helper; fall back to raw jwt.sign if missing

describe('GET /api/development-plans/my/history', () => {
    let userId;
    let activeId;
    let archivedId;
    let token;

    beforeAll(async () => {
        const user = await db.query(
            `INSERT INTO app_user (name, email, role, status) VALUES ($1, $2, 'user', 'ACTIVE') RETURNING id`,
            ['History Test User', `history-${Date.now()}@example.com`]
        );
        userId = user.rows[0].id;
        token = signToken({ id: userId, email: `history-${Date.now()}@example.com`, role: 'user' });

        const active = await db.query(
            `INSERT INTO journeys (title, plan_type, owner_user_id, is_active)
             VALUES ('Current IDP', 'idp', $1, true) RETURNING id`,
            [userId]
        );
        activeId = active.rows[0].id;

        const archived = await db.query(
            `INSERT INTO journeys (title, plan_type, owner_user_id, is_active, updated_at)
             VALUES ('Q1 2026 Plan', 'idp', $1, false, NOW() - INTERVAL '30 days') RETURNING id`,
            [userId]
        );
        archivedId = archived.rows[0].id;
    });

    afterAll(async () => {
        await db.query(`DELETE FROM journeys WHERE id IN ($1, $2)`, [activeId, archivedId]);
        await db.query(`DELETE FROM app_user WHERE id = $1`, [userId]);
    });

    it('returns only archived IDP plans for the caller', async () => {
        const res = await request(app)
            .get('/api/development-plans/my/history')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        const ids = res.body.map(p => p.id);
        expect(ids).toContain(archivedId);
        expect(ids).not.toContain(activeId);
    });

    it('includes a progress summary per archived plan', async () => {
        const res = await request(app)
            .get('/api/development-plans/my/history')
            .set('Authorization', `Bearer ${token}`);

        const entry = res.body.find(p => p.id === archivedId);
        expect(entry).toBeDefined();
        expect(entry.progress).toEqual(expect.objectContaining({
            total_tasks: expect.any(Number),
            done_tasks: expect.any(Number),
            completion_pct: expect.any(Number),
        }));
    });

    it('requires auth', async () => {
        const res = await request(app).get('/api/development-plans/my/history');
        expect(res.status).toBe(401);
    });
});
```

- [ ] **Step 2: Run the test — it must FAIL**

Run: `cd apps/api && npx jest __tests__/developmentPlans.history.test.js -t "returns only archived"`
Expected: 404 because the route doesn't exist yet.

- [ ] **Step 3: Implement the handler**

Edit `apps/api/src/routes/developmentPlans.js`. Insert **immediately after** the closing `});` of the existing `router.get('/my', …)` handler (just before the first manager-scoped route — look for the `// ─── GET /:userId` comment divider):

```javascript
// ─── GET /my/history — user views own archived IDP plans ─────────────────────

router.get('/my/history', requireAuth, async (req, res, next) => {
    try {
        const userId = req.user.id;

        const plansResult = await db.query(
            `SELECT id, title, description, created_at, updated_at AS archived_at
             FROM journeys
             WHERE owner_user_id = $1
               AND plan_type = 'idp'
               AND is_active = false
               AND deleted_at IS NULL
             ORDER BY updated_at DESC`,
            [userId]
        );

        if (plansResult.rows.length === 0) return res.json([]);

        const planIds = plansResult.rows.map(p => p.id);

        const summaryResult = await db.query(
            `SELECT jc.journey_id AS plan_id,
                    COUNT(jt.id) AS total_tasks,
                    SUM(CASE WHEN jt.is_mandatory THEN 1 ELSE 0 END) AS mandatory_tasks,
                    SUM(CASE WHEN utc.progress_status = 'DONE' THEN 1 ELSE 0 END) AS done_tasks,
                    SUM(CASE WHEN jt.is_mandatory AND utc.progress_status = 'DONE' THEN 1 ELSE 0 END) AS mandatory_done
             FROM journey_chapters jc
             JOIN journey_quests jq ON jq.chapter_id = jc.id
             JOIN journey_tasks jt ON jt.quest_id = jq.id
             LEFT JOIN user_task_completions utc ON utc.task_id = jt.id AND utc.user_id = $1
             WHERE jc.journey_id = ANY($2)
             GROUP BY jc.journey_id`,
            [userId, planIds]
        );

        const summaryMap = new Map(summaryResult.rows.map(r => [r.plan_id, r]));

        const body = plansResult.rows.map(p => {
            const s = summaryMap.get(p.id);
            const total = Number(s?.total_tasks) || 0;
            const done = Number(s?.done_tasks) || 0;
            return {
                id: p.id,
                title: p.title,
                description: p.description,
                created_at: p.created_at,
                archived_at: p.archived_at,
                progress: {
                    total_tasks: total,
                    done_tasks: done,
                    completion_pct: total > 0 ? Math.round((done / total) * 100) : 0,
                    mandatory_tasks: Number(s?.mandatory_tasks) || 0,
                    mandatory_done: Number(s?.mandatory_done) || 0,
                },
            };
        });

        res.json(body);
    } catch (err) { next(err); }
});
```

- [ ] **Step 4: Run the test — it must PASS**

Run: `cd apps/api && npx jest __tests__/developmentPlans.history.test.js`
Expected: 3/3 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/developmentPlans.js apps/api/__tests__/developmentPlans.history.test.js
git commit -m "feat(idp): add GET /my/history endpoint for archived IDP plans"
```

---

## Task 2: Backend — GET /api/development-plans/my/history/:planId

Return a single archived plan's full detail (same shape as `/my` response, but pulled from the specified archived plan instead of the active one).

**Files:**
- Modify: `apps/api/src/routes/developmentPlans.js` (add handler immediately after the `/my/history` handler)
- Test: `apps/api/__tests__/developmentPlans.history.test.js` (extend)

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe` block in `developmentPlans.history.test.js`:

```javascript
    it('returns archived plan detail with objectives and tasks', async () => {
        const res = await request(app)
            .get(`/api/development-plans/my/history/${archivedId}`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.id).toBe(archivedId);
        expect(Array.isArray(res.body.objectives)).toBe(true);
        expect(res.body.is_active).toBe(false);
    });

    it('404s when plan is not archived', async () => {
        const res = await request(app)
            .get(`/api/development-plans/my/history/${activeId}`)
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(404);
    });

    it("404s when plan belongs to another user", async () => {
        const other = await db.query(
            `INSERT INTO app_user (name, email, role, status) VALUES ('Other', $1, 'user', 'ACTIVE') RETURNING id`,
            [`other-${Date.now()}@example.com`]
        );
        const otherPlan = await db.query(
            `INSERT INTO journeys (title, plan_type, owner_user_id, is_active)
             VALUES ('Other Plan', 'idp', $1, false) RETURNING id`,
            [other.rows[0].id]
        );

        const res = await request(app)
            .get(`/api/development-plans/my/history/${otherPlan.rows[0].id}`)
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(404);

        await db.query(`DELETE FROM journeys WHERE id = $1`, [otherPlan.rows[0].id]);
        await db.query(`DELETE FROM app_user WHERE id = $1`, [other.rows[0].id]);
    });
```

- [ ] **Step 2: Run — must FAIL**

Run: `cd apps/api && npx jest __tests__/developmentPlans.history.test.js`
Expected: 3 new tests failing with 404 on an unmounted route.

- [ ] **Step 3: Add the handler**

Insert immediately after the `/my/history` handler:

```javascript
router.get('/my/history/:planId', requireAuth, async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { planId } = req.params;

        const planResult = await db.query(
            `SELECT * FROM journeys
             WHERE id = $1 AND owner_user_id = $2 AND plan_type = 'idp'
               AND is_active = false AND deleted_at IS NULL
             LIMIT 1`,
            [planId, userId]
        );
        if (planResult.rows.length === 0) return res.status(404).json({ error: 'Archived plan not found' });
        const plan = planResult.rows[0];

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

        const objectives = chapters.rows.map(ch => {
            const chQuest = quests.find(q => q.chapter_id === ch.id);
            const chTasks = chQuest ? tasks.filter(t => t.quest_id === chQuest.id) : [];
            const done = chTasks.filter(t => completionMap.get(t.id)?.progress_status === 'DONE').length;
            return {
                id: ch.id,
                title: ch.title,
                description: ch.description,
                start_date: ch.start_date,
                due_date: ch.due_date,
                sort_order: ch.sort_order,
                progress: {
                    total_tasks: chTasks.length,
                    done_tasks: done,
                    completion_pct: chTasks.length > 0 ? Math.round((done / chTasks.length) * 100) : 0,
                },
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
                        hold_reason: c?.hold_reason || null,
                    };
                }),
            };
        });

        res.json({
            id: plan.id,
            title: plan.title,
            description: plan.description,
            is_active: false,
            archived_at: plan.updated_at,
            created_at: plan.created_at,
            progress: buildProgress(tasks, completions),
            objectives,
        });
    } catch (err) { next(err); }
});
```

- [ ] **Step 4: Run tests — must PASS**

Run: `cd apps/api && npx jest __tests__/developmentPlans.history.test.js`
Expected: 6/6 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/developmentPlans.js apps/api/__tests__/developmentPlans.history.test.js
git commit -m "feat(idp): add GET /my/history/:planId for archived plan detail"
```

---

## Task 3: Frontend — extend routes.ts with status-based visibility

**Files:**
- Modify: `apps/web/src/config/routes.ts`

Add a `statusVisibility` optional field to `RouteConfig` (values: `'PREPARATION'` | `'ACTIVE'`). `getNavbarRoutes()` gains an optional `userStatus` argument and filters the result when the field is set.

- [ ] **Step 1: Add the field and routes**

Edit `apps/web/src/config/routes.ts`:

```typescript
export interface RouteConfig {
    path: string;
    label: string;
    permission?: string;
    adminOnly?: boolean;
    requiresActivation?: boolean;
    showInNavbar?: boolean;
    navOrder?: number;
    icon?: LucideIcon;
    onboardingStep?: number;
    onboardingGroup?: string;
    statusVisibility?: 'PREPARATION' | 'ACTIVE';
}
```

Replace the existing `{ path: '/journeys', … }` entry and add new development-plan entries. The block near line 24-26 should read:

```typescript
    { path: '/journeys', label: 'My Journeys', permission: 'page:my-tasks', requiresActivation: false, showInNavbar: true, navOrder: 1.5, icon: Map, statusVisibility: 'PREPARATION' },
    { path: '/journeys/[id]', label: 'Journey Details', permission: 'page:my-tasks', requiresActivation: false },
    { path: '/development-plan', label: 'My Development Plan', permission: 'page:my-tasks', requiresActivation: true, showInNavbar: true, navOrder: 1.5, icon: GraduationCap, statusVisibility: 'ACTIVE' },
    { path: '/development-plan/history', label: 'Plan History', permission: 'page:my-tasks', requiresActivation: true, showInNavbar: true, navOrder: 1.6, icon: History, statusVisibility: 'ACTIVE' },
    { path: '/development-plan/history/[planId]', label: 'Archived Plan', permission: 'page:my-tasks', requiresActivation: true },
    { path: '/my-dashboard', label: 'My Dashboard', permission: 'page:my-dashboard', requiresActivation: false, showInNavbar: true, navOrder: 1.8, icon: LayoutGrid },
```

Then update `getNavbarRoutes`:

```typescript
export function getNavbarRoutes(userStatus?: 'PREPARATION' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED'): RouteConfig[] {
    return ROUTES
        .filter(r => r.showInNavbar)
        .filter(r => {
            if (!r.statusVisibility) return true;
            return r.statusVisibility === userStatus;
        })
        .sort((a, b) => (a.navOrder || 99) - (b.navOrder || 99));
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/config/routes.ts
git commit -m "feat(idp): add statusVisibility route filter and development-plan routes"
```

---

## Task 4: Frontend — wire sidebar to filter by user status

**Files:**
- Modify: the sidebar/nav component that calls `getNavbarRoutes()` (search `apps/web/src/components/layout/` for the import).

- [ ] **Step 1: Locate callers**

Run: `cd apps/web && grep -rn "getNavbarRoutes" src app`
Expected: 1 or 2 call sites. For each, import `useAuth` (if not already imported) and pass `user?.status`.

- [ ] **Step 2: Update the caller**

At each call site, change:

```typescript
const navRoutes = getNavbarRoutes();
```

To:

```typescript
const { user } = useAuth();
const navRoutes = getNavbarRoutes(user?.status);
```

If the caller is a server component, convert it to a client component (`'use client'`) or read status from an already-available context — pick whichever matches the existing component style. **Do not** duplicate the status fetch.

- [ ] **Step 3: Type-check & lint**

Run: `cd apps/web && npx tsc --noEmit && npx next lint`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/layout
git commit -m "feat(idp): filter sidebar nav by user status"
```

---

## Task 5: Frontend — add type + API client for history

**Files:**
- Modify: `apps/web/src/lib/api.ts`

- [ ] **Step 1: Add the type**

Insert immediately after the existing `IDPTaskComment` interface (around line 990):

```typescript
export interface IDPHistoryEntry {
    id: string;
    title: string;
    description?: string | null;
    created_at: string;
    archived_at: string;
    progress: {
        total_tasks: number;
        done_tasks: number;
        completion_pct: number;
        mandatory_tasks: number;
        mandatory_done: number;
    };
}
```

- [ ] **Step 2: Add the client methods**

Inside the `developmentPlansApi` object (near line 1120, alongside `getMy()`), add:

```typescript
    // User: list own archived plans
    listMyHistory: () =>
        fetchApi<IDPHistoryEntry[]>('/api/development-plans/my/history'),

    // User: read an archived plan by id
    getMyHistoryPlan: (planId: string) =>
        fetchApi<IDPPlan>(`/api/development-plans/my/history/${planId}`),
```

- [ ] **Step 3: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat(idp): add listMyHistory and getMyHistoryPlan clients"
```

---

## Task 6: Frontend — create `/development-plan` page

**Files:**
- Create: `apps/web/app/development-plan/page.tsx`

Move the IDP branch of `apps/web/app/journeys/page.tsx` into its own page. Keep feature parity: progress bar, overdue pill, objectives with `TaskStatusControl`, comments panel.

- [ ] **Step 1: Create the file**

Write `apps/web/app/development-plan/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { developmentPlansApi, IDPPlan, IDPTask } from '../../src/lib/api';
import { useAuth } from '../../src/components/providers/AuthProvider';
import { useToast } from '../../src/components/ui/Toast';
import { TaskStatusControl } from '../../src/components/idp/TaskStatusControl';
import { TaskStatusBadge, inferBadgeKind } from '../../src/components/idp/TaskStatusBadge';
import { TaskCommentsPanel } from '../../src/components/idp/TaskCommentsPanel';

function fmtDate(v?: string | null) {
    if (!v) return '';
    return v.slice(0, 10);
}

function lateSuffix(dueDate: string, completedAt: string) {
    const due = new Date(dueDate);
    const done = new Date(completedAt);
    const days = Math.max(1, Math.round((done.getTime() - due.getTime()) / 86400000));
    return `Late by ${days}d`;
}

export default function DevelopmentPlanPage() {
    const [plan, setPlan] = useState<IDPPlan | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const { user } = useAuth();
    const toast = useToast();
    const [commentsTask, setCommentsTask] = useState<IDPTask | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const p = await developmentPlansApi.getMy();
                if (!cancelled) setPlan(p);
            } catch {
                // no active plan — leave plan null for empty state
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    async function reloadPlan() {
        try {
            const updated = await developmentPlansApi.getMy();
            setPlan(updated);
        } catch (err: any) {
            toast.error(err?.message || 'Could not refresh plan');
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
            <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My Development Plan</h1>
                        <span className="text-xs font-medium px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                            Active
                        </span>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400">Your ongoing development journey as an active resource.</p>
                </div>
                <Link
                    href="/development-plan/history"
                    className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap"
                >
                    View history →
                </Link>
            </div>

            {!plan ? (
                <div className="text-center py-16 text-slate-500 dark:text-slate-400">
                    <p className="text-lg font-medium mb-1">No Development Plan Yet</p>
                    <p className="text-sm">Your manager will create your development plan. Check back soon.</p>
                </div>
            ) : (
                <div className="space-y-5">
                    <div className="flex items-center gap-4 mb-4">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            {plan.progress.completion_pct}% complete
                        </span>
                        <div className="flex-1 max-w-xs bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                            <div className="bg-indigo-500 h-2 rounded-full transition-all" style={{ width: `${plan.progress.completion_pct}%` }} />
                        </div>
                        {plan.progress.overdue_tasks > 0 && (
                            <span className="text-xs bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 px-2 py-0.5 rounded-full">
                                {plan.progress.overdue_tasks} overdue
                            </span>
                        )}
                    </div>

                    {plan.objectives.map(obj => (
                        <div key={obj.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                            <div className="flex items-start justify-between mb-3">
                                <div>
                                    <h3 className="font-semibold text-slate-900 dark:text-white">{obj.title}</h3>
                                    {obj.due_date && <p className="text-xs text-slate-400 mt-0.5">Due {fmtDate(obj.due_date)}</p>}
                                </div>
                                <span className="text-sm text-slate-500">{obj.progress.completion_pct}%</span>
                            </div>
                            <div className="space-y-2">
                                {obj.tasks.map(task => {
                                    const badgeKind = inferBadgeKind(task);
                                    const showBadge = ['on_hold', 'overdue', 'done_late'].includes(badgeKind);
                                    return (
                                        <div
                                            key={task.id}
                                            className="flex items-center gap-3 py-2 border-b border-slate-100 dark:border-slate-700 last:border-0"
                                        >
                                            <TaskStatusControl task={task} onStatusChanged={reloadPlan} />
                                            <span className={`flex-1 text-sm ${task.progress_status === 'DONE' ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-200'}`}>
                                                {task.title}
                                            </span>
                                            {showBadge && (
                                                <TaskStatusBadge
                                                    kind={badgeKind}
                                                    suffix={badgeKind === 'done_late' && task.completed_at && task.due_date
                                                        ? lateSuffix(task.due_date, task.completed_at)
                                                        : undefined}
                                                />
                                            )}
                                            {task.progress_status === 'DONE' && badgeKind === 'done' && task.completed_at && (
                                                <span className="text-xs text-emerald-600 dark:text-emerald-400">
                                                    Completed {fmtDate(task.completed_at)}
                                                </span>
                                            )}
                                            {(task.start_date || task.due_date) && task.progress_status !== 'DONE' && badgeKind !== 'overdue' && badgeKind !== 'on_hold' && (
                                                <span className="text-xs text-slate-400">
                                                    {task.start_date ? fmtDate(task.start_date) : ''}{task.start_date && task.due_date ? ' → ' : ''}{task.due_date ? fmtDate(task.due_date) : ''}
                                                </span>
                                            )}
                                            <button
                                                type="button"
                                                aria-label={`Open comments for ${task.title}`}
                                                onClick={() => setCommentsTask(task)}
                                                className="text-xs text-slate-400 hover:text-indigo-500 px-1.5 py-1 rounded"
                                                title="Comments"
                                            >
                                                💬
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <TaskCommentsPanel
                open={commentsTask !== null}
                taskId={commentsTask?.id ?? null}
                taskTitle={commentsTask?.title ?? ''}
                currentUserId={user?.id ?? ''}
                onClose={() => setCommentsTask(null)}
            />
        </div>
    );
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/development-plan/page.tsx
git commit -m "feat(idp): add dedicated /development-plan page"
```

---

## Task 7: Frontend — create history list page

**Files:**
- Create: `apps/web/app/development-plan/history/page.tsx`

- [ ] **Step 1: Create the file**

Write `apps/web/app/development-plan/history/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { developmentPlansApi, IDPHistoryEntry } from '../../../src/lib/api';
import { useToast } from '../../../src/components/ui/Toast';

function fmtDate(v?: string | null) {
    if (!v) return '';
    return v.slice(0, 10);
}

export default function DevelopmentPlanHistoryPage() {
    const [plans, setPlans] = useState<IDPHistoryEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const toast = useToast();

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const data = await developmentPlansApi.listMyHistory();
                if (!cancelled) setPlans(data);
            } catch (err: any) {
                if (!cancelled) toast.error(err?.message || 'Could not load history');
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [toast]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
            </div>
        );
    }

    return (
        <div>
            <div className="mb-6 flex items-center gap-3">
                <Link href="/development-plan" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                    ← Current plan
                </Link>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Plan History</h1>
            </div>

            {plans.length === 0 ? (
                <div className="text-center py-16 text-slate-500 dark:text-slate-400">
                    <p className="text-lg font-medium mb-1">No archived plans</p>
                    <p className="text-sm">Completed plans will appear here.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {plans.map(p => (
                        <Link
                            key={p.id}
                            href={`/development-plan/history/${p.id}`}
                            className="block bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 hover:border-indigo-400 transition-colors"
                        >
                            <div className="flex items-center justify-between gap-4">
                                <div className="min-w-0">
                                    <p className="font-semibold text-slate-900 dark:text-white truncate">{p.title}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                        Archived {fmtDate(p.archived_at)}
                                    </p>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <span className="text-sm text-slate-600 dark:text-slate-300">
                                        {p.progress.completion_pct}%
                                    </span>
                                    <span className="text-xs text-slate-400">
                                        {p.progress.done_tasks}/{p.progress.total_tasks} tasks
                                    </span>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/development-plan/history/page.tsx
git commit -m "feat(idp): add archived plan list at /development-plan/history"
```

---

## Task 8: Frontend — create history detail page

**Files:**
- Create: `apps/web/app/development-plan/history/[planId]/page.tsx`

- [ ] **Step 1: Create the file**

Write `apps/web/app/development-plan/history/[planId]/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { developmentPlansApi, IDPPlan } from '../../../../src/lib/api';
import { useToast } from '../../../../src/components/ui/Toast';

function fmtDate(v?: string | null) {
    if (!v) return '';
    return v.slice(0, 10);
}

export default function ArchivedPlanDetailPage() {
    const params = useParams();
    const planId = params.planId as string;
    const [plan, setPlan] = useState<IDPPlan | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const toast = useToast();

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const p = await developmentPlansApi.getMyHistoryPlan(planId);
                if (!cancelled) setPlan(p);
            } catch (err: any) {
                if (cancelled) return;
                if (err?.status === 404 || /not found/i.test(err?.message || '')) {
                    setNotFound(true);
                } else {
                    toast.error(err?.message || 'Could not load plan');
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [planId, toast]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
            </div>
        );
    }

    if (notFound || !plan) {
        return (
            <div className="text-center py-16 text-slate-500 dark:text-slate-400">
                <p className="text-lg font-medium mb-1">Plan not found</p>
                <Link href="/development-plan/history" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                    ← Back to history
                </Link>
            </div>
        );
    }

    return (
        <div>
            <div className="mb-6">
                <Link href="/development-plan/history" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                    ← History
                </Link>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{plan.title}</h1>
                {plan.description && (
                    <p className="text-slate-500 dark:text-slate-400 mt-1">{plan.description}</p>
                )}
                <div className="flex items-center gap-3 mt-3 text-sm text-slate-600 dark:text-slate-300">
                    <span>{plan.progress.completion_pct}% complete</span>
                    <span className="text-slate-400">·</span>
                    <span>{plan.progress.done_tasks}/{plan.progress.total_tasks} tasks done</span>
                </div>
            </div>

            <div className="space-y-5">
                {plan.objectives.map(obj => (
                    <div key={obj.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                        <div className="flex items-start justify-between mb-3">
                            <div>
                                <h3 className="font-semibold text-slate-900 dark:text-white">{obj.title}</h3>
                                {obj.due_date && <p className="text-xs text-slate-400 mt-0.5">Due {fmtDate(obj.due_date)}</p>}
                            </div>
                            <span className="text-sm text-slate-500">{obj.progress.completion_pct}%</span>
                        </div>
                        <div className="space-y-2">
                            {obj.tasks.map(task => (
                                <div key={task.id} className="flex items-center gap-3 py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                                    <span className="text-xs font-mono text-slate-500">{task.progress_status}</span>
                                    <span className={`flex-1 text-sm ${task.progress_status === 'DONE' ? 'text-slate-500 line-through' : 'text-slate-800 dark:text-slate-200'}`}>
                                        {task.title}
                                    </span>
                                    {task.progress_status === 'DONE' && task.completed_at && (
                                        <span className="text-xs text-emerald-600 dark:text-emerald-400">
                                            Completed {fmtDate(task.completed_at)}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/development-plan/history/[planId]/page.tsx
git commit -m "feat(idp): add archived plan detail page"
```

---

## Task 9: Frontend — slim `/journeys` back to onboarding-only

**Files:**
- Modify: `apps/web/app/journeys/page.tsx`

Remove the IDP branch. When an ACTIVE user lands here, redirect them to `/development-plan` via `router.replace`.

- [ ] **Step 1: Rewrite the file**

Replace the entire contents of `apps/web/app/journeys/page.tsx` with:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { myJourneysApi, AssignedJourney } from '../../src/lib/api';
import { useAuth } from '../../src/components/providers/AuthProvider';

export default function JourneysPage() {
    const [journeys, setJourneys] = useState<AssignedJourney[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();
    const { userStatus } = useAuth();
    const isActive = userStatus === 'ACTIVE';

    useEffect(() => {
        if (isActive) {
            router.replace('/development-plan');
            return;
        }
        (async () => {
            try {
                const data = await myJourneysApi.list();
                setJourneys(data);
            } catch (err) {
                console.error('Failed to load journeys:', err);
            } finally {
                setIsLoading(false);
            }
        })();
    }, [isActive, router]);

    if (isActive || isLoading) {
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
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My Journeys</h1>
                    <span className="text-xs font-medium px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
                        In Preparation
                    </span>
                </div>
                <p className="text-slate-500 dark:text-slate-400">Track your onboarding progress and complete assigned tasks.</p>
            </div>

            {journeys.length === 0 ? (
                <div className="text-center py-20">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">No Journeys Assigned</h3>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">You don&apos;t have any journeys assigned yet.</p>
                </div>
            ) : (
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

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errors. Any unused-import warnings must be fixed in this file.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/journeys/page.tsx
git commit -m "refactor(idp): strip IDP branch from /journeys, redirect active users"
```

---

## Task 10: Playwright e2e — route split & history flows

**Files:**
- Create: `apps/web/e2e/idp-route-split.spec.ts`

Cover: ACTIVE user sees "My Development Plan" in nav (not "My Journeys"), visiting `/journeys` redirects them to `/development-plan`, history page lists archived plans. PREPARATION user still sees "My Journeys".

- [ ] **Step 1: Write the tests**

Create `apps/web/e2e/idp-route-split.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { mockAuthenticatedSession } from './helpers/session';

const activeUser = {
    id: '00000000-0000-0000-0000-0000000000a1',
    name: 'Active Resource',
    email: 'active@example.com',
    role: 'user' as const,
    status: 'ACTIVE' as const,
};

const prepUser = {
    id: '00000000-0000-0000-0000-0000000000b1',
    name: 'Prep Resource',
    email: 'prep@example.com',
    role: 'user' as const,
    status: 'PREPARATION' as const,
};

test.describe('IDP route split', () => {
    test('ACTIVE user sees Development Plan in nav, not Journeys', async ({ page }) => {
        await mockAuthenticatedSession(page, {
            user: activeUser,
            permissions: ['page:my-tasks'],
        });
        await page.route('**/api/development-plans/my', r => r.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                id: 'plan-1', title: 'Current', description: '', is_active: true,
                progress: { total_tasks: 0, done_tasks: 0, completion_pct: 0, mandatory_tasks: 0, mandatory_done: 0, overdue_tasks: 0, on_hold_tasks: 0 },
                objectives: [],
            }),
        }));

        await page.goto('/development-plan');
        await expect(page.getByRole('heading', { name: 'My Development Plan' })).toBeVisible();
        await expect(page.getByRole('link', { name: /My Journeys/i })).toHaveCount(0);
        await expect(page.getByRole('link', { name: /Development Plan/i }).first()).toBeVisible();
    });

    test('ACTIVE user visiting /journeys is redirected to /development-plan', async ({ page }) => {
        await mockAuthenticatedSession(page, {
            user: activeUser,
            permissions: ['page:my-tasks'],
        });
        await page.route('**/api/development-plans/my', r => r.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({
                id: 'plan-1', title: 'Current', description: '', is_active: true,
                progress: { total_tasks: 0, done_tasks: 0, completion_pct: 0, mandatory_tasks: 0, mandatory_done: 0, overdue_tasks: 0, on_hold_tasks: 0 },
                objectives: [],
            }),
        }));

        await page.goto('/journeys');
        await page.waitForURL('**/development-plan');
        await expect(page.getByRole('heading', { name: 'My Development Plan' })).toBeVisible();
    });

    test('PREPARATION user keeps /journeys page', async ({ page }) => {
        await mockAuthenticatedSession(page, {
            user: prepUser,
            permissions: ['page:my-tasks'],
        });
        await page.route('**/api/my-journeys', r => r.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify([{ id: 'a1', journey_id: 'j1', title: 'Onboarding' }]),
        }));

        await page.goto('/journeys');
        await expect(page.getByRole('heading', { name: 'My Journeys' })).toBeVisible();
        await expect(page.getByText('Onboarding')).toBeVisible();
    });

    test('History page lists archived plans', async ({ page }) => {
        await mockAuthenticatedSession(page, {
            user: activeUser,
            permissions: ['page:my-tasks'],
        });
        await page.route('**/api/development-plans/my/history', r => r.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify([{
                id: 'old-plan-1',
                title: 'Q1 2026 Plan',
                description: '',
                created_at: '2026-01-05T00:00:00Z',
                archived_at: '2026-03-31T00:00:00Z',
                progress: { total_tasks: 10, done_tasks: 9, completion_pct: 90, mandatory_tasks: 6, mandatory_done: 6 },
            }]),
        }));

        await page.goto('/development-plan/history');
        await expect(page.getByRole('heading', { name: 'Plan History' })).toBeVisible();
        await expect(page.getByText('Q1 2026 Plan')).toBeVisible();
        await expect(page.getByText('90%')).toBeVisible();
        await expect(page.getByText('9/10 tasks')).toBeVisible();
    });
});
```

- [ ] **Step 2: Run the tests**

Run (from `apps/web`):

```bash
npx playwright test idp-route-split --reporter=list
```

If the dev server isn't configured for e2e (see `playwright.config.ts` `webServer` block), ensure it is before running — otherwise the tests will time out. In CI this runs against the built app.

Expected: 4/4 passing.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/idp-route-split.spec.ts
git commit -m "test(idp): e2e route split, journeys redirect, history list"
```

---

## Self-Review

**Spec coverage (against the goals):**

- ACTIVE users land at `/development-plan`: Tasks 6, 9 (redirect).
- History view for archived plans: Tasks 1, 2 (backend), 7, 8 (frontend).
- `/journeys` back to onboarding-only: Task 9.
- Sidebar branches by status: Tasks 3, 4.
- API client for history: Task 5.
- Tests: Tasks 1 & 2 (backend), 10 (frontend).

**Placeholders scan:** none — every step has full code, explicit paths, and commit commands.

**Type consistency:** `IDPHistoryEntry.progress` fields match what the backend returns (`total_tasks`, `done_tasks`, `completion_pct`, `mandatory_tasks`, `mandatory_done`). `archived_at` is on both ends. `getMyHistoryPlan` returns `IDPPlan` — the backend payload in Task 2 has the same shape as `/my` (with `is_active: false` and `archived_at`).

**Potential gaps:**

- Sidebar caller location is unknown until grep (Task 4 Step 1). If there are **two** call sites (e.g. Sidebar + MobileNav), both get the same treatment.
- The `/development-plan` page relies on `GraduationCap` and `History` icons being exported from `lucide-react` (they are — already imported at the top of `routes.ts`).
- An ACTIVE user with no active plan still sees "Current plan" nav. That is deliberate: the page itself renders an empty state (Task 6) so they can still see the history link.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-19-idp-route-split-journey-history.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks.
2. **Inline Execution** — batch execution in this session via `superpowers:executing-plans`.

Which approach?

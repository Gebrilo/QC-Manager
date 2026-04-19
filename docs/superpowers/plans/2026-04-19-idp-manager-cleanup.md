# IDP Manager Page Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the manager-side IDP builder (`/manage-development-plans/[userId]`) up to the same standard as the resource-facing page — real toasts instead of `alert()` / `console.log`, visible ON_HOLD status with `hold_reason`, done-late indicator, and a manager comments panel that shows actual author names.

**Architecture:** Drop the `showError` / `showSuccess` stubs and use the `useToast` hook shipped in Plan B. Extend `TaskCommentsPanel` to accept an optional `managerUserId` prop that routes through `/api/development-plans/:userId/tasks/:id/comments` instead of `/my/...`. Teach the backend comments endpoints to join `app_user` and return `author_name` + `author_role` so both the resource and manager views can display who wrote each comment instead of a "You" / "Manager" compromise.

**Tech Stack:** Next.js 14 App Router, React 18, Express, PostgreSQL (Supabase), `useToast()` from `apps/web/src/components/ui/Toast.tsx`, existing IDP UI components under `apps/web/src/components/idp/`, Playwright e2e.

---

## Prerequisites

- Plan A (data model: `hold_reason`, `completed_at`, `user_idp_task_comments` table) is landed.
- Plan B (UI: `useToast`, `TaskStatusBadge`, `TaskCommentsPanel`, `inferBadgeKind`) is landed.
- Backend already exposes `GET/POST /api/development-plans/:userId/tasks/:taskId/comments` and `GET/POST /api/development-plans/my/tasks/:taskId/comments` returning `IDPTaskComment` rows (see `apps/web/src/lib/api.ts:982`).
- The manager page under review is `apps/web/app/manage-development-plans/[userId]/page.tsx`; the current stubs live at lines 7–8, `showError` is called at lines 58, 70, 78, 94, 102, 111, 125, and `showSuccess` at line 109.

---

## File Structure

**Backend:**
- Modify: `apps/api/src/routes/developmentPlans.js` — both comment LIST endpoints (`/my/tasks/:taskId/comments` and `/:userId/tasks/:taskId/comments`) join `app_user` and return `author_name` + `author_role`. Both POST endpoints return the same enriched shape.
- Test: `apps/api/__tests__/developmentPlans.comments.test.js` — new or extended integration test.

**Frontend — shared:**
- Modify: `apps/web/src/lib/api.ts` — extend `IDPTaskComment` with `author_name`, `author_role` (nullable for legacy rows).
- Modify: `apps/web/src/components/idp/TaskCommentsPanel.tsx` — add optional `managerUserId?: string` prop, use it to route to the manager endpoints; render `author_name` instead of hard-coded labels.

**Frontend — manager page:**
- Modify: `apps/web/app/manage-development-plans/[userId]/page.tsx`:
  - remove `showError` / `showSuccess` stub functions
  - import `useToast` and replace call sites
  - extend `statusColors` with `ON_HOLD`
  - render `TaskStatusBadge` for `on_hold`, `overdue`, `done_late`
  - render a `hold_reason` tooltip / inline chip
  - add a comments button per task that opens `TaskCommentsPanel` in manager mode

**Tests:**
- Create: `apps/web/e2e/idp-manager-cleanup.spec.ts` — Playwright coverage.

---

## Conventions

- **Toast usage (the only pattern):**
  ```tsx
  const toast = useToast();
  toast.error(err?.message || 'Something went wrong');
  toast.success('Saved');
  ```
  No `alert()`, no `console.log` for UX surfaces.
- **Dark-mode contrast:** amber text on dark mode uses `text-amber-300` (not `amber-500`) — match `TaskStatusBadge` from Plan B.
- **Destructive confirmations:** keep `window.confirm(...)` for delete actions (already in place). Only error / success *feedback* is replaced.
- **Manager TaskCommentsPanel:** when `managerUserId` is set, header reads "Comments — <task title>" but still shows comments chronologically; managers can also post.

---

## Task 1: Backend — enrich comment rows with author name & role

**Files:**
- Modify: `apps/api/src/routes/developmentPlans.js`
- Test: `apps/api/__tests__/developmentPlans.comments.test.js` (new)

- [ ] **Step 1: Write the failing test**

Create `apps/api/__tests__/developmentPlans.comments.test.js`:

```javascript
'use strict';

const request = require('supertest');
const app = require('../src/index');
const db = require('../src/config/db');
const { signToken } = require('../src/utils/tokens');

describe('IDP task comments — enriched author metadata', () => {
    let managerId, userId, journeyId, chapterId, questId, taskId;
    let managerToken, userToken;

    beforeAll(async () => {
        const mgr = await db.query(
            `INSERT INTO app_user (name, email, role, status) VALUES ('Mgr Alice', $1, 'manager', 'ACTIVE') RETURNING id`,
            [`mgr-${Date.now()}@example.com`]
        );
        managerId = mgr.rows[0].id;
        managerToken = signToken({ id: managerId, role: 'manager' });

        const usr = await db.query(
            `INSERT INTO app_user (name, email, role, status) VALUES ('Res Bob', $1, 'user', 'ACTIVE') RETURNING id`,
            [`usr-${Date.now()}@example.com`]
        );
        userId = usr.rows[0].id;
        userToken = signToken({ id: userId, role: 'user' });

        const plan = await db.query(
            `INSERT INTO journeys (title, plan_type, owner_user_id, is_active)
             VALUES ('IDP', 'idp', $1, true) RETURNING id`, [userId]
        );
        journeyId = plan.rows[0].id;

        const ch = await db.query(
            `INSERT INTO journey_chapters (journey_id, title, sort_order) VALUES ($1, 'Obj', 0) RETURNING id`, [journeyId]
        );
        chapterId = ch.rows[0].id;

        const q = await db.query(
            `INSERT INTO journey_quests (chapter_id, title, sort_order) VALUES ($1, 'Q', 0) RETURNING id`, [chapterId]
        );
        questId = q.rows[0].id;

        const t = await db.query(
            `INSERT INTO journey_tasks (quest_id, title, sort_order) VALUES ($1, 'Task', 0) RETURNING id`, [questId]
        );
        taskId = t.rows[0].id;
    });

    afterAll(async () => {
        await db.query(`DELETE FROM user_idp_task_comments WHERE task_id = $1`, [taskId]);
        await db.query(`DELETE FROM journey_tasks WHERE id = $1`, [taskId]);
        await db.query(`DELETE FROM journey_quests WHERE id = $1`, [questId]);
        await db.query(`DELETE FROM journey_chapters WHERE id = $1`, [chapterId]);
        await db.query(`DELETE FROM journeys WHERE id = $1`, [journeyId]);
        await db.query(`DELETE FROM app_user WHERE id IN ($1, $2)`, [managerId, userId]);
    });

    it('GET /my/tasks/:id/comments returns author_name and author_role', async () => {
        await db.query(
            `INSERT INTO user_idp_task_comments (user_id, task_id, author_id, body) VALUES ($1, $2, $3, 'user comment')`,
            [userId, taskId, userId]
        );
        await db.query(
            `INSERT INTO user_idp_task_comments (user_id, task_id, author_id, body) VALUES ($1, $2, $3, 'mgr comment')`,
            [userId, taskId, managerId]
        );

        const res = await request(app)
            .get(`/api/development-plans/my/tasks/${taskId}/comments`)
            .set('Authorization', `Bearer ${userToken}`);

        expect(res.status).toBe(200);
        const userRow = res.body.find(c => c.body === 'user comment');
        const mgrRow = res.body.find(c => c.body === 'mgr comment');
        expect(userRow.author_name).toBe('Res Bob');
        expect(userRow.author_role).toBe('user');
        expect(mgrRow.author_name).toBe('Mgr Alice');
        expect(mgrRow.author_role).toBe('manager');
    });

    it('POST /:userId/tasks/:id/comments returns author_name for manager', async () => {
        const res = await request(app)
            .post(`/api/development-plans/${userId}/tasks/${taskId}/comments`)
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ body: 'mgr just now' });

        expect(res.status).toBe(201);
        expect(res.body.author_name).toBe('Mgr Alice');
        expect(res.body.author_role).toBe('manager');
    });
});
```

- [ ] **Step 2: Run the test — must FAIL**

Run: `cd apps/api && npx jest __tests__/developmentPlans.comments.test.js`
Expected: both tests fail because `author_name` and `author_role` are `undefined` on the response rows.

- [ ] **Step 3: Update the SQL for all four endpoints**

In `apps/api/src/routes/developmentPlans.js`, find the four comment handlers (LIST and POST for `/my/tasks/:taskId/comments` and for `/:userId/tasks/:taskId/comments`). Each currently does a plain `SELECT * FROM user_idp_task_comments …` or `INSERT … RETURNING *`. Replace those queries so the returned row includes the author name and role.

For the LIST handlers, change the query to:

```javascript
const result = await db.query(
    `SELECT c.id, c.user_id, c.task_id, c.author_id, c.body, c.created_at, c.updated_at,
            u.name AS author_name, u.role AS author_role
     FROM user_idp_task_comments c
     LEFT JOIN app_user u ON u.id = c.author_id
     WHERE c.user_id = $1 AND c.task_id = $2
     ORDER BY c.created_at ASC`,
    [targetUserId, taskId]
);
res.json(result.rows);
```

For the POST handlers, change the final step to insert then re-select with the join:

```javascript
const inserted = await db.query(
    `INSERT INTO user_idp_task_comments (user_id, task_id, author_id, body)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [targetUserId, taskId, req.user.id, body]
);
const commentId = inserted.rows[0].id;

const full = await db.query(
    `SELECT c.id, c.user_id, c.task_id, c.author_id, c.body, c.created_at, c.updated_at,
            u.name AS author_name, u.role AS author_role
     FROM user_idp_task_comments c
     LEFT JOIN app_user u ON u.id = c.author_id
     WHERE c.id = $1`,
    [commentId]
);
res.status(201).json(full.rows[0]);
```

Keep any existing authz checks (canAccessUser, requireRole, plan-ownership guards) exactly as they are; only the SQL and response are changing.

- [ ] **Step 4: Run the test — must PASS**

Run: `cd apps/api && npx jest __tests__/developmentPlans.comments.test.js`
Expected: 2/2 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/developmentPlans.js apps/api/__tests__/developmentPlans.comments.test.js
git commit -m "feat(idp): return author_name and author_role on task comments"
```

---

## Task 2: Frontend — extend `IDPTaskComment` type

**Files:**
- Modify: `apps/web/src/lib/api.ts`

- [ ] **Step 1: Extend the interface**

Find the `IDPTaskComment` interface (around line 982):

```typescript
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

Change it to:

```typescript
export interface IDPTaskComment {
    id: string;
    user_id: string;
    task_id: string;
    author_id: string;
    author_name: string | null;
    author_role: string | null;
    body: string;
    created_at: string;
    updated_at: string;
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: may surface usage sites that assume the old shape. Fix those in the same commit (if they are truly the old shape — typical fixes are optional-chaining or falling back to `'Unknown'`).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat(idp): add author_name and author_role to IDPTaskComment type"
```

---

## Task 3: Frontend — extend `TaskCommentsPanel` with manager mode

**Files:**
- Modify: `apps/web/src/components/idp/TaskCommentsPanel.tsx`

Add an optional `managerUserId?: string` prop. When provided, the panel uses `developmentPlansApi.listTaskComments(managerUserId, taskId)` and `developmentPlansApi.addTaskComment(managerUserId, taskId, body)`. When not provided, it keeps using the `/my` endpoints. Render `comment.author_name ?? 'Unknown'` for every row (no special-casing of `currentUserId` anymore — the name is the source of truth).

- [ ] **Step 1: Update the props interface**

Near the top of `TaskCommentsPanel.tsx`, extend the component's props type. The shape becomes:

```typescript
interface TaskCommentsPanelProps {
    open: boolean;
    taskId: string | null;
    taskTitle: string;
    currentUserId: string;
    managerUserId?: string;
    onClose: () => void;
}
```

- [ ] **Step 2: Switch the API calls to respect the prop**

Inside the component, wherever `developmentPlansApi.listMyTaskComments(taskId)` is called, replace with:

```typescript
const list = managerUserId
    ? developmentPlansApi.listTaskComments(managerUserId, taskId)
    : developmentPlansApi.listMyTaskComments(taskId);
const data = await list;
```

And for posting:

```typescript
const posted = managerUserId
    ? await developmentPlansApi.addTaskComment(managerUserId, taskId, trimmed)
    : await developmentPlansApi.addMyTaskComment(taskId, trimmed);
```

Keep the `currentUserId` prop — the styling for a user's *own* row (e.g. right-aligned bubble) still keys on it.

- [ ] **Step 3: Render `author_name` instead of "You" / "Manager"**

Each comment row already renders an author label. Replace the conditional label with:

```tsx
<span className="text-xs font-medium text-slate-700 dark:text-slate-200">
    {comment.author_name || 'Unknown'}
    {comment.author_role === 'manager' && (
        <span className="ml-1 text-[10px] uppercase tracking-wide text-indigo-500">Manager</span>
    )}
</span>
```

Keep the "own comment" visual treatment (alignment / bubble color) by comparing `comment.author_id === currentUserId`.

- [ ] **Step 4: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/idp/TaskCommentsPanel.tsx
git commit -m "feat(idp): add manager mode and per-comment author names to TaskCommentsPanel"
```

---

## Task 4: Frontend — swap stubs for `useToast` in the manager page

**Files:**
- Modify: `apps/web/app/manage-development-plans/[userId]/page.tsx`

- [ ] **Step 1: Remove the stubs and import the hook**

Delete lines 7–8 (the `showError` and `showSuccess` stub functions) and add the import at the top of the `'use client'` block:

```tsx
import { useToast } from '../../../src/components/ui/Toast';
```

Inside the `IDPBuilderPage` component, right after the existing state declarations (above `loadPlan`):

```tsx
const toast = useToast();
```

- [ ] **Step 2: Replace each call site**

Replace every `showError(err.message)` with `toast.error(err?.message || 'Something went wrong')`. Replace the single `showSuccess('Plan marked as complete!')` with `toast.success('Plan marked as complete!')`. Expected call sites (one per existing line number below; the text itself may move when stubs are removed, so grep for the old names):

| Old line | Function | Old call | New call |
|----------|----------|----------|----------|
| 58 | `handleCreatePlan` | `showError(err.message);` | `toast.error(err?.message || 'Could not create plan');` |
| 70 | `handleAddObjective` | `showError(err.message);` | `toast.error(err?.message || 'Could not add objective');` |
| 78 | `handleDeleteObjective` | `showError(err.message);` | `toast.error(err?.message || 'Could not delete objective');` |
| 94 | `handleAddTask` | `showError(err.message);` | `toast.error(err?.message || 'Could not add task');` |
| 102 | `handleDeleteTask` | `showError(err.message);` | `toast.error(err?.message || 'Could not delete task');` |
| 109 | `handleCompletePlan` | `showSuccess('Plan marked as complete!');` | `toast.success('Plan marked as complete!');` |
| 111 | `handleCompletePlan` | `showError(err.message);` | `toast.error(err?.message || 'Could not complete plan');` |
| 125 | `handleExportReport` | `showError(err.message);` | `toast.error(err?.message || 'Could not export report');` |

- [ ] **Step 3: Verify no leftover stubs**

Run: `cd apps/web && grep -n "showError\|showSuccess" app/manage-development-plans/\[userId\]/page.tsx`
Expected: no matches.

- [ ] **Step 4: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/manage-development-plans/\[userId\]/page.tsx
git commit -m "refactor(idp): replace alert/console stubs with useToast in manager page"
```

---

## Task 5: Frontend — surface ON_HOLD / done-late / overdue on manager rows

**Files:**
- Modify: `apps/web/app/manage-development-plans/[userId]/page.tsx`

The manager table row currently prints `{task.progress_status}` as a raw string with the `statusColors` map. Bring it closer to the resource view: use the same `TaskStatusBadge` + `inferBadgeKind` helpers, and show the hold reason inline.

- [ ] **Step 1: Add imports**

Near the top of the file:

```tsx
import { TaskStatusBadge, inferBadgeKind } from '../../../src/components/idp/TaskStatusBadge';
```

- [ ] **Step 2: Extend `statusColors`**

Replace the existing `statusColors` object (around line 134-138) with:

```tsx
const statusColors: Record<string, string> = {
    TODO: 'text-slate-400',
    IN_PROGRESS: 'text-indigo-500',
    ON_HOLD: 'text-amber-500 dark:text-amber-300',
    DONE: 'text-emerald-500',
};
```

- [ ] **Step 3: Refresh the task row markup**

Inside the `obj.tasks.map(task => …)` block (around line 233), replace the existing row body with:

```tsx
<div key={task.id} className="flex items-center gap-3 py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
    <span className={`text-xs font-mono ${statusColors[task.progress_status]}`}>
        {task.progress_status}
    </span>
    <span className="flex-1 text-sm text-slate-800 dark:text-slate-200">
        {task.title}
    </span>
    {(() => {
        const kind = inferBadgeKind(task);
        if (!['on_hold', 'overdue', 'done_late'].includes(kind)) return null;
        const suffix = kind === 'done_late' && task.completed_at && task.due_date
            ? (() => {
                const due = new Date(task.due_date);
                const done = new Date(task.completed_at!);
                const days = Math.max(1, Math.round((done.getTime() - due.getTime()) / 86400000));
                return `Late by ${days}d`;
            })()
            : undefined;
        return <TaskStatusBadge kind={kind} suffix={suffix} />;
    })()}
    {task.progress_status === 'ON_HOLD' && task.hold_reason && (
        <span
            className="text-xs italic text-amber-600 dark:text-amber-300 truncate max-w-[200px]"
            title={task.hold_reason}
        >
            “{task.hold_reason}”
        </span>
    )}
    {task.priority && (
        <span className={`text-xs px-2 py-0.5 rounded-full ${priorityColors[task.priority]}`}>
            {task.priority}
        </span>
    )}
    {task.progress_status === 'DONE' && task.completed_at ? (
        <span className="text-xs text-emerald-500">Completed {fmtDate(task.completed_at)}</span>
    ) : (task.start_date || task.due_date) ? (
        <span className="text-xs text-slate-400">
            {task.start_date ? fmtDate(task.start_date) : ''}{task.start_date && task.due_date ? ' → ' : ''}{task.due_date ? fmtDate(task.due_date) : ''}
        </span>
    ) : null}
    <button
        onClick={() => handleDeleteTask(task.id)}
        className="text-xs text-red-400 hover:text-red-600 transition-colors"
    >
        ×
    </button>
</div>
```

- [ ] **Step 4: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errors. If `task.hold_reason` or `task.completed_at` trigger missing-property errors, extend the `IDPTask` type in `apps/web/src/lib/api.ts` to include them (they are already part of the `/my` payload from Plan A — confirm they are on the `IDPTask` interface and add them if missing).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/manage-development-plans/\[userId\]/page.tsx
git commit -m "feat(idp): render ON_HOLD and done-late states with hold_reason on manager page"
```

---

## Task 6: Frontend — add comments button on manager task rows

**Files:**
- Modify: `apps/web/app/manage-development-plans/[userId]/page.tsx`

Managers should be able to open the comments panel for any task of the resource. Add a `💬` button next to the delete `×` button and wire up `TaskCommentsPanel` in manager mode.

- [ ] **Step 1: Add state and imports**

Add at the top (with the existing imports):

```tsx
import { TaskCommentsPanel } from '../../../src/components/idp/TaskCommentsPanel';
import { useAuth } from '../../../src/components/providers/AuthProvider';
import type { IDPTask } from '../../../src/lib/api';
```

Inside `IDPBuilderPage`, next to the other state hooks:

```tsx
const { user } = useAuth();
const [commentsTask, setCommentsTask] = useState<IDPTask | null>(null);
```

- [ ] **Step 2: Add the comments button**

In the task row markup edited in Task 5, immediately **before** the delete `×` button, insert:

```tsx
<button
    type="button"
    aria-label={`Open comments for ${task.title}`}
    onClick={() => setCommentsTask(task)}
    className="text-xs text-slate-400 hover:text-indigo-500 px-1.5 py-1 rounded"
    title="Comments"
>
    💬
</button>
```

- [ ] **Step 3: Mount the panel**

Just before the final closing `</div>` of the page (right after the `+ Add Objective` block near line 320), add:

```tsx
<TaskCommentsPanel
    open={commentsTask !== null}
    taskId={commentsTask?.id ?? null}
    taskTitle={commentsTask?.title ?? ''}
    currentUserId={user?.id ?? ''}
    managerUserId={userId}
    onClose={() => setCommentsTask(null)}
/>
```

- [ ] **Step 4: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/manage-development-plans/\[userId\]/page.tsx
git commit -m "feat(idp): allow managers to open task comments from builder page"
```

---

## Task 7: Playwright e2e — manager page cleanup

**Files:**
- Create: `apps/web/e2e/idp-manager-cleanup.spec.ts`

- [ ] **Step 1: Write the tests**

Create `apps/web/e2e/idp-manager-cleanup.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { mockAuthenticatedSession } from './helpers/session';

const managerUser = {
    id: '00000000-0000-0000-0000-0000000000c1',
    name: 'Mgr Carol',
    email: 'mgr@example.com',
    role: 'manager' as const,
    status: 'ACTIVE' as const,
};

const resourceId = '00000000-0000-0000-0000-0000000000d1';

const planFixture = {
    id: 'plan-1',
    title: 'IDP for Bob',
    description: 'Q2 plan',
    is_active: true,
    progress: { total_tasks: 2, done_tasks: 1, completion_pct: 50, mandatory_tasks: 1, mandatory_done: 1, overdue_tasks: 0, on_hold_tasks: 1 },
    objectives: [{
        id: 'obj-1',
        title: 'Objective A',
        sort_order: 0,
        progress: { total_tasks: 2, done_tasks: 1, completion_pct: 50 },
        tasks: [
            {
                id: 't1', title: 'Task held', progress_status: 'ON_HOLD', hold_reason: 'Waiting on vendor',
                priority: 'medium', is_mandatory: true, sort_order: 0,
            },
            {
                id: 't2', title: 'Task late done', progress_status: 'DONE',
                due_date: '2026-01-01', completed_at: '2026-01-05T10:00:00Z',
                priority: 'high', is_mandatory: true, sort_order: 1,
            },
        ],
    }],
};

test.describe('IDP manager cleanup', () => {
    test('toast shows on backend error (no native alert)', async ({ page }) => {
        await mockAuthenticatedSession(page, { user: managerUser, permissions: ['page:resources'] });

        await page.route(`**/api/development-plans/${resourceId}`, r => r.fulfill({
            status: 200, contentType: 'application/json', body: JSON.stringify(planFixture),
        }));
        await page.route(`**/api/development-plans/${resourceId}/objectives/obj-1`, r => r.fulfill({
            status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Boom' }),
        }));

        let nativeAlertFired = false;
        page.on('dialog', d => { nativeAlertFired = true; d.dismiss(); });

        await page.goto(`/manage-development-plans/${resourceId}`);
        await expect(page.getByText('Objective A')).toBeVisible();

        page.once('dialog', d => d.accept()); // confirm() for delete
        await page.getByRole('button', { name: 'Delete' }).first().click();

        await expect(page.getByRole('status').filter({ hasText: 'Boom' })).toBeVisible();
        expect(nativeAlertFired).toBe(false);
    });

    test('ON_HOLD task shows hold reason and badge', async ({ page }) => {
        await mockAuthenticatedSession(page, { user: managerUser, permissions: ['page:resources'] });
        await page.route(`**/api/development-plans/${resourceId}`, r => r.fulfill({
            status: 200, contentType: 'application/json', body: JSON.stringify(planFixture),
        }));
        await page.goto(`/manage-development-plans/${resourceId}`);
        await expect(page.getByText('Task held')).toBeVisible();
        await expect(page.getByText('Waiting on vendor')).toBeVisible();
        await expect(page.getByText(/On hold/i)).toBeVisible();
    });

    test('done-late badge renders with day count', async ({ page }) => {
        await mockAuthenticatedSession(page, { user: managerUser, permissions: ['page:resources'] });
        await page.route(`**/api/development-plans/${resourceId}`, r => r.fulfill({
            status: 200, contentType: 'application/json', body: JSON.stringify(planFixture),
        }));
        await page.goto(`/manage-development-plans/${resourceId}`);
        await expect(page.getByText(/Late by 4d/)).toBeVisible();
    });

    test('manager can open comments panel with author names', async ({ page }) => {
        await mockAuthenticatedSession(page, { user: managerUser, permissions: ['page:resources'] });
        await page.route(`**/api/development-plans/${resourceId}`, r => r.fulfill({
            status: 200, contentType: 'application/json', body: JSON.stringify(planFixture),
        }));
        await page.route(`**/api/development-plans/${resourceId}/tasks/t1/comments`, async r => {
            if (r.request().method() === 'GET') {
                await r.fulfill({
                    status: 200, contentType: 'application/json',
                    body: JSON.stringify([
                        {
                            id: 'c1', user_id: resourceId, task_id: 't1', author_id: resourceId,
                            author_name: 'Res Bob', author_role: 'user',
                            body: 'why is this blocked?',
                            created_at: '2026-04-10T10:00:00Z', updated_at: '2026-04-10T10:00:00Z',
                        },
                    ]),
                });
            } else {
                await r.fulfill({
                    status: 201, contentType: 'application/json',
                    body: JSON.stringify({
                        id: 'c2', user_id: resourceId, task_id: 't1', author_id: managerUser.id,
                        author_name: managerUser.name, author_role: 'manager',
                        body: 'vendor ETA tomorrow',
                        created_at: '2026-04-19T09:00:00Z', updated_at: '2026-04-19T09:00:00Z',
                    }),
                });
            }
        });

        await page.goto(`/manage-development-plans/${resourceId}`);
        await page.getByRole('button', { name: /Open comments for Task held/i }).click();
        await expect(page.getByText('Res Bob')).toBeVisible();
        await expect(page.getByText('why is this blocked?')).toBeVisible();

        await page.getByPlaceholder(/Add a comment/i).fill('vendor ETA tomorrow');
        await page.getByRole('button', { name: /Post/i }).click();
        await expect(page.getByText('vendor ETA tomorrow')).toBeVisible();
        await expect(page.getByText(managerUser.name)).toBeVisible();
    });
});
```

- [ ] **Step 2: Run the tests**

Run (from `apps/web`):

```bash
npx playwright test idp-manager-cleanup --reporter=list
```

Expected: 4/4 passing. If the local `webServer` isn't wired into `playwright.config.ts`, validate in CI instead (same fallback documented in Plan B).

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/idp-manager-cleanup.spec.ts
git commit -m "test(idp): e2e coverage for manager page cleanup"
```

---

## Self-Review

**Spec coverage (against the goals):**

- Replace `alert()` / `console.log` with `useToast`: Task 4 (all 8 call sites in the table).
- ON_HOLD visible on manager page with colour: Task 5 (`statusColors.ON_HOLD`).
- `hold_reason` inline: Task 5 (amber-tinted italic chip with tooltip).
- Done-late badge: Task 5 (`TaskStatusBadge kind="done_late"` with `Late by Nd` suffix).
- Manager comments panel: Tasks 3 (component prop), 6 (page wiring).
- Real author names in comments: Tasks 1 (backend JOIN), 2 (type), 3 (render).
- Tests: Tasks 1, 7.

**Placeholders scan:** none — every step shows actual code and commit commands.

**Type consistency:**

- `IDPTaskComment.author_name: string | null` is consistent across backend (`u.name` from `app_user`, may be null for deleted users) and frontend render (`comment.author_name ?? 'Unknown'`).
- `IDPTaskComment.author_role: string | null` — backend returns the `app_user.role` enum string; frontend only checks `=== 'manager'`.
- `TaskCommentsPanel` accepts both `currentUserId` (existing) and new `managerUserId`. The prop list is additive — existing callers in `apps/web/app/journeys/page.tsx` (Plan B) and the new `/development-plan` page (Plan C) are unaffected.

**Potential gaps:**

- If the `IDPTask` type in `api.ts` doesn't yet include `hold_reason`, Task 5 Step 4 flags it — extend the type there. Plan A should have added it; this plan verifies rather than re-adds.
- The LIST/POST comment handlers' response shape shifts from `user_idp_task_comments.*` (`SELECT *`) to a curated column list. Any hidden consumer relying on a column that's no longer selected (unlikely — `edited_at` doesn't exist here; `author_name` / `author_role` are additive) breaks loudly with a missing field rather than silently. Grep for `user_idp_task_comments` usages in `apps/api/src/` before finishing Task 1 to be certain.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-19-idp-manager-cleanup.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks.
2. **Inline Execution** — batch execution in this session via `superpowers:executing-plans`.

Which approach?

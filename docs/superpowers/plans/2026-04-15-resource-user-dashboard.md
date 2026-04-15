# Resource User Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a personal `/my-dashboard` route for resource users showing their own tasks, projects, hours variance, task distribution, and submitted bugs — powered by a new `GET /me/dashboard` API endpoint and a new `submitted_by_resource_id` column on the `bugs` table.

**Architecture:** New dedicated `GET /me/dashboard` endpoint in `apps/api/src/routes/me.js` resolves the logged-in user's linked resource from `req.user.id` and returns a purpose-built response. The `bugs` table gains a `submitted_by_resource_id` column populated by the Tuleap webhook handler (resolved by email). The frontend route `/my-dashboard` uses a client component pattern identical to the existing dashboard.

**Tech Stack:** Node/Express (API), PostgreSQL (Supabase), Next.js 14 App Router, React, Tailwind CSS, Recharts (via existing DonutChart), Jest (API tests)

**Spec:** `docs/superpowers/specs/2026-04-15-resource-user-dashboard-design.md`

---

## File Map

### Create
| File | Purpose |
|---|---|
| `database/migrations/018_resource_dashboard.sql` | Add `submitted_by_resource_id` to `bug` table |
| `apps/api/src/routes/me.js` | `GET /me/dashboard` endpoint |
| `apps/api/__tests__/meDashboard.test.js` | Jest tests for `/me/dashboard` |
| `apps/web/app/my-dashboard/page.tsx` | Next.js route entry |
| `apps/web/app/my-dashboard/my-dashboard-client.tsx` | Client component, all widgets |
| `apps/web/src/components/my-dashboard/MyStatCards.tsx` | 3 stat cards |
| `apps/web/src/components/my-dashboard/TaskDistributionChart.tsx` | Donut chart by status |
| `apps/web/src/components/my-dashboard/TasksByProjectTable.tsx` | Project breakdown table |
| `apps/web/src/components/my-dashboard/MyBugsTable.tsx` | Submitted bugs table |

### Modify
| File | Change |
|---|---|
| `apps/api/src/routes/auth.js` | Add `page:my-dashboard` to DEFAULT_PERMISSIONS |
| `apps/api/src/index.js` | Register `/me` router |
| `apps/api/src/routes/tuleapWebhook.js` | Resolve `submitted_by_resource_id` on bug INSERT |
| `apps/api/src/routes/bugs.js` | JOIN `submitted_by_resource_name` in list/summary queries |
| `apps/web/src/lib/api.ts` | Add `submitted_by_resource_name` to `Bug`, add `meDashboardApi` |
| `apps/web/src/config/routes.ts` | Add `/my-dashboard` route config |
| `apps/web/app/bugs/page.tsx` | Add "Submitted By" column to bugs table |

---

## Task 1: DB Migration — `submitted_by_resource_id`

**Files:**
- Create: `database/migrations/018_resource_dashboard.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 018_resource_dashboard.sql
-- Adds submitted_by_resource_id to track who submitted each bug in Tuleap.
-- Separate from owner_resource_id (which tracks the reporter via a different path).

ALTER TABLE bugs
  ADD COLUMN IF NOT EXISTS submitted_by_resource_id UUID
    REFERENCES resources(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bug_submitted_by
  ON bugs(submitted_by_resource_id)
  WHERE deleted_at IS NULL;
```

- [ ] **Step 2: Apply migration manually to verify it runs cleanly**

```bash
docker exec -i supabase-db psql -U postgres -d postgres \
  < /root/QC-Manager/database/migrations/018_resource_dashboard.sql
```

Expected output:
```
ALTER TABLE
CREATE INDEX
```

- [ ] **Step 3: Verify column exists**

```bash
docker exec supabase-db psql -U postgres -d postgres -c \
  "\d bugs" | grep submitted_by
```

Expected: `submitted_by_resource_id | uuid | ...`

- [ ] **Step 4: Commit**

```bash
git add database/migrations/018_resource_dashboard.sql
git commit -m "feat(db): add submitted_by_resource_id to bugs table"
```

---

## Task 2: API — Add `page:my-dashboard` Permission

**Files:**
- Modify: `apps/api/src/routes/auth.js:72-107`

- [ ] **Step 1: Add `page:my-dashboard` to `user`, `viewer`, `contributor` in DEFAULT_PERMISSIONS**

In `apps/api/src/routes/auth.js`, update the three role arrays:

For `user` (currently line 72), add `'page:my-dashboard'` after `'page:my-tasks'`:
```js
user: [
    // Pages
    'page:dashboard', 'page:tasks', 'page:projects', 'page:resources',
    'page:test-executions', 'page:reports',
    'page:my-tasks', 'page:my-dashboard',
    // ... rest unchanged
```

For `viewer` (currently line 92), add `'page:my-dashboard'` after `'page:my-tasks'`:
```js
viewer: [
    // Pages
    'page:dashboard', 'page:tasks', 'page:projects', 'page:resources',
    'page:test-executions', 'page:reports',
    'page:my-tasks', 'page:my-dashboard',
    // ... rest unchanged
```

For `contributor` (currently line 100), add `'page:my-dashboard'` after `'page:my-tasks'`:
```js
contributor: [
    // Pages
    'page:dashboard', 'page:tasks', 'page:my-tasks', 'page:my-dashboard',
    // ... rest unchanged
```

Also add `'page:my-dashboard'` to `admin` and `manager` arrays (after `'page:my-tasks'`) so the route is accessible when admins visit it:

For `admin` (line 8): add `'page:my-dashboard'` after `'page:my-tasks'`
For `manager` (line 41): add `'page:my-dashboard'` after `'page:my-tasks'`

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/routes/auth.js
git commit -m "feat(auth): add page:my-dashboard to default permissions"
```

---

## Task 3: API — Register `/me` Router

**Files:**
- Modify: `apps/api/src/index.js:44`

- [ ] **Step 1: Add the `/me` route registration after `/my-tasks`**

In `apps/api/src/index.js`, after line 44 (`apiRouter.use('/my-tasks', ...)`), add:

```js
apiRouter.use('/me', require('./routes/me'));
```

The block should now read:
```js
apiRouter.use('/my-tasks', require('./routes/personalTasks'));
apiRouter.use('/me', require('./routes/me'));
apiRouter.use('/roles', require('./routes/roles'));
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/index.js
git commit -m "feat(api): register /me router"
```

---

## Task 4: API — Write failing tests for `GET /me/dashboard`

**Files:**
- Create: `apps/api/__tests__/meDashboard.test.js`

- [ ] **Step 1: Write the test file**

```js
/**
 * Jest tests for GET /me/dashboard
 */

jest.mock('../src/config/db', () => ({
  pool: {
    query: jest.fn(),
  },
}));

const { pool } = require('../src/config/db');

// We test the handler logic directly by importing the route module
// after mocking db. The handler is exported for testing.
let handler;
beforeAll(() => {
  handler = require('../src/routes/me').testExports.dashboardHandler;
});

beforeEach(() => {
  jest.clearAllMocks();
});

function makeReq(userId = 'user-123') {
  return { user: { id: userId } };
}

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('GET /me/dashboard', () => {
  test('returns 404 when no resource linked to user', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] }); // resource lookup returns empty

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: 'No resource linked to your account',
    });
  });

  test('returns dashboard with zero totals when user has no tasks or bugs', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'res-abc', resource_name: 'Alice', department: 'QA' }] }) // resource
      .mockResolvedValueOnce({ rows: [] }) // tasks
      .mockResolvedValueOnce({ rows: [] }); // bugs

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: { resource_id: 'res-abc', resource_name: 'Alice', department: 'QA' },
        summary: { total_tasks: 0, total_projects: 0, hours_variance: 0 },
        task_distribution: {},
        tasks_by_project: [],
        submitted_bugs: [],
      })
    );
  });

  test('computes hours_variance as SUM(actual) - SUM(estimate)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'res-abc', resource_name: 'Alice', department: 'QA' }] })
      .mockResolvedValueOnce({ rows: [
        { status: 'In Progress', project_id: 'p1', project_name: 'Alpha', estimate_hrs: 10, actual_hrs: 12 },
        { status: 'Done',        project_id: 'p1', project_name: 'Alpha', estimate_hrs: 5,  actual_hrs: 3  },
      ]})
      .mockResolvedValueOnce({ rows: [] });

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    const body = res.json.mock.calls[0][0];
    // variance = (12 + 3) - (10 + 5) = 0
    expect(body.summary.hours_variance).toBe(0);
    expect(body.summary.total_tasks).toBe(2);
    expect(body.summary.total_projects).toBe(1);
  });

  test('aggregates task_distribution by status', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'res-abc', resource_name: 'Alice', department: 'QA' }] })
      .mockResolvedValueOnce({ rows: [
        { status: 'Backlog',     project_id: 'p1', project_name: 'A', estimate_hrs: 2, actual_hrs: 0 },
        { status: 'Backlog',     project_id: 'p2', project_name: 'B', estimate_hrs: 2, actual_hrs: 0 },
        { status: 'In Progress', project_id: 'p1', project_name: 'A', estimate_hrs: 4, actual_hrs: 5 },
      ]})
      .mockResolvedValueOnce({ rows: [] });

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.task_distribution).toEqual({ Backlog: 2, 'In Progress': 1 });
  });

  test('aggregates tasks_by_project correctly', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'res-abc', resource_name: 'Alice', department: 'QA' }] })
      .mockResolvedValueOnce({ rows: [
        { status: 'Done',        project_id: 'p1', project_name: 'Alpha', estimate_hrs: 2, actual_hrs: 2 },
        { status: 'In Progress', project_id: 'p1', project_name: 'Alpha', estimate_hrs: 3, actual_hrs: 1 },
        { status: 'Backlog',     project_id: 'p2', project_name: 'Beta',  estimate_hrs: 1, actual_hrs: 0 },
      ]})
      .mockResolvedValueOnce({ rows: [] });

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.tasks_by_project).toEqual(
      expect.arrayContaining([
        { project_id: 'p1', project_name: 'Alpha', total: 2, done: 1, in_progress: 1, backlog: 0 },
        { project_id: 'p2', project_name: 'Beta',  total: 1, done: 0, in_progress: 0, backlog: 1 },
      ])
    );
  });

  test('includes submitted_bugs in response', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'res-abc', resource_name: 'Alice', department: 'QA' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [
        { id: 'bug-1', bug_id: 'TLP-99', title: 'Crash on login', status: 'Open',
          severity: 'high', project_name: 'Alpha', creation_date: '2026-04-01' },
      ]});

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.submitted_bugs).toHaveLength(1);
    expect(body.submitted_bugs[0].bug_id).toBe('TLP-99');
  });
});
```

- [ ] **Step 2: Run the tests — they must FAIL (module not found)**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/meDashboard.test.js --no-coverage 2>&1 | tail -20
```

Expected: `Cannot find module '../src/routes/me'`

---

## Task 5: API — Implement `GET /me/dashboard`

**Files:**
- Create: `apps/api/src/routes/me.js`

- [ ] **Step 1: Create the route file**

```js
const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { requireAuth, requirePermission } = require('../middleware/authMiddleware');

// ─── Handler (exported for unit testing) ─────────────────────────────────────

async function dashboardHandler(req, res) {
    try {
        // 1. Resolve the logged-in user's linked resource
        const resourceRes = await pool.query(
            `SELECT id, resource_name, department
             FROM resources
             WHERE user_id = $1 AND deleted_at IS NULL AND is_active = true
             LIMIT 1`,
            [req.user.id]
        );

        if (resourceRes.rows.length === 0) {
            return res.status(404).json({ error: 'No resource linked to your account' });
        }

        const resource = resourceRes.rows[0];
        const resourceId = resource.id;

        // 2. Fetch all assigned tasks (primary or secondary resource)
        const tasksRes = await pool.query(
            `SELECT
                t.status,
                t.project_id,
                p.project_name,
                CASE WHEN t.resource1_id = $1
                     THEN COALESCE(t.r1_estimate_hrs, 0)
                     ELSE COALESCE(t.r2_estimate_hrs, 0)
                END AS estimate_hrs,
                CASE WHEN t.resource1_id = $1
                     THEN COALESCE(t.r1_actual_hrs, 0)
                     ELSE COALESCE(t.r2_actual_hrs, 0)
                END AS actual_hrs
             FROM tasks t
             LEFT JOIN projects p ON t.project_id = p.id
             WHERE (t.resource1_id = $1 OR t.resource2_id = $1)
               AND t.deleted_at IS NULL`,
            [resourceId]
        );

        const tasks = tasksRes.rows;

        // 3. Aggregate summary metrics
        const totalTasks = tasks.length;
        const projectIds = new Set(tasks.map(t => t.project_id).filter(Boolean));
        const totalProjects = projectIds.size;
        const totalActual = tasks.reduce((s, t) => s + Number(t.actual_hrs), 0);
        const totalEstimate = tasks.reduce((s, t) => s + Number(t.estimate_hrs), 0);
        const hoursVariance = Math.round((totalActual - totalEstimate) * 100) / 100;

        // 4. Task distribution by status
        const taskDistribution = {};
        for (const t of tasks) {
            if (t.status) {
                taskDistribution[t.status] = (taskDistribution[t.status] || 0) + 1;
            }
        }

        // 5. Tasks by project
        const projectMap = {};
        for (const t of tasks) {
            const key = t.project_id || 'unassigned';
            if (!projectMap[key]) {
                projectMap[key] = {
                    project_id: t.project_id || null,
                    project_name: t.project_name || 'Unassigned',
                    total: 0,
                    done: 0,
                    in_progress: 0,
                    backlog: 0,
                };
            }
            projectMap[key].total++;
            if (t.status === 'Done') projectMap[key].done++;
            else if (t.status === 'In Progress') projectMap[key].in_progress++;
            else if (t.status === 'Backlog') projectMap[key].backlog++;
        }
        const tasksByProject = Object.values(projectMap);

        // 6. Bugs submitted by this resource
        const bugsRes = await pool.query(
            `SELECT
                b.id,
                b.bug_id,
                b.title,
                b.status,
                b.severity,
                p.project_name,
                b.reported_date AS creation_date
             FROM bugs b
             LEFT JOIN projects p ON b.project_id = p.id
             WHERE b.submitted_by_resource_id = $1
               AND b.deleted_at IS NULL
             ORDER BY b.reported_date DESC NULLS LAST, b.created_at DESC
             LIMIT 100`,
            [resourceId]
        );

        res.json({
            profile: {
                resource_id: resource.id,
                resource_name: resource.resource_name,
                department: resource.department,
            },
            summary: {
                total_tasks: totalTasks,
                total_projects: totalProjects,
                hours_variance: hoursVariance,
            },
            task_distribution: taskDistribution,
            tasks_by_project: tasksByProject,
            submitted_bugs: bugsRes.rows,
        });
    } catch (err) {
        console.error('GET /me/dashboard error:', err);
        res.status(500).json({ error: 'Failed to load dashboard' });
    }
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.get('/dashboard', requireAuth, requirePermission('page:my-dashboard'), dashboardHandler);

module.exports = router;
module.exports.testExports = { dashboardHandler };
```

- [ ] **Step 2: Run the tests — they must all PASS**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/meDashboard.test.js --no-coverage 2>&1 | tail -20
```

Expected: `Tests: 6 passed, 6 total`

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/me.js apps/api/__tests__/meDashboard.test.js
git commit -m "feat(api): add GET /me/dashboard endpoint with tests"
```

---

## Task 6: API — Wire `submitted_by_resource_id` in Webhook Handler

**Files:**
- Modify: `apps/api/src/routes/tuleapWebhook.js:228-412`

- [ ] **Step 1: Destructure `submitted_by_email` from request body**

In `tuleapWebhook.js` at the destructuring block (around line 229), add `submitted_by_email` and `submitted_by_username`:

```js
const {
    tuleap_artifact_id,
    tuleap_tracker_id,
    tuleap_url,
    title,
    description,
    status = 'Open',
    severity = 'medium',
    priority = 'medium',
    bug_type,
    component,
    project_id,
    linked_test_case_ids: rawTestCaseIds = [],
    linked_test_execution_ids: rawTestExecIds = [],
    reported_by,
    updated_by,
    assigned_to,
    reported_date,
    raw_tuleap_payload,
    source = 'EXPLORATORY',
    submitted_by_email = null,       // ← ADD THIS
    submitted_by_username = null,    // ← ADD THIS
} = req.body;
```

- [ ] **Step 2: Resolve `submitted_by_resource_id` before the INSERT block**

Find the `if (isUpdate) {` block (around line 350). Just before it, add the resolver (after the `let ownerResourceId = null` block is a good reference — this is a parallel lookup for a new concern):

```js
// Resolve submitted_by_resource_id from email (set once on INSERT, not updated)
let submittedByResourceId = null;
if (submitted_by_email) {
    const submitterRes = await pool.query(
        `SELECT id FROM resources
         WHERE LOWER(email) = LOWER($1)
           AND deleted_at IS NULL
         LIMIT 1`,
        [submitted_by_email]
    );
    submittedByResourceId = submitterRes.rows[0]?.id ?? null;
}
```

Place this block immediately before the `if (isUpdate) {` check so it runs for both INSERT and UPDATE paths, but we only use it in the INSERT.

- [ ] **Step 3: Add `submitted_by_resource_id` to the INSERT statement**

Find the INSERT query (around line 394). Change the column list and values to include the new column:

```js
const result = await pool.query(`
    INSERT INTO bugs (
        tuleap_artifact_id, tuleap_tracker_id, tuleap_url,
        bug_id, title, description, status, severity, priority,
        bug_type, component, project_id,
        linked_test_case_ids, linked_test_execution_ids,
        reported_by, assigned_to, reported_date, raw_tuleap_payload, source,
        owner_resource_id, submitted_by_resource_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
    RETURNING *
`, [
    tuleap_artifact_id, tuleap_tracker_id, tuleap_url,
    bug_id, title, description, status, severity, priority,
    bug_type, component, project_id,
    linked_test_case_ids, linked_test_execution_ids,
    reported_by, assigned_to, reported_date || new Date(), raw_tuleap_payload, finalSource,
    ownerResourceId, submittedByResourceId
]);
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/tuleapWebhook.js
git commit -m "feat(webhook): resolve submitted_by_resource_id on bug insert"
```

---

## Task 7: API — Add `submitted_by_resource_name` to Bug List Query

**Files:**
- Modify: `apps/api/src/routes/bugs.js:96-187`

- [ ] **Step 1: Add the JOIN and column to the list query**

In `bugs.js`, the `GET /` handler has a SELECT starting at line 102. Update it to add a JOIN on `submitted_by_resource_id` and return the name:

```js
let query = `
    SELECT
        b.*,
        p.project_name,
        r.resource_name AS submitted_by_resource_name,
        CASE WHEN array_length(b.linked_test_execution_ids, 1) > 0 THEN true ELSE false END AS has_test_link
    FROM bugs b
    LEFT JOIN projects p ON b.project_id = p.id
    LEFT JOIN resources r ON b.submitted_by_resource_id = r.id
    WHERE b.deleted_at IS NULL
`;
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/routes/bugs.js
git commit -m "feat(api): add submitted_by_resource_name to bug list response"
```

---

## Task 8: Frontend — Update `Bug` Type and Add `meDashboardApi`

**Files:**
- Modify: `apps/web/src/lib/api.ts:303-352`

- [ ] **Step 1: Add `submitted_by_resource_name` to the `Bug` interface**

In `apps/web/src/lib/api.ts`, add the field to the `Bug` interface (after `has_test_link`):

```ts
export interface Bug {
    id: string;
    bug_id: string;
    tuleap_artifact_id?: number;
    title: string;
    description?: string;
    status: string;
    severity: string;
    priority: string;
    bug_type?: string;
    component?: string;
    project_id?: string;
    project_name?: string;
    reported_by?: string;
    updated_by?: string;
    assigned_to?: string;
    reported_date?: string;
    tuleap_url?: string;
    has_test_link?: boolean;
    source?: 'TEST_CASE' | 'EXPLORATORY';
    submitted_by_resource_name?: string;   // ← ADD THIS
    created_at?: string;
    updated_at?: string;
}
```

- [ ] **Step 2: Add `MeDashboard` type and `meDashboardApi`**

After the `bugsApi` export (after line 352), add:

```ts
export interface MeDashboard {
    profile: {
        resource_id: string;
        resource_name: string;
        department: string | null;
    };
    summary: {
        total_tasks: number;
        total_projects: number;
        hours_variance: number;
    };
    task_distribution: Record<string, number>;
    tasks_by_project: Array<{
        project_id: string | null;
        project_name: string;
        total: number;
        done: number;
        in_progress: number;
        backlog: number;
    }>;
    submitted_bugs: Array<{
        id: string;
        bug_id: string;
        title: string;
        status: string;
        severity: string;
        project_name: string | null;
        creation_date: string | null;
    }>;
}

export const meDashboardApi = {
    get: () => fetchApi<MeDashboard>('/me/dashboard'),
};
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat(frontend): add MeDashboard type and meDashboardApi"
```

---

## Task 9: Frontend — Add `/my-dashboard` Route Config

**Files:**
- Modify: `apps/web/src/config/routes.ts:18-56`

- [ ] **Step 1: Import the icon and add the route**

At the top of `routes.ts`, add `LayoutGrid` to the lucide-react import:

```ts
import { LucideIcon, CheckSquare, LayoutDashboard, LayoutGrid, ListTodo, FolderKanban, Users, ShieldCheck, FlaskConical, BarChart3, UserCog, History, Map, Settings2, Users2, Bug } from 'lucide-react';
```

Then in the `ROUTES` array, add the new entry after the `/journeys/[id]` entry (navOrder 1.5) and before `/dashboard` (navOrder 2):

```ts
{ path: '/my-dashboard', label: 'My Dashboard', permission: 'page:my-dashboard', requiresActivation: false, showInNavbar: true, navOrder: 1.8, icon: LayoutGrid },
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/config/routes.ts
git commit -m "feat(frontend): add /my-dashboard to route config"
```

---

## Task 10: Frontend — Create Stat Cards Component

**Files:**
- Create: `apps/web/src/components/my-dashboard/MyStatCards.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { StatCard } from '@/components/ui/StatCard';
import { MeDashboard } from '@/lib/api';

interface MyStatCardsProps {
    summary: MeDashboard['summary'];
}

export function MyStatCards({ summary }: MyStatCardsProps) {
    const { total_tasks, total_projects, hours_variance } = summary;

    const varianceDisplay = hours_variance === 0
        ? '0'
        : `${hours_variance > 0 ? '+' : ''}${hours_variance.toFixed(1)}`;

    // Positive variance = over budget = bad (red/down). Negative = under budget = good (green/up).
    const varianceTrend = hours_variance > 0 ? 'down' : hours_variance < 0 ? 'up' : undefined;

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
                title="Total Tasks"
                value={total_tasks}
                subtitle="assigned to you"
                icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                }
                tooltip="Total project tasks assigned to you (primary or secondary resource)."
            />
            <StatCard
                title="Total Projects"
                value={total_projects}
                subtitle="you're contributing to"
                icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                }
                tooltip="Number of distinct projects you have tasks in."
            />
            <StatCard
                title="Hours Variance"
                value={varianceDisplay}
                subtitle="actual vs estimated hrs"
                trend={varianceTrend}
                icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                }
                tooltip="Difference between actual and estimated hours across all your tasks. Positive (+) means over budget, negative (−) means under budget."
            />
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/my-dashboard/MyStatCards.tsx
git commit -m "feat(frontend): add MyStatCards component"
```

---

## Task 11: Frontend — Create Task Distribution Chart

**Files:**
- Create: `apps/web/src/components/my-dashboard/TaskDistributionChart.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { DonutChart } from '@/components/dashboard/ChartComponents';
import { InfoTooltip } from '@/components/ui/Tooltip';

const STATUS_COLORS: Record<string, string> = {
    'Backlog':     '#64748b',
    'In Progress': '#6366f1',
    'Done':        '#10b981',
    'Cancelled':   '#f43f5e',
};

interface TaskDistributionChartProps {
    distribution: Record<string, number>;
}

export function TaskDistributionChart({ distribution }: TaskDistributionChartProps) {
    const donutData = Object.entries(distribution).map(([label, value]) => ({
        label,
        value,
        color: STATUS_COLORS[label] || '#94a3b8',
    }));

    if (donutData.length === 0) {
        return (
            <Card className="flex flex-col items-center shadow-md">
                <CardHeader className="self-start w-full">
                    <div className="flex items-center gap-2">
                        <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200">Task Distribution</CardTitle>
                        <InfoTooltip content="Distribution of your tasks by status." position="right" />
                    </div>
                </CardHeader>
                <CardContent className="flex items-center justify-center py-8 w-full">
                    <p className="text-sm text-slate-400">No tasks assigned yet.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="flex flex-col items-center shadow-md hover:shadow-lg transition-shadow duration-300">
            <CardHeader className="self-start w-full">
                <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200">Task Distribution</CardTitle>
                    <InfoTooltip content="Distribution of your tasks by status." position="right" />
                </div>
            </CardHeader>
            <CardContent className="flex flex-col items-center w-full">
                <DonutChart data={donutData} />
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-6 w-full px-4">
                    {donutData.map(d => (
                        <div key={d.label} className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: d.color }} />
                            <span className="text-xs text-slate-600 dark:text-slate-400 font-medium truncate">
                                {d.label} ({d.value})
                            </span>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/my-dashboard/TaskDistributionChart.tsx
git commit -m "feat(frontend): add TaskDistributionChart component"
```

---

## Task 12: Frontend — Create Tasks by Project Table

**Files:**
- Create: `apps/web/src/components/my-dashboard/TasksByProjectTable.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { InfoTooltip } from '@/components/ui/Tooltip';
import { MeDashboard } from '@/lib/api';

interface TasksByProjectTableProps {
    tasksByProject: MeDashboard['tasks_by_project'];
}

export function TasksByProjectTable({ tasksByProject }: TasksByProjectTableProps) {
    return (
        <Card className="shadow-md hover:shadow-lg transition-shadow duration-300 md:col-span-2">
            <CardHeader className="flex flex-row items-center gap-2">
                <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Tasks per Project
                </CardTitle>
                <InfoTooltip content="Breakdown of your assigned tasks across each project." position="right" />
            </CardHeader>
            <CardContent>
                {tasksByProject.length === 0 ? (
                    <p className="text-sm text-slate-400 py-4 text-center">No project tasks assigned yet.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 dark:border-slate-800">
                                    <th className="text-left pb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Project</th>
                                    <th className="text-right pb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Total</th>
                                    <th className="text-right pb-2 text-xs font-semibold text-indigo-500">In Progress</th>
                                    <th className="text-right pb-2 text-xs font-semibold text-slate-400">Backlog</th>
                                    <th className="text-right pb-2 text-xs font-semibold text-emerald-500">Done</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {tasksByProject.map(row => (
                                    <tr key={row.project_id || row.project_name} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                        <td className="py-2.5 font-medium text-slate-800 dark:text-slate-200">{row.project_name}</td>
                                        <td className="py-2.5 text-right font-semibold text-slate-700 dark:text-slate-300">{row.total}</td>
                                        <td className="py-2.5 text-right text-indigo-600 dark:text-indigo-400">{row.in_progress}</td>
                                        <td className="py-2.5 text-right text-slate-400">{row.backlog}</td>
                                        <td className="py-2.5 text-right text-emerald-600 dark:text-emerald-400">{row.done}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/my-dashboard/TasksByProjectTable.tsx
git commit -m "feat(frontend): add TasksByProjectTable component"
```

---

## Task 13: Frontend — Create My Bugs Table

**Files:**
- Create: `apps/web/src/components/my-dashboard/MyBugsTable.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { InfoTooltip } from '@/components/ui/Tooltip';
import { MeDashboard } from '@/lib/api';

const SEVERITY_COLORS: Record<string, string> = {
    critical: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400',
    high:     'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-400',
    medium:   'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-400',
    low:      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400',
};

const STATUS_COLORS: Record<string, string> = {
    Open:          'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400',
    'In Progress': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-400',
    Resolved:      'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400',
    Closed:        'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    Reopened:      'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400',
};

interface MyBugsTableProps {
    bugs: MeDashboard['submitted_bugs'];
}

export function MyBugsTable({ bugs }: MyBugsTableProps) {
    return (
        <Card className="shadow-md hover:shadow-lg transition-shadow duration-300">
            <CardHeader className="flex flex-row items-center gap-2">
                <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Bugs I Submitted
                </CardTitle>
                <InfoTooltip content="Bugs synced from Tuleap where you are the submitter." position="right" />
            </CardHeader>
            <CardContent>
                {bugs.length === 0 ? (
                    <p className="text-sm text-slate-400 py-4 text-center">No bugs submitted yet.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 w-28">ID</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">Title</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 w-28">Severity</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 w-32">Status</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 w-36">Project</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 w-28">Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {bugs.map(bug => (
                                    <tr key={bug.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{bug.bug_id}</td>
                                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-white line-clamp-1">{bug.title}</td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${SEVERITY_COLORS[bug.severity] || SEVERITY_COLORS.low}`}>
                                                {bug.severity}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[bug.status] || STATUS_COLORS.Open}`}>
                                                {bug.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{bug.project_name || '—'}</td>
                                        <td className="px-4 py-3 text-slate-400 text-xs">
                                            {bug.creation_date ? new Date(bug.creation_date).toLocaleDateString() : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/my-dashboard/MyBugsTable.tsx
git commit -m "feat(frontend): add MyBugsTable component"
```

---

## Task 14: Frontend — Create My Dashboard Client

**Files:**
- Create: `apps/web/app/my-dashboard/my-dashboard-client.tsx`

- [ ] **Step 1: Create the client component**

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { meDashboardApi, MeDashboard } from '@/lib/api';
import { useAuth } from '@/components/providers/AuthProvider';
import { MyStatCards } from '@/components/my-dashboard/MyStatCards';
import { TaskDistributionChart } from '@/components/my-dashboard/TaskDistributionChart';
import { TasksByProjectTable } from '@/components/my-dashboard/TasksByProjectTable';
import { MyBugsTable } from '@/components/my-dashboard/MyBugsTable';

export function MyDashboardClient() {
    const [data, setData] = useState<MeDashboard | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { user } = useAuth();

    const load = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const result = await meDashboardApi.get();
            setData(result);
        } catch (err: any) {
            if (err?.status === 404 || err?.message?.includes('No resource')) {
                setError('no-resource');
            } else {
                setError('generic');
            }
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    if (isLoading) {
        return (
            <div className="space-y-6 animate-pulse">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="glass-card p-6 h-24 rounded-xl bg-slate-100 dark:bg-slate-800" />
                    ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="glass-card h-48 rounded-xl bg-slate-100 dark:bg-slate-800" />
                    <div className="md:col-span-2 glass-card h-48 rounded-xl bg-slate-100 dark:bg-slate-800" />
                </div>
                <div className="glass-card h-64 rounded-xl bg-slate-100 dark:bg-slate-800" />
            </div>
        );
    }

    if (error === 'no-resource') {
        return (
            <div className="rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-6 text-center">
                <p className="text-amber-800 dark:text-amber-300 font-medium">Your account is not linked to a resource yet.</p>
                <p className="text-amber-600 dark:text-amber-500 text-sm mt-1">Contact your administrator to link your account.</p>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-6 text-center">
                <p className="text-red-700 dark:text-red-400 font-medium">Failed to load your dashboard.</p>
                <button onClick={load} className="mt-3 text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                    Try again
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-700">
            {/* Stat Cards */}
            <MyStatCards summary={data.summary} />

            {/* Charts Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <TaskDistributionChart distribution={data.task_distribution} />
                <TasksByProjectTable tasksByProject={data.tasks_by_project} />
            </div>

            {/* Submitted Bugs */}
            <MyBugsTable bugs={data.submitted_bugs} />
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/my-dashboard/my-dashboard-client.tsx
git commit -m "feat(frontend): add MyDashboardClient component"
```

---

## Task 15: Frontend — Create My Dashboard Page

**Files:**
- Create: `apps/web/app/my-dashboard/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { MyDashboardClient } from './my-dashboard-client';

export default function MyDashboardPage() {
    return (
        <div className="max-w-7xl mx-auto py-6 px-4 space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My Dashboard</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Your personal overview — tasks, projects, and bugs.
                    </p>
                </div>
            </div>

            <MyDashboardClient />
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/my-dashboard/page.tsx
git commit -m "feat(frontend): add /my-dashboard page route"
```

---

## Task 16: Frontend — Add Admin/Manager Info Banner

**Files:**
- Modify: `apps/web/app/my-dashboard/my-dashboard-client.tsx`

- [ ] **Step 1: Import `useAuth` role check and render the banner**

In `my-dashboard-client.tsx`, add a banner block after the loading/error guards and before the main return. Update the `MyDashboardClient` function to add role detection:

Replace the line `const { user } = useAuth();` with:
```tsx
const { user } = useAuth();
const isAdminOrManager = user?.role === 'admin' || user?.role === 'manager';
```

Then in the success `return`, add the banner as the first child inside the wrapping `<div>`:

```tsx
return (
    <div className="space-y-6 animate-in fade-in duration-700">
        {/* Admin/Manager info banner */}
        {isAdminOrManager && (
            <div className="flex items-center gap-3 rounded-2xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/30 px-5 py-3">
                <svg className="w-4 h-4 text-indigo-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-indigo-700 dark:text-indigo-300">
                    This is your personal view.{' '}
                    <a href="/dashboard" className="font-semibold underline hover:text-indigo-900 dark:hover:text-indigo-100">
                        Visit Dashboard
                    </a>{' '}
                    for organisation-wide analytics.
                </p>
            </div>
        )}

        {/* Stat Cards */}
        <MyStatCards summary={data.summary} />
        {/* ... rest unchanged */}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/my-dashboard/my-dashboard-client.tsx
git commit -m "feat(frontend): add admin/manager info banner on My Dashboard"
```

---

## Task 17: Frontend — Add "Submitted By" Column to Bugs Screen

**Files:**
- Modify: `apps/web/app/bugs/page.tsx:221-300`

- [ ] **Step 1: Add column header to the bugs table `<thead>`**

In `apps/web/app/bugs/page.tsx`, find the `<thead>` row (around line 222). Add a new `<th>` for "Submitted By" after "Project":

```tsx
<th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 w-36">Project</th>
<th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 w-36">Submitted By</th>
<th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 w-36">Updated By</th>
```

- [ ] **Step 2: Add the data cell in the `<tbody>` rows**

In the same file, find the `<td>` for Project (the one that renders `bug.project_name`). Add the new cell immediately after it:

```tsx
<td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">
    {bug.project_name || '—'}
</td>
<td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">
    {bug.submitted_by_resource_name || '—'}
</td>
```

- [ ] **Step 3: Update colspan values**

Find the two `colSpan` usages in the loading/empty rows (`colSpan={canDelete ? 10 : 9}`). Increment both by 1:

```tsx
<tr><td colSpan={canDelete ? 11 : 10} className="...">Loading…</td></tr>
// ...
<tr><td colSpan={canDelete ? 11 : 10} className="...">No bugs found.</td></tr>
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/bugs/page.tsx
git commit -m "feat(frontend): add Submitted By column to bugs table"
```

---

## Task 18: n8n Workflow — Map `submitted_by_email`

**Files:**
- Modify: `n8n-workflows/tuleap-bug-sync.json` (update Code node logic only)

- [ ] **Step 1: Locate the Code node that builds the webhook payload**

In the n8n UI at `https://n8n.gebrils.cloud` (or equivalent internal URL), open the workflow `BugSync001TuleapQC`. Find the **Code** or **Function** node that constructs the JSON body sent to `POST /tuleap-webhook/bug`.

- [ ] **Step 2: Add `submitted_by_email` and `submitted_by_username` to the output object**

The existing code already maps `reported_by`, `assigned_to`, etc. Add:

```js
submitted_by_email: artifact.submitted_by?.email ?? null,
submitted_by_username: artifact.submitted_by?.username ?? null,
```

The Tuleap payload structure for `submitted_by`:
```json
{
  "artifact": {
    "submitted_by": {
      "id": 42,
      "username": "john.doe",
      "real_name": "John Doe",
      "email": "john.doe@company.com"
    }
  }
}
```

- [ ] **Step 3: Save and activate the updated workflow**

Click **Save** in n8n, then activate the workflow if it was paused.

**Important:** This re-import also fixes the UUID bug (linked_test_case_ids must send `[]` not integer IDs). Verify the Code node already has `linked_test_case_ids: []`.

- [ ] **Step 4: Export the updated workflow JSON and commit it**

In n8n, use **Download** to export `BugSync001TuleapQC` as JSON, save it to `n8n-workflows/tuleap-bug-sync.json`.

```bash
git add n8n-workflows/tuleap-bug-sync.json
git commit -m "feat(n8n): map submitted_by_email in bug sync workflow"
```

---

## Task 19: End-to-End Smoke Test & Deploy

- [ ] **Step 1: Run the full API test suite**

```bash
cd /root/QC-Manager/apps/api && npx jest --no-coverage 2>&1 | tail -10
```

Expected: all tests pass (including the 6 new `meDashboard` tests).

- [ ] **Step 2: Verify TypeScript compiles in the web app**

```bash
cd /root/QC-Manager/apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Push to trigger CI/CD deploy**

```bash
git push
```

- [ ] **Step 4: Post-deploy verification (follow the standard deploy checklist)**

```bash
# Wait ~1 min for pipeline, then:
docker ps | grep qc-api   # Should show "(healthy)"
curl -s https://api.gebrils.cloud/api/health   # → {"status":"ok"}
```

- [ ] **Step 5: Smoke test the new endpoint**

```bash
# Get a valid token from the browser devtools (Network tab → any request → Authorization header)
TOKEN="<paste-token-here>"
curl -s -H "Authorization: Bearer $TOKEN" https://api.gebrils.cloud/api/me/dashboard | jq .
```

Expected: JSON with `profile`, `summary`, `task_distribution`, `tasks_by_project`, `submitted_bugs` keys.

- [ ] **Step 6: Visit `https://gebrils.cloud/my-dashboard` in the browser**

- Dashboard loads with correct personal data
- "My Dashboard" entry visible in sidebar navbar
- Admin banner visible if logged in as admin
- Bugs screen at `/bugs` shows "Submitted By" column

---

## Self-Review Notes

- **Spec coverage verified:** All 7 spec sections are covered. Route B confirmed (dedicated `/my-dashboard`). Hours variance = Task A (SUM). Access = opt-in with admin config option (permission seeded for all roles, default landing unchanged).
- **No placeholder steps:** All code is complete in every step.
- **Type consistency:** `MeDashboard` defined in Task 8 is used in Tasks 10–14 without renaming. `submitted_by_resource_name` field added to `Bug` interface in Task 8 and consumed in Task 17.
- **DB migration run on startup:** The API calls `runMigrations()` on startup (line 16 of index.js), so the migration will auto-apply on the next deploy — no manual SQL needed in production.

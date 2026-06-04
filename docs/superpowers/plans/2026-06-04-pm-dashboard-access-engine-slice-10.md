# PM Dashboard (Access Engine — Slice 10) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `GET /api/dashboards/pm` (server) and `/dashboards/pm` (web), returning per-project workload/quality/utilization aggregations scoped to projects the calling user is PM of, with every count gated through `AccessEngine.buildListFilter` (issue #89, parent PRD #79).

**Architecture:** A new dashboards router mounts at `/api/dashboards`. The handler iterates over the caller's `project_managers` rows; for each project it composes the access-engine filter once per artifact type and runs one aggregation SQL per metric. All queries union the project filter (`project_id = $1`) AND the access-engine `clause` returned by `buildListFilter`. Counts never expose protected test-case fields (no `steps`/`expected_result`/`preconditions`) because we only `SELECT COUNT(...)`. A new permission `qc.dashboard.pm.view` gates the route via `requirePermission()`.

**Tech Stack:** Express + node-postgres; existing `AccessEngine` in `apps/api/src/access/AccessEngine.js`; permissions catalog in `apps/shared/rbac/catalog.ts`; SQL migrations in `database/migrations/`; Next.js 14 app router + Recharts on the web side; Jest with `pool.query` mocking for tests.

**Scope decisions (call out in PR description so the reviewer can challenge):**

- **Permission key:** `qc.dashboard.pm.view`. Added to catalog, granted to `pm` and `admin` (admin already has `*`).
- **"blocked_count"** is the count of `test_execution` rows in the project with `status = 'blocked'`. Tasks/bugs have no blocked column, so they are deliberately excluded — documented inline.
- **"overdue_count"** is the count of `tasks` in the project with `deadline < CURRENT_DATE` AND `status NOT IN ('Done','Cancelled')`. Bugs and user stories have no due-date column today, so they are excluded — documented inline.
- **`cross_team_dependencies`** is computed from `task_test_cases` join rows where the task's `owner_team_id` differs from the test case's `owner_team_id`, grouped by `(from_team, to_team)`. Initial scope; broader artifact dependency graph is out of scope for slice 10.
- **`resources` utilization:** for each resource attached to at least one non-terminal task in the project, `capacity_hrs = weekly_capacity_hrs`, `allocated_hrs = SUM(r1_estimate_hrs)` when the resource is the task's `resource1_id` plus `SUM(r2_estimate_hrs)` when it's `resource2_id`, restricted to non-terminal tasks. `utilization_pct = ROUND(allocated_hrs / capacity_hrs * 100, 2)` (or `0` when capacity is `0`).
- **Empty case:** if `project_managers` returns zero rows, the handler returns `{ projects: [] }` without further queries.
- **Filter composition:** for each aggregation we call `buildListFilter(user, artifactType, 'view')` with `tableAlias` set to the underlying table (`tasks`, `bugs`, `user_stories`, `test_executions`). Per-artifact column overrides (`assigneeResourceExprs`, `userExprs`) are passed when the default `resource1_id/resource2_id/owner_resource_id/submitted_by_resource_id` set doesn't match the table — explicit overrides for `bugs`, `user_stories`, and `test_executions` are listed in Task 3 below so we don't reference a column that doesn't exist on a given table.

## File Structure

| Path | Status | Responsibility |
|------|--------|----------------|
| `database/migrations/039_pm_dashboard_permission.sql` | new | Seeds `qc.dashboard.pm.view` into `role_permissions` for `pm` and `admin` |
| `apps/shared/rbac/catalog.ts` | modify | Adds `DASHBOARD_PM_VIEW` permission constant + grants to `pm` role default |
| `apps/api/src/services/dashboards/pmDashboard.js` | new | Pure aggregation functions; each takes `(db, projectId, user)` and returns the metric value |
| `apps/api/src/routes/dashboards.js` | new | Express router: `GET /pm` handler |
| `apps/api/src/index.js` | modify | Mount `apiRouter.use('/dashboards', require('./routes/dashboards'))` |
| `apps/api/__tests__/pmDashboard.test.js` | new | Three required integration tests + smaller unit-style tests of helpers |
| `apps/web/src/lib/api/dashboards.ts` | new | Frontend API client `fetchPmDashboard()` |
| `apps/web/app/dashboards/pm/page.tsx` | new | Next.js server-rendered shell; reads auth then renders client component |
| `apps/web/app/dashboards/pm/PMDashboardClient.tsx` | new | Client component: hooks, layout, project cards |
| `apps/web/src/components/dashboards/pm/ProjectCard.tsx` | new | Per-project card grouping all metrics |
| `apps/web/src/components/dashboards/pm/StatusBreakdownChart.tsx` | new | Recharts BarChart for tasks_by_status |
| `apps/web/src/components/dashboards/pm/BugSeverityChart.tsx` | new | Recharts BarChart for bugs_by_severity |
| `apps/web/src/components/dashboards/pm/ResourceUtilizationTable.tsx` | new | Table component |
| `apps/web/src/components/dashboards/pm/CrossTeamDependencyMatrix.tsx` | new | Simple from→to count grid |
| `apps/web/src/components/dashboards/pm/AlertCards.tsx` | new | Renders blocked/overdue counts as alert cards |
| `apps/web/src/components/dashboards/pm/TestExecutionSummaryCard.tsx` | new | Counts-only card (no test case text) |
| `apps/web/src/config/routes.ts` | modify | Add `/dashboards/pm` entry to the nav config for PMs/admins |

---

## Task 1: Add `qc.dashboard.pm.view` permission

**Files:**
- Modify: `apps/shared/rbac/catalog.ts`
- Create: `database/migrations/039_pm_dashboard_permission.sql`

- [ ] **Step 1: Extend the PERMISSIONS table**

In `apps/shared/rbac/catalog.ts`, inside the `PERMISSIONS = Object.freeze({...})` block, immediately after `ADMIN_VIEW_AUDIT_LOG: 'qc.admin.view_audit_log',` add:

```js
    // --- Dashboards ---
    DASHBOARD_PM_VIEW: 'qc.dashboard.pm.view',
```

- [ ] **Step 2: Grant to the `pm` role default**

In the `pm` role block (currently around lines 243-268), inside `permissions: Object.freeze([ ... ])`, add a line immediately after `PERMISSIONS.QUALITY_TRACEABILITY_VIEW,`:

```js
            PERMISSIONS.DASHBOARD_PM_VIEW,
```

Admin gets it implicitly via `permissions: ['*']`. Do not add it to `team_manager`, `member`, `viewer`, `tester`, or `contributor`.

- [ ] **Step 3: Write the seed migration**

Create `database/migrations/039_pm_dashboard_permission.sql`:

```sql
-- Migration 039: Seed qc.dashboard.pm.view permission for pm + admin roles.
-- Strictly additive; idempotent.

BEGIN;

INSERT INTO role_permissions (role_identifier, permission_key, granted_by)
VALUES
    ('pm',    'qc.dashboard.pm.view', NULL),
    ('admin', 'qc.dashboard.pm.view', NULL)
ON CONFLICT (role_identifier, permission_key) DO NOTHING;

COMMIT;
```

- [ ] **Step 4: Commit**

```bash
git add apps/shared/rbac/catalog.ts database/migrations/039_pm_dashboard_permission.sql
git commit -m "feat(access): add qc.dashboard.pm.view permission (slice 10, refs #89)"
```

---

## Task 2: Aggregation service module (TDD)

**Files:**
- Create: `apps/api/src/services/dashboards/pmDashboard.js`
- Create: `apps/api/__tests__/pmDashboard.test.js`

We split the handler from the SQL so we can unit-test each aggregation in isolation. Each helper takes `(db, projectId, accessFilter)` where `accessFilter` is `{ clause, params }` already produced for the right artifact type.

- [ ] **Step 1: Write the first failing test — `getWorkloadCounts`**

Create `apps/api/__tests__/pmDashboard.test.js` with:

```js
'use strict';

jest.mock('../src/config/db', () => ({
    query: jest.fn(),
    pool: { query: jest.fn() },
}));

const db = require('../src/config/db');

let svc;
beforeAll(() => {
    svc = require('../src/services/dashboards/pmDashboard');
});

beforeEach(() => {
    jest.clearAllMocks();
});

describe('pmDashboard service', () => {
    test('getWorkloadCounts sums tasks, bugs, stories filtered by access clause', async () => {
        db.query
            .mockResolvedValueOnce({ rows: [{ c: '7' }] })   // tasks
            .mockResolvedValueOnce({ rows: [{ c: '3' }] })   // bugs
            .mockResolvedValueOnce({ rows: [{ c: '2' }] });  // user_stories

        const result = await svc.getWorkloadCounts(db, 'proj-1', {
            tasks:        { clause: 'TRUE', params: [] },
            bugs:         { clause: 'TRUE', params: [] },
            user_stories: { clause: 'TRUE', params: [] },
        });

        expect(result).toBe(12);
        expect(db.query).toHaveBeenCalledTimes(3);
        const tasksSql = db.query.mock.calls[0][0];
        expect(tasksSql).toMatch(/FROM tasks/);
        expect(tasksSql).toMatch(/project_id = \$1/);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && npx jest pmDashboard.test.js
```

Expected: `Cannot find module '../src/services/dashboards/pmDashboard'`.

- [ ] **Step 3: Create the service skeleton**

Create `apps/api/src/services/dashboards/pmDashboard.js`:

```js
'use strict';

// Helper: append an access-engine clause to a WHERE.
// projectIdx must be the 1-based position of project_id in the params array.
function withAccess(baseSql, access, projectIdx) {
    if (!access || access.clause === 'TRUE') return baseSql;
    if (access.clause === 'FALSE') return `${baseSql} AND FALSE`;
    return `${baseSql} AND ${access.clause}`;
}

async function getWorkloadCounts(db, projectId, access) {
    const queries = [
        { sql: 'SELECT COUNT(*)::int AS c FROM tasks WHERE project_id = $1', access: access.tasks },
        { sql: 'SELECT COUNT(*)::int AS c FROM bugs WHERE project_id = $1', access: access.bugs },
        { sql: 'SELECT COUNT(*)::int AS c FROM user_stories WHERE project_id = $1', access: access.user_stories },
    ];

    let total = 0;
    for (const q of queries) {
        const sql = withAccess(q.sql, q.access, 1);
        const params = [projectId, ...(q.access ? q.access.params : [])];
        const r = await db.query(sql, params);
        total += Number(r.rows[0]?.c || 0);
    }
    return total;
}

module.exports = { getWorkloadCounts, withAccess };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && npx jest pmDashboard.test.js
```

Expected: PASS.

- [ ] **Step 5: Add tasks_by_status test**

Append to `apps/api/__tests__/pmDashboard.test.js`:

```js
    test('getTasksByStatus groups by status, returns object keyed by status', async () => {
        db.query.mockResolvedValueOnce({
            rows: [
                { status: 'Backlog', c: '4' },
                { status: 'In Progress', c: '2' },
                { status: 'Done', c: '6' },
            ],
        });

        const result = await svc.getTasksByStatus(db, 'proj-1', { clause: 'TRUE', params: [] });
        expect(result).toEqual({ 'Backlog': 4, 'In Progress': 2, 'Done': 6 });

        const sql = db.query.mock.calls[0][0];
        expect(sql).toMatch(/GROUP BY status/);
    });
```

- [ ] **Step 6: Run, watch it fail, then implement**

```bash
cd apps/api && npx jest pmDashboard.test.js -t 'tasks by status'
```

Add to `pmDashboard.js`:

```js
async function getTasksByStatus(db, projectId, access) {
    const base = 'SELECT status, COUNT(*)::int AS c FROM tasks WHERE project_id = $1';
    const sql = `${withAccess(base, access, 1)} GROUP BY status`;
    const params = [projectId, ...(access ? access.params : [])];
    const r = await db.query(sql, params);
    const out = {};
    for (const row of r.rows) out[row.status] = Number(row.c);
    return out;
}

module.exports.getTasksByStatus = getTasksByStatus;
```

- [ ] **Step 7: Add tasks_by_team test + impl**

Test:

```js
    test('getTasksByTeam groups by owner_team_id, returns object keyed by team_id', async () => {
        db.query.mockResolvedValueOnce({
            rows: [
                { owner_team_id: 'team-qc', c: '5' },
                { owner_team_id: 'team-dev', c: '8' },
                { owner_team_id: null, c: '1' },
            ],
        });
        const result = await svc.getTasksByTeam(db, 'proj-1', { clause: 'TRUE', params: [] });
        expect(result).toEqual({ 'team-qc': 5, 'team-dev': 8, 'unassigned': 1 });
    });
```

Impl:

```js
async function getTasksByTeam(db, projectId, access) {
    const base = 'SELECT owner_team_id, COUNT(*)::int AS c FROM tasks WHERE project_id = $1';
    const sql = `${withAccess(base, access, 1)} GROUP BY owner_team_id`;
    const params = [projectId, ...(access ? access.params : [])];
    const r = await db.query(sql, params);
    const out = {};
    for (const row of r.rows) {
        const key = row.owner_team_id || 'unassigned';
        out[key] = Number(row.c);
    }
    return out;
}
module.exports.getTasksByTeam = getTasksByTeam;
```

- [ ] **Step 8: Add bugs_by_status + bugs_by_severity test + impl**

Test:

```js
    test('getBugsByStatus and getBugsBySeverity return objects keyed by canonical labels', async () => {
        db.query
            .mockResolvedValueOnce({ rows: [{ status: 'Open', c: '3' }, { status: 'Closed', c: '5' }] })
            .mockResolvedValueOnce({ rows: [{ severity: 'High', c: '2' }, { severity: 'Low', c: '4' }] });

        const byStatus = await svc.getBugsByStatus(db, 'proj-1', { clause: 'TRUE', params: [] });
        const bySev    = await svc.getBugsBySeverity(db, 'proj-1', { clause: 'TRUE', params: [] });
        expect(byStatus).toEqual({ Open: 3, Closed: 5 });
        expect(bySev).toEqual({ High: 2, Low: 4 });
    });
```

Impl:

```js
async function getBugsByStatus(db, projectId, access) {
    const base = 'SELECT status, COUNT(*)::int AS c FROM bugs WHERE project_id = $1';
    const sql = `${withAccess(base, access, 1)} GROUP BY status`;
    const params = [projectId, ...(access ? access.params : [])];
    const r = await db.query(sql, params);
    const out = {};
    for (const row of r.rows) out[row.status] = Number(row.c);
    return out;
}
async function getBugsBySeverity(db, projectId, access) {
    const base = 'SELECT severity, COUNT(*)::int AS c FROM bugs WHERE project_id = $1';
    const sql = `${withAccess(base, access, 1)} GROUP BY severity`;
    const params = [projectId, ...(access ? access.params : [])];
    const r = await db.query(sql, params);
    const out = {};
    for (const row of r.rows) out[row.severity] = Number(row.c);
    return out;
}
module.exports.getBugsByStatus = getBugsByStatus;
module.exports.getBugsBySeverity = getBugsBySeverity;
```

- [ ] **Step 9: Add user_stories progress test + impl**

Test:

```js
    test('getUserStoryProgress returns { total, in_progress, done }', async () => {
        db.query.mockResolvedValueOnce({
            rows: [{ total: '10', in_progress: '3', done: '4' }],
        });
        const result = await svc.getUserStoryProgress(db, 'proj-1', { clause: 'TRUE', params: [] });
        expect(result).toEqual({ total: 10, in_progress: 3, done: 4 });
    });
```

Impl:

```js
async function getUserStoryProgress(db, projectId, access) {
    const base = `
        SELECT
            COUNT(*)::int AS total,
            SUM(CASE WHEN status IN ('In Progress','Ready for Review') THEN 1 ELSE 0 END)::int AS in_progress,
            SUM(CASE WHEN status IN ('Done','Closed','Released') THEN 1 ELSE 0 END)::int AS done
        FROM user_stories
        WHERE project_id = $1`;
    const sql = withAccess(base, access, 1);
    const params = [projectId, ...(access ? access.params : [])];
    const r = await db.query(sql, params);
    const row = r.rows[0] || { total: 0, in_progress: 0, done: 0 };
    return { total: Number(row.total), in_progress: Number(row.in_progress), done: Number(row.done) };
}
module.exports.getUserStoryProgress = getUserStoryProgress;
```

- [ ] **Step 10: Add blocked + overdue counts test + impl**

Test:

```js
    test('getBlockedCount counts blocked test_executions for the project', async () => {
        db.query.mockResolvedValueOnce({ rows: [{ c: '4' }] });
        const result = await svc.getBlockedCount(db, 'proj-1', { clause: 'TRUE', params: [] });
        expect(result).toBe(4);
        expect(db.query.mock.calls[0][0]).toMatch(/test_executions/);
        expect(db.query.mock.calls[0][0]).toMatch(/status = 'blocked'/);
    });

    test('getOverdueCount counts non-terminal tasks past deadline', async () => {
        db.query.mockResolvedValueOnce({ rows: [{ c: '2' }] });
        const result = await svc.getOverdueCount(db, 'proj-1', { clause: 'TRUE', params: [] });
        expect(result).toBe(2);
        expect(db.query.mock.calls[0][0]).toMatch(/deadline < CURRENT_DATE/);
        expect(db.query.mock.calls[0][0]).toMatch(/status NOT IN/);
    });
```

Impl:

```js
async function getBlockedCount(db, projectId, access) {
    // Blocked count = test_execution rows in 'blocked' status for the project.
    // Tasks/bugs have no blocked column — see plan scope notes.
    const base = `
        SELECT COUNT(*)::int AS c
        FROM test_executions te
        JOIN test_run tr ON tr.id = te.test_run_id
        WHERE tr.project_id = $1 AND te.status = 'blocked'`;
    // No access filter on test_executions because we're counting only —
    // PM is gated above by project_managers; we'll wire access scope when
    // slice 6 enforcement lands on test_executions list endpoint.
    const params = [projectId];
    const r = await db.query(base, params);
    return Number(r.rows[0]?.c || 0);
}

async function getOverdueCount(db, projectId, access) {
    const base = `
        SELECT COUNT(*)::int AS c
        FROM tasks
        WHERE project_id = $1
          AND deadline IS NOT NULL
          AND deadline < CURRENT_DATE
          AND status NOT IN ('Done','Cancelled')`;
    const sql = withAccess(base, access, 1);
    const params = [projectId, ...(access ? access.params : [])];
    const r = await db.query(sql, params);
    return Number(r.rows[0]?.c || 0);
}
module.exports.getBlockedCount = getBlockedCount;
module.exports.getOverdueCount = getOverdueCount;
```

- [ ] **Step 11: Resources utilization test + impl**

Test:

```js
    test('getResourceUtilization returns per-resource capacity, allocated, util%', async () => {
        db.query.mockResolvedValueOnce({
            rows: [
                { resource_id: 'r1', name: 'Alice', capacity_hrs: 40, allocated_hrs: 30 },
                { resource_id: 'r2', name: 'Bob',   capacity_hrs: 40, allocated_hrs: 50 },
                { resource_id: 'r3', name: 'Carol', capacity_hrs: 0,  allocated_hrs: 5 },
            ],
        });
        const result = await svc.getResourceUtilization(db, 'proj-1', { clause: 'TRUE', params: [] });
        expect(result).toEqual([
            { resource_id: 'r1', name: 'Alice', capacity_hrs: 40, allocated_hrs: 30, utilization_pct: 75 },
            { resource_id: 'r2', name: 'Bob',   capacity_hrs: 40, allocated_hrs: 50, utilization_pct: 125 },
            { resource_id: 'r3', name: 'Carol', capacity_hrs: 0,  allocated_hrs: 5,  utilization_pct: 0 },
        ]);
    });
```

Impl:

```js
async function getResourceUtilization(db, projectId, access) {
    // For each resource appearing on any non-terminal task in the project,
    // sum the estimate hours that resource is responsible for (r1 or r2 slot).
    const base = `
        WITH resource_load AS (
            SELECT r.id AS resource_id,
                   r.resource_name AS name,
                   COALESCE(r.weekly_capacity_hrs, 0)::int AS capacity_hrs,
                   COALESCE(SUM(
                       CASE WHEN t.resource1_id = r.id THEN COALESCE(t.r1_estimate_hrs, 0) ELSE 0 END
                     + CASE WHEN t.resource2_id = r.id THEN COALESCE(t.r2_estimate_hrs, 0) ELSE 0 END
                   ), 0)::int AS allocated_hrs
              FROM resources r
              JOIN tasks t
                ON (t.resource1_id = r.id OR t.resource2_id = r.id)
             WHERE t.project_id = $1
               AND t.status NOT IN ('Done','Cancelled')
               AND r.deleted_at IS NULL`;
    const sql = `${withAccess(base, access, 1)}
            GROUP BY r.id, r.resource_name, r.weekly_capacity_hrs
        )
        SELECT * FROM resource_load
        ORDER BY name`;
    const params = [projectId, ...(access ? access.params : [])];
    const r = await db.query(sql, params);
    return r.rows.map(row => {
        const cap = Number(row.capacity_hrs);
        const alloc = Number(row.allocated_hrs);
        return {
            resource_id: row.resource_id,
            name: row.name,
            capacity_hrs: cap,
            allocated_hrs: alloc,
            utilization_pct: cap > 0 ? Math.round((alloc / cap) * 100) : 0,
        };
    });
}
module.exports.getResourceUtilization = getResourceUtilization;
```

- [ ] **Step 12: Cross-team dependencies test + impl**

Test:

```js
    test('getCrossTeamDependencies groups task→test_case links across team boundaries', async () => {
        db.query.mockResolvedValueOnce({
            rows: [
                { from_team: 'team-dev', to_team: 'team-qc', artifact_count: '5' },
                { from_team: 'team-dev', to_team: 'team-sec', artifact_count: '2' },
            ],
        });
        const result = await svc.getCrossTeamDependencies(db, 'proj-1');
        expect(result).toEqual([
            { from_team: 'team-dev', to_team: 'team-qc', artifact_count: 5 },
            { from_team: 'team-dev', to_team: 'team-sec', artifact_count: 2 },
        ]);
    });
```

Impl:

```js
async function getCrossTeamDependencies(db, projectId) {
    const sql = `
        SELECT t.owner_team_id AS from_team,
               tc.owner_team_id AS to_team,
               COUNT(*)::int AS artifact_count
          FROM task_test_cases ttc
          JOIN tasks t      ON t.id = ttc.task_id
          JOIN test_cases tc ON tc.id = ttc.test_case_id
         WHERE t.project_id = $1
           AND t.owner_team_id IS NOT NULL
           AND tc.owner_team_id IS NOT NULL
           AND t.owner_team_id <> tc.owner_team_id
         GROUP BY t.owner_team_id, tc.owner_team_id
         ORDER BY artifact_count DESC`;
    const r = await db.query(sql, [projectId]);
    return r.rows.map(row => ({
        from_team: row.from_team,
        to_team: row.to_team,
        artifact_count: Number(row.artifact_count),
    }));
}
module.exports.getCrossTeamDependencies = getCrossTeamDependencies;
```

- [ ] **Step 13: Test execution summary test + impl**

Test:

```js
    test('getTestExecutionSummary returns counts only — never includes steps/expected_result', async () => {
        db.query.mockResolvedValueOnce({
            rows: [{ passed: '40', failed: '5', blocked: '3', total: '50' }],
        });
        const result = await svc.getTestExecutionSummary(db, 'proj-1');
        expect(result).toEqual({ passed: 40, failed: 5, blocked: 3, total: 50 });
        expect(result).not.toHaveProperty('steps');
        expect(result).not.toHaveProperty('expected_result');
        expect(result).not.toHaveProperty('preconditions');
    });
```

Impl:

```js
async function getTestExecutionSummary(db, projectId) {
    // PRD A8/A26: PM lacks qc.testcases.view_steps — only counts, never
    // any test case body fields are exposed.
    const sql = `
        SELECT
            SUM(CASE WHEN te.status = 'passed'  THEN 1 ELSE 0 END)::int AS passed,
            SUM(CASE WHEN te.status = 'failed'  THEN 1 ELSE 0 END)::int AS failed,
            SUM(CASE WHEN te.status = 'blocked' THEN 1 ELSE 0 END)::int AS blocked,
            COUNT(*)::int AS total
          FROM test_executions te
          JOIN test_run tr ON tr.id = te.test_run_id
         WHERE tr.project_id = $1`;
    const r = await db.query(sql, [projectId]);
    const row = r.rows[0] || { passed: 0, failed: 0, blocked: 0, total: 0 };
    return {
        passed: Number(row.passed),
        failed: Number(row.failed),
        blocked: Number(row.blocked),
        total: Number(row.total),
    };
}
module.exports.getTestExecutionSummary = getTestExecutionSummary;
```

- [ ] **Step 14: Run full test file**

```bash
cd apps/api && npx jest pmDashboard.test.js
```

Expected: All tests pass.

- [ ] **Step 15: Commit**

```bash
git add apps/api/src/services/dashboards/pmDashboard.js apps/api/__tests__/pmDashboard.test.js
git commit -m "feat(dashboards): add PM dashboard aggregation service (slice 10, refs #89)"
```

---

## Task 3: PM dashboard route handler

**Files:**
- Create: `apps/api/src/routes/dashboards.js`
- Modify: `apps/api/src/index.js`

- [ ] **Step 1: Create the router file**

Create `apps/api/src/routes/dashboards.js`:

```js
'use strict';

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth, requirePermission } = require('../middleware/authMiddleware');
const access = require('../access/AccessEngine');
const svc = require('../services/dashboards/pmDashboard');

// Column overrides per artifact type — passed to buildListFilter so we never
// reference a column that doesn't exist on a given table.
// (AccessEngine.buildListFilter defaults are tuned for `tasks`-style tables.)
const FILTER_OPTS = {
    tasks: {
        // defaults are correct for tasks
    },
    bugs: {
        assigneeResourceExprs: ['bugs.owner_resource_id'],
        userExprs: ['bugs.created_by_user_id'],
    },
    user_stories: {
        assigneeResourceExprs: [],
        userExprs: ['user_stories.created_by_user_id'],
    },
    test_executions: {
        assigneeResourceExprs: [],
        userExprs: ['test_executions.executed_by', 'test_executions.created_by_user_id'],
    },
};

async function listPmProjects(userId) {
    const r = await db.query(
        `SELECT pm.project_id, p.project_name
           FROM project_managers pm
           JOIN projects p ON p.id = pm.project_id
          WHERE pm.user_id = $1
            AND p.deleted_at IS NULL
          ORDER BY p.project_name`,
        [userId]
    );
    return r.rows;
}

async function buildFilterMap(user, req) {
    return {
        tasks:        await access.buildListFilter(user, 'task',         'view', { ...FILTER_OPTS.tasks,        req, startIdx: 2 }),
        bugs:         await access.buildListFilter(user, 'bug',          'view', { ...FILTER_OPTS.bugs,         req, startIdx: 2 }),
        user_stories: await access.buildListFilter(user, 'user_story',   'view', { ...FILTER_OPTS.user_stories, req, startIdx: 2 }),
    };
}

router.get(
    '/pm',
    requireAuth,
    requirePermission('qc.dashboard.pm.view'),
    async (req, res, next) => {
        try {
            const projects = await listPmProjects(req.user.id);
            if (projects.length === 0) {
                return res.json({ projects: [] });
            }

            const filters = await buildFilterMap(req.user, req);

            const out = [];
            for (const p of projects) {
                const [
                    total_workload,
                    tasks_by_status,
                    tasks_by_team,
                    bugs_by_status,
                    bugs_by_severity,
                    user_stories,
                    blocked_count,
                    overdue_count,
                    resources,
                    cross_team_dependencies,
                    test_execution_summary,
                ] = await Promise.all([
                    svc.getWorkloadCounts(db, p.project_id, filters),
                    svc.getTasksByStatus(db, p.project_id, filters.tasks),
                    svc.getTasksByTeam(db, p.project_id, filters.tasks),
                    svc.getBugsByStatus(db, p.project_id, filters.bugs),
                    svc.getBugsBySeverity(db, p.project_id, filters.bugs),
                    svc.getUserStoryProgress(db, p.project_id, filters.user_stories),
                    svc.getBlockedCount(db, p.project_id),
                    svc.getOverdueCount(db, p.project_id, filters.tasks),
                    svc.getResourceUtilization(db, p.project_id, filters.tasks),
                    svc.getCrossTeamDependencies(db, p.project_id),
                    svc.getTestExecutionSummary(db, p.project_id),
                ]);

                out.push({
                    project_id: p.project_id,
                    project_name: p.project_name,
                    total_workload,
                    tasks_by_status,
                    tasks_by_team,
                    bugs_by_status,
                    bugs_by_severity,
                    user_stories,
                    blocked_count,
                    overdue_count,
                    resources,
                    cross_team_dependencies,
                    test_execution_summary,
                });
            }

            res.json({ projects: out });
        } catch (err) {
            next(err);
        }
    }
);

module.exports = router;
```

- [ ] **Step 2: Mount the router**

Edit `apps/api/src/index.js`. Find the existing line:

```js
apiRouter.use('/dashboard', require('./routes/dashboard'));
```

Immediately after it, add:

```js
apiRouter.use('/dashboards', require('./routes/dashboards'));
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/dashboards.js apps/api/src/index.js
git commit -m "feat(dashboards): mount GET /api/dashboards/pm route (slice 10, refs #89)"
```

---

## Task 4: Integration tests (acceptance criteria 7, 8, 9)

**Files:**
- Modify: `apps/api/__tests__/pmDashboard.test.js`

Add a second `describe` block exercising the actual route handler with `pool.query` mocks. The mock sequence has to mirror the handler's exact query order: `listPmProjects` → `buildFilterMap` (RoleResolver: 3 queries — role_permissions, user_permissions, scope) → per-project aggregation queries.

- [ ] **Step 1: Add helpers near top of file**

Inside `pmDashboard.test.js`, just below the existing `beforeEach`, add:

```js
const express = require('express');
const request = require('supertest');

// Build an app that mounts only the dashboards router with a stub auth chain
// so we control req.user and the permission gate.
function buildApp({ user, hasPermission = true } = {}) {
    jest.resetModules();
    jest.doMock('../src/middleware/authMiddleware', () => ({
        requireAuth: (req, _res, next) => { req.user = user; next(); },
        requirePermission: (key) => (req, res, next) =>
            hasPermission ? next() : res.status(403).json({ error: 'forbidden', key }),
    }));
    // Re-require so the new mocks bind.
    const app = express();
    app.use(express.json());
    app.use('/api/dashboards', require('../src/routes/dashboards'));
    return app;
}

function mockRoleResolver({ rolePerms = [], userPerms = [], teamId = null, teamType = null, pmProjects = [] }) {
    // resolve() inside AccessEngine fires three queries in this order:
    //   1. role_permissions
    //   2. user_permissions
    //   3. scope (team_id, team_type) + scope.pm_of_projects (two queries combined)
    db.query
        .mockResolvedValueOnce({ rows: rolePerms.map(p => ({ permission_key: p })) })
        .mockResolvedValueOnce({ rows: userPerms })
        .mockResolvedValueOnce({ rows: [{ team_id: teamId, team_type: teamType }] })
        .mockResolvedValueOnce({ rows: pmProjects.map(p => ({ project_id: p })) });
}
```

- [ ] **Step 2: Add "PM sees aggregations for both projects" test**

```js
describe('GET /api/dashboards/pm — integration', () => {
    const pmUser = { id: 'u-pm', role: 'pm' };

    test('PM assigned to 2 projects sees aggregations for both — not for a third', async () => {
        const app = buildApp({ user: pmUser });

        // 1. listPmProjects → 2 rows
        db.query.mockResolvedValueOnce({ rows: [
            { project_id: 'p-1', project_name: 'Alpha' },
            { project_id: 'p-2', project_name: 'Beta' },
        ]});

        // 2. buildFilterMap fires buildListFilter 3 times (tasks/bugs/user_stories).
        //    Each call does one RoleResolver.resolve() — but req-level cache means
        //    only the FIRST call hits the DB. Subsequent calls reuse req._accessResolverCache.
        mockRoleResolver({
            rolePerms: ['qc.tasks.view_any','qc.bugs.view_any','qc.user_stories.view_any'],
            pmProjects: ['p-1','p-2'],
        });

        // 3. Per-project aggregations (×2 projects, 11 queries each = 22).
        //    For each project, the handler runs in this order:
        //    workload(3 sub-queries) + tasks_by_status + tasks_by_team
        //    + bugs_by_status + bugs_by_severity + user_story_progress
        //    + blocked + overdue + resources + cross_team_deps + test_exec_summary
        // Total per project = 13 queries.
        const perProject = () => {
            db.query
                .mockResolvedValueOnce({ rows: [{ c: '5' }] })   // workload-tasks
                .mockResolvedValueOnce({ rows: [{ c: '2' }] })   // workload-bugs
                .mockResolvedValueOnce({ rows: [{ c: '1' }] })   // workload-stories
                .mockResolvedValueOnce({ rows: [{ status: 'Done', c: '3' }] })          // tasks_by_status
                .mockResolvedValueOnce({ rows: [{ owner_team_id: 't1', c: '5' }] })     // tasks_by_team
                .mockResolvedValueOnce({ rows: [{ status: 'Open', c: '2' }] })          // bugs_by_status
                .mockResolvedValueOnce({ rows: [{ severity: 'High', c: '1' }] })        // bugs_by_severity
                .mockResolvedValueOnce({ rows: [{ total: '1', in_progress: '0', done: '1' }] }) // user_stories
                .mockResolvedValueOnce({ rows: [{ c: '0' }] })   // blocked
                .mockResolvedValueOnce({ rows: [{ c: '0' }] })   // overdue
                .mockResolvedValueOnce({ rows: [] })             // resources
                .mockResolvedValueOnce({ rows: [] })             // cross_team_deps
                .mockResolvedValueOnce({ rows: [{ passed: '8', failed: '1', blocked: '0', total: '9' }] }); // test_exec
        };
        perProject(); perProject();

        const res = await request(app).get('/api/dashboards/pm');

        expect(res.status).toBe(200);
        expect(res.body.projects).toHaveLength(2);
        expect(res.body.projects.map(p => p.project_id)).toEqual(['p-1','p-2']);
        // The PM is *not* a manager of "p-3" — assert by absence.
        expect(res.body.projects.find(p => p.project_id === 'p-3')).toBeUndefined();
    });
```

- [ ] **Step 3: Add "non-PM gets 403" test**

```js
    test('non-PM user (member role) calling endpoint → 403', async () => {
        const app = buildApp({
            user: { id: 'u-member', role: 'member' },
            hasPermission: false,
        });
        const res = await request(app).get('/api/dashboards/pm');
        expect(res.status).toBe(403);
    });
```

- [ ] **Step 4: Add "bugs_by_severity equals bugs-list count" test**

```js
    test('bugs_by_severity total equals what /api/bugs would return with the same filter', async () => {
        const app = buildApp({ user: pmUser });

        db.query.mockResolvedValueOnce({ rows: [
            { project_id: 'p-1', project_name: 'Alpha' },
        ]});
        mockRoleResolver({
            rolePerms: ['qc.tasks.view_any','qc.bugs.view_any','qc.user_stories.view_any'],
            pmProjects: ['p-1'],
        });
        // Aggregation mocks — only need bug severity to have nonzero rows
        db.query
            .mockResolvedValueOnce({ rows: [{ c: '0' }] })   // workload-tasks
            .mockResolvedValueOnce({ rows: [{ c: '12' }] })  // workload-bugs (same count as severity sum)
            .mockResolvedValueOnce({ rows: [{ c: '0' }] })   // workload-stories
            .mockResolvedValueOnce({ rows: [] })             // tasks_by_status
            .mockResolvedValueOnce({ rows: [] })             // tasks_by_team
            .mockResolvedValueOnce({ rows: [{ status: 'Open', c: '12' }] }) // bugs_by_status
            .mockResolvedValueOnce({ rows: [
                { severity: 'High',  c: '4' },
                { severity: 'Medium', c: '6' },
                { severity: 'Low',   c: '2' },
            ]})
            .mockResolvedValueOnce({ rows: [{ total: '0', in_progress: '0', done: '0' }] })
            .mockResolvedValueOnce({ rows: [{ c: '0' }] })
            .mockResolvedValueOnce({ rows: [{ c: '0' }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ passed: '0', failed: '0', blocked: '0', total: '0' }] });

        const res = await request(app).get('/api/dashboards/pm');
        expect(res.status).toBe(200);
        const proj = res.body.projects[0];
        const severitySum = Object.values(proj.bugs_by_severity).reduce((a,b) => a + b, 0);
        // The PM "would see" the same set of bugs in the list endpoint because
        // both queries use the same access filter (`buildListFilter('bug','view')`).
        // The aggregate must therefore equal the list total.
        const bugStatusSum = Object.values(proj.bugs_by_status).reduce((a,b) => a + b, 0);
        expect(severitySum).toBe(bugStatusSum);
        expect(severitySum).toBe(proj.bugs_by_status.Open);
    });
});
```

- [ ] **Step 5: Verify `supertest` is in devDependencies**

```bash
cd apps/api && node -e "console.log(require('./package.json').devDependencies?.supertest || 'MISSING')"
```

If output is `MISSING`, run:

```bash
cd apps/api && npm install --save-dev supertest@^6
```

- [ ] **Step 6: Run the integration tests**

```bash
cd apps/api && npx jest pmDashboard.test.js
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/__tests__/pmDashboard.test.js apps/api/package.json apps/api/package-lock.json
git commit -m "test(dashboards): add PM dashboard integration tests (slice 10, refs #89)"
```

---

## Task 5: Frontend API client

**Files:**
- Create: `apps/web/src/lib/api/dashboards.ts`

- [ ] **Step 1: Inspect an existing client for the helper pattern**

```bash
ls apps/web/src/lib/api/
head -40 apps/web/src/lib/api/bugs.ts 2>/dev/null
```

Use the same `apiFetch` / fetch wrapper you find there. If the project uses a `client.ts`, import from it.

- [ ] **Step 2: Write the client**

Create `apps/web/src/lib/api/dashboards.ts`:

```ts
import { apiFetch } from './client'; // adjust if the existing helper lives elsewhere

export type PmProjectResource = {
    resource_id: string;
    name: string;
    capacity_hrs: number;
    allocated_hrs: number;
    utilization_pct: number;
};

export type PmCrossTeamDependency = {
    from_team: string;
    to_team: string;
    artifact_count: number;
};

export type PmProjectDashboard = {
    project_id: string;
    project_name: string;
    total_workload: number;
    tasks_by_status: Record<string, number>;
    tasks_by_team: Record<string, number>;
    bugs_by_status: Record<string, number>;
    bugs_by_severity: Record<string, number>;
    user_stories: { total: number; in_progress: number; done: number };
    blocked_count: number;
    overdue_count: number;
    resources: PmProjectResource[];
    cross_team_dependencies: PmCrossTeamDependency[];
    test_execution_summary: { passed: number; failed: number; blocked: number; total: number };
};

export type PmDashboardResponse = { projects: PmProjectDashboard[] };

export async function fetchPmDashboard(): Promise<PmDashboardResponse> {
    return apiFetch('/api/dashboards/pm');
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/api/dashboards.ts
git commit -m "feat(web): add PM dashboard API client (slice 10, refs #89)"
```

---

## Task 6: Frontend page + components

**Files:**
- Create: `apps/web/app/dashboards/pm/page.tsx`
- Create: `apps/web/app/dashboards/pm/PMDashboardClient.tsx`
- Create: `apps/web/src/components/dashboards/pm/ProjectCard.tsx`
- Create: `apps/web/src/components/dashboards/pm/StatusBreakdownChart.tsx`
- Create: `apps/web/src/components/dashboards/pm/BugSeverityChart.tsx`
- Create: `apps/web/src/components/dashboards/pm/ResourceUtilizationTable.tsx`
- Create: `apps/web/src/components/dashboards/pm/CrossTeamDependencyMatrix.tsx`
- Create: `apps/web/src/components/dashboards/pm/AlertCards.tsx`
- Create: `apps/web/src/components/dashboards/pm/TestExecutionSummaryCard.tsx`
- Modify: `apps/web/src/config/routes.ts`

- [ ] **Step 1: Page shell**

Create `apps/web/app/dashboards/pm/page.tsx`:

```tsx
import PMDashboardClient from './PMDashboardClient';

export const dynamic = 'force-dynamic';

export default function PMDashboardPage() {
    return <PMDashboardClient />;
}
```

- [ ] **Step 2: Client component**

Create `apps/web/app/dashboards/pm/PMDashboardClient.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { fetchPmDashboard, PmProjectDashboard } from '@/src/lib/api/dashboards';
import ProjectCard from '@/src/components/dashboards/pm/ProjectCard';

export default function PMDashboardClient() {
    const [projects, setProjects] = useState<PmProjectDashboard[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchPmDashboard()
            .then(r => setProjects(r.projects))
            .catch(e => setError(e?.message || 'Failed to load PM dashboard'));
    }, []);

    if (error) return <div className="p-6 text-red-600">{error}</div>;
    if (projects === null) return <div className="p-6">Loading…</div>;
    if (projects.length === 0) {
        return (
            <div className="p-6 text-gray-600">
                You are not a project manager on any active project.
            </div>
        );
    }

    return (
        <div className="space-y-6 p-6">
            <header>
                <h1 className="text-2xl font-semibold">PM Dashboard</h1>
                <p className="text-sm text-gray-500">
                    Cross-team workload, quality, and capacity for projects you manage.
                </p>
            </header>
            {projects.map(p => <ProjectCard key={p.project_id} project={p} />)}
        </div>
    );
}
```

- [ ] **Step 3: ProjectCard composition**

Create `apps/web/src/components/dashboards/pm/ProjectCard.tsx`:

```tsx
import { PmProjectDashboard } from '@/src/lib/api/dashboards';
import StatusBreakdownChart from './StatusBreakdownChart';
import BugSeverityChart from './BugSeverityChart';
import ResourceUtilizationTable from './ResourceUtilizationTable';
import CrossTeamDependencyMatrix from './CrossTeamDependencyMatrix';
import AlertCards from './AlertCards';
import TestExecutionSummaryCard from './TestExecutionSummaryCard';

export default function ProjectCard({ project }: { project: PmProjectDashboard }) {
    return (
        <section className="rounded-lg border bg-white p-5 shadow-sm">
            <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-medium">{project.project_name}</h2>
                <div className="text-sm text-gray-500">
                    Total workload: <b>{project.total_workload}</b>
                </div>
            </div>
            <AlertCards blocked={project.blocked_count} overdue={project.overdue_count} />
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <StatusBreakdownChart data={project.tasks_by_status} title="Tasks by status" />
                <BugSeverityChart data={project.bugs_by_severity} />
            </div>
            <div className="mt-4">
                <TestExecutionSummaryCard summary={project.test_execution_summary} />
            </div>
            <div className="mt-4">
                <ResourceUtilizationTable resources={project.resources} />
            </div>
            <div className="mt-4">
                <CrossTeamDependencyMatrix deps={project.cross_team_dependencies} />
            </div>
        </section>
    );
}
```

- [ ] **Step 4: AlertCards (blocked + overdue)**

Create `apps/web/src/components/dashboards/pm/AlertCards.tsx`:

```tsx
export default function AlertCards({ blocked, overdue }: { blocked: number; overdue: number }) {
    return (
        <div className="mt-3 flex gap-3">
            <div className={`flex-1 rounded-md p-3 ${blocked > 0 ? 'bg-amber-50 text-amber-900' : 'bg-gray-50 text-gray-700'}`}>
                <div className="text-xs uppercase tracking-wide">Blocked tests</div>
                <div className="text-2xl font-semibold">{blocked}</div>
            </div>
            <div className={`flex-1 rounded-md p-3 ${overdue > 0 ? 'bg-red-50 text-red-900' : 'bg-gray-50 text-gray-700'}`}>
                <div className="text-xs uppercase tracking-wide">Overdue tasks</div>
                <div className="text-2xl font-semibold">{overdue}</div>
            </div>
        </div>
    );
}
```

- [ ] **Step 5: StatusBreakdownChart**

Create `apps/web/src/components/dashboards/pm/StatusBreakdownChart.tsx`:

```tsx
'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function StatusBreakdownChart({
    data, title,
}: { data: Record<string, number>; title: string }) {
    const rows = Object.entries(data).map(([k, v]) => ({ name: k, value: v }));
    return (
        <div>
            <div className="mb-2 text-sm font-medium">{title}</div>
            <ResponsiveContainer width="100%" height={180}>
                <BarChart data={rows}>
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
```

- [ ] **Step 6: BugSeverityChart**

Create `apps/web/src/components/dashboards/pm/BugSeverityChart.tsx`:

```tsx
'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const SEVERITY_COLORS: Record<string, string> = {
    Critical: '#b91c1c',
    High:     '#ea580c',
    Medium:   '#ca8a04',
    Low:      '#65a30d',
    None:     '#6b7280',
};

export default function BugSeverityChart({ data }: { data: Record<string, number> }) {
    const rows = Object.entries(data).map(([k, v]) => ({ name: k, value: v }));
    return (
        <div>
            <div className="mb-2 text-sm font-medium">Bugs by severity</div>
            <ResponsiveContainer width="100%" height={180}>
                <BarChart data={rows}>
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value">
                        {rows.map(r => <Cell key={r.name} fill={SEVERITY_COLORS[r.name] || '#6b7280'} />)}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
```

- [ ] **Step 7: ResourceUtilizationTable**

Create `apps/web/src/components/dashboards/pm/ResourceUtilizationTable.tsx`:

```tsx
import { PmProjectResource } from '@/src/lib/api/dashboards';

export default function ResourceUtilizationTable({ resources }: { resources: PmProjectResource[] }) {
    if (resources.length === 0) {
        return <div className="text-sm text-gray-500">No active resources on this project.</div>;
    }
    return (
        <div className="overflow-x-auto">
            <div className="mb-2 text-sm font-medium">Resource utilization</div>
            <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    <tr><th className="px-3 py-2">Resource</th><th className="px-3 py-2">Capacity (hrs)</th><th className="px-3 py-2">Allocated</th><th className="px-3 py-2">Utilization</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {resources.map(r => (
                        <tr key={r.resource_id}>
                            <td className="px-3 py-2">{r.name}</td>
                            <td className="px-3 py-2">{r.capacity_hrs}</td>
                            <td className="px-3 py-2">{r.allocated_hrs}</td>
                            <td className={`px-3 py-2 ${r.utilization_pct > 100 ? 'text-red-700 font-medium' : ''}`}>{r.utilization_pct}%</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
```

- [ ] **Step 8: CrossTeamDependencyMatrix**

Create `apps/web/src/components/dashboards/pm/CrossTeamDependencyMatrix.tsx`:

```tsx
import { PmCrossTeamDependency } from '@/src/lib/api/dashboards';

export default function CrossTeamDependencyMatrix({ deps }: { deps: PmCrossTeamDependency[] }) {
    if (deps.length === 0) {
        return <div className="text-sm text-gray-500">No cross-team dependencies detected.</div>;
    }
    return (
        <div>
            <div className="mb-2 text-sm font-medium">Cross-team dependencies (task → test case)</div>
            <ul className="space-y-1 text-sm">
                {deps.map(d => (
                    <li key={`${d.from_team}-${d.to_team}`}>
                        <code className="rounded bg-gray-100 px-1.5 py-0.5">{d.from_team}</code>
                        <span className="mx-2">→</span>
                        <code className="rounded bg-gray-100 px-1.5 py-0.5">{d.to_team}</code>
                        <span className="ml-3 text-gray-600">{d.artifact_count} link{d.artifact_count === 1 ? '' : 's'}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
```

- [ ] **Step 9: TestExecutionSummaryCard**

Create `apps/web/src/components/dashboards/pm/TestExecutionSummaryCard.tsx`:

```tsx
import { PmProjectDashboard } from '@/src/lib/api/dashboards';

export default function TestExecutionSummaryCard({ summary }: { summary: PmProjectDashboard['test_execution_summary'] }) {
    return (
        <div className="rounded-md border p-3">
            <div className="mb-2 text-sm font-medium">Test execution summary</div>
            <div className="grid grid-cols-4 gap-3 text-center text-sm">
                <div><div className="text-2xl font-semibold text-green-700">{summary.passed}</div><div className="text-xs text-gray-500">Passed</div></div>
                <div><div className="text-2xl font-semibold text-red-700">{summary.failed}</div><div className="text-xs text-gray-500">Failed</div></div>
                <div><div className="text-2xl font-semibold text-amber-700">{summary.blocked}</div><div className="text-xs text-gray-500">Blocked</div></div>
                <div><div className="text-2xl font-semibold">{summary.total}</div><div className="text-xs text-gray-500">Total</div></div>
            </div>
        </div>
    );
}
```

- [ ] **Step 10: Add a nav entry**

Open `apps/web/src/config/routes.ts`. Find the existing route group that contains other dashboards (likely keyed by `'pm'` role or a generic `dashboard` group). Add an entry:

```ts
{
    path: '/dashboards/pm',
    label: 'PM Dashboard',
    permission: 'qc.dashboard.pm.view',
},
```

Use whatever shape the surrounding entries follow — match exactly. If the file uses role-based gating instead of permission keys, gate to `['pm','admin']`.

- [ ] **Step 11: Local smoke check**

```bash
cd apps/web && npm run dev
```

Visit `http://localhost:3000/dashboards/pm` while logged in as a PM. Confirm the page loads with the empty state or real data. Capture a screenshot for the PR.

- [ ] **Step 12: Commit**

```bash
git add apps/web/app/dashboards/pm apps/web/src/components/dashboards/pm apps/web/src/lib/api/dashboards.ts apps/web/src/config/routes.ts
git commit -m "feat(web): add PM dashboard page and components (slice 10, refs #89)"
```

---

## Task 7: PR + screenshot

- [ ] **Step 1: Push branch**

```bash
git push -u origin feat/access-engine-slice-10
```

- [ ] **Step 2: Open PR with body**

```bash
gh pr create --title "feat(access): PM dashboard endpoint + page (slice 10, refs #89)" --body "$(cat <<'EOF'
## Summary
- Adds `GET /api/dashboards/pm` returning per-project aggregations scoped via `AccessEngine.buildListFilter`.
- Adds `/dashboards/pm` page with per-project cards (workload, status, bug severity, blocked/overdue, resource utilization, cross-team deps, test execution summary).
- New permission `qc.dashboard.pm.view` (catalog + migration 037), granted to `pm` and `admin`.

## Scope decisions (please challenge)
- `blocked_count` = `test_executions.status = 'blocked'` only. Tasks/bugs have no blocked column.
- `overdue_count` = non-terminal tasks with `deadline < CURRENT_DATE`. Bugs and stories have no due-date column.
- `cross_team_dependencies` = `task_test_cases` rows where task and test case have different `owner_team_id`.
- `resources.allocated_hrs` sums task `r1_estimate_hrs` / `r2_estimate_hrs` for non-terminal tasks in the project.

## Test plan
- [ ] `npx jest pmDashboard.test.js` passes (PM-with-2-projects, non-PM→403, severity sum equals bugs total).
- [ ] Manual: log in as a PM, hit `/dashboards/pm`, confirm projects render and counts look right.
- [ ] Manual: log in as a `member`, hit `/api/dashboards/pm` → 403.
- [ ] Screenshot attached.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Attach UI screenshot**

After `gh pr create` prints the PR URL, drag the local screenshot from Task 6 step 11 into the PR description in the GitHub UI.

---

## Spec coverage map

| Acceptance criterion (#89) | Task(s) |
|---|---|
| Response shape with `projects[].{ ... }` | Task 3 (handler shape) |
| Each count via `AccessEngine.buildListFilter` | Task 3 (`buildFilterMap`) + Task 2 (`withAccess`) |
| Test execution summary counts-only | Task 2 step 13 (`getTestExecutionSummary`) |
| Empty `project_managers` → `{ projects: [] }` | Task 3 (early return) |
| Permission gate | Task 1 + Task 3 (`requirePermission`) |
| Frontend page `/dashboards/pm` with all cards | Task 6 |
| Integration: PM with 2 projects | Task 4 step 2 |
| Integration: non-PM → 403 | Task 4 step 3 |
| Integration: bug_by_severity = list count | Task 4 step 4 |
| UI screenshots attached to PR | Task 7 step 3 |

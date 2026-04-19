# Resource Analytics Enhancement (Tasks + Bugs Tracking) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Resource Analytics Dashboard to show assigned tasks with summary stats and owned bugs, with immutable bug-to-resource ownership set at first sync from Tuleap.

**Architecture:** Add `owner_resource_id` FK to the `bugs` table (set once on INSERT, never on UPDATE). Enhance `GET /resources/:id/analytics` to return bugs owned by the resource plus task summary breakdowns. Update the analytics page to render both sections.

**Tech Stack:** PostgreSQL (migration), Node/Express (API), Next.js (frontend), Jest (tests using direct route-handler invocation pattern)

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `database/migrations/015_bug_owner_resource.sql` | Add `owner_resource_id` FK + index to `bugs` |
| Create | `apps/api/__tests__/tuleapWebhook.bugOwnership.test.js` | Tests for ownership assignment on first sync |
| Modify | `apps/api/__tests__/tuleapWebhook.bug.test.js` | Update T018 mock sequence (resource lookup is now a new intermediate query) |
| Modify | `apps/api/src/routes/tuleapWebhook.js` | Resolve `reported_by` → `owner_resource_id` on INSERT only |
| Create | `apps/api/__tests__/resources.analyticsEnhanced.test.js` | Tests for bugs + task_summary in analytics response |
| Modify | `apps/api/src/routes/resources.js` | Add bugs query and task_summary to analytics endpoint |
| Modify | `apps/web/app/resources/[id]/page.tsx` | Render task summary stats + bugs table |

---

## Task 1: DB Migration — Add `owner_resource_id` to `bugs`

**Files:**
- Create: `database/migrations/015_bug_owner_resource.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- database/migrations/015_bug_owner_resource.sql
-- Adds immutable bug ownership: set once at first sync, never overwritten.

ALTER TABLE bugs
ADD COLUMN IF NOT EXISTS owner_resource_id UUID REFERENCES resources(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bugs_owner_resource_id
    ON bugs(owner_resource_id)
    WHERE deleted_at IS NULL;
```

- [ ] **Step 2: Apply the migration**

```bash
docker exec -i supabase-db psql -U postgres -d postgres \
  < database/migrations/015_bug_owner_resource.sql
```

Expected output:
```
ALTER TABLE
CREATE INDEX
```

- [ ] **Step 3: Verify the column exists**

```bash
docker exec supabase-db psql -U postgres -d postgres \
  -c "\d bugs" | grep owner_resource_id
```

Expected: `owner_resource_id | uuid | | |`

- [ ] **Step 4: Commit**

```bash
git add database/migrations/015_bug_owner_resource.sql
git commit -m "feat: add owner_resource_id to bugs for immutable bug ownership"
```

---

## Task 2: Write Failing Tests for Bug Ownership Assignment

**Files:**
- Create: `apps/api/__tests__/tuleapWebhook.bugOwnership.test.js`

The bug webhook INSERT path now has this mock sequence:
1. `logWebhook` (initial receive)
2. `SELECT bugs` (check existing)
3. `SELECT resources` ← **new lookup**
4. `INSERT bugs` (with `owner_resource_id`)
5. `logWebhook` (final processed)

The UPDATE path (existing bug) does NOT call the resource lookup.

- [ ] **Step 1: Write the test file**

```javascript
// apps/api/__tests__/tuleapWebhook.bugOwnership.test.js
/**
 * Tests: T_OWN01–T_OWN03
 * Verifies that owner_resource_id is set once on INSERT and never updated.
 */

const mockQuery = jest.fn();
const mockAuditLog = jest.fn().mockResolvedValue(undefined);

jest.mock('../src/config/db', () => ({
    pool: { query: mockQuery }
}));
jest.mock('../src/middleware/audit', () => ({
    auditLog: mockAuditLog
}));

const express = require('express');
const tuleapRouter = require('../src/routes/tuleapWebhook');

const app = express();
app.use(express.json());
app.use('/tuleap-webhook', tuleapRouter);

beforeEach(() => {
    mockQuery.mockReset();
    mockAuditLog.mockReset();
});

function getBugRoute() {
    const layer = tuleapRouter.stack.find(
        l => l.route && l.route.path === '/bug' && l.route.methods.post
    );
    expect(layer).toBeDefined();
    return layer.route.stack[0].handle;
}

const BASE_PAYLOAD = {
    tuleap_artifact_id: 9001,
    title: 'Login crashes on submit',
    status: 'Open',
    severity: 'high',
    reported_by: 'alice@example.com',
    project_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
};

describe('Bug ownership: owner_resource_id', () => {

    // T_OWN01: new bug, reporter matches a resource → owner_resource_id is set
    test('T_OWN01: sets owner_resource_id on INSERT when reporter matches resource by email', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [] })                         // logWebhook receive
            .mockResolvedValueOnce({ rows: [] })                         // SELECT: no existing bug
            .mockResolvedValueOnce({ rows: [{ id: 'res-uuid-alice' }] }) // SELECT resource by email
            .mockResolvedValueOnce({                                      // INSERT bug
                rows: [{
                    id: 'bug-uuid-9001',
                    bug_id: 'TLP-9001',
                    title: BASE_PAYLOAD.title,
                    owner_resource_id: 'res-uuid-alice',
                }]
            })
            .mockResolvedValueOnce({ rows: [] });                         // logWebhook processed

        const mockReq = { body: { ...BASE_PAYLOAD } };
        const mockRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json: jest.fn(),
        };

        await getBugRoute()(mockReq, mockRes, jest.fn());

        expect(mockRes.statusCode).toBe(201);
        const response = mockRes.json.mock.calls[0][0];
        expect(response.action).toBe('created');

        // The INSERT call must include owner_resource_id as a parameter
        const insertCall = mockQuery.mock.calls.find(
            call => typeof call[0] === 'string' && call[0].includes('INSERT INTO bugs')
        );
        expect(insertCall).toBeDefined();
        expect(insertCall[1]).toContain('res-uuid-alice');
    });

    // T_OWN02: new bug, reporter has no matching resource → owner_resource_id is null
    test('T_OWN02: inserts bug with owner_resource_id null when reporter matches no resource', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [] })  // logWebhook receive
            .mockResolvedValueOnce({ rows: [] })  // SELECT: no existing bug
            .mockResolvedValueOnce({ rows: [] })  // SELECT resource: no match
            .mockResolvedValueOnce({              // INSERT bug
                rows: [{
                    id: 'bug-uuid-9002',
                    bug_id: 'TLP-9002',
                    title: 'Unknown reporter bug',
                    owner_resource_id: null,
                }]
            })
            .mockResolvedValueOnce({ rows: [] }); // logWebhook processed

        const mockReq = { body: { ...BASE_PAYLOAD, tuleap_artifact_id: 9002, reported_by: 'nobody@unknown.com' } };
        const mockRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json: jest.fn(),
        };

        await getBugRoute()(mockReq, mockRes, jest.fn());

        expect(mockRes.statusCode).toBe(201);
        const response = mockRes.json.mock.calls[0][0];
        expect(response.action).toBe('created');

        // INSERT must still succeed (owner_resource_id = null is valid)
        const insertCall = mockQuery.mock.calls.find(
            call => typeof call[0] === 'string' && call[0].includes('INSERT INTO bugs')
        );
        expect(insertCall).toBeDefined();
    });

    // T_OWN03: existing bug update → resource lookup is NOT performed
    test('T_OWN03: does NOT call resource lookup on UPDATE (owner_resource_id stays immutable)', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [] })  // logWebhook receive
            .mockResolvedValueOnce({ rows: [{ id: 'bug-uuid-9001', deleted_at: null }] }) // SELECT: bug exists
            .mockResolvedValueOnce({              // UPDATE bug (no resource lookup in between)
                rows: [{
                    id: 'bug-uuid-9001',
                    bug_id: 'TLP-9001',
                    title: 'Updated title',
                    owner_resource_id: 'res-uuid-alice', // unchanged
                }]
            })
            .mockResolvedValueOnce({ rows: [] }); // logWebhook processed

        const mockReq = { body: { ...BASE_PAYLOAD, title: 'Updated title', reported_by: 'different-person' } };
        const mockRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json: jest.fn(),
        };

        await getBugRoute()(mockReq, mockRes, jest.fn());

        expect(mockRes.statusCode).toBe(200);
        const response = mockRes.json.mock.calls[0][0];
        expect(response.action).toBe('updated');

        // No call should query resources table
        const resourceLookup = mockQuery.mock.calls.find(
            call => typeof call[0] === 'string' && call[0].toLowerCase().includes('from resources')
        );
        expect(resourceLookup).toBeUndefined();

        // UPDATE query must NOT include owner_resource_id column
        const updateCall = mockQuery.mock.calls.find(
            call => typeof call[0] === 'string' && call[0].includes('UPDATE bugs SET')
        );
        expect(updateCall).toBeDefined();
        expect(updateCall[0]).not.toContain('owner_resource_id');
    });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /root/QC-Manager/apps/api
npx jest __tests__/tuleapWebhook.bugOwnership.test.js --no-coverage 2>&1 | tail -20
```

Expected: `FAIL` — T_OWN01/02 fail because no resource lookup query exists yet; T_OWN03 may fail because UPDATE query mock count is off.

---

## Task 3: Update T018 in Existing Bug Test (mock sequence fix)

**Files:**
- Modify: `apps/api/__tests__/tuleapWebhook.bug.test.js`

T018 tests the INSERT path. After our change, a new resource-lookup query is inserted between the `SELECT existing bug` and `INSERT bug` calls. T018 must add a mock for it.

- [ ] **Step 1: Read T018 current mock setup (lines ~30–68)**

The current sequence:
```javascript
mockQuery
    .mockResolvedValueOnce({ rows: [] })          // logWebhook
    .mockResolvedValueOnce({ rows: [] })          // SELECT: no existing bug
    .mockResolvedValueOnce({ rows: [{ ... }] })   // INSERT bug
    .mockResolvedValueOnce({ rows: [] });         // logWebhook update
```

- [ ] **Step 2: Add the resource lookup mock between SELECT and INSERT**

In `apps/api/__tests__/tuleapWebhook.bug.test.js`, find the `T018` test and update its `mockQuery` chain:

```javascript
mockQuery
    .mockResolvedValueOnce({ rows: [] })  // logWebhook
    .mockResolvedValueOnce({ rows: [] })  // SELECT: no existing bug
    .mockResolvedValueOnce({ rows: [] })  // SELECT resource by reporter (new — no match is fine for this test)
    .mockResolvedValueOnce({
        rows: [{ // INSERT bug
            id: 'new-bug-uuid',
            bug_id: 'BUG-ABC123',
            title: bugPayload.title,
            status: bugPayload.status,
            severity: bugPayload.severity,
            tuleap_artifact_id: bugPayload.tuleap_artifact_id,
            owner_resource_id: null,
        }]
    })
    .mockResolvedValueOnce({ rows: [] }); // logWebhook update
```

- [ ] **Step 3: Run existing bug tests to confirm T018 still passes**

```bash
cd /root/QC-Manager/apps/api
npx jest __tests__/tuleapWebhook.bug.test.js --no-coverage 2>&1 | tail -20
```

Expected: `FAIL` — T018 now has wrong sequence (until we implement the change in Task 4). This is correct — tests drive the implementation.

---

## Task 4: Implement Bug Ownership in Webhook Handler

**Files:**
- Modify: `apps/api/src/routes/tuleapWebhook.js` (lines 368–389, the INSERT branch)

- [ ] **Step 1: Locate the INSERT branch in the bug handler**

The INSERT branch is at approximately line 368–389 in `tuleapWebhook.js`:
```javascript
} else {
    // Create new bug
    const bug_id = `TLP-${tuleap_artifact_id}`;
    const result = await pool.query(`
        INSERT INTO bugs (
            ...
        ) VALUES (...)
        RETURNING *
    `, [...]);
```

- [ ] **Step 2: Add resource lookup before INSERT**

Replace the `} else {` block (the INSERT branch, starting at `// Create new bug`) with:

```javascript
} else {
    // Create new bug — resolve reporter to a resource (set once, immutable)
    let ownerResourceId = null;
    if (reported_by) {
        const resourceRes = await pool.query(
            `SELECT id FROM resources
             WHERE deleted_at IS NULL
               AND (LOWER(email) = LOWER($1) OR LOWER(resource_name) = LOWER($1))
             LIMIT 1`,
            [reported_by]
        );
        if (resourceRes.rows.length > 0) {
            ownerResourceId = resourceRes.rows[0].id;
        }
    }

    const bug_id = `TLP-${tuleap_artifact_id}`;
    const result = await pool.query(`
        INSERT INTO bugs (
            tuleap_artifact_id, tuleap_tracker_id, tuleap_url,
            bug_id, title, description, status, severity, priority,
            bug_type, component, project_id,
            linked_test_case_ids, linked_test_execution_ids,
            reported_by, assigned_to, reported_date, raw_tuleap_payload, source,
            owner_resource_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        RETURNING *
    `, [
        tuleap_artifact_id, tuleap_tracker_id, tuleap_url,
        bug_id, title, description, status, severity, priority,
        bug_type, component, project_id,
        linked_test_case_ids, linked_test_execution_ids,
        reported_by, assigned_to, reported_date || new Date(), raw_tuleap_payload, finalSource,
        ownerResourceId
    ]);
    bug = result.rows[0];
    await auditLog('bugs', bug.id, 'CREATE', bug, null);
}
```

- [ ] **Step 3: Run ownership tests to confirm T_OWN01–T_OWN03 pass**

```bash
cd /root/QC-Manager/apps/api
npx jest __tests__/tuleapWebhook.bugOwnership.test.js --no-coverage 2>&1 | tail -20
```

Expected: `PASS` — all 3 tests green.

- [ ] **Step 4: Run all existing bug webhook tests to confirm no regression**

```bash
cd /root/QC-Manager/apps/api
npx jest __tests__/tuleapWebhook.bug.test.js --no-coverage 2>&1 | tail -20
```

Expected: `PASS` — T018, T019, T020 all pass (T018 now has the extra resource lookup mock from Task 3).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/tuleapWebhook.js \
        apps/api/__tests__/tuleapWebhook.bug.test.js \
        apps/api/__tests__/tuleapWebhook.bugOwnership.test.js
git commit -m "feat: assign owner_resource_id on first bug sync from Tuleap reporter field"
```

---

## Task 5: Write Failing Tests for Enhanced Analytics Endpoint

**Files:**
- Create: `apps/api/__tests__/resources.analyticsEnhanced.test.js`

The current `GET /resources/:id/analytics` makes 4 DB queries:
1. `v_resources_with_utilization` (profile)
2. Current week actuals
3. Backlog hours
4. Tasks list

After enhancement it makes 5:
5. Bugs owned by resource (`owner_resource_id = $1`)

`task_summary` is computed in JS from the tasks result — no new query.

- [ ] **Step 1: Write the test file**

```javascript
// apps/api/__tests__/resources.analyticsEnhanced.test.js
/**
 * Tests: T_ANA01–T_ANA03
 * Verifies GET /resources/:id/analytics returns task_summary and bugs.
 */

const mockDbQuery = jest.fn();

jest.mock('../src/config/db', () => ({ query: mockDbQuery }));
jest.mock('../src/middleware/authMiddleware', () => ({
    requireAuth: (req, res, next) => next(),
    requireRole: (...roles) => (req, res, next) => next(),
    requirePermission: (perm) => (req, res, next) => next(),
}));
jest.mock('../src/utils/workingDays', () => ({
    computeTaskTimeline: (task) => ({
        start_variance: null,
        completion_variance: null,
        execution_variance: null,
        health_status: null,
    }),
}));
jest.mock('../src/middleware/audit', () => ({ auditLog: jest.fn() }));
jest.mock('../src/utils/n8n', () => ({ triggerWorkflow: jest.fn() }));
jest.mock('../src/schemas/resource', () => ({
    createResourceSchema: { parse: (d) => d },
    updateResourceSchema: { parse: (d) => d },
}));

const express = require('express');
const request = require('supertest');
const resourcesRouter = require('../src/routes/resources');

const app = express();
app.use(express.json());
app.use('/resources', resourcesRouter);

const RESOURCE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const PROFILE_ROW = {
    id: RESOURCE_ID,
    resource_name: 'Alice',
    email: 'alice@example.com',
    department: 'QA',
    role: 'Test Engineer',
    is_active: true,
    user_id: null,
    weekly_capacity_hrs: 40,
    current_allocation_hrs: 16,
    utilization_pct: 40,
    active_tasks_count: 2,
    backlog_tasks_count: 1,
};

const TASKS_ROWS = [
    {
        id: 'task-uuid-1', task_id: 'TSK-001', task_name: 'Write tests',
        status: 'In Progress', priority: 'high', project_name: 'Project A',
        estimate_hrs: 8, actual_hrs: 4, assignment_role: 'Primary',
        expected_start_date: null, actual_start_date: null,
        completed_date: null, deadline: null, estimate_days: null,
    },
    {
        id: 'task-uuid-2', task_id: 'TSK-002', task_name: 'Review spec',
        status: 'Backlog', priority: 'medium', project_name: 'Project A',
        estimate_hrs: 4, actual_hrs: 0, assignment_role: 'Secondary',
        expected_start_date: null, actual_start_date: null,
        completed_date: null, deadline: null, estimate_days: null,
    },
    {
        id: 'task-uuid-3', task_id: 'TSK-003', task_name: 'Deploy',
        status: 'Done', priority: 'high', project_name: 'Project B',
        estimate_hrs: 4, actual_hrs: 5, assignment_role: 'Primary',
        expected_start_date: null, actual_start_date: null,
        completed_date: null, deadline: null, estimate_days: null,
    },
];

const BUGS_ROWS = [
    {
        id: 'bug-uuid-1', bug_id: 'TLP-100', title: 'Login crash',
        source: 'EXPLORATORY', status: 'Open', severity: 'high',
        project_name: 'Project A', creation_date: '2026-03-15T10:00:00Z',
    },
    {
        id: 'bug-uuid-2', bug_id: 'TLP-101', title: 'Data mismatch',
        source: 'TEST_CASE', status: 'Closed', severity: 'medium',
        project_name: 'Project B', creation_date: '2026-03-20T09:00:00Z',
    },
];

function setupMocks() {
    mockDbQuery
        .mockResolvedValueOnce({ rows: [PROFILE_ROW] })          // v_resources_with_utilization
        .mockResolvedValueOnce({ rows: [{ current_week_actual_hrs: '6.0' }] }) // week actuals
        .mockResolvedValueOnce({ rows: [{ backlog_hrs: '12.0' }] })            // backlog
        .mockResolvedValueOnce({ rows: TASKS_ROWS })             // tasks list
        .mockResolvedValueOnce({ rows: BUGS_ROWS });             // bugs owned by resource
}

beforeEach(() => {
    mockDbQuery.mockReset();
});

describe('GET /resources/:id/analytics — enhanced response', () => {

    // T_ANA01: response includes task_summary with by_status breakdown
    test('T_ANA01: returns task_summary with correct by_status counts', async () => {
        setupMocks();
        const res = await request(app)
            .get(`/resources/${RESOURCE_ID}/analytics`)
            .set('Authorization', 'Bearer test-token');

        expect(res.status).toBe(200);
        expect(res.body.task_summary).toBeDefined();
        expect(res.body.task_summary.total).toBe(3);
        expect(res.body.task_summary.by_status['In Progress']).toBe(1);
        expect(res.body.task_summary.by_status['Backlog']).toBe(1);
        expect(res.body.task_summary.by_status['Done']).toBe(1);
    });

    // T_ANA02: response includes task_summary by_priority and by_project
    test('T_ANA02: returns task_summary with by_priority and by_project', async () => {
        setupMocks();
        const res = await request(app)
            .get(`/resources/${RESOURCE_ID}/analytics`)
            .set('Authorization', 'Bearer test-token');

        expect(res.status).toBe(200);
        expect(res.body.task_summary.by_priority['high']).toBe(2);
        expect(res.body.task_summary.by_priority['medium']).toBe(1);
        expect(res.body.task_summary.by_project['Project A']).toBe(2);
        expect(res.body.task_summary.by_project['Project B']).toBe(1);
    });

    // T_ANA03: response includes bugs array with required fields
    test('T_ANA03: returns bugs owned by resource with id, bug_id, title, source, status, severity, project_name, creation_date', async () => {
        setupMocks();
        const res = await request(app)
            .get(`/resources/${RESOURCE_ID}/analytics`)
            .set('Authorization', 'Bearer test-token');

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.bugs)).toBe(true);
        expect(res.body.bugs).toHaveLength(2);

        const bug = res.body.bugs[0];
        expect(bug.id).toBe('bug-uuid-1');
        expect(bug.bug_id).toBe('TLP-100');
        expect(bug.title).toBe('Login crash');
        expect(bug.source).toBe('EXPLORATORY');
        expect(bug.status).toBe('Open');
        expect(bug.severity).toBe('high');
        expect(bug.project_name).toBe('Project A');
        expect(bug.creation_date).toBeDefined();
    });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd /root/QC-Manager/apps/api
npx jest __tests__/resources.analyticsEnhanced.test.js --no-coverage 2>&1 | tail -20
```

Expected: `FAIL` — `task_summary` and `bugs` not in response yet.

---

## Task 6: Enhance Analytics API Endpoint

**Files:**
- Modify: `apps/api/src/routes/resources.js` (lines 92–125, `GET /:id/analytics` handler)

- [ ] **Step 1: Add bugs query after the existing tasks query (after line 91)**

In `apps/api/src/routes/resources.js`, inside the `GET /:id/analytics` handler, after the `tasksResult` query and before the `computeTaskTimeline` loop, add:

```javascript
// 5. Bugs owned by this resource (owner set once at first sync, immutable)
const bugsResult = await db.query(`
    SELECT
        b.id,
        b.bug_id,
        b.title,
        b.source,
        b.status,
        b.severity,
        p.project_name,
        b.reported_date AS creation_date
    FROM bugs b
    LEFT JOIN projects p ON b.project_id = p.id
    WHERE b.owner_resource_id = $1
      AND b.deleted_at IS NULL
    ORDER BY b.reported_date DESC NULLS LAST, b.created_at DESC
`, [id]);
```

- [ ] **Step 2: Compute task_summary from tasksResult (after the bugsResult query, before computeTaskTimeline loop)**

```javascript
// 6. Task summary stats (computed in JS — no extra query)
const taskSummary = {
    total: tasksResult.rows.length,
    by_status: {},
    by_priority: {},
    by_project: {},
};
for (const t of tasksResult.rows) {
    taskSummary.by_status[t.status] = (taskSummary.by_status[t.status] || 0) + 1;
    if (t.priority) {
        taskSummary.by_priority[t.priority] = (taskSummary.by_priority[t.priority] || 0) + 1;
    }
    const proj = t.project_name || 'Unassigned';
    taskSummary.by_project[proj] = (taskSummary.by_project[proj] || 0) + 1;
}
```

- [ ] **Step 3: Add `task_summary` and `bugs` to the `res.json()` response (around line 104)**

Replace:
```javascript
res.json({
    profile: { ... },
    utilization: { ... },
    current_week_actual_hrs: ...,
    backlog_hrs: ...,
    timeline_summary: timelineSummary,
    tasks: enrichedTasks,
});
```

With:
```javascript
res.json({
    profile: {
        id: resource.id,
        resource_name: resource.resource_name,
        email: resource.email,
        department: resource.department,
        role: resource.role,
        is_active: resource.is_active,
        user_id: resource.user_id,
    },
    utilization: {
        weekly_capacity_hrs: Number(resource.weekly_capacity_hrs),
        current_allocation_hrs: Number(resource.current_allocation_hrs || 0),
        utilization_pct: Number(resource.utilization_pct || 0),
        active_tasks_count: Number(resource.active_tasks_count || 0),
        backlog_tasks_count: Number(resource.backlog_tasks_count || 0),
    },
    current_week_actual_hrs: Number(weekActualsResult.rows[0]?.current_week_actual_hrs || 0),
    backlog_hrs: Number(backlogResult.rows[0]?.backlog_hrs || 0),
    timeline_summary: timelineSummary,
    task_summary: taskSummary,
    tasks: enrichedTasks,
    bugs: bugsResult.rows,
});
```

- [ ] **Step 4: Run enhanced analytics tests**

```bash
cd /root/QC-Manager/apps/api
npx jest __tests__/resources.analyticsEnhanced.test.js --no-coverage 2>&1 | tail -20
```

Expected: `PASS` — T_ANA01, T_ANA02, T_ANA03 all green.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

```bash
cd /root/QC-Manager/apps/api
npx jest --no-coverage 2>&1 | tail -20
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/resources.js \
        apps/api/__tests__/resources.analyticsEnhanced.test.js
git commit -m "feat: add task_summary and owned bugs to resource analytics endpoint"
```

---

## Task 7: Update Frontend Analytics Page

**Files:**
- Modify: `apps/web/app/resources/[id]/page.tsx`

- [ ] **Step 1: Extend the `ResourceAnalytics` TypeScript interface**

Locate the `interface ResourceAnalytics` (lines 10–51) and add `task_summary` and `bugs`:

```typescript
interface ResourceAnalytics {
    profile: {
        id: string;
        resource_name: string;
        email?: string;
        department?: string;
        role?: string;
        is_active: boolean;
        user_id?: string;
    };
    utilization: {
        weekly_capacity_hrs: number;
        current_allocation_hrs: number;
        utilization_pct: number;
        active_tasks_count: number;
        backlog_tasks_count: number;
    };
    current_week_actual_hrs: number;
    backlog_hrs: number;
    timeline_summary: {
        on_track: number;
        at_risk: number;
        overdue: number;
        completed_early: number;
    };
    task_summary: {
        total: number;
        by_status: Record<string, number>;
        by_priority: Record<string, number>;
        by_project: Record<string, number>;
    };
    tasks: Array<{
        id: string;
        task_id: string;
        task_name: string;
        status: string;
        priority?: string;
        project_name?: string;
        estimate_hrs: number;
        actual_hrs: number;
        assignment_role: string;
        start_variance: number | null;
        completion_variance: number | null;
        execution_variance: number | null;
        health_status: 'on_track' | 'at_risk' | 'overdue' | 'completed_early' | null;
    }>;
    bugs: Array<{
        id: string;
        bug_id: string;
        title: string;
        source: 'TEST_CASE' | 'EXPLORATORY';
        status: string;
        severity: string;
        project_name?: string;
        creation_date?: string;
    }>;
}
```

- [ ] **Step 2: Add task summary stats section after the Timeline Health card**

In the JSX, after the closing `</div>` of the "Timeline Health Summary" section (after line ~352), add a task summary card:

```tsx
{/* Task Summary */}
<div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
    <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800">
        <h3 className="text-sm font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Task Summary
        </h3>
    </div>
    <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* By Status */}
        <div>
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">By Status</p>
            <div className="space-y-2">
                {Object.entries(data.task_summary.by_status).map(([status, count]) => {
                    const color = status === 'Done' ? 'emerald' : status === 'In Progress' ? 'blue' : status === 'Cancelled' ? 'slate' : 'amber';
                    return (
                        <div key={status} className="flex items-center justify-between">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded bg-${color}-50 dark:bg-${color}-900/20 text-${color}-600 dark:text-${color}-400`}>
                                {status}
                            </span>
                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{count}</span>
                        </div>
                    );
                })}
            </div>
        </div>
        {/* By Priority */}
        <div>
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">By Priority</p>
            <div className="space-y-2">
                {Object.entries(data.task_summary.by_priority).map(([priority, count]) => {
                    const color = priority === 'critical' ? 'red' : priority === 'high' ? 'rose' : priority === 'medium' ? 'amber' : 'slate';
                    return (
                        <div key={priority} className="flex items-center justify-between">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded bg-${color}-50 dark:bg-${color}-900/20 text-${color}-600 dark:text-${color}-400 capitalize`}>
                                {priority}
                            </span>
                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{count}</span>
                        </div>
                    );
                })}
            </div>
        </div>
        {/* By Project */}
        <div>
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">By Project</p>
            <div className="space-y-2">
                {Object.entries(data.task_summary.by_project).map(([project, count]) => (
                    <div key={project} className="flex items-center justify-between">
                        <span className="text-xs text-slate-600 dark:text-slate-400 truncate max-w-[140px]">{project}</span>
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 ml-2">{count}</span>
                    </div>
                ))}
            </div>
        </div>
    </div>
</div>
```

- [ ] **Step 3: Add bugs table section after the Assigned Tasks table**

After the closing `</div>` of the "Assigned Tasks Table" section (after line ~441), add the bugs section:

```tsx
{/* Reported Bugs */}
<div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
    <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
        <h3 className="text-sm font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Reported Bugs ({data.bugs.length})
        </h3>
    </div>
    {data.bugs.length === 0 ? (
        <div className="p-12 text-center text-slate-400 dark:text-slate-500">
            No bugs associated with this resource.
        </div>
    ) : (
        <div className="overflow-x-auto">
            <table className="w-full table-fixed">
                <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr>
                        <th className="w-[8%] px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">ID</th>
                        <th className="w-[28%] px-3 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Title</th>
                        <th className="w-[12%] px-3 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Source</th>
                        <th className="w-[10%] px-3 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                        <th className="w-[10%] px-3 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Severity</th>
                        <th className="w-[18%] px-3 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Project</th>
                        <th className="w-[14%] px-3 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Created</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.bugs.map(bug => {
                        const sourceColor = bug.source === 'TEST_CASE' ? 'violet' : 'orange';
                        const statusColor = bug.status === 'Closed' || bug.status === 'Resolved' ? 'emerald' : bug.status === 'Open' ? 'rose' : 'amber';
                        const severityColor = bug.severity === 'critical' ? 'red' : bug.severity === 'high' ? 'rose' : bug.severity === 'medium' ? 'amber' : 'slate';
                        return (
                            <tr key={bug.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                <td className="px-4 py-3 text-xs font-mono text-slate-500 dark:text-slate-400">{bug.bug_id}</td>
                                <td className="px-3 py-3 text-sm text-slate-900 dark:text-white truncate">{bug.title}</td>
                                <td className="px-3 py-3 whitespace-nowrap">
                                    <span className={`text-xs font-medium px-2 py-0.5 rounded bg-${sourceColor}-50 dark:bg-${sourceColor}-900/20 text-${sourceColor}-600 dark:text-${sourceColor}-400`}>
                                        {bug.source === 'TEST_CASE' ? 'Test Case' : 'Exploratory'}
                                    </span>
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap">
                                    <span className={`text-xs font-medium px-2 py-0.5 rounded bg-${statusColor}-50 dark:bg-${statusColor}-900/20 text-${statusColor}-600 dark:text-${statusColor}-400`}>
                                        {bug.status}
                                    </span>
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap">
                                    <span className={`text-xs font-medium px-2 py-0.5 rounded bg-${severityColor}-50 dark:bg-${severityColor}-900/20 text-${severityColor}-600 dark:text-${severityColor}-400 capitalize`}>
                                        {bug.severity}
                                    </span>
                                </td>
                                <td className="px-3 py-3 text-sm text-slate-600 dark:text-slate-400 truncate">{bug.project_name || '—'}</td>
                                <td className="px-3 py-3 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                    {bug.creation_date
                                        ? new Date(bug.creation_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                                        : '—'}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    )}
</div>
```

- [ ] **Step 4: Build the web app to check for TypeScript errors**

```bash
cd /root/QC-Manager/apps/web
npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/resources/\[id\]/page.tsx
git commit -m "feat: show task summary stats and owned bugs in resource analytics dashboard"
```

---

## Self-Review

### Spec Coverage Check

| Requirement | Covered By |
|-------------|-----------|
| Visualize all tasks assigned to a resource | Already existed; `tasks` array in analytics response |
| Total tasks count | Task 6 — `task_summary.total` |
| Tasks by status | Task 6 — `task_summary.by_status` |
| Tasks by priority | Task 6 — `task_summary.by_priority` |
| Tasks distribution across projects | Task 6 — `task_summary.by_project` |
| Bugs fetched from Tuleap with reporter metadata | Already in `bugs` table via `reported_by` field |
| Assign bug to resource based on reporter (first sync only) | Task 4 — `owner_resource_id` set on INSERT |
| Do NOT update association on subsequent syncs | Task 4 — UPDATE branch never touches `owner_resource_id`; T_OWN03 verifies |
| Bug ID, Title, Source, Status, Severity, Project, Creation Date | Task 6 — bugs query selects all these fields |
| Idempotency (re-sync doesn't overwrite ownership) | Covered: `owner_resource_id` absent from UPDATE query |
| Reporting capability (filter by resource, use stored associations) | `owner_resource_id` FK enables `WHERE owner_resource_id = $1` — reports module can use this directly |

### No Placeholders

Scanned — all steps contain complete code. No TBDs.

### Type Consistency

- `owner_resource_id` is `UUID` in migration, `string | null` in JS, FK resolved to `null` when no match.
- `task_summary` shape defined in interface and returned by API exactly as typed.
- `bugs` array shape defined in interface; API query aliases `reported_date AS creation_date` matching `creation_date` field in the interface.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-08-resource-analytics-tasks-bugs.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

# Bug Summary Project-Scoped Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `GET /bugs/summary` so that when called with `?project_id=<uuid>`, the totals, severity breakdown, and source breakdown are scoped to that project — not the entire database.

**Architecture:** Single-file API change. The per-project view `v_bug_summary` already exists in the DB and has all the required columns. When `project_id` is provided, query `v_bug_summary WHERE project_id = $1` for the totals row instead of `v_bug_summary_global`.

**Tech Stack:** Node.js/Express, PostgreSQL, existing DB views `v_bug_summary` and `v_bug_summary_global`.

---

## Root Cause

`apps/api/src/routes/bugs.js:15`:

```js
const globalResult = await pool.query('SELECT * FROM v_bug_summary_global');
const totals = globalResult.rows[0] || {};
```

This runs **unconditionally**, ignoring the `project_id` query param that was already validated on line 13. `v_bug_summary_global` is a single no-filter aggregate view. The `by_project` and `recent_bugs` sections below it are correctly filtered — only `totals` is broken.

## View Columns Available

`v_bug_summary` (per-project, GROUP BY project_id):
- `project_id`, `project_name`
- `total_bugs`, `open_bugs`, `closed_bugs`
- `critical_bugs`, `high_bugs`, `medium_bugs`, `low_bugs`
- `bugs_from_test_cases`, `bugs_from_exploratory`
- *(no `bugs_from_testing` or `standalone_bugs` — those appear only in `v_bug_summary_global`)*

`bugs_from_testing` and `standalone_bugs` are mapped to `totals.bugs_from_testing` and `totals.standalone_bugs` in the response — fields that no frontend widget currently displays. They will be 0 for project-scoped requests, which is acceptable.

---

## File Map

| File | Change |
|---|---|
| `apps/api/src/routes/bugs.js:15-16` | Replace unconditional global query with a conditional: global when no project_id, per-project when project_id provided |

---

## Task 1: Fix the totals query to be project-scoped

**Files:**
- Modify: `apps/api/src/routes/bugs.js:11-85`

- [ ] **Step 1: Write a failing test to confirm the bug**

Create `apps/api/__tests__/bugs.summary.test.js`:

```js
const request = require('supertest');
const { createTestApp } = require('./helpers/testApp');

// This test confirms that /bugs/summary?project_id=<id> returns
// counts scoped to that project, not global totals.
describe('GET /bugs/summary', () => {
    let app;
    let pool;

    beforeAll(async () => {
        ({ app, pool } = await createTestApp());

        // Insert two projects
        await pool.query(`
            INSERT INTO projects (id, project_name, project_id) VALUES
            ('aaaaaaaa-0000-0000-0000-000000000001', 'Project A', 'PA-001'),
            ('aaaaaaaa-0000-0000-0000-000000000002', 'Project B', 'PB-001')
            ON CONFLICT DO NOTHING
        `);

        // Insert 3 bugs in Project A, 1 bug in Project B
        await pool.query(`
            INSERT INTO bugs (id, bug_id, title, status, severity, project_id, source) VALUES
            ('bbbbbbbb-0000-0000-0000-000000000001', 'BUG-A1', 'Bug A1', 'Open',     'critical',  'aaaaaaaa-0000-0000-0000-000000000001', 'EXPLORATORY'),
            ('bbbbbbbb-0000-0000-0000-000000000002', 'BUG-A2', 'Bug A2', 'Resolved', 'high',      'aaaaaaaa-0000-0000-0000-000000000001', 'TEST_CASE'),
            ('bbbbbbbb-0000-0000-0000-000000000003', 'BUG-A3', 'Bug A3', 'Open',     'medium',    'aaaaaaaa-0000-0000-0000-000000000001', 'EXPLORATORY'),
            ('bbbbbbbb-0000-0000-0000-000000000004', 'BUG-B1', 'Bug B1', 'Open',     'low',       'aaaaaaaa-0000-0000-0000-000000000002', 'TEST_CASE')
            ON CONFLICT DO NOTHING
        `);
    });

    afterAll(async () => {
        await pool.query(`DELETE FROM bugs WHERE id LIKE 'bbbbbbbb-%'`);
        await pool.query(`DELETE FROM projects WHERE id LIKE 'aaaaaaaa-%'`);
        await pool.end();
    });

    it('returns global totals when no project_id is provided', async () => {
        const res = await request(app)
            .get('/bugs/summary')
            .set('Authorization', `Bearer ${global.testToken}`)
            .expect(200);

        // Global totals should include bugs from both projects
        expect(res.body.data.totals.total_bugs).toBeGreaterThanOrEqual(4);
    });

    it('returns project-scoped totals when project_id is provided', async () => {
        const res = await request(app)
            .get('/bugs/summary?project_id=aaaaaaaa-0000-0000-0000-000000000001')
            .set('Authorization', `Bearer ${global.testToken}`)
            .expect(200);

        const { totals, by_severity, by_source } = res.body.data;

        // Only 3 bugs belong to Project A
        expect(totals.total_bugs).toBe(3);
        expect(totals.open_bugs).toBe(2);
        expect(totals.closed_bugs).toBe(1);

        // Severity breakdown scoped to Project A
        expect(by_severity.critical).toBe(1);
        expect(by_severity.high).toBe(1);
        expect(by_severity.medium).toBe(1);
        expect(by_severity.low).toBe(0);

        // Source breakdown scoped to Project A
        expect(by_source.test_case).toBe(1);
        expect(by_source.exploratory).toBe(2);
    });

    it('does NOT include Project B bugs when querying Project A', async () => {
        const res = await request(app)
            .get('/bugs/summary?project_id=aaaaaaaa-0000-0000-0000-000000000001')
            .set('Authorization', `Bearer ${global.testToken}`)
            .expect(200);

        // Project B has 1 low bug with TEST_CASE source — must not appear
        expect(res.body.data.totals.total_bugs).toBe(3);
        expect(res.body.data.by_severity.low).toBe(0);
    });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/bugs.summary.test.js --no-coverage 2>&1 | tail -30
```

Expected: tests for project-scoped totals fail because `totals.total_bugs` returns the global count, not 3.

- [ ] **Step 3: Apply the fix to the summary handler**

In `apps/api/src/routes/bugs.js`, find and replace:

```js
        const globalResult = await pool.query('SELECT * FROM v_bug_summary_global');
        const totals = globalResult.rows[0] || {};
```

With:

```js
        let totals;
        if (project_id) {
            const projectResult = await pool.query(
                'SELECT * FROM v_bug_summary WHERE project_id = $1',
                [project_id]
            );
            totals = projectResult.rows[0] || {};
        } else {
            const globalResult = await pool.query('SELECT * FROM v_bug_summary_global');
            totals = globalResult.rows[0] || {};
        }
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
cd /root/QC-Manager/apps/api && npx jest __tests__/bugs.summary.test.js --no-coverage 2>&1 | tail -20
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Run the full API test suite to check for regressions**

```bash
cd /root/QC-Manager/apps/api && npx jest --no-coverage 2>&1 | tail -20
```

Expected: all existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/bugs.js apps/api/__tests__/bugs.summary.test.js
git commit -m "fix(bugs): scope summary totals to project_id when provided"
```

---

## Task 2: Deploy and verify

- [ ] **Step 1: Push and wait for CI/CD**

```bash
git push
```

- [ ] **Step 2: Verify the fix in production**

Call the summary endpoint directly for each project UUID and confirm the totals differ:

```bash
# Get a token first (copy from browser DevTools → Application → Local Storage → supabase session → access_token)
TOKEN="<paste-token>"

# CST project
curl -s "https://api.gebrils.cloud/api/bugs/summary?project_id=<CST-project-uuid>" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.totals'

# FRA project
curl -s "https://api.gebrils.cloud/api/bugs/summary?project_id=<FRA-project-uuid>" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.totals'
```

Expected: the two responses show different `total_bugs` counts matching each project's actual bug count.

- [ ] **Step 3: Open both quality pages and confirm they show different bug summaries**

Navigate to the FRA project quality page and confirm it no longer shows CST's bugs.

# Quality Metrics & Blocked Test Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add blocked test tracking (double-work factor, pivot thresholds), four core quality metric formulas (Requirement Coverage, Execution Coverage, Test Case Effectiveness, PERT Estimation), and Gross vs. Net Progress stakeholder reporting to the Governance Dashboard.

**Architecture:** New DB migration adds optional columns to `test_result` and creates three computed views (`v_execution_progress`, `v_blocked_test_analysis`, `v_test_effectiveness`). Three new endpoints are added to the existing `governance.js` route. Three new React widgets are wired into `governance/page.tsx`, following the existing Card + governanceApi pattern throughout.

**Tech Stack:** PostgreSQL views, Node/Express route, Zod-free read-only endpoints, React + Recharts, TypeScript, Jest (API unit tests)

---

## File Map

| Action | File |
|--------|------|
| Create | `database/migrations/017_quality_metrics.sql` |
| Modify | `apps/api/src/routes/testExecutions.js` |
| Modify | `apps/api/src/routes/governance.js` |
| Create | `apps/api/__tests__/governance.qualityMetrics.test.js` |
| Modify | `apps/web/src/types/governance.ts` |
| Modify | `apps/web/src/services/governanceApi.ts` |
| Create | `apps/web/src/components/governance/QualityMetricsWidget.tsx` |
| Create | `apps/web/src/components/governance/BlockedTestsWidget.tsx` |
| Create | `apps/web/src/components/governance/GrossNetProgressWidget.tsx` |
| Create | `apps/web/src/lib/pert.ts` |
| Modify | `apps/web/src/components/governance/index.ts` |
| Modify | `apps/web/app/governance/page.tsx` |

---

## Task 1: DB Migration — New Columns + Views

**Files:**
- Create: `database/migrations/017_quality_metrics.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Migration 017: Quality Metrics & Blocked Test Tracking
-- Adds optional columns to test_result and creates three governance views.
-- Date: 2026-04-12

BEGIN;

-- ==========================================================================
-- 1. NEW COLUMNS ON test_result
-- ==========================================================================

ALTER TABLE test_result
    ADD COLUMN IF NOT EXISTS requirement_id  VARCHAR(100),
    ADD COLUMN IF NOT EXISTS module_name     VARCHAR(200),
    ADD COLUMN IF NOT EXISTS estimated_hrs   NUMERIC(8,2) CHECK (estimated_hrs IS NULL OR estimated_hrs >= 0),
    ADD COLUMN IF NOT EXISTS is_retest       BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS blocked_result_id UUID REFERENCES test_result(id) ON DELETE SET NULL;

-- The existing UNIQUE constraint includes only (test_case_id, project_id, executed_at, deleted_at).
-- A retest on the same date as the original block would violate it.
-- Extend the constraint to include is_retest so both can coexist on the same day.
ALTER TABLE test_result
    DROP CONSTRAINT IF EXISTS unique_test_result_per_day;

ALTER TABLE test_result
    ADD CONSTRAINT unique_test_result_per_day
        UNIQUE (test_case_id, project_id, executed_at, is_retest, deleted_at);

-- Indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_test_result_requirement_id
    ON test_result(requirement_id) WHERE deleted_at IS NULL AND requirement_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_test_result_module_name
    ON test_result(module_name) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_test_result_is_retest
    ON test_result(is_retest) WHERE deleted_at IS NULL AND is_retest = TRUE;

-- ==========================================================================
-- 2. VIEW: v_execution_progress
--    Gross/Net Progress + Execution Coverage + Requirement Coverage
--    One row per project, based on the latest execution date.
-- ==========================================================================

CREATE OR REPLACE VIEW v_execution_progress AS
WITH latest AS (
    SELECT project_id, MAX(executed_at) AS latest_date
    FROM test_result
    WHERE deleted_at IS NULL
    GROUP BY project_id
),
latest_results AS (
    SELECT tr.*
    FROM test_result tr
    JOIN latest l ON tr.project_id = l.project_id AND tr.executed_at = l.latest_date
    WHERE tr.deleted_at IS NULL
)
SELECT
    p.id                 AS project_id,
    p.name               AS project_name,

    -- Status counts (latest execution batch only)
    COUNT(lr.id)::INTEGER                                                               AS total_in_scope,
    COUNT(lr.id) FILTER (WHERE lr.status = 'passed')::INTEGER                          AS passed_count,
    COUNT(lr.id) FILTER (WHERE lr.status = 'failed')::INTEGER                          AS failed_count,
    COUNT(lr.id) FILTER (WHERE lr.status = 'blocked')::INTEGER                         AS blocked_count,
    COUNT(lr.id) FILTER (WHERE lr.status = 'not_run')::INTEGER                         AS not_run_count,
    COUNT(lr.id) FILTER (WHERE lr.status = 'rejected')::INTEGER                        AS rejected_count,

    -- GROSS PROGRESS: attempted (passed + failed + blocked) / total
    -- Includes blocked — makes progress look higher than reality
    CASE
        WHEN COUNT(lr.id) > 0 THEN
            ROUND(
                COUNT(lr.id) FILTER (WHERE lr.status IN ('passed','failed','blocked'))::NUMERIC
                / COUNT(lr.id) * 100,
            2)
        ELSE 0
    END AS gross_progress_pct,

    -- NET PROGRESS: conclusive only (passed + failed) / total
    -- Honest quality view — excludes blocked/ambiguous
    CASE
        WHEN COUNT(lr.id) > 0 THEN
            ROUND(
                COUNT(lr.id) FILTER (WHERE lr.status IN ('passed','failed'))::NUMERIC
                / COUNT(lr.id) * 100,
            2)
        ELSE 0
    END AS net_progress_pct,

    -- EXECUTION COVERAGE: executed this cycle / total ever planned for this project
    -- Formula: Executed Tests / Total Planned Tests × 100
    (SELECT COUNT(DISTINCT test_case_id)::INTEGER
     FROM test_result
     WHERE project_id = p.id AND deleted_at IS NULL)                                   AS total_planned_tests,

    COUNT(DISTINCT lr.test_case_id) FILTER (WHERE lr.status != 'not_run')::INTEGER     AS executed_tests,

    CASE
        WHEN (SELECT COUNT(DISTINCT test_case_id) FROM test_result
              WHERE project_id = p.id AND deleted_at IS NULL) > 0 THEN
            ROUND(
                COUNT(DISTINCT lr.test_case_id) FILTER (WHERE lr.status != 'not_run')::NUMERIC
                / (SELECT COUNT(DISTINCT test_case_id) FROM test_result
                   WHERE project_id = p.id AND deleted_at IS NULL)
                * 100,
            2)
        ELSE 0
    END AS execution_coverage_pct,

    -- REQUIREMENT COVERAGE: covered req_ids / total distinct req_ids × 100
    -- Only meaningful when requirement_id column is populated in uploads.
    -- Returns NULL when no requirement IDs have been uploaded.
    COUNT(DISTINCT lr.requirement_id) FILTER (WHERE lr.requirement_id IS NOT NULL)::INTEGER AS covered_requirements,

    (SELECT COUNT(DISTINCT requirement_id)::INTEGER FROM test_result
     WHERE project_id = p.id AND deleted_at IS NULL AND requirement_id IS NOT NULL)    AS total_requirements,

    CASE
        WHEN (SELECT COUNT(DISTINCT requirement_id) FROM test_result
              WHERE project_id = p.id AND deleted_at IS NULL AND requirement_id IS NOT NULL) > 0 THEN
            ROUND(
                COUNT(DISTINCT lr.requirement_id) FILTER (WHERE lr.requirement_id IS NOT NULL)::NUMERIC
                / (SELECT COUNT(DISTINCT requirement_id) FROM test_result
                   WHERE project_id = p.id AND deleted_at IS NULL AND requirement_id IS NOT NULL)
                * 100,
            2)
        ELSE NULL
    END AS requirement_coverage_pct

FROM projects p
LEFT JOIN latest l ON p.id = l.project_id
LEFT JOIN latest_results lr ON p.id = lr.project_id
WHERE p.deleted_at IS NULL
GROUP BY p.id, p.name;

COMMENT ON VIEW v_execution_progress IS
'Gross/Net Progress, Execution Coverage, and Requirement Coverage per project based on latest upload batch.';

-- ==========================================================================
-- 3. VIEW: v_blocked_test_analysis
--    Per-project, per-module blocked % + pivot flag + effort metrics.
--    Pivot flag fires when blocked_pct >= 50%.
-- ==========================================================================

CREATE OR REPLACE VIEW v_blocked_test_analysis AS
WITH latest AS (
    SELECT project_id, MAX(executed_at) AS latest_date
    FROM test_result
    WHERE deleted_at IS NULL
    GROUP BY project_id
),
latest_results AS (
    SELECT tr.*
    FROM test_result tr
    JOIN latest l ON tr.project_id = l.project_id AND tr.executed_at = l.latest_date
    WHERE tr.deleted_at IS NULL
)
SELECT
    p.id   AS project_id,
    p.name AS project_name,
    COALESCE(lr.module_name, 'Unassigned')                                AS module_name,
    COUNT(lr.id)::INTEGER                                                  AS total_tests,
    COUNT(lr.id) FILTER (WHERE lr.status = 'blocked')::INTEGER            AS blocked_count,
    CASE
        WHEN COUNT(lr.id) > 0 THEN
            ROUND(COUNT(lr.id) FILTER (WHERE lr.status = 'blocked')::NUMERIC
                  / COUNT(lr.id) * 100, 2)
        ELSE 0
    END AS blocked_pct,
    -- PIVOT FLAG: tester should stop and pivot when >= 50% of module is blocked
    CASE
        WHEN COUNT(lr.id) > 0
         AND COUNT(lr.id) FILTER (WHERE lr.status = 'blocked')::NUMERIC / COUNT(lr.id) >= 0.50
        THEN TRUE ELSE FALSE
    END AS pivot_required,
    -- RETEST HOURS: double-work cost — hours spent on re-executions
    COALESCE(SUM(lr.estimated_hrs) FILTER (WHERE lr.is_retest = TRUE), 0) AS retest_hrs,
    -- BLOCKED HOURS: effort currently at risk (parked in blocked)
    COALESCE(SUM(lr.estimated_hrs) FILTER (WHERE lr.status = 'blocked'), 0) AS blocked_hrs

FROM projects p
LEFT JOIN latest l ON p.id = l.project_id
LEFT JOIN latest_results lr ON p.id = lr.project_id
WHERE p.deleted_at IS NULL
GROUP BY p.id, p.name, COALESCE(lr.module_name, 'Unassigned')
ORDER BY p.name, COALESCE(lr.module_name, 'Unassigned');

COMMENT ON VIEW v_blocked_test_analysis IS
'Per-module blocked test analysis with pivot flag (fires at >=50%) and double-work effort tracking.';

-- ==========================================================================
-- 4. VIEW: v_test_effectiveness
--    Formula: Defects Detected via Testing / Total Tests Run × 100
--    Uses bugs.source = TEST_CASE (set by Tuleap webhook at ingestion).
-- ==========================================================================

CREATE OR REPLACE VIEW v_test_effectiveness AS
SELECT
    p.id   AS project_id,
    p.name AS project_name,

    -- Defects found through formal test cases (not exploratory bugs)
    COUNT(b.id) FILTER (WHERE b.source = 'TEST_CASE' AND b.deleted_at IS NULL)::INTEGER AS defects_from_testing,

    -- Total tests that ran to a conclusive result (exclude not_run which was never attempted)
    (SELECT COUNT(DISTINCT test_case_id)::INTEGER
     FROM test_result
     WHERE project_id = p.id
       AND deleted_at IS NULL
       AND status IN ('passed', 'failed', 'blocked'))                         AS total_tests_run,

    -- EFFECTIVENESS: defects / tests_run × 100
    CASE
        WHEN (SELECT COUNT(DISTINCT test_case_id) FROM test_result
              WHERE project_id = p.id AND deleted_at IS NULL
                AND status IN ('passed','failed','blocked')) > 0 THEN
            ROUND(
                COUNT(b.id) FILTER (WHERE b.source = 'TEST_CASE' AND b.deleted_at IS NULL)::NUMERIC
                / (SELECT COUNT(DISTINCT test_case_id) FROM test_result
                   WHERE project_id = p.id AND deleted_at IS NULL
                     AND status IN ('passed','failed','blocked'))
                * 100,
            2)
        ELSE 0
    END AS effectiveness_pct

FROM projects p
LEFT JOIN bugs b ON b.project_id = p.id
WHERE p.deleted_at IS NULL
GROUP BY p.id, p.name;

COMMENT ON VIEW v_test_effectiveness IS
'Test Case Effectiveness = Defects Detected via TEST_CASE bugs / Total Tests Run × 100.';

COMMIT;
```

- [ ] **Step 2: Verify the migration applies cleanly**

Connect to the Supabase DB and run:
```bash
docker exec -it supabase-db psql -U postgres -d postgres -f /dev/stdin < database/migrations/017_quality_metrics.sql
```
Expected: `COMMIT` with no errors. Then verify views exist:
```sql
SELECT viewname FROM pg_views WHERE schemaname = 'public' AND viewname LIKE 'v_%' ORDER BY viewname;
```
Expected: `v_blocked_test_analysis`, `v_execution_progress`, `v_test_effectiveness` appear in results.

- [ ] **Step 3: Smoke-test each view**

```sql
SELECT * FROM v_execution_progress LIMIT 3;
SELECT * FROM v_blocked_test_analysis LIMIT 5;
SELECT * FROM v_test_effectiveness LIMIT 3;
```
Expected: Rows returned (may be zeros for new columns), no errors.

- [ ] **Step 4: Commit**

```bash
git add database/migrations/017_quality_metrics.sql
git commit -m "feat(db): add quality metrics columns and views (017)"
```

---

## Task 2: Excel Upload — Optional New Columns

**Files:**
- Modify: `apps/api/src/routes/testExecutions.js`

The upload handler uses `XLSX.utils.sheet_to_json` to convert rows. Find the section that builds INSERT values for each row and add detection for the 4 new optional columns.

- [ ] **Step 1: Find the upload row-mapping block**

Search for the block where rows are mapped to DB inserts:
```bash
grep -n "test_case_id\|tester_name\|upload_batch" apps/api/src/routes/testExecutions.js | head -20
```
Look for the loop that processes `rows` from the parsed sheet.

- [ ] **Step 2: Add a header-normalisation helper** (add near the top of the route file, after existing constants)

```js
// Normalise Excel header strings to snake_case column keys
// Handles case variations and spaces: "Requirement ID", "requirement_id", "RequirementId" → "requirement_id"
function normaliseHeader(h) {
  return String(h)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}
```

- [ ] **Step 3: Add column-detection after sheet parsing**

Inside the upload handler, after `XLSX.utils.sheet_to_json` returns the rows array, add:

```js
// Detect optional new column headers (case-insensitive)
const firstRow = rows[0] || {};
const rawHeaders = Object.keys(firstRow).map(normaliseHeader);
const hasRequirementId = rawHeaders.some(h => h === 'requirement_id' || h === 'requirementid');
const hasModuleName    = rawHeaders.some(h => h === 'module_name'    || h === 'module');
const hasEstimatedHrs  = rawHeaders.some(h => h === 'estimated_hrs'  || h === 'estimatedhours' || h === 'est_hrs');
const hasIsRetest      = rawHeaders.some(h => h === 'is_retest'      || h === 'retest'         || h === 'isretest');
```

- [ ] **Step 4: Extract values in the per-row loop**

In the same loop where existing fields like `tester_name` are extracted, add after existing field extraction:

```js
// New optional fields — extracted only if header exists in upload
const requirement_id = hasRequirementId
  ? (String(row['requirement_id'] || row['Requirement ID'] || row['RequirementID'] || '').trim() || null)
  : null;

const module_name = hasModuleName
  ? (String(row['module_name'] || row['Module'] || '').trim() || null)
  : null;

const estimated_hrs = hasEstimatedHrs
  ? (parseFloat(row['estimated_hrs'] || row['Estimated Hours'] || row['est_hrs']) || null)
  : null;

const isRetestRaw = hasIsRetest
  ? String(row['is_retest'] || row['Is Retest'] || row['isretest'] || '').trim().toLowerCase()
  : 'false';
const is_retest = ['yes', 'true', '1', 'y'].includes(isRetestRaw);
```

- [ ] **Step 5: Extend the INSERT statement**

Find the INSERT query for `test_result`. Currently it inserts the base columns. Extend it to conditionally include the new columns. The existing pattern avoids passing NULL for `started_at` — follow the same approach by using a conditional INSERT:

```js
// Build dynamic INSERT to avoid overriding defaults with NULL
const insertColumns = [
  'test_case_id', 'test_case_title', 'project_id', 'status',
  'executed_at', 'notes', 'tester_name', 'upload_batch_id', 'uploaded_by'
];
const insertValues = [
  testCaseId, testCaseTitle, projectId, status,
  executedAt, notes, testerName, uploadBatchId, uploadedBy
];

// Append optional new columns only when values are present
if (requirement_id !== null) { insertColumns.push('requirement_id'); insertValues.push(requirement_id); }
if (module_name    !== null) { insertColumns.push('module_name');    insertValues.push(module_name); }
if (estimated_hrs  !== null) { insertColumns.push('estimated_hrs');  insertValues.push(estimated_hrs); }
if (is_retest) {
  insertColumns.push('is_retest');
  insertValues.push(true);
  // If the row also carries a blocked_result_id value, add it
  const blockedResultId = String(row['blocked_result_id'] || '').trim() || null;
  if (blockedResultId) {
    insertColumns.push('blocked_result_id');
    insertValues.push(blockedResultId);
  }
}

const placeholders = insertColumns.map((_, i) => `$${i + 1}`).join(', ');
const insertQuery = `
  INSERT INTO test_result (${insertColumns.join(', ')})
  VALUES (${placeholders})
  ON CONFLICT (test_case_id, project_id, executed_at, is_retest, deleted_at) DO UPDATE
    SET status = EXCLUDED.status,
        notes  = EXCLUDED.notes,
        tester_name = EXCLUDED.tester_name,
        updated_at  = CURRENT_TIMESTAMP
  RETURNING id
`;
await client.query(insertQuery, insertValues);
```

Note: The ON CONFLICT target now includes `is_retest` to match the updated UNIQUE constraint from migration 017.

- [ ] **Step 6: Manual smoke test**

Upload an Excel file that includes the optional columns and verify the new fields persist:
```bash
curl -s "https://api.gebrils.cloud/api/test-executions/upload-excel" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test_with_modules.xlsx" \
  -F "project_id=<uuid>" | jq .
```
Expected: `{ "success": true, "inserted": N }`. Then query the DB:
```sql
SELECT test_case_id, module_name, requirement_id, estimated_hrs, is_retest
FROM test_result ORDER BY created_at DESC LIMIT 5;
```
Expected: new columns populated for rows where headers were present.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/testExecutions.js
git commit -m "feat(api): detect optional quality columns in Excel upload (017)"
```

---

## Task 3: API — Three New Governance Endpoints (TDD)

**Files:**
- Create: `apps/api/__tests__/governance.qualityMetrics.test.js`
- Modify: `apps/api/src/routes/governance.js`

- [ ] **Step 1: Write the failing tests**

```js
// apps/api/__tests__/governance.qualityMetrics.test.js

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ pool: { query: mockQuery } }));

const express = require('express');
const request = require('supertest');

// Stub auth middleware so tests don't need real JWTs
jest.mock('../src/middleware/authMiddleware', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 'user-1' }; next(); },
  requirePermission: () => (req, res, next) => next(),
}));

const governanceRouter = require('../src/routes/governance');
const app = express();
app.use(express.json());
app.use('/governance', governanceRouter);

afterEach(() => jest.clearAllMocks());

describe('GET /governance/quality-metrics', () => {
  test('returns quality metrics for all projects', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        project_id: 'proj-1',
        project_name: 'Alpha',
        execution_coverage_pct: '75.00',
        requirement_coverage_pct: '60.00',
        gross_progress_pct: '80.00',
        net_progress_pct: '65.00',
        total_planned_tests: 20,
        executed_tests: 15,
        covered_requirements: 3,
        total_requirements: 5,
        defects_from_testing: 4,
        total_tests_run: 15,
        effectiveness_pct: '26.67',
      }]
    });
    const res = await request(app).get('/governance/quality-metrics');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].execution_coverage_pct).toBe('75.00');
    expect(res.body.data[0].effectiveness_pct).toBe('26.67');
  });

  test('filters by project_id when provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/governance/quality-metrics?project_id=proj-1');
    expect(res.status).toBe(200);
    const callSql = mockQuery.mock.calls[0][0];
    expect(callSql).toMatch(/ep\.project_id = \$1/);
  });

  test('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db down'));
    const res = await request(app).get('/governance/quality-metrics');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /governance/blocked-analysis', () => {
  test('returns blocked module rows', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        project_id: 'proj-1',
        project_name: 'Alpha',
        module_name: 'Login',
        total_tests: 8,
        blocked_count: 5,
        blocked_pct: '62.50',
        pivot_required: true,
        retest_hrs: '3.00',
        blocked_hrs: '10.00',
      }]
    });
    const res = await request(app).get('/governance/blocked-analysis');
    expect(res.status).toBe(200);
    expect(res.body.data[0].pivot_required).toBe(true);
    expect(res.body.data[0].blocked_pct).toBe('62.50');
  });

  test('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db down'));
    const res = await request(app).get('/governance/blocked-analysis');
    expect(res.status).toBe(500);
  });
});

describe('GET /governance/execution-progress', () => {
  test('returns gross/net progress per project', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        project_id: 'proj-1',
        project_name: 'Alpha',
        total_in_scope: 20,
        passed_count: 12,
        failed_count: 2,
        blocked_count: 3,
        not_run_count: 3,
        rejected_count: 0,
        gross_progress_pct: '85.00',
        net_progress_pct: '70.00',
        total_planned_tests: 20,
        executed_tests: 17,
        execution_coverage_pct: '85.00',
        covered_requirements: 0,
        total_requirements: 0,
        requirement_coverage_pct: null,
      }]
    });
    const res = await request(app).get('/governance/execution-progress');
    expect(res.status).toBe(200);
    expect(res.body.data[0].gross_progress_pct).toBe('85.00');
    expect(res.body.data[0].net_progress_pct).toBe('70.00');
    expect(res.body.data[0].requirement_coverage_pct).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd apps/api && npx jest governance.qualityMetrics --no-coverage 2>&1 | tail -15
```
Expected: Tests fail with "route not found" or similar.

- [ ] **Step 3: Add the three endpoints to governance.js**

Append these three route handlers at the bottom of `apps/api/src/routes/governance.js`, before `module.exports = router`:

```js
// =====================================================
// GET /governance/quality-metrics
// Joins v_execution_progress + v_test_effectiveness
// =====================================================
router.get('/quality-metrics', requireAuth, requirePermission('page:governance'), async (req, res) => {
    try {
        const { project_id } = req.query;
        let query = `
            SELECT
                ep.project_id,
                ep.project_name,
                ep.execution_coverage_pct,
                ep.requirement_coverage_pct,
                ep.gross_progress_pct,
                ep.net_progress_pct,
                ep.total_planned_tests,
                ep.executed_tests,
                ep.covered_requirements,
                ep.total_requirements,
                te.defects_from_testing,
                te.total_tests_run,
                te.effectiveness_pct
            FROM v_execution_progress ep
            LEFT JOIN v_test_effectiveness te ON ep.project_id = te.project_id
            WHERE 1=1
        `;
        const params = [];
        if (project_id) {
            query += ` AND ep.project_id = $1`;
            params.push(project_id);
        }
        query += ' ORDER BY ep.project_name';
        const result = await pool.query(query, params);
        res.json({ success: true, count: result.rows.length, data: result.rows });
    } catch (error) {
        console.error('Error fetching quality metrics:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch quality metrics', message: error.message });
    }
});

// =====================================================
// GET /governance/blocked-analysis
// Per-module blocked % with pivot flags
// =====================================================
router.get('/blocked-analysis', requireAuth, requirePermission('page:governance'), async (req, res) => {
    try {
        const { project_id } = req.query;
        let query = `SELECT * FROM v_blocked_test_analysis WHERE 1=1`;
        const params = [];
        if (project_id) {
            query += ` AND project_id = $1`;
            params.push(project_id);
        }
        query += ' ORDER BY project_name, module_name';
        const result = await pool.query(query, params);
        res.json({ success: true, count: result.rows.length, data: result.rows });
    } catch (error) {
        console.error('Error fetching blocked analysis:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch blocked analysis', message: error.message });
    }
});

// =====================================================
// GET /governance/execution-progress
// Gross/Net Progress + Execution/Requirement Coverage
// =====================================================
router.get('/execution-progress', requireAuth, requirePermission('page:governance'), async (req, res) => {
    try {
        const { project_id } = req.query;
        let query = `SELECT * FROM v_execution_progress WHERE 1=1`;
        const params = [];
        if (project_id) {
            query += ` AND project_id = $1`;
            params.push(project_id);
        }
        query += ' ORDER BY project_name';
        const result = await pool.query(query, params);
        res.json({ success: true, count: result.rows.length, data: result.rows });
    } catch (error) {
        console.error('Error fetching execution progress:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch execution progress', message: error.message });
    }
});
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd apps/api && npx jest governance.qualityMetrics --no-coverage 2>&1 | tail -15
```
Expected: 7 tests pass, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/governance.js apps/api/__tests__/governance.qualityMetrics.test.js
git commit -m "feat(api): add quality-metrics, blocked-analysis, execution-progress endpoints"
```

---

## Task 4: TypeScript Types

**Files:**
- Modify: `apps/web/src/types/governance.ts`

- [ ] **Step 1: Add new interfaces at the end of the file** (before the closing of the file, after `TASK_HISTORY_ACTION_COLORS`)

```typescript
// =====================================================
// Execution Progress Types (v_execution_progress)
// =====================================================

export interface ExecutionProgress {
    project_id: string;
    project_name: string;
    total_in_scope: number;
    passed_count: number;
    failed_count: number;
    blocked_count: number;
    not_run_count: number;
    rejected_count: number;
    /** (passed + failed + blocked) / total × 100 */
    gross_progress_pct: string;
    /** (passed + failed) / total × 100 */
    net_progress_pct: string;
    total_planned_tests: number;
    executed_tests: number;
    execution_coverage_pct: string;
    covered_requirements: number;
    total_requirements: number;
    /** null when no requirement_id values have been uploaded */
    requirement_coverage_pct: string | null;
}

// =====================================================
// Blocked Test Analysis Types (v_blocked_test_analysis)
// =====================================================

export interface BlockedModuleAnalysis {
    project_id: string;
    project_name: string;
    module_name: string;
    total_tests: number;
    blocked_count: number;
    blocked_pct: string;
    /** true when blocked_pct >= 50% — tester should pivot to another module */
    pivot_required: boolean;
    /** Hours already spent re-executing previously blocked tests */
    retest_hrs: string;
    /** Hours currently at risk (parked in blocked status) */
    blocked_hrs: string;
}

// =====================================================
// Quality Metrics Types (joined view)
// =====================================================

export interface QualityMetrics {
    project_id: string;
    project_name: string;
    execution_coverage_pct: string;
    requirement_coverage_pct: string | null;
    gross_progress_pct: string;
    net_progress_pct: string;
    total_planned_tests: number;
    executed_tests: number;
    covered_requirements: number;
    total_requirements: number;
    defects_from_testing: number;
    total_tests_run: number;
    /** defects_from_testing / total_tests_run × 100 */
    effectiveness_pct: string;
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```
Expected: No output (zero errors).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/types/governance.ts
git commit -m "feat(types): add ExecutionProgress, BlockedModuleAnalysis, QualityMetrics types"
```

---

## Task 5: PERT Utility + governanceApi Service Functions

**Files:**
- Create: `apps/web/src/lib/pert.ts`
- Modify: `apps/web/src/services/governanceApi.ts`

- [ ] **Step 1: Create the PERT utility**

```typescript
// apps/web/src/lib/pert.ts
/**
 * PERT (Program Evaluation and Review Technique) estimation.
 * Formula: (Optimistic + 4 × Most Likely + Pessimistic) / 6
 * Returns hours as a number, rounded to 2 decimal places.
 */
export function pertEstimate(
    optimistic: number,
    mostLikely: number,
    pessimistic: number
): number {
    return Math.round(((optimistic + 4 * mostLikely + pessimistic) / 6) * 100) / 100;
}

/** Standard deviation of the PERT estimate: (Pessimistic - Optimistic) / 6 */
export function pertStdDev(optimistic: number, pessimistic: number): number {
    return Math.round(((pessimistic - optimistic) / 6) * 100) / 100;
}
```

- [ ] **Step 2: Add three service functions to governanceApi.ts**

Add after the `getTaskHistory` function (before the `governanceApi` export object), then add the new functions to the export object too:

```typescript
// =====================================================
// Quality Metrics (new views from migration 017)
// =====================================================

export async function getQualityMetrics(projectId?: string): Promise<QualityMetrics[]> {
    try {
        const params = new URLSearchParams();
        if (projectId) params.append('project_id', projectId);
        const qs = params.toString();
        const result = await fetchApi<GovernanceApiResponse<QualityMetrics[]>>(
            `/governance/quality-metrics${qs ? '?' + qs : ''}`
        );
        return result.data;
    } catch (error) {
        console.warn('Quality Metrics API failed', error);
        return [];
    }
}

export async function getBlockedAnalysis(projectId?: string): Promise<BlockedModuleAnalysis[]> {
    try {
        const params = new URLSearchParams();
        if (projectId) params.append('project_id', projectId);
        const qs = params.toString();
        const result = await fetchApi<GovernanceApiResponse<BlockedModuleAnalysis[]>>(
            `/governance/blocked-analysis${qs ? '?' + qs : ''}`
        );
        return result.data;
    } catch (error) {
        console.warn('Blocked Analysis API failed', error);
        return [];
    }
}

export async function getExecutionProgress(projectId?: string): Promise<ExecutionProgress[]> {
    try {
        const params = new URLSearchParams();
        if (projectId) params.append('project_id', projectId);
        const qs = params.toString();
        const result = await fetchApi<GovernanceApiResponse<ExecutionProgress[]>>(
            `/governance/execution-progress${qs ? '?' + qs : ''}`
        );
        return result.data;
    } catch (error) {
        console.warn('Execution Progress API failed', error);
        return [];
    }
}
```

Add the import at the top of governanceApi.ts (in the existing import block from `'../types/governance'`):

```typescript
import type {
    // ... existing imports ...
    ExecutionProgress,
    BlockedModuleAnalysis,
    QualityMetrics,
} from '../types/governance';
```

Also add the three new functions to the `governanceApi` export object:

```typescript
export const governanceApi = {
    // ... existing entries ...
    getQualityMetrics,
    getBlockedAnalysis,
    getExecutionProgress,
};
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```
Expected: No output.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/pert.ts apps/web/src/services/governanceApi.ts
git commit -m "feat(frontend): add PERT utility and governance API service functions"
```

---

## Task 6: QualityMetricsWidget

**Files:**
- Create: `apps/web/src/components/governance/QualityMetricsWidget.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { pertEstimate, pertStdDev } from '@/lib/pert';
import type { QualityMetrics } from '@/types/governance';

interface QualityMetricsWidgetProps {
    data: QualityMetrics[];
}

function MetricCard({
    label,
    value,
    subtitle,
    color = 'indigo',
}: {
    label: string;
    value: string;
    subtitle?: string;
    color?: 'indigo' | 'emerald' | 'amber' | 'rose';
}) {
    const colors = {
        indigo: 'text-indigo-600 dark:text-indigo-400',
        emerald: 'text-emerald-600 dark:text-emerald-400',
        amber: 'text-amber-600 dark:text-amber-400',
        rose: 'text-rose-600 dark:text-rose-400',
    };
    return (
        <div className="flex flex-col gap-1 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</span>
            <span className={`text-2xl font-bold ${colors[color]}`}>{value}</span>
            {subtitle && <span className="text-xs text-slate-400">{subtitle}</span>}
        </div>
    );
}

export function QualityMetricsWidget({ data }: QualityMetricsWidgetProps) {
    // Aggregate across all projects (sum where additive, average where rate)
    const total = data.length;
    const agg = data.reduce(
        (acc, d) => ({
            execution_coverage: acc.execution_coverage + parseFloat(d.execution_coverage_pct || '0'),
            effectiveness:      acc.effectiveness      + parseFloat(d.effectiveness_pct      || '0'),
            req_coverage_sum:   acc.req_coverage_sum   + (d.requirement_coverage_pct ? parseFloat(d.requirement_coverage_pct) : 0),
            req_coverage_count: acc.req_coverage_count + (d.requirement_coverage_pct ? 1 : 0),
        }),
        { execution_coverage: 0, effectiveness: 0, req_coverage_sum: 0, req_coverage_count: 0 }
    );

    const avgExecCoverage = total > 0 ? (agg.execution_coverage / total).toFixed(1) : '—';
    const avgEffectiveness = total > 0 ? (agg.effectiveness / total).toFixed(1) : '—';
    const avgReqCoverage = agg.req_coverage_count > 0
        ? (agg.req_coverage_sum / agg.req_coverage_count).toFixed(1)
        : null;

    // PERT calculator state
    const [pert, setPert] = useState({ o: '', m: '', p: '' });
    const pertValid = pert.o !== '' && pert.m !== '' && pert.p !== '';
    const pertResult = pertValid
        ? pertEstimate(parseFloat(pert.o), parseFloat(pert.m), parseFloat(pert.p))
        : null;
    const pertSd = pertValid
        ? pertStdDev(parseFloat(pert.o), parseFloat(pert.p))
        : null;

    return (
        <Card className="shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">
                    Quality Metrics
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Metric Cards */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <MetricCard
                        label="Execution Coverage"
                        value={total > 0 ? `${avgExecCoverage}%` : '—'}
                        subtitle="Executed / Planned Tests"
                        color="indigo"
                    />
                    <MetricCard
                        label="Requirement Coverage"
                        value={avgReqCoverage ? `${avgReqCoverage}%` : 'N/A'}
                        subtitle={avgReqCoverage ? 'Covered Reqs / Total Reqs' : 'Add requirement_id to uploads'}
                        color="emerald"
                    />
                    <MetricCard
                        label="TC Effectiveness"
                        value={total > 0 ? `${avgEffectiveness}%` : '—'}
                        subtitle="Defects Found / Tests Run"
                        color="amber"
                    />
                </div>

                {/* PERT Calculator */}
                <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                        PERT Effort Estimator
                        <span className="ml-2 text-xs text-slate-400 font-normal">(O + 4ML + P) / 6</span>
                    </p>
                    <div className="flex gap-2 flex-wrap">
                        {(['o', 'm', 'p'] as const).map((key, i) => (
                            <div key={key} className="flex flex-col gap-1">
                                <label className="text-xs text-slate-500">
                                    {['Optimistic (hrs)', 'Most Likely (hrs)', 'Pessimistic (hrs)'][i]}
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    value={pert[key]}
                                    onChange={e => setPert(prev => ({ ...prev, [key]: e.target.value }))}
                                    className="w-28 px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                    placeholder="0"
                                />
                            </div>
                        ))}
                        {pertResult !== null && (
                            <div className="flex flex-col gap-1 justify-end">
                                <span className="text-xs text-slate-500">Estimate ± 1σ</span>
                                <div className="px-3 py-1.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-md text-sm font-semibold">
                                    {pertResult}h ± {pertSd}h
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```
Expected: No output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/governance/QualityMetricsWidget.tsx
git commit -m "feat(ui): add QualityMetricsWidget with coverage KPIs and PERT calculator"
```

---

## Task 7: BlockedTestsWidget

**Files:**
- Create: `apps/web/src/components/governance/BlockedTestsWidget.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import type { BlockedModuleAnalysis } from '@/types/governance';

interface BlockedTestsWidgetProps {
    data: BlockedModuleAnalysis[];
}

export function BlockedTestsWidget({ data }: BlockedTestsWidgetProps) {
    const pivotModules = data.filter(d => d.pivot_required);
    const totalBlockedHrs = data.reduce((sum, d) => sum + parseFloat(d.blocked_hrs || '0'), 0);
    const totalRetestHrs  = data.reduce((sum, d) => sum + parseFloat(d.retest_hrs  || '0'), 0);

    return (
        <Card className="shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white flex items-center justify-between">
                    Blocked Test Analysis
                    {pivotModules.length > 0 && (
                        <span className="text-xs font-normal px-2 py-1 bg-red-100 text-red-700 rounded-full">
                            {pivotModules.length} pivot required
                        </span>
                    )}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Pivot Alerts */}
                {pivotModules.length > 0 && (
                    <div className="space-y-2">
                        {pivotModules.map(m => (
                            <div
                                key={`${m.project_id}-${m.module_name}`}
                                className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
                            >
                                <span className="text-red-500 mt-0.5">⚠</span>
                                <div>
                                    <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                                        PIVOT REQUIRED — {m.project_name} / {m.module_name}
                                    </p>
                                    <p className="text-xs text-red-600 dark:text-red-400">
                                        {m.blocked_count} of {m.total_tests} tests blocked ({m.blocked_pct}%).
                                        Reassign tester to unblocked modules.
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Module Table */}
                {data.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 dark:border-slate-700">
                                    <th className="text-left py-2 pr-3 font-medium text-slate-500 text-xs uppercase">Project / Module</th>
                                    <th className="text-right py-2 px-2 font-medium text-slate-500 text-xs uppercase">Tests</th>
                                    <th className="text-right py-2 px-2 font-medium text-slate-500 text-xs uppercase">Blocked</th>
                                    <th className="text-right py-2 px-2 font-medium text-slate-500 text-xs uppercase">Blocked %</th>
                                    <th className="text-right py-2 px-2 font-medium text-slate-500 text-xs uppercase">At Risk (hrs)</th>
                                    <th className="text-right py-2 pl-2 font-medium text-slate-500 text-xs uppercase">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.map(row => (
                                    <tr
                                        key={`${row.project_id}-${row.module_name}`}
                                        className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                    >
                                        <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">
                                            <span className="font-medium">{row.project_name}</span>
                                            <span className="text-slate-400"> / </span>
                                            <span>{row.module_name}</span>
                                        </td>
                                        <td className="py-2 px-2 text-right text-slate-600 dark:text-slate-400">{row.total_tests}</td>
                                        <td className="py-2 px-2 text-right text-slate-600 dark:text-slate-400">{row.blocked_count}</td>
                                        <td className="py-2 px-2 text-right">
                                            <span className={`font-semibold ${parseFloat(row.blocked_pct) >= 50 ? 'text-red-600' : parseFloat(row.blocked_pct) >= 25 ? 'text-amber-600' : 'text-slate-600 dark:text-slate-400'}`}>
                                                {row.blocked_pct}%
                                            </span>
                                        </td>
                                        <td className="py-2 px-2 text-right text-slate-600 dark:text-slate-400">
                                            {parseFloat(row.blocked_hrs) > 0 ? `${row.blocked_hrs}h` : '—'}
                                        </td>
                                        <td className="py-2 pl-2 text-right">
                                            {row.pivot_required ? (
                                                <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">PIVOT</span>
                                            ) : (
                                                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400 rounded text-xs">OK</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-sm text-slate-400 text-center py-4">No blocked test data. Upload results with a module_name column to see breakdown.</p>
                )}

                {/* Double-Work Summary Footer */}
                {(totalBlockedHrs > 0 || totalRetestHrs > 0) && (
                    <div className="flex gap-4 pt-2 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500">
                        <span>Effort at risk: <strong className="text-amber-600">{totalBlockedHrs.toFixed(1)}h</strong></span>
                        <span>Double-work (retests): <strong className="text-rose-600">{totalRetestHrs.toFixed(1)}h</strong></span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```
Expected: No output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/governance/BlockedTestsWidget.tsx
git commit -m "feat(ui): add BlockedTestsWidget with pivot alerts and double-work tracking"
```

---

## Task 8: GrossNetProgressWidget

**Files:**
- Create: `apps/web/src/components/governance/GrossNetProgressWidget.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import type { ExecutionProgress } from '@/types/governance';

interface GrossNetProgressWidgetProps {
    data: ExecutionProgress[];
}

function ProgressBar({ value, color, label }: { value: number; color: string; label: string }) {
    return (
        <div className="space-y-1">
            <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500">{label}</span>
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{value.toFixed(1)}%</span>
            </div>
            <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-500 ${color}`}
                    style={{ width: `${Math.min(value, 100)}%` }}
                />
            </div>
        </div>
    );
}

export function GrossNetProgressWidget({ data }: GrossNetProgressWidgetProps) {
    if (data.length === 0) {
        return (
            <Card className="shadow-sm">
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">Progress Overview</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-slate-400 text-center py-4">No test execution data available.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    Progress Overview
                    <span className="text-xs font-normal text-slate-400">Gross vs. Net</span>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
                {/* Legend */}
                <div className="flex gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-indigo-400 inline-block" />
                        Gross — includes blocked (masks risk)
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
                        Net — Passed + Failed only (true quality)
                    </span>
                </div>

                {/* Per-project rows */}
                <div className="space-y-5 divide-y divide-slate-100 dark:divide-slate-800">
                    {data.map(proj => {
                        const gross = parseFloat(proj.gross_progress_pct);
                        const net   = parseFloat(proj.net_progress_pct);
                        const gap   = gross - net; // Blocked contribution

                        return (
                            <div key={proj.project_id} className="pt-4 first:pt-0 space-y-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{proj.project_name}</p>
                                    {gap > 5 && (
                                        <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded">
                                            {gap.toFixed(1)}% blocked gap
                                        </span>
                                    )}
                                </div>
                                <ProgressBar value={gross} color="bg-indigo-400" label={`Gross Progress (${proj.blocked_count} blocked)`} />
                                <ProgressBar value={net}   color="bg-emerald-500" label={`Net Progress (${proj.passed_count} passed, ${proj.failed_count} failed)`} />
                                <div className="flex justify-between text-xs text-slate-400 pt-1">
                                    <span>{proj.executed_tests} of {proj.total_planned_tests} test cases executed</span>
                                    <span>Exec coverage: {proj.execution_coverage_pct}%</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```
Expected: No output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/governance/GrossNetProgressWidget.tsx
git commit -m "feat(ui): add GrossNetProgressWidget showing gross vs net progress per project"
```

---

## Task 9: Wire Components into Governance Page

**Files:**
- Modify: `apps/web/src/components/governance/index.ts`
- Modify: `apps/web/app/governance/page.tsx`

- [ ] **Step 1: Export the three new components from index.ts**

Open `apps/web/src/components/governance/index.ts` and add exports for the three new widgets alongside the existing ones:

```typescript
export { QualityMetricsWidget }   from './QualityMetricsWidget';
export { BlockedTestsWidget }     from './BlockedTestsWidget';
export { GrossNetProgressWidget } from './GrossNetProgressWidget';
```

- [ ] **Step 2: Update governance/page.tsx — add imports**

In the existing import block at the top of `apps/web/app/governance/page.tsx`, extend the destructured import from `'../../src/components/governance'`:

```typescript
import {
    ProjectHealthHeatmap,
    WorkloadBalanceWidget,
    RiskIndicatorsWidget,
    ReleaseReadinessWidget,
    TrendAnalysisWidget,
    TestExecutionSummaryWidget,
    BugSummaryWidget,
    QualityMetricsWidget,    // new
    BlockedTestsWidget,      // new
    GrossNetProgressWidget,  // new
} from '../../src/components/governance';
```

Also add service function imports (alongside existing imports from `governanceApi`):

```typescript
import {
    getDashboardSummary,
    getQualityRisks,
    getExecutionTrend,
    getQualityMetrics,     // new
    getBlockedAnalysis,    // new
    getExecutionProgress,  // new
} from '../../src/services/governanceApi';
```

Add the type imports:

```typescript
import type {
    DashboardSummary,
    QualityRisk,
    TrendData,
    QualityMetrics,          // new
    BlockedModuleAnalysis,   // new
    ExecutionProgress,       // new
} from '../../src/types/governance';
```

- [ ] **Step 3: Add state and fetch calls**

Inside `GovernanceDashboardPage`, add the three new state variables alongside existing ones:

```typescript
const [qualityMetrics, setQualityMetrics]   = useState<QualityMetrics[]>([]);
const [blockedAnalysis, setBlockedAnalysis] = useState<BlockedModuleAnalysis[]>([]);
const [execProgress, setExecProgress]       = useState<ExecutionProgress[]>([]);
```

Inside `loadData`, extend the `Promise.all` call to include the three new fetches:

```typescript
const [
    summaryData,
    risksData,
    trendDataResult,
    projectsData,
    tasksData,
    qualityMetricsData,   // new
    blockedAnalysisData,  // new
    execProgressData,     // new
] = await Promise.all([
    getDashboardSummary(),
    getQualityRisks('CRITICAL'),
    getExecutionTrend(),
    projectsApi.list().catch(() => [] as Project[]),
    tasksApi.list().catch(() => [] as Task[]),
    getQualityMetrics(),   // new
    getBlockedAnalysis(),  // new
    getExecutionProgress(), // new
]);

// ... existing setters ...
setQualityMetrics(qualityMetricsData);
setBlockedAnalysis(blockedAnalysisData);
setExecProgress(execProgressData);
```

- [ ] **Step 4: Add the three new widget sections to the JSX**

Find the existing grid section in the return JSX (after `BugSummaryWidget` or at the end of the main content area) and add the new widgets:

```tsx
{/* Quality Metrics Row */}
<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
    <QualityMetricsWidget data={qualityMetrics} />
</div>

{/* Blocked Analysis + Gross/Net Progress Row */}
<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BlockedTestsWidget data={blockedAnalysis} />
        <GrossNetProgressWidget data={execProgress} />
    </div>
</div>
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```
Expected: No output.

- [ ] **Step 6: Run the full Jest suite to check for regressions**

```bash
cd apps/api && npx jest --no-coverage 2>&1 | tail -20
```
Expected: All existing tests plus the 7 new governance tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/governance/index.ts apps/web/app/governance/page.tsx
git commit -m "feat(ui): wire QualityMetricsWidget, BlockedTestsWidget, GrossNetProgressWidget into governance dashboard"
```

---

## Self-Review Checklist

### Spec Coverage

| Requirement | Implemented in |
|---|---|
| Double-Work Factor (retest hours) | Migration 017 `is_retest` column; `v_blocked_test_analysis.retest_hrs`; BlockedTestsWidget footer |
| Dynamic Workload Reallocation (pivot at 50%) | `v_blocked_test_analysis.pivot_required`; BlockedTestsWidget pivot alert |
| Effort Recalculation (blocked → pending) | `v_blocked_test_analysis.blocked_hrs`; BlockedTestsWidget "At Risk" column |
| Requirement Coverage formula | `v_execution_progress.requirement_coverage_pct`; QualityMetricsWidget |
| Execution Coverage formula | `v_execution_progress.execution_coverage_pct`; QualityMetricsWidget + GrossNetProgressWidget |
| Test Case Effectiveness formula | `v_test_effectiveness.effectiveness_pct`; QualityMetricsWidget |
| PERT Estimation formula | `apps/web/src/lib/pert.ts`; interactive calculator in QualityMetricsWidget |
| Gross Progress (masked risk) | `v_execution_progress.gross_progress_pct`; GrossNetProgressWidget |
| Net Progress (true quality) | `v_execution_progress.net_progress_pct`; GrossNetProgressWidget |

All 9 requirements are covered. No gaps.

### Placeholder Scan

No TBDs, TODOs, or "similar to above" references. All code is complete.

### Type Consistency

- `BlockedModuleAnalysis.blocked_pct` is `string` in types (PostgreSQL NUMERIC returns as string) — widget calls `parseFloat()` ✓
- `ExecutionProgress.gross_progress_pct` is `string` — widget calls `parseFloat()` ✓
- `QualityMetrics.effectiveness_pct` is `string` — widget calls `parseFloat()` ✓
- `pertEstimate()` takes and returns `number` — widget passes `parseFloat(pert.o)` ✓
- `pertStdDev()` is imported in QualityMetricsWidget ✓ (exported from pert.ts)

### Critical Rule Checks (from project memory)

- No NULL passed for `started_at` — upload enhancement uses conditional column inclusion ✓
- UNIQUE constraint updated to include `is_retest` before breaking it ✓
- Queries target `supabase-db` via the existing `pool` from `../config/db` ✓
- `URLSearchParams` strips falsy values — service functions only `append` when value is truthy ✓
- Tuleap integer IDs not in UUID columns — new columns use VARCHAR/BOOLEAN/NUMERIC, no UUID arrays ✓

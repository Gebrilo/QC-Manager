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
    p.project_name       AS project_name,

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
GROUP BY p.id, p.project_name;

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
    p.project_name AS project_name,
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
GROUP BY p.id, p.project_name, COALESCE(lr.module_name, 'Unassigned')
ORDER BY p.project_name, COALESCE(lr.module_name, 'Unassigned');

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
    p.project_name AS project_name,

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
GROUP BY p.id, p.project_name;

COMMENT ON VIEW v_test_effectiveness IS
'Test Case Effectiveness = Defects Detected via TEST_CASE bugs / Total Tests Run × 100.';

COMMIT;

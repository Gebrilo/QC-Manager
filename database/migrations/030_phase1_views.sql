-- =====================================================
-- Migration: Phase 1 Quality Metric Views
-- Version: 003
-- Description: Creates 4 essential views for Phase 1 quality metrics
-- Dependencies: test_result table must exist
-- =====================================================

-- Drop existing views if any
DROP VIEW IF EXISTS v_latest_test_results CASCADE;
DROP VIEW IF EXISTS v_test_case_history CASCADE;
DROP VIEW IF EXISTS v_test_execution_trends CASCADE;
DROP VIEW IF EXISTS v_project_quality_metrics CASCADE;

-- =====================================================
-- View 1: v_latest_test_results
-- Purpose: Shows most recent result for each test case
-- =====================================================

CREATE OR REPLACE VIEW v_latest_test_results AS
SELECT DISTINCT ON (tr.project_id, tr.test_case_id)
    tr.id,
    tr.test_case_id,
    tr.test_case_title,
    tr.project_id,
    tr.status,
    tr.executed_at,
    tr.notes,
    tr.tester_name,
    p.name AS project_name,
    CURRENT_DATE - tr.executed_at AS days_since_execution
FROM test_result tr
LEFT JOIN projects p ON tr.project_id = p.id
WHERE tr.deleted_at IS NULL
ORDER BY tr.project_id, tr.test_case_id, tr.executed_at DESC, tr.created_at DESC;

COMMENT ON VIEW v_latest_test_results IS 'Latest test execution result for each test case per project';

-- =====================================================
-- View 2: v_test_case_history
-- Purpose: Aggregated history and pass rate per test case
-- =====================================================

CREATE OR REPLACE VIEW v_test_case_history AS
SELECT
    tr.test_case_id,
    tr.project_id,
    p.name AS project_name,
    MAX(tr.test_case_title) AS test_case_title,

    -- Latest execution info
    MAX(tr.executed_at) AS last_executed_at,
    CURRENT_DATE - MAX(tr.executed_at) AS days_since_last_run,

    -- Total execution count
    COUNT(*) AS total_executions,

    -- Status breakdown (all history)
    COUNT(*) FILTER (WHERE tr.status = 'passed') AS total_passed,
    COUNT(*) FILTER (WHERE tr.status = 'failed') AS total_failed,
    COUNT(*) FILTER (WHERE tr.status = 'not_run') AS total_not_run,
    COUNT(*) FILTER (WHERE tr.status = 'blocked') AS total_blocked,
    COUNT(*) FILTER (WHERE tr.status = 'rejected') AS total_rejected,

    -- Pass rate (all time)
    CASE
        WHEN COUNT(*) > 0 THEN
            ROUND((COUNT(*) FILTER (WHERE tr.status = 'passed')::NUMERIC / COUNT(*)::NUMERIC) * 100, 2)
        ELSE 0
    END AS overall_pass_rate_pct,

    -- Latest status
    (SELECT status FROM test_result
     WHERE test_case_id = tr.test_case_id
       AND project_id = tr.project_id
       AND deleted_at IS NULL
     ORDER BY executed_at DESC, created_at DESC
     LIMIT 1) AS latest_status

FROM test_result tr
LEFT JOIN projects p ON tr.project_id = p.id
WHERE tr.deleted_at IS NULL
GROUP BY tr.test_case_id, tr.project_id, p.name;

COMMENT ON VIEW v_test_case_history IS 'Historical execution summary per test case with pass rates';

-- =====================================================
-- View 3: v_test_execution_trends
-- Purpose: Daily execution statistics for trend charts
-- =====================================================

CREATE OR REPLACE VIEW v_test_execution_trends AS
SELECT
    tr.project_id,
    p.name AS project_name,
    tr.executed_at AS execution_date,

    -- Daily metrics
    COUNT(DISTINCT tr.test_case_id) AS tests_executed,
    COUNT(*) FILTER (WHERE tr.status = 'passed') AS passed_count,
    COUNT(*) FILTER (WHERE tr.status = 'failed') AS failed_count,
    COUNT(*) FILTER (WHERE tr.status = 'not_run') AS not_run_count,
    COUNT(*) FILTER (WHERE tr.status = 'blocked') AS blocked_count,
    COUNT(*) FILTER (WHERE tr.status = 'rejected') AS rejected_count,

    -- Daily pass rate
    CASE
        WHEN COUNT(*) > 0 THEN
            ROUND((COUNT(*) FILTER (WHERE tr.status = 'passed')::NUMERIC / COUNT(*)::NUMERIC) * 100, 2)
        ELSE 0
    END AS pass_rate_pct

FROM test_result tr
LEFT JOIN projects p ON tr.project_id = p.id
WHERE tr.deleted_at IS NULL
GROUP BY tr.project_id, p.name, tr.executed_at
ORDER BY tr.project_id, tr.executed_at DESC;

COMMENT ON VIEW v_test_execution_trends IS 'Daily test execution trends with pass rates for charting';

-- =====================================================
-- View 4: v_project_quality_metrics (CORE PHASE 1 VIEW)
-- Purpose: Project-level quality metrics dashboard
-- =====================================================

CREATE OR REPLACE VIEW v_project_quality_metrics AS
WITH latest_date AS (
    -- Get most recent execution date per project
    SELECT
        project_id,
        MAX(executed_at) AS latest_execution_date
    FROM test_result
    WHERE deleted_at IS NULL
    GROUP BY project_id
),
latest_results AS (
    -- Get all results from the latest execution date
    SELECT
        tr.project_id,
        tr.test_case_id,
        tr.status,
        tr.executed_at
    FROM test_result tr
    INNER JOIN latest_date ld
        ON tr.project_id = ld.project_id
        AND tr.executed_at = ld.latest_execution_date
    WHERE tr.deleted_at IS NULL
)
SELECT
    p.id AS project_id,
    p.name AS project_name,
    p.status AS project_status,

    -- Latest execution date
    ld.latest_execution_date,
    CURRENT_DATE - ld.latest_execution_date AS days_since_latest_execution,

    -- Total unique test cases (all time)
    (SELECT COUNT(DISTINCT test_case_id)
     FROM test_result
     WHERE project_id = p.id AND deleted_at IS NULL) AS total_test_cases,

    -- Latest execution metrics
    COUNT(DISTINCT lr.test_case_id) AS latest_tests_executed,
    COUNT(*) FILTER (WHERE lr.status = 'passed') AS latest_passed_count,
    COUNT(*) FILTER (WHERE lr.status = 'failed') AS latest_failed_count,
    COUNT(*) FILTER (WHERE lr.status = 'not_run') AS latest_not_run_count,
    COUNT(*) FILTER (WHERE lr.status = 'blocked') AS latest_blocked_count,
    COUNT(*) FILTER (WHERE lr.status = 'rejected') AS latest_rejected_count,

    -- Pass Rate (latest execution only)
    CASE
        WHEN COUNT(*) > 0 THEN
            ROUND((COUNT(*) FILTER (WHERE lr.status = 'passed')::NUMERIC / COUNT(*)::NUMERIC) * 100, 2)
        ELSE 0
    END AS latest_pass_rate_pct,

    -- Not Run Percentage (latest execution only)
    CASE
        WHEN COUNT(*) > 0 THEN
            ROUND((COUNT(*) FILTER (WHERE lr.status = 'not_run')::NUMERIC / COUNT(*)::NUMERIC) * 100, 2)
        ELSE 0
    END AS latest_not_run_pct,

    -- Fail Rate (latest execution only)
    CASE
        WHEN COUNT(*) > 0 THEN
            ROUND((COUNT(*) FILTER (WHERE lr.status = 'failed')::NUMERIC / COUNT(*)::NUMERIC) * 100, 2)
        ELSE 0
    END AS latest_fail_rate_pct,

    -- Task Coverage (tasks with test results vs total tasks)
    COALESCE(
        (SELECT COUNT(DISTINCT t.id)
         FROM tasks t
         WHERE t.project_id = p.id
           AND t.deleted_at IS NULL
           AND EXISTS (
               SELECT 1 FROM test_result tr
               WHERE tr.project_id = p.id
                 AND tr.deleted_at IS NULL
           )),
        0
    ) AS tasks_with_tests,

    (SELECT COUNT(*)
     FROM tasks
     WHERE project_id = p.id AND deleted_at IS NULL) AS total_tasks,

    -- Test Coverage Percentage
    CASE
        WHEN (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND deleted_at IS NULL) > 0 THEN
            ROUND(
                (COALESCE(
                    (SELECT COUNT(DISTINCT t.id)
                     FROM tasks t
                     WHERE t.project_id = p.id
                       AND t.deleted_at IS NULL
                       AND EXISTS (
                           SELECT 1 FROM test_result tr
                           WHERE tr.project_id = p.id
                             AND tr.deleted_at IS NULL
                       )),
                    0
                )::NUMERIC /
                (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND deleted_at IS NULL)::NUMERIC) * 100,
                2
            )
        ELSE 0
    END AS test_coverage_pct

FROM projects p
LEFT JOIN latest_date ld ON p.id = ld.project_id
LEFT JOIN latest_results lr ON p.id = lr.project_id
WHERE p.deleted_at IS NULL
GROUP BY p.id, p.name, p.status, ld.latest_execution_date;

COMMENT ON VIEW v_project_quality_metrics IS 'Core Phase 1 metrics: pass rates, coverage, execution freshness per project';

-- =====================================================
-- Verification
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Phase 1 Views Migration Complete!';
    RAISE NOTICE '   - v_latest_test_results: Latest result per test case';
    RAISE NOTICE '   - v_test_case_history: Historical aggregation & pass rates';
    RAISE NOTICE '   - v_test_execution_trends: Daily trends for charting';
    RAISE NOTICE '   - v_project_quality_metrics: Core project-level metrics';
    RAISE NOTICE '';
    RAISE NOTICE 'Phase 1 Views: READY FOR PHASE 2';
END $$;

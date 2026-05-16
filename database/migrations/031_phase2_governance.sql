-- Phase 2: Governance Dashboard & Reporting
-- Database Migration
-- Date: 2026-01-21
-- Purpose: Create views and structures for governance dashboard, release readiness, and risk indicators

-- =============================================================================
-- CLEANUP: Drop existing Phase 2 views if they exist
-- =============================================================================

DROP VIEW IF EXISTS v_release_readiness CASCADE;
DROP VIEW IF EXISTS v_quality_risks CASCADE;
DROP VIEW IF EXISTS v_workload_balance CASCADE;
DROP VIEW IF EXISTS v_project_health_summary CASCADE;

-- =============================================================================
-- VIEW 1: Release Readiness Assessment
-- =============================================================================
-- Purpose: Determine if a project is ready for release based on quality gates
-- Status: GREEN (ready), AMBER (review needed), RED (not ready)

CREATE OR REPLACE VIEW v_release_readiness AS
SELECT
    p.id AS project_id,
    p.name AS project_name,
    p.status AS project_status,

    -- Quality Metrics
    COALESCE(m.latest_pass_rate_pct, 0) AS latest_pass_rate_pct,
    COALESCE(m.latest_not_run_pct, 0) AS latest_not_run_pct,
    COALESCE(m.latest_failed_count, 0) AS latest_failed_count,
    COALESCE(m.latest_fail_rate_pct, 0) AS latest_fail_rate_pct,
    COALESCE(m.days_since_latest_execution, 999) AS days_since_latest_execution,
    COALESCE(m.total_test_cases, 0) AS total_test_cases,
    COALESCE(m.latest_tests_executed, 0) AS latest_tests_executed,
    COALESCE(m.latest_passed_count, 0) AS latest_passed_count,
    m.latest_execution_date,

    -- Release Readiness Status
    CASE
        -- GREEN: Ready to Release
        WHEN m.latest_pass_rate_pct >= 95
         AND m.latest_not_run_pct <= 5
         AND m.days_since_latest_execution <= 3
         AND m.latest_failed_count = 0
         AND m.total_test_cases > 0
        THEN 'GREEN'

        -- AMBER: Needs Review
        WHEN m.latest_pass_rate_pct >= 80
         AND m.latest_not_run_pct <= 15
         AND m.days_since_latest_execution <= 7
         AND m.latest_failed_count <= 5
         AND m.total_test_cases > 0
        THEN 'AMBER'

        -- RED: Not Ready
        WHEN m.total_test_cases > 0
        THEN 'RED'

        -- UNKNOWN: No test data
        ELSE 'UNKNOWN'
    END AS readiness_status,

    -- Blocking Issues
    ARRAY_REMOVE(ARRAY[
        CASE WHEN m.total_test_cases = 0 THEN 'No tests defined' END,
        CASE WHEN m.latest_pass_rate_pct < 95 AND m.total_test_cases > 0 THEN 'Low pass rate (' || ROUND(m.latest_pass_rate_pct, 1) || '%)' END,
        CASE WHEN m.latest_not_run_pct > 5 AND m.total_test_cases > 0 THEN 'Tests not executed (' || ROUND(m.latest_not_run_pct, 1) || '%)' END,
        CASE WHEN m.days_since_latest_execution > 3 AND m.total_test_cases > 0 THEN 'Stale results (' || m.days_since_latest_execution || ' days old)' END,
        CASE WHEN m.latest_failed_count > 0 THEN m.latest_failed_count || ' failing test(s)' END
    ], NULL) AS blocking_issues,

    -- Count of blocking issues
    ARRAY_LENGTH(ARRAY_REMOVE(ARRAY[
        CASE WHEN m.total_test_cases = 0 THEN 1 END,
        CASE WHEN m.latest_pass_rate_pct < 95 AND m.total_test_cases > 0 THEN 1 END,
        CASE WHEN m.latest_not_run_pct > 5 AND m.total_test_cases > 0 THEN 1 END,
        CASE WHEN m.days_since_latest_execution > 3 AND m.total_test_cases > 0 THEN 1 END,
        CASE WHEN m.latest_failed_count > 0 THEN 1 END
    ], NULL), 1) AS blocking_issue_count,

    -- Recommendation
    CASE
        WHEN m.total_test_cases = 0
        THEN 'Define and execute tests before considering release.'

        WHEN m.latest_pass_rate_pct >= 95
         AND m.latest_not_run_pct <= 5
         AND m.days_since_latest_execution <= 3
         AND m.latest_failed_count = 0
        THEN 'All quality gates passed. Project is ready for release.'

        WHEN m.latest_pass_rate_pct >= 80
         AND m.latest_not_run_pct <= 15
         AND m.days_since_latest_execution <= 7
        THEN 'Some quality concerns exist. Review blocking issues and consider risk before release.'

        ELSE 'Critical quality gates failed. Not recommended for release until issues are resolved.'
    END AS recommendation,

    -- Timestamps
    p.created_at,
    p.updated_at

FROM projects p
LEFT JOIN v_project_quality_metrics m ON p.id = m.project_id
WHERE p.deleted_at IS NULL
ORDER BY p.name;

-- =============================================================================
-- VIEW 2: Quality Risk Assessment
-- =============================================================================
-- Purpose: Identify projects with quality risks based on trends and thresholds
-- Risk Levels: CRITICAL, WARNING, NORMAL

CREATE OR REPLACE VIEW v_quality_risks AS
WITH trend_comparison AS (
    -- Compare recent week vs previous week
    SELECT
        project_id,
        AVG(CASE
            WHEN execution_date >= CURRENT_DATE - INTERVAL '7 days'
            THEN (passed_count::FLOAT / NULLIF(tests_executed, 0) * 100)
        END) AS recent_pass_rate,
        AVG(CASE
            WHEN execution_date >= CURRENT_DATE - INTERVAL '14 days'
             AND execution_date < CURRENT_DATE - INTERVAL '7 days'
            THEN (passed_count::FLOAT / NULLIF(tests_executed, 0) * 100)
        END) AS previous_pass_rate,
        COUNT(CASE
            WHEN execution_date >= CURRENT_DATE - INTERVAL '7 days'
            THEN 1
        END) AS recent_execution_days,
        COUNT(CASE
            WHEN execution_date >= CURRENT_DATE - INTERVAL '14 days'
             AND execution_date < CURRENT_DATE - INTERVAL '7 days'
            THEN 1
        END) AS previous_execution_days
    FROM v_test_execution_trends
    GROUP BY project_id
)
SELECT
    p.id AS project_id,
    p.name AS project_name,
    p.status AS project_status,

    -- Current Metrics
    COALESCE(m.latest_pass_rate_pct, 0) AS latest_pass_rate_pct,
    COALESCE(m.latest_not_run_pct, 0) AS latest_not_run_pct,
    COALESCE(m.latest_failed_count, 0) AS latest_failed_count,
    COALESCE(m.days_since_latest_execution, 999) AS days_since_latest_execution,
    COALESCE(m.total_test_cases, 0) AS total_test_cases,

    -- Trend Data
    COALESCE(tc.recent_pass_rate, 0) AS recent_pass_rate,
    COALESCE(tc.previous_pass_rate, 0) AS previous_pass_rate,
    COALESCE(tc.recent_pass_rate - tc.previous_pass_rate, 0) AS pass_rate_change,
    COALESCE(tc.recent_execution_days, 0) AS recent_execution_days,

    -- Risk Flags
    ARRAY_REMOVE(ARRAY[
        CASE WHEN m.latest_pass_rate_pct < 80 AND m.total_test_cases > 0 THEN 'LOW_PASS_RATE' END,
        CASE WHEN m.latest_not_run_pct > 20 AND m.total_test_cases > 0 THEN 'HIGH_NOT_RUN' END,
        CASE WHEN m.days_since_latest_execution > 14 AND m.total_test_cases > 0 THEN 'STALE_TESTS' END,
        CASE WHEN m.latest_failed_count > 10 THEN 'HIGH_FAILURE_COUNT' END,
        CASE WHEN COALESCE(tc.recent_pass_rate - tc.previous_pass_rate, 0) < -10 THEN 'DECLINING_TREND' END,
        CASE WHEN m.total_test_cases = 0 THEN 'NO_TESTS' END
    ], NULL) AS risk_flags,

    -- Risk Flag Count
    ARRAY_LENGTH(ARRAY_REMOVE(ARRAY[
        CASE WHEN m.latest_pass_rate_pct < 80 AND m.total_test_cases > 0 THEN 1 END,
        CASE WHEN m.latest_not_run_pct > 20 AND m.total_test_cases > 0 THEN 1 END,
        CASE WHEN m.days_since_latest_execution > 14 AND m.total_test_cases > 0 THEN 1 END,
        CASE WHEN m.latest_failed_count > 10 THEN 1 END,
        CASE WHEN COALESCE(tc.recent_pass_rate - tc.previous_pass_rate, 0) < -10 THEN 1 END,
        CASE WHEN m.total_test_cases = 0 THEN 1 END
    ], NULL), 1) AS risk_flag_count,

    -- Overall Risk Level
    CASE
        WHEN m.total_test_cases = 0 THEN 'WARNING'
        WHEN ARRAY_LENGTH(ARRAY_REMOVE(ARRAY[
            CASE WHEN m.latest_pass_rate_pct < 80 THEN 1 END,
            CASE WHEN m.latest_not_run_pct > 20 THEN 1 END,
            CASE WHEN m.days_since_latest_execution > 14 THEN 1 END,
            CASE WHEN m.latest_failed_count > 10 THEN 1 END,
            CASE WHEN COALESCE(tc.recent_pass_rate - tc.previous_pass_rate, 0) < -10 THEN 1 END
        ], NULL), 1) >= 3 THEN 'CRITICAL'
        WHEN ARRAY_LENGTH(ARRAY_REMOVE(ARRAY[
            CASE WHEN m.latest_pass_rate_pct < 80 THEN 1 END,
            CASE WHEN m.latest_not_run_pct > 20 THEN 1 END,
            CASE WHEN m.days_since_latest_execution > 14 THEN 1 END,
            CASE WHEN m.latest_failed_count > 10 THEN 1 END,
            CASE WHEN COALESCE(tc.recent_pass_rate - tc.previous_pass_rate, 0) < -10 THEN 1 END
        ], NULL), 1) >= 1 THEN 'WARNING'
        ELSE 'NORMAL'
    END AS risk_level

FROM projects p
LEFT JOIN v_project_quality_metrics m ON p.id = m.project_id
LEFT JOIN trend_comparison tc ON p.id = tc.project_id
WHERE p.deleted_at IS NULL
ORDER BY
    CASE
        WHEN ARRAY_LENGTH(ARRAY_REMOVE(ARRAY[
            CASE WHEN m.latest_pass_rate_pct < 80 THEN 1 END,
            CASE WHEN m.latest_not_run_pct > 20 THEN 1 END,
            CASE WHEN m.days_since_latest_execution > 14 THEN 1 END,
            CASE WHEN m.latest_failed_count > 10 THEN 1 END,
            CASE WHEN COALESCE(tc.recent_pass_rate - tc.previous_pass_rate, 0) < -10 THEN 1 END
        ], NULL), 1) >= 3 THEN 1
        WHEN ARRAY_LENGTH(ARRAY_REMOVE(ARRAY[
            CASE WHEN m.latest_pass_rate_pct < 80 THEN 1 END,
            CASE WHEN m.latest_not_run_pct > 20 THEN 1 END,
            CASE WHEN m.days_since_latest_execution > 14 THEN 1 END,
            CASE WHEN m.latest_failed_count > 10 THEN 1 END,
            CASE WHEN COALESCE(tc.recent_pass_rate - tc.previous_pass_rate, 0) < -10 THEN 1 END
        ], NULL), 1) >= 1 THEN 2
        ELSE 3
    END,
    p.name;

-- =============================================================================
-- VIEW 3: Workload Balance
-- =============================================================================
-- Purpose: Compare test coverage vs task/workload balance

CREATE OR REPLACE VIEW v_workload_balance AS
SELECT
    p.id AS project_id,
    p.name AS project_name,
    p.status AS project_status,

    -- Task Metrics
    COUNT(DISTINCT t.id) AS total_tasks,
    COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'Done') AS completed_tasks,
    COUNT(DISTINCT t.id) FILTER (WHERE t.status != 'Done') AS pending_tasks,
    ROUND(
        COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'Done')::NUMERIC
        / NULLIF(COUNT(DISTINCT t.id), 0) * 100,
        2
    ) AS task_completion_pct,

    -- Test Metrics
    COUNT(DISTINCT tr.test_case_id) AS total_tests,
    COUNT(DISTINCT tr.test_case_id) FILTER (WHERE tr.status = 'passed') AS passed_tests,
    COUNT(DISTINCT tr.test_case_id) FILTER (WHERE tr.status = 'failed') AS failed_tests,

    -- Ratios
    ROUND(
        COUNT(DISTINCT tr.test_case_id)::NUMERIC
        / NULLIF(COUNT(DISTINCT t.id), 0),
        2
    ) AS tests_per_task_ratio,

    -- Balance Assessment
    CASE
        WHEN COUNT(DISTINCT t.id) = 0 THEN 'NO_TASKS'
        WHEN COUNT(DISTINCT tr.test_case_id) = 0 THEN 'NO_TESTS'
        WHEN COUNT(DISTINCT tr.test_case_id)::NUMERIC / COUNT(DISTINCT t.id) >= 2 THEN 'OVER_TESTED'
        WHEN COUNT(DISTINCT tr.test_case_id)::NUMERIC / COUNT(DISTINCT t.id) >= 0.5 THEN 'BALANCED'
        ELSE 'UNDER_TESTED'
    END AS balance_status,

    -- Resource Allocation Indicator
    CASE
        WHEN COUNT(DISTINCT t.id) > 50 AND COUNT(DISTINCT tr.test_case_id) < 10 THEN 'HIGH_WORKLOAD_LOW_COVERAGE'
        WHEN COUNT(DISTINCT t.id) FILTER (WHERE t.status != 'Done') > 20
         AND COUNT(DISTINCT tr.test_case_id) FILTER (WHERE tr.status = 'passed') < 10
        THEN 'BACKLOG_RISK'
        ELSE 'NORMAL'
    END AS resource_indicator

FROM projects p
LEFT JOIN tasks t ON p.id = t.project_id AND t.deleted_at IS NULL
LEFT JOIN test_result tr ON p.id = tr.project_id AND tr.deleted_at IS NULL
WHERE p.deleted_at IS NULL
GROUP BY p.id, p.name, p.status
ORDER BY p.name;

-- =============================================================================
-- VIEW 4: Project Health Summary (Combined)
-- =============================================================================
-- Purpose: Combined view for project health cards on dashboard

CREATE OR REPLACE VIEW v_project_health_summary AS
SELECT
    p.id AS project_id,
    p.name AS project_name,
    p.status AS project_status,
    p.priority,
    p.start_date,
    p.target_date,

    -- Quality Metrics
    m.total_test_cases,
    m.latest_pass_rate_pct,
    m.latest_failed_count,
    m.days_since_latest_execution,
    m.latest_execution_date,

    -- Release Readiness
    rr.readiness_status,
    rr.blocking_issue_count,
    rr.recommendation,

    -- Risk Assessment
    qr.risk_level,
    qr.risk_flag_count,
    qr.risk_flags,
    qr.pass_rate_change,

    -- Workload Balance
    wb.total_tasks,
    wb.completed_tasks,
    wb.total_tests,
    wb.tests_per_task_ratio,
    wb.balance_status,

    -- Overall Health RAG Status
    CASE
        WHEN rr.readiness_status = 'GREEN' AND qr.risk_level = 'NORMAL' THEN 'GREEN'
        WHEN rr.readiness_status = 'RED' OR qr.risk_level = 'CRITICAL' THEN 'RED'
        ELSE 'AMBER'
    END AS overall_health_status,

    -- Action Items
    ARRAY_REMOVE(ARRAY[
        CASE WHEN m.total_test_cases = 0 THEN 'Create tests' END,
        CASE WHEN m.days_since_latest_execution > 7 THEN 'Execute tests' END,
        CASE WHEN m.latest_failed_count > 0 THEN 'Fix failing tests' END,
        CASE WHEN qr.pass_rate_change < -10 THEN 'Investigate declining quality' END,
        CASE WHEN wb.balance_status = 'UNDER_TESTED' THEN 'Improve test coverage' END
    ], NULL) AS action_items

FROM projects p
LEFT JOIN v_project_quality_metrics m ON p.id = m.project_id
LEFT JOIN v_release_readiness rr ON p.id = rr.project_id
LEFT JOIN v_quality_risks qr ON p.id = qr.project_id
LEFT JOIN v_workload_balance wb ON p.id = wb.project_id
WHERE p.deleted_at IS NULL
ORDER BY
    CASE
        WHEN rr.readiness_status = 'RED' OR qr.risk_level = 'CRITICAL' THEN 1
        WHEN rr.readiness_status = 'AMBER' OR qr.risk_level = 'WARNING' THEN 2
        ELSE 3
    END,
    p.name;

-- =============================================================================
-- INDEXES: Performance optimization
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_test_result_status
    ON test_result(status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_projects_status
    ON projects(status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_status
    ON tasks(status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_test_result_project_status
    ON test_result(project_id, status)
    WHERE deleted_at IS NULL;

-- =============================================================================
-- COMMENTS: Documentation
-- =============================================================================

COMMENT ON VIEW v_release_readiness IS
'Release readiness assessment for all projects. Status: GREEN (ready), AMBER (review needed), RED (not ready)';

COMMENT ON VIEW v_quality_risks IS
'Quality risk assessment with trend analysis. Risk levels: CRITICAL, WARNING, NORMAL';

COMMENT ON VIEW v_workload_balance IS
'Workload balance between tasks and test coverage. Helps identify under-tested projects';

COMMENT ON VIEW v_project_health_summary IS
'Combined health summary for dashboard widgets. Includes quality, readiness, risk, and workload metrics';

-- =============================================================================
-- VERIFICATION: Test the views
-- =============================================================================

-- Verify views were created
SELECT 'Phase 2 governance views created successfully' AS result;

-- Quick test query
SELECT
    'View Test Results' AS test_name,
    COUNT(*) FILTER (WHERE view_name = 'v_release_readiness') AS release_readiness,
    COUNT(*) FILTER (WHERE view_name = 'v_quality_risks') AS quality_risks,
    COUNT(*) FILTER (WHERE view_name = 'v_workload_balance') AS workload_balance,
    COUNT(*) FILTER (WHERE view_name = 'v_project_health_summary') AS health_summary
FROM (
    SELECT 'v_release_readiness' AS view_name
    UNION ALL SELECT 'v_quality_risks'
    UNION ALL SELECT 'v_workload_balance'
    UNION ALL SELECT 'v_project_health_summary'
) AS views
WHERE EXISTS (
    SELECT 1
    FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name = views.view_name
);

-- Sample data queries
SELECT 'Sample: Release Readiness' AS query_type, COUNT(*) AS project_count
FROM v_release_readiness;

SELECT 'Sample: Quality Risks' AS query_type, COUNT(*) AS project_count
FROM v_quality_risks;

SELECT 'Sample: Project Health' AS query_type, COUNT(*) AS project_count
FROM v_project_health_summary;

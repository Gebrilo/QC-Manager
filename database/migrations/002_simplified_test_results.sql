-- Migration: Simplified Test Results System
-- Focus: Direct upload of test results via Excel
-- No test runs needed - just test case ID + status + date
-- Created: 2026-01-21

-- ==============================================================================
-- DROP PREVIOUS COMPLEX STRUCTURE (if exists)
-- ==============================================================================

DROP VIEW IF EXISTS v_project_quality_metrics CASCADE;
DROP VIEW IF EXISTS v_test_case_summary CASCADE;
DROP VIEW IF EXISTS v_test_case_latest_execution CASCADE;

DROP TABLE IF EXISTS test_execution CASCADE;
DROP TABLE IF EXISTS test_run CASCADE;
DROP TABLE IF EXISTS test_case CASCADE;

DROP TYPE IF EXISTS execution_status CASCADE;
DROP TYPE IF EXISTS test_case_status CASCADE;
DROP TYPE IF EXISTS test_priority CASCADE;
DROP TYPE IF EXISTS test_category CASCADE;

-- ==============================================================================
-- SIMPLIFIED TEST RESULTS TABLE
-- ==============================================================================

-- Execution Status for test results
CREATE TYPE execution_status AS ENUM ('passed', 'failed', 'not_run', 'blocked', 'rejected');

-- Simple test results table
-- Each row represents a test execution result from Excel upload
CREATE TABLE test_result (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Test Identification
    test_case_id VARCHAR(100) NOT NULL, -- From Excel: e.g., TC-001, TEST-LOGIN, etc.
    test_case_title VARCHAR(500), -- Optional description from Excel

    -- Linking to Project
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    -- Execution Result
    status execution_status NOT NULL,

    -- When was this test executed
    executed_at DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Optional fields from Excel
    notes TEXT, -- Any comments/failure reasons
    tester_name VARCHAR(200), -- Who executed the test

    -- Upload tracking
    upload_batch_id UUID, -- Groups results from same Excel upload
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Soft Delete
    deleted_at TIMESTAMP WITH TIME ZONE,

    -- Prevent exact duplicates (same test, same date, same project)
    CONSTRAINT unique_test_result_per_day UNIQUE(test_case_id, project_id, executed_at, deleted_at)
);

-- Indexes for performance
CREATE INDEX idx_test_result_project_id ON test_result(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_test_result_test_case_id ON test_result(test_case_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_test_result_status ON test_result(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_test_result_executed_at ON test_result(executed_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_test_result_upload_batch ON test_result(upload_batch_id) WHERE deleted_at IS NULL;

-- Auto-update timestamp
CREATE TRIGGER update_test_result_updated_at
    BEFORE UPDATE ON test_result
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- VIEWS FOR REPORTING & METRICS
-- ==============================================================================

-- Latest result for each test case per project
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
    -- Days since execution
    CURRENT_DATE - tr.executed_at AS days_since_execution
FROM test_result tr
LEFT JOIN projects p ON tr.project_id = p.id
WHERE tr.deleted_at IS NULL
ORDER BY tr.project_id, tr.test_case_id, tr.executed_at DESC, tr.created_at DESC;

-- Test case execution history summary
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

-- Project-level quality metrics (latest execution cycle only)
CREATE OR REPLACE VIEW v_project_quality_metrics AS
WITH latest_date AS (
    -- Get the most recent execution date per project
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

-- Historical trend by date (for charts)
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
    END AS daily_pass_rate_pct

FROM test_result tr
LEFT JOIN projects p ON tr.project_id = p.id
WHERE tr.deleted_at IS NULL
GROUP BY tr.project_id, p.name, tr.executed_at
ORDER BY tr.project_id, tr.executed_at DESC;

-- ==============================================================================
-- SAMPLE DATA
-- ==============================================================================

-- Sample test results (linked to existing Q1 Quality Audit project)
INSERT INTO test_result (test_case_id, test_case_title, project_id, status, executed_at, notes, tester_name, upload_batch_id)
SELECT
    'TC-001',
    'Login with valid credentials',
    p.id,
    'passed',
    CURRENT_DATE - INTERVAL '1 day',
    'All checks passed',
    'John Doe',
    gen_random_uuid()
FROM projects p
WHERE p.name = 'Q1 Quality Audit'
  AND NOT EXISTS (
      SELECT 1 FROM test_result
      WHERE test_case_id = 'TC-001'
        AND project_id = p.id
        AND executed_at = CURRENT_DATE - INTERVAL '1 day'
  )
LIMIT 1;

INSERT INTO test_result (test_case_id, test_case_title, project_id, status, executed_at, notes, tester_name, upload_batch_id)
SELECT
    'TC-002',
    'Dashboard load performance',
    p.id,
    'failed',
    CURRENT_DATE - INTERVAL '1 day',
    'Load time exceeded 3 seconds',
    'John Doe',
    (SELECT upload_batch_id FROM test_result WHERE test_case_id = 'TC-001' AND project_id = p.id LIMIT 1)
FROM projects p
WHERE p.name = 'Q1 Quality Audit'
  AND NOT EXISTS (
      SELECT 1 FROM test_result
      WHERE test_case_id = 'TC-002'
        AND project_id = p.id
        AND executed_at = CURRENT_DATE - INTERVAL '1 day'
  )
LIMIT 1;

INSERT INTO test_result (test_case_id, test_case_title, project_id, status, executed_at, notes, tester_name, upload_batch_id)
SELECT
    'TC-003',
    'User logout functionality',
    p.id,
    'passed',
    CURRENT_DATE - INTERVAL '1 day',
    'Session cleared successfully',
    'Jane Smith',
    (SELECT upload_batch_id FROM test_result WHERE test_case_id = 'TC-001' AND project_id = p.id LIMIT 1)
FROM projects p
WHERE p.name = 'Q1 Quality Audit'
  AND NOT EXISTS (
      SELECT 1 FROM test_result
      WHERE test_case_id = 'TC-003'
        AND project_id = p.id
        AND executed_at = CURRENT_DATE - INTERVAL '1 day'
  )
LIMIT 1;

INSERT INTO test_result (test_case_id, test_case_title, project_id, status, executed_at, notes, tester_name, upload_batch_id)
SELECT
    'TC-004',
    'API endpoint security',
    p.id,
    'blocked',
    CURRENT_DATE - INTERVAL '1 day',
    'Waiting for security team review',
    'Jane Smith',
    (SELECT upload_batch_id FROM test_result WHERE test_case_id = 'TC-001' AND project_id = p.id LIMIT 1)
FROM projects p
WHERE p.name = 'Q1 Quality Audit'
  AND NOT EXISTS (
      SELECT 1 FROM test_result
      WHERE test_case_id = 'TC-004'
        AND project_id = p.id
        AND executed_at = CURRENT_DATE - INTERVAL '1 day'
  )
LIMIT 1;

-- Sample older results for trending
INSERT INTO test_result (test_case_id, test_case_title, project_id, status, executed_at, notes, upload_batch_id)
SELECT
    'TC-001',
    'Login with valid credentials',
    p.id,
    'passed',
    CURRENT_DATE - INTERVAL '7 days',
    'Previous sprint test',
    gen_random_uuid()
FROM projects p
WHERE p.name = 'Q1 Quality Audit'
  AND NOT EXISTS (
      SELECT 1 FROM test_result
      WHERE test_case_id = 'TC-001'
        AND project_id = p.id
        AND executed_at = CURRENT_DATE - INTERVAL '7 days'
  )
LIMIT 1;

-- ==============================================================================
-- COMMENTS
-- ==============================================================================

COMMENT ON TABLE test_result IS 'Simplified test execution results - uploaded via Excel with test case ID and status';
COMMENT ON VIEW v_latest_test_results IS 'Latest result for each test case per project';
COMMENT ON VIEW v_test_case_history IS 'Historical summary of each test case execution';
COMMENT ON VIEW v_project_quality_metrics IS 'Project-level quality metrics based on latest execution date';
COMMENT ON VIEW v_test_execution_trends IS 'Daily execution trends for charting (pass rate over time)';

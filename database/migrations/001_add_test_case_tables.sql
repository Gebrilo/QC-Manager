-- Migration: Add Test Case Registry and Execution Logging Tables
-- Phase 1: Quality Data Foundation (MVP)
-- Created: 2026-01-21

-- ==============================================================================
-- TEST CASE REGISTRY
-- ==============================================================================

-- Test Case Categories/Types
CREATE TYPE test_category AS ENUM ('smoke', 'regression', 'e2e', 'integration', 'unit', 'performance', 'security', 'other');

-- Test Case Priority (separate from task priority for flexibility)
CREATE TYPE test_priority AS ENUM ('low', 'medium', 'high', 'critical');

-- Test Case Status
CREATE TYPE test_case_status AS ENUM ('active', 'archived', 'draft', 'deprecated');

-- Main Test Case Table
CREATE TABLE test_case (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_case_id VARCHAR(50) UNIQUE NOT NULL, -- Display ID: TC-0001, TC-0002, etc.

    -- Basic Information
    title VARCHAR(500) NOT NULL,
    description TEXT,

    -- Linking & Organization
    task_id UUID REFERENCES task(id) ON DELETE SET NULL, -- Optional link to task
    project_id UUID REFERENCES project(id) ON DELETE CASCADE, -- Link to project

    -- Classification
    category test_category NOT NULL DEFAULT 'other',
    priority test_priority NOT NULL DEFAULT 'medium',
    tags TEXT[], -- Array of tags for flexible categorization

    -- Status & Lifecycle
    status test_case_status NOT NULL DEFAULT 'active',

    -- Metadata
    created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
    last_modified_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    archived_at TIMESTAMP WITH TIME ZONE,

    -- Soft Delete Support
    deleted_at TIMESTAMP WITH TIME ZONE,

    -- Full text search support
    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(test_case_id, '')), 'A')
    ) STORED
);

-- Indexes for Test Cases
CREATE INDEX idx_test_case_project_id ON test_case(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_test_case_task_id ON test_case(task_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_test_case_status ON test_case(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_test_case_category ON test_case(category) WHERE deleted_at IS NULL;
CREATE INDEX idx_test_case_priority ON test_case(priority) WHERE deleted_at IS NULL;
CREATE INDEX idx_test_case_created_at ON test_case(created_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_test_case_search ON test_case USING GIN(search_vector);
CREATE INDEX idx_test_case_tags ON test_case USING GIN(tags) WHERE deleted_at IS NULL;

-- Auto-update timestamp trigger for test_case
CREATE TRIGGER update_test_case_updated_at
    BEFORE UPDATE ON test_case
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- TEST EXECUTION LOGGING
-- ==============================================================================

-- Test Run (grouping executions into cycles/releases)
CREATE TABLE test_run (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id VARCHAR(50) UNIQUE NOT NULL, -- Display ID: RUN-0001, RUN-0002, etc.

    -- Run Information
    name VARCHAR(200) NOT NULL, -- e.g., "Release 1.0 - Smoke Tests"
    description TEXT,

    -- Linking
    project_id UUID REFERENCES project(id) ON DELETE CASCADE,

    -- Run Status
    status VARCHAR(50) NOT NULL DEFAULT 'in_progress', -- in_progress, completed, aborted

    -- Timing
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,

    -- Metadata
    created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Soft Delete Support
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for Test Runs
CREATE INDEX idx_test_run_project_id ON test_run(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_test_run_status ON test_run(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_test_run_started_at ON test_run(started_at) WHERE deleted_at IS NULL;

-- Auto-update timestamp trigger for test_run
CREATE TRIGGER update_test_run_updated_at
    BEFORE UPDATE ON test_run
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Test Execution Results
CREATE TYPE execution_status AS ENUM ('pass', 'fail', 'not_run', 'blocked', 'skipped');

CREATE TABLE test_execution (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Linking
    test_case_id UUID NOT NULL REFERENCES test_case(id) ON DELETE CASCADE,
    test_run_id UUID NOT NULL REFERENCES test_run(id) ON DELETE CASCADE,

    -- Execution Result
    status execution_status NOT NULL,

    -- Details
    notes TEXT, -- Failure reason, observations, etc.
    executed_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Duration (optional, in seconds)
    duration_seconds INTEGER,

    -- Defect Linking (for Phase 3, but schema ready now)
    defect_ids TEXT[], -- Array of external defect IDs (e.g., ["JIRA-123", "BUG-456"])

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Prevent duplicate executions in same run
    CONSTRAINT unique_execution_per_run UNIQUE(test_case_id, test_run_id)
);

-- Indexes for Test Executions
CREATE INDEX idx_test_execution_test_case_id ON test_execution(test_case_id);
CREATE INDEX idx_test_execution_test_run_id ON test_execution(test_run_id);
CREATE INDEX idx_test_execution_status ON test_execution(status);
CREATE INDEX idx_test_execution_executed_at ON test_execution(executed_at);
CREATE INDEX idx_test_execution_executed_by ON test_execution(executed_by);

-- Auto-update timestamp trigger for test_execution
CREATE TRIGGER update_test_execution_updated_at
    BEFORE UPDATE ON test_execution
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- VIEWS FOR QUALITY METRICS
-- ==============================================================================

-- View: Latest Execution Status per Test Case
CREATE OR REPLACE VIEW v_test_case_latest_execution AS
SELECT DISTINCT ON (te.test_case_id)
    te.test_case_id,
    te.id AS execution_id,
    te.status AS latest_status,
    te.executed_at AS latest_execution_date,
    te.test_run_id,
    tr.name AS test_run_name,
    te.executed_by,
    u.name AS executed_by_name
FROM test_execution te
LEFT JOIN test_run tr ON te.test_run_id = tr.id
LEFT JOIN app_user u ON te.executed_by = u.id
ORDER BY te.test_case_id, te.executed_at DESC;

-- View: Test Case Summary with Metrics
CREATE OR REPLACE VIEW v_test_case_summary AS
SELECT
    tc.id,
    tc.test_case_id,
    tc.title,
    tc.description,
    tc.category,
    tc.priority,
    tc.status,
    tc.project_id,
    p.name AS project_name,
    tc.task_id,
    t.name AS task_name,
    tc.tags,
    tc.created_at,
    tc.updated_at,

    -- Latest execution info
    le.latest_status,
    le.latest_execution_date,
    le.test_run_name AS latest_test_run,

    -- Execution freshness (days since last run)
    CASE
        WHEN le.latest_execution_date IS NULL THEN NULL
        ELSE EXTRACT(DAY FROM (CURRENT_TIMESTAMP - le.latest_execution_date))::INTEGER
    END AS days_since_last_run,

    -- Total execution count
    (SELECT COUNT(*) FROM test_execution WHERE test_case_id = tc.id) AS total_executions,

    -- Pass/Fail counts
    (SELECT COUNT(*) FROM test_execution WHERE test_case_id = tc.id AND status = 'pass') AS pass_count,
    (SELECT COUNT(*) FROM test_execution WHERE test_case_id = tc.id AND status = 'fail') AS fail_count,
    (SELECT COUNT(*) FROM test_execution WHERE test_case_id = tc.id AND status = 'blocked') AS blocked_count,
    (SELECT COUNT(*) FROM test_execution WHERE test_case_id = tc.id AND status = 'not_run') AS not_run_count

FROM test_case tc
LEFT JOIN project p ON tc.project_id = p.id
LEFT JOIN task t ON tc.task_id = t.id
LEFT JOIN v_test_case_latest_execution le ON tc.id = le.test_case_id
WHERE tc.deleted_at IS NULL;

-- View: Project Quality Metrics
CREATE OR REPLACE VIEW v_project_quality_metrics AS
SELECT
    p.id AS project_id,
    p.name AS project_name,
    p.status AS project_status,

    -- Test Case Counts
    COUNT(DISTINCT tc.id) FILTER (WHERE tc.status = 'active') AS active_test_cases,
    COUNT(DISTINCT tc.id) AS total_test_cases,

    -- Task Coverage
    COUNT(DISTINCT t.id) AS total_tasks,
    COUNT(DISTINCT tc.task_id) FILTER (WHERE tc.task_id IS NOT NULL) AS tasks_with_tests,
    CASE
        WHEN COUNT(DISTINCT t.id) > 0 THEN
            ROUND((COUNT(DISTINCT tc.task_id) FILTER (WHERE tc.task_id IS NOT NULL)::NUMERIC / COUNT(DISTINCT t.id)::NUMERIC) * 100, 2)
        ELSE 0
    END AS test_coverage_pct,

    -- Latest Run Metrics (from most recent completed run)
    (
        SELECT COUNT(*)
        FROM test_execution te
        JOIN test_run tr ON te.test_run_id = tr.id
        WHERE tr.project_id = p.id
        AND tr.id = (
            SELECT id FROM test_run
            WHERE project_id = p.id AND status = 'completed'
            ORDER BY completed_at DESC LIMIT 1
        )
        AND te.status = 'pass'
    ) AS latest_run_pass_count,

    (
        SELECT COUNT(*)
        FROM test_execution te
        JOIN test_run tr ON te.test_run_id = tr.id
        WHERE tr.project_id = p.id
        AND tr.id = (
            SELECT id FROM test_run
            WHERE project_id = p.id AND status = 'completed'
            ORDER BY completed_at DESC LIMIT 1
        )
        AND te.status = 'fail'
    ) AS latest_run_fail_count,

    (
        SELECT COUNT(*)
        FROM test_execution te
        JOIN test_run tr ON te.test_run_id = tr.id
        WHERE tr.project_id = p.id
        AND tr.id = (
            SELECT id FROM test_run
            WHERE project_id = p.id AND status = 'completed'
            ORDER BY completed_at DESC LIMIT 1
        )
        AND te.status = 'not_run'
    ) AS latest_run_not_run_count,

    (
        SELECT COUNT(*)
        FROM test_execution te
        JOIN test_run tr ON te.test_run_id = tr.id
        WHERE tr.project_id = p.id
        AND tr.id = (
            SELECT id FROM test_run
            WHERE project_id = p.id AND status = 'completed'
            ORDER BY completed_at DESC LIMIT 1
        )
    ) AS latest_run_total_count,

    -- Pass Rate Calculation
    CASE
        WHEN (
            SELECT COUNT(*)
            FROM test_execution te
            JOIN test_run tr ON te.test_run_id = tr.id
            WHERE tr.project_id = p.id
            AND tr.id = (
                SELECT id FROM test_run
                WHERE project_id = p.id AND status = 'completed'
                ORDER BY completed_at DESC LIMIT 1
            )
        ) > 0 THEN
            ROUND(
                ((SELECT COUNT(*)
                  FROM test_execution te
                  JOIN test_run tr ON te.test_run_id = tr.id
                  WHERE tr.project_id = p.id
                  AND tr.id = (
                      SELECT id FROM test_run
                      WHERE project_id = p.id AND status = 'completed'
                      ORDER BY completed_at DESC LIMIT 1
                  )
                  AND te.status = 'pass')::NUMERIC /
                 (SELECT COUNT(*)
                  FROM test_execution te
                  JOIN test_run tr ON te.test_run_id = tr.id
                  WHERE tr.project_id = p.id
                  AND tr.id = (
                      SELECT id FROM test_run
                      WHERE project_id = p.id AND status = 'completed'
                      ORDER BY completed_at DESC LIMIT 1
                  ))::NUMERIC) * 100, 2
            )
        ELSE NULL
    END AS latest_run_pass_rate_pct,

    -- Not Run Rate
    CASE
        WHEN (
            SELECT COUNT(*)
            FROM test_execution te
            JOIN test_run tr ON te.test_run_id = tr.id
            WHERE tr.project_id = p.id
            AND tr.id = (
                SELECT id FROM test_run
                WHERE project_id = p.id AND status = 'completed'
                ORDER BY completed_at DESC LIMIT 1
            )
        ) > 0 THEN
            ROUND(
                ((SELECT COUNT(*)
                  FROM test_execution te
                  JOIN test_run tr ON te.test_run_id = tr.id
                  WHERE tr.project_id = p.id
                  AND tr.id = (
                      SELECT id FROM test_run
                      WHERE project_id = p.id AND status = 'completed'
                      ORDER BY completed_at DESC LIMIT 1
                  )
                  AND te.status = 'not_run')::NUMERIC /
                 (SELECT COUNT(*)
                  FROM test_execution te
                  JOIN test_run tr ON te.test_run_id = tr.id
                  WHERE tr.project_id = p.id
                  AND tr.id = (
                      SELECT id FROM test_run
                      WHERE project_id = p.id AND status = 'completed'
                      ORDER BY completed_at DESC LIMIT 1
                  ))::NUMERIC) * 100, 2
            )
        ELSE NULL
    END AS latest_run_not_run_pct,

    -- Latest Run Info
    (
        SELECT tr.name
        FROM test_run tr
        WHERE tr.project_id = p.id AND tr.status = 'completed'
        ORDER BY tr.completed_at DESC LIMIT 1
    ) AS latest_run_name,

    (
        SELECT tr.completed_at
        FROM test_run tr
        WHERE tr.project_id = p.id AND tr.status = 'completed'
        ORDER BY tr.completed_at DESC LIMIT 1
    ) AS latest_run_date

FROM project p
LEFT JOIN task t ON t.project_id = p.id AND t.deleted_at IS NULL
LEFT JOIN test_case tc ON tc.project_id = p.id AND tc.deleted_at IS NULL
WHERE p.deleted_at IS NULL
GROUP BY p.id, p.name, p.status;

-- ==============================================================================
-- SAMPLE DATA (for development/testing)
-- ==============================================================================

-- Sample Test Cases (linked to existing sample tasks)
INSERT INTO test_case (test_case_id, title, description, project_id, category, priority, status, created_by)
SELECT
    'TC-0001',
    'Verify login functionality with valid credentials',
    'Test that users can successfully log in with correct username and password',
    p.id,
    'smoke',
    'critical',
    'active',
    u.id
FROM project p, app_user u
WHERE p.name = 'Q1 Quality Audit'
  AND u.email = 'admin@example.com'
  AND NOT EXISTS (SELECT 1 FROM test_case WHERE test_case_id = 'TC-0001')
LIMIT 1;

INSERT INTO test_case (test_case_id, title, description, project_id, category, priority, status, tags, created_by)
SELECT
    'TC-0002',
    'Verify dashboard loads within performance threshold',
    'Test that the dashboard page loads within 3 seconds with all widgets displayed',
    p.id,
    'performance',
    'high',
    'active',
    ARRAY['performance', 'dashboard'],
    u.id
FROM project p, app_user u
WHERE p.name = 'Q1 Quality Audit'
  AND u.email = 'admin@example.com'
  AND NOT EXISTS (SELECT 1 FROM test_case WHERE test_case_id = 'TC-0002')
LIMIT 1;

-- Sample Test Run
INSERT INTO test_run (run_id, name, description, project_id, status, started_at, created_by)
SELECT
    'RUN-0001',
    'Sprint 1 - Smoke Test',
    'Initial smoke test for core functionality',
    p.id,
    'completed',
    CURRENT_TIMESTAMP - INTERVAL '2 days',
    u.id
FROM project p, app_user u
WHERE p.name = 'Q1 Quality Audit'
  AND u.email = 'admin@example.com'
  AND NOT EXISTS (SELECT 1 FROM test_run WHERE run_id = 'RUN-0001')
LIMIT 1;

-- Update test_run completion time
UPDATE test_run
SET completed_at = started_at + INTERVAL '2 hours',
    status = 'completed'
WHERE run_id = 'RUN-0001' AND completed_at IS NULL;

-- Sample Test Executions
INSERT INTO test_execution (test_case_id, test_run_id, status, notes, executed_by, executed_at)
SELECT
    tc.id,
    tr.id,
    'pass',
    'All checks passed successfully',
    u.id,
    tr.started_at + INTERVAL '30 minutes'
FROM test_case tc, test_run tr, app_user u
WHERE tc.test_case_id = 'TC-0001'
  AND tr.run_id = 'RUN-0001'
  AND u.email = 'admin@example.com'
  AND NOT EXISTS (
      SELECT 1 FROM test_execution
      WHERE test_case_id = tc.id AND test_run_id = tr.id
  )
LIMIT 1;

INSERT INTO test_execution (test_case_id, test_run_id, status, notes, executed_by, executed_at, duration_seconds)
SELECT
    tc.id,
    tr.id,
    'fail',
    'Dashboard load time exceeded 3 seconds (actual: 4.2s)',
    u.id,
    tr.started_at + INTERVAL '45 minutes',
    4
FROM test_case tc, test_run tr, app_user u
WHERE tc.test_case_id = 'TC-0002'
  AND tr.run_id = 'RUN-0001'
  AND u.email = 'admin@example.com'
  AND NOT EXISTS (
      SELECT 1 FROM test_execution
      WHERE test_case_id = tc.id AND test_run_id = tr.id
  )
LIMIT 1;

-- ==============================================================================
-- AUDIT LOG ENHANCEMENTS
-- ==============================================================================

-- Add new audit log actions for test management
-- (The audit_log table already exists, we just document the new action types)
-- New action types:
--   - test_case_created, test_case_updated, test_case_archived, test_case_deleted
--   - test_run_created, test_run_completed, test_run_aborted
--   - test_execution_logged, test_execution_updated

COMMENT ON TABLE test_case IS 'Test Case Registry - stores test cases for quality tracking';
COMMENT ON TABLE test_run IS 'Test Runs - groups test executions into cycles/releases';
COMMENT ON TABLE test_execution IS 'Test Execution Results - logs individual test execution outcomes';
COMMENT ON VIEW v_test_case_summary IS 'Summary view of test cases with latest execution metrics';
COMMENT ON VIEW v_project_quality_metrics IS 'Project-level quality metrics including pass rate, coverage, and execution freshness';
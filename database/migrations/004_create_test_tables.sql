-- Migration 004: Create Test Tables
-- Description: Create test_cases and test_results tables for QA testing workflow
-- Date: 2025-01-27

BEGIN;

-- Create test_cases table
CREATE TABLE IF NOT EXISTS test_cases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    test_case_id VARCHAR(20) UNIQUE NOT NULL CHECK (test_case_id ~ '^TC-[0-9]{3}$'),
    task_id UUID REFERENCES task(id) ON DELETE CASCADE,
    test_name VARCHAR(255) NOT NULL,
    test_description TEXT,
    test_type VARCHAR(50) CHECK (test_type IN ('unit', 'integration', 'e2e', 'manual', 'regression')),
    expected_result TEXT,
    test_data JSONB,
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'in_review', 'approved', 'deprecated')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by VARCHAR(255),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_by VARCHAR(255),
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by VARCHAR(255)
);

-- Create test_results table
CREATE TABLE IF NOT EXISTS test_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    test_case_id UUID NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
    task_id UUID REFERENCES task(id) ON DELETE SET NULL,
    execution_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    executed_by VARCHAR(255),
    result VARCHAR(20) NOT NULL CHECK (result IN ('pass', 'fail', 'blocked', 'skipped')),
    actual_result TEXT,
    notes TEXT,
    evidence_url TEXT,
    duration_seconds INTEGER CHECK (duration_seconds >= 0),
    environment VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create indexes for test_cases
CREATE UNIQUE INDEX idx_test_cases_id_active
    ON test_cases(test_case_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_test_cases_task_id
    ON test_cases(task_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_test_cases_status
    ON test_cases(status) WHERE deleted_at IS NULL;

CREATE INDEX idx_test_cases_priority
    ON test_cases(priority) WHERE deleted_at IS NULL;

CREATE INDEX idx_test_cases_type
    ON test_cases(test_type) WHERE deleted_at IS NULL;

CREATE INDEX idx_test_cases_deleted_at
    ON test_cases(deleted_at) WHERE deleted_at IS NOT NULL;

-- Create indexes for test_results
CREATE INDEX idx_test_results_test_case_id
    ON test_results(test_case_id);

CREATE INDEX idx_test_results_task_id
    ON test_results(task_id) WHERE task_id IS NOT NULL;

CREATE INDEX idx_test_results_execution_date
    ON test_results(execution_date DESC);

CREATE INDEX idx_test_results_result
    ON test_results(result);

CREATE INDEX idx_test_results_executed_by
    ON test_results(executed_by);

-- Create composite index for common queries
CREATE INDEX idx_test_results_case_date
    ON test_results(test_case_id, execution_date DESC);

-- Create trigger to update updated_at timestamp for test_cases
CREATE TRIGGER update_test_cases_updated_at 
    BEFORE UPDATE ON test_cases
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE test_cases IS 'Test cases/scenarios for quality assurance';
COMMENT ON COLUMN test_cases.test_case_id IS 'User-visible test case ID (format: TC-XXX)';
COMMENT ON COLUMN test_cases.task_id IS 'Optional link to parent task';
COMMENT ON COLUMN test_cases.test_type IS 'Type of test: unit, integration, e2e, manual, regression';
COMMENT ON COLUMN test_cases.test_data IS 'Test input data in JSON format';
COMMENT ON COLUMN test_cases.priority IS 'Test priority for execution order';
COMMENT ON COLUMN test_cases.status IS 'Test case lifecycle status';

COMMENT ON TABLE test_results IS 'Test execution results/history';
COMMENT ON COLUMN test_results.test_case_id IS 'Link to test case';
COMMENT ON COLUMN test_results.task_id IS 'Optional link to task where test was run';
COMMENT ON COLUMN test_results.result IS 'Test result: pass, fail, blocked, skipped';
COMMENT ON COLUMN test_results.evidence_url IS 'URL to screenshot/video evidence';
COMMENT ON COLUMN test_results.duration_seconds IS 'Test execution time in seconds';
COMMENT ON COLUMN test_results.environment IS 'Test environment (dev, staging, prod)';

-- Insert sample test cases (optional - for testing)
INSERT INTO test_cases (test_case_id, test_name, test_description, test_type, priority, status, created_by)
VALUES
    ('TC-001', 'Login with valid credentials', 'User should be able to login with correct email and password', 'integration', 'critical', 'approved', 'system'),
    ('TC-002', 'Create new project', 'User should be able to create a new project with valid data', 'e2e', 'high', 'approved', 'system'),
    ('TC-003', 'Assign task to resource', 'User should be able to assign a task to an available resource', 'integration', 'high', 'approved', 'system')
ON CONFLICT (test_case_id) DO NOTHING;

COMMIT;

-- Rollback script (save separately as 004_rollback.sql):
-- BEGIN;
-- DROP TRIGGER IF EXISTS update_test_cases_updated_at ON test_cases;
-- DROP INDEX IF EXISTS idx_test_results_case_date;
-- DROP INDEX IF EXISTS idx_test_results_executed_by;
-- DROP INDEX IF EXISTS idx_test_results_result;
-- DROP INDEX IF EXISTS idx_test_results_execution_date;
-- DROP INDEX IF EXISTS idx_test_results_task_id;
-- DROP INDEX IF EXISTS idx_test_results_test_case_id;
-- DROP INDEX IF EXISTS idx_test_cases_deleted_at;
-- DROP INDEX IF EXISTS idx_test_cases_type;
-- DROP INDEX IF EXISTS idx_test_cases_priority;
-- DROP INDEX IF EXISTS idx_test_cases_status;
-- DROP INDEX IF EXISTS idx_test_cases_task_id;
-- DROP INDEX IF EXISTS idx_test_cases_id_active;
-- DROP TABLE IF EXISTS test_results;
-- DROP TABLE IF EXISTS test_cases;
-- COMMIT;

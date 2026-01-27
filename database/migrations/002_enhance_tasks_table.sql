-- Migration 002: Enhance Tasks Table
-- Description: Add resource assignments, hours tracking, tags, and enhanced fields
-- Date: 2025-01-27

BEGIN;

-- Add new columns to tasks table
ALTER TABLE task
    ADD COLUMN IF NOT EXISTS task_id VARCHAR(20) UNIQUE,
    ADD COLUMN IF NOT EXISTS resource1_id UUID,
    ADD COLUMN IF NOT EXISTS resource2_id UUID,
    ADD COLUMN IF NOT EXISTS estimate_days NUMERIC(10,2) CHECK (estimate_days IS NULL OR estimate_days > 0),
    ADD COLUMN IF NOT EXISTS r1_estimate_hrs NUMERIC(10,2) DEFAULT 0 CHECK (r1_estimate_hrs >= 0),
    ADD COLUMN IF NOT EXISTS r1_actual_hrs NUMERIC(10,2) DEFAULT 0 CHECK (r1_actual_hrs >= 0),
    ADD COLUMN IF NOT EXISTS r2_estimate_hrs NUMERIC(10,2) DEFAULT 0 CHECK (r2_estimate_hrs >= 0),
    ADD COLUMN IF NOT EXISTS r2_actual_hrs NUMERIC(10,2) DEFAULT 0 CHECK (r2_actual_hrs >= 0),
    ADD COLUMN IF NOT EXISTS deadline DATE,
    ADD COLUMN IF NOT EXISTS completed_date DATE,
    ADD COLUMN IF NOT EXISTS tags TEXT[],
    ADD COLUMN IF NOT EXISTS created_by VARCHAR(255),
    ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255),
    ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(255);

-- Update task_id format for existing records
UPDATE task
SET task_id = 'TSK-' || LPAD(ROW_NUMBER() OVER (ORDER BY created_at)::TEXT, 3, '0')
WHERE task_id IS NULL;

-- Make task_id NOT NULL after populating
ALTER TABLE task
    ALTER COLUMN task_id SET NOT NULL;

-- Rename due_date to deadline if needed (both exist, so we keep both)
-- Note: Keep due_date for backwards compatibility, new code uses deadline

-- Update status values to match new design
UPDATE task
SET status = CASE
    WHEN status = 'pending' THEN 'Backlog'
    WHEN status = 'in_progress' THEN 'In Progress'
    WHEN status = 'completed' THEN 'Done'
    WHEN status = 'failed' THEN 'Cancelled'
    WHEN status = 'blocked' THEN 'Cancelled'
    WHEN status = 'deleted' THEN 'Cancelled'
    ELSE 'Backlog'
END;

-- Update status constraint
ALTER TABLE task
    DROP CONSTRAINT IF EXISTS valid_task_status;

ALTER TABLE task
    ADD CONSTRAINT valid_task_status CHECK (status IN ('Backlog', 'In Progress', 'Done', 'Cancelled'));

-- Add task_id format constraint
ALTER TABLE task
    ADD CONSTRAINT task_id_format CHECK (task_id ~ '^TSK-[0-9]{3}$');

-- Add business logic constraints
ALTER TABLE task
    ADD CONSTRAINT task_done_requires_completion 
    CHECK (
        status != 'Done' OR 
        (completed_date IS NOT NULL AND (r1_actual_hrs + r2_actual_hrs) > 0)
    );

ALTER TABLE task
    ADD CONSTRAINT task_completion_date_logic
    CHECK (completed_date IS NULL OR completed_date >= created_at::DATE);

ALTER TABLE task
    ADD CONSTRAINT task_resource2_hours_logic
    CHECK (
        resource2_id IS NOT NULL OR 
        (r2_estimate_hrs = 0 AND r2_actual_hrs = 0)
    );

-- Create partial unique index for active tasks
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_task_id_active
    ON task(task_id) WHERE deleted_at IS NULL;

-- Create index for soft-deleted records
CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at
    ON task(deleted_at) WHERE deleted_at IS NOT NULL;

-- Enhance existing indexes
DROP INDEX IF EXISTS idx_task_project_id;
CREATE INDEX idx_tasks_project_id
    ON task(project_id) WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS idx_task_status;
CREATE INDEX idx_tasks_status
    ON task(status) WHERE deleted_at IS NULL;

-- Create new indexes for resource assignments
CREATE INDEX IF NOT EXISTS idx_tasks_resource1_id
    ON task(resource1_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_resource2_id
    ON task(resource2_id) WHERE deleted_at IS NULL AND resource2_id IS NOT NULL;

-- Create index for deadline queries
CREATE INDEX IF NOT EXISTS idx_tasks_deadline
    ON task(deadline) WHERE deleted_at IS NULL AND status NOT IN ('Done', 'Cancelled');

-- Create composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_tasks_project_status
    ON task(project_id, status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_resource1_status
    ON task(resource1_id, status) WHERE deleted_at IS NULL;

-- Create GIN index for tags array search
CREATE INDEX IF NOT EXISTS idx_tasks_tags
    ON task USING GIN(tags) WHERE deleted_at IS NULL;

-- Add comments for documentation
COMMENT ON TABLE task IS 'Tasks table - enhanced with resource assignments, hours tracking, and tags';
COMMENT ON COLUMN task.task_id IS 'User-visible display ID (format: TSK-XXX)';
COMMENT ON COLUMN task.resource1_id IS 'Primary resource assigned to task';
COMMENT ON COLUMN task.resource2_id IS 'Optional secondary resource';
COMMENT ON COLUMN task.estimate_days IS 'Estimated duration in days';
COMMENT ON COLUMN task.r1_estimate_hrs IS 'Resource 1 estimated hours';
COMMENT ON COLUMN task.r1_actual_hrs IS 'Resource 1 actual hours worked';
COMMENT ON COLUMN task.r2_estimate_hrs IS 'Resource 2 estimated hours';
COMMENT ON COLUMN task.r2_actual_hrs IS 'Resource 2 actual hours worked';
COMMENT ON COLUMN task.tags IS 'Array of tags for categorization';
COMMENT ON COLUMN task.completed_date IS 'Date when task was marked Done';

COMMIT;

-- Rollback script (save separately as 002_rollback.sql):
-- BEGIN;
-- DROP INDEX IF EXISTS idx_tasks_tags;
-- DROP INDEX IF EXISTS idx_tasks_resource1_status;
-- DROP INDEX IF EXISTS idx_tasks_project_status;
-- DROP INDEX IF EXISTS idx_tasks_deadline;
-- DROP INDEX IF EXISTS idx_tasks_resource2_id;
-- DROP INDEX IF EXISTS idx_tasks_resource1_id;
-- DROP INDEX IF EXISTS idx_tasks_deleted_at;
-- DROP INDEX IF EXISTS idx_tasks_task_id_active;
-- ALTER TABLE task DROP CONSTRAINT IF EXISTS task_resource2_hours_logic;
-- ALTER TABLE task DROP CONSTRAINT IF EXISTS task_completion_date_logic;
-- ALTER TABLE task DROP CONSTRAINT IF EXISTS task_done_requires_completion;
-- ALTER TABLE task DROP CONSTRAINT IF EXISTS task_id_format;
-- ALTER TABLE task DROP COLUMN IF EXISTS deleted_by;
-- ALTER TABLE task DROP COLUMN IF EXISTS updated_by;
-- ALTER TABLE task DROP COLUMN IF EXISTS created_by;
-- ALTER TABLE task DROP COLUMN IF EXISTS tags;
-- ALTER TABLE task DROP COLUMN IF EXISTS completed_date;
-- ALTER TABLE task DROP COLUMN IF EXISTS deadline;
-- ALTER TABLE task DROP COLUMN IF EXISTS r2_actual_hrs;
-- ALTER TABLE task DROP COLUMN IF EXISTS r2_estimate_hrs;
-- ALTER TABLE task DROP COLUMN IF EXISTS r1_actual_hrs;
-- ALTER TABLE task DROP COLUMN IF EXISTS r1_estimate_hrs;
-- ALTER TABLE task DROP COLUMN IF EXISTS estimate_days;
-- ALTER TABLE task DROP COLUMN IF EXISTS resource2_id;
-- ALTER TABLE task DROP COLUMN IF EXISTS resource1_id;
-- ALTER TABLE task DROP COLUMN IF EXISTS task_id;
-- COMMIT;

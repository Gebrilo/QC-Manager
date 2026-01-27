-- Migration 001: Enhance Projects Table
-- Description: Add display IDs, metrics fields, and enhanced audit columns
-- Date: 2025-01-27

BEGIN;

-- Add new columns to projects table
ALTER TABLE project
    ADD COLUMN IF NOT EXISTS project_id VARCHAR(20) UNIQUE,
    ADD COLUMN IF NOT EXISTS total_weight INTEGER CHECK (total_weight BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS priority VARCHAR(20) CHECK (priority IN ('High', 'Medium', 'Low')),
    ADD COLUMN IF NOT EXISTS created_by VARCHAR(255),
    ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255),
    ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(255);

-- Update project_id format for existing records (if any exist)
-- Format: PRJ-001, PRJ-002, etc.
UPDATE project
SET project_id = 'PRJ-' || LPAD(ROW_NUMBER() OVER (ORDER BY created_at)::TEXT, 3, '0')
WHERE project_id IS NULL;

-- Make project_id NOT NULL after populating
ALTER TABLE project
    ALTER COLUMN project_id SET NOT NULL;

-- Update status constraint to match new values
ALTER TABLE project
    DROP CONSTRAINT IF EXISTS valid_status;

ALTER TABLE project
    ADD CONSTRAINT valid_status CHECK (status IN ('active', 'completed', 'on_hold', 'cancelled'));

-- Add constraint for project_id format
ALTER TABLE project
    ADD CONSTRAINT project_id_format CHECK (project_id ~ '^PRJ-[0-9]{3}$');

-- Add constraint for date logic
ALTER TABLE project
    ADD CONSTRAINT valid_date_range CHECK (target_date IS NULL OR start_date IS NULL OR target_date >= start_date);

-- Create partial unique index for active projects
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_project_id_active
    ON project(project_id) WHERE deleted_at IS NULL;

-- Create index for soft-deleted records
CREATE INDEX IF NOT EXISTS idx_projects_deleted_at
    ON project(deleted_at) WHERE deleted_at IS NOT NULL;

-- Create index for priority filtering
CREATE INDEX IF NOT EXISTS idx_projects_priority
    ON project(priority) WHERE deleted_at IS NULL;

-- Create composite index for date range queries
CREATE INDEX IF NOT EXISTS idx_projects_dates
    ON project(start_date, target_date) WHERE deleted_at IS NULL;

-- Add comment for documentation
COMMENT ON TABLE project IS 'Projects table - enhanced with display IDs, metrics, and soft delete support';
COMMENT ON COLUMN project.project_id IS 'User-visible display ID (format: PRJ-XXX)';
COMMENT ON COLUMN project.total_weight IS 'Priority weighting 1-5';
COMMENT ON COLUMN project.deleted_at IS 'Soft delete timestamp (NULL = active)';

COMMIT;

-- Rollback script (save separately as 001_rollback.sql):
-- BEGIN;
-- DROP INDEX IF EXISTS idx_projects_dates;
-- DROP INDEX IF EXISTS idx_projects_priority;
-- DROP INDEX IF EXISTS idx_projects_deleted_at;
-- DROP INDEX IF EXISTS idx_projects_project_id_active;
-- ALTER TABLE project DROP CONSTRAINT IF EXISTS valid_date_range;
-- ALTER TABLE project DROP CONSTRAINT IF EXISTS project_id_format;
-- ALTER TABLE project DROP COLUMN IF EXISTS deleted_by;
-- ALTER TABLE project DROP COLUMN IF EXISTS updated_by;
-- ALTER TABLE project DROP COLUMN IF EXISTS created_by;
-- ALTER TABLE project DROP COLUMN IF EXISTS priority;
-- ALTER TABLE project DROP COLUMN IF EXISTS total_weight;
-- ALTER TABLE project DROP COLUMN IF EXISTS project_id;
-- COMMIT;

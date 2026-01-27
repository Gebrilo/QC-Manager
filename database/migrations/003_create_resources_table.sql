-- Migration 003: Create Resources Table
-- Description: Create resources table for team/resource management
-- Date: 2025-01-27

BEGIN;

-- Create resources table
CREATE TABLE IF NOT EXISTS resources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resource_name VARCHAR(100) NOT NULL,
    weekly_capacity_hrs INTEGER NOT NULL DEFAULT 40 CHECK (weekly_capacity_hrs > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    email VARCHAR(255) CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    department VARCHAR(100),
    role VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by VARCHAR(255),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_by VARCHAR(255),
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by VARCHAR(255)
);

-- Create partial unique index for active resources
CREATE UNIQUE INDEX idx_resources_name_active
    ON resources(resource_name) WHERE deleted_at IS NULL;

-- Create index for active resources
CREATE INDEX idx_resources_active
    ON resources(is_active) WHERE deleted_at IS NULL AND is_active = TRUE;

-- Create index for soft-deleted records
CREATE INDEX idx_resources_deleted_at
    ON resources(deleted_at) WHERE deleted_at IS NOT NULL;

-- Create trigger to update updated_at timestamp
CREATE TRIGGER update_resources_updated_at 
    BEFORE UPDATE ON resources
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add foreign key constraints from task table to resources table
-- Note: These are added as NOT VALID first to allow existing data, then validated
ALTER TABLE task
    ADD CONSTRAINT fk_task_resource1
    FOREIGN KEY (resource1_id) 
    REFERENCES resources(id) 
    ON DELETE RESTRICT 
    ON UPDATE CASCADE
    NOT VALID;

ALTER TABLE task
    ADD CONSTRAINT fk_task_resource2
    FOREIGN KEY (resource2_id) 
    REFERENCES resources(id) 
    ON DELETE RESTRICT 
    ON UPDATE CASCADE
    NOT VALID;

-- Validate the constraints (this will fail if there's orphaned data)
-- ALTER TABLE task VALIDATE CONSTRAINT fk_task_resource1;
-- ALTER TABLE task VALIDATE CONSTRAINT fk_task_resource2;

-- Add comments for documentation
COMMENT ON TABLE resources IS 'Resources/team members table with automatic utilization tracking';
COMMENT ON COLUMN resources.resource_name IS 'Person name (unique per active record)';
COMMENT ON COLUMN resources.weekly_capacity_hrs IS 'Available hours per week (default 40)';
COMMENT ON COLUMN resources.is_active IS 'Active flag - soft disable without deleting';
COMMENT ON COLUMN resources.email IS 'Email address with format validation';
COMMENT ON COLUMN resources.department IS 'Department/team name';
COMMENT ON COLUMN resources.role IS 'Job role/title';

-- Insert sample resources (optional - for testing)
INSERT INTO resources (resource_name, weekly_capacity_hrs, email, department, role, created_by)
VALUES
    ('Basel Ahmed', 40, 'basel@company.com', 'QA', 'QA Lead', 'system'),
    ('John Doe', 40, 'john.doe@company.com', 'QA', 'QA Engineer', 'system'),
    ('Jane Smith', 40, 'jane.smith@company.com', 'QA', 'Test Engineer', 'system')
ON CONFLICT (resource_name) WHERE deleted_at IS NULL DO NOTHING;

-- Update existing tasks to link to resources (if assignee matches resource email/name)
-- This is a best-effort migration; manual review may be needed
UPDATE task t
SET resource1_id = r.id
FROM resources r
WHERE t.assignee = r.email 
    AND t.resource1_id IS NULL
    AND t.deleted_at IS NULL;

COMMIT;

-- Rollback script (save separately as 003_rollback.sql):
-- BEGIN;
-- ALTER TABLE task DROP CONSTRAINT IF EXISTS fk_task_resource2;
-- ALTER TABLE task DROP CONSTRAINT IF EXISTS fk_task_resource1;
-- DROP TRIGGER IF EXISTS update_resources_updated_at ON resources;
-- DROP INDEX IF EXISTS idx_resources_deleted_at;
-- DROP INDEX IF EXISTS idx_resources_active;
-- DROP INDEX IF EXISTS idx_resources_name_active;
-- DROP TABLE IF EXISTS resources;
-- COMMIT;

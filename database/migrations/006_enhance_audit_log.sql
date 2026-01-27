-- Migration 006: Enhance Audit Log
-- Description: Add JSONB state capture, changed fields tracking, and enhanced metadata
-- Date: 2025-01-27

BEGIN;

-- Add new columns to audit_log table
ALTER TABLE audit_log
    ADD COLUMN IF NOT EXISTS timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS user_email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS user_ip INET,
    ADD COLUMN IF NOT EXISTS user_agent TEXT,
    ADD COLUMN IF NOT EXISTS before_state JSONB,
    ADD COLUMN IF NOT EXISTS after_state JSONB,
    ADD COLUMN IF NOT EXISTS changed_fields TEXT[],
    ADD COLUMN IF NOT EXISTS change_summary TEXT,
    ADD COLUMN IF NOT EXISTS request_id UUID,
    ADD COLUMN IF NOT EXISTS session_id UUID,
    ADD COLUMN IF NOT EXISTS api_endpoint VARCHAR(255);

-- Update action constraint to match new design
ALTER TABLE audit_log
    DROP CONSTRAINT IF EXISTS valid_action;

ALTER TABLE audit_log
    ADD CONSTRAINT valid_action CHECK (
        action IN ('CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'create', 'update', 'delete', 'restore',
                   'status_change', 'report_generation', 'report_cleanup')
    );

-- Add constraint for state logic
ALTER TABLE audit_log
    ADD CONSTRAINT audit_state_logic CHECK (
        (action IN ('CREATE', 'create') AND before_state IS NULL) OR
        (action IN ('DELETE', 'delete') AND after_state IS NULL) OR
        (action IN ('UPDATE', 'update', 'RESTORE', 'restore', 'status_change'))
    );

-- Rename user_id to user_email if needed (both might exist)
-- Note: Keep both for backwards compatibility

-- Create GIN indexes for JSONB columns (fast JSON queries)
CREATE INDEX IF NOT EXISTS idx_audit_log_before_state
    ON audit_log USING GIN(before_state);

CREATE INDEX IF NOT EXISTS idx_audit_log_after_state
    ON audit_log USING GIN(after_state);

-- Enhance existing indexes
DROP INDEX IF EXISTS idx_audit_created_at;
CREATE INDEX idx_audit_log_timestamp
    ON audit_log(timestamp DESC);

DROP INDEX IF EXISTS idx_audit_entity;
CREATE INDEX idx_audit_log_entity
    ON audit_log(entity_type, entity_id);

-- Create new indexes
CREATE INDEX IF NOT EXISTS idx_audit_log_user_email
    ON audit_log(user_email, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_action
    ON audit_log(action);

CREATE INDEX IF NOT EXISTS idx_audit_log_request_id
    ON audit_log(request_id) WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_session_id
    ON audit_log(session_id) WHERE session_id IS NOT NULL;

-- Create composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_timestamp
    ON audit_log(entity_type, entity_id, timestamp DESC);

-- Add comments for documentation
COMMENT ON COLUMN audit_log.timestamp IS 'When the change occurred';
COMMENT ON COLUMN audit_log.action IS 'Type of action: CREATE, UPDATE, DELETE, RESTORE, status_change, etc.';
COMMENT ON COLUMN audit_log.entity_type IS 'Type of entity: project, task, resource, etc.';
COMMENT ON COLUMN audit_log.entity_id IS 'UUID of the affected record';
COMMENT ON COLUMN audit_log.user_email IS 'Email of user who made the change';
COMMENT ON COLUMN audit_log.user_ip IS 'IP address of user';
COMMENT ON COLUMN audit_log.user_agent IS 'Browser user agent string';
COMMENT ON COLUMN audit_log.before_state IS 'Complete record state before mutation (NULL for CREATE)';
COMMENT ON COLUMN audit_log.after_state IS 'Complete record state after mutation (NULL for DELETE)';
COMMENT ON COLUMN audit_log.changed_fields IS 'Array of field names that changed';
COMMENT ON COLUMN audit_log.change_summary IS 'Human-readable summary of the change';
COMMENT ON COLUMN audit_log.request_id IS 'Groups multiple changes in single transaction';
COMMENT ON COLUMN audit_log.session_id IS 'User session identifier';
COMMENT ON COLUMN audit_log.api_endpoint IS 'API endpoint that triggered change';

-- Example: Create audit log trigger function for automatic logging
-- This function can be attached to tables to automatically log changes

CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
    v_old_data JSONB;
    v_new_data JSONB;
    v_changed_fields TEXT[];
    v_action TEXT;
BEGIN
    -- Determine action
    IF (TG_OP = 'INSERT') THEN
        v_action := 'CREATE';
        v_old_data := NULL;
        v_new_data := row_to_json(NEW)::JSONB;
        v_changed_fields := NULL;
    ELSIF (TG_OP = 'UPDATE') THEN
        v_action := 'UPDATE';
        v_old_data := row_to_json(OLD)::JSONB;
        v_new_data := row_to_json(NEW)::JSONB;
        
        -- Find changed fields
        SELECT ARRAY_AGG(key)
        INTO v_changed_fields
        FROM (
            SELECT key
            FROM jsonb_each(v_old_data)
            WHERE jsonb_each.value != COALESCE(v_new_data->key, 'null'::jsonb)
        ) changed;
        
    ELSIF (TG_OP = 'DELETE') THEN
        v_action := 'DELETE';
        v_old_data := row_to_json(OLD)::JSONB;
        v_new_data := NULL;
        v_changed_fields := NULL;
    END IF;
    
    -- Insert audit record
    INSERT INTO audit_log (
        action,
        entity_type,
        entity_id,
        user_email,
        before_state,
        after_state,
        changed_fields,
        timestamp
    ) VALUES (
        v_action,
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        COALESCE(NEW.updated_by, OLD.updated_by, NEW.created_by, CURRENT_USER),
        v_old_data,
        v_new_data,
        v_changed_fields,
        CURRENT_TIMESTAMP
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Optionally attach audit triggers to tables
-- Uncomment these to enable automatic audit logging

-- CREATE TRIGGER audit_project_changes
--     AFTER INSERT OR UPDATE OR DELETE ON project
--     FOR EACH ROW
--     EXECUTE FUNCTION audit_trigger_function();

-- CREATE TRIGGER audit_task_changes
--     AFTER INSERT OR UPDATE OR DELETE ON task
--     FOR EACH ROW
--     EXECUTE FUNCTION audit_trigger_function();

-- CREATE TRIGGER audit_resource_changes
--     AFTER INSERT OR UPDATE OR DELETE ON resources
--     FOR EACH ROW
--     EXECUTE FUNCTION audit_trigger_function();

-- Add sample audit records (optional - for testing)
INSERT INTO audit_log (
    action, entity_type, entity_id, user_email, after_state, 
    change_summary, timestamp
)
SELECT 
    'CREATE',
    'project',
    p.id,
    'system@company.com',
    jsonb_build_object(
        'project_id', p.project_id,
        'name', p.name,
        'status', p.status
    ),
    'Initial project created',
    p.created_at
FROM project p
WHERE NOT EXISTS (
    SELECT 1 FROM audit_log al 
    WHERE al.entity_type = 'project' 
      AND al.entity_id = p.id
)
LIMIT 5;

COMMIT;

-- Rollback script (save separately as 006_rollback.sql):
-- BEGIN;
-- DROP TRIGGER IF EXISTS audit_resource_changes ON resources;
-- DROP TRIGGER IF EXISTS audit_task_changes ON task;
-- DROP TRIGGER IF EXISTS audit_project_changes ON project;
-- DROP FUNCTION IF EXISTS audit_trigger_function();
-- DROP INDEX IF EXISTS idx_audit_log_entity_timestamp;
-- DROP INDEX IF EXISTS idx_audit_log_session_id;
-- DROP INDEX IF EXISTS idx_audit_log_request_id;
-- DROP INDEX IF EXISTS idx_audit_log_action;
-- DROP INDEX IF EXISTS idx_audit_log_user_email;
-- DROP INDEX IF EXISTS idx_audit_log_after_state;
-- DROP INDEX IF EXISTS idx_audit_log_before_state;
-- ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_state_logic;
-- ALTER TABLE audit_log DROP COLUMN IF EXISTS api_endpoint;
-- ALTER TABLE audit_log DROP COLUMN IF EXISTS session_id;
-- ALTER TABLE audit_log DROP COLUMN IF EXISTS request_id;
-- ALTER TABLE audit_log DROP COLUMN IF EXISTS change_summary;
-- ALTER TABLE audit_log DROP COLUMN IF EXISTS changed_fields;
-- ALTER TABLE audit_log DROP COLUMN IF EXISTS after_state;
-- ALTER TABLE audit_log DROP COLUMN IF EXISTS before_state;
-- ALTER TABLE audit_log DROP COLUMN IF EXISTS user_agent;
-- ALTER TABLE audit_log DROP COLUMN IF EXISTS user_ip;
-- ALTER TABLE audit_log DROP COLUMN IF EXISTS user_email;
-- ALTER TABLE audit_log DROP COLUMN IF EXISTS timestamp;
-- COMMIT;

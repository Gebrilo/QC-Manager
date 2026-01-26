-- Migration 003: Complete Schema Alignment (v1.0)
-- Purpose: Implement Audit Log (JSONB), Views, and ensure Soft Deletes on all tables.

-- 1. Create/Update Audit Log Table
CREATE TABLE IF NOT EXISTS audit_log (
    audit_uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    action VARCHAR(20) NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'RESTORE')),
    entity_type VARCHAR(50) NOT NULL,
    entity_uuid UUID NOT NULL,
    user_email VARCHAR(255) NOT NULL,
    user_ip INET,
    user_agent TEXT,
    before_state JSONB,
    after_state JSONB,
    changed_fields TEXT[],
    change_summary TEXT,
    request_id UUID,
    session_id UUID,
    api_endpoint VARCHAR(255)
);

-- Create indexes for Audit Log
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_uuid);
CREATE INDEX IF NOT EXISTS idx_audit_log_before_state ON audit_log USING GIN(before_state);
CREATE INDEX IF NOT EXISTS idx_audit_log_after_state ON audit_log USING GIN(after_state);

-- 2. Ensure Soft Delete Columns exist (if missed in 002)
DO $$
BEGIN
    -- Projects
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='deleted_at') THEN
        ALTER TABLE projects ADD COLUMN deleted_at TIMESTAMPTZ;
    END IF;
    -- Tasks
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='deleted_at') THEN
        ALTER TABLE tasks ADD COLUMN deleted_at TIMESTAMPTZ;
    END IF;
    -- Resources
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='resources' AND column_name='deleted_at') THEN
        ALTER TABLE resources ADD COLUMN deleted_at TIMESTAMPTZ;
    END IF;
END $$;

-- 3. System Config Table
CREATE TABLE IF NOT EXISTS system_config (
    config_key VARCHAR(100) PRIMARY KEY,
    config_value TEXT NOT NULL,
    data_type VARCHAR(20) NOT NULL CHECK (data_type IN ('string', 'integer', 'decimal', 'boolean', 'json')),
    description TEXT,
    is_editable BOOLEAN DEFAULT TRUE,
    category VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(255)
);

-- 4. Re-Create Views with Exact Spec Formulas

-- Drop existing views first to avoid dependency errors
DROP VIEW IF EXISTS v_dashboard_metrics;
DROP VIEW IF EXISTS v_projects_with_aggregations;
DROP VIEW IF EXISTS v_tasks_with_calculations;
DROP VIEW IF EXISTS v_resources_with_utilization;
DROP VIEW IF EXISTS v_audit_trail;

-- View 1: Tasks with Calculations
CREATE OR REPLACE VIEW v_tasks_with_calculations AS
SELECT
    t.id as task_uuid, -- Alias local id to uuid
    t.task_id, -- Display ID (TSK-XXX)
    t.task_name,
    t.project_id as project_uuid_fk, -- This links to projects.id
    p.project_id as project_display_id, -- PRJ-XXX
    p.name as project_name,
    t.status,
    t.estimate_days,
    (COALESCE(t.estimate_days, 0) * 8) as estimate_hrs,
    
    -- Resources
    t.resource1_uuid,
    r1.name as resource1_name,
    t.resource2_uuid,
    r2.name as resource2_name,
    
    -- Hours Breakdown
    COALESCE(t.r1_estimate_hrs, 0) as r1_estimate_hrs,
    COALESCE(t.r1_actual_hrs, 0) as r1_actual_hrs,
    COALESCE(t.r2_estimate_hrs, 0) as r2_estimate_hrs,
    COALESCE(t.r2_actual_hrs, 0) as r2_actual_hrs,
    
    -- Totals
    (COALESCE(t.r1_estimate_hrs, 0) + COALESCE(t.r2_estimate_hrs, 0)) as total_est_hrs,
    (COALESCE(t.r1_actual_hrs, 0) + COALESCE(t.r2_actual_hrs, 0)) as total_actual_hrs,
    
    -- Variance
    ((COALESCE(t.r1_actual_hrs, 0) + COALESCE(t.r2_actual_hrs, 0)) - (COALESCE(t.r1_estimate_hrs, 0) + COALESCE(t.r2_estimate_hrs, 0))) as hours_variance,
    
    -- Percentages (Safe Division)
    CASE WHEN (COALESCE(t.r1_estimate_hrs, 0) + COALESCE(t.r2_estimate_hrs, 0)) > 0 
         THEN ROUND((((COALESCE(t.r1_actual_hrs, 0) + COALESCE(t.r2_actual_hrs, 0)) / (COALESCE(t.r1_estimate_hrs, 0) + COALESCE(t.r2_estimate_hrs, 0))) * 100)::NUMERIC, 2)
         ELSE 0 
    END as overall_completion_pct,

    t.deadline,
    t.completed_date,
    (t.deadline - CURRENT_DATE) as days_until_deadline,
    t.created_at,
    t.updated_at
FROM tasks t
LEFT JOIN projects p ON t.project_id = p.id
LEFT JOIN resources r1 ON t.resource1_uuid = r1.id
LEFT JOIN resources r2 ON t.resource2_uuid = r2.id
WHERE t.deleted_at IS NULL;

-- View 2: Projects with Aggregations
CREATE OR REPLACE VIEW v_projects_with_aggregations AS
SELECT
    p.id as project_uuid,
    p.project_id, -- PRJ-XXX
    p.name as project_name,
    p.priority,
    p.total_weight,
    p.start_date,
    p.target_date,
    
    -- Aggregations from Active Tasks
    COUNT(t.id) as tasks_total_count,
    COUNT(CASE WHEN t.status = 'Done' THEN 1 END) as tasks_done_count,
    COUNT(CASE WHEN t.status = 'In Progress' THEN 1 END) as tasks_in_progress_count,
    COUNT(CASE WHEN t.status = 'Backlog' THEN 1 END) as tasks_backlog_count,
    
    SUM(COALESCE(t.r1_estimate_hrs, 0) + COALESCE(t.r2_estimate_hrs, 0)) as task_hrs_est,
    SUM(COALESCE(t.r1_actual_hrs, 0) + COALESCE(t.r2_actual_hrs, 0)) as task_hrs_actual,
    SUM(CASE WHEN t.status = 'Done' THEN (COALESCE(t.r1_actual_hrs, 0) + COALESCE(t.r2_actual_hrs, 0)) ELSE 0 END) as task_hrs_done,
    
    -- Project Completion %
    CASE 
        WHEN SUM(COALESCE(t.r1_estimate_hrs, 0) + COALESCE(t.r2_estimate_hrs, 0)) > 0 
        THEN ROUND(((SUM(CASE WHEN t.status = 'Done' THEN (COALESCE(t.r1_actual_hrs, 0) + COALESCE(t.r2_actual_hrs, 0)) ELSE 0 END) / SUM(COALESCE(t.r1_estimate_hrs, 0) + COALESCE(t.r2_estimate_hrs, 0))) * 100)::NUMERIC, 2)
        ELSE 0 
    END as completion_pct,
    
    -- Dynamic Status
    CASE
        WHEN COUNT(t.id) = 0 THEN 'No Tasks'
        WHEN COUNT(CASE WHEN t.status = 'Done' THEN 1 END) = COUNT(t.id) THEN 'Complete'
        WHEN (CASE WHEN SUM(COALESCE(t.r1_estimate_hrs, 0) + COALESCE(t.r2_estimate_hrs, 0)) > 0 THEN (SUM(CASE WHEN t.status = 'Done' THEN (COALESCE(t.r1_actual_hrs, 0) + COALESCE(t.r2_actual_hrs, 0)) ELSE 0 END) / SUM(COALESCE(t.r1_estimate_hrs, 0) + COALESCE(t.r2_estimate_hrs, 0))) ELSE 0 END) >= 0.70 THEN 'On Track'
        ELSE 'At Risk'
    END as status,
    
    (p.target_date - CURRENT_DATE) as days_until_target,
    p.created_at,
    p.updated_at

FROM projects p
LEFT JOIN tasks t ON p.id = t.project_id AND t.deleted_at IS NULL
WHERE p.deleted_at IS NULL
GROUP BY p.id;

-- View 3: Resources with Utilization
CREATE OR REPLACE VIEW v_resources_with_utilization AS
SELECT
    r.id as resource_uuid,
    r.name as resource_name,
    r.weekly_capacity_hrs,
    
    -- Allocation (Sum of R1 and R2 estimates on active tasks)
    (
        COALESCE((SELECT SUM(r1_estimate_hrs) FROM tasks t WHERE t.resource1_uuid = r.id AND t.status != 'Done' AND t.status != 'Cancelled' AND t.deleted_at IS NULL), 0) +
        COALESCE((SELECT SUM(r2_estimate_hrs) FROM tasks t WHERE t.resource2_uuid = r.id AND t.status != 'Done' AND t.status != 'Cancelled' AND t.deleted_at IS NULL), 0)
    ) as current_allocation_hrs,
    
    -- Utilization %
    CASE WHEN r.weekly_capacity_hrs > 0
         THEN ROUND(((
             COALESCE((SELECT SUM(r1_estimate_hrs) FROM tasks t WHERE t.resource1_uuid = r.id AND t.status != 'Done' AND t.status != 'Cancelled' AND t.deleted_at IS NULL), 0) +
             COALESCE((SELECT SUM(r2_estimate_hrs) FROM tasks t WHERE t.resource2_uuid = r.id AND t.status != 'Done' AND t.status != 'Cancelled' AND t.deleted_at IS NULL), 0)
         ) / r.weekly_capacity_hrs * 100)::NUMERIC, 2)
         ELSE 0
    END as utilization_pct,
    
    r.is_active
FROM resources r
WHERE r.deleted_at IS NULL;

-- View 4: Dashboard Metrics
CREATE OR REPLACE VIEW v_dashboard_metrics AS
SELECT
    (SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL AND status IN ('Backlog', 'In Progress')) as active_tasks_count,
    (SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL AND status = 'Done') as tasks_done,
    (SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL AND status = 'In Progress') as tasks_in_progress,
    (SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL AND status = 'Backlog') as tasks_backlog,
    
    (SELECT SUM(total_est_hrs) FROM v_tasks_with_calculations) as total_estimated_hrs,
    (SELECT SUM(total_actual_hrs) FROM v_tasks_with_calculations) as total_actual_hrs,
    
    (SELECT COUNT(*) FROM projects WHERE deleted_at IS NULL) as total_projects,
    (SELECT COUNT(*) FROM v_projects_with_aggregations WHERE status = 'At Risk') as projects_at_risk,
    (SELECT COUNT(*) FROM v_projects_with_aggregations WHERE status = 'On Track') as projects_on_track,
    
    CURRENT_TIMESTAMP as calculated_at;

-- View 5: Audit Trail (Human Readable)
CREATE OR REPLACE VIEW v_audit_trail AS
SELECT
    log.audit_uuid,
    log.timestamp,
    log.action,
    log.entity_type,
    log.user_email,
    log.change_summary,
    -- Extract display ID if available in snapshot
    COALESCE(log.after_state->>'project_id', log.after_state->>'task_id', log.after_state->>'resource_name', log.entity_uuid::text) as display_id
FROM audit_log log
ORDER BY log.timestamp DESC;

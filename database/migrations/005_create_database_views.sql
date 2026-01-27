-- Migration 005: Create Database Views for Calculated Metrics
-- Description: Create views to replace Excel formulas with real-time calculations
-- Date: 2025-01-27

BEGIN;

-- ============================================================================
-- VIEW: v_tasks_with_calculations
-- Purpose: Tasks with all derived fields calculated (replaces Excel formulas)
-- ============================================================================

CREATE OR REPLACE VIEW v_tasks_with_calculations AS
SELECT
    t.id,
    t.task_id,
    t.project_id,
    t.name AS task_name,
    t.status,
    t.assignee,
    t.priority,
    t.description,
    t.notes,
    t.tags,
    
    -- Resource assignments
    t.resource1_id,
    t.resource2_id,
    r1.resource_name AS resource1_name,
    r2.resource_name AS resource2_name,
    
    -- Time estimates and actuals
    t.estimate_days,
    CASE 
        WHEN t.estimate_days IS NOT NULL THEN t.estimate_days * 8
        ELSE NULL
    END AS estimate_hrs,
    t.r1_estimate_hrs,
    t.r1_actual_hrs,
    t.r2_estimate_hrs,
    t.r2_actual_hrs,
    (t.r1_estimate_hrs + t.r2_estimate_hrs) AS total_est_hrs,
    (t.r1_actual_hrs + t.r2_actual_hrs) AS total_actual_hrs,
    
    -- Completion percentages with zero-division protection
    CASE 
        WHEN t.r1_estimate_hrs > 0 THEN 
            ROUND((t.r1_actual_hrs / t.r1_estimate_hrs * 100)::NUMERIC, 2)
        ELSE 0
    END AS r1_completion_pct,
    
    CASE 
        WHEN t.r2_estimate_hrs > 0 THEN 
            ROUND((t.r2_actual_hrs / t.r2_estimate_hrs * 100)::NUMERIC, 2)
        ELSE 0
    END AS r2_completion_pct,
    
    CASE 
        WHEN (t.r1_estimate_hrs + t.r2_estimate_hrs) > 0 THEN
            ROUND(((t.r1_actual_hrs + t.r2_actual_hrs) / (t.r1_estimate_hrs + t.r2_estimate_hrs) * 100)::NUMERIC, 2)
        ELSE 0
    END AS overall_completion_pct,
    
    -- Variance calculations
    (t.r1_actual_hrs + t.r2_actual_hrs) - (t.r1_estimate_hrs + t.r2_estimate_hrs) AS hours_variance,
    
    CASE 
        WHEN (t.r1_estimate_hrs + t.r2_estimate_hrs) > 0 THEN
            ROUND((((t.r1_actual_hrs + t.r2_actual_hrs) - (t.r1_estimate_hrs + t.r2_estimate_hrs)) / 
                   (t.r1_estimate_hrs + t.r2_estimate_hrs) * 100)::NUMERIC, 2)
        ELSE 0
    END AS variance_pct,
    
    -- Dates
    t.due_date,
    t.deadline,
    t.completed_date,
    CASE 
        WHEN t.deadline IS NOT NULL THEN t.deadline - CURRENT_DATE
        ELSE NULL
    END AS days_until_deadline,
    
    -- Timestamps
    t.created_at,
    t.created_by,
    t.updated_at,
    t.updated_by,
    t.deleted_at,
    t.deleted_by
    
FROM task t
LEFT JOIN resources r1 ON t.resource1_id = r1.id
LEFT JOIN resources r2 ON t.resource2_id = r2.id
WHERE t.deleted_at IS NULL;

-- ============================================================================
-- VIEW: v_projects_with_metrics
-- Purpose: Projects with aggregated task metrics (replaces Excel formulas)
-- ============================================================================

CREATE OR REPLACE VIEW v_projects_with_metrics AS
SELECT
    p.id,
    p.project_id,
    p.name AS project_name,
    p.owner,
    p.total_weight,
    p.priority,
    p.status AS project_status_field,
    p.description,
    
    -- Dates
    p.start_date,
    p.target_date,
    CASE 
        WHEN p.target_date IS NOT NULL THEN p.target_date - CURRENT_DATE
        ELSE NULL
    END AS days_until_target,
    
    -- Aggregated metrics from tasks
    COALESCE(SUM(t.r1_estimate_hrs + t.r2_estimate_hrs), 0) AS task_hrs_est,
    COALESCE(SUM(t.r1_actual_hrs + t.r2_actual_hrs), 0) AS task_hrs_actual,
    COALESCE(SUM(CASE WHEN t.status = 'Done' THEN t.r1_actual_hrs + t.r2_actual_hrs ELSE 0 END), 0) AS task_hrs_done,
    
    -- Completion percentage
    CASE 
        WHEN SUM(t.r1_estimate_hrs + t.r2_estimate_hrs) > 0 THEN
            ROUND((SUM(CASE WHEN t.status = 'Done' THEN t.r1_actual_hrs + t.r2_actual_hrs ELSE 0 END) / 
                   SUM(t.r1_estimate_hrs + t.r2_estimate_hrs) * 100)::NUMERIC, 2)
        ELSE 0
    END AS completion_pct,
    
    -- Task counts
    COUNT(t.id) AS tasks_total_count,
    SUM(CASE WHEN t.status = 'Done' THEN 1 ELSE 0 END) AS tasks_done_count,
    SUM(CASE WHEN t.status = 'In Progress' THEN 1 ELSE 0 END) AS tasks_in_progress_count,
    SUM(CASE WHEN t.status = 'Backlog' THEN 1 ELSE 0 END) AS tasks_backlog_count,
    SUM(CASE WHEN t.status = 'Cancelled' THEN 1 ELSE 0 END) AS tasks_cancelled_count,
    
    -- Calculated project status
    CASE 
        WHEN COUNT(t.id) = 0 THEN 'No Tasks'
        WHEN COUNT(t.id) = SUM(CASE WHEN t.status = 'Done' THEN 1 ELSE 0 END) THEN 'Complete'
        WHEN SUM(t.r1_estimate_hrs + t.r2_estimate_hrs) > 0 AND
             (SUM(CASE WHEN t.status = 'Done' THEN t.r1_actual_hrs + t.r2_actual_hrs ELSE 0 END) / 
              SUM(t.r1_estimate_hrs + t.r2_estimate_hrs)) >= 0.70 THEN 'On Track'
        ELSE 'At Risk'
    END AS status,
    
    -- Timestamps
    p.created_at,
    p.created_by,
    p.updated_at,
    p.updated_by,
    p.deleted_at,
    p.deleted_by
    
FROM project p
LEFT JOIN task t ON p.id = t.project_id AND t.deleted_at IS NULL
WHERE p.deleted_at IS NULL
GROUP BY p.id, p.project_id, p.name, p.owner, p.total_weight, p.priority, p.status, 
         p.description, p.start_date, p.target_date, p.created_at, p.created_by, 
         p.updated_at, p.updated_by, p.deleted_at, p.deleted_by;

-- ============================================================================
-- VIEW: v_resources_with_utilization
-- Purpose: Resources with calculated allocation and utilization
-- ============================================================================

CREATE OR REPLACE VIEW v_resources_with_utilization AS
SELECT
    r.id,
    r.resource_name,
    r.weekly_capacity_hrs,
    r.is_active,
    r.email,
    r.department,
    r.role,
    
    -- Calculate current allocation from active tasks
    COALESCE(
        (SELECT SUM(t.r1_estimate_hrs) 
         FROM task t 
         WHERE t.resource1_id = r.id 
           AND t.deleted_at IS NULL 
           AND t.status NOT IN ('Done', 'Cancelled')),
        0
    ) + COALESCE(
        (SELECT SUM(t.r2_estimate_hrs) 
         FROM task t 
         WHERE t.resource2_id = r.id 
           AND t.deleted_at IS NULL 
           AND t.status NOT IN ('Done', 'Cancelled')),
        0
    ) AS current_allocation_hrs,
    
    -- Utilization percentage
    CASE 
        WHEN r.weekly_capacity_hrs > 0 THEN
            ROUND((
                (COALESCE(
                    (SELECT SUM(t.r1_estimate_hrs) 
                     FROM task t 
                     WHERE t.resource1_id = r.id 
                       AND t.deleted_at IS NULL 
                       AND t.status NOT IN ('Done', 'Cancelled')),
                    0
                ) + COALESCE(
                    (SELECT SUM(t.r2_estimate_hrs) 
                     FROM task t 
                     WHERE t.resource2_id = r.id 
                       AND t.deleted_at IS NULL 
                       AND t.status NOT IN ('Done', 'Cancelled')),
                    0
                )) / r.weekly_capacity_hrs * 100
            )::NUMERIC, 2)
        ELSE 0
    END AS utilization_pct,
    
    -- Available hours
    r.weekly_capacity_hrs - (
        COALESCE(
            (SELECT SUM(t.r1_estimate_hrs) 
             FROM task t 
             WHERE t.resource1_id = r.id 
               AND t.deleted_at IS NULL 
               AND t.status NOT IN ('Done', 'Cancelled')),
            0
        ) + COALESCE(
            (SELECT SUM(t.r2_estimate_hrs) 
             FROM task t 
             WHERE t.resource2_id = r.id 
               AND t.deleted_at IS NULL 
               AND t.status NOT IN ('Done', 'Cancelled')),
            0
        )
    ) AS available_hrs,
    
    -- Task counts
    (SELECT COUNT(*) 
     FROM task t 
     WHERE (t.resource1_id = r.id OR t.resource2_id = r.id) 
       AND t.deleted_at IS NULL 
       AND t.status = 'In Progress'
    ) AS active_tasks_count,
    
    (SELECT COUNT(*) 
     FROM task t 
     WHERE (t.resource1_id = r.id OR t.resource2_id = r.id) 
       AND t.deleted_at IS NULL 
       AND t.status = 'Backlog'
    ) AS backlog_tasks_count,
    
    -- Timestamps
    r.created_at,
    r.created_by,
    r.updated_at,
    r.updated_by,
    r.deleted_at,
    r.deleted_by
    
FROM resources r
WHERE r.deleted_at IS NULL;

-- ============================================================================
-- VIEW: v_dashboard_metrics
-- Purpose: Single-row dashboard summary for reporting
-- ============================================================================

CREATE OR REPLACE VIEW v_dashboard_metrics AS
SELECT
    -- Task metrics
    COUNT(DISTINCT t.id) AS total_tasks,
    SUM(CASE WHEN t.status = 'Done' THEN 1 ELSE 0 END) AS tasks_done,
    SUM(CASE WHEN t.status = 'In Progress' THEN 1 ELSE 0 END) AS tasks_in_progress,
    SUM(CASE WHEN t.status = 'Backlog' THEN 1 ELSE 0 END) AS tasks_backlog,
    SUM(CASE WHEN t.status = 'Cancelled' THEN 1 ELSE 0 END) AS tasks_cancelled,
    
    -- Overall completion rate
    CASE 
        WHEN SUM(t.r1_estimate_hrs + t.r2_estimate_hrs) > 0 THEN
            ROUND((SUM(CASE WHEN t.status = 'Done' THEN t.r1_actual_hrs + t.r2_actual_hrs ELSE 0 END) / 
                   SUM(t.r1_estimate_hrs + t.r2_estimate_hrs) * 100)::NUMERIC, 2)
        ELSE 0
    END AS overall_completion_rate_pct,
    
    -- Hours metrics
    SUM(t.r1_estimate_hrs + t.r2_estimate_hrs) AS total_estimated_hrs,
    SUM(t.r1_actual_hrs + t.r2_actual_hrs) AS total_actual_hrs,
    SUM(t.r1_actual_hrs + t.r2_actual_hrs) - SUM(t.r1_estimate_hrs + t.r2_estimate_hrs) AS total_hours_variance,
    
    -- Project metrics
    COUNT(DISTINCT p.id) AS total_projects,
    COUNT(DISTINCT CASE WHEN EXISTS (
        SELECT 1 FROM task t2 WHERE t2.project_id = p.id AND t2.deleted_at IS NULL
    ) THEN p.id END) AS projects_with_tasks,
    
    -- Resource metrics
    COUNT(DISTINCT r.id) AS active_resources,
    (SELECT COUNT(*) 
     FROM v_resources_with_utilization 
     WHERE utilization_pct > 100
    ) AS overallocated_resources,
    
    -- Timestamp
    CURRENT_TIMESTAMP AS calculated_at
    
FROM project p
LEFT JOIN task t ON p.id = t.project_id AND t.deleted_at IS NULL
LEFT JOIN resources r ON r.is_active = TRUE AND r.deleted_at IS NULL
WHERE p.deleted_at IS NULL;

-- ============================================================================
-- VIEW: v_audit_trail
-- Purpose: Human-readable audit trail with display IDs
-- ============================================================================

CREATE OR REPLACE VIEW v_audit_trail AS
SELECT
    al.id,
    al.action,
    al.entity_type,
    al.entity_id,
    al.user_id,
    al.details,
    al.created_at,
    
    -- Extract display IDs from details JSONB if available
    CASE 
        WHEN al.entity_type = 'project' THEN 
            (SELECT p.project_id FROM project p WHERE p.id = al.entity_id)
        WHEN al.entity_type = 'task' THEN 
            (SELECT t.task_id FROM task t WHERE t.id = al.entity_id)
        WHEN al.entity_type = 'resource' THEN 
            (SELECT r.resource_name FROM resources r WHERE r.id = al.entity_id)
        ELSE NULL
    END AS display_id,
    
    -- Extract entity name
    CASE 
        WHEN al.entity_type = 'project' THEN 
            (SELECT p.name FROM project p WHERE p.id = al.entity_id)
        WHEN al.entity_type = 'task' THEN 
            (SELECT t.name FROM task t WHERE t.id = al.entity_id)
        WHEN al.entity_type = 'resource' THEN 
            (SELECT r.resource_name FROM resources r WHERE r.id = al.entity_id)
        ELSE NULL
    END AS entity_name
    
FROM audit_log al
ORDER BY al.created_at DESC;

-- Add comments for documentation
COMMENT ON VIEW v_tasks_with_calculations IS 'Tasks with all derived fields calculated in real-time';
COMMENT ON VIEW v_projects_with_metrics IS 'Projects with aggregated task metrics and status';
COMMENT ON VIEW v_resources_with_utilization IS 'Resources with calculated allocation and utilization';
COMMENT ON VIEW v_dashboard_metrics IS 'Single-row dashboard summary metrics';
COMMENT ON VIEW v_audit_trail IS 'Human-readable audit trail with display IDs';

COMMIT;

-- Rollback script (save separately as 005_rollback.sql):
-- BEGIN;
-- DROP VIEW IF EXISTS v_audit_trail;
-- DROP VIEW IF EXISTS v_dashboard_metrics;
-- DROP VIEW IF EXISTS v_resources_with_utilization;
-- DROP VIEW IF EXISTS v_projects_with_metrics;
-- DROP VIEW IF EXISTS v_tasks_with_calculations;
-- COMMIT;

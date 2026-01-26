-- ============================================================================
-- QC Scenario Planning - PostgreSQL Database Schema (DDL)
-- ============================================================================
-- Version: 2.0 (Refined)
-- Database: PostgreSQL 14+
-- Primary Keys: UUID (column name: "id")
-- Soft Delete: status='Cancelled' + is_deleted boolean
-- Audit Log: Complete change tracking with JSONB states
-- Generated: 2025-01-15
--
-- Architecture Summary:
-- This schema implements a task-driven project management system where Tasks
-- are the primary data entry point and Projects automatically aggregate metrics
-- from their child tasks. All transactional tables use UUID primary keys named
-- "id" for immutability and clean foreign key relationships. Soft deletes are
-- implemented via dual strategy: status='Cancelled' for business logic and
-- is_deleted boolean for system-level tracking. Derived fields use database
-- views for real-time accuracy, matching Excel formula behavior. A comprehensive
-- AUDIT_LOG table tracks all changes with before/after states in JSONB format.
-- The schema supports 4 core entities (Projects, Tasks, Resources, Assumptions)
-- plus configuration tables for status management and system settings.
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- SECTION 1: CORE TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABLE: projects
-- Purpose: Project containers that aggregate task data automatically
-- User-Editable Fields: project_id, project_name, total_weight, priority,
--                       start_date, target_date
-- Derived Fields: All metrics calculated via v_projects_with_metrics view
-- ----------------------------------------------------------------------------

CREATE TABLE projects (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User-Editable Fields
    project_id VARCHAR(20) NOT NULL,
    project_name VARCHAR(100) NOT NULL,
    total_weight INTEGER CHECK (total_weight BETWEEN 1 AND 5),
    priority VARCHAR(20) CHECK (priority IN ('High', 'Medium', 'Low')),
    start_date DATE,
    target_date DATE,

    -- Soft Delete Strategy
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by VARCHAR(255),

    -- Audit Fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255) NOT NULL DEFAULT 'system',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(255) NOT NULL DEFAULT 'system',

    -- Constraints
    CONSTRAINT chk_project_id_format CHECK (project_id ~ '^PRJ-[0-9]{3}$'),
    CONSTRAINT chk_project_dates CHECK (target_date IS NULL OR start_date IS NULL OR target_date >= start_date),
    CONSTRAINT chk_deleted_consistency CHECK (
        (is_deleted = FALSE AND deleted_at IS NULL AND deleted_by IS NULL) OR
        (is_deleted = TRUE AND deleted_at IS NOT NULL AND deleted_by IS NOT NULL)
    )
);

-- Unique constraint: project_id must be unique among non-deleted records
CREATE UNIQUE INDEX idx_projects_project_id_active
ON projects(project_id) WHERE is_deleted = FALSE;

COMMENT ON TABLE projects IS 'Project containers that aggregate task metrics automatically';
COMMENT ON COLUMN projects.id IS 'Immutable UUID primary key';
COMMENT ON COLUMN projects.project_id IS 'User-visible display ID (e.g., PRJ-001)';
COMMENT ON COLUMN projects.total_weight IS 'Priority weighting from 1 (low) to 5 (high)';
COMMENT ON COLUMN projects.is_deleted IS 'System-level soft delete flag';
COMMENT ON COLUMN projects.deleted_at IS 'Timestamp when record was soft deleted';

-- ----------------------------------------------------------------------------
-- TABLE: resources
-- Purpose: Resource pool with capacity tracking
-- User-Editable Fields: resource_name, weekly_capacity_hrs, email, is_active
-- Derived Fields: Allocation and utilization calculated via v_resources_utilization view
-- ----------------------------------------------------------------------------

CREATE TABLE resources (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User-Editable Fields
    resource_name VARCHAR(100) NOT NULL,
    weekly_capacity_hrs NUMERIC(5,2) NOT NULL DEFAULT 40.00 CHECK (weekly_capacity_hrs > 0),
    email VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- Soft Delete Strategy
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by VARCHAR(255),

    -- Audit Fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255) NOT NULL DEFAULT 'system',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(255) NOT NULL DEFAULT 'system',

    -- Constraints
    CONSTRAINT chk_email_format CHECK (
        email IS NULL OR
        email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
    ),
    CONSTRAINT chk_deleted_consistency CHECK (
        (is_deleted = FALSE AND deleted_at IS NULL AND deleted_by IS NULL) OR
        (is_deleted = TRUE AND deleted_at IS NOT NULL AND deleted_by IS NOT NULL)
    )
);

-- Unique constraint: resource_name must be unique among non-deleted records
CREATE UNIQUE INDEX idx_resources_name_active
ON resources(resource_name) WHERE is_deleted = FALSE;

COMMENT ON TABLE resources IS 'Resource pool with capacity and availability tracking';
COMMENT ON COLUMN resources.id IS 'Immutable UUID primary key';
COMMENT ON COLUMN resources.weekly_capacity_hrs IS 'Available hours per week (default: 40)';
COMMENT ON COLUMN resources.is_active IS 'Active status for filtering available resources';

-- ----------------------------------------------------------------------------
-- TABLE: tasks
-- Purpose: Primary data entry for all work (single source of truth)
-- User-Editable Fields: task_id, project_id, task_name, status, estimate_days,
--                       resource1_id, r1_estimate_hrs, r1_actual_hrs,
--                       resource2_id, r2_estimate_hrs, r2_actual_hrs,
--                       deadline, completed_date, tags, notes
-- Derived Fields: estimate_hrs (GENERATED), total_estimate_hrs (GENERATED),
--                 total_actual_hrs (GENERATED), r1_completion_pct, r2_completion_pct,
--                 overall_completion_pct, hours_variance, variance_pct
-- ----------------------------------------------------------------------------

CREATE TABLE tasks (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User-Editable Fields
    task_id VARCHAR(20) NOT NULL,
    project_id UUID NOT NULL,
    task_name VARCHAR(200) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Backlog'
        CHECK (status IN ('Backlog', 'In Progress', 'Done', 'Cancelled')),

    -- Estimation
    estimate_days NUMERIC(5,2) CHECK (estimate_days IS NULL OR estimate_days > 0),
    estimate_hrs NUMERIC(7,2) GENERATED ALWAYS AS (COALESCE(estimate_days, 0) * 8) STORED,

    -- Resource 1 (Primary - Required)
    resource1_id UUID NOT NULL,
    r1_estimate_hrs NUMERIC(7,2) NOT NULL DEFAULT 0 CHECK (r1_estimate_hrs >= 0),
    r1_actual_hrs NUMERIC(7,2) NOT NULL DEFAULT 0 CHECK (r1_actual_hrs >= 0),

    -- Resource 2 (Secondary - Optional)
    resource2_id UUID,
    r2_estimate_hrs NUMERIC(7,2) NOT NULL DEFAULT 0 CHECK (r2_estimate_hrs >= 0),
    r2_actual_hrs NUMERIC(7,2) NOT NULL DEFAULT 0 CHECK (r2_actual_hrs >= 0),

    -- Calculated Totals (GENERATED columns for performance)
    total_estimate_hrs NUMERIC(7,2) GENERATED ALWAYS AS (r1_estimate_hrs + r2_estimate_hrs) STORED,
    total_actual_hrs NUMERIC(7,2) GENERATED ALWAYS AS (r1_actual_hrs + r2_actual_hrs) STORED,

    -- Dates
    deadline DATE,
    completed_date DATE,

    -- Additional Fields
    tags TEXT[],
    notes TEXT,

    -- Soft Delete Strategy (dual approach)
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by VARCHAR(255),

    -- Audit Fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255) NOT NULL DEFAULT 'system',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(255) NOT NULL DEFAULT 'system',

    -- Foreign Keys
    CONSTRAINT fk_tasks_project FOREIGN KEY (project_id)
        REFERENCES projects(id) ON DELETE RESTRICT,
    CONSTRAINT fk_tasks_resource1 FOREIGN KEY (resource1_id)
        REFERENCES resources(id) ON DELETE RESTRICT,
    CONSTRAINT fk_tasks_resource2 FOREIGN KEY (resource2_id)
        REFERENCES resources(id) ON DELETE RESTRICT,

    -- Business Rule Constraints
    CONSTRAINT chk_task_id_format CHECK (task_id ~ '^TSK-[0-9]{3}$'),
    CONSTRAINT chk_done_task_requirements CHECK (
        status != 'Done' OR
        (completed_date IS NOT NULL AND total_actual_hrs > 0)
    ),
    CONSTRAINT chk_completed_date_logic CHECK (
        completed_date IS NULL OR
        completed_date >= created_at::DATE
    ),
    CONSTRAINT chk_resource2_hours_logic CHECK (
        resource2_id IS NOT NULL OR
        (r2_estimate_hrs = 0 AND r2_actual_hrs = 0)
    ),
    CONSTRAINT chk_deleted_consistency CHECK (
        (is_deleted = FALSE AND deleted_at IS NULL AND deleted_by IS NULL) OR
        (is_deleted = TRUE AND deleted_at IS NOT NULL AND deleted_by IS NOT NULL)
    ),
    CONSTRAINT chk_cancelled_vs_deleted CHECK (
        (status = 'Cancelled' AND is_deleted = TRUE) OR
        (status != 'Cancelled')
    )
);

-- Unique constraint: task_id must be unique among non-deleted records
CREATE UNIQUE INDEX idx_tasks_task_id_active
ON tasks(task_id) WHERE is_deleted = FALSE;

COMMENT ON TABLE tasks IS 'Primary data entry for all work - single source of truth';
COMMENT ON COLUMN tasks.id IS 'Immutable UUID primary key';
COMMENT ON COLUMN tasks.task_id IS 'User-visible display ID (e.g., TSK-001)';
COMMENT ON COLUMN tasks.estimate_hrs IS 'GENERATED: estimate_days * 8 (stored for performance)';
COMMENT ON COLUMN tasks.total_estimate_hrs IS 'GENERATED: r1_estimate_hrs + r2_estimate_hrs';
COMMENT ON COLUMN tasks.total_actual_hrs IS 'GENERATED: r1_actual_hrs + r2_actual_hrs';
COMMENT ON COLUMN tasks.status IS 'Task lifecycle: Backlog → In Progress → Done/Cancelled';
COMMENT ON COLUMN tasks.is_deleted IS 'System soft delete (TRUE when status=Cancelled)';

-- ----------------------------------------------------------------------------
-- TABLE: assumptions
-- Purpose: Configuration constants and lookup values
-- User-Editable Fields: All fields are editable
-- Derived Fields: None
-- ----------------------------------------------------------------------------

CREATE TABLE assumptions (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User-Editable Fields
    category VARCHAR(50) NOT NULL CHECK (category IN ('resource', 'status', 'general')),
    config_key VARCHAR(100) NOT NULL,
    config_value TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    description TEXT,

    -- Soft Delete Strategy
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by VARCHAR(255),

    -- Audit Fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255) NOT NULL DEFAULT 'system',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(255) NOT NULL DEFAULT 'system',

    -- Constraints
    CONSTRAINT chk_deleted_consistency CHECK (
        (is_deleted = FALSE AND deleted_at IS NULL AND deleted_by IS NULL) OR
        (is_deleted = TRUE AND deleted_at IS NOT NULL AND deleted_by IS NOT NULL)
    )
);

-- Unique constraint
CREATE UNIQUE INDEX idx_assumptions_key_active
ON assumptions(category, config_key) WHERE is_deleted = FALSE;

COMMENT ON TABLE assumptions IS 'Configuration constants and lookup values';
COMMENT ON COLUMN assumptions.category IS 'Configuration category: resource, status, general';

-- ============================================================================
-- SECTION 2: CONFIGURATION TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABLE: status_options
-- Purpose: Define valid status values and display properties
-- ----------------------------------------------------------------------------

CREATE TABLE status_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status_value VARCHAR(20) NOT NULL UNIQUE,
    display_label VARCHAR(50) NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_terminal BOOLEAN NOT NULL DEFAULT FALSE,
    color_hex VARCHAR(7),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE status_options IS 'Valid status values with display properties';
COMMENT ON COLUMN status_options.is_terminal IS 'Terminal states cannot transition (Done, Cancelled)';

-- ----------------------------------------------------------------------------
-- TABLE: status_transitions
-- Purpose: Define allowed status transitions for workflow enforcement
-- ----------------------------------------------------------------------------

CREATE TABLE status_transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_status VARCHAR(20) NOT NULL,
    to_status VARCHAR(20) NOT NULL,
    is_allowed BOOLEAN NOT NULL DEFAULT TRUE,
    required_fields TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(from_status, to_status)
);

COMMENT ON TABLE status_transitions IS 'Allowed status transitions for workflow enforcement';
COMMENT ON COLUMN status_transitions.required_fields IS 'Fields that must be filled for transition';

-- ----------------------------------------------------------------------------
-- TABLE: system_config
-- Purpose: System-wide configuration settings
-- ----------------------------------------------------------------------------

CREATE TABLE system_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(50) NOT NULL,
    config_key VARCHAR(100) NOT NULL,
    config_value TEXT NOT NULL,
    value_type VARCHAR(20) NOT NULL CHECK (value_type IN ('string', 'number', 'boolean', 'json')),
    description TEXT,
    is_editable BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category, config_key)
);

COMMENT ON TABLE system_config IS 'System-wide configuration settings';

-- ============================================================================
-- SECTION 3: AUDIT LOG TABLE
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABLE: audit_log
-- Purpose: Track all changes to records with before/after states
-- Design: Uses JSONB for flexible schema, supports time-travel queries
-- ----------------------------------------------------------------------------

CREATE TABLE audit_log (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Audit Metadata
    timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    action VARCHAR(20) NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'RESTORE')),
    entity_name VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    user_email VARCHAR(255) NOT NULL,

    -- State Capture (JSONB for flexibility)
    before_json JSONB,
    after_json JSONB,

    -- Changed Fields Tracking
    changed_fields TEXT[],

    -- Additional Context
    metadata JSONB,
    change_summary TEXT,
    request_id UUID,
    ip_address INET,
    user_agent TEXT
);

-- Indexes for audit_log
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp DESC);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_name, entity_id);
CREATE INDEX idx_audit_log_user ON audit_log(user_email, timestamp DESC);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_request_id ON audit_log(request_id) WHERE request_id IS NOT NULL;
CREATE INDEX idx_audit_log_before_json ON audit_log USING GIN(before_json);
CREATE INDEX idx_audit_log_after_json ON audit_log USING GIN(after_json);

COMMENT ON TABLE audit_log IS 'Complete audit trail with before/after states in JSONB';
COMMENT ON COLUMN audit_log.entity_name IS 'Table name (e.g., projects, tasks, resources)';
COMMENT ON COLUMN audit_log.entity_id IS 'UUID of the changed record';
COMMENT ON COLUMN audit_log.before_json IS 'Complete record state before change (NULL for CREATE)';
COMMENT ON COLUMN audit_log.after_json IS 'Complete record state after change';
COMMENT ON COLUMN audit_log.metadata IS 'Additional context (workflow info, business rules, etc.)';

-- ============================================================================
-- SECTION 4: INDEXES FOR PERFORMANCE
-- ============================================================================

-- Projects Indexes
CREATE INDEX idx_projects_priority ON projects(priority) WHERE is_deleted = FALSE;
CREATE INDEX idx_projects_dates ON projects(start_date, target_date) WHERE is_deleted = FALSE;
CREATE INDEX idx_projects_deleted ON projects(deleted_at) WHERE is_deleted = TRUE;

-- Resources Indexes
CREATE INDEX idx_resources_active ON resources(is_active) WHERE is_deleted = FALSE AND is_active = TRUE;
CREATE INDEX idx_resources_deleted ON resources(deleted_at) WHERE is_deleted = TRUE;

-- Tasks Indexes (Critical for Performance)
CREATE INDEX idx_tasks_project_id ON tasks(project_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_tasks_status ON tasks(status) WHERE is_deleted = FALSE;
CREATE INDEX idx_tasks_resource1_id ON tasks(resource1_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_tasks_resource2_id ON tasks(resource2_id) WHERE is_deleted = FALSE AND resource2_id IS NOT NULL;
CREATE INDEX idx_tasks_deadline ON tasks(deadline) WHERE is_deleted = FALSE AND status NOT IN ('Done', 'Cancelled');
CREATE INDEX idx_tasks_deleted ON tasks(deleted_at) WHERE is_deleted = TRUE;
CREATE INDEX idx_tasks_project_status ON tasks(project_id, status) WHERE is_deleted = FALSE;
CREATE INDEX idx_tasks_resource1_status ON tasks(resource1_id, status) WHERE is_deleted = FALSE;
CREATE INDEX idx_tasks_tags ON tasks USING GIN(tags) WHERE is_deleted = FALSE;

-- Assumptions Indexes
CREATE INDEX idx_assumptions_category ON assumptions(category) WHERE is_deleted = FALSE;

-- ============================================================================
-- SECTION 5: DATABASE VIEWS (DERIVED FIELDS)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- VIEW: v_tasks_with_metrics
-- Purpose: Add derived percentage calculations to tasks
-- Decision: Use VIEW (not GENERATED columns) because percentages involve
--           division by zero checks and conditional logic that's cleaner
--           in SQL than in GENERATED column expressions
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_tasks_with_metrics AS
SELECT
    t.id,
    t.task_id,
    t.project_id,
    t.task_name,
    t.status,
    t.estimate_days,
    t.estimate_hrs,
    t.resource1_id,
    t.r1_estimate_hrs,
    t.r1_actual_hrs,
    t.resource2_id,
    t.r2_estimate_hrs,
    t.r2_actual_hrs,
    t.total_estimate_hrs,
    t.total_actual_hrs,
    t.deadline,
    t.completed_date,
    t.tags,
    t.notes,

    -- Derived Percentage Fields
    CASE
        WHEN t.r1_estimate_hrs > 0
        THEN ROUND((t.r1_actual_hrs / t.r1_estimate_hrs * 100)::NUMERIC, 2)
        ELSE 0
    END AS r1_completion_pct,

    CASE
        WHEN t.r2_estimate_hrs > 0
        THEN ROUND((t.r2_actual_hrs / t.r2_estimate_hrs * 100)::NUMERIC, 2)
        ELSE 0
    END AS r2_completion_pct,

    CASE
        WHEN t.total_estimate_hrs > 0
        THEN ROUND((t.total_actual_hrs / t.total_estimate_hrs * 100)::NUMERIC, 2)
        ELSE 0
    END AS overall_completion_pct,

    -- Variance Calculations
    (t.total_actual_hrs - t.total_estimate_hrs) AS hours_variance,

    CASE
        WHEN t.total_estimate_hrs > 0
        THEN ROUND(((t.total_actual_hrs - t.total_estimate_hrs) / t.total_estimate_hrs * 100)::NUMERIC, 2)
        ELSE 0
    END AS variance_pct,

    -- Audit Fields
    t.is_deleted,
    t.deleted_at,
    t.deleted_by,
    t.created_at,
    t.created_by,
    t.updated_at,
    t.updated_by
FROM tasks t;

COMMENT ON VIEW v_tasks_with_metrics IS 'Tasks with derived percentage calculations (VIEW for division-by-zero safety)';

-- ----------------------------------------------------------------------------
-- VIEW: v_projects_with_metrics
-- Purpose: Aggregate task data to project level (mimics Excel formulas)
-- Decision: Use VIEW (not materialized) for real-time accuracy. Projects
--           must show current task state immediately. Materialized views
--           would introduce staleness and refresh complexity.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_projects_with_metrics AS
SELECT
    p.id,
    p.project_id,
    p.project_name,
    p.total_weight,
    p.priority,
    p.start_date,
    p.target_date,

    -- Task Hours Aggregations (from Tasks sheet columns M, N)
    COALESCE(SUM(t.total_estimate_hrs) FILTER (WHERE t.is_deleted = FALSE), 0) AS task_hrs_estimate,
    COALESCE(SUM(t.total_actual_hrs) FILTER (WHERE t.is_deleted = FALSE), 0) AS task_hrs_actual,
    COALESCE(SUM(t.total_actual_hrs) FILTER (WHERE t.is_deleted = FALSE AND t.status = 'Done'), 0) AS task_hrs_done,

    -- Task Counts
    COUNT(*) FILTER (WHERE t.is_deleted = FALSE AND t.status = 'Done') AS tasks_done_count,
    COUNT(*) FILTER (WHERE t.is_deleted = FALSE) AS tasks_total_count,

    -- Completion Percentage
    CASE
        WHEN SUM(t.total_estimate_hrs) FILTER (WHERE t.is_deleted = FALSE) > 0
        THEN ROUND((
            SUM(t.total_actual_hrs) FILTER (WHERE t.is_deleted = FALSE AND t.status = 'Done') /
            SUM(t.total_estimate_hrs) FILTER (WHERE t.is_deleted = FALSE) * 100
        )::NUMERIC, 2)
        ELSE 0
    END AS completion_pct,

    -- Project Status (Excel column J logic)
    CASE
        WHEN COUNT(*) FILTER (WHERE t.is_deleted = FALSE) = 0 THEN 'No Tasks'
        WHEN COUNT(*) FILTER (WHERE t.is_deleted = FALSE AND t.status = 'Done') =
             COUNT(*) FILTER (WHERE t.is_deleted = FALSE) THEN 'Complete'
        WHEN SUM(t.total_actual_hrs) FILTER (WHERE t.is_deleted = FALSE AND t.status = 'Done') >=
             0.7 * SUM(t.total_estimate_hrs) FILTER (WHERE t.is_deleted = FALSE) THEN 'On Track'
        ELSE 'At Risk'
    END AS status,

    -- Audit Fields
    p.is_deleted,
    p.deleted_at,
    p.deleted_by,
    p.created_at,
    p.created_by,
    p.updated_at,
    p.updated_by
FROM projects p
LEFT JOIN tasks t ON t.project_id = p.id
GROUP BY p.id, p.project_id, p.project_name, p.total_weight, p.priority,
         p.start_date, p.target_date, p.is_deleted, p.deleted_at, p.deleted_by,
         p.created_at, p.created_by, p.updated_at, p.updated_by;

COMMENT ON VIEW v_projects_with_metrics IS 'Projects with aggregated task metrics (VIEW for real-time accuracy)';

-- ----------------------------------------------------------------------------
-- VIEW: v_resources_utilization
-- Purpose: Calculate resource allocation and utilization from tasks
-- Decision: Use VIEW (not GENERATED columns in resources table) because
--           allocation comes from tasks table join. Cannot use GENERATED
--           columns for cross-table calculations.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_resources_utilization AS
SELECT
    r.id,
    r.resource_name,
    r.weekly_capacity_hrs,
    r.email,
    r.is_active,

    -- Current Allocation (sum of estimate hours from active tasks)
    COALESCE(
        SUM(t.r1_estimate_hrs) FILTER (WHERE t.resource1_id = r.id AND t.is_deleted = FALSE AND t.status NOT IN ('Done', 'Cancelled')),
        0
    ) + COALESCE(
        SUM(t.r2_estimate_hrs) FILTER (WHERE t.resource2_id = r.id AND t.is_deleted = FALSE AND t.status NOT IN ('Done', 'Cancelled')),
        0
    ) AS current_allocation_hrs,

    -- Utilization Percentage
    CASE
        WHEN r.weekly_capacity_hrs > 0
        THEN ROUND((
            (COALESCE(
                SUM(t.r1_estimate_hrs) FILTER (WHERE t.resource1_id = r.id AND t.is_deleted = FALSE AND t.status NOT IN ('Done', 'Cancelled')),
                0
            ) + COALESCE(
                SUM(t.r2_estimate_hrs) FILTER (WHERE t.resource2_id = r.id AND t.is_deleted = FALSE AND t.status NOT IN ('Done', 'Cancelled')),
                0
            )) / r.weekly_capacity_hrs * 100
        )::NUMERIC, 2)
        ELSE 0
    END AS utilization_pct,

    -- Available Hours
    r.weekly_capacity_hrs - (
        COALESCE(
            SUM(t.r1_estimate_hrs) FILTER (WHERE t.resource1_id = r.id AND t.is_deleted = FALSE AND t.status NOT IN ('Done', 'Cancelled')),
            0
        ) + COALESCE(
            SUM(t.r2_estimate_hrs) FILTER (WHERE t.resource2_id = r.id AND t.is_deleted = FALSE AND t.status NOT IN ('Done', 'Cancelled')),
            0
        )
    ) AS available_hrs,

    -- Audit Fields
    r.is_deleted,
    r.deleted_at,
    r.deleted_by,
    r.created_at,
    r.created_by,
    r.updated_at,
    r.updated_by
FROM resources r
LEFT JOIN tasks t ON (t.resource1_id = r.id OR t.resource2_id = r.id)
GROUP BY r.id, r.resource_name, r.weekly_capacity_hrs, r.email, r.is_active,
         r.is_deleted, r.deleted_at, r.deleted_by, r.created_at, r.created_by,
         r.updated_at, r.updated_by;

COMMENT ON VIEW v_resources_utilization IS 'Resources with allocation and utilization (VIEW required for cross-table joins)';

-- ----------------------------------------------------------------------------
-- VIEW: v_dashboard_metrics
-- Purpose: Summary metrics for dashboard reporting
-- Decision: Use VIEW for real-time dashboard data. This view is queried
--           less frequently than individual entity views, so performance
--           impact is acceptable. Could be materialized if dashboard becomes
--           a performance bottleneck (refresh every 5 minutes).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_dashboard_metrics AS
SELECT
    -- Project Metrics
    COUNT(DISTINCT p.id) FILTER (WHERE p.is_deleted = FALSE) AS total_projects,
    COUNT(DISTINCT p.id) FILTER (WHERE p.is_deleted = FALSE AND pm.status = 'Complete') AS completed_projects,
    COUNT(DISTINCT p.id) FILTER (WHERE p.is_deleted = FALSE AND pm.status = 'On Track') AS on_track_projects,
    COUNT(DISTINCT p.id) FILTER (WHERE p.is_deleted = FALSE AND pm.status = 'At Risk') AS at_risk_projects,

    -- Task Metrics
    COUNT(t.id) FILTER (WHERE t.is_deleted = FALSE) AS total_tasks,
    COUNT(t.id) FILTER (WHERE t.is_deleted = FALSE AND t.status = 'Done') AS completed_tasks,
    COUNT(t.id) FILTER (WHERE t.is_deleted = FALSE AND t.status = 'In Progress') AS in_progress_tasks,
    COUNT(t.id) FILTER (WHERE t.is_deleted = FALSE AND t.status = 'Backlog') AS backlog_tasks,

    -- Hours Metrics
    COALESCE(SUM(t.total_estimate_hrs) FILTER (WHERE t.is_deleted = FALSE), 0) AS total_estimated_hours,
    COALESCE(SUM(t.total_actual_hrs) FILTER (WHERE t.is_deleted = FALSE), 0) AS total_actual_hours,
    COALESCE(SUM(t.total_actual_hrs - t.total_estimate_hrs) FILTER (WHERE t.is_deleted = FALSE), 0) AS total_variance_hours,

    -- Resource Metrics
    COUNT(DISTINCT r.id) FILTER (WHERE r.is_deleted = FALSE AND r.is_active = TRUE) AS active_resources,
    ROUND(AVG(ru.utilization_pct) FILTER (WHERE r.is_deleted = FALSE AND r.is_active = TRUE), 2) AS avg_resource_utilization,

    -- Completion Percentage
    CASE
        WHEN SUM(t.total_estimate_hrs) FILTER (WHERE t.is_deleted = FALSE) > 0
        THEN ROUND((
            SUM(t.total_actual_hrs) FILTER (WHERE t.is_deleted = FALSE AND t.status = 'Done') /
            SUM(t.total_estimate_hrs) FILTER (WHERE t.is_deleted = FALSE) * 100
        )::NUMERIC, 2)
        ELSE 0
    END AS overall_completion_pct
FROM projects p
LEFT JOIN v_projects_with_metrics pm ON pm.id = p.id
LEFT JOIN tasks t ON t.project_id = p.id
LEFT JOIN resources r ON r.id = t.resource1_id OR r.id = t.resource2_id
LEFT JOIN v_resources_utilization ru ON ru.id = r.id;

COMMENT ON VIEW v_dashboard_metrics IS 'Summary metrics for dashboard (consider materializing if performance issues arise)';

-- ============================================================================
-- SECTION 6: SEED DATA
-- ============================================================================

-- Insert Status Options
INSERT INTO status_options (status_value, display_label, display_order, is_terminal, color_hex, description) VALUES
('Backlog', 'Backlog', 1, FALSE, '#6C757D', 'Task not yet started'),
('In Progress', 'In Progress', 2, FALSE, '#007BFF', 'Task currently being worked on'),
('Done', 'Done', 3, TRUE, '#28A745', 'Task completed successfully'),
('Cancelled', 'Cancelled', 4, TRUE, '#DC3545', 'Task cancelled and soft deleted');

-- Insert Status Transitions
INSERT INTO status_transitions (from_status, to_status, is_allowed, required_fields) VALUES
('Backlog', 'In Progress', TRUE, NULL),
('Backlog', 'Cancelled', TRUE, NULL),
('Backlog', 'Done', FALSE, NULL),
('In Progress', 'Done', TRUE, ARRAY['completed_date']),
('In Progress', 'Cancelled', TRUE, NULL),
('In Progress', 'Backlog', FALSE, NULL),
('Done', 'Backlog', FALSE, NULL),
('Done', 'In Progress', FALSE, NULL),
('Done', 'Cancelled', FALSE, NULL),
('Cancelled', 'Backlog', FALSE, NULL),
('Cancelled', 'In Progress', FALSE, NULL),
('Cancelled', 'Done', FALSE, NULL);

-- Insert System Config
INSERT INTO system_config (category, config_key, config_value, value_type, description, is_editable) VALUES
('general', 'default_weekly_capacity', '40', 'number', 'Default weekly capacity for new resources (hours)', TRUE),
('general', 'hours_per_day', '8', 'number', 'Standard hours per workday', TRUE),
('general', 'on_track_threshold', '0.7', 'number', 'Completion percentage threshold for On Track status', TRUE),
('reporting', 'dashboard_refresh_interval', '300', 'number', 'Dashboard metrics refresh interval (seconds)', TRUE);

-- ============================================================================
-- SECTION 7: HELPER FUNCTIONS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- FUNCTION: fn_validate_status_transition
-- Purpose: Check if status transition is allowed
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_validate_status_transition(
    p_from_status VARCHAR(20),
    p_to_status VARCHAR(20)
)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM status_transitions
        WHERE from_status = p_from_status
        AND to_status = p_to_status
        AND is_allowed = TRUE
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION fn_validate_status_transition IS 'Check if status transition is allowed per workflow rules';

-- ----------------------------------------------------------------------------
-- FUNCTION: fn_get_required_fields_for_transition
-- Purpose: Get required fields for a status transition
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_get_required_fields_for_transition(
    p_from_status VARCHAR(20),
    p_to_status VARCHAR(20)
)
RETURNS TEXT[] AS $$
DECLARE
    v_required_fields TEXT[];
BEGIN
    SELECT required_fields INTO v_required_fields
    FROM status_transitions
    WHERE from_status = p_from_status
    AND to_status = p_to_status
    AND is_allowed = TRUE;

    RETURN COALESCE(v_required_fields, ARRAY[]::TEXT[]);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION fn_get_required_fields_for_transition IS 'Get required fields for status transition';

-- ============================================================================
-- SECTION 8: AUDIT TRIGGERS (Optional - Can be implemented via n8n)
-- ============================================================================

-- Note: Audit logging can be handled via n8n workflows (see QC_N8N_Workflow_Architecture.md)
-- or via database triggers. Below is a trigger-based implementation for reference.

-- ----------------------------------------------------------------------------
-- FUNCTION: fn_audit_log_trigger
-- Purpose: Generic audit logging function for all tables
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_audit_log_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_action VARCHAR(20);
    v_before_json JSONB;
    v_after_json JSONB;
    v_changed_fields TEXT[];
    v_user_email VARCHAR(255);
BEGIN
    -- Determine action type
    IF (TG_OP = 'INSERT') THEN
        v_action := 'CREATE';
        v_before_json := NULL;
        v_after_json := to_jsonb(NEW);
        v_changed_fields := ARRAY[]::TEXT[];
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Check if this is a soft delete or restore
        IF (OLD.is_deleted = FALSE AND NEW.is_deleted = TRUE) THEN
            v_action := 'DELETE';
        ELSIF (OLD.is_deleted = TRUE AND NEW.is_deleted = FALSE) THEN
            v_action := 'RESTORE';
        ELSE
            v_action := 'UPDATE';
        END IF;

        v_before_json := to_jsonb(OLD);
        v_after_json := to_jsonb(NEW);

        -- Calculate changed fields (comparing JSON keys)
        SELECT ARRAY_AGG(DISTINCT key)
        INTO v_changed_fields
        FROM (
            SELECT key FROM jsonb_each(v_before_json)
            EXCEPT
            SELECT key FROM jsonb_each(v_after_json)
        ) AS changed;
    ELSIF (TG_OP = 'DELETE') THEN
        v_action := 'DELETE';
        v_before_json := to_jsonb(OLD);
        v_after_json := NULL;
        v_changed_fields := ARRAY[]::TEXT[];
    END IF;

    -- Extract user email from context (set by application)
    v_user_email := COALESCE(current_setting('app.user_email', TRUE), 'system');

    -- Insert audit log
    INSERT INTO audit_log (
        action,
        entity_name,
        entity_id,
        user_email,
        before_json,
        after_json,
        changed_fields,
        timestamp
    ) VALUES (
        v_action,
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        v_user_email,
        v_before_json,
        v_after_json,
        v_changed_fields,
        CURRENT_TIMESTAMP
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach triggers to all core tables (uncomment to enable trigger-based audit)
-- CREATE TRIGGER trg_audit_projects AFTER INSERT OR UPDATE OR DELETE ON projects
--     FOR EACH ROW EXECUTE FUNCTION fn_audit_log_trigger();
-- CREATE TRIGGER trg_audit_tasks AFTER INSERT OR UPDATE OR DELETE ON tasks
--     FOR EACH ROW EXECUTE FUNCTION fn_audit_log_trigger();
-- CREATE TRIGGER trg_audit_resources AFTER INSERT OR UPDATE OR DELETE ON resources
--     FOR EACH ROW EXECUTE FUNCTION fn_audit_log_trigger();
-- CREATE TRIGGER trg_audit_assumptions AFTER INSERT OR UPDATE OR DELETE ON assumptions
--     FOR EACH ROW EXECUTE FUNCTION fn_audit_log_trigger();

COMMENT ON FUNCTION fn_audit_log_trigger IS 'Generic audit trigger function (optional - can use n8n instead)';

-- ============================================================================
-- END OF DDL
-- ============================================================================

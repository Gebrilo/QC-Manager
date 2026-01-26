-- Migration 002: Align schema with QC Design Spec

-- 1. Projects Table Updates
ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS project_id VARCHAR(20) UNIQUE,
    ADD COLUMN IF NOT EXISTS total_weight INTEGER CHECK (total_weight BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS priority VARCHAR(20) CHECK (priority IN ('High', 'Medium', 'Low')),
    ADD COLUMN IF NOT EXISTS start_date DATE,
    ADD COLUMN IF NOT EXISTS target_date DATE,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(255),
    ADD COLUMN IF NOT EXISTS created_by VARCHAR(255),
    ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);

-- Rename id to project_uuid for consistency with spec (optional but good for clarity if possible, else we keep id)
-- For this migration, we will KEEP 'id' as the primary key name to avoid breaking everything immediately,
-- but we might alias it in views or just use 'id' in code. The spec says 'project_uuid', but 'id' is standard.
-- We will stick to 'id' in actual table to minimize friction with existing rows, but usage in code can vary.
-- Spec says: project_uuid UUID PRIMARY KEY.
-- Existing: id UUID PRIMARY KEY.
-- We'll leave it as 'id' for now to avoid complex renaming of FKs.

-- 2. Resources Table Updates
ALTER TABLE resources
    ADD COLUMN IF NOT EXISTS weekly_capacity_hrs INTEGER DEFAULT 40,
    ADD COLUMN IF NOT EXISTS email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS department VARCHAR(100),
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(255),
    ADD COLUMN IF NOT EXISTS created_by VARCHAR(255),
    ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);

-- 3. Tasks Table Updates
ALTER TABLE tasks
    RENAME COLUMN title TO task_name; -- Rename to match spec

ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS task_id VARCHAR(20) UNIQUE,
    ADD COLUMN IF NOT EXISTS resource1_uuid UUID REFERENCES resources(id),
    ADD COLUMN IF NOT EXISTS resource2_uuid UUID REFERENCES resources(id),
    ADD COLUMN IF NOT EXISTS estimate_days NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS r1_estimate_hrs NUMERIC(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS r1_actual_hrs NUMERIC(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS r2_estimate_hrs NUMERIC(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS r2_actual_hrs NUMERIC(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS deadline DATE,
    ADD COLUMN IF NOT EXISTS completed_date DATE,
    ADD COLUMN IF NOT EXISTS tags TEXT[],
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(255),
    ADD COLUMN IF NOT EXISTS created_by VARCHAR(255),
    ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);

-- Migrate existing assigned_resource_id to resource1_uuid
UPDATE tasks SET resource1_uuid = assigned_resource_id WHERE assigned_resource_id IS NOT NULL;

-- Drop old column (optional, or keep for safety)
-- ALTER TABLE tasks DROP COLUMN assigned_resource_id;

-- 4. Status Options Table (Configuration)
CREATE TABLE IF NOT EXISTS status_options (
    status_id SERIAL PRIMARY KEY,
    status_name VARCHAR(20) UNIQUE NOT NULL,
    display_order INTEGER NOT NULL,
    is_terminal BOOLEAN DEFAULT FALSE,
    color_code VARCHAR(7),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO status_options (status_name, display_order, is_terminal, color_code)
VALUES
    ('Backlog', 1, FALSE, '#2196F3'),
    ('In Progress', 2, FALSE, '#FF9800'),
    ('Done', 3, TRUE, '#4CAF50'),
    ('Cancelled', 4, TRUE, '#9E9E9E')
ON CONFLICT (status_name) DO NOTHING;

-- 5. Views for Calculations (Business Logic in DB)

-- View: Tasks with Calculations
CREATE OR REPLACE VIEW v_tasks_with_calculations AS
SELECT
    t.*,
    t.id as task_uuid, -- Alias for spec compliance
    t.project_id as project_uuid,
    p.name as project_name,
    p.project_id as project_display_id,
    r1.name as resource1_name,
    r2.name as resource2_name,
    (COALESCE(t.estimate_days, 0) * 8) as estimate_hrs,
    (COALESCE(t.r1_estimate_hrs, 0) + COALESCE(t.r2_estimate_hrs, 0)) as total_est_hrs,
    (COALESCE(t.r1_actual_hrs, 0) + COALESCE(t.r2_actual_hrs, 0)) as total_actual_hrs,
    CASE 
        WHEN (COALESCE(t.r1_estimate_hrs, 0) + COALESCE(t.r2_estimate_hrs, 0)) > 0 
        THEN ((COALESCE(t.r1_actual_hrs, 0) + COALESCE(t.r2_actual_hrs, 0)) / (COALESCE(t.r1_estimate_hrs, 0) + COALESCE(t.r2_estimate_hrs, 0)) * 100)
        ELSE 0 
    END as overall_completion_pct
FROM tasks t
LEFT JOIN projects p ON t.project_id = p.id
LEFT JOIN resources r1 ON t.resource1_uuid = r1.id
LEFT JOIN resources r2 ON t.resource2_uuid = r2.id;

-- View: Projects with Aggregations
CREATE OR REPLACE VIEW v_projects_with_aggregations AS
SELECT
    p.*,
    p.id as project_uuid, -- Alias
    COUNT(t.id) as tasks_total_count,
    COUNT(CASE WHEN t.status = 'Done' THEN 1 END) as tasks_done_count,
    SUM(COALESCE(t.r1_estimate_hrs, 0) + COALESCE(t.r2_estimate_hrs, 0)) as task_hrs_est,
    SUM(COALESCE(t.r1_actual_hrs, 0) + COALESCE(t.r2_actual_hrs, 0)) as task_hrs_actual,
    CASE
        WHEN COUNT(t.id) = 0 THEN 'No Tasks'
        WHEN COUNT(CASE WHEN t.status = 'Done' THEN 1 END) = COUNT(t.id) THEN 'Complete'
        ELSE 'In Progress' -- Simplified logic for now
    END as dynamic_status
FROM projects p
LEFT JOIN tasks t ON p.id = t.project_id AND t.deleted_at IS NULL
WHERE p.deleted_at IS NULL
GROUP BY p.id;

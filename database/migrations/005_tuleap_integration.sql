-- Migration 005: Tuleap Integration
-- Description: Add tables for Tuleap webhook integration (bugs, sync config, task history)
-- Date: 2026-02-10

BEGIN;

-- =====================================================
-- BUGS TABLE - Store synced bugs from Tuleap
-- =====================================================
CREATE TABLE IF NOT EXISTS bugs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Tuleap Reference
    tuleap_artifact_id INTEGER NOT NULL UNIQUE,
    tuleap_tracker_id INTEGER,
    tuleap_url TEXT,

    -- Bug Data
    bug_id VARCHAR(50) NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'Open',
    severity VARCHAR(20) DEFAULT 'medium',
    priority VARCHAR(20) DEFAULT 'medium',
    bug_type VARCHAR(50),
    component VARCHAR(100),

    -- Relationships
    project_id UUID REFERENCES projects(id),
    linked_test_case_ids UUID[],
    linked_test_execution_ids UUID[],

    -- Assignment
    reported_by VARCHAR(255),
    assigned_to VARCHAR(255),

    -- Dates
    reported_date TIMESTAMP WITH TIME ZONE,
    resolved_date TIMESTAMP WITH TIME ZONE,

    -- Sync Metadata
    last_sync_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    raw_tuleap_payload JSONB,

    -- Standard
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Bug Indexes
CREATE INDEX IF NOT EXISTS idx_bugs_project_id ON bugs(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bugs_status ON bugs(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bugs_severity ON bugs(severity) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bugs_tuleap_artifact ON bugs(tuleap_artifact_id);

-- =====================================================
-- TULEAP SYNC CONFIG - Map Tuleap trackers to QC projects
-- =====================================================
CREATE TABLE IF NOT EXISTS tuleap_sync_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Tuleap Source
    tuleap_project_id INTEGER NOT NULL,
    tuleap_tracker_id INTEGER NOT NULL,
    tuleap_base_url TEXT,
    tracker_type VARCHAR(20) NOT NULL CHECK (tracker_type IN ('test_case', 'bug', 'task')),

    -- QC Tool Target
    qc_project_id UUID REFERENCES projects(id),

    -- Field Mappings (Tuleap field_id -> QC Tool field)
    field_mappings JSONB NOT NULL DEFAULT '{}',

    -- Status Mappings (Tuleap status value -> QC Tool status)
    status_mappings JSONB NOT NULL DEFAULT '{}',

    -- Config
    is_active BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(tuleap_project_id, tuleap_tracker_id)
);

-- =====================================================
-- TULEAP WEBHOOK LOG - Idempotency & debugging
-- =====================================================
CREATE TABLE IF NOT EXISTS tuleap_webhook_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    tuleap_artifact_id INTEGER NOT NULL,
    tuleap_tracker_id INTEGER,
    artifact_type VARCHAR(20),  -- 'bug', 'test_case', 'task'
    action VARCHAR(50) NOT NULL,  -- 'create', 'update'

    payload_hash VARCHAR(64) NOT NULL,
    raw_payload JSONB,

    processing_status VARCHAR(20) DEFAULT 'received',  -- 'received', 'processed', 'failed', 'duplicate', 'rejected'
    processing_result TEXT,
    error_message TEXT,

    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Unique constraint for idempotency
    UNIQUE(tuleap_artifact_id, payload_hash)
);

CREATE INDEX IF NOT EXISTS idx_webhook_log_artifact ON tuleap_webhook_log(tuleap_artifact_id);
CREATE INDEX IF NOT EXISTS idx_webhook_log_status ON tuleap_webhook_log(processing_status);

-- =====================================================
-- TULEAP TASK HISTORY - Archive for rejected/reassigned tasks
-- =====================================================
CREATE TABLE IF NOT EXISTS tuleap_task_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Original Task Reference
    original_task_id UUID,
    tuleap_artifact_id INTEGER NOT NULL,
    tuleap_url TEXT,

    -- Task Data (snapshot at time of removal)
    task_name VARCHAR(500) NOT NULL,
    notes TEXT,
    status VARCHAR(50),
    project_id UUID REFERENCES projects(id),

    -- Previous Resource (who it was assigned to in QC Tool)
    previous_resource_id UUID,
    previous_resource_name VARCHAR(255),

    -- New Assignee (the unknown user it was reassigned to)
    new_assignee_name VARCHAR(255) NOT NULL,

    -- Action Details
    action VARCHAR(50) NOT NULL CHECK (action IN ('reassigned_out', 'rejected_new')),
    action_reason TEXT,

    -- Tuleap Metadata
    tuleap_last_modified TIMESTAMP WITH TIME ZONE,
    raw_tuleap_payload JSONB,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_task_history_tuleap_artifact ON tuleap_task_history(tuleap_artifact_id);
CREATE INDEX IF NOT EXISTS idx_task_history_project ON tuleap_task_history(project_id);
CREATE INDEX IF NOT EXISTS idx_task_history_action ON tuleap_task_history(action);

-- =====================================================
-- ADD TULEAP COLUMNS TO EXISTING TASKS TABLE
-- =====================================================
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tuleap_artifact_id INTEGER UNIQUE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tuleap_url TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS synced_from_tuleap BOOLEAN DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS last_tuleap_sync TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_tasks_tuleap_artifact ON tasks(tuleap_artifact_id) WHERE tuleap_artifact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_synced_from_tuleap ON tasks(synced_from_tuleap) WHERE synced_from_tuleap = TRUE;

-- =====================================================
-- BUG SUMMARY VIEW - Aggregated metrics for dashboard
-- =====================================================
CREATE OR REPLACE VIEW v_bug_summary AS
SELECT
    b.project_id,
    p.project_name,
    COUNT(b.id) AS total_bugs,
    COUNT(b.id) FILTER (WHERE b.status IN ('Open', 'In Progress', 'Reopened')) AS open_bugs,
    COUNT(b.id) FILTER (WHERE b.status IN ('Resolved', 'Closed')) AS closed_bugs,
    COUNT(b.id) FILTER (WHERE b.severity = 'critical') AS critical_bugs,
    COUNT(b.id) FILTER (WHERE b.severity = 'high') AS high_bugs,
    COUNT(b.id) FILTER (WHERE b.severity = 'medium') AS medium_bugs,
    COUNT(b.id) FILTER (WHERE b.severity = 'low') AS low_bugs,
    COUNT(b.id) FILTER (WHERE array_length(b.linked_test_execution_ids, 1) > 0) AS bugs_from_testing,
    COUNT(b.id) FILTER (WHERE b.linked_test_execution_ids IS NULL
        OR array_length(b.linked_test_execution_ids, 1) = 0) AS standalone_bugs,
    MAX(b.reported_date) AS latest_bug_date
FROM bugs b
LEFT JOIN projects p ON b.project_id = p.id
WHERE b.deleted_at IS NULL
GROUP BY b.project_id, p.project_name;

-- =====================================================
-- GLOBAL BUG SUMMARY VIEW - For dashboard totals
-- =====================================================
CREATE OR REPLACE VIEW v_bug_summary_global AS
SELECT
    COUNT(id) AS total_bugs,
    COUNT(id) FILTER (WHERE status IN ('Open', 'In Progress', 'Reopened')) AS open_bugs,
    COUNT(id) FILTER (WHERE status IN ('Resolved', 'Closed')) AS closed_bugs,
    COUNT(id) FILTER (WHERE severity = 'critical') AS critical_bugs,
    COUNT(id) FILTER (WHERE severity = 'high') AS high_bugs,
    COUNT(id) FILTER (WHERE severity = 'medium') AS medium_bugs,
    COUNT(id) FILTER (WHERE severity = 'low') AS low_bugs,
    COUNT(id) FILTER (WHERE array_length(linked_test_execution_ids, 1) > 0) AS bugs_from_testing,
    COUNT(id) FILTER (WHERE linked_test_execution_ids IS NULL
        OR array_length(linked_test_execution_ids, 1) = 0) AS standalone_bugs
FROM bugs
WHERE deleted_at IS NULL;

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE bugs IS 'Bugs/defects synced from Tuleap';
COMMENT ON TABLE tuleap_sync_config IS 'Configuration for mapping Tuleap trackers to QC Tool entities';
COMMENT ON TABLE tuleap_webhook_log IS 'Log of all Tuleap webhooks received for debugging and idempotency';
COMMENT ON TABLE tuleap_task_history IS 'Archive of tasks rejected or removed due to unknown assignee';

COMMENT ON COLUMN bugs.linked_test_execution_ids IS 'Array of test execution IDs where this bug was found';
COMMENT ON COLUMN bugs.linked_test_case_ids IS 'Array of test case IDs linked to this bug';
COMMENT ON COLUMN bugs.bugs_from_testing IS 'Bugs discovered during test execution';

COMMENT ON COLUMN tasks.synced_from_tuleap IS 'TRUE if task was created from Tuleap webhook';
COMMENT ON COLUMN tasks.tuleap_artifact_id IS 'Tuleap artifact ID for synced tasks';

COMMENT ON COLUMN tuleap_task_history.action IS 'rejected_new = new task with unknown assignee, reassigned_out = existing task reassigned to unknown user';

COMMIT;

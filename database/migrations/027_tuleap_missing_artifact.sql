-- 027_tuleap_missing_artifact.sql
-- Tracks artifacts that have gone missing from Tuleap responses, so we can
-- require N consecutive missing cycles before soft-deleting in QC.

CREATE TABLE IF NOT EXISTS tuleap_missing_artifact (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    tuleap_artifact_id INTEGER NOT NULL,
    tracker_type VARCHAR(20) NOT NULL CHECK (tracker_type IN ('bug', 'task', 'user_story', 'test_case')),
    qc_project_id UUID NOT NULL REFERENCES projects(id),

    miss_count INTEGER NOT NULL DEFAULT 1,
    first_missed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_missed_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Set when the artifact reappears (resolved without delete) OR after we soft-delete the QC row
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution VARCHAR(20),  -- 'reappeared' | 'soft_deleted'

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(tuleap_artifact_id, tracker_type)
);

CREATE INDEX IF NOT EXISTS idx_tuleap_missing_unresolved
    ON tuleap_missing_artifact(qc_project_id, tracker_type)
    WHERE resolved_at IS NULL;

COMMENT ON TABLE tuleap_missing_artifact IS
    'Tracks artifacts missing from Tuleap responses across reconcile cycles. miss_count >= 2 triggers soft-delete in QC.';
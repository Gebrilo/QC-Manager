-- Migration 025: User Stories Table
-- Description: Create user_stories table for Tuleap User Story sync, extend tracker_type constraint
-- Date: 2026-04-23

BEGIN;

-- =====================================================
-- ENSURE update_updated_at_column() EXISTS
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- =====================================================
-- USER_STORIES TABLE — Store synced User Stories from Tuleap
-- =====================================================
CREATE TABLE IF NOT EXISTS user_stories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Tuleap Reference
    tuleap_artifact_id INTEGER NOT NULL UNIQUE,
    tuleap_tracker_id  INTEGER,
    tuleap_url         TEXT,

    -- Story Data
    title                VARCHAR(500) NOT NULL,
    description          TEXT,
    acceptance_criteria  TEXT,
    status               VARCHAR(50) NOT NULL DEFAULT 'Draft',
    requirement_version  VARCHAR(50),
    priority             VARCHAR(50),
    ba_author            VARCHAR(255),

    -- Relationships
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

    -- Sync Metadata
    last_sync_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    raw_tuleap_payload JSONB,

    -- Standard audit columns
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_user_stories_tuleap_artifact ON user_stories(tuleap_artifact_id);
CREATE INDEX IF NOT EXISTS idx_user_stories_project_id ON user_stories(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_stories_status ON user_stories(status) WHERE deleted_at IS NULL;

CREATE TRIGGER update_user_stories_updated_at
    BEFORE UPDATE ON user_stories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- EXTEND tuleap_sync_config tracker_type constraint
-- Adds 'user-story' alongside existing 'test_case', 'bug', 'task'
-- =====================================================
ALTER TABLE tuleap_sync_config
    DROP CONSTRAINT IF EXISTS tuleap_sync_config_tracker_type_check;

ALTER TABLE tuleap_sync_config
    ADD CONSTRAINT tuleap_sync_config_tracker_type_check
    CHECK (tracker_type IN ('test_case', 'bug', 'task', 'user-story', 'test-case'));

COMMENT ON TABLE user_stories IS 'User Stories synced from Tuleap tracker 6';
COMMENT ON COLUMN user_stories.tuleap_artifact_id IS 'Tuleap artifact ID — used as the upsert key';
COMMENT ON COLUMN user_stories.status IS 'Tuleap status label: Draft | Changes | Review | Approved';

COMMIT;

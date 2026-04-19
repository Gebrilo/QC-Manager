-- database/migrations/024_idp_enhancements.sql
-- Migration 024: Adds idp_task_links table, attachment ownership/storage columns,
--                per-task requires_attachment toggle, and updated_at auto-update triggers.

BEGIN;

-- 1. Links table: learning resources attached to IDP tasks by managers
CREATE TABLE IF NOT EXISTS idp_task_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES journey_tasks(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    label VARCHAR(500) NOT NULL,
    created_by UUID NOT NULL REFERENCES app_user(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_idp_task_links_task ON idp_task_links(task_id);

-- 2. Attachment ownership: distinguish manager vs resource uploads
ALTER TABLE journey_task_attachments
    ADD COLUMN IF NOT EXISTS uploaded_by_role VARCHAR(20) NOT NULL DEFAULT 'resource'
        CHECK (uploaded_by_role IN ('manager', 'resource'));

-- 3. Attachment storage: Supabase Storage key for IDP files
ALTER TABLE journey_task_attachments
    ADD COLUMN IF NOT EXISTS storage_path TEXT,
    ADD COLUMN IF NOT EXISTS bucket_name VARCHAR(100);

-- 4. Per-task mandatory attachment toggle
ALTER TABLE journey_tasks
    ADD COLUMN IF NOT EXISTS requires_attachment BOOLEAN NOT NULL DEFAULT false;

-- 5. updated_at auto-update triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON journey_chapters;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON journey_chapters
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON journey_tasks;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON journey_tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;

-- Migration 034: Artifact Attachments
-- Shared attachment table for bugs, user stories, and tasks.
-- Storage bucket: artifact-attachments (separate from idp-attachments)
-- Staged uploads live in tmp/<temp_id>/<uuid>_<filename> until artifact is saved.

BEGIN;

CREATE TABLE IF NOT EXISTS artifact_attachments (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    artifact_type    VARCHAR(20) NOT NULL CHECK (artifact_type IN ('bug', 'user_story', 'task')),
    artifact_id      UUID NOT NULL,
    original_name    VARCHAR(500) NOT NULL,
    filename         VARCHAR(500) NOT NULL,
    mime_type        VARCHAR(200) NOT NULL,
    size_bytes       INTEGER NOT NULL DEFAULT 0,
    storage_path     TEXT NOT NULL,
    bucket_name      VARCHAR(100) NOT NULL DEFAULT 'artifact-attachments',
    uploaded_by      UUID REFERENCES app_user(id) ON DELETE SET NULL,
    tuleap_attachment_id INTEGER,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_artifact_attachments_artifact
    ON artifact_attachments(artifact_type, artifact_id);

COMMIT;

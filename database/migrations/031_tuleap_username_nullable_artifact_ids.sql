-- Migration 031: Tuleap username on resources, nullable artifact IDs
-- Date: 2026-05-17

BEGIN;

-- Add tuleap_username to resources for the assigned-to dropdown
ALTER TABLE resources
    ADD COLUMN IF NOT EXISTS tuleap_username VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS idx_resources_tuleap_username
    ON resources(tuleap_username)
    WHERE tuleap_username IS NOT NULL;

-- Make tuleap_artifact_id nullable on bugs (was NOT NULL — blocks local-only creation)
ALTER TABLE bugs
    ALTER COLUMN tuleap_artifact_id DROP NOT NULL;

-- Make tuleap_artifact_id nullable on user_stories (was NOT NULL — same reason)
ALTER TABLE user_stories
    ALTER COLUMN tuleap_artifact_id DROP NOT NULL;

COMMIT;

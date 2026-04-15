-- 018_resource_dashboard.sql
-- Adds submitted_by_resource_id to track who submitted each bug in Tuleap.
-- Separate from owner_resource_id (which tracks the reporter via a different path).

ALTER TABLE bugs
  ADD COLUMN IF NOT EXISTS submitted_by_resource_id UUID
    REFERENCES resources(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bug_submitted_by
  ON bugs(submitted_by_resource_id)
  WHERE deleted_at IS NULL;

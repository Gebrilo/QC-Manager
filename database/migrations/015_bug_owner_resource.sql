-- database/migrations/015_bug_owner_resource.sql
-- Adds immutable bug ownership: set once at first sync, never overwritten.

ALTER TABLE bugs
ADD COLUMN IF NOT EXISTS owner_resource_id UUID REFERENCES resources(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bugs_owner_resource_id
    ON bugs(owner_resource_id)
    WHERE deleted_at IS NULL;

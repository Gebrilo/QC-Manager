-- database/migrations/016_add_updated_by_to_bugs.sql
-- Adds mutable updated_by field: overwritten on every sync, records the Tuleap user who last edited.

ALTER TABLE bugs
ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);

COMMENT ON COLUMN bugs.updated_by IS 'Tuleap user who last updated this bug; synced on every webhook update';

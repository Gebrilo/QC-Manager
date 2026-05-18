-- Migration 032: Add initial_effort and remaining_effort to bugs
-- These columns were accidentally added to user_stories instead of bugs in db.js.
-- The bug persister, PATCH route, and BugForm all reference them on bugs.

BEGIN;

ALTER TABLE bugs
    ADD COLUMN IF NOT EXISTS initial_effort NUMERIC,
    ADD COLUMN IF NOT EXISTS remaining_effort NUMERIC;

COMMIT;

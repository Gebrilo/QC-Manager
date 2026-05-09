-- Migration 026: Fix tracker_type CHECK constraint
-- Migration 025 added 'user-story' and 'test-case' (with dashes), but the
-- application code uses underscored values throughout ('user_story', 'test_case').
-- This caused every unified-poll INSERT/UPDATE for User Story tracker rows to
-- fail with constraint violations. Aligning the constraint with the code.

BEGIN;

ALTER TABLE tuleap_sync_config
    DROP CONSTRAINT IF EXISTS tuleap_sync_config_tracker_type_check;

ALTER TABLE tuleap_sync_config
    ADD CONSTRAINT tuleap_sync_config_tracker_type_check
    CHECK (tracker_type IN ('test_case', 'bug', 'task', 'user_story'));

COMMIT;

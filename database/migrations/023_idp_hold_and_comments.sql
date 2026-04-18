-- database/migrations/023_idp_hold_and_comments.sql
-- Migration 023: Adds ON_HOLD status + hold_reason to user_task_completions,
--                and creates the idp_task_comment table for per-(user, task) threads.

BEGIN;

-- 1. Widen the progress_status whitelist.
--    Drop and recreate the CHECK so it includes ON_HOLD alongside the existing states.
ALTER TABLE user_task_completions
    DROP CONSTRAINT IF EXISTS user_task_completions_progress_status_check;

ALTER TABLE user_task_completions
    ADD CONSTRAINT user_task_completions_progress_status_check
    CHECK (progress_status IN ('TODO', 'IN_PROGRESS', 'ON_HOLD', 'DONE'));

-- 2. Capture the reason a task is on hold at the completion-row level.
--    Nullable: non-null only while progress_status = 'ON_HOLD'.
ALTER TABLE user_task_completions
    ADD COLUMN IF NOT EXISTS hold_reason TEXT;

COMMENT ON COLUMN user_task_completions.hold_reason
    IS 'Reason the task is currently On Hold. Cleared when progress_status leaves ON_HOLD.';

-- 3. Per-(user, task) comment thread. Keyed on (user_id, task_id) so comments
--    survive TODO transitions (which delete the user_task_completions row).
CREATE TABLE IF NOT EXISTS idp_task_comment (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    task_id     UUID        NOT NULL REFERENCES journey_tasks(id) ON DELETE CASCADE,
    author_id   UUID        NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
    body        TEXT        NOT NULL CHECK (length(body) > 0),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_idp_task_comment_user_task
    ON idp_task_comment(user_id, task_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_idp_task_comment_author
    ON idp_task_comment(author_id);

COMMENT ON TABLE idp_task_comment
    IS 'Discussion thread per (user, IDP task). Visible to the user and their managers.';

COMMIT;

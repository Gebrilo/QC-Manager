-- Migration 020: User lifecycle state machine
-- Adds status ENUM, team_membership_active, ready_for_activation to app_user
-- Migrates data from activated / probation_completed booleans
-- activated and probation_completed are kept here and dropped in migration 021
-- after production data is verified.

BEGIN;

-- 1. Add status column (TEXT with CHECK — same pattern as valid_role constraint)
ALTER TABLE app_user
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PREPARATION'
        CHECK (status IN ('PREPARATION', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'));

-- 2. Add team_membership_active (replaces is_active on a future team_memberships table)
ALTER TABLE app_user
    ADD COLUMN IF NOT EXISTS team_membership_active BOOLEAN NOT NULL DEFAULT false;

-- 3. Add ready_for_activation (replaces probation_completed)
ALTER TABLE app_user
    ADD COLUMN IF NOT EXISTS ready_for_activation BOOLEAN NOT NULL DEFAULT false;

-- 4. Migrate existing data
UPDATE app_user SET
    status               = CASE WHEN activated = true THEN 'ACTIVE' ELSE 'PREPARATION' END,
    team_membership_active = COALESCE(activated, false),
    ready_for_activation   = COALESCE(probation_completed, false);

-- 5. Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_app_user_status
    ON app_user(status);
CREATE INDEX IF NOT EXISTS idx_app_user_team_membership_active
    ON app_user(team_membership_active);

COMMIT;

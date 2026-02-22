-- Migration 012: Journey sequencing, XP gating, and manager visibility
-- Adds next_journey_id and required_xp to journeys for sequential linking,
-- and manager_id to app_user for manager visibility features.

-- A) Add journey chaining fields
ALTER TABLE journeys
    ADD COLUMN IF NOT EXISTS next_journey_id UUID REFERENCES journeys(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS required_xp INTEGER NOT NULL DEFAULT 0;

-- B) Add manager relationship to users
ALTER TABLE app_user
    ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES app_user(id) ON DELETE SET NULL;

-- C) Indexes for performance
CREATE INDEX IF NOT EXISTS idx_journeys_next_journey ON journeys(next_journey_id);
CREATE INDEX IF NOT EXISTS idx_app_user_manager      ON app_user(manager_id);

-- Comment for documentation
COMMENT ON COLUMN journeys.next_journey_id IS 'If set, this journey must be completed before next_journey_id becomes accessible';
COMMENT ON COLUMN journeys.required_xp     IS 'Minimum total XP a user must have accumulated to unlock this journey';
COMMENT ON COLUMN app_user.manager_id      IS 'Direct manager of this user; used for manager team-visibility features';

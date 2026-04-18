-- database/migrations/022_idp_support.sql
-- Migration 022: IDP support — extends journeys system for per-user development plans

BEGIN;

-- 1. Distinguish IDP from onboarding journeys; bind IDP to one user
ALTER TABLE journeys
  ADD COLUMN IF NOT EXISTS plan_type TEXT NOT NULL DEFAULT 'onboarding'
    CHECK (plan_type IN ('onboarding', 'idp')),
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES app_user(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_by_manager UUID REFERENCES app_user(id);

-- 2. Objective-level dates (journey_chapters = Objectives in IDP)
ALTER TABLE journey_chapters
  ADD COLUMN IF NOT EXISTS due_date DATE;

ALTER TABLE journey_chapters
  ADD COLUMN IF NOT EXISTS start_date DATE;

-- 3. Task-level dates, priority, difficulty
ALTER TABLE journey_tasks
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS priority TEXT CHECK (priority IN ('low', 'medium', 'high')),
  ADD COLUMN IF NOT EXISTS difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard'));

ALTER TABLE journey_tasks
  ADD COLUMN IF NOT EXISTS start_date DATE;

-- 4. Tri-state task progress for IDP (TODO / IN_PROGRESS / DONE).
--    DEFAULT 'DONE' means all existing onboarding completion rows remain valid.
ALTER TABLE user_task_completions
  ADD COLUMN IF NOT EXISTS progress_status TEXT NOT NULL DEFAULT 'DONE'
    CHECK (progress_status IN ('TODO', 'IN_PROGRESS', 'DONE'));

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_journeys_owner_user ON journeys(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_journeys_plan_type  ON journeys(plan_type);

COMMENT ON COLUMN journeys.plan_type           IS 'onboarding = shared template; idp = per-user development plan';
COMMENT ON COLUMN journeys.owner_user_id       IS 'For IDP plans only: the ACTIVE user this plan belongs to';
COMMENT ON COLUMN journeys.created_by_manager  IS 'Manager who created this IDP plan';

COMMIT;

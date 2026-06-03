-- Migration 037: Access Engine — finish foundation (issue #81)
-- Migration 036 iterated over `test_cases` (plural) but the active table is
-- `test_case` (singular). Add the same access columns to `test_case` and
-- backfill `tuleap_sync_config.default_visibility_scope` so persisters wired
-- up in slice 2 can rely on a non-NULL default.

BEGIN;

-- =====================================================================
-- 1. owner_team_id / visibility_scope / created_by_user_id on test_case
-- =====================================================================
DO $$
DECLARE
    has_test_case BOOLEAN;
    has_deleted_at BOOLEAN;
    where_clause TEXT;
BEGIN
    has_test_case := to_regclass('public.test_case') IS NOT NULL;
    IF NOT has_test_case THEN
        RETURN;
    END IF;

    ALTER TABLE test_case
        ADD COLUMN IF NOT EXISTS owner_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS visibility_scope VARCHAR(20),
        ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES app_user(id) ON DELETE SET NULL;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'test_case' AND column_name = 'deleted_at'
    ) INTO has_deleted_at;
    where_clause := CASE WHEN has_deleted_at THEN ' WHERE deleted_at IS NULL' ELSE '' END;

    EXECUTE 'DROP INDEX IF EXISTS idx_test_case_owner_team_id';
    EXECUTE 'CREATE INDEX idx_test_case_owner_team_id ON test_case(owner_team_id)' || where_clause;
    EXECUTE 'DROP INDEX IF EXISTS idx_test_case_visibility_scope';
    EXECUTE 'CREATE INDEX idx_test_case_visibility_scope ON test_case(visibility_scope)' || where_clause;
END $$;

-- Backfill test_case ownership from projects.team_id
DO $$
BEGIN
    IF to_regclass('public.test_case') IS NULL THEN RETURN; END IF;

    UPDATE test_case tc
    SET owner_team_id = p.team_id
    FROM projects p
    WHERE tc.project_id = p.id AND tc.owner_team_id IS NULL AND p.team_id IS NOT NULL;

    UPDATE test_case SET visibility_scope = 'team' WHERE visibility_scope IS NULL;

    -- created_by bridge: existing test_case rows have created_by as a UUID
    -- in some builds and a VARCHAR(email) in others; only copy when it
    -- already references an app_user.id.
    UPDATE test_case tc
    SET created_by_user_id = u.id
    FROM app_user u
    WHERE tc.created_by_user_id IS NULL
      AND tc.created_by IS NOT NULL
      AND tc.created_by::text = u.id::text;
END $$;

-- =====================================================================
-- 2. Backfill tuleap_sync_config.default_visibility_scope
--    Migration 036 backfilled default_owner_team_id but left
--    default_visibility_scope NULL. Default to 'team' so admins only have
--    to retype when they want something other than the team default.
-- =====================================================================
UPDATE tuleap_sync_config
SET default_visibility_scope = 'team'
WHERE default_visibility_scope IS NULL;

-- =====================================================================
-- 3. Post-migration assertions
-- =====================================================================
DO $$
DECLARE
    null_tc INT;
    null_cfg INT;
BEGIN
    IF to_regclass('public.test_case') IS NOT NULL THEN
        SELECT COUNT(*) INTO null_tc FROM test_case
        WHERE owner_team_id IS NULL AND project_id IS NOT NULL;
        IF null_tc > 5 THEN
            RAISE EXCEPTION 'Migration 037: % test_case rows have NULL owner_team_id after backfill (expected <= 5)', null_tc;
        END IF;
    END IF;

    SELECT COUNT(*) INTO null_cfg FROM tuleap_sync_config
    WHERE default_visibility_scope IS NULL;
    IF null_cfg > 0 THEN
        RAISE EXCEPTION 'Migration 037: % tuleap_sync_config rows still have NULL default_visibility_scope after backfill', null_cfg;
    END IF;
END $$;

COMMIT;

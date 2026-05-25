-- Migration 035: Sync state columns and canonical bug constraints
-- Adds shared sync-state metadata to Tuleap-managed artifact tables, backfills
-- Tuleap-originated rows as synced, and prevents non-canonical bug labels.

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Sync-state columns
-- ---------------------------------------------------------------------
DO $$
DECLARE
    artifact_table TEXT;
    has_tuleap_artifact_id BOOLEAN;
    timestamp_sources TEXT[];
    timestamp_expr TEXT;
BEGIN
    -- test_case is the active table; test_cases is retained for older installs.
    FOREACH artifact_table IN ARRAY ARRAY['tasks', 'bugs', 'user_stories', 'test_case', 'test_cases']
    LOOP
        IF to_regclass(format('public.%I', artifact_table)) IS NULL THEN
            CONTINUE;
        END IF;

        EXECUTE format(
            'ALTER TABLE %I
                ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT ''pending'',
                ADD COLUMN IF NOT EXISTS last_sync_attempted_at TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS last_sync_error TEXT',
            artifact_table
        );

        EXECUTE format('ALTER TABLE %I ALTER COLUMN sync_status SET DEFAULT ''pending''', artifact_table);

        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = artifact_table
              AND column_name = 'tuleap_artifact_id'
        ) INTO has_tuleap_artifact_id;

        IF has_tuleap_artifact_id THEN
            timestamp_sources := ARRAY['last_sync_attempted_at'];

            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = artifact_table
                  AND column_name = 'last_tuleap_sync'
            ) THEN
                timestamp_sources := array_append(timestamp_sources, 'last_tuleap_sync');
            END IF;

            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = artifact_table
                  AND column_name = 'last_sync_at'
            ) THEN
                timestamp_sources := array_append(timestamp_sources, 'last_sync_at');
            END IF;

            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = artifact_table
                  AND column_name = 'updated_at'
            ) THEN
                timestamp_sources := array_append(timestamp_sources, 'updated_at');
            END IF;

            timestamp_expr := array_to_string(timestamp_sources, ', ') || ', NOW()';

            EXECUTE format(
                'UPDATE %I
                 SET sync_status = ''synced'',
                     last_sync_attempted_at = COALESCE(%s),
                     last_sync_error = NULL
                 WHERE tuleap_artifact_id IS NOT NULL',
                artifact_table,
                timestamp_expr
            );
        END IF;

        EXECUTE format(
            'UPDATE %I
             SET sync_status = ''pending''
             WHERE sync_status IS NULL
                OR sync_status NOT IN (''synced'',''pending'',''failed'',''standalone'')',
            artifact_table
        );

        EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', artifact_table, artifact_table || '_sync_status_check');
        EXECUTE format(
            'ALTER TABLE %I ADD CONSTRAINT %I
             CHECK (sync_status IN (''synced'',''pending'',''failed'',''standalone''))',
            artifact_table,
            artifact_table || '_sync_status_check'
        );
    END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 2. Defensive bug status/severity normalization
-- ---------------------------------------------------------------------
UPDATE bugs
SET status = CASE LOWER(TRIM(status))
    WHEN 'open' THEN 'New'
    WHEN 'new' THEN 'New'
    WHEN 'backlog' THEN 'New'
    WHEN 'in progress' THEN 'In Progress'
    WHEN 'assigned' THEN 'Assigned'
    WHEN 'reopened' THEN 'Reopened'
    WHEN 'blocked' THEN 'Blocked'
    WHEN 'resolved' THEN 'Fixed'
    WHEN 'fixed' THEN 'Fixed'
    WHEN 'verified' THEN 'Verified'
    WHEN 'duplicate' THEN 'Duplicate'
    WHEN 'closed' THEN 'Closed'
    ELSE 'New'
END
WHERE status IS NULL
   OR status NOT IN ('New','In Progress','Assigned','Reopened','Blocked','Fixed','Verified','Duplicate','Closed');

UPDATE bugs
SET severity = CASE LOWER(TRIM(severity))
    WHEN 'critical' THEN 'Critical Impact'
    WHEN 'critical impact' THEN 'Critical Impact'
    WHEN 'high' THEN 'Major impact'
    WHEN 'major impact' THEN 'Major impact'
    WHEN 'medium' THEN 'Minor Impact'
    WHEN 'minor impact' THEN 'Minor Impact'
    WHEN 'low' THEN 'Cosmetic impact'
    WHEN 'cosmetic impact' THEN 'Cosmetic impact'
    WHEN 'none' THEN 'None'
    ELSE 'None'
END
WHERE severity IS NULL
   OR severity NOT IN ('Critical Impact','Major impact','Minor Impact','Cosmetic impact','None');

ALTER TABLE bugs ALTER COLUMN status SET DEFAULT 'New';
ALTER TABLE bugs ALTER COLUMN severity SET DEFAULT 'None';

ALTER TABLE bugs DROP CONSTRAINT IF EXISTS bugs_status_canonical;
ALTER TABLE bugs ADD CONSTRAINT bugs_status_canonical
    CHECK (status IN ('New','In Progress','Assigned','Reopened','Blocked','Fixed','Verified','Duplicate','Closed'));

ALTER TABLE bugs DROP CONSTRAINT IF EXISTS bugs_severity_canonical;
ALTER TABLE bugs ADD CONSTRAINT bugs_severity_canonical
    CHECK (severity IN ('Critical Impact','Major impact','Minor Impact','Cosmetic impact','None'));

COMMIT;

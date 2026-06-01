-- Migration 036: Access Engine foundation (issue #80)
-- Strictly additive. Adds team_types, project_teams, project_managers,
-- artifact_access, role_permissions, default_artifact_visibility, feature_flags
-- and per-artifact ownership/visibility columns. Backfills from existing data.
-- All operations idempotent; safe to re-run.

BEGIN;

-- =====================================================================
-- 1. team_types lookup + seed
-- =====================================================================
CREATE TABLE IF NOT EXISTS team_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO team_types (code, name, description) VALUES
    ('qc', 'QC', 'Quality Control team'),
    ('dev', 'Development', 'Development team'),
    ('commercial', 'Commercial', 'Commercial / sales team'),
    ('pm', 'Project Management', 'Project management team'),
    ('other', 'Other', 'Uncategorized team')
ON CONFLICT (code) DO NOTHING;

-- 2. teams.team_type_id; default existing teams to 'other'
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='teams' AND column_name='team_type_id') THEN
        ALTER TABLE teams ADD COLUMN team_type_id UUID REFERENCES team_types(id);
    END IF;
END $$;

UPDATE teams SET team_type_id = (SELECT id FROM team_types WHERE code = 'other')
WHERE team_type_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_teams_team_type_id ON teams(team_type_id);

-- =====================================================================
-- 3. project_teams (multi-team per project)
-- =====================================================================
CREATE TABLE IF NOT EXISTS project_teams (
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_project_teams_team_id ON project_teams(team_id);

INSERT INTO project_teams (project_id, team_id)
SELECT id, team_id FROM projects WHERE team_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 4. project_managers (co-PM supported)
-- =====================================================================
CREATE TABLE IF NOT EXISTS project_managers (
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES app_user(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_managers_user_id ON project_managers(user_id);

-- =====================================================================
-- 5. owner_team_id / visibility_scope / created_by_user_id on every artifact
-- =====================================================================
DO $$
DECLARE
    artifact_table TEXT;
    has_deleted_at BOOLEAN;
    where_clause TEXT;
BEGIN
    FOREACH artifact_table IN ARRAY ARRAY['bugs','tasks','test_cases','test_executions','test_suites','user_stories']
    LOOP
        IF to_regclass(format('public.%I', artifact_table)) IS NULL THEN CONTINUE; END IF;
        EXECUTE format('ALTER TABLE %I
            ADD COLUMN IF NOT EXISTS owner_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS visibility_scope VARCHAR(20),
            ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES app_user(id) ON DELETE SET NULL',
            artifact_table);

        -- Only filter by deleted_at on tables that actually have soft-delete
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = artifact_table AND column_name = 'deleted_at'
        ) INTO has_deleted_at;
        where_clause := CASE WHEN has_deleted_at THEN ' WHERE deleted_at IS NULL' ELSE '' END;

        EXECUTE format('DROP INDEX IF EXISTS idx_%s_owner_team_id', artifact_table);
        EXECUTE format('CREATE INDEX idx_%s_owner_team_id ON %I(owner_team_id)%s',
                       artifact_table, artifact_table, where_clause);
        EXECUTE format('DROP INDEX IF EXISTS idx_%s_visibility_scope', artifact_table);
        EXECUTE format('CREATE INDEX idx_%s_visibility_scope ON %I(visibility_scope)%s',
                       artifact_table, artifact_table, where_clause);
    END LOOP;
END $$;

-- =====================================================================
-- 6. artifact_access ACL
-- =====================================================================
CREATE TABLE IF NOT EXISTS artifact_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    artifact_type VARCHAR(40) NOT NULL,
    artifact_id UUID NOT NULL,
    subject_type VARCHAR(10) NOT NULL CHECK (subject_type IN ('user','team','role')),
    subject_id VARCHAR(255) NOT NULL,
    action VARCHAR(50) NOT NULL,
    granted_by UUID REFERENCES app_user(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (artifact_type, artifact_id, subject_type, subject_id, action)
);
CREATE INDEX IF NOT EXISTS idx_artifact_access_artifact ON artifact_access(artifact_type, artifact_id);
CREATE INDEX IF NOT EXISTS idx_artifact_access_subject ON artifact_access(subject_type, subject_id);

-- =====================================================================
-- 7. role_permissions (normalized form of custom_roles.permissions)
-- =====================================================================
CREATE TABLE IF NOT EXISTS role_permissions (
    role_identifier VARCHAR(64) NOT NULL,
    permission_key VARCHAR(100) NOT NULL,
    granted_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role_identifier, permission_key)
);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_identifier);

-- =====================================================================
-- 8. default_artifact_visibility (admin-editable defaults table)
-- =====================================================================
CREATE TABLE IF NOT EXISTS default_artifact_visibility (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_type_id UUID NOT NULL REFERENCES team_types(id) ON DELETE CASCADE,
    artifact_type VARCHAR(40) NOT NULL,
    default_scope VARCHAR(20) NOT NULL CHECK (default_scope IN ('private','team','project','admin_only')),
    default_acl_grants JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (team_type_id, artifact_type)
);

-- Seed per the PRD table
INSERT INTO default_artifact_visibility (team_type_id, artifact_type, default_scope, default_acl_grants)
SELECT tt.id, x.artifact_type, x.scope, x.grants::jsonb
FROM team_types tt
JOIN (VALUES
    ('qc','test_case','team','[]'),
    ('qc','test_run','team','[]'),
    ('qc','bug','team','[{"role":"pm","action":"view"}]'),
    ('qc','task','team','[{"role":"pm","action":"view"}]'),
    ('dev','task','team','[{"role":"pm","action":"view"}]'),
    ('dev','bug','team','[{"role":"pm","action":"view"}]'),
    ('commercial','task','team','[{"role":"pm","action":"view"}]'),
    ('pm','task','project','[]')
) AS x(team_code, artifact_type, scope, grants) ON tt.code = x.team_code
ON CONFLICT (team_type_id, artifact_type) DO NOTHING;

-- Wildcard '*' team_type: user_story → project for every team_type
INSERT INTO default_artifact_visibility (team_type_id, artifact_type, default_scope, default_acl_grants)
SELECT id, 'user_story', 'project', '[]'::jsonb FROM team_types
ON CONFLICT (team_type_id, artifact_type) DO NOTHING;

-- =====================================================================
-- 9. tuleap_sync_config: default_owner_team_id, default_visibility_scope
-- =====================================================================
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='tuleap_sync_config' AND column_name='default_owner_team_id') THEN
        ALTER TABLE tuleap_sync_config ADD COLUMN default_owner_team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='tuleap_sync_config' AND column_name='default_visibility_scope') THEN
        ALTER TABLE tuleap_sync_config ADD COLUMN default_visibility_scope VARCHAR(20);
    END IF;
END $$;

-- Backfill default_owner_team_id from the project's team_id where possible
UPDATE tuleap_sync_config tsc
SET default_owner_team_id = p.team_id
FROM projects p
WHERE tsc.qc_project_id = p.id
  AND tsc.default_owner_team_id IS NULL
  AND p.team_id IS NOT NULL;

-- =====================================================================
-- 10. Widen app_user.role CHECK to include pm, member, team_manager
-- =====================================================================
ALTER TABLE app_user DROP CONSTRAINT IF EXISTS valid_role;
ALTER TABLE app_user ADD CONSTRAINT valid_role CHECK (role IN
    ('admin','manager','team_manager','pm','member','user','viewer','tester','contributor'));

-- =====================================================================
-- 11. Migrate legacy roles user/tester/contributor → member
-- =====================================================================
UPDATE app_user SET role = 'member'
WHERE role IN ('user','tester','contributor');

-- =====================================================================
-- 12. Backfill owner_team_id (from projects.team_id) + visibility_scope = 'team'
-- =====================================================================
DO $$
DECLARE
    artifact_table TEXT;
BEGIN
    FOREACH artifact_table IN ARRAY ARRAY['bugs','tasks','test_cases','test_executions','test_suites','user_stories']
    LOOP
        IF to_regclass(format('public.%I', artifact_table)) IS NULL THEN CONTINUE; END IF;
        EXECUTE format(
            'UPDATE %I a
             SET owner_team_id = p.team_id
             FROM projects p
             WHERE a.project_id = p.id AND a.owner_team_id IS NULL AND p.team_id IS NOT NULL',
            artifact_table);
        EXECUTE format(
            'UPDATE %I SET visibility_scope = ''team'' WHERE visibility_scope IS NULL',
            artifact_table);
    END LOOP;
END $$;

-- =====================================================================
-- 13. Backfill created_by_user_id from email bridge (best-effort)
--     Bug: bridge through resources.tuleap_username → resources.user_id
--     Task: bridge through resource1_id → resources.user_id
-- =====================================================================
UPDATE bugs b
SET created_by_user_id = r.user_id
FROM resources r
WHERE b.created_by_user_id IS NULL
  AND r.tuleap_username = b.reported_by
  AND r.user_id IS NOT NULL;

UPDATE tasks t
SET created_by_user_id = r.user_id
FROM resources r
WHERE t.created_by_user_id IS NULL
  AND t.resource1_id = r.id
  AND r.user_id IS NOT NULL;

-- =====================================================================
-- 14. feature_flags table
-- =====================================================================
CREATE TABLE IF NOT EXISTS feature_flags (
    key VARCHAR(120) PRIMARY KEY,
    value JSONB NOT NULL DEFAULT 'false'::jsonb,
    description TEXT,
    updated_by UUID REFERENCES app_user(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO feature_flags (key, value, description) VALUES
    ('access_engine.bugs', 'false'::jsonb, 'Enable Access Engine enforcement on bug routes'),
    ('access_engine.tasks', 'false'::jsonb, 'Enable Access Engine enforcement on task routes'),
    ('access_engine.test_cases', 'false'::jsonb, 'Enable Access Engine enforcement on test_case routes'),
    ('access_engine.test_executions', 'false'::jsonb, 'Enable Access Engine enforcement on test_execution routes'),
    ('access_engine.test_suites', 'false'::jsonb, 'Enable Access Engine enforcement on test_suite routes'),
    ('access_engine.user_stories', 'false'::jsonb, 'Enable Access Engine enforcement on user_story routes')
ON CONFLICT (key) DO NOTHING;

-- =====================================================================
-- 15. role_permissions backfill from custom_roles + catalog defaults
--     Catalog defaults are loaded by the API bootstrap; here we mirror
--     custom_roles.permissions array into the normalized table.
-- =====================================================================
INSERT INTO role_permissions (role_identifier, permission_key, granted_by)
SELECT cr.name, perm, cr.created_by
FROM custom_roles cr, UNNEST(cr.permissions) AS perm
WHERE perm IS NOT NULL
ON CONFLICT (role_identifier, permission_key) DO NOTHING;

-- =====================================================================
-- 16. POST-MIGRATION ASSERTIONS
-- =====================================================================
DO $$
DECLARE
    null_bugs INT;
    null_tasks INT;
BEGIN
    SELECT COUNT(*) INTO null_bugs FROM bugs WHERE owner_team_id IS NULL AND project_id IS NOT NULL;
    SELECT COUNT(*) INTO null_tasks FROM tasks WHERE owner_team_id IS NULL AND project_id IS NOT NULL;

    -- Allow up to 5 NULL rows per artifact (orphan rows whose project has no team)
    IF null_bugs > 5 THEN
        RAISE EXCEPTION 'Migration 036 assertion failed: % bugs have NULL owner_team_id after backfill (expected <= 5)', null_bugs;
    END IF;
    IF null_tasks > 5 THEN
        RAISE EXCEPTION 'Migration 036 assertion failed: % tasks have NULL owner_team_id after backfill (expected <= 5)', null_tasks;
    END IF;
END $$;

COMMIT;

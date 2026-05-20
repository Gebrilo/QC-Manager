const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
const isSupabase = databaseUrl?.includes('supabase.co');
const sslConfig = process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false };

const pool = new Pool(
    databaseUrl
        ? { 
            connectionString: databaseUrl,
            ssl: isSupabase ? { rejectUnauthorized: false } : sslConfig 
          }
        : {
            user: process.env.POSTGRES_USER,
            host: process.env.POSTGRES_HOST || 'qc-postgres',
            database: process.env.POSTGRES_DB,
            password: process.env.POSTGRES_PASSWORD,
            port: parseInt(process.env.POSTGRES_PORT, 10) || 5432,
        }
);

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

const runMigrations = async () => {
    const client = await pool.connect();
    try {
        console.log('Running database migrations...');

        await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

        await client.query(`
            CREATE TABLE IF NOT EXISTS projects (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                project_id VARCHAR(50),
                project_name VARCHAR(255) NOT NULL,
                owner VARCHAR(255),
                total_weight INTEGER,
                priority VARCHAR(20),
                start_date DATE,
                target_date DATE,
                status VARCHAR(50) NOT NULL DEFAULT 'active',
                description TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                created_by VARCHAR(255),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_by VARCHAR(255),
                deleted_at TIMESTAMP WITH TIME ZONE,
                deleted_by VARCHAR(255)
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS resources (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                resource_name VARCHAR(100) NOT NULL,
                user_id UUID,
                weekly_capacity_hrs INTEGER NOT NULL DEFAULT 40,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                email VARCHAR(255),
                department VARCHAR(100),
                role VARCHAR(100),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                created_by VARCHAR(255),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_by VARCHAR(255),
                deleted_at TIMESTAMP WITH TIME ZONE,
                deleted_by VARCHAR(255)
            )
        `);

        // Add user_id column to resources if not exists (links to app_user)
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='resources' AND column_name='user_id') THEN
                    ALTER TABLE resources ADD COLUMN user_id UUID;
                END IF;
            END $$;
        `);
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_resources_user_id_active ON resources(user_id) WHERE deleted_at IS NULL AND user_id IS NOT NULL`);

        await client.query(`
            CREATE TABLE IF NOT EXISTS tasks (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                task_id VARCHAR(50),
                project_id UUID,
                task_name VARCHAR(255) NOT NULL,
                description TEXT,
                status VARCHAR(50) NOT NULL DEFAULT 'Todo',
                assignee VARCHAR(255),
                priority VARCHAR(20) DEFAULT 'medium',
                tags TEXT[],
                notes TEXT,
                resource1_id UUID,
                resource2_id UUID,
                estimate_days NUMERIC,
                r1_estimate_hrs NUMERIC DEFAULT 0,
                r1_actual_hrs NUMERIC DEFAULT 0,
                r2_estimate_hrs NUMERIC DEFAULT 0,
                r2_actual_hrs NUMERIC DEFAULT 0,
                due_date DATE,
                deadline DATE,
                completed_date DATE,
                expected_start_date DATE,
                actual_start_date DATE,
                completed_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                created_by VARCHAR(255),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_by VARCHAR(255),
                deleted_at TIMESTAMP WITH TIME ZONE,
                deleted_by VARCHAR(255)
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS audit_log (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                entity_type VARCHAR(50) NOT NULL,
                entity_uuid UUID,
                action VARCHAR(50) NOT NULL,
                before_state JSONB,
                after_state JSONB,
                changed_fields TEXT[],
                change_summary TEXT,
                user_email VARCHAR(255) DEFAULT 'system',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Add missing columns if table exists
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_log' AND column_name='entity_uuid') THEN
                    ALTER TABLE audit_log ADD COLUMN entity_uuid UUID;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_log' AND column_name='entity_id') THEN
                    ALTER TABLE audit_log ADD COLUMN entity_id UUID;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_log' AND column_name='user_id') THEN
                    ALTER TABLE audit_log ADD COLUMN user_id UUID;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_log' AND column_name='details') THEN
                    ALTER TABLE audit_log ADD COLUMN details JSONB;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_log' AND column_name='before_state') THEN
                    ALTER TABLE audit_log ADD COLUMN before_state JSONB;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_log' AND column_name='after_state') THEN
                    ALTER TABLE audit_log ADD COLUMN after_state JSONB;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_log' AND column_name='changed_fields') THEN
                    ALTER TABLE audit_log ADD COLUMN changed_fields TEXT[];
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_log' AND column_name='change_summary') THEN
                    ALTER TABLE audit_log ADD COLUMN change_summary TEXT;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_log' AND column_name='user_email') THEN
                    ALTER TABLE audit_log ADD COLUMN user_email VARCHAR(255) DEFAULT 'system';
                END IF;
            END $$;
        `);

        // Add start date columns to tasks if they don't exist
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                              WHERE table_name='tasks' AND column_name='expected_start_date') THEN
                    ALTER TABLE tasks ADD COLUMN expected_start_date DATE;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                              WHERE table_name='tasks' AND column_name='actual_start_date') THEN
                    ALTER TABLE tasks ADD COLUMN actual_start_date DATE;
                END IF;
            END $$;
        `);

        // Drop and recreate tables that need schema changes
        await client.query(`DROP TABLE IF EXISTS quality_gates CASCADE`);
        await client.query(`DROP TABLE IF EXISTS release_approvals CASCADE`);
        await client.query(`DROP TABLE IF EXISTS report_jobs CASCADE`);

        await client.query(`
            CREATE TABLE IF NOT EXISTS quality_gates (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                project_id UUID NOT NULL UNIQUE,
                min_pass_rate NUMERIC DEFAULT 80,
                max_critical_defects INTEGER DEFAULT 0,
                min_test_coverage NUMERIC DEFAULT 75,
                is_mandatory BOOLEAN DEFAULT TRUE,
                notes TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS release_approvals (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                project_id UUID NOT NULL,
                release_version VARCHAR(50),
                status VARCHAR(50) NOT NULL,
                approver_name VARCHAR(255) NOT NULL,
                comments TEXT,
                gate_snapshot JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS report_jobs (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                report_type VARCHAR(50) NOT NULL,
                format VARCHAR(20) NOT NULL DEFAULT 'json',
                status VARCHAR(50) NOT NULL DEFAULT 'pending',
                filters JSONB,
                result_data JSONB,
                download_url TEXT,
                error_message TEXT,
                user_email VARCHAR(255),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP WITH TIME ZONE
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS test_cases (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                test_case_id VARCHAR(50) NOT NULL,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                priority VARCHAR(20) DEFAULT 'medium',
                status VARCHAR(50) DEFAULT 'active',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS test_run (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                run_id VARCHAR(50) NOT NULL UNIQUE,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                status VARCHAR(50) NOT NULL DEFAULT 'in_progress',
                started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP WITH TIME ZONE,
                deleted_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS test_execution (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                test_run_id UUID NOT NULL REFERENCES test_run(id) ON DELETE CASCADE,
                test_case_id UUID REFERENCES test_cases(id) ON DELETE SET NULL,
                status VARCHAR(20) NOT NULL,
                notes TEXT,
                duration_seconds INTEGER,
                defect_ids TEXT[],
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Test Executions table for tracking test run results (legacy/other widget support)
        await client.query(`
            CREATE TABLE IF NOT EXISTS test_executions (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
                test_suite_name VARCHAR(255) NOT NULL,
                execution_date DATE NOT NULL DEFAULT CURRENT_DATE,
                passed INTEGER NOT NULL DEFAULT 0,
                failed INTEGER NOT NULL DEFAULT 0,
                not_executed INTEGER NOT NULL DEFAULT 0,
                blocked INTEGER NOT NULL DEFAULT 0,
                total_cases INTEGER GENERATED ALWAYS AS (passed + failed + not_executed + blocked) STORED,
                pass_rate NUMERIC(5,2) GENERATED ALWAYS AS (
                    CASE WHEN (passed + failed + not_executed + blocked) > 0 
                    THEN ROUND((passed::NUMERIC / (passed + failed + not_executed + blocked)) * 100, 2)
                    ELSE 0 END
                ) STORED,
                run_number INTEGER NOT NULL DEFAULT 1,
                executed_by VARCHAR(255),
                environment VARCHAR(100),
                notes TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Task Comments table for tracking comments on tasks
        await client.query(`
            CREATE TABLE IF NOT EXISTS task_comments (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                comment TEXT NOT NULL,
                created_by VARCHAR(255) DEFAULT 'system',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create index for efficient comment retrieval
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_task_comments_task_id
            ON task_comments(task_id)
        `);

        // =====================================================
        // TULEAP INTEGRATION TABLES
        // =====================================================

        // Bugs table for Tuleap-synced defects
        await client.query(`
            CREATE TABLE IF NOT EXISTS bugs (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                tuleap_artifact_id INTEGER NOT NULL UNIQUE,
                tuleap_tracker_id INTEGER,
                tuleap_url TEXT,
                bug_id VARCHAR(50) NOT NULL,
                title VARCHAR(500) NOT NULL,
                description TEXT,
                status VARCHAR(50) NOT NULL DEFAULT 'Open',
                severity VARCHAR(20) DEFAULT 'medium',
                priority VARCHAR(20) DEFAULT 'medium',
                bug_type VARCHAR(50),
                component VARCHAR(100),
                project_id UUID REFERENCES projects(id),
                linked_test_case_ids UUID[],
                linked_test_execution_ids UUID[],
                reported_by VARCHAR(255),
                assigned_to VARCHAR(255),
                reported_date TIMESTAMP WITH TIME ZONE,
                resolved_date TIMESTAMP WITH TIME ZONE,
                last_sync_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                raw_tuleap_payload JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                deleted_at TIMESTAMP WITH TIME ZONE
            )
        `);

        // Bug Indexes
        await client.query(`CREATE INDEX IF NOT EXISTS idx_bugs_project_id ON bugs(project_id) WHERE deleted_at IS NULL`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_bugs_status ON bugs(status) WHERE deleted_at IS NULL`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_bugs_severity ON bugs(severity) WHERE deleted_at IS NULL`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_bugs_tuleap_artifact ON bugs(tuleap_artifact_id)`);

        // Add source column (Hybrid Option C)
        await client.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bugs' AND column_name='source') THEN
                    ALTER TABLE bugs ADD COLUMN source TEXT DEFAULT 'EXPLORATORY';
                END IF;
            END $$;
        `);
        await client.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='source_check') THEN
                    ALTER TABLE bugs ADD CONSTRAINT source_check CHECK (source IN ('TEST_CASE', 'EXPLORATORY'));
                END IF;
            END $$;
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_bug_source ON bugs(source)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_bug_project_source ON bugs(project_id, source) WHERE deleted_at IS NULL`);

        // Bug ownership: immutable FK to resources, set once on first sync
        await client.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bugs' AND column_name='owner_resource_id') THEN
                    ALTER TABLE bugs ADD COLUMN owner_resource_id UUID REFERENCES resources(id) ON DELETE SET NULL;
                END IF;
            END $$;
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_bugs_owner_resource_id ON bugs(owner_resource_id) WHERE deleted_at IS NULL`);

        // Tuleap Sync Configuration
        await client.query(`
            CREATE TABLE IF NOT EXISTS tuleap_sync_config (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                tuleap_project_id INTEGER NOT NULL,
                tuleap_tracker_id INTEGER NOT NULL,
                tuleap_base_url TEXT,
                tracker_type VARCHAR(20) NOT NULL CHECK (tracker_type IN ('test_case', 'bug', 'task')),
                qc_project_id UUID REFERENCES projects(id),
                field_mappings JSONB NOT NULL DEFAULT '{}',
                status_mappings JSONB NOT NULL DEFAULT '{}',
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tuleap_project_id, tuleap_tracker_id)
            )
        `);

        // Tuleap Webhook Log
        await client.query(`
            CREATE TABLE IF NOT EXISTS tuleap_webhook_log (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                tuleap_artifact_id INTEGER NOT NULL,
                tuleap_tracker_id INTEGER,
                artifact_type VARCHAR(20),
                action VARCHAR(50) NOT NULL,
                payload_hash VARCHAR(64) NOT NULL,
                raw_payload JSONB,
                processing_status VARCHAR(20) DEFAULT 'received',
                processing_result TEXT,
                error_message TEXT,
                processed_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tuleap_artifact_id, payload_hash)
            )
        `);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_webhook_log_artifact ON tuleap_webhook_log(tuleap_artifact_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_webhook_log_status ON tuleap_webhook_log(processing_status)`);

        // User Stories (synced from Tuleap)
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_stories (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                tuleap_artifact_id INTEGER NOT NULL UNIQUE,
                tuleap_tracker_id  INTEGER,
                tuleap_url         TEXT,
                title              VARCHAR(500) NOT NULL,
                description        TEXT,
                acceptance_criteria TEXT,
                status             VARCHAR(50) NOT NULL DEFAULT 'Draft',
                requirement_version VARCHAR(50),
                priority           VARCHAR(50),
                ba_author          VARCHAR(255),
                project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
                last_sync_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                raw_tuleap_payload JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                deleted_at TIMESTAMP WITH TIME ZONE
            )
        `);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_user_stories_tuleap_artifact ON user_stories(tuleap_artifact_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_user_stories_project_id ON user_stories(project_id) WHERE deleted_at IS NULL`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_user_stories_status ON user_stories(status) WHERE deleted_at IS NULL`);

        await client.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'tuleap_sync_config_tracker_type_check'
                    AND conrelid = 'tuleap_sync_config'::regclass
                ) THEN
                    ALTER TABLE tuleap_sync_config DROP CONSTRAINT tuleap_sync_config_tracker_type_check;
                END IF;
            END $$;
        `);
        await client.query(`ALTER TABLE tuleap_sync_config ADD CONSTRAINT tuleap_sync_config_tracker_type_check CHECK (tracker_type IN ('test_case', 'bug', 'task', 'user_story'))`);

        // Tuleap Task History
        await client.query(`
            CREATE TABLE IF NOT EXISTS tuleap_task_history (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                original_task_id UUID,
                tuleap_artifact_id INTEGER NOT NULL,
                tuleap_url TEXT,
                task_name VARCHAR(500) NOT NULL,
                notes TEXT,
                status VARCHAR(50),
                project_id UUID REFERENCES projects(id),
                previous_resource_id UUID,
                previous_resource_name VARCHAR(255),
                new_assignee_name VARCHAR(255) NOT NULL,
                action VARCHAR(50) NOT NULL CHECK (action IN ('reassigned_out', 'rejected_new', 'deleted_from_tuleap', 'team_change_delete')),
                action_reason TEXT,
                tuleap_last_modified TIMESTAMP WITH TIME ZONE,
                raw_tuleap_payload JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_task_history_tuleap_artifact ON tuleap_task_history(tuleap_artifact_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_task_history_project ON tuleap_task_history(project_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_task_history_action ON tuleap_task_history(action)`);

        // Migrate: expand action check constraint to include delete actions
        await client.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'tuleap_task_history_action_check'
                    AND pg_get_constraintdef(oid) NOT LIKE '%deleted_from_tuleap%'
                ) THEN
                    ALTER TABLE tuleap_task_history DROP CONSTRAINT tuleap_task_history_action_check;
                    ALTER TABLE tuleap_task_history ADD CONSTRAINT tuleap_task_history_action_check
                        CHECK (action IN ('reassigned_out', 'rejected_new', 'deleted_from_tuleap', 'team_change_delete'));
                END IF;
            END $$;
        `);

        // Add Tuleap columns to projects table
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='tuleap_project_id') THEN
                    ALTER TABLE projects ADD COLUMN tuleap_project_id INTEGER;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='tuleap_short_name') THEN
                    ALTER TABLE projects ADD COLUMN tuleap_short_name VARCHAR(100);
                END IF;
            END $$;
        `);
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_tuleap_project_id ON projects(tuleap_project_id) WHERE tuleap_project_id IS NOT NULL AND deleted_at IS NULL`);

        // Add Tuleap columns to tasks table
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='tuleap_artifact_id') THEN
                    ALTER TABLE tasks ADD COLUMN tuleap_artifact_id INTEGER UNIQUE;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='tuleap_url') THEN
                    ALTER TABLE tasks ADD COLUMN tuleap_url TEXT;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='synced_from_tuleap') THEN
                    ALTER TABLE tasks ADD COLUMN synced_from_tuleap BOOLEAN DEFAULT FALSE;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='last_tuleap_sync') THEN
                    ALTER TABLE tasks ADD COLUMN last_tuleap_sync TIMESTAMP WITH TIME ZONE;
                END IF;
            END $$;
        `);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_tasks_tuleap_artifact ON tasks(tuleap_artifact_id) WHERE tuleap_artifact_id IS NOT NULL`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_tasks_synced_from_tuleap ON tasks(synced_from_tuleap) WHERE synced_from_tuleap = TRUE`);

        await client.query(`DROP VIEW IF EXISTS v_dashboard_metrics CASCADE`);
        await client.query(`DROP VIEW IF EXISTS v_resources_with_utilization CASCADE`);
        await client.query(`DROP VIEW IF EXISTS v_projects_with_metrics CASCADE`);
        await client.query(`DROP VIEW IF EXISTS v_bug_summary CASCADE`);

        // Bug Summary View (no dependency on normalized tables)
        await client.query(`
            CREATE OR REPLACE VIEW v_bug_summary AS
            SELECT
                b.project_id,
                p.project_name,
                COUNT(b.id) AS total_bugs,
                COUNT(b.id) FILTER (WHERE b.status IN ('Open', 'In Progress', 'Reopened')) AS open_bugs,
                COUNT(b.id) FILTER (WHERE b.status IN ('Resolved', 'Closed')) AS closed_bugs,
                COUNT(b.id) FILTER (WHERE b.severity = 'critical') AS critical_bugs,
                COUNT(b.id) FILTER (WHERE b.severity = 'high') AS high_bugs,
                COUNT(b.id) FILTER (WHERE b.severity = 'medium') AS medium_bugs,
                COUNT(b.id) FILTER (WHERE b.severity = 'low') AS low_bugs,
                COUNT(b.id) FILTER (WHERE b.source = 'TEST_CASE') AS bugs_from_test_cases,
                COUNT(b.id) FILTER (WHERE b.source = 'EXPLORATORY') AS bugs_from_exploratory
            FROM bugs b
            LEFT JOIN projects p ON b.project_id = p.id
            WHERE b.deleted_at IS NULL
            GROUP BY b.project_id, p.project_name
        `);

        await client.query(`
            CREATE OR REPLACE VIEW v_projects_with_metrics AS
            SELECT
                p.id,
                p.project_id,
                p.project_name,
                p.team_id,
                p.owner,
                p.total_weight,
                p.priority,
                p.status AS project_status_field,
                p.description,
                p.start_date,
                p.target_date,
                CASE WHEN p.target_date IS NOT NULL THEN p.target_date - CURRENT_DATE ELSE NULL END AS days_until_target,
                COALESCE(SUM(COALESCE(t.r1_estimate_hrs, 0) + COALESCE(t.r2_estimate_hrs, 0)), 0) AS task_hrs_est,
                COALESCE(SUM(COALESCE(t.r1_actual_hrs, 0) + COALESCE(t.r2_actual_hrs, 0)), 0) AS task_hrs_actual,
                COALESCE(SUM(CASE WHEN t.status = 'Done' THEN COALESCE(t.r1_actual_hrs, 0) + COALESCE(t.r2_actual_hrs, 0) ELSE 0 END), 0) AS task_hrs_done,
                COUNT(t.id) AS tasks_total_count,
                SUM(CASE WHEN t.status = 'Done' THEN 1 ELSE 0 END) AS tasks_done_count,
                SUM(CASE WHEN t.status = 'In Progress' THEN 1 ELSE 0 END) AS tasks_in_progress_count,
                SUM(CASE WHEN t.status = 'Todo' THEN 1 ELSE 0 END) AS tasks_backlog_count,
                CASE WHEN COUNT(t.id) = 0 THEN 'No Tasks' WHEN COUNT(t.id) = SUM(CASE WHEN t.status = 'Done' THEN 1 ELSE 0 END) THEN 'Complete' ELSE 'Active' END AS status,
                CASE
                    WHEN COALESCE(SUM(COALESCE(t.r1_estimate_hrs, 0) + COALESCE(t.r2_estimate_hrs, 0)), 0) > 0
                    THEN ROUND((COALESCE(SUM(CASE WHEN t.status = 'Done' THEN COALESCE(t.r1_actual_hrs, 0) + COALESCE(t.r2_actual_hrs, 0) ELSE 0 END), 0) /
                         COALESCE(SUM(COALESCE(t.r1_estimate_hrs, 0) + COALESCE(t.r2_estimate_hrs, 0)), 1) * 100)::NUMERIC, 2)
                    ELSE 0
                END AS overall_completion_pct,
                CASE
                    WHEN COUNT(t.id) = 0 THEN 'No Tasks'
                    WHEN COUNT(t.id) = SUM(CASE WHEN t.status = 'Done' THEN 1 ELSE 0 END) THEN 'Complete'
                    WHEN CASE WHEN COALESCE(SUM(COALESCE(t.r1_estimate_hrs, 0) + COALESCE(t.r2_estimate_hrs, 0)), 0) > 0
                         THEN (COALESCE(SUM(CASE WHEN t.status = 'Done' THEN COALESCE(t.r1_actual_hrs, 0) + COALESCE(t.r2_actual_hrs, 0) ELSE 0 END), 0) /
                               COALESCE(SUM(COALESCE(t.r1_estimate_hrs, 0) + COALESCE(t.r2_estimate_hrs, 0)), 1) * 100) ELSE 0 END >= 70
                    THEN 'On Track'
                    ELSE 'At Risk'
                END AS dynamic_status,
                p.created_at,
                p.updated_at,
                p.deleted_at
            FROM projects p
            LEFT JOIN tasks t ON p.id = t.project_id AND t.deleted_at IS NULL
            WHERE p.deleted_at IS NULL
            GROUP BY p.id
        `);

        await client.query(`
            CREATE OR REPLACE VIEW v_resources_with_utilization AS
            SELECT
                r.id,
                r.resource_name,
                r.user_id,
                r.weekly_capacity_hrs,
                r.is_active,
                r.email,
                r.department,
                r.role,
                COALESCE(
                    (SELECT SUM(COALESCE(t.r1_estimate_hrs, 0)) FROM tasks t WHERE t.resource1_id = r.id AND t.deleted_at IS NULL AND t.status NOT IN ('Done', 'Cancelled')),
                    0
                ) + COALESCE(
                    (SELECT SUM(COALESCE(t.r2_estimate_hrs, 0)) FROM tasks t WHERE t.resource2_id = r.id AND t.deleted_at IS NULL AND t.status NOT IN ('Done', 'Cancelled')),
                    0
                ) AS current_allocation_hrs,
                CASE 
                    WHEN r.weekly_capacity_hrs > 0 THEN
                        ROUND((
                            (COALESCE((SELECT SUM(COALESCE(t.r1_estimate_hrs, 0)) FROM tasks t WHERE t.resource1_id = r.id AND t.deleted_at IS NULL AND t.status NOT IN ('Done', 'Cancelled')), 0) +
                             COALESCE((SELECT SUM(COALESCE(t.r2_estimate_hrs, 0)) FROM tasks t WHERE t.resource2_id = r.id AND t.deleted_at IS NULL AND t.status NOT IN ('Done', 'Cancelled')), 0)
                            ) / r.weekly_capacity_hrs * 100
                        )::NUMERIC, 2)
                    ELSE 0
                END AS utilization_pct,
                (SELECT COUNT(*) FROM tasks t WHERE (t.resource1_id = r.id OR t.resource2_id = r.id) AND t.deleted_at IS NULL AND t.status = 'In Progress') AS active_tasks_count,
                (SELECT COUNT(*) FROM tasks t WHERE (t.resource1_id = r.id OR t.resource2_id = r.id) AND t.deleted_at IS NULL AND t.status = 'Todo') AS backlog_tasks_count,
                r.created_at,
                r.updated_at,
                r.deleted_at
            FROM resources r
            WHERE r.deleted_at IS NULL
        `);

        await client.query(`
            CREATE OR REPLACE VIEW v_dashboard_metrics AS
            SELECT
                COUNT(DISTINCT t.id) AS total_tasks,
                SUM(CASE WHEN t.status = 'Done' THEN 1 ELSE 0 END) AS tasks_done,
                SUM(CASE WHEN t.status = 'In Progress' THEN 1 ELSE 0 END) AS tasks_in_progress,
                SUM(CASE WHEN t.status = 'Todo' THEN 1 ELSE 0 END) AS tasks_backlog,
                SUM(CASE WHEN t.status = 'Canceled' THEN 1 ELSE 0 END) AS tasks_cancelled,
                CASE 
                    WHEN SUM(COALESCE(t.r1_estimate_hrs, 0) + COALESCE(t.r2_estimate_hrs, 0)) > 0 THEN
                        ROUND((SUM(CASE WHEN t.status = 'Done' THEN COALESCE(t.r1_actual_hrs, 0) + COALESCE(t.r2_actual_hrs, 0) ELSE 0 END) / 
                               NULLIF(SUM(COALESCE(t.r1_estimate_hrs, 0) + COALESCE(t.r2_estimate_hrs, 0)), 0) * 100)::NUMERIC, 2)
                    ELSE 0
                END AS overall_completion_rate_pct,
                SUM(COALESCE(t.r1_estimate_hrs, 0) + COALESCE(t.r2_estimate_hrs, 0)) AS total_estimated_hrs,
                SUM(COALESCE(t.r1_actual_hrs, 0) + COALESCE(t.r2_actual_hrs, 0)) AS total_actual_hrs,
                SUM(COALESCE(t.r1_actual_hrs, 0) + COALESCE(t.r2_actual_hrs, 0)) - SUM(COALESCE(t.r1_estimate_hrs, 0) + COALESCE(t.r2_estimate_hrs, 0)) AS total_hours_variance,
                COUNT(DISTINCT p.id) AS total_projects,
                COUNT(DISTINCT CASE WHEN t.id IS NOT NULL THEN p.id END) AS projects_with_tasks,
                (SELECT COUNT(*) FROM resources WHERE is_active = TRUE AND deleted_at IS NULL) AS active_resources,
                0 AS overallocated_resources,
                CURRENT_TIMESTAMP AS calculated_at
            FROM projects p
            LEFT JOIN tasks t ON p.id = t.project_id AND t.deleted_at IS NULL
            WHERE p.deleted_at IS NULL
        `);

        // =====================================================
        // AUTH & USER MANAGEMENT TABLES
        // =====================================================

        await client.query(`
            CREATE TABLE IF NOT EXISTS app_user (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                email VARCHAR(255) UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                phone VARCHAR(20),
                role VARCHAR(50) NOT NULL DEFAULT 'viewer',
                active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP WITH TIME ZONE,
                CONSTRAINT valid_role CHECK (role IN ('admin', 'manager', 'user', 'viewer', 'contributor'))
            )
        `);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_app_user_email ON app_user(email)`);

        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='app_user' AND column_name='activated') THEN
                    ALTER TABLE app_user ADD COLUMN activated BOOLEAN DEFAULT false;
                    UPDATE app_user SET activated = true WHERE activated IS NULL;
                END IF;
            END $$;
        `);

        await client.query(`
            DO $$
            BEGIN
                ALTER TABLE app_user DROP CONSTRAINT IF EXISTS valid_role;
                ALTER TABLE app_user ADD CONSTRAINT valid_role CHECK (role IN ('admin', 'manager', 'user', 'viewer', 'contributor'));
            EXCEPTION WHEN OTHERS THEN NULL;
            END $$;
        `);

        // Add onboarding_completed column for journey tracking
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='app_user' AND column_name='onboarding_completed') THEN
                    ALTER TABLE app_user ADD COLUMN onboarding_completed BOOLEAN DEFAULT false;
                END IF;
            END $$;
        `);

        // Add display_name column for customisable display
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='app_user' AND column_name='display_name') THEN
                    ALTER TABLE app_user ADD COLUMN display_name VARCHAR(100);
                END IF;
            END $$;
        `);

        // Add preferences JSONB column for per-user UI settings
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='app_user' AND column_name='preferences') THEN
                    ALTER TABLE app_user ADD COLUMN preferences JSONB DEFAULT '{}'::jsonb NOT NULL;
                END IF;
            END $$;
        `);

        // Add probation_completed column for the Resource Allocation feature
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='app_user' AND column_name='probation_completed') THEN
                    ALTER TABLE app_user ADD COLUMN probation_completed BOOLEAN DEFAULT false;
                END IF;
            END $$;
        `);

        // Add manager_id for team hierarchy (Team Journeys feature)
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='app_user' AND column_name='manager_id') THEN
                    ALTER TABLE app_user ADD COLUMN manager_id UUID REFERENCES app_user(id) ON DELETE SET NULL;
                END IF;
            END $$;
        `);

        // =====================================================
        // SUPABASE AUTH MIGRATION
        // =====================================================

        // Add supabase_id column to link app_user to Supabase auth.users
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='app_user' AND column_name='supabase_id') THEN
                    ALTER TABLE app_user ADD COLUMN supabase_id UUID UNIQUE;
                END IF;
            END $$;
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_app_user_supabase_id ON app_user(supabase_id) WHERE supabase_id IS NOT NULL`);

        // Add auth_provider column to track primary sign-in method
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='app_user' AND column_name='auth_provider') THEN
                    ALTER TABLE app_user ADD COLUMN auth_provider VARCHAR(50) DEFAULT 'email';
                END IF;
            END $$;
        `);

        // Make password_hash nullable (social/phone users won't have one)
        await client.query(`
            ALTER TABLE app_user ALTER COLUMN password_hash DROP NOT NULL
        `);

        // Make email nullable (phone-only users may not have an email initially)
        await client.query(`
            DO $$
            BEGIN
                ALTER TABLE app_user ALTER COLUMN email DROP NOT NULL;
            EXCEPTION WHEN OTHERS THEN NULL;
            END $$;
        `);


        // =====================================================
        // TEAM-BASED ACCESS CONTROL TABLES
        // =====================================================

        // Teams table: each team has one manager and multiple members
        await client.query(`
            CREATE TABLE IF NOT EXISTS teams (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(100) NOT NULL,
                description TEXT,
                manager_id UUID REFERENCES app_user(id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                created_by VARCHAR(255),
                deleted_at TIMESTAMP WITH TIME ZONE
            )
        `);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_teams_manager_id ON teams(manager_id) WHERE deleted_at IS NULL`);

        // Add team_id to app_user (a user belongs to one team)
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='app_user' AND column_name='team_id') THEN
                    ALTER TABLE app_user ADD COLUMN team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
                END IF;
            END $$;
        `);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_app_user_team_id ON app_user(team_id)`);

        // Add team_id to projects (a project belongs to one team)
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='team_id') THEN
                    ALTER TABLE projects ADD COLUMN team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
                END IF;
            END $$;
        `);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_projects_team_id ON projects(team_id)`);

        await client.query(`
            CREATE TABLE IF NOT EXISTS personal_tasks (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                status VARCHAR(50) NOT NULL DEFAULT 'pending',
                priority VARCHAR(20) DEFAULT 'medium',
                due_date DATE,
                completed_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT valid_personal_status CHECK (status IN ('pending', 'in_progress', 'done', 'cancelled')),
                CONSTRAINT valid_personal_priority CHECK (priority IN ('low', 'medium', 'high'))
            )
        `);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_personal_tasks_user_id ON personal_tasks(user_id)`);

        // Add phone column if migrating from older schema
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='app_user' AND column_name='phone') THEN
                    ALTER TABLE app_user ADD COLUMN phone VARCHAR(20);
                END IF;
            END $$;
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS user_permissions (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
                permission_key VARCHAR(100) NOT NULL,
                granted BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, permission_key)
            )
        `);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id)`);

        // Custom roles table for RBAC management
        await client.query(`
            CREATE TABLE IF NOT EXISTS custom_roles (
                name VARCHAR(50) PRIMARY KEY,
                permissions TEXT[] NOT NULL DEFAULT '{}',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                created_by VARCHAR(255)
            )
        `);

        // Notifications table
        await client.query(`
            CREATE TABLE IF NOT EXISTS notification (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
                type VARCHAR(100) NOT NULL,
                title VARCHAR(255) NOT NULL,
                message TEXT,
                read BOOLEAN NOT NULL DEFAULT false,
                metadata JSONB DEFAULT '{}',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_notification_user_id ON notification(user_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_notification_user_unread ON notification(user_id, read) WHERE read = false`);

        // =====================================================
        // EMPLOYEE JOURNEYS / ONBOARDING QUEST SYSTEM
        // =====================================================

        await client.query(`
            CREATE TABLE IF NOT EXISTS journeys (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                slug VARCHAR(100) UNIQUE NOT NULL,
                title VARCHAR(200) NOT NULL,
                description TEXT,
                is_active BOOLEAN DEFAULT true,
                auto_assign_on_activation BOOLEAN DEFAULT true,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                deleted_at TIMESTAMP WITH TIME ZONE
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS journey_chapters (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                journey_id UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
                slug VARCHAR(100) NOT NULL,
                title VARCHAR(200) NOT NULL,
                description TEXT,
                sort_order INTEGER DEFAULT 0,
                is_mandatory BOOLEAN DEFAULT true,
                xp_reward INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(journey_id, slug)
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS journey_quests (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                chapter_id UUID NOT NULL REFERENCES journey_chapters(id) ON DELETE CASCADE,
                slug VARCHAR(100) NOT NULL,
                title VARCHAR(200) NOT NULL,
                description TEXT,
                sort_order INTEGER DEFAULT 0,
                is_mandatory BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(chapter_id, slug)
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS journey_tasks (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                quest_id UUID NOT NULL REFERENCES journey_quests(id) ON DELETE CASCADE,
                slug VARCHAR(100) NOT NULL,
                title VARCHAR(200) NOT NULL,
                description TEXT,
                instructions TEXT,
                validation_type VARCHAR(30) NOT NULL DEFAULT 'checkbox',
                validation_config JSONB DEFAULT '{}',
                sort_order INTEGER DEFAULT 0,
                is_mandatory BOOLEAN DEFAULT true,
                estimated_minutes INTEGER,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(quest_id, slug)
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS user_journey_assignments (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
                journey_id UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
                assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                started_at TIMESTAMP WITH TIME ZONE,
                completed_at TIMESTAMP WITH TIME ZONE,
                status VARCHAR(20) DEFAULT 'assigned',
                total_xp INTEGER DEFAULT 0,
                UNIQUE(user_id, journey_id)
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS user_task_completions (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
                task_id UUID NOT NULL REFERENCES journey_tasks(id) ON DELETE CASCADE,
                completed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                validation_data JSONB DEFAULT '{}',
                UNIQUE(user_id, task_id)
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS journey_task_attachments (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                task_id UUID NOT NULL REFERENCES journey_tasks(id) ON DELETE CASCADE,
                user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
                filename VARCHAR(500) NOT NULL,
                original_name VARCHAR(500) NOT NULL,
                mime_type VARCHAR(100),
                size_bytes INTEGER,
                uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Migrations for existing databases
        await client.query(`ALTER TABLE journeys ADD COLUMN IF NOT EXISTS next_journey_id UUID REFERENCES journeys(id) ON DELETE SET NULL`);
        await client.query(`ALTER TABLE journeys ADD COLUMN IF NOT EXISTS required_xp INTEGER NOT NULL DEFAULT 0`);
        await client.query(`ALTER TABLE journey_chapters ADD COLUMN IF NOT EXISTS xp_reward INTEGER DEFAULT 0`);
        await client.query(`ALTER TABLE user_journey_assignments ADD COLUMN IF NOT EXISTS total_xp INTEGER DEFAULT 0`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_journeys_next_journey ON journeys(next_journey_id)`);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_journey_chapters_journey ON journey_chapters(journey_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_journey_quests_chapter ON journey_quests(chapter_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_journey_tasks_quest ON journey_tasks(quest_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_user_journey_assignments_user ON user_journey_assignments(user_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_user_task_completions_user ON user_task_completions(user_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_user_task_completions_task ON user_task_completions(task_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_journey_task_attachments_task ON journey_task_attachments(task_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_journey_task_attachments_user ON journey_task_attachments(user_id)`);

        // =====================================================
        // GOVERNANCE: Missing columns & test_result table
        // =====================================================

        // Add created_by to test_run if missing
        await client.query(`ALTER TABLE test_run ADD COLUMN IF NOT EXISTS created_by UUID`);

        // Add executed_by and executed_at to test_execution if missing
        await client.query(`ALTER TABLE test_execution ADD COLUMN IF NOT EXISTS executed_by UUID`);
        await client.query(`ALTER TABLE test_execution ADD COLUMN IF NOT EXISTS executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`);
        await client.query(`ALTER TABLE test_execution ALTER COLUMN executed_at DROP DEFAULT`);

        // Create test_result table for the testResults.js upload endpoint
        await client.query(`
            CREATE TABLE IF NOT EXISTS test_result (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                test_case_id VARCHAR(100) NOT NULL,
                test_case_title VARCHAR(500),
                project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                status VARCHAR(20) NOT NULL,
                executed_at DATE DEFAULT CURRENT_DATE,
                notes TEXT,
                tester_name VARCHAR(255),
                upload_batch_id UUID,
                uploaded_by UUID,
                uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                deleted_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_test_result_project_id ON test_result(project_id) WHERE deleted_at IS NULL`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_test_result_executed_at ON test_result(executed_at) WHERE deleted_at IS NULL`);

        // =====================================================
        // GOVERNANCE VIEWS
        // =====================================================

        await client.query(`
            CREATE OR REPLACE VIEW v_workload_balance AS
            SELECT
                p.id AS project_id,
                p.project_name,
                COALESCE(t.task_count, 0) AS total_tasks,
                COALESCE(te.test_count, 0) AS total_tests,
                CASE WHEN COALESCE(t.task_count, 0) = 0 THEN NULL
                     ELSE ROUND(COALESCE(te.test_count, 0)::NUMERIC / t.task_count, 2)
                END AS tests_per_task_ratio,
                CASE
                    WHEN COALESCE(t.task_count, 0) = 0 THEN 'NO_TASKS'
                    WHEN COALESCE(te.test_count, 0) = 0 THEN 'NO_TESTS'
                    WHEN COALESCE(te.test_count, 0)::NUMERIC / t.task_count >= 2 THEN 'OVER_TESTED'
                    WHEN COALESCE(te.test_count, 0)::NUMERIC / t.task_count >= 0.5 THEN 'BALANCED'
                    ELSE 'UNDER_TESTED'
                END AS balance_status
            FROM projects p
            LEFT JOIN (
                SELECT project_id, COUNT(*) AS task_count FROM tasks WHERE deleted_at IS NULL GROUP BY project_id
            ) t ON t.project_id = p.id
            LEFT JOIN (
                SELECT tr.project_id, COUNT(te.id) AS test_count
                FROM test_run tr JOIN test_execution te ON te.test_run_id = tr.id
                WHERE tr.deleted_at IS NULL GROUP BY tr.project_id
            ) te ON te.project_id = p.id
            WHERE p.deleted_at IS NULL
        `);

        await client.query(`
            CREATE OR REPLACE VIEW v_release_readiness AS
            WITH latest_run AS (
                SELECT DISTINCT ON (project_id)
                    project_id, id AS test_run_id, started_at AS execution_date,
                    EXTRACT(DAY FROM (CURRENT_TIMESTAMP - started_at))::INTEGER AS days_since_execution
                FROM test_run WHERE deleted_at IS NULL ORDER BY project_id, started_at DESC
            ),
            run_metrics AS (
                SELECT
                    te.test_run_id,
                    COUNT(te.id) AS total_executions,
                    COUNT(te.id) FILTER (WHERE te.status = 'pass') AS passed_count,
                    COUNT(te.id) FILTER (WHERE te.status = 'fail') AS failed_count,
                    ROUND(COUNT(te.id) FILTER (WHERE te.status = 'pass')::NUMERIC / NULLIF(COUNT(te.id),0) * 100, 2) AS pass_rate,
                    ROUND(COUNT(te.id) FILTER (WHERE te.status = 'not_run')::NUMERIC / NULLIF(COUNT(te.id),0) * 100, 2) AS not_run_pct,
                    ROUND(COUNT(te.id) FILTER (WHERE te.status = 'fail')::NUMERIC / NULLIF(COUNT(te.id),0) * 100, 2) AS fail_rate
                FROM test_execution te GROUP BY te.test_run_id
            )
            SELECT
                p.id AS project_id, p.project_name, p.status AS project_status,
                COALESCE(rm.pass_rate, 0)        AS latest_pass_rate_pct,
                COALESCE(rm.not_run_pct, 0)      AS latest_not_run_pct,
                COALESCE(rm.failed_count, 0)     AS latest_failed_count,
                COALESCE(rm.fail_rate, 0)        AS latest_fail_rate_pct,
                lr.days_since_execution          AS days_since_latest_execution,
                COALESCE(rm.total_executions, 0) AS total_test_cases,
                COALESCE(rm.total_executions, 0) AS latest_tests_executed,
                COALESCE(rm.passed_count, 0)     AS latest_passed_count,
                lr.execution_date                AS latest_execution_date,
                CASE
                    WHEN lr.test_run_id IS NULL THEN 'UNKNOWN'
                    WHEN COALESCE(rm.pass_rate,0) >= 95 AND COALESCE(rm.failed_count,0) = 0
                         AND COALESCE(lr.days_since_execution,999) <= 3 THEN 'GREEN'
                    WHEN COALESCE(rm.pass_rate,0) >= 80 AND COALESCE(lr.days_since_execution,999) <= 7 THEN 'AMBER'
                    ELSE 'RED'
                END AS readiness_status,
                ARRAY_REMOVE(ARRAY[
                    CASE WHEN lr.test_run_id IS NULL        THEN 'No test runs recorded' END,
                    CASE WHEN COALESCE(rm.failed_count,0)>0 THEN rm.failed_count || ' failing tests' END,
                    CASE WHEN COALESCE(lr.days_since_execution,999)>7 THEN 'Last run was '||lr.days_since_execution||' days ago' END,
                    CASE WHEN COALESCE(rm.pass_rate,0)<80   THEN 'Pass rate below 80% ('||COALESCE(rm.pass_rate,0)||'%)' END,
                    CASE WHEN COALESCE(rm.not_run_pct,0)>20 THEN ROUND(rm.not_run_pct)||'% of tests not run' END
                ], NULL) AS blocking_issues,
                (CASE WHEN lr.test_run_id IS NULL THEN 1 ELSE 0 END +
                 CASE WHEN COALESCE(rm.failed_count,0)>0 THEN 1 ELSE 0 END +
                 CASE WHEN COALESCE(lr.days_since_execution,999)>7 THEN 1 ELSE 0 END +
                 CASE WHEN COALESCE(rm.pass_rate,0)<80 THEN 1 ELSE 0 END) AS blocking_issue_count,
                CASE
                    WHEN lr.test_run_id IS NULL THEN 'No test results available. Upload test results to assess readiness.'
                    WHEN COALESCE(rm.pass_rate,0)>=95 AND COALESCE(rm.failed_count,0)=0
                        THEN 'Project meets quality gates. Ready for release.'
                    WHEN COALESCE(rm.pass_rate,0)>=80 THEN 'Nearly ready. Review and resolve failing tests.'
                    ELSE 'Does not meet quality gates. Resolve failures before release.'
                END AS recommendation,
                p.created_at, p.updated_at
            FROM projects p
            LEFT JOIN latest_run lr ON lr.project_id = p.id
            LEFT JOIN run_metrics rm ON rm.test_run_id = lr.test_run_id
            WHERE p.deleted_at IS NULL
        `);

        await client.query(`
            CREATE OR REPLACE VIEW v_quality_risks AS
            WITH project_latest AS (
                SELECT DISTINCT ON (project_id)
                    project_id, id AS test_run_id, started_at,
                    EXTRACT(DAY FROM (CURRENT_TIMESTAMP - started_at))::INTEGER AS days_since_execution
                FROM test_run WHERE deleted_at IS NULL ORDER BY project_id, started_at DESC
            ),
            latest_metrics AS (
                SELECT
                    pl.project_id, pl.days_since_execution,
                    COUNT(te.id) AS total_executions,
                    COUNT(te.id) FILTER (WHERE te.status = 'fail') AS failed,
                    ROUND(COUNT(te.id) FILTER (WHERE te.status = 'pass')::NUMERIC / NULLIF(COUNT(te.id),0)*100,2) AS pass_rate,
                    ROUND(COUNT(te.id) FILTER (WHERE te.status = 'not_run')::NUMERIC / NULLIF(COUNT(te.id),0)*100,2) AS not_run_pct
                FROM project_latest pl JOIN test_execution te ON te.test_run_id = pl.test_run_id
                GROUP BY pl.project_id, pl.days_since_execution
            ),
            recent_week AS (
                SELECT tr.project_id,
                    ROUND(COUNT(te.id) FILTER (WHERE te.status='pass')::NUMERIC/NULLIF(COUNT(te.id),0)*100,2) AS pass_rate
                FROM test_run tr JOIN test_execution te ON te.test_run_id=tr.id
                WHERE tr.deleted_at IS NULL AND tr.started_at >= CURRENT_DATE - INTERVAL '7 days'
                GROUP BY tr.project_id
            ),
            prev_week AS (
                SELECT tr.project_id,
                    ROUND(COUNT(te.id) FILTER (WHERE te.status='pass')::NUMERIC/NULLIF(COUNT(te.id),0)*100,2) AS pass_rate
                FROM test_run tr JOIN test_execution te ON te.test_run_id=tr.id
                WHERE tr.deleted_at IS NULL
                    AND tr.started_at >= CURRENT_DATE - INTERVAL '14 days'
                    AND tr.started_at <  CURRENT_DATE - INTERVAL '7 days'
                GROUP BY tr.project_id
            )
            SELECT
                p.id AS project_id, p.project_name, p.status AS project_status,
                COALESCE(lm.pass_rate, 0)     AS latest_pass_rate_pct,
                COALESCE(lm.not_run_pct, 0)   AS latest_not_run_pct,
                COALESCE(lm.failed, 0)        AS latest_failed_count,
                lm.days_since_execution       AS days_since_latest_execution,
                COALESCE(lm.total_executions, 0) AS total_test_cases,
                COALESCE(rw.pass_rate, 0)     AS recent_pass_rate,
                COALESCE(pw.pass_rate, 0)     AS previous_pass_rate,
                COALESCE(rw.pass_rate,0) - COALESCE(pw.pass_rate,0) AS pass_rate_change,
                7 AS recent_execution_days,
                ARRAY_REMOVE(ARRAY[
                    CASE WHEN lm.total_executions IS NULL OR COALESCE(lm.pass_rate,0)<80 THEN 'LOW_PASS_RATE' END,
                    CASE WHEN COALESCE(lm.not_run_pct,0)>20 THEN 'HIGH_NOT_RUN' END,
                    CASE WHEN COALESCE(lm.days_since_execution,999)>14 OR lm.total_executions IS NULL THEN 'STALE_TESTS' END,
                    CASE WHEN COALESCE(lm.failed,0)>10 THEN 'HIGH_FAILURE_COUNT' END,
                    CASE WHEN (COALESCE(rw.pass_rate,0)-COALESCE(pw.pass_rate,0))<-10 THEN 'DECLINING_TREND' END,
                    CASE WHEN lm.total_executions IS NULL THEN 'NO_TESTS' END
                ], NULL) AS risk_flags,
                (CASE WHEN lm.total_executions IS NULL OR COALESCE(lm.pass_rate,0)<80 THEN 1 ELSE 0 END +
                 CASE WHEN COALESCE(lm.not_run_pct,0)>20 THEN 1 ELSE 0 END +
                 CASE WHEN COALESCE(lm.days_since_execution,999)>14 OR lm.total_executions IS NULL THEN 1 ELSE 0 END +
                 CASE WHEN COALESCE(lm.failed,0)>10 THEN 1 ELSE 0 END +
                 CASE WHEN (COALESCE(rw.pass_rate,0)-COALESCE(pw.pass_rate,0))<-10 THEN 1 ELSE 0 END) AS risk_flag_count,
                CASE
                    WHEN (CASE WHEN lm.total_executions IS NULL OR COALESCE(lm.pass_rate,0)<80 THEN 1 ELSE 0 END +
                          CASE WHEN COALESCE(lm.not_run_pct,0)>20 THEN 1 ELSE 0 END +
                          CASE WHEN COALESCE(lm.days_since_execution,999)>14 OR lm.total_executions IS NULL THEN 1 ELSE 0 END +
                          CASE WHEN COALESCE(lm.failed,0)>10 THEN 1 ELSE 0 END +
                          CASE WHEN (COALESCE(rw.pass_rate,0)-COALESCE(pw.pass_rate,0))<-10 THEN 1 ELSE 0 END) >= 2 THEN 'CRITICAL'
                    WHEN (CASE WHEN lm.total_executions IS NULL OR COALESCE(lm.pass_rate,0)<80 THEN 1 ELSE 0 END +
                          CASE WHEN COALESCE(lm.not_run_pct,0)>20 THEN 1 ELSE 0 END +
                          CASE WHEN COALESCE(lm.days_since_execution,999)>14 OR lm.total_executions IS NULL THEN 1 ELSE 0 END +
                          CASE WHEN COALESCE(lm.failed,0)>10 THEN 1 ELSE 0 END +
                          CASE WHEN (COALESCE(rw.pass_rate,0)-COALESCE(pw.pass_rate,0))<-10 THEN 1 ELSE 0 END) >= 1 THEN 'WARNING'
                    ELSE 'NORMAL'
                END AS risk_level
            FROM projects p
            LEFT JOIN latest_metrics lm ON lm.project_id = p.id
            LEFT JOIN recent_week rw ON rw.project_id = p.id
            LEFT JOIN prev_week pw ON pw.project_id = p.id
            WHERE p.deleted_at IS NULL
        `);

        await client.query(`
            CREATE OR REPLACE VIEW v_project_health_summary AS
            SELECT
                rr.project_id, rr.project_name, rr.project_status,
                rr.readiness_status,
                qr.risk_level,
                wb.balance_status,
                CASE
                    WHEN rr.readiness_status = 'RED'    OR qr.risk_level = 'CRITICAL' THEN 'RED'
                    WHEN rr.readiness_status = 'AMBER'  OR qr.risk_level = 'WARNING'  THEN 'AMBER'
                    WHEN rr.readiness_status = 'GREEN'  AND qr.risk_level = 'NORMAL'  THEN 'GREEN'
                    ELSE 'RED'
                END AS overall_health_status,
                ARRAY_CAT(
                    COALESCE(rr.blocking_issues, '{}'::TEXT[]),
                    ARRAY_REMOVE(ARRAY[
                        CASE WHEN wb.balance_status = 'NO_TESTS'     THEN 'No test executions recorded' END,
                        CASE WHEN wb.balance_status = 'UNDER_TESTED' THEN 'Under-tested relative to task count' END
                    ], NULL)
                ) AS action_items,
                rr.latest_pass_rate_pct,
                rr.latest_failed_count,
                rr.days_since_latest_execution,
                rr.total_test_cases,
                wb.total_tasks,
                wb.total_tests,
                wb.tests_per_task_ratio,
                rr.latest_execution_date,
                rr.blocking_issue_count,
                COALESCE(qr.risk_flag_count, 0)       AS risk_flag_count,
                COALESCE(qr.risk_flags, '{}'::TEXT[]) AS risk_flags,
                COALESCE(qr.pass_rate_change, 0)      AS pass_rate_change
            FROM v_release_readiness rr
            LEFT JOIN v_quality_risks qr   ON qr.project_id = rr.project_id
            LEFT JOIN v_workload_balance wb ON wb.project_id = rr.project_id
        `);

        // Seed: Day-One Essentials & Orientation journey
        await client.query(`
            INSERT INTO journeys (slug, title, description, is_active, auto_assign_on_activation, sort_order)
            VALUES (
                'day-one-essentials',
                'Day-One Essentials & Orientation',
                'Welcome to QC Manager! This journey will guide you through setting up your account, understanding our QC processes, and getting to know your team.',
                true, true, 1
            )
            ON CONFLICT (slug) DO NOTHING
        `);

        // Seed chapters, quests, and tasks for the Day-One journey
        const journeyResult = await client.query(`SELECT id FROM journeys WHERE slug = 'day-one-essentials'`);
        if (journeyResult.rows.length > 0) {
            const journeyId = journeyResult.rows[0].id;

            // Chapter 1: Welcome & Account Setup (mandatory)
            await client.query(`
                INSERT INTO journey_chapters (journey_id, slug, title, description, sort_order, is_mandatory)
                VALUES ($1, 'welcome-account-setup', 'Welcome & Account Setup', 'Get started by setting up your profile and exploring the platform.', 1, true)
                ON CONFLICT (journey_id, slug) DO NOTHING
            `, [journeyId]);

            // Chapter 2: QC Processes Overview (mandatory)
            await client.query(`
                INSERT INTO journey_chapters (journey_id, slug, title, description, sort_order, is_mandatory)
                VALUES ($1, 'qc-processes', 'QC Processes Overview', 'Learn about task management and test execution workflows.', 2, true)
                ON CONFLICT (journey_id, slug) DO NOTHING
            `, [journeyId]);

            // Chapter 3: Team & Communication (mandatory)
            await client.query(`
                INSERT INTO journey_chapters (journey_id, slug, title, description, sort_order, is_mandatory)
                VALUES ($1, 'team-communication', 'Team & Communication', 'Get to know your team and learn how to use reports.', 3, true)
                ON CONFLICT (journey_id, slug) DO NOTHING
            `, [journeyId]);

            // Chapter 4: Advanced Topics (optional)
            await client.query(`
                INSERT INTO journey_chapters (journey_id, slug, title, description, sort_order, is_mandatory)
                VALUES ($1, 'advanced-topics', 'Advanced Topics', 'Explore governance and quality gates for deeper understanding.', 4, false)
                ON CONFLICT (journey_id, slug) DO NOTHING
            `, [journeyId]);

            // Seed quests and tasks per chapter
            const chapters = await client.query(`SELECT id, slug FROM journey_chapters WHERE journey_id = $1 ORDER BY sort_order`, [journeyId]);

            for (const ch of chapters.rows) {
                if (ch.slug === 'welcome-account-setup') {
                    await client.query(`INSERT INTO journey_quests (chapter_id, slug, title, description, sort_order, is_mandatory) VALUES ($1, 'setup-profile', 'Set Up Your Profile', 'Complete your profile to help your team recognize you.', 1, true) ON CONFLICT (chapter_id, slug) DO NOTHING`, [ch.id]);
                    await client.query(`INSERT INTO journey_quests (chapter_id, slug, title, description, sort_order, is_mandatory) VALUES ($1, 'explore-platform', 'Explore the Platform', 'Take a quick tour of the main pages.', 2, true) ON CONFLICT (chapter_id, slug) DO NOTHING`, [ch.id]);

                    const quests = await client.query(`SELECT id, slug FROM journey_quests WHERE chapter_id = $1 ORDER BY sort_order`, [ch.id]);
                    for (const q of quests.rows) {
                        if (q.slug === 'setup-profile') {
                            await client.query(`INSERT INTO journey_tasks (quest_id, slug, title, description, validation_type, sort_order, is_mandatory, estimated_minutes) VALUES ($1, 'upload-avatar', 'Upload Your Avatar', 'Add a profile picture so your team can recognize you.', 'checkbox', 1, true, 2), ($1, 'fill-bio', 'Write a Short Bio', 'Tell your team a bit about yourself.', 'text_acknowledge', 2, true, 5), ($1, 'notification-prefs', 'Set Notification Preferences', 'Configure how you want to receive notifications.', 'checkbox', 3, true, 2) ON CONFLICT (quest_id, slug) DO NOTHING`, [q.id]);
                        } else if (q.slug === 'explore-platform') {
                            await client.query(`INSERT INTO journey_tasks (quest_id, slug, title, description, validation_type, sort_order, is_mandatory, estimated_minutes) VALUES ($1, 'visit-dashboard', 'Visit the Dashboard', 'Navigate to the Dashboard and review the metrics overview.', 'checkbox', 1, true, 3), ($1, 'view-project', 'View a Project', 'Open any project to see how project details are organized.', 'checkbox', 2, true, 3), ($1, 'check-my-tasks', 'Check My Tasks Page', 'Visit the My Tasks page to manage your personal tasks.', 'checkbox', 3, true, 2) ON CONFLICT (quest_id, slug) DO NOTHING`, [q.id]);
                        }
                    }
                } else if (ch.slug === 'qc-processes') {
                    await client.query(`INSERT INTO journey_quests (chapter_id, slug, title, description, sort_order, is_mandatory) VALUES ($1, 'task-lifecycle', 'Understand the Task Lifecycle', 'Learn how tasks move through different statuses.', 1, true) ON CONFLICT (chapter_id, slug) DO NOTHING`, [ch.id]);
                    await client.query(`INSERT INTO journey_quests (chapter_id, slug, title, description, sort_order, is_mandatory) VALUES ($1, 'test-execution', 'Learn Test Execution', 'Understand how test runs and results work.', 2, true) ON CONFLICT (chapter_id, slug) DO NOTHING`, [ch.id]);

                    const quests = await client.query(`SELECT id, slug FROM journey_quests WHERE chapter_id = $1 ORDER BY sort_order`, [ch.id]);
                    for (const q of quests.rows) {
                        if (q.slug === 'task-lifecycle') {
                            await client.query(`INSERT INTO journey_tasks (quest_id, slug, title, description, instructions, validation_type, validation_config, sort_order, is_mandatory, estimated_minutes) VALUES ($1, 'read-task-flow', 'Read Task Status Flow', 'Understand how tasks progress through statuses.', 'Tasks follow: **Backlog** → **In Progress** → **Done**. Tasks can also be **Cancelled**.', 'text_acknowledge', '{"min_text_length": 10, "prompt": "Describe the task statuses in your own words:"}', 1, true, 5), ($1, 'review-sample-task', 'Review a Sample Task', 'Open any task and review its details.', NULL, 'checkbox', '{}', 2, true, 5) ON CONFLICT (quest_id, slug) DO NOTHING`, [q.id]);
                        } else if (q.slug === 'test-execution') {
                            await client.query(`INSERT INTO journey_tasks (quest_id, slug, title, description, instructions, validation_type, sort_order, is_mandatory, estimated_minutes) VALUES ($1, 'read-test-docs', 'Read Test Execution Overview', 'Learn about test runs and how results are tracked.', 'Test runs track individual test case results: **Passed**, **Failed**, **Blocked**, or **Not Executed**.', 'text_acknowledge', 1, true, 5), ($1, 'view-test-runs', 'View Test Runs Page', 'Navigate to the Test Runs page.', NULL, 'checkbox', 2, true, 3) ON CONFLICT (quest_id, slug) DO NOTHING`, [q.id]);
                        }
                    }
                } else if (ch.slug === 'team-communication') {
                    await client.query(`INSERT INTO journey_quests (chapter_id, slug, title, description, sort_order, is_mandatory) VALUES ($1, 'meet-team', 'Meet Your Team', 'Get familiar with the team structure.', 1, true) ON CONFLICT (chapter_id, slug) DO NOTHING`, [ch.id]);
                    await client.query(`INSERT INTO journey_quests (chapter_id, slug, title, description, sort_order, is_mandatory) VALUES ($1, 'reporting-basics', 'Reporting Basics', 'Learn about the different report types.', 2, true) ON CONFLICT (chapter_id, slug) DO NOTHING`, [ch.id]);

                    const quests = await client.query(`SELECT id, slug FROM journey_quests WHERE chapter_id = $1 ORDER BY sort_order`, [ch.id]);
                    for (const q of quests.rows) {
                        if (q.slug === 'meet-team') {
                            await client.query(`INSERT INTO journey_tasks (quest_id, slug, title, description, validation_type, validation_config, sort_order, is_mandatory, estimated_minutes) VALUES ($1, 'review-resources', 'Review Team Resources', 'Visit the Resources page to see your team members.', 'checkbox', '{}', 1, true, 3), ($1, 'identify-manager', 'Identify Your Manager', 'Find out who your direct manager is.', 'text_acknowledge', '{"min_text_length": 2, "prompt": "Who is your manager?"}', 2, true, 2) ON CONFLICT (quest_id, slug) DO NOTHING`, [q.id]);
                        } else if (q.slug === 'reporting-basics') {
                            await client.query(`INSERT INTO journey_tasks (quest_id, slug, title, description, validation_type, validation_config, sort_order, is_mandatory, estimated_minutes) VALUES ($1, 'understand-reports', 'Understand Report Types', 'Learn about the different report types you can generate.', 'multi_checkbox', '{"items": ["Project Status Report", "Resource Utilization Report", "Task Export Report"]}', 1, true, 5) ON CONFLICT (quest_id, slug) DO NOTHING`, [q.id]);
                        }
                    }
                } else if (ch.slug === 'advanced-topics') {
                    await client.query(`INSERT INTO journey_quests (chapter_id, slug, title, description, sort_order, is_mandatory) VALUES ($1, 'governance-quality', 'Governance & Quality Gates', 'Explore advanced quality management features.', 1, true) ON CONFLICT (chapter_id, slug) DO NOTHING`, [ch.id]);

                    const quests = await client.query(`SELECT id, slug FROM journey_quests WHERE chapter_id = $1 ORDER BY sort_order`, [ch.id]);
                    for (const q of quests.rows) {
                        if (q.slug === 'governance-quality') {
                            await client.query(`INSERT INTO journey_tasks (quest_id, slug, title, description, instructions, validation_type, sort_order, is_mandatory, estimated_minutes) VALUES ($1, 'read-governance', 'Read About Governance', 'Understand quality gates and release approvals.', 'Quality gates define minimum criteria for releases: pass rates, critical defects, and test coverage thresholds.', 'text_acknowledge', 1, true, 5), ($1, 'explore-governance', 'Explore Governance Dashboard', 'Visit the Governance page and explore the metrics.', NULL, 'checkbox', 2, true, 3) ON CONFLICT (quest_id, slug) DO NOTHING`, [q.id]);
                        }
                    }
                }
            }
        }

        // Migration 019: Avatar columns on app_user
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='app_user' AND column_name='avatar_url') THEN
                    ALTER TABLE app_user ADD COLUMN avatar_url TEXT;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='app_user' AND column_name='avatar_type') THEN
                    ALTER TABLE app_user ADD COLUMN avatar_type VARCHAR(10) CHECK (avatar_type IN ('initials', 'preset', 'upload')) DEFAULT 'initials';
                END IF;
            END $$;
        `);

        // =====================================================
        // Migration 022: IDP support — extends journeys for per-user development plans
        // =====================================================

        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='journeys' AND column_name='plan_type') THEN
                    ALTER TABLE journeys ADD COLUMN plan_type TEXT NOT NULL DEFAULT 'onboarding'
                        CHECK (plan_type IN ('onboarding', 'idp'));
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='journeys' AND column_name='owner_user_id') THEN
                    ALTER TABLE journeys ADD COLUMN owner_user_id UUID REFERENCES app_user(id) ON DELETE CASCADE;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='journeys' AND column_name='created_by_manager') THEN
                    ALTER TABLE journeys ADD COLUMN created_by_manager UUID REFERENCES app_user(id);
                END IF;
            END $$;
        `);

        await client.query(`ALTER TABLE journey_chapters ADD COLUMN IF NOT EXISTS due_date DATE`);
        await client.query(`ALTER TABLE journey_chapters ADD COLUMN IF NOT EXISTS start_date DATE`);

        await client.query(`
            ALTER TABLE journey_tasks
                ADD COLUMN IF NOT EXISTS due_date DATE,
                ADD COLUMN IF NOT EXISTS priority TEXT CHECK (priority IN ('low', 'medium', 'high')),
                ADD COLUMN IF NOT EXISTS difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard'))
        `);
        await client.query(`ALTER TABLE journey_tasks ADD COLUMN IF NOT EXISTS start_date DATE`);

        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_task_completions' AND column_name='progress_status') THEN
                    ALTER TABLE user_task_completions ADD COLUMN progress_status TEXT NOT NULL DEFAULT 'DONE'
                        CHECK (progress_status IN ('TODO', 'IN_PROGRESS', 'DONE'));
                END IF;
            END $$;
        `);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_journeys_owner_user ON journeys(owner_user_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_journeys_plan_type  ON journeys(plan_type)`);

        await client.query(`COMMENT ON COLUMN journeys.plan_type IS 'onboarding = shared template; idp = per-user development plan'`);
        await client.query(`COMMENT ON COLUMN journeys.owner_user_id IS 'For IDP plans only: the ACTIVE user this plan belongs to'`);
        await client.query(`COMMENT ON COLUMN journeys.created_by_manager IS 'Manager who created this IDP plan'`);

        // =====================================================
        // Migration 023: IDP hold and comments
        // =====================================================

        await client.query(`
            ALTER TABLE user_task_completions
                DROP CONSTRAINT IF EXISTS user_task_completions_progress_status_check
        `);

        await client.query(`
            ALTER TABLE user_task_completions
                ADD CONSTRAINT user_task_completions_progress_status_check
                CHECK (progress_status IN ('TODO', 'IN_PROGRESS', 'ON_HOLD', 'DONE'))
        `);

        await client.query(`
            ALTER TABLE user_task_completions
                ADD COLUMN IF NOT EXISTS hold_reason TEXT
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS idp_task_comment (
                id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id     UUID        NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
                task_id     UUID        NOT NULL REFERENCES journey_tasks(id) ON DELETE CASCADE,
                author_id   UUID        NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
                body        TEXT        NOT NULL CHECK (length(body) > 0),
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_idp_task_comment_user_task ON idp_task_comment(user_id, task_id, created_at DESC)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_idp_task_comment_author ON idp_task_comment(author_id)`);

        // =====================================================
        // Migration 024: IDP enhancements — links, attachment ownership, requires_attachment
        // =====================================================

        await client.query(`
            CREATE TABLE IF NOT EXISTS idp_task_links (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                task_id UUID NOT NULL REFERENCES journey_tasks(id) ON DELETE CASCADE,
                url TEXT NOT NULL,
                label VARCHAR(500) NOT NULL,
                created_by UUID NOT NULL REFERENCES app_user(id),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_idp_task_links_task ON idp_task_links(task_id)`);

        await client.query(`
            ALTER TABLE journey_task_attachments
                ADD COLUMN IF NOT EXISTS uploaded_by_role VARCHAR(20) NOT NULL DEFAULT 'resource'
                    CHECK (uploaded_by_role IN ('manager', 'resource'))
        `);

        await client.query(`
            ALTER TABLE journey_task_attachments
                ADD COLUMN IF NOT EXISTS storage_path TEXT,
                ADD COLUMN IF NOT EXISTS bucket_name VARCHAR(100)
        `);

        await client.query(`
            ALTER TABLE journey_tasks
                ADD COLUMN IF NOT EXISTS requires_attachment BOOLEAN NOT NULL DEFAULT false
        `);

        await client.query(`
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql
        `);

        await client.query(`DROP TRIGGER IF EXISTS set_updated_at ON journey_chapters`);
        await client.query(`
            CREATE TRIGGER set_updated_at
                BEFORE UPDATE ON journey_chapters
                FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
        `);

        await client.query(`DROP TRIGGER IF EXISTS set_updated_at ON journey_tasks`);
        await client.query(`
            CREATE TRIGGER set_updated_at
                BEFORE UPDATE ON journey_tasks
                FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
        `);

        await client.query(`DROP TRIGGER IF EXISTS set_updated_at ON user_stories`);
        await client.query(`
            CREATE TRIGGER set_updated_at
                BEFORE UPDATE ON user_stories
                FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
        `);

        // =====================================================
        // Unified Tuleap payload — add new columns for dynamic field mapping
        // =====================================================

        await client.query(`
            ALTER TABLE tuleap_sync_config
                ADD COLUMN IF NOT EXISTS artifact_fields JSONB DEFAULT '{}',
                ADD COLUMN IF NOT EXISTS status_value_map JSONB DEFAULT '{}'
        `);

        await client.query(`
            ALTER TABLE bugs
                ADD COLUMN IF NOT EXISTS environment VARCHAR(20),
                ADD COLUMN IF NOT EXISTS cc TEXT[],
                ADD COLUMN IF NOT EXISTS dev_fix_description TEXT,
                ADD COLUMN IF NOT EXISTS qc_verification_notes TEXT,
                ADD COLUMN IF NOT EXISTS service_name VARCHAR(100),
                ADD COLUMN IF NOT EXISTS initial_effort NUMERIC,
                ADD COLUMN IF NOT EXISTS remaining_effort NUMERIC
        `);

        await client.query(`
            ALTER TABLE tasks
                ADD COLUMN IF NOT EXISTS initial_estimate NUMERIC,
                ADD COLUMN IF NOT EXISTS final_estimate NUMERIC,
                ADD COLUMN IF NOT EXISTS actual_effort NUMERIC,
                ADD COLUMN IF NOT EXISTS blocked_reason TEXT,
                ADD COLUMN IF NOT EXISTS parent_story_id INTEGER
        `);

        await client.query(`
            ALTER TABLE user_stories
                ADD COLUMN IF NOT EXISTS initial_effort NUMERIC,
                ADD COLUMN IF NOT EXISTS remaining_effort NUMERIC,
                ADD COLUMN IF NOT EXISTS change_reason TEXT
        `);

        await client.query(`
            ALTER TABLE test_cases
                ADD COLUMN IF NOT EXISTS service_name VARCHAR(100),
                ADD COLUMN IF NOT EXISTS preconditions TEXT,
                ADD COLUMN IF NOT EXISTS actual_result TEXT,
                ADD COLUMN IF NOT EXISTS task_number VARCHAR(50),
                ADD COLUMN IF NOT EXISTS is_regression BOOLEAN DEFAULT FALSE,
                ADD COLUMN IF NOT EXISTS execution_count INTEGER DEFAULT 0,
                ADD COLUMN IF NOT EXISTS note TEXT
        `);

        await client.query(`
            ALTER TABLE tuleap_sync_config
                ADD COLUMN IF NOT EXISTS value_maps JSONB DEFAULT '{}'::jsonb
        `);

        await client.query(`
            DO $$ BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tuleap_sync_config' AND column_name='value_maps' AND column_default IS NULL) THEN
                    ALTER TABLE tuleap_sync_config ALTER COLUMN value_maps SET DEFAULT '{}'::jsonb;
                END IF;
            END $$;
        `);

        await client.query(`
            DO $$ BEGIN
                UPDATE tuleap_sync_config SET value_maps = jsonb_build_object('status', COALESCE(status_value_map, '{}'::jsonb)) WHERE value_maps = '{}'::jsonb OR value_maps IS NULL;
            END $$;
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS test_case (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                test_case_id VARCHAR(50) NOT NULL,
                title VARCHAR(500) NOT NULL,
                description TEXT,
                status VARCHAR(50) NOT NULL DEFAULT 'active',
                priority VARCHAR(20) DEFAULT 'medium',
                category VARCHAR(50) DEFAULT 'other',
                project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
                tags TEXT[] DEFAULT '{}',
                tuleap_artifact_id INTEGER UNIQUE,
                tuleap_tracker_id INTEGER,
                tuleap_url TEXT,
                synced_from_tuleap BOOLEAN DEFAULT FALSE,
                last_tuleap_sync TIMESTAMP WITH TIME ZONE,
                pending_links JSONB DEFAULT '[]'::jsonb,
                raw_tuleap_payload JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                deleted_at TIMESTAMP WITH TIME ZONE
            )
        `);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_test_case_tuleap_artifact ON test_case(tuleap_artifact_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_test_case_project_id ON test_case(project_id) WHERE deleted_at IS NULL`);

        await client.query(`
            ALTER TABLE bugs
                ADD COLUMN IF NOT EXISTS pending_links JSONB DEFAULT '[]'::jsonb
        `);

        await client.query(`
            ALTER TABLE tasks
                ADD COLUMN IF NOT EXISTS pending_links JSONB DEFAULT '[]'::jsonb
        `);

        await client.query(`
            ALTER TABLE user_stories
                ADD COLUMN IF NOT EXISTS pending_links JSONB DEFAULT '[]'::jsonb
        `);

        await client.query(`
            ALTER TABLE tuleap_sync_config
                ADD COLUMN IF NOT EXISTS submitted_by_resource_id UUID REFERENCES resources(id) ON DELETE SET NULL
        `);

        // Migration 027: tuleap_missing_artifact — tracks consecutive-miss state for delete reconciliation
        await client.query(`
            CREATE TABLE IF NOT EXISTS tuleap_missing_artifact (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                tuleap_artifact_id INTEGER NOT NULL,
                tracker_type VARCHAR(20) NOT NULL CHECK (tracker_type IN ('bug', 'task', 'user_story', 'test_case')),
                qc_project_id UUID NOT NULL REFERENCES projects(id),
                miss_count INTEGER NOT NULL DEFAULT 1,
                first_missed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_missed_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                resolved_at TIMESTAMP WITH TIME ZONE,
                resolution VARCHAR(20),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tuleap_artifact_id, tracker_type)
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_tuleap_missing_unresolved
                ON tuleap_missing_artifact(qc_project_id, tracker_type)
                WHERE resolved_at IS NULL
        `);

        // Migration: Test Suite Management — Sprint 3

        await client.query(`
            CREATE TABLE IF NOT EXISTS test_suites (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                suite_id VARCHAR(50) NOT NULL,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                status VARCHAR(50) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('draft','active','archived')),
                project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
                updated_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                deleted_at TIMESTAMPTZ,
                deleted_by UUID REFERENCES app_user(id) ON DELETE SET NULL
            )
        `);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_test_suites_project_id ON test_suites(project_id) WHERE deleted_at IS NULL`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_test_suites_status ON test_suites(status) WHERE deleted_at IS NULL`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_test_suites_created_by ON test_suites(created_by) WHERE deleted_at IS NULL`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_test_suites_suite_id ON test_suites(suite_id) WHERE deleted_at IS NULL`);

        await client.query(`
            CREATE TABLE IF NOT EXISTS test_suite_cases (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                suite_id UUID NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
                test_case_id UUID NOT NULL REFERENCES test_case(id) ON DELETE CASCADE,
                sort_order INTEGER NOT NULL DEFAULT 0,
                snapshot_id UUID,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_test_suite_cases_active
                ON test_suite_cases(suite_id, test_case_id)
                WHERE snapshot_id IS NULL
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_test_suite_cases_snapshot
                ON test_suite_cases(snapshot_id)
                WHERE snapshot_id IS NOT NULL
        `);

        // Alter test_run table for suite-based runs
        await client.query(`ALTER TABLE test_run ADD COLUMN IF NOT EXISTS suite_id UUID REFERENCES test_suites(id) ON DELETE SET NULL`);
        await client.query(`ALTER TABLE test_run ADD COLUMN IF NOT EXISTS created_by_email VARCHAR(255)`);
        await client.query(`ALTER TABLE test_run ADD COLUMN IF NOT EXISTS environment VARCHAR(100)`);
        await client.query(`ALTER TABLE test_run ADD COLUMN IF NOT EXISTS version_tag VARCHAR(50)`);
        await client.query(`ALTER TABLE test_run ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'excel'`);
        await client.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'test_run_source_check') THEN
                    ALTER TABLE test_run ADD CONSTRAINT test_run_source_check
                        CHECK (source IN ('excel','suite'));
                END IF;
            END $$;
        `);

        // Alter test_execution table for enhanced fields
        await client.query(`ALTER TABLE test_execution ADD COLUMN IF NOT EXISTS test_case_title VARCHAR(500)`);
        await client.query(`ALTER TABLE test_execution ADD COLUMN IF NOT EXISTS test_case_steps TEXT`);
        await client.query(`ALTER TABLE test_execution ADD COLUMN IF NOT EXISTS expected_result TEXT`);
        await client.query(`ALTER TABLE test_execution ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0`);
        await client.query(`ALTER TABLE test_execution ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES app_user(id) ON DELETE SET NULL`);
        await client.query(`ALTER TABLE test_execution ALTER COLUMN test_case_id DROP NOT NULL`);
        await client.query(`
            DO $$
            DECLARE
                constraint_record RECORD;
            BEGIN
                FOR constraint_record IN
                    SELECT con.conname
                    FROM pg_constraint con
                    JOIN pg_attribute att
                        ON att.attrelid = con.conrelid
                       AND att.attnum = ANY(con.conkey)
                    WHERE con.contype = 'f'
                      AND con.conrelid = 'test_execution'::regclass
                      AND att.attname = 'test_case_id'
                      AND con.confrelid = 'test_cases'::regclass
                LOOP
                    EXECUTE format('ALTER TABLE test_execution DROP CONSTRAINT %I', constraint_record.conname);
                END LOOP;

                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint con
                    JOIN pg_attribute att
                        ON att.attrelid = con.conrelid
                       AND att.attnum = ANY(con.conkey)
                    WHERE con.contype = 'f'
                      AND con.conrelid = 'test_execution'::regclass
                      AND att.attname = 'test_case_id'
                      AND con.confrelid = 'test_case'::regclass
                ) THEN
                    ALTER TABLE test_execution
                        ADD CONSTRAINT test_execution_test_case_id_test_case_fkey
                        FOREIGN KEY (test_case_id) REFERENCES test_case(id) ON DELETE SET NULL NOT VALID;
                END IF;
            END $$;
        `);

        // Normalized traceability model — additive compatibility layer.
        await client.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_user_story_id UUID REFERENCES user_stories(id) ON DELETE SET NULL`);
        await client.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_story_tuleap_artifact_id INTEGER`);
        await client.query(`
            UPDATE tasks
            SET parent_story_tuleap_artifact_id = parent_story_id
            WHERE parent_story_tuleap_artifact_id IS NULL
              AND parent_story_id IS NOT NULL
        `);
        await client.query(`
            UPDATE tasks t
            SET parent_user_story_id = us.id
            FROM user_stories us
            WHERE t.parent_user_story_id IS NULL
              AND t.parent_story_tuleap_artifact_id IS NOT NULL
              AND us.tuleap_artifact_id = t.parent_story_tuleap_artifact_id
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_tasks_parent_user_story_id ON tasks(parent_user_story_id) WHERE deleted_at IS NULL`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_tasks_parent_story_tuleap_artifact_id ON tasks(parent_story_tuleap_artifact_id) WHERE parent_story_tuleap_artifact_id IS NOT NULL`);

        await client.query(`ALTER TABLE test_suites ADD COLUMN IF NOT EXISTS readiness_scope VARCHAR(20) NOT NULL DEFAULT 'required'`);
        await client.query(`ALTER TABLE test_suites ADD COLUMN IF NOT EXISTS suite_type VARCHAR(30) NOT NULL DEFAULT 'other'`);
        await client.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'test_suites_readiness_scope_check') THEN
                    ALTER TABLE test_suites ADD CONSTRAINT test_suites_readiness_scope_check
                        CHECK (readiness_scope IN ('required','optional'));
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'test_suites_suite_type_check') THEN
                    ALTER TABLE test_suites ADD CONSTRAINT test_suites_suite_type_check
                        CHECK (suite_type IN ('smoke','regression','acceptance','security','performance','other'));
                END IF;
            END $$;
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_test_suites_readiness_scope ON test_suites(project_id, readiness_scope) WHERE deleted_at IS NULL`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_test_suites_suite_type ON test_suites(project_id, suite_type) WHERE deleted_at IS NULL`);

        await client.query(`
            CREATE TABLE IF NOT EXISTS task_test_cases (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                test_case_id UUID NOT NULL REFERENCES test_case(id) ON DELETE CASCADE,
                relationship_type VARCHAR(50) NOT NULL DEFAULT 'covers',
                source VARCHAR(20) NOT NULL DEFAULT 'qc',
                created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(task_id, test_case_id)
            )
        `);
        await client.query(`ALTER TABLE task_test_cases ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'qc'`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_task_test_cases_task_id ON task_test_cases(task_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_task_test_cases_test_case_id ON task_test_cases(test_case_id)`);
        await client.query(`
            INSERT INTO task_test_cases (task_id, test_case_id, relationship_type)
            SELECT DISTINCT t.id, tc.id, 'covers'
            FROM test_case tc
            JOIN tasks t
              ON t.task_id = tc.task_number
             AND t.deleted_at IS NULL
             AND (tc.project_id IS NULL OR t.project_id = tc.project_id)
            WHERE tc.deleted_at IS NULL
              AND tc.task_number IS NOT NULL
              AND tc.task_number <> ''
            ON CONFLICT (task_id, test_case_id) DO NOTHING
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS bug_test_executions (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                bug_id UUID NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
                test_execution_id UUID NOT NULL REFERENCES test_execution(id) ON DELETE CASCADE,
                created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(bug_id, test_execution_id)
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_bug_test_executions_bug_id ON bug_test_executions(bug_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_bug_test_executions_execution_id ON bug_test_executions(test_execution_id)`);
        await client.query(`ALTER TABLE bugs ADD COLUMN IF NOT EXISTS triage_status VARCHAR(20) NOT NULL DEFAULT 'untriaged'`);
        await client.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bugs_triage_status_check') THEN
                    ALTER TABLE bugs ADD CONSTRAINT bugs_triage_status_check
                        CHECK (triage_status IN ('untriaged','triaged'));
                END IF;
            END $$;
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_bugs_triage_status ON bugs(triage_status) WHERE deleted_at IS NULL`);
        await client.query(`
            INSERT INTO bug_test_executions (bug_id, test_execution_id)
            SELECT DISTINCT b.id, te.id
            FROM bugs b
            CROSS JOIN LATERAL unnest(COALESCE(b.linked_test_execution_ids, ARRAY[]::uuid[])) AS linked_execution_id
            JOIN test_execution te ON te.id = linked_execution_id
            WHERE b.deleted_at IS NULL
            ON CONFLICT (bug_id, test_execution_id) DO NOTHING
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS bug_tasks (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                bug_id UUID NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
                task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                relationship_type VARCHAR(50) NOT NULL DEFAULT 'reported_against',
                source VARCHAR(20) NOT NULL DEFAULT 'qc',
                created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(bug_id, task_id)
            )
        `);
        await client.query(`ALTER TABLE bug_tasks ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'qc'`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_bug_tasks_bug_id ON bug_tasks(bug_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_bug_tasks_task_id ON bug_tasks(task_id)`);

        await client.query(`
            CREATE TABLE IF NOT EXISTS bug_test_cases (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                bug_id UUID NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
                test_case_id UUID NOT NULL REFERENCES test_case(id) ON DELETE CASCADE,
                relationship_type VARCHAR(50) NOT NULL DEFAULT 'reveals',
                source VARCHAR(20) NOT NULL DEFAULT 'qc',
                created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(bug_id, test_case_id)
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_bug_test_cases_bug_id ON bug_test_cases(bug_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_bug_test_cases_test_case_id ON bug_test_cases(test_case_id)`);

        await client.query(`
            CREATE TABLE IF NOT EXISTS bug_user_stories (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                bug_id UUID NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
                user_story_id UUID NOT NULL REFERENCES user_stories(id) ON DELETE CASCADE,
                relationship_type VARCHAR(50) NOT NULL DEFAULT 'affects',
                source VARCHAR(20) NOT NULL DEFAULT 'qc',
                created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(bug_id, user_story_id)
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_bug_user_stories_bug_id ON bug_user_stories(bug_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_bug_user_stories_user_story_id ON bug_user_stories(user_story_id)`);

        await client.query(`
            CREATE TABLE IF NOT EXISTS test_case_user_stories (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                test_case_id UUID NOT NULL REFERENCES test_case(id) ON DELETE CASCADE,
                user_story_id UUID NOT NULL REFERENCES user_stories(id) ON DELETE CASCADE,
                relationship_type VARCHAR(50) NOT NULL DEFAULT 'verifies',
                source VARCHAR(20) NOT NULL DEFAULT 'qc',
                created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(test_case_id, user_story_id)
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_test_case_user_stories_test_case_id ON test_case_user_stories(test_case_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_test_case_user_stories_user_story_id ON test_case_user_stories(user_story_id)`);
        await client.query(`
            UPDATE bugs
            SET triage_status = 'triaged'
            WHERE deleted_at IS NULL
              AND triage_status = 'untriaged'
              AND (
                COALESCE(array_length(linked_test_case_ids, 1), 0) > 0
                OR COALESCE(array_length(linked_test_execution_ids, 1), 0) > 0
                OR EXISTS (SELECT 1 FROM bug_tasks bt WHERE bt.bug_id = bugs.id)
              )
        `);

        // Recreate views that depend on the new normalized tables/columns
        await client.query(`DROP VIEW IF EXISTS v_bug_summary_global CASCADE`);
        await client.query(`
            CREATE OR REPLACE VIEW v_bug_summary_global AS
            SELECT
                COUNT(id) AS total_bugs,
                COUNT(id) FILTER (WHERE status IN ('Open', 'In Progress', 'Reopened')) AS open_bugs,
                COUNT(id) FILTER (WHERE status IN ('Resolved', 'Closed')) AS closed_bugs,
                COUNT(id) FILTER (WHERE severity = 'critical') AS critical_bugs,
                COUNT(id) FILTER (WHERE severity = 'high') AS high_bugs,
                COUNT(id) FILTER (WHERE severity = 'medium') AS medium_bugs,
                COUNT(id) FILTER (WHERE severity = 'low') AS low_bugs,
                COUNT(id) FILTER (WHERE COALESCE(source, 'EXPLORATORY') = 'TEST_CASE') AS bugs_from_test_cases,
                COUNT(id) FILTER (WHERE COALESCE(source, 'EXPLORATORY') = 'EXPLORATORY') AS bugs_from_exploratory,
                COUNT(id) FILTER (WHERE EXISTS (SELECT 1 FROM bug_test_executions bte WHERE bte.bug_id = bugs.id)
                                 OR EXISTS (SELECT 1 FROM bug_tasks bt WHERE bt.bug_id = bugs.id)) AS bugs_from_testing,
                COUNT(id) FILTER (WHERE NOT EXISTS (SELECT 1 FROM bug_test_executions bte WHERE bte.bug_id = bugs.id)
                                      AND NOT EXISTS (SELECT 1 FROM bug_tasks bt WHERE bt.bug_id = bugs.id)
                                      AND COALESCE(array_length(linked_test_case_ids, 1), 0) = 0) AS standalone_bugs
            FROM bugs
            WHERE deleted_at IS NULL
        `);

        await client.query(`DROP VIEW IF EXISTS v_tasks_with_metrics CASCADE`);
        await client.query(`
            CREATE OR REPLACE VIEW v_tasks_with_metrics AS
            SELECT
                t.id,
                t.task_id,
                t.project_id,
                t.task_name,
                t.description,
                t.status,
                t.assignee,
                t.priority,
                t.tags,
                t.notes,
                t.resource1_id,
                t.resource2_id,
                t.resource1_id AS resource1_uuid,
                t.resource2_id AS resource2_uuid,
                t.estimate_days,
                t.r1_estimate_hrs,
                t.r1_actual_hrs,
                t.r2_estimate_hrs,
                t.r2_actual_hrs,
                t.due_date,
                t.deadline,
                t.expected_start_date,
                t.actual_start_date,
                t.completed_date,
                t.completed_at,
                t.created_at,
                t.created_by,
                t.updated_at,
                t.updated_by,
                t.deleted_at,
                t.deleted_by,
                t.tuleap_artifact_id,
                t.tuleap_url,
                t.synced_from_tuleap,
                t.last_tuleap_sync,
                t.parent_user_story_id,
                r1.resource_name AS resource1_name,
                r2.resource_name AS resource2_name,
                p.project_name,
                (COALESCE(t.r1_estimate_hrs, 0) + COALESCE(t.r2_estimate_hrs, 0)) AS total_estimated_hrs,
                (COALESCE(t.r1_estimate_hrs, 0) + COALESCE(t.r2_estimate_hrs, 0)) AS total_est_hrs,
                (COALESCE(t.r1_actual_hrs, 0) + COALESCE(t.r2_actual_hrs, 0)) AS total_actual_hrs,
                (COALESCE(t.r1_actual_hrs, 0) + COALESCE(t.r2_actual_hrs, 0)) - (COALESCE(t.r1_estimate_hrs, 0) + COALESCE(t.r2_estimate_hrs, 0)) AS hours_variance,
                CASE 
                    WHEN (COALESCE(t.r1_estimate_hrs, 0) + COALESCE(t.r2_estimate_hrs, 0)) > 0 THEN
                        ROUND(((COALESCE(t.r1_actual_hrs, 0) + COALESCE(t.r2_actual_hrs, 0)) / 
                               (COALESCE(t.r1_estimate_hrs, 0) + COALESCE(t.r2_estimate_hrs, 0)) * 100)::NUMERIC, 2)
                    ELSE 0
                END AS overall_completion_pct
            FROM tasks t
            LEFT JOIN resources r1 ON t.resource1_id = r1.id
            LEFT JOIN resources r2 ON t.resource2_id = r2.id
            LEFT JOIN projects p ON t.project_id = p.id
            WHERE t.deleted_at IS NULL
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS test_run_suite_cases (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                test_run_id UUID NOT NULL REFERENCES test_run(id) ON DELETE CASCADE,
                original_suite_id UUID REFERENCES test_suites(id) ON DELETE SET NULL,
                test_case_id UUID REFERENCES test_case(id) ON DELETE SET NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                test_case_title_snapshot VARCHAR(500),
                test_case_steps_snapshot TEXT,
                expected_result_snapshot TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(test_run_id, test_case_id)
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_test_run_suite_cases_run_id ON test_run_suite_cases(test_run_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_test_run_suite_cases_suite_id ON test_run_suite_cases(original_suite_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_test_run_suite_cases_test_case_id ON test_run_suite_cases(test_case_id)`);
        await client.query(`
            INSERT INTO test_run_suite_cases (
                test_run_id, original_suite_id, test_case_id, sort_order,
                test_case_title_snapshot, test_case_steps_snapshot, expected_result_snapshot
            )
            SELECT DISTINCT
                tr.id,
                tr.suite_id,
                te.test_case_id,
                COALESCE(NULLIF(te.sort_order, 0), tsc.sort_order, 0),
                COALESCE(te.test_case_title, tc.title),
                COALESCE(te.test_case_steps, tc.test_steps),
                COALESCE(te.expected_result, tc.expected_result)
            FROM test_run tr
            JOIN test_execution te ON te.test_run_id = tr.id
            LEFT JOIN test_case tc ON tc.id = te.test_case_id
            LEFT JOIN test_suite_cases tsc
              ON tsc.snapshot_id = tr.id
             AND tsc.test_case_id = te.test_case_id
            WHERE tr.suite_id IS NOT NULL
              AND te.test_case_id IS NOT NULL
            ON CONFLICT (test_run_id, test_case_id) DO NOTHING
        `);

        await client.query(`
            CREATE OR REPLACE VIEW v_task_test_coverage AS
            SELECT
                t.project_id,
                COUNT(DISTINCT t.id)::INTEGER AS total_tasks,
                COUNT(DISTINCT t.id) FILTER (WHERE active_tc.test_case_count > 0)::INTEGER AS tasks_with_active_test_cases,
                CASE
                    WHEN COUNT(DISTINCT t.id) > 0 THEN
                        ROUND((
                            COUNT(DISTINCT t.id) FILTER (WHERE active_tc.test_case_count > 0)::NUMERIC
                            / COUNT(DISTINCT t.id)::NUMERIC
                        ) * 100, 2)
                    ELSE 0
                END AS task_test_coverage_pct
            FROM tasks t
            LEFT JOIN LATERAL (
                SELECT COUNT(DISTINCT tc.id) AS test_case_count
                FROM task_test_cases ttc
                JOIN test_case tc ON tc.id = ttc.test_case_id
                WHERE ttc.task_id = t.id
                  AND tc.deleted_at IS NULL
                  AND tc.status = 'active'
            ) active_tc ON true
            WHERE t.deleted_at IS NULL
            GROUP BY t.project_id
        `);

        await client.query(`
            CREATE OR REPLACE VIEW v_user_story_test_coverage AS
            SELECT
                us.project_id,
                COUNT(DISTINCT us.id)::INTEGER AS total_user_stories,
                COUNT(DISTINCT us.id) FILTER (WHERE active_tc.test_case_count > 0)::INTEGER AS user_stories_with_active_test_cases,
                CASE
                    WHEN COUNT(DISTINCT us.id) > 0 THEN
                        ROUND((
                            COUNT(DISTINCT us.id) FILTER (WHERE active_tc.test_case_count > 0)::NUMERIC
                            / COUNT(DISTINCT us.id)::NUMERIC
                        ) * 100, 2)
                    ELSE 0
                END AS story_test_coverage_pct
            FROM user_stories us
            LEFT JOIN LATERAL (
                SELECT COUNT(DISTINCT tc.id) AS test_case_count
                FROM tasks t
                JOIN task_test_cases ttc ON ttc.task_id = t.id
                JOIN test_case tc ON tc.id = ttc.test_case_id
                WHERE t.parent_user_story_id = us.id
                  AND t.deleted_at IS NULL
                  AND tc.deleted_at IS NULL
                  AND tc.status = 'active'
            ) active_tc ON true
            WHERE us.deleted_at IS NULL
            GROUP BY us.project_id
        `);

        await client.query(`
            CREATE OR REPLACE VIEW v_bug_traceability AS
            SELECT
                b.id,
                b.bug_id,
                b.project_id,
                b.title,
                b.status,
                b.source,
                b.triage_status,
                COUNT(DISTINCT bte.test_execution_id)::INTEGER AS linked_test_execution_count,
                COUNT(DISTINCT bt.task_id)::INTEGER AS linked_task_count,
                (
                    b.triage_status = 'untriaged'
                    OR (
                        COUNT(DISTINCT bte.test_execution_id) = 0
                        AND COUNT(DISTINCT bt.task_id) = 0
                        AND COALESCE(array_length(b.linked_test_case_ids, 1), 0) = 0
                    )
                ) AS needs_triage
            FROM bugs b
            LEFT JOIN bug_test_executions bte ON bte.bug_id = b.id
            LEFT JOIN bug_tasks bt ON bt.bug_id = b.id
            WHERE b.deleted_at IS NULL
            GROUP BY b.id
        `);

        // Add GIN index on test_case tags
        await client.query(`CREATE INDEX IF NOT EXISTS idx_test_case_tags ON test_case USING GIN(tags) WHERE deleted_at IS NULL`);

        // Migration: Test Case Management — Sprint 1
        // Add missing columns to test_case table
        const tcAlterColumns = [
            "ALTER TABLE test_case ADD COLUMN IF NOT EXISTS preconditions TEXT",
            "ALTER TABLE test_case ADD COLUMN IF NOT EXISTS test_steps TEXT",
            "ALTER TABLE test_case ADD COLUMN IF NOT EXISTS expected_result TEXT",
            "ALTER TABLE test_case ADD COLUMN IF NOT EXISTS severity VARCHAR(20) DEFAULT 'normal'",
            "ALTER TABLE test_case ADD COLUMN IF NOT EXISTS test_type VARCHAR(50) DEFAULT 'functional'",
            "ALTER TABLE test_case ADD COLUMN IF NOT EXISTS component VARCHAR(100)",
            "ALTER TABLE test_case ADD COLUMN IF NOT EXISTS automation_status VARCHAR(20) DEFAULT 'manual'",
            "ALTER TABLE test_case ADD COLUMN IF NOT EXISTS estimated_duration_minutes INTEGER",
            "ALTER TABLE test_case ADD COLUMN IF NOT EXISTS linked_requirement_id VARCHAR(100)",
            "ALTER TABLE test_case ADD COLUMN IF NOT EXISTS linked_bug_ids UUID[] DEFAULT '{}'",
            "ALTER TABLE test_case ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES app_user(id) ON DELETE SET NULL",
            "ALTER TABLE test_case ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES app_user(id) ON DELETE SET NULL",
            "ALTER TABLE test_case ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES app_user(id) ON DELETE SET NULL",
            "ALTER TABLE test_case ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES app_user(id) ON DELETE SET NULL",
            "ALTER TABLE test_case ADD COLUMN IF NOT EXISTS sync_status VARCHAR(20) DEFAULT 'not_synced'",
            "ALTER TABLE test_case ADD COLUMN IF NOT EXISTS sync_error_message TEXT",
            "ALTER TABLE test_case ADD COLUMN IF NOT EXISTS service_name VARCHAR(100)",
            "ALTER TABLE test_case ADD COLUMN IF NOT EXISTS task_number VARCHAR(50)",
            "ALTER TABLE test_case ADD COLUMN IF NOT EXISTS is_regression BOOLEAN DEFAULT FALSE",
            "ALTER TABLE test_case ADD COLUMN IF NOT EXISTS execution_count INTEGER DEFAULT 0",
            "ALTER TABLE test_case ADD COLUMN IF NOT EXISTS note TEXT",
        ];
        for (const sql of tcAlterColumns) {
            await client.query(sql);
        }

        // Add CHECK constraints (idempotent via DO block)
        await client.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'test_case_severity_check') THEN
                    ALTER TABLE test_case ADD CONSTRAINT test_case_severity_check
                        CHECK (severity IN ('critical','major','normal','minor','trivial'));
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'test_case_test_type_check') THEN
                    ALTER TABLE test_case ADD CONSTRAINT test_case_test_type_check
                        CHECK (test_type IN ('functional','regression','smoke','integration','performance','security','usability','exploratory','automated'));
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'test_case_automation_status_check') THEN
                    ALTER TABLE test_case ADD CONSTRAINT test_case_automation_status_check
                        CHECK (automation_status IN ('manual','automated','partial','to_automate'));
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'test_case_sync_status_check') THEN
                    ALTER TABLE test_case ADD CONSTRAINT test_case_sync_status_check
                        CHECK (sync_status IN ('synced','pending','conflict','error','not_synced'));
                END IF;
            END $$;
        `);

        // Create test_case_history table
        await client.query(`
            CREATE TABLE IF NOT EXISTS test_case_history (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                test_case_id UUID NOT NULL REFERENCES test_case(id) ON DELETE CASCADE,
                action VARCHAR(50) NOT NULL,
                changed_fields TEXT[],
                before_state JSONB,
                after_state JSONB,
                change_summary TEXT,
                performed_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
                performed_by_email VARCHAR(255),
                performed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_test_case_history_case ON test_case_history(test_case_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_test_case_history_performed_at ON test_case_history(performed_at DESC)`);

        // Create indexes for test_case
        const tcIndexes = [
            "CREATE INDEX IF NOT EXISTS idx_test_case_status ON test_case(status) WHERE deleted_at IS NULL",
            "CREATE INDEX IF NOT EXISTS idx_test_case_priority ON test_case(priority) WHERE deleted_at IS NULL",
            "CREATE INDEX IF NOT EXISTS idx_test_case_test_type ON test_case(test_type) WHERE deleted_at IS NULL",
            "CREATE INDEX IF NOT EXISTS idx_test_case_automation_status ON test_case(automation_status) WHERE deleted_at IS NULL",
            "CREATE INDEX IF NOT EXISTS idx_test_case_sync_status ON test_case(sync_status) WHERE sync_status != 'synced'",
            "CREATE INDEX IF NOT EXISTS idx_test_case_assigned_to ON test_case(assigned_to) WHERE deleted_at IS NULL",
            "CREATE INDEX IF NOT EXISTS idx_test_case_created_by ON test_case(created_by) WHERE deleted_at IS NULL",
            "CREATE INDEX IF NOT EXISTS idx_test_case_test_case_id ON test_case(test_case_id) WHERE deleted_at IS NULL",
        ];
        for (const sql of tcIndexes) {
            await client.query(sql);
        }

        // Create or replace v_test_case_summary view
        await client.query(`
            CREATE OR REPLACE VIEW v_test_case_summary AS
            SELECT
                tc.id,
                tc.test_case_id,
                tc.title,
                tc.description,
                tc.preconditions,
                tc.test_steps,
                tc.expected_result,
                tc.priority,
                tc.severity,
                tc.test_type,
                tc.category,
                tc.component,
                tc.automation_status,
                tc.status,
                tc.estimated_duration_minutes,
                tc.tags,
                tc.project_id,
                tc.assigned_to,
                tc.created_by,
                tc.updated_by,
                tc.created_at,
                tc.updated_at,
                tc.deleted_at,
                tc.tuleap_artifact_id,
                tc.tuleap_url,
                tc.sync_status,
                tc.last_tuleap_sync,
                tc.service_name,
                tc.is_regression,
                tc.execution_count,
                p.project_name,
                assignee.name AS assigned_to_name,
                creator.name AS created_by_name,
                updater.name AS updated_by_name,
                le.latest_status AS latest_execution_status,
                le.latest_execution_date,
                le.test_run_name AS latest_test_run
            FROM test_case tc
            LEFT JOIN projects p ON tc.project_id = p.id
            LEFT JOIN app_user assignee ON tc.assigned_to = assignee.id
            LEFT JOIN app_user creator ON tc.created_by = creator.id
            LEFT JOIN app_user updater ON tc.updated_by = updater.id
            LEFT JOIN LATERAL (
                SELECT
                    te.status AS latest_status,
                    te.executed_at AS latest_execution_date,
                    tr.name AS test_run_name
                FROM test_execution te
                JOIN test_run tr ON te.test_run_id = tr.id
                WHERE te.test_case_id = tc.id
                ORDER BY te.executed_at DESC
                LIMIT 1
            ) le ON true
            WHERE tc.deleted_at IS NULL
        `);

        // Migration 028: Create permissions lookup table populated from catalog
        await client.query(`
            CREATE TABLE IF NOT EXISTS permissions (
                permission_key VARCHAR(100) PRIMARY KEY,
                domain VARCHAR(50) NOT NULL,
                description TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        const { ALL_PERMISSION_VALUES } = require('../../../shared/rbac/catalog.ts');
        for (const permKey of ALL_PERMISSION_VALUES) {
            const domain = permKey.split('.').slice(0, -1).join('.');
            await client.query(`
                INSERT INTO permissions (permission_key, domain)
                VALUES ($1, $2)
                ON CONFLICT (permission_key) DO UPDATE SET domain = EXCLUDED.domain
            `, [permKey, domain]);
        }

        // Migration 029: Rewrite user_permissions.permission_key from legacy to canonical keys
        const LEGACY_TO_CANONICAL = {
            'page:dashboard': 'qc.dashboard.view',
            'page:tasks': 'qc.tasks.view',
            'page:projects': 'qc.projects.view',
            'page:resources': 'qc.resources.view',
            'page:governance': 'qc.governance.view',
            'page:test-executions': 'qc.testexecutions.view',
            'page:reports': 'qc.reports.view',
            'page:users': 'qc.admin.users.view',
            'page:my-tasks': 'qc.mywork.tasks.view',
            'page:my-dashboard': 'qc.mywork.dashboard.view',
            'page:task-history': 'qc.tasks.history.view',
            'page:roles': 'qc.admin.roles.view',
            'page:journeys': 'qc.journeys.view',
            'page:teams': 'qc.team.view',
            'page:bugs': 'qc.bugs.view',
            'page:test-cases': 'qc.testcases.view',
            'page:test-suites': 'qc.testsuites.view',
            'action:tasks:create': 'qc.tasks.create',
            'action:tasks:edit': 'qc.tasks.edit',
            'action:tasks:delete': 'qc.tasks.delete',
            'action:projects:create': 'qc.projects.create',
            'action:projects:edit': 'qc.projects.edit',
            'action:projects:delete': 'qc.projects.delete',
            'action:resources:create': 'qc.resources.create',
            'action:resources:edit': 'qc.resources.edit',
            'action:resources:delete': 'qc.resources.delete',
            'action:reports:generate': 'qc.reports.generate',
            'action:my-tasks:create': 'qc.mywork.tasks.create',
            'action:my-tasks:edit': 'qc.mywork.tasks.edit',
            'action:my-tasks:delete': 'qc.mywork.tasks.delete',
            'action:journeys:assign': 'qc.journeys.assign',
            'action:journeys:view_assigned': 'qc.journeys.view_assigned',
            'action:journeys:view_team_progress': 'qc.journeys.view_team_progress',
            'action:teams:manage': 'qc.team.manage',
            'action:teams:view': 'qc.team.view',
            'action:test-cases:create': 'qc.testcases.create',
            'action:test-cases:edit': 'qc.testcases.edit',
            'action:test-cases:delete': 'qc.testcases.delete',
            'action:test-suites:create': 'qc.testsuites.create',
            'action:test-suites:edit': 'qc.testsuites.edit',
            'action:test-suites:delete': 'qc.testsuites.delete',
            'action:test-suites:reorder': 'qc.testsuites.reorder',
            'action:test-executions:create': 'qc.testexecutions.create',
            'action:test-executions:edit': 'qc.testexecutions.edit',
            'action:test-executions:delete': 'qc.testexecutions.delete',
            'action:test-results:upload': 'qc.testresults.upload',
            'action:test-results:delete': 'qc.testresults.delete',
            'action:bugs:create': 'qc.bugs.create',
            'action:bugs:edit': 'qc.bugs.edit',
            'action:bugs:delete': 'qc.bugs.delete',
            'action:governance:manage_gates': 'qc.governance.manage_gates',
            'action:governance:approve_release': 'qc.governance.approve_release',
        };
        for (const [legacyKey, canonicalKey] of Object.entries(LEGACY_TO_CANONICAL)) {
            // Delete legacy rows where the canonical key already exists for the same user (avoid duplicate conflict)
            await client.query(`
                DELETE FROM user_permissions up
                WHERE up.permission_key = $2
                  AND EXISTS (
                      SELECT 1 FROM user_permissions dup
                      WHERE dup.user_id = up.user_id AND dup.permission_key = $1
                  )
            `, [canonicalKey, legacyKey]);

            // Update remaining legacy rows to canonical
            await client.query(`
                UPDATE user_permissions
                SET permission_key = $1
                WHERE permission_key = $2
            `, [canonicalKey, legacyKey]);

            await client.query(`
                UPDATE custom_roles
                SET permissions = array_replace(permissions, $2, $1)
                WHERE $2 = ANY(permissions)
            `, [canonicalKey, legacyKey]);
        }

        console.log('Database migrations completed successfully');
    } catch (err) {
        console.error('Migration error:', err.message);
    } finally {
        client.release();
    }
};

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool,
    runMigrations
};

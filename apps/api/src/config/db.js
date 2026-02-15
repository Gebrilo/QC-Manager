const { Pool } = require('pg');

const pool = new Pool(
    process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL }
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

        await client.query(`
            CREATE TABLE IF NOT EXISTS tasks (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                task_id VARCHAR(50),
                project_id UUID,
                task_name VARCHAR(255) NOT NULL,
                description TEXT,
                status VARCHAR(50) NOT NULL DEFAULT 'Backlog',
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
                action VARCHAR(50) NOT NULL CHECK (action IN ('reassigned_out', 'rejected_new')),
                action_reason TEXT,
                tuleap_last_modified TIMESTAMP WITH TIME ZONE,
                raw_tuleap_payload JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_task_history_tuleap_artifact ON tuleap_task_history(tuleap_artifact_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_task_history_project ON tuleap_task_history(project_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_task_history_action ON tuleap_task_history(action)`);

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
        await client.query(`DROP VIEW IF EXISTS v_tasks_with_metrics CASCADE`);
        await client.query(`DROP VIEW IF EXISTS v_bug_summary CASCADE`);
        await client.query(`DROP VIEW IF EXISTS v_bug_summary_global CASCADE`);

        // Bug Summary View
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
                COUNT(b.id) FILTER (WHERE array_length(b.linked_test_execution_ids, 1) > 0) AS bugs_from_testing,
                COUNT(b.id) FILTER (WHERE b.linked_test_execution_ids IS NULL
                    OR array_length(b.linked_test_execution_ids, 1) = 0) AS standalone_bugs,
                MAX(b.reported_date) AS latest_bug_date
            FROM bugs b
            LEFT JOIN projects p ON b.project_id = p.id
            WHERE b.deleted_at IS NULL
            GROUP BY b.project_id, p.project_name
        `);

        // Global Bug Summary View
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
                COUNT(id) FILTER (WHERE array_length(linked_test_execution_ids, 1) > 0) AS bugs_from_testing,
                COUNT(id) FILTER (WHERE linked_test_execution_ids IS NULL
                    OR array_length(linked_test_execution_ids, 1) = 0) AS standalone_bugs
            FROM bugs
            WHERE deleted_at IS NULL
        `);

        await client.query(`
            CREATE OR REPLACE VIEW v_projects_with_metrics AS
            SELECT
                p.id,
                p.project_id,
                p.project_name,
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
                COUNT(t.id) AS tasks_total_count,
                SUM(CASE WHEN t.status = 'Done' THEN 1 ELSE 0 END) AS tasks_done_count,
                SUM(CASE WHEN t.status = 'In Progress' THEN 1 ELSE 0 END) AS tasks_in_progress_count,
                SUM(CASE WHEN t.status = 'Backlog' THEN 1 ELSE 0 END) AS tasks_backlog_count,
                CASE WHEN COUNT(t.id) = 0 THEN 'No Tasks' WHEN COUNT(t.id) = SUM(CASE WHEN t.status = 'Done' THEN 1 ELSE 0 END) THEN 'Complete' ELSE 'Active' END AS status,
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
                (SELECT COUNT(*) FROM tasks t WHERE (t.resource1_id = r.id OR t.resource2_id = r.id) AND t.deleted_at IS NULL AND t.status = 'Backlog') AS backlog_tasks_count,
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
                SUM(CASE WHEN t.status = 'Backlog' THEN 1 ELSE 0 END) AS tasks_backlog,
                SUM(CASE WHEN t.status = 'Cancelled' THEN 1 ELSE 0 END) AS tasks_cancelled,
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
                CONSTRAINT valid_role CHECK (role IN ('admin', 'manager', 'user', 'viewer'))
            )
        `);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_app_user_email ON app_user(email)`);

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

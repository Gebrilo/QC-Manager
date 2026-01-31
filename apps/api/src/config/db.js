const { Pool } = require('pg');

const pool = new Pool(
    process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL }
        : {
            user: process.env.POSTGRES_USER || 'qc_user',
            host: process.env.POSTGRES_HOST || 'postgres',
            database: process.env.POSTGRES_DB || 'qc_management',
            password: process.env.POSTGRES_PASSWORD || 'dev_password',
            port: process.env.POSTGRES_PORT || 5432,
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
            CREATE TABLE IF NOT EXISTS project (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                project_id VARCHAR(50),
                name VARCHAR(255) NOT NULL,
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
            CREATE TABLE IF NOT EXISTS task (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                task_id VARCHAR(50),
                project_id UUID,
                name VARCHAR(255) NOT NULL,
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
                action VARCHAR(50) NOT NULL,
                entity_type VARCHAR(50) NOT NULL,
                entity_id UUID,
                user_id VARCHAR(255),
                details JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS quality_gates (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                project_id UUID NOT NULL,
                gate_name VARCHAR(100) NOT NULL,
                threshold_value NUMERIC,
                is_mandatory BOOLEAN DEFAULT TRUE,
                is_passed BOOLEAN,
                notes TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS release_approvals (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                project_id UUID NOT NULL,
                approver_name VARCHAR(255) NOT NULL,
                decision VARCHAR(20) NOT NULL,
                comments TEXT,
                approved_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await client.query(`DROP VIEW IF EXISTS v_dashboard_metrics CASCADE`);
        await client.query(`DROP VIEW IF EXISTS v_resources_with_utilization CASCADE`);
        await client.query(`DROP VIEW IF EXISTS v_projects_with_metrics CASCADE`);
        
        await client.query(`
            CREATE OR REPLACE VIEW v_projects_with_metrics AS
            SELECT
                p.id,
                p.project_id,
                p.name AS project_name,
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
            FROM project p
            LEFT JOIN task t ON p.id = t.project_id AND t.deleted_at IS NULL
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
                0 AS current_allocation_hrs,
                0 AS utilization_pct,
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
                SUM(COALESCE(t.r1_estimate_hrs, 0) + COALESCE(t.r2_estimate_hrs, 0)) AS total_estimated_hrs,
                SUM(COALESCE(t.r1_actual_hrs, 0) + COALESCE(t.r2_actual_hrs, 0)) AS total_actual_hrs,
                COUNT(DISTINCT p.id) AS total_projects,
                (SELECT COUNT(*) FROM resources WHERE is_active = TRUE AND deleted_at IS NULL) AS active_resources,
                CURRENT_TIMESTAMP AS calculated_at
            FROM project p
            LEFT JOIN task t ON p.id = t.project_id AND t.deleted_at IS NULL
            WHERE p.deleted_at IS NULL
        `);
        
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

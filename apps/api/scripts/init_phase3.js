const db = require('../src/config/db');

async function initPhase3() {
    try {
        console.log('Initializing Phase 3 Tables...');

        // 1. Quality Gates Table
        await db.query(`
            CREATE TABLE IF NOT EXISTS quality_gates (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
                min_pass_rate NUMERIC DEFAULT 95.0,
                max_critical_defects INTEGER DEFAULT 0,
                min_test_coverage NUMERIC DEFAULT 80.0,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(project_id)
            );
        `);
        console.log('Verified table: quality_gates');

        // 2. Release Approvals Table
        await db.query(`
            CREATE TABLE IF NOT EXISTS release_approvals (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
                release_version VARCHAR(50) NOT NULL,
                status VARCHAR(20) CHECK (status IN ('APPROVED', 'REJECTED', 'PENDING')),
                approver_name VARCHAR(100),
                comments TEXT,
                gate_snapshot JSONB,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        console.log('Verified table: release_approvals');

        // 3. Seed Default Global Gate (if not exists)
        // We use project_id = NULL for global default, but UNIQUE constraint allows multiple NULLs in standard SQL? 
        // Actually Postgres treats NULLs as distinct for UNIQUE unless specified. 
        // Let's just create one for a specific "Global" concept or just handle it in app logic. 
        // For simplicity, let's insert a row for the first project found to have something to play with.

        const projectRes = await db.query('SELECT id FROM projects LIMIT 1');
        if (projectRes.rows.length > 0) {
            const pid = projectRes.rows[0].id;
            await db.query(`
                INSERT INTO quality_gates (project_id, min_pass_rate, max_critical_defects, min_test_coverage)
                VALUES ($1, 95.0, 0, 80.0)
                ON CONFLICT (project_id) DO NOTHING;
            `, [pid]);
            console.log(`Seeded default gates for project ${pid}`);
        }

        console.log('Phase 3 DB Initialization Complete.');
        process.exit(0);
    } catch (err) {
        console.error('Error initializing DB:', err);
        process.exit(1);
    }
}

initPhase3();

'use strict';

const { Pool } = require('pg');

// Opt-in real Postgres regression for ADR 0009 / #194.
//
// Run against a disposable or staging database only:
//   DATABASE_URL=postgres://... npm test -- taskAssignmentMigration.postgres.test.js
//
// For local Postgres without SSL, add:
//   DATABASE_SSL=false DATABASE_URL=postgres://... npm test -- taskAssignmentMigration.postgres.test.js
//
// The test creates a temporary schema, sets search_path for the migration pool,
// and drops that schema in cleanup.

const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
const itIfDatabaseUrl = databaseUrl ? it : it.skip;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalSupabaseDatabaseUrl = process.env.SUPABASE_DATABASE_URL;

jest.setTimeout(60000);

const IDS = Object.freeze({
    project: '10000000-0000-4000-8000-000000000001',
    primaryA: '20000000-0000-4000-8000-000000000001',
    secondaryA: '20000000-0000-4000-8000-000000000002',
    primaryOnly: '20000000-0000-4000-8000-000000000003',
    degenerate: '20000000-0000-4000-8000-000000000004',
    softPrimary: '20000000-0000-4000-8000-000000000005',
    softSecondary: '20000000-0000-4000-8000-000000000006',
    parityPrimary: '20000000-0000-4000-8000-000000000007',
    paritySecondary: '20000000-0000-4000-8000-000000000008',
    thirdSecondary: '20000000-0000-4000-8000-000000000009',
    taskPrimarySecondary: '30000000-0000-4000-8000-000000000001',
    taskPrimaryOnly: '30000000-0000-4000-8000-000000000002',
    taskDegenerate: '30000000-0000-4000-8000-000000000003',
    taskSoftDeleted: '30000000-0000-4000-8000-000000000004',
    taskParity: '30000000-0000-4000-8000-000000000005',
});

function quoteIdent(identifier) {
    return `"${identifier.replace(/"/g, '""')}"`;
}

function poolConfig(connectionString) {
    const ssl = process.env.DATABASE_SSL === 'false'
        ? false
        : connectionString.includes('supabase.co')
            ? { rejectUnauthorized: false }
            : { rejectUnauthorized: false };
    return { connectionString, ssl };
}

function withSearchPath(connectionString, schemaName) {
    const url = new URL(connectionString);
    const searchPathOption = `-c search_path=${schemaName},public`;
    const existingOptions = url.searchParams.get('options');
    url.searchParams.set('options', existingOptions ? `${existingOptions} ${searchPathOption}` : searchPathOption);
    return url.toString();
}

async function seedLegacyTasks(pool) {
    await pool.query('TRUNCATE task_resource_assignment');
    await pool.query(`
        INSERT INTO projects (id, project_id, project_name, status)
        VALUES ($1, 'PRJ-TRA', 'Task Assignment Migration Test', 'active')
        ON CONFLICT (id) DO NOTHING
    `, [IDS.project]);

    const resources = [
        [IDS.primaryA, 'Primary A', 40],
        [IDS.secondaryA, 'Secondary A', 40],
        [IDS.primaryOnly, 'Primary Only', 40],
        [IDS.degenerate, 'Degenerate Slot', 40],
        [IDS.softPrimary, 'Soft Primary', 40],
        [IDS.softSecondary, 'Soft Secondary', 40],
        [IDS.parityPrimary, 'Parity Primary', 40],
        [IDS.paritySecondary, 'Parity Secondary', 40],
        [IDS.thirdSecondary, 'Third Secondary', 40],
    ];
    for (const resource of resources) {
        await pool.query(`
            INSERT INTO resources (id, resource_name, weekly_capacity_hrs, is_active)
            VALUES ($1, $2, $3, TRUE)
            ON CONFLICT (id) DO NOTHING
        `, resource);
    }

    await pool.query(`
        INSERT INTO tasks (
            id, task_id, project_id, task_name, status,
            resource1_id, resource2_id,
            r1_estimate_hrs, r1_actual_hrs, r2_estimate_hrs, r2_actual_hrs,
            initial_estimate, final_estimate, completed_date, deleted_at
        ) VALUES
            ($1, 'TSK-BACKFILL-1', $13, 'Primary plus secondary', 'In Progress',
             $5, $6, 8, 2, 4, 1, 3, 5, NULL, NULL),
            ($2, 'TSK-BACKFILL-2', $13, 'Primary only', 'Done',
             $7, NULL, 6, 6, 0, 0, 2, 6, CURRENT_DATE, NULL),
            ($3, 'TSK-BACKFILL-3', $13, 'Degenerate secondary slot', 'Todo',
             $8, $8, 10, 0, 3, 0, 1, 10, NULL, NULL),
            ($4, 'TSK-BACKFILL-4', $13, 'Soft deleted task', 'In Progress',
             $9, $10, 5, 1, 7, 2, 1, 5, NULL, NOW())
        ON CONFLICT (id) DO UPDATE SET
            resource1_id = EXCLUDED.resource1_id,
            resource2_id = EXCLUDED.resource2_id,
            r1_estimate_hrs = EXCLUDED.r1_estimate_hrs,
            r1_actual_hrs = EXCLUDED.r1_actual_hrs,
            r2_estimate_hrs = EXCLUDED.r2_estimate_hrs,
            r2_actual_hrs = EXCLUDED.r2_actual_hrs,
            initial_estimate = EXCLUDED.initial_estimate,
            final_estimate = EXCLUDED.final_estimate,
            completed_date = EXCLUDED.completed_date,
            deleted_at = EXCLUDED.deleted_at
    `, [
        IDS.taskPrimarySecondary,
        IDS.taskPrimaryOnly,
        IDS.taskDegenerate,
        IDS.taskSoftDeleted,
        IDS.primaryA,
        IDS.secondaryA,
        IDS.primaryOnly,
        IDS.degenerate,
        IDS.softPrimary,
        IDS.softSecondary,
        IDS.parityPrimary,
        IDS.paritySecondary,
        IDS.project,
    ]);
}

async function readViewSnapshots(pool) {
    const resources = await pool.query(`
        SELECT
            id::text,
            current_allocation_hrs::numeric::text AS current_allocation_hrs,
            utilization_pct::numeric::text AS utilization_pct,
            active_tasks_count::int,
            backlog_tasks_count::int
        FROM v_resources_with_utilization
        ORDER BY id
    `);
    const dashboard = await pool.query(`
        SELECT
            total_tasks::int,
            tasks_done::int,
            tasks_in_progress::int,
            tasks_backlog::int,
            tasks_cancelled::int,
            overall_completion_rate_pct::numeric::text AS overall_completion_rate_pct,
            total_estimated_hrs::numeric::text AS total_estimated_hrs,
            total_actual_hrs::numeric::text AS total_actual_hrs,
            total_hours_variance::numeric::text AS total_hours_variance,
            total_projects::int,
            projects_with_tasks::int,
            active_resources::int,
            overallocated_resources::int
        FROM v_dashboard_metrics
    `);
    return { resources: resources.rows, dashboard: dashboard.rows[0] };
}

async function insertLegacyParityTask(pool) {
    await pool.query(`
        INSERT INTO tasks (
            id, task_id, project_id, task_name, status,
            resource1_id, resource2_id,
            r1_estimate_hrs, r1_actual_hrs, r2_estimate_hrs, r2_actual_hrs,
            initial_estimate, final_estimate, actual_effort
        ) VALUES (
            $1, 'TSK-PARITY', $2, 'Dual write parity', 'In Progress',
            $3, $4, 12, 4, 8, 3, 2, 12, 7
        )
        ON CONFLICT (id) DO UPDATE SET
            resource1_id = EXCLUDED.resource1_id,
            resource2_id = EXCLUDED.resource2_id,
            r1_estimate_hrs = EXCLUDED.r1_estimate_hrs,
            r1_actual_hrs = EXCLUDED.r1_actual_hrs,
            r2_estimate_hrs = EXCLUDED.r2_estimate_hrs,
            r2_actual_hrs = EXCLUDED.r2_actual_hrs,
            initial_estimate = EXCLUDED.initial_estimate,
            final_estimate = EXCLUDED.final_estimate,
            actual_effort = EXCLUDED.actual_effort
    `, [IDS.taskParity, IDS.project, IDS.parityPrimary, IDS.paritySecondary]);
}

async function clearParityTaskForJunctionWrite(pool) {
    await pool.query('DELETE FROM task_resource_assignment WHERE task_id = $1', [IDS.taskParity]);
    await pool.query(`
        UPDATE tasks
        SET resource1_id = NULL,
            resource2_id = NULL,
            r1_estimate_hrs = 0,
            r1_actual_hrs = 0,
            r2_estimate_hrs = 0,
            r2_actual_hrs = 0,
            initial_estimate = NULL,
            final_estimate = NULL,
            actual_effort = 0
        WHERE id = $1
    `, [IDS.taskParity]);
}

async function writeParityTaskThroughJunction(pool) {
    await pool.query(`
        INSERT INTO task_resource_assignment (
            task_id, resource_id, assignment_type, initial_estimate, final_estimate,
            estimate_hrs, actual_hrs, planned_working_days, created_at, updated_at
        ) VALUES
            ($1, $2, 'PRIMARY', 2, 12, 12, 4, 1.5, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
            ($1, $3, 'SECONDARY', NULL, NULL, 8, 3, 1, '2026-01-01T00:00:01Z', '2026-01-01T00:00:01Z')
    `, [IDS.taskParity, IDS.parityPrimary, IDS.paritySecondary]);
}

describe('ADR 0009 task assignment migration (real Postgres)', () => {
    itIfDatabaseUrl('backfills legacy slots and reports assignment-junction totals', async () => {
        const schemaName = `task_assignment_migration_${Date.now()}_${process.pid}`;
        const adminPool = new Pool(poolConfig(databaseUrl));
        const schemaSql = quoteIdent(schemaName);
        let migratedDb;

        try {
            await adminPool.query(`CREATE SCHEMA ${schemaSql}`);
            const schemaDatabaseUrl = withSearchPath(databaseUrl, schemaName);
            process.env.DATABASE_URL = schemaDatabaseUrl;
            delete process.env.SUPABASE_DATABASE_URL;

            jest.resetModules();
            migratedDb = require('../src/config/db');
            await migratedDb.runMigrations();

            const pool = migratedDb.pool;
            await seedLegacyTasks(pool);

            await migratedDb.runMigrations();

            const backfillCounts = await pool.query(`
                SELECT assignment_type, COUNT(*)::int AS count
                FROM task_resource_assignment
                GROUP BY assignment_type
                ORDER BY assignment_type
            `);
            expect(backfillCounts.rows).toEqual([
                { assignment_type: 'PRIMARY', count: 3 },
                { assignment_type: 'SECONDARY', count: 1 },
            ]);

            const backfilled = await pool.query(`
                SELECT task_id::text, resource_id::text, assignment_type, estimate_hrs::numeric::text, actual_hrs::numeric::text
                FROM task_resource_assignment
                ORDER BY task_id, assignment_type
            `);
            expect(backfilled.rows).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    task_id: IDS.taskPrimarySecondary,
                    resource_id: IDS.primaryA,
                    assignment_type: 'PRIMARY',
                    estimate_hrs: '8.00',
                    actual_hrs: '2.00',
                }),
                expect.objectContaining({
                    task_id: IDS.taskPrimarySecondary,
                    resource_id: IDS.secondaryA,
                    assignment_type: 'SECONDARY',
                    estimate_hrs: '4.00',
                    actual_hrs: '1.00',
                }),
                expect.objectContaining({
                    task_id: IDS.taskDegenerate,
                    resource_id: IDS.degenerate,
                    assignment_type: 'PRIMARY',
                }),
            ]));
            expect(backfilled.rows).not.toEqual(expect.arrayContaining([
                expect.objectContaining({ task_id: IDS.taskSoftDeleted }),
                expect.objectContaining({ task_id: IDS.taskDegenerate, assignment_type: 'SECONDARY' }),
            ]));

            const backfilledSnapshot = await readViewSnapshots(pool);
            expect(backfilledSnapshot.dashboard).toEqual(expect.objectContaining({
                total_tasks: 3,
                tasks_done: 1,
                tasks_in_progress: 1,
                tasks_backlog: 1,
                tasks_cancelled: 0,
                overall_completion_rate_pct: '21.43',
                total_estimated_hrs: '28.00',
                total_actual_hrs: '9.00',
                total_hours_variance: '-19.00',
            }));

            await pool.query(`
                INSERT INTO task_resource_assignment (
                    task_id, resource_id, assignment_type, estimate_hrs, actual_hrs, created_at, updated_at
                ) VALUES (
                    $1, $2, 'SECONDARY', 3, 4, '2026-01-01T00:00:02Z', '2026-01-01T00:00:02Z'
                )
            `, [IDS.taskPrimarySecondary, IDS.thirdSecondary]);

            const thirdSecondaryUtilization = await pool.query(`
                SELECT current_allocation_hrs::numeric::text AS current_allocation_hrs,
                       utilization_pct::numeric::text AS utilization_pct,
                       active_tasks_count::int
                FROM v_resources_with_utilization
                WHERE id = $1
            `, [IDS.thirdSecondary]);
            expect(thirdSecondaryUtilization.rows[0]).toEqual({
                current_allocation_hrs: '3.00',
                utilization_pct: '7.50',
                active_tasks_count: 1,
            });

            const threeContributorTask = await pool.query(`
                SELECT total_estimated_hrs::numeric::text AS total_estimated_hrs,
                       total_actual_hrs::numeric::text AS total_actual_hrs,
                       hours_variance::numeric::text AS hours_variance
                FROM v_tasks_with_metrics
                WHERE id = $1
            `, [IDS.taskPrimarySecondary]);
            expect(threeContributorTask.rows[0]).toEqual({
                total_estimated_hrs: '15.00',
                total_actual_hrs: '7.00',
                hours_variance: '-8.00',
            });

            await insertLegacyParityTask(pool);
            await clearParityTaskForJunctionWrite(pool);
            await writeParityTaskThroughJunction(pool);

            const mirrored = await pool.query(`
                SELECT
                    resource1_id::text,
                    resource2_id::text,
                    r1_estimate_hrs::numeric::text,
                    r1_actual_hrs::numeric::text,
                    r2_estimate_hrs::numeric::text,
                    r2_actual_hrs::numeric::text,
                    initial_estimate::numeric::text,
                    final_estimate::numeric::text,
                    actual_effort::numeric::text
                FROM tasks
                WHERE id = $1
            `, [IDS.taskParity]);
            expect(mirrored.rows[0]).toEqual({
                resource1_id: IDS.parityPrimary,
                resource2_id: IDS.paritySecondary,
                r1_estimate_hrs: '12.00',
                r1_actual_hrs: '4.00',
                r2_estimate_hrs: '8.00',
                r2_actual_hrs: '3.00',
                initial_estimate: '2.00',
                final_estimate: '12.00',
                actual_effort: '7.00',
            });

            const parityViewTotals = await pool.query(`
                SELECT total_estimated_hrs::numeric::text AS total_estimated_hrs,
                       total_actual_hrs::numeric::text AS total_actual_hrs
                FROM v_tasks_with_metrics
                WHERE id = $1
            `, [IDS.taskParity]);
            expect(parityViewTotals.rows[0]).toEqual({
                total_estimated_hrs: '20.00',
                total_actual_hrs: '7.00',
            });
        } finally {
            if (migratedDb?.pool) await migratedDb.pool.end();
            if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
            else process.env.DATABASE_URL = originalDatabaseUrl;
            if (originalSupabaseDatabaseUrl === undefined) delete process.env.SUPABASE_DATABASE_URL;
            else process.env.SUPABASE_DATABASE_URL = originalSupabaseDatabaseUrl;
            await adminPool.query(`DROP SCHEMA IF EXISTS ${schemaSql} CASCADE`);
            await adminPool.end();
        }
    });
});

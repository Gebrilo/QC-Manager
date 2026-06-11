'use strict';

const { Pool } = require('pg');

// Post-regression smoke test: verify the legacy assignment columns and
// trigger were dropped during ADR 0009 Phase 3.
//
// Run against a disposable or staging database only:
//   DATABASE_URL=postgres://... npm test -- taskAssignmentMigration.postgres.test.js
//
// For local Postgres without SSL, add:
//   DATABASE_SSL=false DATABASE_URL=postgres://... npm test -- taskAssignmentMigration.postgres.test.js

const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
const itIfDatabaseUrl = databaseUrl ? it : it.skip;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalSupabaseDatabaseUrl = process.env.SUPABASE_DATABASE_URL;

jest.setTimeout(60000);

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

describe('ADR 0009 Phase 3 — legacy columns and trigger removed', () => {
    itIfDatabaseUrl('tasks table lacks legacy assignment columns and trigger', async () => {
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

            const columns = await pool.query(`
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = 'tasks'
                  AND column_name IN (
                      'resource1_id', 'resource2_id',
                      'r1_estimate_hrs', 'r1_actual_hrs',
                      'r2_estimate_hrs', 'r2_actual_hrs'
                  )
            `);
            expect(columns.rows).toEqual([]);

            const triggers = await pool.query(`
                SELECT trigger_name
                FROM information_schema.triggers
                WHERE event_object_schema = current_schema()
                  AND event_object_table = 'tasks'
                  AND trigger_name = 'sync_task_assignment_cache'
            `);
            expect(triggers.rows).toEqual([]);

            const functions = await pool.query(`
                SELECT routine_name
                FROM information_schema.routines
                WHERE routine_schema = current_schema()
                  AND routine_name = 'sync_task_assignment_cache'
            `);
            expect(functions.rows).toEqual([]);

            const viewExists = await pool.query(`
                SELECT 1
                FROM information_schema.views
                WHERE table_schema = current_schema()
                  AND table_name = 'v_tasks_with_metrics'
            `);
            expect(viewExists.rows).toHaveLength(1);

            const viewCols = await pool.query(`
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = 'v_tasks_with_metrics'
                  AND column_name IN (
                      'resource1_id', 'resource2_id',
                      'r1_estimate_hrs', 'r1_actual_hrs',
                      'r2_estimate_hrs', 'r2_actual_hrs',
                      'total_estimated_hrs', 'total_actual_hrs'
                  )
                ORDER BY column_name
            `);
            expect(viewCols.rows.map(r => r.column_name)).toEqual(
                expect.arrayContaining([
                    'r1_actual_hrs', 'r1_estimate_hrs',
                    'r2_actual_hrs', 'r2_estimate_hrs',
                    'resource1_id', 'resource2_id',
                    'total_actual_hrs', 'total_estimated_hrs',
                ])
            );
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

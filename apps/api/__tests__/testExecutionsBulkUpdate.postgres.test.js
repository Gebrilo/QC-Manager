'use strict';

// Regression test for the bulk execution-status update 500:
//   POST /test-executions/test-runs/:id/executions/bulk
//   -> 500 {"error":"inconsistent types deduced for parameter $1"}
//
// Root cause: `test_execution.status` is VARCHAR. The handler reused one
// placeholder for the new status across `status = $n` (deduced character
// varying) and `status IS DISTINCT FROM $n` / `$n <> 'not_run'` (deduced
// text). Postgres rejects the conflicting deductions for a single parameter.
// The fix pins every use of that placeholder to ::text.
//
// This must run against a real Postgres — a mocked pool cannot reproduce
// Postgres parameter type deduction. Gated on DATABASE_URL, skipped otherwise:
//   DATABASE_SSL=false DATABASE_URL=postgres://user:pass@host/db \
//     npm test -- testExecutionsBulkUpdate.postgres.test.js

const { Pool } = require('pg');
const express = require('express');
const request = require('supertest');

const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
const describeIfDb = databaseUrl ? describe : describe.skip;

jest.setTimeout(60000);

function poolConfig(connectionString) {
    const ssl = process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false };
    return { connectionString, ssl };
}

const RUN_ID = '08c13b19-8a5a-4975-b2f1-2a5775ad0a0f';
const EXEC_A = '629220ca-14a4-48d8-b723-0f3f1a9f1e73';
const EXEC_B = '9dec8683-1cfc-4e57-b9cc-9d44c70b74f3';
const USER_ID = '11111111-1111-1111-1111-111111111111';

describeIfDb('POST /test-runs/:id/executions/bulk — type-deduction regression', () => {
    let adminPool;
    let schemaName;
    let app;
    const currentUser = { value: { id: USER_ID, email: 'qa@x.io', role: 'admin' } };

    beforeAll(async () => {
        schemaName = `bulk_update_regression_${Date.now()}_${process.pid}`;
        adminPool = new Pool(poolConfig(databaseUrl));
        await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
        await adminPool.query(`SET search_path TO "${schemaName}", public`);

        // Mirror the production test_execution shape: VARCHAR status + the
        // executor/assignment columns the handler writes and returns.
        const schemaPool = new Pool({ ...poolConfig(databaseUrl) });
        const init = await schemaPool.connect();
        await init.query(`SET search_path TO "${schemaName}", public`);
        await init.query(`
            CREATE TABLE test_run (
                id UUID PRIMARY KEY,
                deleted_at TIMESTAMPTZ
            )`);
        await init.query(`
            CREATE TABLE test_execution (
                id UUID PRIMARY KEY,
                test_run_id UUID NOT NULL,
                test_case_id UUID,
                status VARCHAR(20) NOT NULL,
                notes TEXT,
                duration_seconds INTEGER,
                defect_ids UUID[],
                created_at TIMESTAMPTZ DEFAULT now(),
                updated_at TIMESTAMPTZ DEFAULT now(),
                executed_by UUID,
                executed_at TIMESTAMPTZ,
                assigned_to UUID
            )`);
        await init.query(`INSERT INTO test_run (id) VALUES ($1)`, [RUN_ID]);
        await init.query(
            `INSERT INTO test_execution (id, test_run_id, status) VALUES ($1,$2,'not_run'),($3,$4,'pass')`,
            [EXEC_A, RUN_ID, EXEC_B, RUN_ID]
        );
        init.release();

        // Mock the db module so the router talks to our disposable schema.
        jest.resetModules();
        jest.doMock('../src/config/db', () => ({
            pool: {
                connect: async () => {
                    const c = await schemaPool.connect();
                    await c.query(`SET search_path TO "${schemaName}", public`);
                    return c;
                },
                query: (...a) => schemaPool.query(...a),
            },
            query: (...a) => schemaPool.query(...a),
        }));
        jest.doMock('../src/middleware/authMiddleware', () => ({
            requireAuth: (req, _res, next) => { req.user = currentUser.value; next(); },
            blockContributors: (_req, _res, next) => next(),
            requirePermission: () => (_req, _res, next) => next(),
        }));

        const router = require('../src/routes/testExecutions');
        app = express();
        app.use(express.json());
        app.use('/test-executions', router);

        // keep a handle so afterAll can close it
        app.locals.schemaPool = schemaPool;
    });

    afterAll(async () => {
        if (app && app.locals.schemaPool) await app.locals.schemaPool.end();
        if (adminPool) {
            await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
            await adminPool.end();
        }
    });

    it('bulk status update returns 200 (no "inconsistent types" 500)', async () => {
        const res = await request(app)
            .post(`/test-executions/test-runs/${RUN_ID}/executions/bulk`)
            .send({ execution_ids: [EXEC_A, EXEC_B], status: 'pass' });

        expect(res.status).toBe(200);
        expect(res.body.updated).toBe(2);
    });

    it('stamps executed_by only on rows whose status actually changed', async () => {
        const pool = app.locals.schemaPool;
        const a = await pool.query('SELECT status, executed_by FROM test_execution WHERE id = $1', [EXEC_A]);
        const b = await pool.query('SELECT status, executed_by FROM test_execution WHERE id = $1', [EXEC_B]);
        // EXEC_A went not_run -> pass: executor stamped.
        expect(a.rows[0].status).toBe('pass');
        expect(a.rows[0].executed_by).toBe(USER_ID);
        // EXEC_B was already pass: status unchanged, executor untouched (NULL).
        expect(b.rows[0].status).toBe('pass');
        expect(b.rows[0].executed_by).toBeNull();
    });

    it('status=not_run does not stamp executor', async () => {
        const res = await request(app)
            .post(`/test-executions/test-runs/${RUN_ID}/executions/bulk`)
            .send({ execution_ids: [EXEC_A, EXEC_B], status: 'not_run' });
        expect(res.status).toBe(200);

        const pool = app.locals.schemaPool;
        // EXEC_A keeps its previously-stamped executor (CASE ELSE branch);
        // it is not cleared just because we moved to not_run.
        const a = await pool.query('SELECT status, executed_by FROM test_execution WHERE id = $1', [EXEC_A]);
        expect(a.rows[0].status).toBe('not_run');
        expect(a.rows[0].executed_by).toBe(USER_ID);
    });
});

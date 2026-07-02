'use strict';

const { Pool } = require('pg');
const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
const describeIfDb = databaseUrl ? describe : describe.skip;

jest.setTimeout(60000);

function poolConfig(connectionString) {
    const ssl = process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false };
    return { connectionString, ssl };
}

function quoteIdent(identifier) {
    return `"${identifier.replace(/"/g, '""')}"`;
}

function withSearchPath(connectionString, schemaName) {
    const url = new URL(connectionString);
    const searchPathOption = `-c search_path=${schemaName},public`;
    const existingOptions = url.searchParams.get('options');
    url.searchParams.set('options', existingOptions ? `${existingOptions} ${searchPathOption}` : searchPathOption);
    return url.toString();
}

const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const VIEWER_ID = '22222222-2222-2222-2222-222222222222';
const ACTOR_ID = '33333333-3333-3333-3333-333333333333';
const TASK_ID = '44444444-4444-4444-4444-444444444444';
const ACL_ID = '55555555-5555-5555-5555-555555555555';

describeIfDb('GET /admin/access/audit — Postgres-backed behavior', () => {
    let adminPool;
    let schemaPool;
    let schemaName;
    let app;
    let originalRbacUnified;
    let originalJwtSecret;
    let originalSupabaseJwtSecret;

    function tokenFor(userId) {
        return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
    }

    beforeAll(async () => {
        originalRbacUnified = process.env.RBAC_UNIFIED;
        originalJwtSecret = process.env.JWT_SECRET;
        originalSupabaseJwtSecret = process.env.SUPABASE_JWT_SECRET;
        process.env.RBAC_UNIFIED = 'on';
        process.env.JWT_SECRET = 'audit-route-test-secret';
        delete process.env.SUPABASE_JWT_SECRET;

        schemaName = `admin_access_audit_${Date.now()}_${process.pid}`;
        adminPool = new Pool(poolConfig(databaseUrl));
        await adminPool.query(`CREATE SCHEMA ${quoteIdent(schemaName)}`);

        schemaPool = new Pool(poolConfig(withSearchPath(databaseUrl, schemaName)));
        await schemaPool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
        await schemaPool.query(`
            CREATE TABLE app_user (
                id UUID PRIMARY KEY,
                email TEXT NOT NULL,
                name TEXT,
                role TEXT NOT NULL,
                active BOOLEAN NOT NULL DEFAULT TRUE,
                status TEXT NOT NULL DEFAULT 'ACTIVE',
                team_membership_active BOOLEAN NOT NULL DEFAULT TRUE,
                team_id UUID,
                supabase_id TEXT
            );
            CREATE TABLE role_permissions (
                role_identifier TEXT NOT NULL,
                permission_key TEXT NOT NULL,
                granted_by TEXT,
                created_at TIMESTAMPTZ DEFAULT now(),
                PRIMARY KEY (role_identifier, permission_key)
            );
            CREATE TABLE user_permissions (
                user_id UUID NOT NULL,
                permission_key TEXT NOT NULL,
                granted BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMPTZ DEFAULT now(),
                PRIMARY KEY (user_id, permission_key)
            );
            CREATE TABLE role_scopes (
                role_identifier TEXT NOT NULL,
                scope_key TEXT NOT NULL,
                granted_by TEXT,
                seeded_at TIMESTAMPTZ DEFAULT now(),
                PRIMARY KEY (role_identifier, scope_key)
            );
            CREATE TABLE user_scopes (
                user_id UUID NOT NULL,
                scope_key TEXT NOT NULL,
                granted BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMPTZ DEFAULT now(),
                updated_at TIMESTAMPTZ DEFAULT now(),
                PRIMARY KEY (user_id, scope_key)
            );
            CREATE TABLE project_managers (
                project_id UUID NOT NULL,
                user_id UUID NOT NULL
            );
            CREATE TABLE audit_log (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                entity_type TEXT NOT NULL,
                entity_uuid UUID,
                entity_id UUID,
                entity_key TEXT,
                action TEXT NOT NULL,
                user_id UUID,
                user_email TEXT,
                before_state JSONB,
                after_state JSONB,
                changed_fields TEXT[],
                change_summary TEXT,
                details JSONB,
                created_at TIMESTAMPTZ DEFAULT now()
            );
        `);

        await schemaPool.query(
            `INSERT INTO app_user (id, email, name, role, active, status)
             VALUES
                ($1, 'admin@example.test', 'Admin', 'admin', TRUE, 'ACTIVE'),
                ($2, 'viewer@example.test', 'Viewer', 'viewer', TRUE, 'ACTIVE'),
                ($3, 'actor@example.test', 'Actor', 'tester', TRUE, 'ACTIVE')`,
            [ADMIN_ID, VIEWER_ID, ACTOR_ID]
        );
        await schemaPool.query(
            `INSERT INTO role_permissions (role_identifier, permission_key, granted_by)
             VALUES ('admin', 'qc.admin.view_audit_log', 'test-seed')`
        );
        await schemaPool.query(
            `INSERT INTO audit_log (
                id, entity_type, entity_uuid, entity_id, action, user_id, user_email,
                before_state, after_state, changed_fields, change_summary, details, created_at
             ) VALUES
                (
                    uuid_generate_v4(), 'task', $1, $1, 'ACCESS_DENIED', $2, 'actor@example.test',
                    NULL, NULL, NULL, 'Denied task access', '{"reason":"outside_team","target_entity_id":"44444444-4444-4444-4444-444444444444"}'::jsonb, '2026-07-02T10:00:00Z'
                ),
                (
                    uuid_generate_v4(), 'role_permission', NULL, NULL, 'UPDATE', $3, 'admin@example.test',
                    '{"granted":false}'::jsonb, '{"granted":true}'::jsonb, ARRAY['granted'], 'Granted audit log permission', '{"permission_key":"qc.admin.view_audit_log"}'::jsonb, '2026-07-02T09:00:00Z'
                ),
                (
                    uuid_generate_v4(), 'artifact_access', $4, $4, 'CREATE', $3, 'admin@example.test',
                    NULL, '{"subject_type":"role"}'::jsonb, ARRAY['subject_type'], 'Granted artifact ACL', '{"artifact_id":"55555555-5555-5555-5555-555555555555"}'::jsonb, '2026-07-01T08:00:00Z'
                )`,
            [TASK_ID, ACTOR_ID, ADMIN_ID, ACL_ID]
        );

        jest.resetModules();
        jest.doMock('../src/config/db', () => ({
            pool: schemaPool,
            query: (...args) => schemaPool.query(...args),
        }));

        app = express();
        app.use(express.json());
        app.use('/admin/access', require('../src/routes/adminAccess'));
        app.use((err, _req, res, _next) => {
            res.status(err.status || 500).json({ error: err.message });
        });
    });

    afterAll(async () => {
        if (schemaPool) await schemaPool.end();
        if (adminPool) {
            await adminPool.query(`DROP SCHEMA IF EXISTS ${quoteIdent(schemaName)} CASCADE`);
            await adminPool.end();
        }
        if (originalRbacUnified === undefined) delete process.env.RBAC_UNIFIED;
        else process.env.RBAC_UNIFIED = originalRbacUnified;
        if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = originalJwtSecret;
        if (originalSupabaseJwtSecret === undefined) delete process.env.SUPABASE_JWT_SECRET;
        else process.env.SUPABASE_JWT_SECRET = originalSupabaseJwtSecret;
    });

    it('returns 403 when the actor lacks qc.admin.view_audit_log', async () => {
        const res = await request(app)
            .get('/admin/access/audit')
            .set('Authorization', `Bearer ${tokenFor(VIEWER_ID)}`);

        expect(res.status).toBe(403);
    });

    it('maps denials to ACCESS_DENIED and honors actor, target, and timestamp filters', async () => {
        const res = await request(app)
            .get('/admin/access/audit')
            .query({
                event_type: 'access_denied',
                actor_user_id: ACTOR_ID,
                target_entity_type: 'task',
                target_entity_id: TASK_ID,
                since: '2026-07-02T00:00:00Z',
                until: '2026-07-03T00:00:00Z',
                limit: 10,
                offset: 0,
            })
            .set('Authorization', `Bearer ${tokenFor(ADMIN_ID)}`);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ total: 1, limit: 10, offset: 0 });
        expect(res.body.rows).toHaveLength(1);
        expect(res.body.rows[0]).toMatchObject({
            entity_type: 'task',
            action: 'ACCESS_DENIED',
            user_id: ACTOR_ID,
            change_summary: 'Denied task access',
        });
        expect(res.body.rows[0].details).toMatchObject({ reason: 'outside_team' });
    });

    it('paginates with total count while preserving newest-first order', async () => {
        const res = await request(app)
            .get('/admin/access/audit')
            .query({ limit: 1, offset: 1 })
            .set('Authorization', `Bearer ${tokenFor(ADMIN_ID)}`);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ total: 3, limit: 1, offset: 1 });
        expect(res.body.rows).toHaveLength(1);
        expect(res.body.rows[0]).toMatchObject({
            entity_type: 'role_permission',
            action: 'UPDATE',
        });
    });
});

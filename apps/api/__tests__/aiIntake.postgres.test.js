'use strict';

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

const USER_ID = '11111111-1111-1111-1111-111111111111';
const PROJECT_A = '22222222-2222-2222-2222-222222222222';
const PROJECT_B = '33333333-3333-3333-3333-333333333333';
const STORY_ID = '44444444-4444-4444-4444-444444444444';

describeIfDb('AI intake HTTP endpoints — Postgres-backed behavior', () => {
    let adminPool;
    let schemaPool;
    let schemaName;
    let app;
    let triggerWorkflow;

    beforeAll(async () => {
        schemaName = `ai_intake_${Date.now()}_${process.pid}`;
        adminPool = new Pool(poolConfig(databaseUrl));
        await adminPool.query(`CREATE SCHEMA ${quoteIdent(schemaName)}`);

        schemaPool = new Pool(poolConfig(withSearchPath(databaseUrl, schemaName)));
        await schemaPool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
        await schemaPool.query(`
            CREATE TABLE projects (
                id UUID PRIMARY KEY,
                project_id TEXT,
                project_name TEXT NOT NULL,
                team_id UUID,
                ai_intake_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                deleted_at TIMESTAMPTZ
            );
            CREATE TABLE user_stories (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                tuleap_artifact_id INTEGER UNIQUE,
                tuleap_tracker_id INTEGER,
                tuleap_url TEXT,
                title TEXT NOT NULL,
                description TEXT,
                acceptance_criteria TEXT,
                generated_by_ai BOOLEAN NOT NULL DEFAULT FALSE,
                source TEXT NOT NULL DEFAULT 'manual',
                status TEXT NOT NULL DEFAULT 'Draft',
                requirement_version TEXT,
                priority TEXT,
                ba_author TEXT,
                project_id UUID,
                sync_status TEXT,
                owner_team_id UUID,
                visibility_scope TEXT,
                created_by_user_id UUID,
                created_at TIMESTAMPTZ DEFAULT now(),
                updated_at TIMESTAMPTZ DEFAULT now(),
                deleted_at TIMESTAMPTZ
            );
            CREATE TABLE tasks (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                task_id TEXT,
                project_id UUID,
                task_name TEXT NOT NULL,
                description TEXT,
                status TEXT NOT NULL DEFAULT 'Todo',
                priority TEXT DEFAULT 'Medium',
                estimate_days NUMERIC,
                deadline DATE,
                tags TEXT[],
                notes TEXT,
                expected_start_date DATE,
                actual_start_date DATE,
                completed_date DATE,
                parent_user_story_id UUID,
                sync_status TEXT,
                generated_by_ai BOOLEAN NOT NULL DEFAULT FALSE,
                source TEXT NOT NULL DEFAULT 'manual',
                owner_team_id UUID,
                visibility_scope TEXT,
                created_by_user_id UUID,
                created_at TIMESTAMPTZ DEFAULT now(),
                updated_at TIMESTAMPTZ DEFAULT now(),
                deleted_at TIMESTAMPTZ
            );
            CREATE TABLE ai_content_generation_logs (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                request_type TEXT NOT NULL,
                project_id UUID,
                user_story_id UUID,
                content_hash TEXT,
                source_content_hash TEXT,
                raw_payload JSONB,
                generated_content JSONB,
                status TEXT NOT NULL DEFAULT 'received',
                error_message TEXT,
                force_import BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMPTZ DEFAULT now(),
                processed_at TIMESTAMPTZ,
                source TEXT
            );
            CREATE UNIQUE INDEX uq_ai_content_logs_story_hash
                ON ai_content_generation_logs(project_id, request_type, source_content_hash)
                WHERE request_type = 'ai_intake_user_story'
                  AND force_import = FALSE
                  AND source_content_hash IS NOT NULL
                  AND status <> 'failed';
            CREATE TABLE audit_log (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                entity_type TEXT NOT NULL,
                entity_uuid UUID,
                entity_id UUID,
                entity_key TEXT,
                action TEXT NOT NULL,
                before_state JSONB,
                after_state JSONB,
                changed_fields TEXT[],
                details JSONB,
                change_summary TEXT,
                user_email TEXT,
                created_at TIMESTAMPTZ DEFAULT now()
            );
            CREATE VIEW v_tasks_with_metrics AS SELECT * FROM tasks;
        `);
        await schemaPool.query(
            `INSERT INTO projects (id, project_id, project_name, ai_intake_enabled)
             VALUES ($1, 'A', 'Alpha', TRUE), ($2, 'B', 'Beta', TRUE)`,
            [PROJECT_A, PROJECT_B]
        );

        jest.resetModules();
        jest.doMock('../src/config/db', () => ({
            pool: schemaPool,
            query: (...args) => schemaPool.query(...args),
        }));
        jest.doMock('../src/middleware/authMiddleware', () => ({
            requireAuth: (req, _res, next) => {
                req.user = { id: USER_ID, email: 'pm@example.test', role: 'pm', active: true, status: 'ACTIVE' };
                next();
            },
            requirePermission: () => (_req, _res, next) => next(),
            userHasAnyPermission: jest.fn().mockResolvedValue(true),
        }));
        jest.doMock('../src/services/notifications/dispatcher', () => ({
            dispatchFromAudit: jest.fn().mockResolvedValue(undefined),
        }));
        jest.doMock('../src/routes/landingContentWebhooks', () => ({
            validateAgentSecret: req => req.get('x-qc-agent-secret') === 'test-secret'
                ? { ok: true }
                : { ok: false, status: 401, error: 'Missing agent webhook secret' },
        }));
        triggerWorkflow = jest.fn().mockResolvedValue(undefined);
        jest.doMock('../src/utils/n8n', () => ({ triggerWorkflow }));

        app = express();
        app.use(express.json());
        app.use('/ai-intake', require('../src/routes/aiIntake'));
        app.use('/webhooks/ai-intake', require('../src/routes/aiIntakeWebhooks'));
        app.use((err, _req, res, _next) => {
            res.status(err.status || 500).json({ success: false, error: err.message });
        });
    });

    afterAll(async () => {
        if (schemaPool) await schemaPool.end();
        if (adminPool) {
            await adminPool.query(`DROP SCHEMA IF EXISTS ${quoteIdent(schemaName)} CASCADE`);
            await adminPool.end();
        }
    });

    it('creates a standalone AI story and supplied tasks with audit rows', async () => {
        const res = await request(app)
            .post('/ai-intake/user-story')
            .send({
                project_id: PROJECT_A,
                markdown: '# Checkout\n\n## Description\nPay online\n\n## Acceptance Criteria\n- Card accepted',
                create_tasks: true,
                skill_name: 'prd-skill',
                source_agent: 'codex',
                tasks: [{ title: 'Implement payment form', definition_of_done: ['Form validates'] }],
            });

        expect(res.status).toBe(201);
        expect(res.body.story).toEqual(expect.objectContaining({
            status: 'Review',
            source: 'ai_intake',
            generated_by_ai: true,
            sync_status: 'standalone',
        }));
        expect(res.body.tasks).toHaveLength(1);

        const tasks = await schemaPool.query('SELECT * FROM tasks WHERE parent_user_story_id = $1', [res.body.story.id]);
        expect(tasks.rows).toHaveLength(1);
        expect(tasks.rows[0]).toEqual(expect.objectContaining({
            project_id: PROJECT_A,
            status: 'Todo',
            source: 'ai_intake',
            generated_by_ai: true,
            sync_status: 'standalone',
        }));

        const audits = await schemaPool.query(
            `SELECT entity_type, action FROM audit_log WHERE entity_type IN ('user_stories', 'tasks', 'ai_content_generation_logs')`
        );
        expect(audits.rows.map(row => `${row.entity_type}:${row.action}`)).toEqual(expect.arrayContaining([
            'user_stories:CREATE',
            'tasks:CREATE',
            'ai_content_generation_logs:CREATE',
        ]));
        expect(triggerWorkflow).not.toHaveBeenCalled();
    });

    it('deduplicates normalized content per project and allows force/cross-project imports', async () => {
        const first = await request(app)
            .post('/ai-intake/user-story')
            .send({ project_id: PROJECT_A, markdown: '# Duplicate\n\n## Acceptance Criteria\n- One' });
        expect(first.status).toBe(201);

        const duplicate = await request(app)
            .post('/ai-intake/user-story')
            .send({ project_id: PROJECT_A, markdown: '  # Duplicate   \n\n   ## Acceptance Criteria   \n - One   ' });
        expect(duplicate.status).toBe(409);
        expect(duplicate.body.existing_user_story_id).toBe(first.body.story.id);

        const forced = await request(app)
            .post('/ai-intake/user-story')
            .send({ project_id: PROJECT_A, markdown: '# Duplicate\n\n## Acceptance Criteria\n- One', force_import: true });
        expect(forced.status).toBe(201);

        const otherProject = await request(app)
            .post('/ai-intake/user-story')
            .send({ project_id: PROJECT_B, markdown: '# Duplicate\n\n## Acceptance Criteria\n- One' });
        expect(otherProject.status).toBe(201);
    });

    it('queues async generation, processes callback tasks, and records failures', async () => {
        const queued = await request(app)
            .post('/ai-intake/user-story')
            .send({
                project_id: PROJECT_A,
                markdown: '# Async\n\n## Acceptance Criteria\n- Done',
                create_tasks: true,
            });

        expect(queued.status).toBe(202);
        expect(queued.body.task_generation.status).toBe('pending');
        expect(triggerWorkflow).toHaveBeenCalledTimes(1);
        expect((await schemaPool.query('SELECT COUNT(*)::int AS count FROM tasks WHERE parent_user_story_id = $1', [queued.body.story.id])).rows[0].count).toBe(0);

        const callback = await request(app)
            .post(`/webhooks/ai-intake/user-story/${queued.body.story.id}/tasks`)
            .set('x-qc-agent-secret', 'test-secret')
            .send({
                job_id: queued.body.task_generation.job_id,
                tasks: Array.from({ length: 25 }, (_, index) => ({ title: `Generated ${index + 1}` })),
            });

        expect(callback.status).toBe(201);
        expect(callback.body.task_generation.cap_applied).toBe(true);
        expect(callback.body.task_generation.created_task_count).toBe(20);

        const failedStory = await schemaPool.query(
            `INSERT INTO user_stories (id, title, project_id, generated_by_ai, source, status, sync_status)
             VALUES ($1, 'Failed async', $2, TRUE, 'ai_intake', 'Review', 'standalone')
             RETURNING *`,
            [STORY_ID, PROJECT_A]
        );
        const failedJob = await schemaPool.query(
            `INSERT INTO ai_content_generation_logs (request_type, project_id, user_story_id, status)
             VALUES ('ai_intake_task_generation', $1, $2, 'pending')
             RETURNING *`,
            [PROJECT_A, failedStory.rows[0].id]
        );
        const failed = await request(app)
            .post(`/webhooks/ai-intake/user-story/${failedStory.rows[0].id}/tasks`)
            .set('x-qc-agent-secret', 'test-secret')
            .send({ job_id: failedJob.rows[0].id, status: 'failed', error_message: 'n8n timeout' });

        expect(failed.status).toBe(200);
        const failedLog = await schemaPool.query('SELECT status, error_message FROM ai_content_generation_logs WHERE id = $1', [failedJob.rows[0].id]);
        expect(failedLog.rows[0]).toEqual(expect.objectContaining({ status: 'failed', error_message: 'n8n timeout' }));
    });
});

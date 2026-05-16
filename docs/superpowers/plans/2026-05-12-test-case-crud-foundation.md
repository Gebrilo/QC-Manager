# Test Case Management — Sprint 1: CRUD Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the full test case CRUD foundation — enhanced database schema, API endpoints, and frontend pages — so test cases can be created, listed, viewed, edited, and deleted entirely through the local QC-Manager API (no Tuleap dependency for basic CRUD).

**Architecture:** We enhance the existing `test_case` table with missing columns from the PRD, create the `v_test_case_summary` view and `test_case_history` audit table, update the API routes with richer Zod schemas, and rewrite the frontend to use the local API instead of Tuleap. The table unification (merging `test_cases` into `test_case`) is deferred to a later sprint — Sprint 1 works with the existing `test_case` table.

**Tech Stack:** Express.js, PostgreSQL (Supabase), Zod, Next.js 14 (App Router), React Hook Form, Tailwind CSS, date-fns

---

## File Structure

### Database (migrations in `apps/api/src/config/db.js`)
- Modify: `apps/api/src/config/db.js` — add new columns to `test_case`, create `test_case_history` table, create `v_test_case_summary` view

### API Routes
- Modify: `apps/api/src/routes/testCases.js` — enhanced CRUD with new fields, server-side pagination, history logging
- Modify: `apps/api/src/index.js` — no changes needed (route already registered)

### Frontend Types
- Modify: `apps/web/src/types/index.ts` — enhanced `TestCase` interface with all PRD fields

### Frontend API Client
- Modify: `apps/web/src/lib/api.ts` — enhanced `testCasesApi` with full CRUD + list params

### Frontend Pages
- Modify: `apps/web/app/test-cases/page.tsx` — rewritten list with server-side filtering and pagination
- Modify: `apps/web/app/test-cases/create/page.tsx` — use new form component
- Modify: `apps/web/app/test-cases/[id]/page.tsx` — rewritten detail using local API
- Modify: `apps/web/app/test-cases/[id]/edit/page.tsx` — rewritten edit using local API

### Frontend Components
- Modify: `apps/web/src/components/test-cases/TestCaseForm.tsx` — rewritten to submit via local API with all PRD fields

### Navigation
- Modify: `apps/web/src/config/routes.ts` — add Test Cases to sidebar with icon

---

## Task 1: Database — Add Missing Columns to `test_case` Table

**Files:**
- Modify: `apps/api/src/config/db.js` (append new migrations before the final `console.log`)

- [ ] **Step 1: Add the migration block for new columns, history table, and view**

Append the following migration block in `runMigrations()` in `apps/api/src/config/db.js`, right before the line `console.log('Database migrations completed successfully');`:

```javascript
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
                -- severity check
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'test_case_severity_check') THEN
                    ALTER TABLE test_case ADD CONSTRAINT test_case_severity_check
                        CHECK (severity IN ('critical','major','normal','minor','trivial'));
                END IF;
                -- test_type check
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'test_case_test_type_check') THEN
                    ALTER TABLE test_case ADD CONSTRAINT test_case_test_type_check
                        CHECK (test_type IN ('functional','regression','smoke','integration','performance','security','usability','exploratory','automated'));
                END IF;
                -- automation_status check
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'test_case_automation_status_check') THEN
                    ALTER TABLE test_case ADD CONSTRAINT test_case_automation_status_check
                        CHECK (automation_status IN ('manual','automated','partial','to_automate'));
                END IF;
                -- sync_status check
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
```

- [ ] **Step 2: Verify the migration runs without errors**

Run: `cd apps/api && npm run dev` (start the API and check console output for "Database migrations completed successfully")

Expected: No errors, migration completes successfully.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/config/db.js
git commit -m "feat: add test_case enhanced columns, history table, and summary view"
```

---

## Task 2: API — Rewrite `testCases.js` with Enhanced CRUD

**Files:**
- Modify: `apps/api/src/routes/testCases.js` — full rewrite with enhanced schemas and all CRUD endpoints

- [ ] **Step 1: Rewrite the entire testCases.js route file**

Replace the full contents of `apps/api/src/routes/testCases.js` with:

```javascript
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const pool = db.pool;
const { z } = require('zod');
const { requireAuth, requirePermission } = require('../middleware/authMiddleware');
const { emitToTuleap: emitTestCase } = require('../services/emitters/test_case');
const { defaultClient } = require('../services/tuleapClient');
const { defaultRegistry } = require('../services/tuleapFieldRegistry');

const testCaseCreateSchema = z.object({
    title: z.string().min(3).max(500),
    description: z.string().max(5000).optional(),
    preconditions: z.string().max(3000).optional(),
    test_steps: z.string().max(10000).optional(),
    expected_result: z.string().max(5000).optional(),
    priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
    severity: z.enum(['critical', 'major', 'normal', 'minor', 'trivial']).default('normal'),
    test_type: z.enum(['functional', 'regression', 'smoke', 'integration', 'performance', 'security', 'usability', 'exploratory', 'automated']).default('functional'),
    category: z.string().max(50).default('other'),
    component: z.string().max(100).optional(),
    automation_status: z.enum(['manual', 'automated', 'partial', 'to_automate']).default('manual'),
    status: z.enum(['draft', 'active', 'deprecated', 'archived']).default('draft'),
    estimated_duration_minutes: z.number().int().min(0).max(480).optional(),
    tags: z.array(z.string().max(50)).max(20).default([]),
    project_id: z.string().uuid(),
    assigned_to: z.string().uuid().optional(),
    linked_requirement_id: z.string().max(100).optional(),
    linked_bug_ids: z.array(z.string().uuid()).default([]),
});

const testCaseUpdateSchema = testCaseCreateSchema.partial().omit({ project_id: true });

async function logTestCaseHistory(client, { test_case_id, action, changed_fields, before_state, after_state, change_summary, user_id, user_email }) {
    await client.query(
        `INSERT INTO test_case_history (test_case_id, action, changed_fields, before_state, after_state, change_summary, performed_by, performed_by_email)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [test_case_id, action, changed_fields || null, before_state ? JSON.stringify(before_state) : null, after_state ? JSON.stringify(after_state) : null, change_summary || null, user_id || null, user_email || null]
    );
}

// GET /test-cases — List with server-side filtering, search, pagination
router.get('/', requireAuth, requirePermission('page:test-cases'), async (req, res, next) => {
    try {
        const {
            page = 1,
            limit = 25,
            search,
            project_id,
            status,
            priority,
            test_type,
            automation_status,
            assigned_to,
            sync_status,
            sort_by = 'created_at',
            sort_order = 'desc',
        } = req.query;

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const offset = (pageNum - 1) * limitNum;

        const allowedSortColumns = ['created_at', 'updated_at', 'title', 'priority', 'test_case_id'];
        const safeSortBy = allowedSortColumns.includes(sort_by) ? sort_by : 'created_at';
        const safeSortOrder = sort_order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        let query = `SELECT * FROM v_test_case_summary WHERE 1=1`;
        const params = [];
        let pn = 1;

        if (project_id) { query += ` AND project_id = $${pn++}`; params.push(project_id); }
        if (status) { query += ` AND status = $${pn++}`; params.push(status); }
        if (priority) { query += ` AND priority = $${pn++}`; params.push(priority); }
        if (test_type) { query += ` AND test_type = $${pn++}`; params.push(test_type); }
        if (automation_status) { query += ` AND automation_status = $${pn++}`; params.push(automation_status); }
        if (assigned_to) { query += ` AND assigned_to = $${pn++}`; params.push(assigned_to); }
        if (sync_status) { query += ` AND sync_status = $${pn++}`; params.push(sync_status); }

        if (search) {
            query += ` AND (title ILIKE $${pn} OR description ILIKE $${pn} OR test_case_id ILIKE $${pn})`;
            params.push(`%${search}%`);
            pn++;
        }

        const countQuery = `SELECT COUNT(*) as total FROM (${query}) sub`;
        const countResult = await pool.query(countQuery, params);
        const total = parseInt(countResult.rows[0].total);

        query += ` ORDER BY ${safeSortBy} ${safeSortOrder}`;
        query += ` LIMIT $${pn++} OFFSET $${pn++}`;
        params.push(limitNum, offset);

        const result = await pool.query(query, params);

        res.json({
            data: result.rows,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                total_pages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        next(error);
    }
});

// GET /test-cases/:id — Single test case with execution history + activity
router.get('/:id', requireAuth, requirePermission('page:test-cases'), async (req, res, next) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `SELECT * FROM v_test_case_summary WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Test case not found' });
        }

        const executionsResult = await pool.query(
            `SELECT
                te.id,
                te.status,
                te.notes,
                te.executed_at,
                te.duration_seconds,
                te.defect_ids,
                tr.run_id,
                tr.name AS test_run_name,
                u.name AS executed_by_name
            FROM test_execution te
            LEFT JOIN test_run tr ON te.test_run_id = tr.id
            LEFT JOIN app_user u ON te.executed_by = u.id
            WHERE te.test_case_id = $1
            ORDER BY te.executed_at DESC
            LIMIT 50`,
            [id]
        );

        const historyResult = await pool.query(
            `SELECT action, changed_fields, change_summary, performed_by_email, performed_at
             FROM test_case_history
             WHERE test_case_id = $1
             ORDER BY performed_at DESC
             LIMIT 20`,
            [id]
        );

        res.json({
            ...result.rows[0],
            execution_history: executionsResult.rows,
            activity: historyResult.rows,
        });
    } catch (error) {
        next(error);
    }
});

// POST /test-cases — Create test case
router.post('/', requireAuth, requirePermission('action:test-cases:create'), async (req, res, next) => {
    const client = await pool.connect();
    try {
        const validatedData = testCaseCreateSchema.parse(req.body);

        await client.query('BEGIN');

        const idResult = await client.query(
            `SELECT COALESCE(MAX(CAST(SUBSTRING(test_case_id FROM 4) AS INTEGER)), 0) + 1 AS next_id
             FROM test_case
             WHERE test_case_id ~ '^TC-[0-9]+$'`
        );
        const nextId = idResult.rows[0].next_id;
        const testCaseId = `TC-${String(nextId).padStart(5, '0')}`;

        const result = await client.query(
            `INSERT INTO test_case (
                test_case_id, title, description, preconditions, test_steps, expected_result,
                priority, severity, test_type, category, component, automation_status, status,
                estimated_duration_minutes, tags, project_id, assigned_to,
                linked_requirement_id, linked_bug_ids, created_by, updated_by, sync_status
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'not_synced')
            RETURNING *`,
            [
                testCaseId,
                validatedData.title,
                validatedData.description || null,
                validatedData.preconditions || null,
                validatedData.test_steps || null,
                validatedData.expected_result || null,
                validatedData.priority,
                validatedData.severity,
                validatedData.test_type,
                validatedData.category,
                validatedData.component || null,
                validatedData.automation_status,
                validatedData.status,
                validatedData.estimated_duration_minutes || null,
                validatedData.tags,
                validatedData.project_id,
                validatedData.assigned_to || null,
                validatedData.linked_requirement_id || null,
                validatedData.linked_bug_ids,
                req.user?.id || null,
                req.user?.id || null,
            ]
        );

        await logTestCaseHistory(client, {
            test_case_id: result.rows[0].id,
            action: 'created',
            after_state: result.rows[0],
            change_summary: `Test case ${testCaseId} created`,
            user_id: req.user?.id,
            user_email: req.user?.email,
        });

        await client.query(
            `INSERT INTO audit_log (action, entity_type, entity_id, user_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            ['test_case_created', 'test_case', result.rows[0].id, req.user?.id || null, JSON.stringify({ test_case_id: testCaseId, title: validatedData.title })]
        );

        await client.query('COMMIT');

        const fullResult = await pool.query(`SELECT * FROM v_test_case_summary WHERE id = $1`, [result.rows[0].id]);
        res.status(201).json(fullResult.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Validation failed', details: error.errors });
        }
        next(error);
    } finally {
        client.release();
    }
});

// PATCH /test-cases/:id — Update test case
router.patch('/:id', requireAuth, requirePermission('action:test-cases:edit'), async (req, res, next) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const validatedData = testCaseUpdateSchema.parse(req.body);

        await client.query('BEGIN');

        const existingResult = await client.query(
            'SELECT * FROM test_case WHERE id = $1 AND deleted_at IS NULL',
            [id]
        );

        if (existingResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Test case not found' });
        }

        const existing = existingResult.rows[0];

        const updatableFields = [
            'title', 'description', 'preconditions', 'test_steps', 'expected_result',
            'priority', 'severity', 'test_type', 'category', 'component',
            'automation_status', 'status', 'estimated_duration_minutes', 'tags',
            'assigned_to', 'linked_requirement_id', 'linked_bug_ids',
        ];

        const updates = [];
        const params = [];
        let pn = 1;
        const changedFields = [];

        for (const field of updatableFields) {
            if (validatedData[field] !== undefined) {
                const oldValue = existing[field];
                const newValue = validatedData[field];
                if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
                    updates.push(`${field} = $${pn++}`);
                    params.push(newValue);
                    changedFields.push(field);
                }
            }
        }

        if (updates.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'No fields to update' });
        }

        updates.push(`updated_by = $${pn++}`);
        params.push(req.user?.id || null);
        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        params.push(id);

        const query = `UPDATE test_case SET ${updates.join(', ')} WHERE id = $${pn} RETURNING *`;
        const result = await client.query(query, params);

        await logTestCaseHistory(client, {
            test_case_id: id,
            action: 'updated',
            changed_fields: changedFields,
            before_state: existing,
            after_state: result.rows[0],
            change_summary: `Updated: ${changedFields.join(', ')}`,
            user_id: req.user?.id,
            user_email: req.user?.email,
        });

        await client.query(
            `INSERT INTO audit_log (action, entity_type, entity_id, user_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            ['test_case_updated', 'test_case', id, req.user?.id || null, JSON.stringify({ changed_fields: changedFields })]
        );

        await client.query('COMMIT');

        const fullResult = await pool.query(`SELECT * FROM v_test_case_summary WHERE id = $1`, [id]);
        res.json(fullResult.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Validation failed', details: error.errors });
        }
        next(error);
    } finally {
        client.release();
    }
});

// DELETE /test-cases/:id — Soft delete
router.delete('/:id', requireAuth, requirePermission('action:test-cases:delete'), async (req, res, next) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;

        await client.query('BEGIN');

        const existingResult = await client.query(
            'SELECT * FROM test_case WHERE id = $1 AND deleted_at IS NULL',
            [id]
        );

        if (existingResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Test case not found' });
        }

        const existing = existingResult.rows[0];

        const result = await client.query(
            `UPDATE test_case SET deleted_at = CURRENT_TIMESTAMP, deleted_by = $1, status = 'archived'
             WHERE id = $2 AND deleted_at IS NULL RETURNING *`,
            [req.user?.id || null, id]
        );

        await logTestCaseHistory(client, {
            test_case_id: id,
            action: 'deleted',
            before_state: existing,
            change_summary: `Test case ${existing.test_case_id} deleted`,
            user_id: req.user?.id,
            user_email: req.user?.email,
        });

        await client.query(
            `INSERT INTO audit_log (action, entity_type, entity_id, user_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            ['test_case_deleted', 'test_case', id, req.user?.id || null, JSON.stringify({ test_case_id: existing.test_case_id })]
        );

        await client.query('COMMIT');
        res.status(204).send();
    } catch (error) {
        await client.query('ROLLBACK');
        next(error);
    } finally {
        client.release();
    }
});

// POST /test-cases/bulk-import — Bulk import
router.post('/bulk-import', requireAuth, requirePermission('action:test-cases:create'), async (req, res, next) => {
    const client = await pool.connect();
    try {
        const { test_cases, project_id } = req.body;

        if (!Array.isArray(test_cases) || test_cases.length === 0) {
            return res.status(400).json({ error: 'test_cases array is required' });
        }
        if (!project_id) {
            return res.status(400).json({ error: 'project_id is required' });
        }

        await client.query('BEGIN');

        const results = { success: [], errors: [], duplicates: [] };

        for (let i = 0; i < test_cases.length; i++) {
            const testCase = test_cases[i];
            try {
                const validatedData = testCaseCreateSchema.parse({ ...testCase, project_id });

                const duplicateCheck = await client.query(
                    `SELECT id, test_case_id FROM test_case WHERE project_id = $1 AND title = $2 AND deleted_at IS NULL`,
                    [project_id, validatedData.title]
                );

                if (duplicateCheck.rows.length > 0) {
                    results.duplicates.push({ row: i + 1, title: validatedData.title, existing_id: duplicateCheck.rows[0].test_case_id });
                    continue;
                }

                const idResult = await client.query(
                    `SELECT COALESCE(MAX(CAST(SUBSTRING(test_case_id FROM 4) AS INTEGER)), 0) + 1 AS next_id FROM test_case WHERE test_case_id ~ '^TC-[0-9]+$'`
                );
                const testCaseId = `TC-${String(idResult.rows[0].next_id).padStart(5, '0')}`;

                const result = await client.query(
                    `INSERT INTO test_case (test_case_id, title, description, preconditions, test_steps, expected_result, priority, severity, test_type, category, component, automation_status, status, tags, project_id, created_by, updated_by)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
                     RETURNING id, test_case_id, title`,
                    [testCaseId, validatedData.title, validatedData.description || null, validatedData.preconditions || null, validatedData.test_steps || null, validatedData.expected_result || null, validatedData.priority, validatedData.severity, validatedData.test_type, validatedData.category, validatedData.component || null, validatedData.automation_status, validatedData.status, validatedData.tags, project_id, req.user?.id || null, req.user?.id || null]
                );

                results.success.push({ row: i + 1, id: result.rows[0].id, test_case_id: result.rows[0].test_case_id, title: result.rows[0].title });
            } catch (error) {
                results.errors.push({ row: i + 1, title: testCase.title || 'N/A', error: error.message });
            }
        }

        await client.query(
            `INSERT INTO audit_log (action, entity_type, entity_id, user_id, details) VALUES ($1, $2, $3, $4, $5)`,
            ['test_case_bulk_import', 'test_case', null, req.user?.id || null, JSON.stringify({ total: test_cases.length, success: results.success.length, errors: results.errors.length, duplicates: results.duplicates.length, project_id })]
        );

        await client.query('COMMIT');
        res.json({ summary: { total: test_cases.length, imported: results.success.length, duplicates: results.duplicates.length, errors: results.errors.length }, details: results });
    } catch (error) {
        await client.query('ROLLBACK');
        next(error);
    } finally {
        client.release();
    }
});

module.exports = router;
```

- [ ] **Step 2: Verify the API starts without errors**

Run: `cd apps/api && npm run dev`
Expected: Server starts, routes registered, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/testCases.js
git commit -m "feat: rewrite test cases API with enhanced CRUD, history, and filtering"
```

---

## Task 3: Frontend — Update TypeScript Types

**Files:**
- Modify: `apps/web/src/types/index.ts`

- [ ] **Step 1: Replace the TestCase interface and related types with enhanced versions**

In `apps/web/src/types/index.ts`, replace the existing `TestCategory`, `TestCaseStatus`, and `TestCase` types (lines 246–269) with:

```typescript
// Test Case Management Types (enhanced)
export type TestCategory = string;
export type TestCaseStatus = 'draft' | 'active' | 'deprecated' | 'archived';
export type TestCasePriority = 'critical' | 'high' | 'medium' | 'low';
export type TestCaseSeverity = 'critical' | 'major' | 'normal' | 'minor' | 'trivial';
export type TestCaseType = 'functional' | 'regression' | 'smoke' | 'integration' | 'performance' | 'security' | 'usability' | 'exploratory' | 'automated';
export type AutomationStatus = 'manual' | 'automated' | 'partial' | 'to_automate';
export type SyncStatus = 'synced' | 'pending' | 'conflict' | 'error' | 'not_synced';

export interface TestCase {
    id: string;
    test_case_id: string;
    title: string;
    description?: string;
    preconditions?: string;
    test_steps?: string;
    expected_result?: string;
    priority: TestCasePriority;
    severity?: TestCaseSeverity;
    test_type?: TestCaseType;
    category?: TestCategory;
    component?: string;
    automation_status?: AutomationStatus;
    status: TestCaseStatus;
    estimated_duration_minutes?: number;
    tags?: string[];
    project_id?: string;
    project_name?: string;
    assigned_to?: string;
    assigned_to_name?: string;
    created_by?: string;
    created_by_name?: string;
    updated_by?: string;
    updated_by_name?: string;
    created_at: string;
    updated_at: string;
    deleted_at?: string;
    tuleap_artifact_id?: number;
    tuleap_url?: string;
    sync_status?: SyncStatus;
    last_tuleap_sync?: string;
    latest_execution_status?: string;
    latest_execution_date?: string;
    latest_test_run?: string;
    days_since_last_run?: number;
    execution_count?: number;
    execution_history?: TestCaseExecution[];
    activity?: TestCaseActivityEntry[];
}

export interface TestCaseExecution {
    id: string;
    status: string;
    notes?: string;
    executed_at?: string;
    duration_seconds?: number;
    defect_ids?: string[];
    run_id?: string;
    test_run_name?: string;
    executed_by_name?: string;
}

export interface TestCaseActivityEntry {
    action: string;
    changed_fields?: string[];
    change_summary?: string;
    performed_by_email?: string;
    performed_at: string;
}

export interface TestCaseListResponse {
    data: TestCase[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        total_pages: number;
    };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/types/index.ts
git commit -m "feat: add enhanced TestCase types matching new API schema"
```

---

## Task 4: Frontend — Update API Client

**Files:**
- Modify: `apps/web/src/lib/api.ts`

- [ ] **Step 1: Update the testCasesApi client with enhanced list params and typed responses**

In `apps/web/src/lib/api.ts`, replace the existing `testCasesApi` object (approximately lines 462–484) with:

```typescript
export const testCasesApi = {
    list: (params?: {
        page?: number;
        limit?: number;
        search?: string;
        project_id?: string;
        status?: string;
        priority?: string;
        test_type?: string;
        automation_status?: string;
        assigned_to?: string;
        sync_status?: string;
        sort_by?: string;
        sort_order?: string;
    }) => {
        const cleanParams: Record<string, string> = {};
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== '') {
                    cleanParams[key] = String(value);
                }
            });
        }
        const query = new URLSearchParams(cleanParams).toString();
        return fetchApi<TestCaseListResponse>(`/test-cases${query ? `?${query}` : ''}`);
    },

    get: (id: string) => fetchApi<TestCase>(`/test-cases/${id}`),

    create: (data: Partial<TestCase> & { title: string; project_id: string }) =>
        fetchApi<TestCase>('/test-cases', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    update: (id: string, data: Partial<TestCase>) =>
        fetchApi<TestCase>(`/test-cases/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        }),

    delete: (id: string) =>
        fetchApi<void>(`/test-cases/${id}`, { method: 'DELETE' }),

    bulkImport: (data: { test_cases: any[]; project_id: string }) =>
        fetchApi('/test-cases/bulk-import', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
};
```

Also add the import for `TestCaseListResponse` at the top of the file if needed. The `TestCase` type import should already be there or can be added to the existing imports from `@/types`.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat: enhance testCasesApi with typed params and pagination"
```

---

## Task 5: Frontend — Add Test Cases to Sidebar Navigation

**Files:**
- Modify: `apps/web/src/config/routes.ts`

- [ ] **Step 1: Update the test-cases route entry to show in navbar**

In `apps/web/src/config/routes.ts`, import `FlaskConical` (already imported) or add `Layers` import for the icon. Actually, `FlaskConical` is already imported. We'll use `FlaskConical` for test cases and keep the existing icon for test runs.

Update the test-cases route entry (line 53) from:
```typescript
{ path: '/test-cases', label: 'Test Cases', permission: 'page:test-executions', requiresActivation: true },
```
to:
```typescript
{ path: '/test-cases', label: 'Test Cases', permission: 'page:test-cases', requiresActivation: true, showInNavbar: true, navOrder: 7.5, icon: FlaskConical },
```

Also update the permission for the sub-routes (lines 54-56) to use `page:test-cases`:
```typescript
{ path: '/test-cases/create', label: 'Create Test Case', permission: 'page:test-cases', requiresActivation: true },
{ path: '/test-cases/[id]', label: 'Test Case Details', permission: 'page:test-cases', requiresActivation: true },
{ path: '/test-cases/[id]/edit', label: 'Edit Test Case', permission: 'page:test-cases', requiresActivation: true },
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/config/routes.ts
git commit -m "feat: add test cases to sidebar navigation"
```

---

## Task 6: Frontend — Rewrite Test Cases List Page

**Files:**
- Modify: `apps/web/app/test-cases/page.tsx`

- [ ] **Step 1: Rewrite the list page with server-side filtering and pagination**

Replace the full contents of `apps/web/app/test-cases/page.tsx` with:

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { TestCase, TestCaseStatus, TestCasePriority, TestCaseType, AutomationStatus, SyncStatus, TestCaseListResponse } from '@/types';
import { testCasesApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { formatDistanceToNow } from 'date-fns';

const PRIORITY_OPTIONS: { value: string; label: string }[] = [
    { value: '', label: 'All Priorities' },
    { value: 'critical', label: 'Critical' },
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
    { value: '', label: 'All Statuses' },
    { value: 'draft', label: 'Draft' },
    { value: 'active', label: 'Active' },
    { value: 'deprecated', label: 'Deprecated' },
    { value: 'archived', label: 'Archived' },
];

const TYPE_OPTIONS: { value: string; label: string }[] = [
    { value: '', label: 'All Types' },
    { value: 'functional', label: 'Functional' },
    { value: 'regression', label: 'Regression' },
    { value: 'smoke', label: 'Smoke' },
    { value: 'integration', label: 'Integration' },
    { value: 'performance', label: 'Performance' },
    { value: 'security', label: 'Security' },
    { value: 'usability', label: 'Usability' },
    { value: 'exploratory', label: 'Exploratory' },
    { value: 'automated', label: 'Automated' },
];

const AUTOMATION_OPTIONS: { value: string; label: string }[] = [
    { value: '', label: 'All' },
    { value: 'manual', label: 'Manual' },
    { value: 'automated', label: 'Automated' },
    { value: 'partial', label: 'Partial' },
    { value: 'to_automate', label: 'To Automate' },
];

const SYNC_OPTIONS: { value: string; label: string }[] = [
    { value: '', label: 'All' },
    { value: 'synced', label: 'Synced' },
    { value: 'pending', label: 'Pending' },
    { value: 'conflict', label: 'Conflict' },
    { value: 'error', label: 'Error' },
    { value: 'not_synced', label: 'Not Synced' },
];

function getPriorityBadgeVariant(priority: string): 'danger' | 'warning' | 'default' | 'success' {
    const map: Record<string, 'danger' | 'warning' | 'default' | 'success'> = {
        critical: 'danger', high: 'warning', medium: 'default', low: 'success',
    };
    return map[priority] || 'default';
}

function getStatusBadgeVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
    const map: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
        active: 'success', draft: 'warning', deprecated: 'danger', archived: 'default',
    };
    return map[status] || 'default';
}

function getSyncBadgeVariant(sync: string): 'success' | 'warning' | 'danger' | 'default' | 'info' {
    const map: Record<string, 'success' | 'warning' | 'danger' | 'default' | 'info'> = {
        synced: 'success', pending: 'warning', conflict: 'danger', error: 'danger', not_synced: 'default',
    };
    return map[sync] || 'default';
}

export default function TestCasesPage() {
    const [testCases, setTestCases] = useState<TestCase[]>([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, total_pages: 0 });

    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const [priority, setPriority] = useState('');
    const [testType, setTestType] = useState('');
    const [automationStatus, setAutomationStatus] = useState('');
    const [syncStatus, setSyncStatus] = useState('');
    const [sortBy, setSortBy] = useState('created_at');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    const loadTestCases = useCallback(async (page = 1) => {
        try {
            setLoading(true);
            const response = await testCasesApi.list({
                page,
                limit: 25,
                search: search || undefined,
                status: status || undefined,
                priority: priority || undefined,
                test_type: testType || undefined,
                automation_status: automationStatus || undefined,
                sync_status: syncStatus || undefined,
                sort_by: sortBy,
                sort_order: sortOrder,
            });
            if (response && typeof response === 'object' && 'data' in response) {
                setTestCases((response as TestCaseListResponse).data);
                setPagination((response as TestCaseListResponse).pagination);
            }
        } catch (error) {
            console.error('Failed to load test cases:', error);
        } finally {
            setLoading(false);
        }
    }, [search, status, priority, testType, automationStatus, syncStatus, sortBy, sortOrder]);

    useEffect(() => {
        loadTestCases(1);
    }, [loadTestCases]);

    const clearFilters = () => {
        setSearch('');
        setStatus('');
        setPriority('');
        setTestType('');
        setAutomationStatus('');
        setSyncStatus('');
    };

    const hasActiveFilters = status || priority || testType || automationStatus || syncStatus || search;

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Test Cases</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Manage your test case registry</p>
                </div>
                <div className="flex gap-3">
                    <Link href="/test-cases/create">
                        <Button>+ New Test Case</Button>
                    </Link>
                </div>
            </div>

            <div className="mb-6 space-y-4">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && loadTestCases(1)}
                        placeholder="Search by ID, title, or description..."
                        className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <Button onClick={() => loadTestCases(1)}>Search</Button>
                </div>

                <div className="flex flex-wrap gap-3 items-center">
                    <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-slate-900 dark:text-white text-sm">
                        {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <select value={priority} onChange={(e) => setPriority(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-slate-900 dark:text-white text-sm">
                        {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <select value={testType} onChange={(e) => setTestType(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-slate-900 dark:text-white text-sm">
                        {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <select value={automationStatus} onChange={(e) => setAutomationStatus(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-slate-900 dark:text-white text-sm">
                        {AUTOMATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <select value={syncStatus} onChange={(e) => setSyncStatus(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-slate-900 dark:text-white text-sm">
                        {SYNC_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {hasActiveFilters && (
                        <Button variant="ghost" size="sm" onClick={clearFilters}>Clear All</Button>
                    )}
                    <span className="ml-auto text-sm text-gray-600 dark:text-gray-400">
                        {pagination.total} test case{pagination.total !== 1 ? 's' : ''}
                    </span>
                </div>
            </div>

            {loading && testCases.length === 0 ? (
                <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>
            ) : testCases.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
                    <p className="text-gray-600 dark:text-gray-400 mb-4">No test cases found. Create your first test case to get started.</p>
                    <Link href="/test-cases/create"><Button>Create Test Case</Button></Link>
                </div>
            ) : (
                <>
                    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">ID</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Title</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Type</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Priority</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Automation</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Last Result</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Sync</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Last Run</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {testCases.map((tc) => (
                                        <tr key={tc.id} className="hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <Link href={`/test-cases/${tc.id}`} className="text-blue-600 dark:text-blue-400 hover:underline font-mono text-sm">
                                                    {tc.test_case_id}
                                                </Link>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="text-sm font-medium text-slate-900 dark:text-white max-w-xs truncate">{tc.title}</div>
                                                {tc.project_name && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{tc.project_name}</div>}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700 dark:text-slate-300 capitalize">{tc.test_type || '—'}</td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <Badge variant={getPriorityBadgeVariant(tc.priority)}>{tc.priority}</Badge>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <Badge variant={getStatusBadgeVariant(tc.status)}>{tc.status}</Badge>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700 dark:text-slate-300 capitalize">{tc.automation_status?.replace('_', ' ') || 'manual'}</td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                {tc.latest_execution_status ? (
                                                    <Badge variant={tc.latest_execution_status === 'passed' ? 'success' : tc.latest_execution_status === 'failed' ? 'danger' : 'default'}>
                                                        {tc.latest_execution_status}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-xs text-gray-400">Never Run</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                {tc.sync_status && tc.sync_status !== 'not_synced' ? (
                                                    <Badge variant={getSyncBadgeVariant(tc.sync_status)}>{tc.sync_status}</Badge>
                                                ) : (
                                                    <span className="text-xs text-gray-400">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
                                                {tc.latest_execution_date ? formatDistanceToNow(new Date(tc.latest_execution_date), { addSuffix: true }) : 'Never'}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm">
                                                <Link href={`/test-cases/${tc.id}/edit`} className="text-blue-600 dark:text-blue-400 hover:underline mr-3">Edit</Link>
                                                <Link href={`/test-cases/${tc.id}`} className="text-gray-600 dark:text-gray-400 hover:underline">View</Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {pagination.total_pages > 1 && (
                        <div className="flex items-center justify-between mt-4">
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                                Showing {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                            </span>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => loadTestCases(pagination.page - 1)}>Previous</Button>
                                <Button variant="outline" size="sm" disabled={pagination.page >= pagination.total_pages} onClick={() => loadTestCases(pagination.page + 1)}>Next</Button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/test-cases/page.tsx
git commit -m "feat: rewrite test cases list with server-side filtering and pagination"
```

---

## Task 7: Frontend — Rewrite TestCaseForm to Use Local API

**Files:**
- Modify: `apps/web/src/components/test-cases/TestCaseForm.tsx`

- [ ] **Step 1: Rewrite the form to submit via local API with all PRD fields**

Replace the full contents of `apps/web/src/components/test-cases/TestCaseForm.tsx` with:

```tsx
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { FormSection } from '@/components/ui/FormSection';
import { testCasesApi } from '@/lib/api';

const testCaseSchema = z.object({
    title: z.string().min(3, 'Title must be at least 3 characters').max(500),
    description: z.string().max(5000).optional().default(''),
    preconditions: z.string().max(3000).optional().default(''),
    test_steps: z.string().max(10000).optional().default(''),
    expected_result: z.string().max(5000).optional().default(''),
    priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
    severity: z.enum(['critical', 'major', 'normal', 'minor', 'trivial']).default('normal'),
    test_type: z.enum(['functional', 'regression', 'smoke', 'integration', 'performance', 'security', 'usability', 'exploratory', 'automated']).default('functional'),
    category: z.string().max(50).optional().default(''),
    component: z.string().max(100).optional().default(''),
    automation_status: z.enum(['manual', 'automated', 'partial', 'to_automate']).default('manual'),
    status: z.enum(['draft', 'active', 'deprecated', 'archived']).default('draft'),
    estimated_duration_minutes: z.coerce.number().int().min(0).max(480).optional().nullable(),
    tags: z.string().optional().default(''),
    assigned_to: z.string().optional().default(''),
    linked_requirement_id: z.string().max(100).optional().default(''),
});

type FormData = z.infer<typeof testCaseSchema>;

interface TestCaseFormProps {
    initialData?: Record<string, unknown>;
    isEdit?: boolean;
    testCaseId?: string;
    projectId?: string;
}

export function TestCaseForm({ initialData, isEdit, testCaseId, projectId }: TestCaseFormProps) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(testCaseSchema) as any,
        defaultValues: {
            title: (initialData?.title as string) || '',
            description: (initialData?.description as string) || '',
            preconditions: (initialData?.preconditions as string) || '',
            test_steps: (initialData?.test_steps as string) || '',
            expected_result: (initialData?.expected_result as string) || '',
            priority: ((initialData?.priority as string) || 'medium') as FormData['priority'],
            severity: ((initialData?.severity as string) || 'normal') as FormData['severity'],
            test_type: ((initialData?.test_type as string) || 'functional') as FormData['test_type'],
            category: (initialData?.category as string) || '',
            component: (initialData?.component as string) || '',
            automation_status: ((initialData?.automation_status as string) || 'manual') as FormData['automation_status'],
            status: ((initialData?.status as string) || 'draft') as FormData['status'],
            estimated_duration_minutes: initialData?.estimated_duration_minutes != null ? Number(initialData.estimated_duration_minutes) : null,
            tags: Array.isArray(initialData?.tags) ? (initialData.tags as string[]).join(', ') : (initialData?.tags as string) || '',
            assigned_to: (initialData?.assigned_to as string) || '',
            linked_requirement_id: (initialData?.linked_requirement_id as string) || '',
        },
    });

    const onSubmit = async (data: FormData) => {
        setIsSubmitting(true);
        setError(null);
        try {
            const payload: Record<string, unknown> = {
                title: data.title,
                description: data.description || undefined,
                preconditions: data.preconditions || undefined,
                test_steps: data.test_steps || undefined,
                expected_result: data.expected_result || undefined,
                priority: data.priority,
                severity: data.severity,
                test_type: data.test_type,
                category: data.category || 'other',
                component: data.component || undefined,
                automation_status: data.automation_status,
                status: data.status,
                estimated_duration_minutes: data.estimated_duration_minutes || undefined,
                tags: data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
                assigned_to: data.assigned_to || undefined,
                linked_requirement_id: data.linked_requirement_id || undefined,
            };

            if (!isEdit && projectId) {
                (payload as any).project_id = projectId;
            }

            if (isEdit && testCaseId) {
                await testCasesApi.update(testCaseId, payload);
                router.push(`/test-cases/${testCaseId}`);
            } else {
                await testCasesApi.create(payload as any);
                router.push('/test-cases');
            }
            router.refresh();
        } catch (err: any) {
            setError(err.message || 'Failed to save test case');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit) as any} className="space-y-6 max-w-3xl mx-auto">
            <ErrorBanner message={error} />

            <FormSection title="General">
                <div className="md:col-span-2">
                    <Input
                        label="Title"
                        {...register('title')}
                        error={errors.title?.message}
                        placeholder="Enter test case title"
                        className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                    />
                </div>
                <Select
                    label="Status"
                    options={[
                        { value: 'draft', label: 'Draft' },
                        { value: 'active', label: 'Active' },
                        { value: 'deprecated', label: 'Deprecated' },
                        { value: 'archived', label: 'Archived' },
                    ]}
                    {...register('status')}
                    error={errors.status?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Select
                    label="Priority"
                    options={[
                        { value: 'critical', label: 'Critical' },
                        { value: 'high', label: 'High' },
                        { value: 'medium', label: 'Medium' },
                        { value: 'low', label: 'Low' },
                    ]}
                    {...register('priority')}
                    error={errors.priority?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Select
                    label="Severity"
                    options={[
                        { value: 'critical', label: 'Critical' },
                        { value: 'major', label: 'Major' },
                        { value: 'normal', label: 'Normal' },
                        { value: 'minor', label: 'Minor' },
                        { value: 'trivial', label: 'Trivial' },
                    ]}
                    {...register('severity')}
                    error={errors.severity?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Select
                    label="Test Type"
                    options={[
                        { value: 'functional', label: 'Functional' },
                        { value: 'regression', label: 'Regression' },
                        { value: 'smoke', label: 'Smoke' },
                        { value: 'integration', label: 'Integration' },
                        { value: 'performance', label: 'Performance' },
                        { value: 'security', label: 'Security' },
                        { value: 'usability', label: 'Usability' },
                        { value: 'exploratory', label: 'Exploratory' },
                        { value: 'automated', label: 'Automated' },
                    ]}
                    {...register('test_type')}
                    error={errors.test_type?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Select
                    label="Automation Status"
                    options={[
                        { value: 'manual', label: 'Manual' },
                        { value: 'automated', label: 'Automated' },
                        { value: 'partial', label: 'Partial' },
                        { value: 'to_automate', label: 'To Automate' },
                    ]}
                    {...register('automation_status')}
                    error={errors.automation_status?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Category"
                    {...register('category')}
                    placeholder="e.g. Authentication"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Component"
                    {...register('component')}
                    placeholder="e.g. Login Module"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Assigned To (User ID)"
                    {...register('assigned_to')}
                    placeholder="UUID"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Est. Duration (minutes)"
                    type="number"
                    {...register('estimated_duration_minutes')}
                    placeholder="5"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Linked Requirement"
                    {...register('linked_requirement_id')}
                    placeholder="REQ-001"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Tags (comma-separated)"
                    {...register('tags')}
                    placeholder="smoke, login, p1"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
            </FormSection>

            <FormSection title="Description & Details">
                <div className="md:col-span-2">
                    <Textarea
                        label="Description"
                        {...register('description')}
                        placeholder="Describe the test case purpose..."
                    />
                </div>
                <div className="md:col-span-2">
                    <Textarea
                        label="Preconditions"
                        {...register('preconditions')}
                        placeholder="Prerequisites for this test..."
                    />
                </div>
            </FormSection>

            <FormSection title="Test Definition">
                <div className="md:col-span-2">
                    <Textarea
                        label="Test Steps"
                        {...register('test_steps')}
                        placeholder="1. Navigate to login page&#10;2. Enter valid email&#10;3. Click Login"
                    />
                </div>
                <div className="md:col-span-2">
                    <Textarea
                        label="Expected Result"
                        {...register('expected_result')}
                        placeholder="User is redirected to dashboard"
                    />
                </div>
            </FormSection>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <Button type="button" variant="outline" onClick={() => router.back()} className="w-24 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300">Cancel</Button>
                <Button type="submit" disabled={isSubmitting} className="w-40 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-500/30 border-none">
                    {isSubmitting ? <span className="animate-spin mr-2">...</span> : null}
                    {isEdit ? 'Save Changes' : 'Create Test Case'}
                </Button>
            </div>
        </form>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/test-cases/TestCaseForm.tsx
git commit -m "feat: rewrite TestCaseForm to submit via local API with all PRD fields"
```

---

## Task 8: Frontend — Rewrite Create Page

**Files:**
- Modify: `apps/web/app/test-cases/create/page.tsx`

- [ ] **Step 1: Update the create page to pass projectId**

Replace the full contents of `apps/web/app/test-cases/create/page.tsx` with:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { TestCaseForm } from '@/components/test-cases/TestCaseForm';
import { fetchApi } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { Project } from '@/types';

interface ProjectOption {
    id: string;
    project_name: string;
}

export default function CreateTestCasePage() {
    const [projects, setProjects] = useState<ProjectOption[]>([]);
    const [selectedProject, setSelectedProject] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchApi<{ data: Project[] }>('/projects?status=active&limit=100')
            .then((res) => {
                const data = Array.isArray(res) ? res : (res as any).data || [];
                setProjects(data.map((p: any) => ({ id: p.id, project_name: p.project_name || p.name })));
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Spinner size="lg" />
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto py-8 px-4">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Create Test Case</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">Define a new test case for your project.</p>

            <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Project *</label>
                <select
                    value={selectedProject}
                    onChange={(e) => setSelectedProject(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                >
                    <option value="">Select a project...</option>
                    {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.project_name}</option>
                    ))}
                </select>
            </div>

            {selectedProject ? (
                <TestCaseForm projectId={selectedProject} />
            ) : (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
                    <p className="text-gray-600 dark:text-gray-400">Please select a project to continue.</p>
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/test-cases/create/page.tsx
git commit -m "feat: update create test case page with project selector"
```

---

## Task 9: Frontend — Rewrite Detail Page

**Files:**
- Modify: `apps/web/app/test-cases/[id]/page.tsx`

- [ ] **Step 1: Rewrite detail page to use local API with full field display**

Replace the full contents of `apps/web/app/test-cases/[id]/page.tsx` with:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { TestCase, TestCaseExecution, TestCaseActivityEntry } from '@/types';
import { testCasesApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { formatDistanceToNow, format } from 'date-fns';

export default function TestCaseDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const [testCase, setTestCase] = useState<(TestCase & { execution_history?: TestCaseExecution[]; activity?: TestCaseActivityEntry[] }) | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        testCasesApi.get(id)
            .then((data) => setTestCase(data as any))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, [id]);

    const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete this test case? This action can be undone by an admin.')) return;
        try {
            await testCasesApi.delete(id);
            router.push('/test-cases');
            router.refresh();
        } catch (err: any) {
            setError(err.message);
        }
    };

    if (loading) {
        return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;
    }

    if (error) {
        return (
            <div className="max-w-3xl mx-auto py-8 px-4">
                <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 p-6 rounded-2xl">
                    <h2 className="text-lg font-semibold mb-2">Error Loading Test Case</h2>
                    <p>{error}</p>
                    <Link href="/test-cases"><Button variant="outline" className="mt-4">Back to Test Cases</Button></Link>
                </div>
            </div>
        );
    }

    if (!testCase) {
        return (
            <div className="max-w-3xl mx-auto py-8 px-4">
                <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl text-center border border-slate-200 dark:border-slate-800">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Test Case Not Found</h2>
                    <Link href="/test-cases"><Button variant="outline">Back to Test Cases</Button></Link>
                </div>
            </div>
        );
    }

    const getStatusBadgeVariant = (s: string): 'success' | 'warning' | 'danger' | 'default' => {
        const map: Record<string, 'success' | 'warning' | 'danger' | 'default'> = { active: 'success', draft: 'warning', deprecated: 'danger', archived: 'default' };
        return map[s] || 'default';
    };

    const getPriorityBadgeVariant = (p: string): 'danger' | 'warning' | 'default' | 'success' => {
        const map: Record<string, 'danger' | 'warning' | 'default' | 'success'> = { critical: 'danger', high: 'warning', medium: 'default', low: 'success' };
        return map[p] || 'default';
    };

    return (
        <div className="max-w-4xl mx-auto py-8 px-4">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <Link href="/test-cases"><Button variant="ghost" size="sm">Back</Button></Link>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{testCase.test_case_id}</h1>
                </div>
                <div className="flex gap-3">
                    <Link href={`/test-cases/${id}/edit`}><Button variant="outline">Edit</Button></Link>
                    <Button variant="destructive" onClick={handleDelete}>Delete</Button>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-6">
                <div>
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">{testCase.title}</h2>
                    <div className="flex flex-wrap gap-2">
                        <Badge variant={getStatusBadgeVariant(testCase.status)}>{testCase.status}</Badge>
                        <Badge variant={getPriorityBadgeVariant(testCase.priority)}>{testCase.priority}</Badge>
                        {testCase.severity && <Badge variant="info">{testCase.severity}</Badge>}
                        {testCase.automation_status && <Badge variant="default">{testCase.automation_status.replace('_', ' ')}</Badge>}
                        {testCase.test_type && <Badge variant="default">{testCase.test_type}</Badge>}
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    <div><span className="text-gray-500 dark:text-gray-400">Project</span><br /><span className="text-slate-900 dark:text-white">{testCase.project_name || '—'}</span></div>
                    <div><span className="text-gray-500 dark:text-gray-400">Category</span><br /><span className="text-slate-900 dark:text-white capitalize">{testCase.category || '—'}</span></div>
                    <div><span className="text-gray-500 dark:text-gray-400">Component</span><br /><span className="text-slate-900 dark:text-white">{testCase.component || '—'}</span></div>
                    <div><span className="text-gray-500 dark:text-gray-400">Assigned To</span><br /><span className="text-slate-900 dark:text-white">{testCase.assigned_to_name || 'Unassigned'}</span></div>
                    <div><span className="text-gray-500 dark:text-gray-400">Est. Duration</span><br /><span className="text-slate-900 dark:text-white">{testCase.estimated_duration_minutes ? `${testCase.estimated_duration_minutes} min` : '—'}</span></div>
                    <div><span className="text-gray-500 dark:text-gray-400">Linked Requirement</span><br /><span className="text-slate-900 dark:text-white">{testCase.linked_requirement_id || '—'}</span></div>
                    {testCase.tags && testCase.tags.length > 0 && (
                        <div className="col-span-2 md:col-span-3"><span className="text-gray-500 dark:text-gray-400">Tags</span><br /><div className="flex gap-1 mt-1">{testCase.tags.map(t => <Badge key={t} variant="default">{t}</Badge>)}</div></div>
                    )}
                    {testCase.tuleap_artifact_id && (
                        <div><span className="text-gray-500 dark:text-gray-400">Tuleap</span><br /><a href={testCase.tuleap_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Artifact #{testCase.tuleap_artifact_id}</a></div>
                    )}
                </div>

                {testCase.description && (
                    <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Description</h3>
                        <p className="text-sm text-slate-900 dark:text-white whitespace-pre-wrap">{testCase.description}</p>
                    </div>
                )}

                {testCase.preconditions && (
                    <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Preconditions</h3>
                        <p className="text-sm text-slate-900 dark:text-white whitespace-pre-wrap">{testCase.preconditions}</p>
                    </div>
                )}

                {testCase.test_steps && (
                    <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Test Steps</h3>
                        <p className="text-sm text-slate-900 dark:text-white whitespace-pre-wrap">{testCase.test_steps}</p>
                    </div>
                )}

                {testCase.expected_result && (
                    <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Expected Result</h3>
                        <p className="text-sm text-slate-900 dark:text-white whitespace-pre-wrap">{testCase.expected_result}</p>
                    </div>
                )}

                {testCase.sync_status && testCase.sync_status !== 'not_synced' && (
                    <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Sync Status</h3>
                        <div className="flex items-center gap-2">
                            <Badge variant={testCase.sync_status === 'synced' ? 'success' : testCase.sync_status === 'error' ? 'danger' : 'warning'}>{testCase.sync_status}</Badge>
                            {testCase.last_tuleap_sync && <span className="text-xs text-gray-500">Last synced {formatDistanceToNow(new Date(testCase.last_tuleap_sync), { addSuffix: true })}</span>}
                        </div>
                    </div>
                )}

                {testCase.execution_history && testCase.execution_history.length > 0 && (
                    <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Execution History</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                                        <th className="pb-2 pr-4">Date</th>
                                        <th className="pb-2 pr-4">Run</th>
                                        <th className="pb-2 pr-4">Status</th>
                                        <th className="pb-2">Tester</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {testCase.execution_history.map((ex) => (
                                        <tr key={ex.id}>
                                            <td className="py-2 pr-4 text-slate-900 dark:text-white">{ex.executed_at ? format(new Date(ex.executed_at), 'yyyy-MM-dd') : '—'}</td>
                                            <td className="py-2 pr-4 text-slate-900 dark:text-white">{ex.test_run_name || ex.run_id || '—'}</td>
                                            <td className="py-2 pr-4"><Badge variant={ex.status === 'passed' ? 'success' : ex.status === 'failed' ? 'danger' : 'default'}>{ex.status}</Badge></td>
                                            <td className="py-2 text-slate-900 dark:text-white">{ex.executed_by_name || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {testCase.activity && testCase.activity.length > 0 && (
                    <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Activity</h3>
                        <div className="space-y-2">
                            {testCase.activity.map((entry, i) => (
                                <div key={i} className="text-sm">
                                    <span className="text-gray-500 dark:text-gray-400">{formatDistanceToNow(new Date(entry.performed_at), { addSuffix: true })}</span>
                                    {' — '}
                                    <span className="text-slate-900 dark:text-white">{entry.change_summary || entry.action}</span>
                                    {entry.performed_by_email && <span className="text-gray-500"> by {entry.performed_by_email}</span>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/test-cases/[id]/page.tsx
git commit -m "feat: rewrite test case detail page using local API"
```

---

## Task 10: Frontend — Rewrite Edit Page

**Files:**
- Modify: `apps/web/app/test-cases/[id]/edit/page.tsx`

- [ ] **Step 1: Rewrite edit page to use local API**

Replace the full contents of `apps/web/app/test-cases/[id]/edit/page.tsx` with:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { TestCase } from '@/types';
import { testCasesApi } from '@/lib/api';
import { TestCaseForm } from '@/components/test-cases/TestCaseForm';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';

export default function EditTestCasePage() {
    const params = useParams();
    const id = params.id as string;

    const [testCase, setTestCase] = useState<TestCase | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        testCasesApi.get(id)
            .then((data) => setTestCase(data as any))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, [id]);

    if (loading) {
        return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;
    }

    if (error) {
        return (
            <div className="max-w-3xl mx-auto py-8 px-4">
                <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 p-6 rounded-2xl">
                    <h2 className="text-lg font-semibold mb-2">Error Loading Test Case</h2>
                    <p>{error}</p>
                    <Link href="/test-cases"><Button variant="outline" className="mt-4">Back to Test Cases</Button></Link>
                </div>
            </div>
        );
    }

    if (!testCase) {
        return (
            <div className="max-w-3xl mx-auto py-8 px-4">
                <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl text-center border border-slate-200 dark:border-slate-800">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Test Case Not Found</h2>
                    <Link href="/test-cases"><Button variant="outline">Back to Test Cases</Button></Link>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto py-8 px-4">
            <div className="flex items-center gap-4 mb-6">
                <Link href={`/test-cases/${id}`}><Button variant="ghost" size="sm">Cancel</Button></Link>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                    Edit Test Case <span className="text-gray-500 font-normal">{testCase.test_case_id}</span>
                </h1>
            </div>
            <TestCaseForm initialData={testCase as Record<string, unknown>} isEdit testCaseId={id} />
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/test-cases/[id]/edit/page.tsx
git commit -m "feat: rewrite test case edit page using local API"
```

---

## Task 11: Verify — Build and Test

**Files:** None (verification only)

- [ ] **Step 1: Verify the API starts and migrations run**

Run: `cd apps/api && npm run dev`
Expected: No errors, "Database migrations completed successfully"

- [ ] **Step 2: Verify the frontend builds**

Run: `cd apps/web && npm run build`
Expected: Build succeeds with no type errors

- [ ] **Step 3: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address build/verification issues from Sprint 1 implementation"
```

---

## Self-Review Checklist

1. **Spec coverage (Sprint 1 scope):**
   - TC-F01 (Create): Task 2 (API POST) + Task 7 (Form) + Task 8 (Create page)
   - TC-F02 (Edit): Task 2 (API PATCH) + Task 7 (Form) + Task 10 (Edit page)
   - TC-F03 (Delete): Task 2 (API DELETE)
   - TC-F04 (View detail): Task 2 (API GET /:id) + Task 9 (Detail page)
   - TC-F05 (List + filter + search + pagination): Task 2 (API GET with params) + Task 6 (List page)
   - TC-F06 (Bulk create): Task 2 (bulk-import endpoint) — already exists
   - Navigation: Task 5 (sidebar)
   - Audit/history: Task 1 (DB history table) + Task 2 (logging in API)

2. **Placeholder scan:** All code blocks contain complete implementations.

3. **Type consistency:** `TestCase` interface in types matches API response shape. API client uses typed params. Frontend pages use consistent types.

4. **Known gaps (deferred to later sprints):**
   - TC-F07/F08 (Bulk update/delete) — Sprint 5
   - TC-F09 (Duplicate) — Sprint 5
   - TC-F10/F11 (Export/Import CSV) — Sprint 5
   - TC-F12/F13 (Rich text, attachments) — Sprint 5
   - Table unification (merge test_cases + test_case) — Sprint 5
   - Tuleap sync integration — Sprint 2
   - Test Suites — Sprint 3
   - Test Run from Suite — Sprint 4

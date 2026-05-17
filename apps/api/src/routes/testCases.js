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

router.get('/', requireAuth, requirePermission('qc.testcases.view'), async (req, res, next) => {
    try {
        const {
            page = 1, limit = 25, search, project_id, status, priority,
            test_type, automation_status, assigned_to, sync_status,
            sort_by = 'created_at', sort_order = 'desc',
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
            pagination: { page: pageNum, limit: limitNum, total, total_pages: Math.ceil(total / limitNum) },
        });
    } catch (error) { next(error); }
});

router.get('/:id', requireAuth, requirePermission('qc.testcases.view'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`SELECT * FROM v_test_case_summary WHERE id = $1`, [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Test case not found' });

        const executionsResult = await pool.query(
            `SELECT te.id, te.status, te.notes, te.executed_at, te.duration_seconds, te.defect_ids,
                    tr.run_id, tr.name AS test_run_name, u.name AS executed_by_name
             FROM test_execution te
             LEFT JOIN test_run tr ON te.test_run_id = tr.id
             LEFT JOIN app_user u ON te.executed_by = u.id
             WHERE te.test_case_id = $1 ORDER BY te.executed_at DESC LIMIT 50`, [id]);

        const historyResult = await pool.query(
            `SELECT action, changed_fields, change_summary, performed_by_email, performed_at
             FROM test_case_history WHERE test_case_id = $1 ORDER BY performed_at DESC LIMIT 20`, [id]);

        res.json({ ...result.rows[0], execution_history: executionsResult.rows, activity: historyResult.rows });
    } catch (error) { next(error); }
});

router.post('/', requireAuth, requirePermission('qc.testcases.create'), async (req, res, next) => {
    const client = await pool.connect();
    try {
        const validatedData = testCaseCreateSchema.parse(req.body);
        await client.query('BEGIN');

        const idResult = await client.query("SELECT 'TC-' || LPAD(nextval('test_case_id_seq')::text, 5, '0') AS next_id");
        const testCaseId = idResult.rows[0].next_id;

        const result = await client.query(
            `INSERT INTO test_case (test_case_id, title, description, preconditions, test_steps, expected_result,
                priority, severity, test_type, category, component, automation_status, status,
                estimated_duration_minutes, tags, project_id, assigned_to,
                linked_requirement_id, linked_bug_ids, created_by, updated_by, sync_status)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'not_synced')
            RETURNING *`,
            [testCaseId, validatedData.title, validatedData.description || null, validatedData.preconditions || null,
             validatedData.test_steps || null, validatedData.expected_result || null, validatedData.priority,
             validatedData.severity, validatedData.test_type, validatedData.category,
             validatedData.component || null, validatedData.automation_status, validatedData.status,
             validatedData.estimated_duration_minutes || null, validatedData.tags, validatedData.project_id,
             validatedData.assigned_to || null, validatedData.linked_requirement_id || null,
             validatedData.linked_bug_ids, req.user?.id || null, req.user?.id || null]);

        await logTestCaseHistory(client, {
            test_case_id: result.rows[0].id, action: 'created', after_state: result.rows[0],
            change_summary: `Test case ${testCaseId} created`, user_id: req.user?.id, user_email: req.user?.email });

        await client.query(
            `INSERT INTO audit_log (action, entity_type, entity_id, user_id, details) VALUES ($1, $2, $3, $4, $5)`,
            ['test_case_created', 'test_case', result.rows[0].id, req.user?.id || null,
             JSON.stringify({ test_case_id: testCaseId, title: validatedData.title })]);

        await client.query('COMMIT');
        const fullResult = await pool.query(`SELECT * FROM v_test_case_summary WHERE id = $1`, [result.rows[0].id]);
        res.status(201).json(fullResult.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: error.errors });
        next(error);
    } finally { client.release(); }
});

router.patch('/:id', requireAuth, requirePermission('qc.testcases.edit'), async (req, res, next) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const validatedData = testCaseUpdateSchema.parse(req.body);
        await client.query('BEGIN');

        const existingResult = await client.query('SELECT * FROM test_case WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (existingResult.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Test case not found' }); }
        const existing = existingResult.rows[0];

        const updatableFields = ['title','description','preconditions','test_steps','expected_result',
            'priority','severity','test_type','category','component','automation_status','status',
            'estimated_duration_minutes','tags','assigned_to','linked_requirement_id','linked_bug_ids'];
        const updates = []; const params = []; let pn = 1; const changedFields = [];

        for (const field of updatableFields) {
            if (validatedData[field] !== undefined) {
                if (JSON.stringify(existing[field]) !== JSON.stringify(validatedData[field])) {
                    updates.push(`${field} = $${pn++}`); params.push(validatedData[field]); changedFields.push(field);
                }
            }
        }
        if (updates.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'No fields to update' }); }

        updates.push(`updated_by = $${pn++}`); params.push(req.user?.id || null);
        updates.push(`updated_at = CURRENT_TIMESTAMP`); params.push(id);

        const query = `UPDATE test_case SET ${updates.join(', ')} WHERE id = $${pn} RETURNING *`;
        const result = await client.query(query, params);

        await logTestCaseHistory(client, {
            test_case_id: id, action: 'updated', changed_fields: changedFields,
            before_state: existing, after_state: result.rows[0],
            change_summary: `Updated: ${changedFields.join(', ')}`, user_id: req.user?.id, user_email: req.user?.email });

        await client.query(
            `INSERT INTO audit_log (action, entity_type, entity_id, user_id, details) VALUES ($1, $2, $3, $4, $5)`,
            ['test_case_updated', 'test_case', id, req.user?.id || null, JSON.stringify({ changed_fields: changedFields })]);

        await client.query('COMMIT');
        const fullResult = await pool.query(`SELECT * FROM v_test_case_summary WHERE id = $1`, [id]);
        res.json(fullResult.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: error.errors });
        next(error);
    } finally { client.release(); }
});

router.delete('/:id', requireAuth, requirePermission('qc.testcases.delete'), async (req, res, next) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        await client.query('BEGIN');

        const existingResult = await client.query('SELECT * FROM test_case WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (existingResult.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Test case not found' }); }
        const existing = existingResult.rows[0];

        const result = await client.query(
            `UPDATE test_case SET deleted_at = CURRENT_TIMESTAMP, deleted_by = $1, status = 'archived'
             WHERE id = $2 AND deleted_at IS NULL RETURNING *`, [req.user?.id || null, id]);

        await logTestCaseHistory(client, {
            test_case_id: id, action: 'deleted', before_state: existing,
            change_summary: `Test case ${existing.test_case_id} deleted`, user_id: req.user?.id, user_email: req.user?.email });

        await client.query(
            `INSERT INTO audit_log (action, entity_type, entity_id, user_id, details) VALUES ($1, $2, $3, $4, $5)`,
            ['test_case_deleted', 'test_case', id, req.user?.id || null, JSON.stringify({ test_case_id: existing.test_case_id })]);

        await client.query('COMMIT');
        res.status(204).send();
    } catch (error) { await client.query('ROLLBACK'); next(error); }
    finally { client.release(); }
});

router.post('/bulk-import', requireAuth, requirePermission('qc.testcases.create'), async (req, res, next) => {
    const client = await pool.connect();
    try {
        const { test_cases, project_id } = req.body;
        if (!Array.isArray(test_cases) || test_cases.length === 0) return res.status(400).json({ error: 'test_cases array is required' });
        if (!project_id) return res.status(400).json({ error: 'project_id is required' });

        await client.query('BEGIN');
        const results = { success: [], errors: [], duplicates: [] };

        for (let i = 0; i < test_cases.length; i++) {
            const testCase = test_cases[i];
            try {
                const validatedData = testCaseCreateSchema.parse({ ...testCase, project_id });
                const duplicateCheck = await client.query(
                    `SELECT id, test_case_id FROM test_case WHERE project_id = $1 AND title = $2 AND deleted_at IS NULL`,
                    [project_id, validatedData.title]);
                if (duplicateCheck.rows.length > 0) {
                    results.duplicates.push({ row: i + 1, title: validatedData.title, existing_id: duplicateCheck.rows[0].test_case_id });
                    continue;
                }
                const idResult = await client.query("SELECT 'TC-' || LPAD(nextval('test_case_id_seq')::text, 5, '0') AS next_id");
                const testCaseId = idResult.rows[0].next_id;

                const result = await client.query(
                    `INSERT INTO test_case (test_case_id, title, description, preconditions, test_steps, expected_result,
                        priority, severity, test_type, category, component, automation_status, status, tags, project_id, created_by, updated_by)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
                    RETURNING id, test_case_id, title`,
                    [testCaseId, validatedData.title, validatedData.description || null, validatedData.preconditions || null,
                     validatedData.test_steps || null, validatedData.expected_result || null, validatedData.priority,
                     validatedData.severity, validatedData.test_type, validatedData.category,
                     validatedData.component || null, validatedData.automation_status, validatedData.status,
                     validatedData.tags, project_id, req.user?.id || null, req.user?.id || null]);
                results.success.push({ row: i + 1, id: result.rows[0].id, test_case_id: result.rows[0].test_case_id, title: result.rows[0].title });
            } catch (error) { results.errors.push({ row: i + 1, title: testCase.title || 'N/A', error: error.message }); }
        }

        await client.query(
            `INSERT INTO audit_log (action, entity_type, entity_id, user_id, details) VALUES ($1, $2, $3, $4, $5)`,
            ['test_case_bulk_import', 'test_case', null, req.user?.id || null,
             JSON.stringify({ total: test_cases.length, success: results.success.length, errors: results.errors.length, duplicates: results.duplicates.length, project_id })]);
        await client.query('COMMIT');
        res.json({ summary: { total: test_cases.length, imported: results.success.length, duplicates: results.duplicates.length, errors: results.errors.length }, details: results });
    } catch (error) { await client.query('ROLLBACK'); next(error); }
    finally { client.release(); }
});

module.exports = router;

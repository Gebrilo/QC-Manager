const express = require('express');
const router = express.Router();
const db = require('../config/db');
const pool = db.pool;
const { z } = require('zod');
const { requireAuth, requirePermission } = require('../middleware/authMiddleware');

const suiteCreateSchema = z.object({
    name: z.string().min(3).max(255),
    description: z.string().max(5000).optional(),
    project_id: z.string().uuid(),
    status: z.enum(['draft', 'active', 'archived']).default('draft'),
    test_case_ids: z.array(z.string().uuid()).optional().default([]),
});

const suiteUpdateSchema = z.object({
    name: z.string().min(3).max(255).optional(),
    description: z.string().max(5000).optional(),
    status: z.enum(['draft', 'active', 'archived']).optional(),
});

router.get('/', requireAuth, requirePermission('page:test-suites'), async (req, res, next) => {
    try {
        const {
            page = 1, limit = 25, search, project_id, status,
            sort_by = 'created_at', sort_order = 'desc',
        } = req.query;

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const offset = (pageNum - 1) * limitNum;

        const allowedSortColumns = ['created_at', 'updated_at', 'name', 'suite_id', 'status'];
        const safeSortBy = allowedSortColumns.includes(sort_by) ? sort_by : 'created_at';
        const safeSortOrder = sort_order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        const whereClauses = ['ts.deleted_at IS NULL'];
        const params = [];
        let pn = 1;

        if (project_id) { whereClauses.push(`ts.project_id = $${pn++}`); params.push(project_id); }
        if (status) { whereClauses.push(`ts.status = $${pn++}`); params.push(status); }
        if (search) {
            whereClauses.push(`(ts.name ILIKE $${pn} OR ts.description ILIKE $${pn} OR ts.suite_id ILIKE $${pn})`);
            params.push(`%${search}%`); pn++;
        }

        const whereStr = whereClauses.join(' AND ');

        const countQuery = `
            SELECT COUNT(*) as total FROM test_suites ts WHERE ${whereStr}`;
        const countResult = await pool.query(countQuery, params);
        const total = parseInt(countResult.rows[0].total);

        const dataQuery = `
            SELECT ts.*,
                COUNT(tsc.id) FILTER (WHERE tsc.snapshot_id IS NULL) AS test_case_count,
                p.project_name,
                creator.name AS created_by_name,
                updater.name AS updated_by_name
            FROM test_suites ts
            LEFT JOIN test_suite_cases tsc ON ts.id = tsc.suite_id AND tsc.snapshot_id IS NULL
            LEFT JOIN projects p ON ts.project_id = p.id
            LEFT JOIN app_user creator ON ts.created_by = creator.id
            LEFT JOIN app_user updater ON ts.updated_by = updater.id
            WHERE ${whereStr}
            GROUP BY ts.id, p.project_name, creator.name, updater.name
            ORDER BY ts.${safeSortBy} ${safeSortOrder}
            LIMIT $${pn++} OFFSET $${pn++}`;
        const dataParams = [...params, limitNum, offset];

        const result = await pool.query(dataQuery, dataParams);

        res.json({
            data: result.rows,
            pagination: { page: pageNum, limit: limitNum, total, total_pages: Math.ceil(total / limitNum) },
        });
    } catch (error) { next(error); }
});

router.get('/:id', requireAuth, requirePermission('page:test-suites'), async (req, res, next) => {
    try {
        const { id } = req.params;

        const suiteResult = await pool.query(
            `SELECT ts.*,
                p.project_name,
                creator.name AS created_by_name,
                updater.name AS updated_by_name
            FROM test_suites ts
            LEFT JOIN projects p ON ts.project_id = p.id
            LEFT JOIN app_user creator ON ts.created_by = creator.id
            LEFT JOIN app_user updater ON ts.updated_by = updater.id
            WHERE ts.id = $1 AND ts.deleted_at IS NULL`,
            [id]);

        if (suiteResult.rows.length === 0) return res.status(404).json({ error: 'Test suite not found' });

        const casesResult = await pool.query(
            `SELECT tsc.id AS junction_id, tsc.sort_order, tsc.created_at AS added_at,
                tc.id, tc.test_case_id, tc.title, tc.status, tc.priority, tc.test_type,
                tc.automation_status, tc.category
            FROM test_suite_cases tsc
            JOIN test_case tc ON tsc.test_case_id = tc.id
            WHERE tsc.suite_id = $1 AND tsc.snapshot_id IS NULL AND tc.deleted_at IS NULL
            ORDER BY tsc.sort_order`,
            [id]);

        res.json({ ...suiteResult.rows[0], test_cases: casesResult.rows });
    } catch (error) { next(error); }
});

router.post('/', requireAuth, requirePermission('action:test-suites:create'), async (req, res, next) => {
    const client = await pool.connect();
    try {
        const validatedData = suiteCreateSchema.parse(req.body);
        await client.query('BEGIN');

        const idResult = await client.query(
            `SELECT COALESCE(MAX(CAST(SUBSTRING(suite_id FROM 4) AS INTEGER)), 0) + 1 AS next_id
             FROM test_suites WHERE suite_id ~ '^TS-[0-9]+$'`);
        const nextId = idResult.rows[0].next_id;
        const suiteId = `TS-${String(nextId).padStart(5, '0')}`;

        const suiteResult = await client.query(
            `INSERT INTO test_suites (suite_id, name, description, status, project_id, created_by, updated_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [suiteId, validatedData.name, validatedData.description || null,
             validatedData.status, validatedData.project_id, req.user?.id || null, req.user?.id || null]);

        const suite = suiteResult.rows[0];

        if (validatedData.test_case_ids.length > 0) {
            for (let i = 0; i < validatedData.test_case_ids.length; i++) {
                await client.query(
                    `INSERT INTO test_suite_cases (suite_id, test_case_id, sort_order)
                     VALUES ($1, $2, $3)`,
                    [suite.id, validatedData.test_case_ids[i], i + 1]);
            }
        }

        await client.query(
            `INSERT INTO audit_log (action, entity_type, entity_id, user_id, details) VALUES ($1, $2, $3, $4, $5)`,
            ['test_suite_created', 'test_suite', suite.id, req.user?.id || null,
             JSON.stringify({ suite_id: suiteId, name: validatedData.title, test_case_count: validatedData.test_case_ids.length })]);

        await client.query('COMMIT');

        const fullResult = await pool.query(
            `SELECT ts.*,
                COUNT(tsc.id) FILTER (WHERE tsc.snapshot_id IS NULL) AS test_case_count,
                p.project_name,
                creator.name AS created_by_name,
                updater.name AS updated_by_name
            FROM test_suites ts
            LEFT JOIN test_suite_cases tsc ON ts.id = tsc.suite_id AND tsc.snapshot_id IS NULL
            LEFT JOIN projects p ON ts.project_id = p.id
            LEFT JOIN app_user creator ON ts.created_by = creator.id
            LEFT JOIN app_user updater ON ts.updated_by = updater.id
            WHERE ts.id = $1 AND ts.deleted_at IS NULL
            GROUP BY ts.id, p.project_name, creator.name, updater.name`,
            [suite.id]);

        res.status(201).json(fullResult.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: error.errors });
        next(error);
    } finally { client.release(); }
});

router.patch('/:id', requireAuth, requirePermission('action:test-suites:edit'), async (req, res, next) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const validatedData = suiteUpdateSchema.parse(req.body);
        await client.query('BEGIN');

        const existingResult = await client.query('SELECT * FROM test_suites WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (existingResult.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Test suite not found' }); }
        const existing = existingResult.rows[0];

        const updatableFields = ['name', 'description', 'status'];
        const updates = [];
        const params = [];
        let pn = 1;
        const changedFields = [];

        for (const field of updatableFields) {
            if (validatedData[field] !== undefined) {
                if (JSON.stringify(existing[field]) !== JSON.stringify(validatedData[field])) {
                    updates.push(`${field} = $${pn++}`);
                    params.push(validatedData[field]);
                    changedFields.push(field);
                }
            }
        }
        if (updates.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'No fields to update' }); }

        updates.push(`updated_by = $${pn++}`);
        params.push(req.user?.id || null);
        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        params.push(id);

        const query = `UPDATE test_suites SET ${updates.join(', ')} WHERE id = $${pn} RETURNING *`;
        const result = await client.query(query, params);

        await client.query(
            `INSERT INTO audit_log (action, entity_type, entity_id, user_id, details) VALUES ($1, $2, $3, $4, $5)`,
            ['test_suite_updated', 'test_suite', id, req.user?.id || null, JSON.stringify({ changed_fields: changedFields })]);

        await client.query('COMMIT');

        const fullResult = await pool.query(
            `SELECT ts.*,
                COUNT(tsc.id) FILTER (WHERE tsc.snapshot_id IS NULL) AS test_case_count,
                p.project_name,
                creator.name AS created_by_name,
                updater.name AS updated_by_name
            FROM test_suites ts
            LEFT JOIN test_suite_cases tsc ON ts.id = tsc.suite_id AND tsc.snapshot_id IS NULL
            LEFT JOIN projects p ON ts.project_id = p.id
            LEFT JOIN app_user creator ON ts.created_by = creator.id
            LEFT JOIN app_user updater ON ts.updated_by = updater.id
            WHERE ts.id = $1 AND ts.deleted_at IS NULL
            GROUP BY ts.id, p.project_name, creator.name, updater.name`,
            [id]);

        res.json(fullResult.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: error.errors });
        next(error);
    } finally { client.release(); }
});

router.delete('/:id', requireAuth, requirePermission('action:test-suites:delete'), async (req, res, next) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        await client.query('BEGIN');

        const existingResult = await client.query('SELECT * FROM test_suites WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (existingResult.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Test suite not found' }); }
        const existing = existingResult.rows[0];

        await client.query(
            `UPDATE test_suites SET deleted_at = CURRENT_TIMESTAMP, deleted_by = $1 WHERE id = $2 AND deleted_at IS NULL`,
            [req.user?.id || null, id]);

        await client.query(
            `INSERT INTO audit_log (action, entity_type, entity_id, user_id, details) VALUES ($1, $2, $3, $4, $5)`,
            ['test_suite_deleted', 'test_suite', id, req.user?.id || null,
             JSON.stringify({ suite_id: existing.suite_id, name: existing.name })]);

        await client.query('COMMIT');
        res.status(204).send();
    } catch (error) { await client.query('ROLLBACK'); next(error); }
    finally { client.release(); }
});

router.post('/:id/test-cases', requireAuth, requirePermission('action:test-suites:edit'), async (req, res, next) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { test_case_ids, position = 'end' } = req.body;

        if (!Array.isArray(test_case_ids) || test_case_ids.length === 0) {
            return res.status(400).json({ error: 'test_case_ids array is required' });
        }
        if (!['start', 'end', 'number'].includes(position) && typeof position !== 'number') {
            return res.status(400).json({ error: 'position must be "start", "end", or a number' });
        }

        await client.query('BEGIN');

        const suiteResult = await client.query('SELECT * FROM test_suites WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (suiteResult.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Test suite not found' }); }

        const maxSortResult = await client.query(
            `SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM test_suite_cases WHERE suite_id = $1 AND snapshot_id IS NULL`, [id]);
        const currentMax = maxSortResult.rows[0].max_sort;

        const existingCases = await client.query(
            `SELECT test_case_id FROM test_suite_cases WHERE suite_id = $1 AND snapshot_id IS NULL`, [id]);
        const existingIds = new Set(existingCases.rows.map(r => r.test_case_id));

        let addedCount = 0;
        if (position === 'end') {
            let nextSort = currentMax + 1;
            for (const tcId of test_case_ids) {
                if (existingIds.has(tcId)) continue;
                await client.query(
                    `INSERT INTO test_suite_cases (suite_id, test_case_id, sort_order) VALUES ($1, $2, $3)`,
                    [id, tcId, nextSort++]);
                addedCount++;
            }
        } else if (position === 'start') {
            const totalCount = await client.query(
                `SELECT COUNT(*) AS cnt FROM test_suite_cases WHERE suite_id = $1 AND snapshot_id IS NULL`, [id]);
            const shift = parseInt(totalCount.rows[0].cnt) + test_case_ids.filter(tcId => !existingIds.has(tcId)).length;
            await client.query(
                `UPDATE test_suite_cases SET sort_order = sort_order + $1 WHERE suite_id = $2 AND snapshot_id IS NULL`,
                [shift, id]);
            let sortIdx = 1;
            for (const tcId of test_case_ids) {
                if (existingIds.has(tcId)) continue;
                await client.query(
                    `INSERT INTO test_suite_cases (suite_id, test_case_id, sort_order) VALUES ($1, $2, $3)`,
                    [id, tcId, sortIdx++]);
                addedCount++;
            }
        } else {
            const insertAt = typeof position === 'number' ? position : parseInt(position);
            await client.query(
                `UPDATE test_suite_cases SET sort_order = sort_order + $1 WHERE suite_id = $2 AND snapshot_id IS NULL AND sort_order >= $3`,
                [test_case_ids.filter(tcId => !existingIds.has(tcId)).length, id, insertAt]);
            let sortIdx = insertAt;
            for (const tcId of test_case_ids) {
                if (existingIds.has(tcId)) continue;
                await client.query(
                    `INSERT INTO test_suite_cases (suite_id, test_case_id, sort_order) VALUES ($1, $2, $3)`,
                    [id, tcId, sortIdx++]);
                addedCount++;
            }
        }

        await client.query(
            `INSERT INTO audit_log (action, entity_type, entity_id, user_id, details) VALUES ($1, $2, $3, $4, $5)`,
            ['test_suite_cases_added', 'test_suite', id, req.user?.id || null,
             JSON.stringify({ suite_id: suiteResult.rows[0].suite_id, added_count: addedCount, position })]);

        await client.query('COMMIT');

        const casesResult = await pool.query(
            `SELECT tsc.id AS junction_id, tsc.sort_order, tsc.created_at AS added_at,
                tc.id, tc.test_case_id, tc.title, tc.status, tc.priority, tc.test_type,
                tc.automation_status, tc.category
            FROM test_suite_cases tsc
            JOIN test_case tc ON tsc.test_case_id = tc.id
            WHERE tsc.suite_id = $1 AND tsc.snapshot_id IS NULL AND tc.deleted_at IS NULL
            ORDER BY tsc.sort_order`,
            [id]);

        res.json({ added: addedCount, test_cases: casesResult.rows });
    } catch (error) {
        await client.query('ROLLBACK');
        next(error);
    } finally { client.release(); }
});

router.delete('/:id/test-cases', requireAuth, requirePermission('action:test-suites:edit'), async (req, res, next) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { test_case_ids } = req.body;

        if (!Array.isArray(test_case_ids) || test_case_ids.length === 0) {
            return res.status(400).json({ error: 'test_case_ids array is required' });
        }

        await client.query('BEGIN');

        const suiteResult = await client.query('SELECT * FROM test_suites WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (suiteResult.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Test suite not found' }); }

        const deleteResult = await client.query(
            `DELETE FROM test_suite_cases WHERE suite_id = $1 AND test_case_id = ANY($2) AND snapshot_id IS NULL`,
            [id, test_case_ids]);

        await client.query(
            `INSERT INTO audit_log (action, entity_type, entity_id, user_id, details) VALUES ($1, $2, $3, $4, $5)`,
            ['test_suite_cases_removed', 'test_suite', id, req.user?.id || null,
             JSON.stringify({ suite_id: suiteResult.rows[0].suite_id, removed_count: deleteResult.rowCount, test_case_ids })]);

        await client.query('COMMIT');
        res.json({ removed: deleteResult.rowCount });
    } catch (error) {
        await client.query('ROLLBACK');
        next(error);
    } finally { client.release(); }
});

router.patch('/:id/reorder', requireAuth, requirePermission('action:test-suites:reorder'), async (req, res, next) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { ordered_test_case_ids } = req.body;

        if (!Array.isArray(ordered_test_case_ids)) {
            return res.status(400).json({ error: 'ordered_test_case_ids array is required' });
        }

        await client.query('BEGIN');

        const suiteResult = await client.query('SELECT * FROM test_suites WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (suiteResult.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Test suite not found' }); }

        for (let i = 0; i < ordered_test_case_ids.length; i++) {
            await client.query(
                `UPDATE test_suite_cases SET sort_order = $1 WHERE suite_id = $2 AND test_case_id = $3 AND snapshot_id IS NULL`,
                [i + 1, id, ordered_test_case_ids[i]]);
        }

        await client.query(
            `INSERT INTO audit_log (action, entity_type, entity_id, user_id, details) VALUES ($1, $2, $3, $4, $5)`,
            ['test_suite_reordered', 'test_suite', id, req.user?.id || null,
             JSON.stringify({ suite_id: suiteResult.rows[0].suite_id, ordered_count: ordered_test_case_ids.length })]);

        await client.query('COMMIT');

        const casesResult = await pool.query(
            `SELECT tsc.id AS junction_id, tsc.sort_order, tsc.created_at AS added_at,
                tc.id, tc.test_case_id, tc.title, tc.status, tc.priority, tc.test_type,
                tc.automation_status, tc.category
            FROM test_suite_cases tsc
            JOIN test_case tc ON tsc.test_case_id = tc.id
            WHERE tsc.suite_id = $1 AND tsc.snapshot_id IS NULL AND tc.deleted_at IS NULL
            ORDER BY tsc.sort_order`,
            [id]);

        res.json({ test_cases: casesResult.rows });
    } catch (error) {
        await client.query('ROLLBACK');
        next(error);
    } finally { client.release(); }
});

router.post('/:id/clone', requireAuth, requirePermission('action:test-suites:create'), async (req, res, next) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { name } = req.body;

        await client.query('BEGIN');

        const suiteResult = await client.query('SELECT * FROM test_suites WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (suiteResult.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Test suite not found' }); }
        const source = suiteResult.rows[0];

        const idResult = await client.query(
            `SELECT COALESCE(MAX(CAST(SUBSTRING(suite_id FROM 4) AS INTEGER)), 0) + 1 AS next_id
             FROM test_suites WHERE suite_id ~ '^TS-[0-9]+$'`);
        const newSuiteId = `TS-${String(idResult.rows[0].next_id).padStart(5, '0')}`;

        const cloneName = name || `${source.name} (Copy)`;

        const newSuiteResult = await client.query(
            `INSERT INTO test_suites (suite_id, name, description, status, project_id, created_by, updated_by)
             VALUES ($1, $2, $3, 'draft', $4, $5, $6) RETURNING *`,
            [newSuiteId, cloneName, source.description, source.project_id, req.user?.id || null, req.user?.id || null]);

        const newSuite = newSuiteResult.rows[0];

        const casesResult = await client.query(
            `SELECT test_case_id, sort_order FROM test_suite_cases WHERE suite_id = $1 AND snapshot_id IS NULL ORDER BY sort_order`,
            [id]);

        for (const row of casesResult.rows) {
            await client.query(
                `INSERT INTO test_suite_cases (suite_id, test_case_id, sort_order) VALUES ($1, $2, $3)`,
                [newSuite.id, row.test_case_id, row.sort_order]);
        }

        await client.query(
            `INSERT INTO audit_log (action, entity_type, entity_id, user_id, details) VALUES ($1, $2, $3, $4, $5)`,
            ['test_suite_cloned', 'test_suite', newSuite.id, req.user?.id || null,
             JSON.stringify({ source_suite_id: source.suite_id, new_suite_id: newSuiteId, cloned_cases: casesResult.rows.length })]);

        await client.query('COMMIT');

        const fullResult = await pool.query(
            `SELECT ts.*,
                COUNT(tsc.id) FILTER (WHERE tsc.snapshot_id IS NULL) AS test_case_count,
                p.project_name,
                creator.name AS created_by_name,
                updater.name AS updated_by_name
            FROM test_suites ts
            LEFT JOIN test_suite_cases tsc ON ts.id = tsc.suite_id AND tsc.snapshot_id IS NULL
            LEFT JOIN projects p ON ts.project_id = p.id
            LEFT JOIN app_user creator ON ts.created_by = creator.id
            LEFT JOIN app_user updater ON ts.updated_by = updater.id
            WHERE ts.id = $1 AND ts.deleted_at IS NULL
            GROUP BY ts.id, p.project_name, creator.name, updater.name`,
            [newSuite.id]);

        res.status(201).json(fullResult.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        next(error);
    } finally { client.release(); }
});

module.exports = router;
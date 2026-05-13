const express = require('express');
const router = express.Router();
const db = require('../config/db');
const pool = db.pool;
const { requireAuth, requirePermission } = require('../middleware/authMiddleware');
const { auditLog } = require('../middleware/audit');

router.get('/:taskId/test-cases', requireAuth, requirePermission('page:tasks'), async (req, res, next) => {
    try {
        const { taskId } = req.params;
        const taskCheck = await pool.query('SELECT id FROM tasks WHERE id = $1 AND deleted_at IS NULL', [taskId]);
        if (taskCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const result = await pool.query(
            `SELECT ttc.id, ttc.task_id, ttc.test_case_id, ttc.relationship_type, ttc.created_at,
                    tc.test_case_id AS test_case_display_id, tc.title AS test_case_title,
                    tc.status AS test_case_status, tc.priority AS test_case_priority
             FROM task_test_cases ttc
             JOIN test_case tc ON tc.id = ttc.test_case_id
             WHERE ttc.task_id = $1
             ORDER BY ttc.created_at ASC`,
            [taskId]
        );

        res.json({ data: result.rows });
    } catch (err) {
        next(err);
    }
});

router.post('/:taskId/test-cases', requireAuth, requirePermission('action:tasks:edit'), async (req, res, next) => {
    try {
        const { taskId } = req.params;
        const { test_case_id, relationship_type = 'covers' } = req.body;

        if (!test_case_id) {
            return res.status(400).json({ error: 'test_case_id is required' });
        }

        const taskCheck = await pool.query('SELECT id FROM tasks WHERE id = $1 AND deleted_at IS NULL', [taskId]);
        if (taskCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const tcCheck = await pool.query('SELECT id FROM test_case WHERE id = $1 AND deleted_at IS NULL', [test_case_id]);
        if (tcCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Test case not found' });
        }

        const result = await pool.query(
            `INSERT INTO task_test_cases (task_id, test_case_id, relationship_type, created_by)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (task_id, test_case_id) DO NOTHING
             RETURNING *`,
            [taskId, test_case_id, relationship_type, req.user?.id || null]
        );

        if (result.rows.length === 0) {
            return res.status(409).json({ error: 'Link already exists' });
        }

        await auditLog('task_test_cases', result.rows[0].id, 'CREATE', result.rows[0], null);
        res.status(201).json({ data: result.rows[0] });
    } catch (err) {
        next(err);
    }
});

router.delete('/:taskId/test-cases/:testCaseId', requireAuth, requirePermission('action:tasks:edit'), async (req, res, next) => {
    try {
        const { taskId, testCaseId } = req.params;

        const result = await pool.query(
            `DELETE FROM task_test_cases WHERE task_id = $1 AND test_case_id = $2 RETURNING *`,
            [taskId, testCaseId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Link not found' });
        }

        await auditLog('task_test_cases', result.rows[0].id, 'DELETE', null, result.rows[0]);
        res.json({ success: true, message: 'Link removed' });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
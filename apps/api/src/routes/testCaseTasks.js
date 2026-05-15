const express = require('express');
const router = express.Router();
const db = require('../config/db');
const pool = db.pool;
const { requireAuth, requirePermission } = require('../middleware/authMiddleware');
const { auditLog } = require('../middleware/audit');

router.get('/:testCaseId/tasks', requireAuth, requirePermission('qc.testcases.view'), async (req, res, next) => {
    try {
        const { testCaseId } = req.params;
        const tcCheck = await pool.query('SELECT id FROM test_case WHERE id = $1 AND deleted_at IS NULL', [testCaseId]);
        if (tcCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Test case not found' });
        }

        const result = await pool.query(
            `SELECT ttc.id, ttc.task_id, ttc.test_case_id, ttc.relationship_type, ttc.created_at,
                    t.task_id AS task_display_id, t.task_name, t.status AS task_status, t.project_id
             FROM task_test_cases ttc
             JOIN tasks t ON t.id = ttc.task_id
             WHERE ttc.test_case_id = $1 AND t.deleted_at IS NULL
             ORDER BY ttc.created_at ASC`,
            [testCaseId]
        );

        res.json({ data: result.rows });
    } catch (err) {
        next(err);
    }
});

router.post('/:testCaseId/tasks', requireAuth, requirePermission('qc.testcases.edit'), async (req, res, next) => {
    try {
        const { testCaseId } = req.params;
        const { task_id, relationship_type = 'covers' } = req.body;

        if (!task_id) {
            return res.status(400).json({ error: 'task_id is required' });
        }

        const tcCheck = await pool.query('SELECT id FROM test_case WHERE id = $1 AND deleted_at IS NULL', [testCaseId]);
        if (tcCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Test case not found' });
        }

        const taskCheck = await pool.query('SELECT id FROM tasks WHERE id = $1 AND deleted_at IS NULL', [task_id]);
        if (taskCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const result = await pool.query(
            `INSERT INTO task_test_cases (task_id, test_case_id, relationship_type, created_by)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (task_id, test_case_id) DO NOTHING
             RETURNING *`,
            [task_id, testCaseId, relationship_type, req.user?.id || null]
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

router.delete('/:testCaseId/tasks/:taskId', requireAuth, requirePermission('qc.testcases.edit'), async (req, res, next) => {
    try {
        const { testCaseId, taskId } = req.params;

        const result = await pool.query(
            `DELETE FROM task_test_cases WHERE test_case_id = $1 AND task_id = $2 RETURNING *`,
            [testCaseId, taskId]
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
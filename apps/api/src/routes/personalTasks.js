const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth, requirePermission } = require('../middleware/authMiddleware');

router.use(requireAuth);

router.get('/', async (req, res, next) => {
    try {
        const result = await db.query(
            `SELECT id, title, description, status, priority, due_date, completed_at, created_at, updated_at
             FROM personal_tasks
             WHERE user_id = $1
             ORDER BY
                CASE status WHEN 'in_progress' THEN 0 WHEN 'pending' THEN 1 WHEN 'done' THEN 2 WHEN 'cancelled' THEN 3 END,
                COALESCE(due_date, '9999-12-31'),
                created_at DESC`,
            [req.user.id]
        );
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

router.post('/', requirePermission('action:my-tasks:create'), async (req, res, next) => {
    try {
        const { title, description, priority, due_date } = req.body;

        if (!title || typeof title !== 'string' || title.trim().length === 0) {
            return res.status(400).json({ error: 'Title is required' });
        }
        if (title.length > 255) {
            return res.status(400).json({ error: 'Title must be 255 characters or less' });
        }
        if (priority && !['low', 'medium', 'high'].includes(priority)) {
            return res.status(400).json({ error: 'Priority must be low, medium, or high' });
        }

        const result = await db.query(
            `INSERT INTO personal_tasks (user_id, title, description, priority, due_date)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, title, description, status, priority, due_date, completed_at, created_at, updated_at`,
            [req.user.id, title.trim(), description || null, priority || 'medium', due_date || null]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

router.patch('/:id', requirePermission('action:my-tasks:edit'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { title, description, status, priority, due_date } = req.body;

        const existing = await db.query(
            'SELECT id FROM personal_tasks WHERE id = $1 AND user_id = $2',
            [id, req.user.id]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }

        if (status && !['pending', 'in_progress', 'done', 'cancelled'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        if (priority && !['low', 'medium', 'high'].includes(priority)) {
            return res.status(400).json({ error: 'Priority must be low, medium, or high' });
        }
        if (title !== undefined && (typeof title !== 'string' || title.trim().length === 0)) {
            return res.status(400).json({ error: 'Title cannot be empty' });
        }

        const fields = [];
        const values = [];
        let idx = 1;

        if (title !== undefined) { fields.push(`title = $${idx++}`); values.push(title.trim()); }
        if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
        if (status !== undefined) {
            fields.push(`status = $${idx++}`);
            values.push(status);
            if (status === 'done') {
                fields.push(`completed_at = NOW()`);
            } else {
                fields.push(`completed_at = NULL`);
            }
        }
        if (priority !== undefined) { fields.push(`priority = $${idx++}`); values.push(priority); }
        if (due_date !== undefined) { fields.push(`due_date = $${idx++}`); values.push(due_date); }

        if (fields.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        fields.push('updated_at = NOW()');
        values.push(id);
        values.push(req.user.id);

        const result = await db.query(
            `UPDATE personal_tasks SET ${fields.join(', ')}
             WHERE id = $${idx++} AND user_id = $${idx}
             RETURNING id, title, description, status, priority, due_date, completed_at, created_at, updated_at`,
            values
        );

        res.json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

router.delete('/:id', requirePermission('action:my-tasks:delete'), async (req, res, next) => {
    try {
        const { id } = req.params;

        const result = await db.query(
            'DELETE FROM personal_tasks WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }

        res.json({ success: true, message: 'Task deleted' });
    } catch (err) {
        next(err);
    }
});

module.exports = router;

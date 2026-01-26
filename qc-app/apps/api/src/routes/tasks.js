const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { createTaskSchema, updateTaskSchema } = require('../schemas/task');
const { auditLog } = require('../middleware/audit');
const { triggerWorkflow } = require('../utils/n8n');

// GET all tasks (joined/view)
router.get('/', async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT *
            FROM v_tasks_with_metrics 
            ORDER BY created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

// GET single task by ID
router.get('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await db.query(`
            SELECT *
            FROM v_tasks_with_metrics 
            WHERE id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

// POST create task
router.post('/', async (req, res, next) => {
    try {
        const data = createTaskSchema.parse(req.body);

        // Map description to notes if provided and notes is empty, or just append
        const notes = data.notes || data.description || null;

        // Insert
        const query = `
            INSERT INTO tasks (
                task_id, project_id, task_name, status,
                resource1_id, resource2_id,
                estimate_days,
                r1_estimate_hrs, r1_actual_hrs,
                r2_estimate_hrs, r2_actual_hrs,
                deadline, tags, notes, completed_date
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
            ) RETURNING *
        `;

        const values = [
            data.task_id, data.project_id, data.task_name, data.status,
            data.resource1_uuid, data.resource2_uuid || null,
            data.estimate_days,
            data.r1_estimate_hrs, data.r1_actual_hrs,
            data.r2_estimate_hrs, data.r2_actual_hrs,
            data.deadline, data.tags, notes, data.completed_date
        ];

        const result = await db.query(query, values);
        const task = result.rows[0];

        // Audit (New Signature)
        await auditLog('tasks', task.id, 'CREATE', task, null);
        triggerWorkflow('task-created', task);

        res.status(201).json(task);
    } catch (err) {
        next(err);
    }
});

// PUT/PATCH update task
router.patch('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = updateTaskSchema.parse(req.body);

        // Fetch original to compare
        const originalRes = await db.query('SELECT * FROM tasks WHERE id = $1', [id]);
        if (originalRes.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
        const original = originalRes.rows[0];

        // Construct dynamic update
        const fields = [];
        const values = [];
        let idx = 1;

        // Map Zod keys to DB columns
        const keyMap = {
            task_name: 'task_name',
            status: 'status',
            // priority: removed as not in DB
            resource1_uuid: 'resource1_id',
            resource2_uuid: 'resource2_id',
            estimate_days: 'estimate_days',
            r1_estimate_hrs: 'r1_estimate_hrs',
            r1_actual_hrs: 'r1_actual_hrs',
            r2_estimate_hrs: 'r2_estimate_hrs',
            r2_actual_hrs: 'r2_actual_hrs',
            deadline: 'deadline',
            tags: 'tags',
            notes: 'notes',
            completed_date: 'completed_date'
        };

        for (const [key, value] of Object.entries(data)) {
            if (key === 'description' && !data.notes) {
                // Map description to notes if notes is not also being updated
                fields.push(`notes = $${idx++}`);
                values.push(value);
            } else if (key in keyMap) {
                fields.push(`${keyMap[key]} = $${idx++}`);
                values.push(value);
            }
        }

        if (fields.length === 0) return res.json(original);

        fields.push(`updated_at = NOW()`);
        values.push(id);

        const query = `UPDATE tasks SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
        const result = await db.query(query, values);
        const updated = result.rows[0];

        // Audit (New Signature)
        await auditLog('tasks', id, 'UPDATE', updated, original);
        triggerWorkflow('task-updated', updated);

        // Return View result
        const viewResult = await db.query('SELECT * FROM v_tasks_with_metrics WHERE id = $1', [id]);
        res.json(viewResult.rows[0]);
    } catch (err) {
        next(err);
    }
});

module.exports = router;

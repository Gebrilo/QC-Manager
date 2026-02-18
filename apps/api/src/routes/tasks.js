const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { createTaskSchema, updateTaskSchema } = require('../schemas/task');
const { auditLog } = require('../middleware/audit');
const { triggerWorkflow } = require('../utils/n8n');
const { requireAuth, requirePermission, optionalAuth } = require('../middleware/authMiddleware');

/**
 * Helper: Get the resource ID linked to the current user.
 * Returns null if the user has no linked resource.
 */
async function getUserResourceId(userId) {
    const result = await db.query(
        'SELECT id FROM resources WHERE user_id = $1 AND deleted_at IS NULL AND is_active = true LIMIT 1',
        [userId]
    );
    return result.rows.length > 0 ? result.rows[0].id : null;
}

// Status transition validation
const VALID_TRANSITIONS = {
    'Backlog': ['In Progress', 'Cancelled'],
    'In Progress': ['Done', 'Cancelled'],
    'Done': [],
    'Cancelled': []
};

function validateStatusTransition(currentStatus, newStatus, data) {
    // If status hasn't changed, no validation needed
    if (currentStatus === newStatus) {
        return { valid: true };
    }

    // Check if transition is allowed
    const allowedTransitions = VALID_TRANSITIONS[currentStatus];
    if (!allowedTransitions || !allowedTransitions.includes(newStatus)) {
        return {
            valid: false,
            error: `Cannot transition from '${currentStatus}' to '${newStatus}'. Allowed transitions: ${allowedTransitions?.join(', ') || 'none (terminal state)'}`
        };
    }

    // Special validation for Done status
    if (newStatus === 'Done') {
        if (!data.completed_date) {
            return {
                valid: false,
                error: 'completed_date is required when marking task as Done'
            };
        }
        const totalActualHrs = (data.r1_actual_hrs || 0) + (data.r2_actual_hrs || 0);
        if (totalActualHrs <= 0) {
            return {
                valid: false,
                error: 'Task must have actual hours recorded before marking as Done'
            };
        }
    }

    return { valid: true };
}

// GET all tasks (joined/view) — filtered by role
router.get('/', optionalAuth, async (req, res, next) => {
    try {
        const role = req.user?.role;
        // Admins and managers see all tasks
        if (role === 'admin' || role === 'manager') {
            const result = await db.query(`
                SELECT * FROM v_tasks_with_metrics ORDER BY created_at DESC
            `);
            return res.json(result.rows);
        }

        // Standard users: filter by their linked resource
        if (req.user?.id) {
            const resourceId = await getUserResourceId(req.user.id);
            if (resourceId) {
                const result = await db.query(`
                    SELECT * FROM v_tasks_with_metrics
                    WHERE resource1_id = $1 OR resource2_id = $1
                    ORDER BY created_at DESC
                `, [resourceId]);
                return res.json(result.rows);
            }
            // User has no linked resource — return empty
            return res.json([]);
        }

        // Unauthenticated fallback — return all (backward compat)
        const result = await db.query(`
            SELECT * FROM v_tasks_with_metrics ORDER BY created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

// GET single task by ID — with access check
router.get('/:id', optionalAuth, async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await db.query(`
            SELECT * FROM v_tasks_with_metrics WHERE id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const task = result.rows[0];
        const role = req.user?.role;

        // Admins/managers can see any task
        if (role === 'admin' || role === 'manager') {
            return res.json(task);
        }

        // Standard users: verify they are assigned to this task
        if (req.user?.id) {
            const resourceId = await getUserResourceId(req.user.id);
            if (resourceId && (task.resource1_id === resourceId || task.resource2_id === resourceId)) {
                return res.json(task);
            }
            return res.status(403).json({ error: 'You do not have access to this task' });
        }

        // Unauthenticated fallback
        res.json(task);
    } catch (err) {
        next(err);
    }
});

// POST create task
router.post('/', requireAuth, requirePermission('action:tasks:create'), async (req, res, next) => {
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
                deadline, tags, notes, completed_date,
                expected_start_date, actual_start_date
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
            ) RETURNING *
        `;

        const values = [
            data.task_id, data.project_id, data.task_name, data.status,
            data.resource1_uuid, data.resource2_uuid || null,
            data.estimate_days,
            data.r1_estimate_hrs, data.r1_actual_hrs,
            data.r2_estimate_hrs, data.r2_actual_hrs,
            data.deadline, data.tags, notes, data.completed_date,
            data.expected_start_date || null, data.actual_start_date || null
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
router.patch('/:id', requireAuth, requirePermission('action:tasks:edit'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = updateTaskSchema.parse(req.body);

        // Fetch original to compare
        const originalRes = await db.query('SELECT * FROM tasks WHERE id = $1', [id]);
        if (originalRes.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
        const original = originalRes.rows[0];

        // Validate status transition if status is being changed
        if (data.status && data.status !== original.status) {
            const validation = validateStatusTransition(
                original.status,
                data.status,
                {
                    completed_date: data.completed_date || original.completed_date,
                    r1_actual_hrs: data.r1_actual_hrs !== undefined ? data.r1_actual_hrs : original.r1_actual_hrs,
                    r2_actual_hrs: data.r2_actual_hrs !== undefined ? data.r2_actual_hrs : original.r2_actual_hrs
                }
            );

            if (!validation.valid) {
                return res.status(400).json({
                    error: 'Invalid status transition',
                    message: validation.error
                });
            }
        }

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
            completed_date: 'completed_date',
            expected_start_date: 'expected_start_date',
            actual_start_date: 'actual_start_date'
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

// DELETE soft delete task
router.delete('/:id', requireAuth, requirePermission('action:tasks:delete'), async (req, res, next) => {
    try {
        const { id } = req.params;

        // Fetch original for audit
        const originalRes = await db.query('SELECT * FROM tasks WHERE id = $1', [id]);
        if (originalRes.rows.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }
        const original = originalRes.rows[0];

        // Check if already deleted
        if (original.deleted_at) {
            return res.status(400).json({ error: 'Task already deleted' });
        }

        // Soft delete: set deleted_at and status to 'Cancelled'
        const result = await db.query(
            `UPDATE tasks 
             SET deleted_at = NOW(),
                 status = 'Cancelled',
                 updated_at = NOW()
             WHERE id = $1 
             RETURNING *`,
            [id]
        );

        const deleted = result.rows[0];

        // Audit log
        await auditLog('tasks', id, 'DELETE', deleted, original);

        // Trigger n8n workflow
        triggerWorkflow('task-deleted', deleted);

        res.json({
            success: true,
            message: `Task '${deleted.task_name}' has been deleted`,
            data: deleted
        });
    } catch (err) {
        next(err);
    }
});

// =====================================================
// TASK COMMENTS ENDPOINTS
// =====================================================

// GET comments for a task
router.get('/:id/comments', async (req, res, next) => {
    try {
        const { id } = req.params;

        const result = await db.query(
            `SELECT * FROM task_comments 
             WHERE task_id = $1 
             ORDER BY created_at DESC`,
            [id]
        );

        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

// POST add comment to task
router.post('/:id/comments', async (req, res, next) => {
    try {
        const { id } = req.params;
        const { comment } = req.body;

        if (!comment || comment.trim().length === 0) {
            return res.status(400).json({ error: 'Comment cannot be empty' });
        }

        // Verify task exists
        const taskCheck = await db.query('SELECT id FROM tasks WHERE id = $1', [id]);
        if (taskCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const result = await db.query(
            `INSERT INTO task_comments (task_id, comment, created_by)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [id, comment.trim(), req.user?.email || 'system']
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

// DELETE a comment
router.delete('/:taskId/comments/:commentId', async (req, res, next) => {
    try {
        const { taskId, commentId } = req.params;

        const result = await db.query(
            `DELETE FROM task_comments 
             WHERE id = $1 AND task_id = $2
             RETURNING *`,
            [commentId, taskId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Comment not found' });
        }

        res.json({ success: true, message: 'Comment deleted' });
    } catch (err) {
        next(err);
    }
});

module.exports = router;

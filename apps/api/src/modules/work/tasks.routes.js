const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { createTaskSchema, updateTaskSchema } = require('../../schemas/task');
const { auditLog } = require('../../middleware/audit');
const { triggerWorkflow } = require('../../utils/n8n');
const { requireAuth, requirePermission, optionalAuth } = require('../../middleware/authMiddleware');
const { getManagerTeamId } = require('../../middleware/teamAccess');
const { emitToTuleap: emitTask } = require('../integration/services/emitters/task');
const { defaultClient } = require('../integration/services/tuleapClient');
const { defaultRegistry } = require('../integration/services/tuleapFieldRegistry');

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
    if (currentStatus === newStatus) return { valid: true };

    const allowedTransitions = VALID_TRANSITIONS[currentStatus];
    if (!allowedTransitions || !allowedTransitions.includes(newStatus)) {
        return {
            valid: false,
            error: `Cannot transition from '${currentStatus}' to '${newStatus}'. Allowed transitions: ${allowedTransitions?.join(', ') || 'none (terminal state)'}`
        };
    }

    if (newStatus === 'Done') {
        if (!data.completed_date) {
            return { valid: false, error: 'completed_date is required when marking task as Done' };
        }
        const totalActualHrs = (data.r1_actual_hrs || 0) + (data.r2_actual_hrs || 0);
        if (totalActualHrs <= 0) {
            return { valid: false, error: 'Task must have actual hours recorded before marking as Done' };
        }
    }

    return { valid: true };
}

/**
 * Build team-scoped SQL clause for tasks.
 * Tasks are scoped via their project's team_id.
 * Returns { join, clause, params }.
 */
async function buildTaskTeamFilter(user) {
    if (user.role === 'admin') {
        return { join: '', clause: '', params: [] };
    }
    if (user.role === 'manager') {
        const teamId = await getManagerTeamId(user.id);
        if (!teamId) {
            return { join: '', clause: 'AND 1=0', params: [] };
        }
        return {
            join: 'JOIN projects _p ON _p.id = v.project_id',
            clause: 'AND _p.team_id = $1 AND _p.deleted_at IS NULL',
            params: [teamId],
        };
    }
    return { join: '', clause: '', params: [] };
}

function parseCsvParam(value) {
    if (!value) return [];
    return String(value)
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
}

function addTaskListFilters({ query, params, paramIndex, filters }) {
    const {
        search,
        projectIds,
        statuses,
        assigneeIds,
        priorities,
        source,
        createdFrom,
        createdTo,
        updatedFrom,
        updatedTo,
        relatedType,
        relatedId,
    } = filters;

    if (search) {
        query += ` AND (
            v.task_name ILIKE $${paramIndex}
            OR v.task_id ILIKE $${paramIndex}
            OR v.project_name ILIKE $${paramIndex}
            OR v.resource1_name ILIKE $${paramIndex}
            OR v.resource2_name ILIKE $${paramIndex}
        )`;
        params.push(`%${search}%`);
        paramIndex++;
    }

    if (projectIds.length > 0) {
        query += ` AND v.project_id = ANY($${paramIndex}::uuid[])`;
        params.push(projectIds);
        paramIndex++;
    }

    if (statuses.length > 0) {
        query += ` AND v.status = ANY($${paramIndex}::text[])`;
        params.push(statuses);
        paramIndex++;
    }

    if (assigneeIds.length > 0) {
        query += ` AND (v.resource1_id = ANY($${paramIndex}::uuid[]) OR v.resource2_id = ANY($${paramIndex}::uuid[]))`;
        params.push(assigneeIds);
        paramIndex++;
    }

    if (priorities.length > 0) {
        query += ` AND v.priority = ANY($${paramIndex}::text[])`;
        params.push(priorities);
        paramIndex++;
    }

    if (source === 'local') {
        query += ` AND v.tuleap_artifact_id IS NULL`;
    } else if (source === 'tuleap') {
        query += ` AND v.tuleap_artifact_id IS NOT NULL`;
    }

    if (createdFrom) {
        query += ` AND v.created_at >= $${paramIndex}::date`;
        params.push(createdFrom);
        paramIndex++;
    }

    if (createdTo) {
        query += ` AND v.created_at < ($${paramIndex}::date + INTERVAL '1 day')`;
        params.push(createdTo);
        paramIndex++;
    }

    if (updatedFrom) {
        query += ` AND v.updated_at >= $${paramIndex}::date`;
        params.push(updatedFrom);
        paramIndex++;
    }

    if (updatedTo) {
        query += ` AND v.updated_at < ($${paramIndex}::date + INTERVAL '1 day')`;
        params.push(updatedTo);
        paramIndex++;
    }

    if (relatedId) {
        if (relatedType === 'user_story') {
            query += ` AND v.parent_user_story_id = $${paramIndex}::uuid`;
            params.push(relatedId);
            paramIndex++;
        } else if (relatedType === 'test_case') {
            query += ` AND EXISTS (
                SELECT 1 FROM task_test_cases ttc
                WHERE ttc.task_id = v.id AND ttc.test_case_id = $${paramIndex}::uuid
            )`;
            params.push(relatedId);
            paramIndex++;
        } else if (relatedType === 'bug') {
            query += ` AND EXISTS (
                SELECT 1 FROM bug_tasks bt
                WHERE bt.task_id = v.id AND bt.bug_id = $${paramIndex}::uuid
            )`;
            params.push(relatedId);
            paramIndex++;
        }
    }

    return { query, params, paramIndex };
}

function getTaskListFilters(req) {
    const query = req.query;
    return {
        search: String(query.q || query.search || '').trim(),
        projectIds: parseCsvParam(query.project_ids || query.project_id || query.project),
        statuses: parseCsvParam(query.statuses || query.status),
        assigneeIds: parseCsvParam(query.assignee_ids || query.assignee_id || query.assignee),
        priorities: parseCsvParam(query.priorities || query.priority),
        source: ['local', 'tuleap'].includes(query.source) ? query.source : null,
        createdFrom: query.created_from || null,
        createdTo: query.created_to || null,
        updatedFrom: query.updated_from || null,
        updatedTo: query.updated_to || null,
        relatedType: query.related_type || query.related_artifact_type || null,
        relatedId: query.related_id || query.related_artifact_id || null,
    };
}

// GET all tasks — filtered by team for managers, by resource for regular users
router.get('/', requireAuth, requirePermission('qc.tasks.view'), async (req, res, next) => {
    try {
        const role = req.user?.role;
        let query = 'SELECT v.* FROM v_tasks_with_metrics v';
        const params = [];
        let paramIndex = 1;

        if (role === 'manager') {
            const teamId = await getManagerTeamId(req.user.id);
            if (!teamId) return res.json([]);
            query += ' JOIN projects p ON p.id = v.project_id';
            query += ` WHERE p.team_id = $${paramIndex} AND p.deleted_at IS NULL`;
            params.push(teamId);
            paramIndex++;
        } else {
            query += ' WHERE 1=1';
        }

        if (role !== 'admin' && role !== 'manager') {
            const resourceId = req.user?.id ? await getUserResourceId(req.user.id) : null;
            if (!resourceId) return res.json([]);
            query += ` AND (v.resource1_id = $${paramIndex} OR v.resource2_id = $${paramIndex})`;
            params.push(resourceId);
            paramIndex++;
        }

        ({ query, paramIndex } = addTaskListFilters({
            query,
            params,
            paramIndex,
            filters: getTaskListFilters(req),
        }));

        query += ' ORDER BY v.created_at DESC';
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

// GET single task by ID — enforce team scope for managers
router.get('/:id', requireAuth, requirePermission('qc.tasks.view'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await db.query(`SELECT * FROM v_tasks_with_metrics WHERE id = $1`, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const task = result.rows[0];
        const role = req.user?.role;

        if (role === 'admin') return res.json(task);

        if (role === 'manager') {
            const teamId = await getManagerTeamId(req.user.id);
            if (!teamId) return res.status(403).json({ error: 'You are not assigned to a team' });

            // Verify task's project belongs to manager's team
            const projCheck = await db.query(
                `SELECT id FROM projects WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL`,
                [task.project_id, teamId]
            );
            if (projCheck.rows.length === 0) {
                return res.status(403).json({ error: 'You do not have access to this task' });
            }
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

        res.json(task);
    } catch (err) {
        next(err);
    }
});

// POST create task — validate project and assignees belong to manager's team
router.post('/', requireAuth, requirePermission('qc.tasks.create'), async (req, res, next) => {
    try {
        const data = createTaskSchema.parse(req.body);

        // Team-scope validation for managers
        if (req.user.role === 'manager') {
            const teamId = await getManagerTeamId(req.user.id);
            if (!teamId) {
                return res.status(403).json({ error: 'You are not assigned to a team' });
            }

            // Verify project belongs to manager's team
            if (data.project_id) {
                const projCheck = await db.query(
                    `SELECT id FROM projects WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL`,
                    [data.project_id, teamId]
                );
                if (projCheck.rows.length === 0) {
                    return res.status(403).json({ error: 'Project does not belong to your team' });
                }
            }

            // Verify resource1 belongs to manager's team (via user_id → app_user.team_id)
            if (data.resource1_uuid) {
                const r1Check = await db.query(
                    `SELECT r.id FROM resources r
                     JOIN app_user u ON r.user_id = u.id
                     WHERE r.id = $1 AND u.team_id = $2 AND r.deleted_at IS NULL`,
                    [data.resource1_uuid, teamId]
                );
                if (r1Check.rows.length === 0) {
                    return res.status(403).json({ error: 'Resource 1 does not belong to your team' });
                }
            }

            // Verify resource2 belongs to manager's team
            if (data.resource2_uuid) {
                const r2Check = await db.query(
                    `SELECT r.id FROM resources r
                     JOIN app_user u ON r.user_id = u.id
                     WHERE r.id = $1 AND u.team_id = $2 AND r.deleted_at IS NULL`,
                    [data.resource2_uuid, teamId]
                );
                if (r2Check.rows.length === 0) {
                    return res.status(403).json({ error: 'Resource 2 does not belong to your team' });
                }
            }
        }

        const notes = data.notes || data.description || null;

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
        const { parent_story_tuleap_artifact_id, ...task } = result.rows[0];

        await auditLog('tasks', task.id, 'CREATE', task, null);
        triggerWorkflow('task-created', task);

        res.status(201).json(task);
    } catch (err) {
        next(err);
    }
});

// PATCH update task — enforce team scope and re-validate assignments
router.patch('/:id', requireAuth, requirePermission('qc.tasks.edit'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = updateTaskSchema.parse(req.body);

        const originalRes = await db.query('SELECT * FROM tasks WHERE id = $1', [id]);
        if (originalRes.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
        const original = originalRes.rows[0];

        // Enforce team scope for managers
        if (req.user.role === 'manager') {
            const teamId = await getManagerTeamId(req.user.id);
            if (!teamId) return res.status(403).json({ error: 'You are not assigned to a team' });

            const projCheck = await db.query(
                `SELECT id FROM projects WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL`,
                [original.project_id, teamId]
            );
            if (projCheck.rows.length === 0) {
                return res.status(403).json({ error: 'You do not have access to this task' });
            }

            // Validate that any new project_id belongs to manager's team
            if (data.project_id && data.project_id !== original.project_id) {
                const newProjCheck = await db.query(
                    `SELECT id FROM projects WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL`,
                    [data.project_id, teamId]
                );
                if (newProjCheck.rows.length === 0) {
                    return res.status(403).json({ error: 'Target project does not belong to your team' });
                }
            }

            // Validate resource1 reassignment
            if (data.resource1_uuid && data.resource1_uuid !== original.resource1_id) {
                const r1Check = await db.query(
                    `SELECT r.id FROM resources r
                     JOIN app_user u ON r.user_id = u.id
                     WHERE r.id = $1 AND u.team_id = $2 AND r.deleted_at IS NULL`,
                    [data.resource1_uuid, teamId]
                );
                if (r1Check.rows.length === 0) {
                    return res.status(403).json({ error: 'Resource 1 does not belong to your team' });
                }
            }

            // Validate resource2 reassignment
            if (data.resource2_uuid && data.resource2_uuid !== original.resource2_id) {
                const r2Check = await db.query(
                    `SELECT r.id FROM resources r
                     JOIN app_user u ON r.user_id = u.id
                     WHERE r.id = $1 AND u.team_id = $2 AND r.deleted_at IS NULL`,
                    [data.resource2_uuid, teamId]
                );
                if (r2Check.rows.length === 0) {
                    return res.status(403).json({ error: 'Resource 2 does not belong to your team' });
                }
            }
        }

        // Status transition check
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
                return res.status(400).json({ error: 'Invalid status transition', message: validation.error });
            }
        }

        // Construct dynamic update
        const fields = [];
        const values = [];
        let idx = 1;

        const keyMap = {
            task_name: 'task_name',
            status: 'status',
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
            actual_start_date: 'actual_start_date',
            parent_user_story_id: 'parent_user_story_id',
        };

        for (const [key, value] of Object.entries(data)) {
            if (key === 'description' && !data.notes) {
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

        await auditLog('tasks', id, 'UPDATE', updated, original);
        triggerWorkflow('task-updated', updated);

        // Push Tuleap-mappable changes through the emitter so QC→Tuleap doesn't drift.
        // Local UPDATE has already persisted QC-only fields; this is best-effort —
        // emit failures log a warning and the inbound poll repairs.
        if (original.tuleap_artifact_id) {
            const tuleapCommon = {};
            if (data.task_name !== undefined) tuleapCommon.title = data.task_name;
            const desc = data.notes !== undefined ? data.notes : data.description;
            if (desc !== undefined) tuleapCommon.description = desc;
            if (data.status !== undefined) tuleapCommon.status = data.status;
            if (data.resource1_uuid !== undefined) {
                if (data.resource1_uuid === null) {
                    tuleapCommon.assigned_to = null;
                } else {
                    const r = await db.query('SELECT resource_name FROM resources WHERE id = $1', [data.resource1_uuid]);
                    if (r.rows.length > 0) tuleapCommon.assigned_to = r.rows[0].resource_name;
                }
            }

            if (Object.keys(tuleapCommon).length > 0) {
                const configResult = await db.query(
                    `SELECT * FROM tracker_config
                     WHERE qc_project_id = $1 AND tracker_type = 'task' AND is_active = true`,
                    [original.project_id]
                );
                const config = configResult.rows[0];
                if (!config) {
                    console.warn(`[route:tasks:patch] no_active_task_config project=${original.project_id} task_id=${id} — Tuleap edits dropped`);
                } else {
                    try {
                        await emitTask(
                            {
                                artifact_type: 'task',
                                project_id: original.project_id,
                                tuleap: { artifact_id: original.tuleap_artifact_id },
                                common: tuleapCommon,
                                fields: {},
                            },
                            config,
                            'update',
                            { client: defaultClient, registry: defaultRegistry, query: db.pool.query.bind(db.pool) }
                        );
                    } catch (emitErr) {
                        console.warn(`[route:tasks:patch] emit_failed task_id=${id} artifact_id=${original.tuleap_artifact_id} err="${emitErr.message}" — drift; poll will repair`);
                    }
                }
            }
        }

        const viewResult = await db.query('SELECT * FROM v_tasks_with_metrics WHERE id = $1', [id]);
        res.json(viewResult.rows[0]);
    } catch (err) {
        next(err);
    }
});

// DELETE soft delete task — enforce team scope
router.delete('/:id', requireAuth, requirePermission('qc.tasks.delete'), async (req, res, next) => {
    try {
        const { id } = req.params;

        const originalRes = await db.query('SELECT * FROM tasks WHERE id = $1', [id]);
        if (originalRes.rows.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }
        const original = originalRes.rows[0];

        // Enforce team scope for managers
        if (req.user.role === 'manager') {
            const teamId = await getManagerTeamId(req.user.id);
            if (!teamId) return res.status(403).json({ error: 'You are not assigned to a team' });

            const projCheck = await db.query(
                `SELECT id FROM projects WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL`,
                [original.project_id, teamId]
            );
            if (projCheck.rows.length === 0) {
                return res.status(403).json({ error: 'You do not have access to this task' });
            }
        }

        if (original.deleted_at) {
            return res.status(400).json({ error: 'Task already deleted' });
        }

        if (original.tuleap_artifact_id) {
            const configResult = await db.query(
                `SELECT * FROM tracker_config
                 WHERE qc_project_id = $1 AND tracker_type = 'task' AND is_active = true`,
                [original.project_id]
            );
            const config = configResult.rows[0];
            if (!config) {
                return res.status(400).json({
                    success: false,
                    error: `No active task sync config for project ${original.project_id}`,
                });
            }

            try {
                await emitTask(
                    {
                        artifact_type: 'task',
                        project_id: original.project_id,
                        tuleap: { artifact_id: original.tuleap_artifact_id },
                    },
                    config,
                    'delete',
                    { client: defaultClient, registry: defaultRegistry, query: db.pool.query.bind(db.pool) }
                );
            } catch (emitErr) {
                console.error(`[route:tasks:delete] emit_failed task_id=${id} err="${emitErr.message}"`);
                return res.status(emitErr.status || 502).json({
                    success: false,
                    error: 'Failed to delete in Tuleap',
                    message: emitErr.message,
                });
            }

            const refreshed = await db.query('SELECT * FROM tasks WHERE id = $1', [id]);
            const { parent_story_tuleap_artifact_id: _psid, ...deleted } = refreshed.rows[0];
            await auditLog('tasks', id, 'DELETE', deleted, original);
            triggerWorkflow('task-deleted', deleted);
            return res.json({
                success: true,
                message: `Task '${deleted.task_name}' has been deleted`,
                data: deleted,
            });
        }

        const result = await db.query(
            `UPDATE tasks SET deleted_at = NOW(), status = 'Cancelled', updated_at = NOW()
             WHERE id = $1 RETURNING *`,
            [id]
        );

        const { parent_story_tuleap_artifact_id: _psid2, ...deleted } = result.rows[0];
        await auditLog('tasks', id, 'DELETE', deleted, original);
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
router.get('/:id/comments', requireAuth, requirePermission('qc.tasks.view'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await db.query(
            `SELECT * FROM task_comments WHERE task_id = $1 ORDER BY created_at DESC`,
            [id]
        );
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

// POST add comment to task
router.post('/:id/comments', requireAuth, requirePermission('qc.tasks.edit'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { comment } = req.body;

        if (!comment || comment.trim().length === 0) {
            return res.status(400).json({ error: 'Comment cannot be empty' });
        }

        const taskCheck = await db.query('SELECT id FROM tasks WHERE id = $1', [id]);
        if (taskCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const result = await db.query(
            `INSERT INTO task_comments (task_id, comment, created_by) VALUES ($1, $2, $3) RETURNING *`,
            [id, comment.trim(), req.user?.email || 'system']
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

// DELETE a comment
router.delete('/:taskId/comments/:commentId', requireAuth, requirePermission('qc.tasks.delete'), async (req, res, next) => {
    try {
        const { taskId, commentId } = req.params;

        const result = await db.query(
            `DELETE FROM task_comments WHERE id = $1 AND task_id = $2 RETURNING *`,
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

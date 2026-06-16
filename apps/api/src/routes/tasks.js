const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { createTaskSchema, updateTaskSchema } = require('../schemas/task');
const { auditLog } = require('../middleware/audit');
const { triggerWorkflow } = require('../utils/n8n');
const { dispatchTaskAssignment } = require('../services/notifications/dispatcher');
const { requireAuth, requirePermission, optionalAuth, blockContributors } = require('../middleware/authMiddleware');
const { getManagerTeamId } = require('../middleware/teamAccess');
const { emitToTuleap: emitTask, buildTaskEmitUnified } = require('../services/emitters/task');
const { adoptStagedAttachments } = require('./artifactAttachments');
const { defaultClient } = require('../services/tuleapClient');
const { defaultRegistry } = require('../services/tuleapFieldRegistry');
const { resolve: resolveRole } = require('../access/RoleResolver');
const { canEditTask, canTakeOverTask } = require('../services/dashboards/teamMemberDashboards');
const { buildAccessDefaults, materializeAclGrants } = require('../services/accessDefaults');
const { appendListFilter, enforceArtifact, decorateRows } = require('../services/access/enforcement');
const { isTeamManagerRole } = require('../../../shared/rbac/catalog.ts');
const {
    assignmentsFromPayload,
    validateAssignments,
    replaceTaskAssignments,
    getTaskAssignments,
    getTaskAssignmentSummary,
    primaryOf,
} = require('../services/assignments/taskAssignments');

const TASK_FILTER_OPTS = Object.freeze({
    tableAlias: 'v',
    // ADR 0009 — resolve assignees via the task_resource_assignment junction so
    // every assignee (primary + all secondaries, incl. the 3rd+) is matched.
    assigneeJunction: { table: 'task_resource_assignment', idExpr: 'v.id' },
    userExprs: ['v.created_by_user_id'],
});

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

async function resolveTaskSyncConfig(projectId) {
    const result = await db.query(
        `SELECT * FROM tuleap_sync_config WHERE qc_project_id = $1 AND tracker_type = 'task' AND is_active = true`,
        [projectId]
    );
    return result.rows[0] || null;
}

async function resolveTaskAccessAssigneeResourceId(taskId, user, req) {
    const result = await db.query(
        `SELECT tra.resource_id, r.user_id, au.team_id
           FROM task_resource_assignment tra
           JOIN resources r ON r.id = tra.resource_id
           LEFT JOIN app_user au ON au.id = r.user_id
          WHERE tra.task_id = $1 AND r.deleted_at IS NULL
          ORDER BY (tra.assignment_type = 'PRIMARY') DESC, tra.created_at, tra.id`,
        [taskId]
    );
    const rows = result.rows || [];
    if (rows.length === 0) return null;

    if (user?.id) {
        const mine = rows.find(row => row.user_id === user.id);
        if (mine) return mine.resource_id;

        const resolved = await resolveRole(user, req);
        if (resolved.scope.team_id) {
            const teammate = rows.find(row => row.team_id === resolved.scope.team_id);
            if (teammate) return teammate.resource_id;
        }
    }

    return rows[0].resource_id;
}

async function decorateTaskRows(req, rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
        return decorateRows(req, 'task', rows || []);
    }

    const assigneeResourceByTaskId = new Map();
    await Promise.all(rows.map(async (row) => {
        assigneeResourceByTaskId.set(
            row.id,
            await resolveTaskAccessAssigneeResourceId(row.id, req.user, req)
        );
    }));

    return decorateRows(req, 'task', rows, {
        artifact: (row) => ({
            assignee_resource_id: assigneeResourceByTaskId.get(row.id) || row.resource1_id || row.resource2_id || null,
        }),
    });
}

async function tryEmitAndWriteback(task, config, mode) {
    const summary = await getTaskAssignmentSummary(db.query.bind(db), task.id);
    // Tuleap's assigned_to bind expects the username (e.g. 'belal.z'), NOT the
    // display name. Sending the display name makes Tuleap reject the artifact
    // with "Bind value '<name>' not found". When the primary resource has no
    // Tuleap username, emit nothing for assigned_to (toTuleap drops null) so the
    // rest of the sync still goes through.
    if (summary.primary_resource_id && !summary.primary_tuleap_username) {
        console.warn(
            `[route:tasks:emit] primary resource '${summary.primary_resource_name}' ` +
            `(task ${task.id}) has no tuleap_username — assignee will not be synced to Tuleap`
        );
    }
    const unified = buildTaskEmitUnified({
        ...task,
        actual_effort: summary.total_actual_hrs,
        final_estimate: summary.primary_final_estimate,
    }, summary.primary_tuleap_username);

    const emitDeps = { client: defaultClient, registry: defaultRegistry, query: db.query.bind(db) };

    const emitResult = await emitTask(unified, config, mode, { ...emitDeps, skipPersist: true });

    const updateRes = await db.query(
        `UPDATE tasks SET
            sync_status = 'synced',
            tuleap_artifact_id = COALESCE($1, tuleap_artifact_id),
            tuleap_url = COALESCE($2, tuleap_url),
            tuleap_tracker_id = COALESCE($3, tuleap_tracker_id),
            last_sync_attempted_at = NOW(),
            last_sync_error = NULL,
            updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [
            emitResult.tuleap_artifact_id || null,
            emitResult.tuleap_url || null,
            config.tuleap_tracker_id,
            task.id,
        ]
    );
    return updateRes.rows[0];
}

async function ensureResourceInTeam(resourceId, teamId, label) {
    if (!resourceId || !teamId) return null;
    const result = await db.query(
        `SELECT r.id
           FROM resources r
           JOIN app_user u ON r.user_id = u.id
          WHERE r.id = $1
            AND u.team_id = $2
            AND r.deleted_at IS NULL`,
        [resourceId, teamId]
    );
    return result.rows.length === 0 ? `${label} does not belong to your team` : null;
}

function validateStatusTransition(currentStatus, newStatus, data) {
    if (currentStatus === newStatus) return { valid: true };

    if (newStatus === 'Done') {
        if (!data.completed_date) {
            return { valid: false, error: 'completed_date is required when marking task as Done' };
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
    if (isTeamManagerRole(user.role)) {
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

// GET all tasks — filtered by team for managers, by resource for regular users
router.get('/', requireAuth, blockContributors, requirePermission('qc.tasks.view'), async (req, res, next) => {
    try {
        const relatedType = req.query.related_type || req.query.related_artifact_type;
        const relatedId = req.query.related_id || req.query.related_artifact_id;

        // related_artifact view bypasses scope filtering — caller already
        // has the parent artifact, so showing its children is appropriate.
        if (relatedType === 'user_story' && relatedId) {
            const result = await db.query(
                `SELECT * FROM v_tasks_with_metrics
                 WHERE parent_user_story_id = $1
                 ORDER BY created_at DESC`,
                [relatedId]
            );
            const data = await decorateTaskRows(req, result.rows);
            return res.json(data);
        }

        const where = ['1=1'];
        const params = [];
        const access = await appendListFilter(req, 'task', where, params, {
            ...TASK_FILTER_OPTS,
            startIdx: params.length + 1,
        });
        if (!access.enabled) {
            // No actor / engine disabled — admin wildcard short-circuits to TRUE
            // via buildListFilter, so reaching this branch means a non-authed
            // path. Return the existing unfiltered view.
            const result = await db.query(`SELECT * FROM v_tasks_with_metrics ORDER BY created_at DESC`);
            const data = await decorateTaskRows(req, result.rows);
            return res.json(data);
        }

        const sql = `SELECT v.* FROM v_tasks_with_metrics v WHERE ${where.join(' AND ')} ORDER BY v.created_at DESC`;
        const result = await db.query(sql, params);
        const data = await decorateTaskRows(req, result.rows);
        res.json(data);
    } catch (err) {
        next(err);
    }
});

// GET single task by ID — access engine enforces scope per role+permissions
router.get('/:id', requireAuth, blockContributors, requirePermission('qc.tasks.view'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await db.query(`SELECT * FROM v_tasks_with_metrics WHERE id = $1`, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const task = result.rows[0];

        const assignmentRows = await getTaskAssignments(db.query.bind(db), task.id);
        const assigneeResourceId = await resolveTaskAccessAssigneeResourceId(task.id, req.user, req);

        const enforcement = await enforceArtifact(req, res, 'task', task, 'view', {
            route: 'GET /tasks/:id',
            artifact: { assignee_resource_id: assigneeResourceId },
        });
        if (!enforcement.allowed) return; // enforceArtifact already wrote 403

        const [decoratedTask] = await decorateRows(req, 'task', [task], {
            artifact: { assignee_resource_id: assigneeResourceId },
        });
        res.json({ ...decoratedTask, assignments: assignmentRows });
    } catch (err) {
        next(err);
    }
});

// POST create task — validate project and assignees belong to manager's team
router.post('/', requireAuth, blockContributors, requirePermission('qc.tasks.create'), async (req, res, next) => {
    try {
        const temp_id = req.body.temp_id;
        const data = createTaskSchema.parse(req.body);

        // ADR 0009 — resolve the desired assignment set and enforce the
        // assignment rules before any write.
        const assignments = assignmentsFromPayload(data) || [];
        validateAssignments(assignments);

        // Team-scope validation for managers
        if (isTeamManagerRole(req.user.role)) {
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

            // Verify every assigned resource (primary + secondaries) belongs to the team
            for (const a of assignments) {
                const inTeam = await db.query(
                    `SELECT r.id FROM resources r
                     JOIN app_user u ON r.user_id = u.id
                     WHERE r.id = $1 AND u.team_id = $2 AND r.deleted_at IS NULL`,
                    [a.resource_id, teamId]
                );
                if (inTeam.rows.length === 0) {
                    const label = a.assignment_type === 'PRIMARY' ? 'Primary resource' : 'A secondary resource';
                    return res.status(403).json({ error: `${label} does not belong to your team` });
                }
            }
        }

        const accessDefaults = await buildAccessDefaults({
            creator: req.user ? { id: req.user.id } : null,
            artifactType: 'task',
            query: db.query.bind(db),
        });
        const createActor = await resolveRole(req.user, req);
        const canSetPriority = createActor.effectivePermissions.has('*') || createActor.effectivePermissions.has('qc.tasks.change_priority');

        const query = `
            INSERT INTO tasks (
                task_id, project_id, task_name, description, status, priority,
                estimate_days,
                deadline, tags, notes, completed_date,
                expected_start_date, actual_start_date,
                owner_team_id, visibility_scope, created_by_user_id
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                $12, $13, $14, $15, $16
            ) RETURNING *
        `;

        const values = [
            data.task_id, data.project_id, data.task_name, data.description || null,
            data.status, canSetPriority ? data.priority : 'Medium',
            data.estimate_days,
            data.deadline, data.tags, data.notes || null, data.completed_date,
            data.expected_start_date || null, data.actual_start_date || null,
            accessDefaults.owner_team_id, accessDefaults.visibility_scope, req.user?.id || null,
        ];

        const result = await db.query(query, values);
        const task = result.rows[0];

        if (assignments.length > 0) {
            await replaceTaskAssignments({ query: db.query.bind(db), taskId: task.id, assignments });
        }

        await materializeAclGrants({
            artifactType: 'task',
            artifactId: task.id,
            grants: accessDefaults.default_acl_grants,
            grantedBy: req.user?.id || null,
            query: db.query.bind(db),
        });

        await auditLog('tasks', task.id, 'CREATE', task, null, req.user?.email || 'system');
        triggerWorkflow('task-created', task);

        if (data.project_id) {
            const config = await resolveTaskSyncConfig(data.project_id);
            if (config) {
                try {
                    const updated = await tryEmitAndWriteback(task, config, 'create');
                    Object.assign(task, updated);
                } catch (err) {
                    console.error(`[route:tasks:create] emit_failed task_id=${task.id} err="${err.message}"`);
                    const failRes = await db.query(
                        `UPDATE tasks SET sync_status = 'failed', last_sync_attempted_at = NOW(), last_sync_error = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
                        [String(err.message).slice(0, 1024), task.id]
                    );
                    Object.assign(task, failRes.rows[0]);
                }
            } else {
                const standaloneRes = await db.query(
                    `UPDATE tasks SET sync_status = 'standalone', last_sync_attempted_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
                    [task.id]
                );
                Object.assign(task, standaloneRes.rows[0]);
            }
        } else {
            const standaloneRes = await db.query(
                `UPDATE tasks SET sync_status = 'standalone', last_sync_attempted_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
                [task.id]
            );
            Object.assign(task, standaloneRes.rows[0]);
        }

        if (temp_id && task.id) {
            await adoptStagedAttachments('task', task.id, temp_id, req.user?.id)
                .catch(err => console.error('[attachments:adopt] task', err.message));
        }

        const viewResult = await db.query('SELECT * FROM v_tasks_with_metrics WHERE id = $1', [task.id]);
        const assignmentRows = await getTaskAssignments(db.query.bind(db), task.id);
        res.status(201).json({ ...viewResult.rows[0], assignments: assignmentRows });
    } catch (err) {
        next(err);
    }
});

// PATCH update task — enforce team scope and re-validate assignments
router.patch('/:id', requireAuth, blockContributors, requirePermission('qc.tasks.edit'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = updateTaskSchema.parse(req.body);

        const originalRes = await db.query('SELECT * FROM tasks WHERE id = $1', [id]);
        if (originalRes.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
        const original = originalRes.rows[0];

        // ADR 0009 — null means this request does not touch assignments.
        const desiredAssignments = assignmentsFromPayload(data);
        if (desiredAssignments) validateAssignments(desiredAssignments); // 400 on bad set

        // Detect a genuine assignment change to gate the take-over permission.
        let assignmentChanged = false;
        let addedResourceIds = [];
        if (desiredAssignments) {
            const currentAssignments = await getTaskAssignments(db.query.bind(db), id);
            const curPrimary = (currentAssignments.find(a => a.assignment_type === 'PRIMARY') || {}).resource_id || null;
            const curSecondaries = new Set(
                currentAssignments.filter(a => a.assignment_type === 'SECONDARY').map(a => a.resource_id)
            );
            const newPrimary = (primaryOf(desiredAssignments) || {}).resource_id || null;
            const newSecondaries = new Set(
                desiredAssignments.filter(a => a.assignment_type === 'SECONDARY').map(a => a.resource_id)
            );
            assignmentChanged = newPrimary !== curPrimary
                || newSecondaries.size !== curSecondaries.size
                || [...newSecondaries].some(rid => !curSecondaries.has(rid));

            const currentResourceIds = new Set(currentAssignments.map(a => a.resource_id));
            addedResourceIds = desiredAssignments
                .map(a => a.resource_id)
                .filter(rid => rid && !currentResourceIds.has(rid));
        }

        if (assignmentChanged) {
            const resolved = await resolveRole(req.user, req);
            if (!canTakeOverTask(resolved, original)) {
                return res.status(403).json({ error: 'You do not have permission to take over this task' });
            }
            if (!resolved.effectivePermissions.has('*')) {
                for (const a of desiredAssignments) {
                    const err = await ensureResourceInTeam(
                        a.resource_id, resolved.scope.team_id,
                        a.assignment_type === 'PRIMARY' ? 'Primary resource' : 'Secondary resource'
                    );
                    if (err) return res.status(403).json({ error: err });
                }
            }
        } else {
            const originalAssignments = await getTaskAssignments(db.query.bind(db), id);
            const canEdit = await canEditTask(req.user, { ...original, assignments: originalAssignments }, req);
            if (!canEdit) {
                return res.status(403).json({ error: 'You do not have permission to edit this task' });
            }
        }

        // Enforce team scope for managers
        if (isTeamManagerRole(req.user.role)) {
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

            // Validate every (re)assigned resource belongs to the manager's team
            if (desiredAssignments) {
                for (const a of desiredAssignments) {
                    const chk = await db.query(
                        `SELECT r.id FROM resources r
                         JOIN app_user u ON r.user_id = u.id
                         WHERE r.id = $1 AND u.team_id = $2 AND r.deleted_at IS NULL`,
                        [a.resource_id, teamId]
                    );
                    if (chk.rows.length === 0) {
                        const label = a.assignment_type === 'PRIMARY' ? 'Primary resource' : 'A secondary resource';
                        return res.status(403).json({ error: `${label} does not belong to your team` });
                    }
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
                }
            );
            if (!validation.valid) {
                return res.status(400).json({ error: 'Invalid status transition', message: validation.error });
            }
        }

        // Construct dynamic update
        const priorityActor = await resolveRole(req.user, req);
        const canChangePriority = priorityActor.effectivePermissions.has('*') || priorityActor.effectivePermissions.has('qc.tasks.change_priority');
        if (Object.prototype.hasOwnProperty.call(data, 'priority') && !canChangePriority) {
            delete data.priority;
        }

        const fields = [];
        const values = [];
        let idx = 1;

        const keyMap = {
            project_id: 'project_id',
            task_name: 'task_name',
            description: 'description',
            status: 'status',
            priority: 'priority',
            estimate_days: 'estimate_days',
            deadline: 'deadline',
            tags: 'tags',
            notes: 'notes',
            completed_date: 'completed_date',
            expected_start_date: 'expected_start_date',
            actual_start_date: 'actual_start_date',
            parent_user_story_id: 'parent_user_story_id',
        };

        for (const [key, value] of Object.entries(data)) {
            if (key in keyMap) {
                fields.push(`${keyMap[key]} = $${idx++}`);
                values.push(value);
            }
        }

        if (fields.length === 0 && !desiredAssignments) {
            const assignmentRows = await getTaskAssignments(db.query.bind(db), id);
            return res.json({ ...original, assignments: assignmentRows });
        }

        let updated = original;
        if (fields.length > 0) {
            fields.push(`updated_at = NOW()`);
            values.push(id);
            const updateQuery = `UPDATE tasks SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
            const result = await db.query(updateQuery, values);
            updated = result.rows[0];
        }

        if (desiredAssignments) {
            await replaceTaskAssignments({ query: db.query.bind(db), taskId: id, assignments: desiredAssignments });
        }

        await auditLog('tasks', id, 'UPDATE', updated, original, req.user?.email || 'system');
        if (assignmentChanged && addedResourceIds.length > 0) {
            dispatchTaskAssignment(id, req.user?.email || 'system', addedResourceIds)
                .catch(err => console.error('Task assignment notification error:', err.message));
        }
        triggerWorkflow('task-updated', updated);

        const config = await resolveTaskSyncConfig(updated.project_id);
        const projectChanged = Object.prototype.hasOwnProperty.call(data, 'project_id')
            && data.project_id !== original.project_id;

        if (!config) {
            await db.query(
                `UPDATE tasks SET sync_status = 'standalone', last_sync_attempted_at = NOW(), updated_at = NOW() WHERE id = $1`,
                [id]
            );
        } else if (projectChanged && original.tuleap_artifact_id) {
            // Project changed — artifact belongs to old project's tracker.
            // Orphan the sync so the task becomes standalone in the new project.
            // User can re-sync manually via the Sync button on the task page.
            await db.query(
                `UPDATE tasks SET sync_status = 'standalone', last_sync_attempted_at = NOW(), updated_at = NOW() WHERE id = $1`,
                [id]
            );
        } else if (original.tuleap_artifact_id) {
            try {
                const emitTaskRow = await db.query('SELECT * FROM tasks WHERE id = $1', [id]);
                await tryEmitAndWriteback(emitTaskRow.rows[0], config, 'update');
            } catch (emitErr) {
                console.error(`[route:tasks:patch] emit_failed task_id=${id} artifact_id=${original.tuleap_artifact_id} err="${emitErr.message}"`);
                await db.query(
                    `UPDATE tasks SET sync_status = 'failed', last_sync_attempted_at = NOW(), last_sync_error = $1, updated_at = NOW() WHERE id = $2`,
                    [String(emitErr.message).slice(0, 1024), id]
                );
            }
        } else {
            try {
                const emitTaskRow = await db.query('SELECT * FROM tasks WHERE id = $1', [id]);
                await tryEmitAndWriteback(emitTaskRow.rows[0], config, 'create');
            } catch (emitErr) {
                console.error(`[route:tasks:patch] emit_failed task_id=${id} err="${emitErr.message}"`);
                await db.query(
                    `UPDATE tasks SET sync_status = 'failed', last_sync_attempted_at = NOW(), last_sync_error = $1, updated_at = NOW() WHERE id = $2`,
                    [String(emitErr.message).slice(0, 1024), id]
                );
            }
        }

        const viewResult = await db.query('SELECT * FROM v_tasks_with_metrics WHERE id = $1', [id]);
        const assignmentRows = await getTaskAssignments(db.query.bind(db), id);
        res.json({ ...viewResult.rows[0], assignments: assignmentRows });
    } catch (err) {
        next(err);
    }
});

router.post('/:id/sync', requireAuth, blockContributors, requirePermission('qc.tasks.edit'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const taskRes = await db.query('SELECT * FROM tasks WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (taskRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Task not found' });
        }
        let task = taskRes.rows[0];

        const config = await resolveTaskSyncConfig(task.project_id);
        if (!config) {
            const standaloneRes = await db.query(
                `UPDATE tasks SET sync_status = 'standalone', last_sync_attempted_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
                [id]
            );
            return res.json({ success: true, data: standaloneRes.rows[0] });
        }

        await db.query(
            `UPDATE tasks SET sync_status = 'pending', last_sync_attempted_at = NOW(), updated_at = NOW() WHERE id = $1`,
            [id]
        );

        try {
            const mode = task.tuleap_artifact_id ? 'update' : 'create';
            task = await tryEmitAndWriteback(task, config, mode);
        } catch (err) {
            console.error(`[route:tasks:sync] emit_failed task_id=${id} err="${err.message}"`);
            const failRes = await db.query(
                `UPDATE tasks SET sync_status = 'failed', last_sync_error = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
                [String(err.message).slice(0, 1024), id]
            );
            task = failRes.rows[0];
        }

        res.json({ success: true, data: task });
    } catch (error) {
        console.error('Error syncing task:', error);
        res.status(500).json({ success: false, error: 'Failed to sync task', message: error.message });
    }
});

// DELETE soft delete task — enforce team scope
router.delete('/:id', requireAuth, blockContributors, requirePermission('qc.tasks.delete'), async (req, res, next) => {
    try {
        const { id } = req.params;

        const originalRes = await db.query('SELECT * FROM tasks WHERE id = $1', [id]);
        if (originalRes.rows.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }
        const original = originalRes.rows[0];

        // Enforce team scope for managers
        if (isTeamManagerRole(req.user.role)) {
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
                `SELECT * FROM tuleap_sync_config
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
            const deleted = refreshed.rows[0];
            await auditLog('tasks', id, 'DELETE', deleted, original, req.user?.email || 'system');
            triggerWorkflow('task-deleted', deleted);
            return res.json({
                success: true,
                message: `Task '${deleted.task_name}' has been deleted`,
                data: deleted,
            });
        }

        const result = await db.query(
            `UPDATE tasks SET deleted_at = NOW(), status = 'Canceled', updated_at = NOW()
             WHERE id = $1 RETURNING *`,
            [id]
        );

        const deleted = result.rows[0];
        await auditLog('tasks', id, 'DELETE', deleted, original, req.user?.email || 'system');
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
router.get('/:id/comments', requireAuth, blockContributors, requirePermission('qc.tasks.view'), async (req, res, next) => {
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
router.post('/:id/comments', requireAuth, blockContributors, requirePermission('qc.tasks.edit'), async (req, res, next) => {
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
router.delete('/:taskId/comments/:commentId', requireAuth, blockContributors, requirePermission('qc.tasks.delete'), async (req, res, next) => {
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

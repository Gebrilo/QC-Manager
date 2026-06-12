'use strict';

// Task fields whose change is worth a notification. NOTE: the column is
// `estimate_days` (not `estimate`), and assignee changes live in the
// task_resource_assignment junction (handled separately via dispatchTaskAssignment).
const TASK_SIGNIFICANT_FIELDS = ['status', 'estimate_days', 'completed_date'];

// recipients: returns an array of app_user ids related to the task.
// The acting user is removed later by the dispatcher.
async function taskRecipients({ entityId, after, db }) {
    const row = after || {};
    const out = [];

    if (row.created_by_user_id) out.push(row.created_by_user_id);

    const assignees = await db.query(
        `SELECT r.user_id
           FROM task_resource_assignment tra
           JOIN resources r ON r.id = tra.resource_id
          WHERE tra.task_id = $1 AND r.user_id IS NOT NULL AND r.deleted_at IS NULL`,
        [entityId]
    );
    for (const a of assignees.rows) out.push(a.user_id);

    if (row.project_id) {
        const pms = await db.query(
            'SELECT user_id FROM project_managers WHERE project_id = $1',
            [row.project_id]
        );
        for (const p of pms.rows) out.push(p.user_id);
    }

    return out;
}

function taskRender({ action, before, after, changedFields }) {
    const name = (after && after.task_name) || (before && before.task_name) || 'a task';
    if (action === 'CREATE') {
        return { type: 'task_created', title: 'New task created', message: `Task "${name}" was created.` };
    }
    if (action === 'DELETE') {
        return { type: 'task_deleted', title: 'Task deleted', message: `Task "${name}" was deleted.` };
    }
    const changed = (changedFields || []).filter(f => TASK_SIGNIFICANT_FIELDS.includes(f));
    if (changed.includes('status')) {
        return {
            type: 'task_status_changed',
            title: 'Task status changed',
            message: `Task "${name}" is now ${after && after.status}.`,
        };
    }
    return {
        type: 'task_updated',
        title: 'Task updated',
        message: `Task "${name}" was updated (${changed.join(', ') || 'changes'}).`,
    };
}

// Keyed by the audit entity_type string (the table name passed to auditLog).
const NOTIFICATION_POLICIES = {
    tasks: {
        entityType: 'task', // stored on the notification row + used for links/gating
        significantFields: TASK_SIGNIFICANT_FIELDS,
        recipients: taskRecipients,
        render: taskRender,
    },
};

module.exports = { NOTIFICATION_POLICIES, TASK_SIGNIFICANT_FIELDS };

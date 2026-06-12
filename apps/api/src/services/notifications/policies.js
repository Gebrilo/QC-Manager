'use strict';

// Task fields whose change is worth a notification. NOTE: the column is
// `estimate_days` (not `estimate`), and assignee changes live in the
// task_resource_assignment junction (handled separately via dispatchTaskAssignment).
const TASK_SIGNIFICANT_FIELDS = ['status', 'estimate_days', 'completed_date'];

// Bug fields whose change is worth a notification. The bug is a flat record
// (no junction for assignment), so assignee/severity/status are all just
// columns on the bug row. `assigned_to` is a text field (Tuleap username)
// and is matched against resources.resource_name to resolve the user.
const BUG_SIGNIFICANT_FIELDS = ['status', 'severity', 'assigned_to'];

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

// Bug recipients:
//   - reporter (immutable, stored as created_by_user_id on the bug row)
//   - current assignee: matched by `assigned_to` text → resources.resource_name
//   - project PMs
//   - all active team_managers, but ONLY when severity changed TO "Critical Impact"
// `changedFields` is provided by the dispatcher; the Critical rule is the
// only place it's inspected by a recipient function (tasks filter via
// significantFields in the dispatcher instead).
async function bugRecipients({ entityId, after, before, changedFields, db }) {
    const row = after || before || {};
    const out = [];

    if (row.created_by_user_id) out.push(row.created_by_user_id);

    if (row.assigned_to) {
        const a = await db.query(
            `SELECT user_id
               FROM resources
              WHERE resource_name = $1
                AND user_id IS NOT NULL
                AND deleted_at IS NULL
              LIMIT 1`,
            [row.assigned_to]
        );
        if (a.rows[0] && a.rows[0].user_id) out.push(a.rows[0].user_id);
    }

    if (row.project_id) {
        const pms = await db.query(
            'SELECT user_id FROM project_managers WHERE project_id = $1',
            [row.project_id]
        );
        for (const p of pms.rows) out.push(p.user_id);
    }

    const severityChangedToCritical =
        Array.isArray(changedFields) &&
        changedFields.includes('severity') &&
        row.severity === 'Critical Impact';
    if (severityChangedToCritical) {
        const tms = await db.query(
            `SELECT id FROM app_user WHERE role = 'team_manager' AND active = true`
        );
        for (const t of tms.rows) out.push(t.id);
    }

    return out;
}

function bugRender({ action, before, after, changedFields }) {
    const name = (after && after.title) || (before && before.title) || 'a bug';
    if (action === 'CREATE') {
        return { type: 'bug_created', title: 'New bug reported', message: `Bug "${name}" was reported.` };
    }
    if (action === 'DELETE') {
        return { type: 'bug_deleted', title: 'Bug deleted', message: `Bug "${name}" was deleted.` };
    }
    const changed = (changedFields || []).filter(f => BUG_SIGNIFICANT_FIELDS.includes(f));
    if (changed.includes('status')) {
        return {
            type: 'bug_status_changed',
            title: 'Bug status changed',
            message: `Bug "${name}" is now ${after && after.status}.`,
        };
    }
    if (changed.includes('severity')) {
        return {
            type: 'bug_severity_changed',
            title: 'Bug severity changed',
            message: `Bug "${name}" severity changed to ${after && after.severity}.`,
        };
    }
    if (changed.includes('assigned_to')) {
        return {
            type: 'bug_reassigned',
            title: 'Bug reassigned',
            message: `Bug "${name}" was reassigned.`,
        };
    }
    return {
        type: 'bug_updated',
        title: 'Bug updated',
        message: `Bug "${name}" was updated.`,
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
    bugs: {
        entityType: 'bug',
        significantFields: BUG_SIGNIFICANT_FIELDS,
        recipients: bugRecipients,
        render: bugRender,
    },
};

module.exports = { NOTIFICATION_POLICIES, TASK_SIGNIFICANT_FIELDS, BUG_SIGNIFICANT_FIELDS };

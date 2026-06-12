'use strict';

const db = require('../../config/db');
const { NOTIFICATION_POLICIES } = require('./policies');

// Low-level single insert. The ONLY place that writes notification rows.
async function insertNotification(row) {
    await db.query(
        `INSERT INTO notification
            (user_id, type, title, message, metadata, entity_type, entity_id, action, actor_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
            row.user_id,
            row.type,
            row.title,
            row.message || null,
            JSON.stringify(row.metadata || {}),
            row.entity_type || null,
            row.entity_id || null,
            row.action || null,
            row.actor_id || null,
        ]
    );
}

async function insertMany(recipientIds, payload) {
    for (const userId of recipientIds) {
        await insertNotification({ ...payload, user_id: userId });
    }
}

// Resolve the acting user's id from the email auditLog was given.
// 'system' / empty → null (nobody is excluded, no actor recorded).
async function resolveActorId(actorEmail) {
    if (!actorEmail || actorEmail === 'system') return null;
    const r = await db.query('SELECT id FROM app_user WHERE email = $1', [actorEmail]);
    return r.rows[0] ? r.rows[0].id : null;
}

// Called (fire-and-forget) from auditLog after the audit row is written.
async function dispatchFromAudit({ entityType, entityId, action, before, after, changedFields, actorEmail }) {
    const policy = NOTIFICATION_POLICIES[entityType];
    if (!policy) return; // unmapped entity → no notification

    // Significant-field gating applies to UPDATE only; CREATE/DELETE always pass.
    if (action === 'UPDATE') {
        const sig = policy.significantFields || [];
        const hit = (changedFields || []).some(f => sig.includes(f));
        if (!hit) return;
    }

    const actorId = await resolveActorId(actorEmail);

    let recipients = await policy.recipients({ entityId, before, after, db });
    recipients = [...new Set(recipients.filter(Boolean))].filter(id => id !== actorId);
    if (recipients.length === 0) return;

    const { type, title, message } = policy.render({ action, before, after, changedFields });
    await insertMany(recipients, {
        type, title, message,
        entity_type: policy.entityType,
        entity_id: entityId,
        action,
        actor_id: actorId,
    });
}

// Explicit (non-CRUD-shaped) event: a task's assignment set changed via PATCH.
// Reassignment lives in the junction, so it never appears in the audit diff.
async function dispatchTaskAssignment(taskId, actorEmail) {
    try {
        const t = await db.query(
            'SELECT id, task_name, project_id, created_by_user_id FROM tasks WHERE id = $1',
            [taskId]
        );
        if (t.rows.length === 0) return;
        const after = t.rows[0];

        const policy = NOTIFICATION_POLICIES.tasks;
        const actorId = await resolveActorId(actorEmail);
        let recipients = await policy.recipients({ entityId: taskId, after, db });
        recipients = [...new Set(recipients.filter(Boolean))].filter(id => id !== actorId);
        if (recipients.length === 0) return;

        await insertMany(recipients, {
            type: 'task_assigned',
            title: 'Task assignment changed',
            message: `Assignments changed on task "${after.task_name}".`,
            entity_type: 'task',
            entity_id: taskId,
            action: 'ASSIGN',
            actor_id: actorId,
        });
    } catch (err) {
        console.error('dispatchTaskAssignment error:', err.message);
    }
}

module.exports = {
    insertNotification,
    resolveActorId,
    dispatchFromAudit,
    dispatchTaskAssignment,
};

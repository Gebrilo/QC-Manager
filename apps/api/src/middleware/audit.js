const db = require('../config/db');
const { dispatchFromAudit } = require('../services/notifications/dispatcher');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Audit Log Middleware
 * @param {string} entityType - Table name (e.g., 'projects', 'tasks')
 * @param {string} entityId - UUID or string key of the entity
 * @param {string} action - 'CREATE', 'UPDATE', 'DELETE'
 * @param {Object} afterState - Full record state after change (or null for DELETE)
 * @param {Object} beforeState - Full record state before change (or null for CREATE)
 * @param {string} userEmail - User who performed action (default: 'system')
 */
const auditLog = async (entityType, entityId, action, afterState = null, beforeState = null, userEmail = 'system') => {
    try {
        // Calculate changed fields if update
        let changedFields = [];
        if (action === 'UPDATE' && beforeState && afterState) {
            const allKeys = new Set([...Object.keys(beforeState), ...Object.keys(afterState)]);
            allKeys.forEach(key => {
                if (JSON.stringify(beforeState[key]) !== JSON.stringify(afterState[key])) {
                    changedFields.push(key);
                }
            });
        }

        const summary = `${action} ${entityType} ${entityId}`;

        // UUID entities go in entity_uuid; non-UUID (e.g. custom_roles.name)
        // go in entity_key so we don't lose audit history for string-PK tables.
        const isUuid = typeof entityId === 'string' && UUID_PATTERN.test(entityId);

        await db.query(
            `INSERT INTO audit_log (
                entity_type, entity_uuid, entity_id, entity_key, action,
                before_state, after_state, changed_fields,
                details, change_summary, user_email
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
                entityType,
                isUuid ? entityId : null,
                isUuid ? entityId : null,
                isUuid ? null : String(entityId),
                action,
                beforeState ? JSON.stringify(beforeState) : null,
                afterState ? JSON.stringify(afterState) : null,
                changedFields,
                afterState || beforeState ? JSON.stringify(afterState || beforeState) : null,
                summary,
                userEmail
            ]
        );

        // Fire-and-forget: never block or fail the request on notification work.
        dispatchFromAudit({
            entityType,
            entityId,
            action,
            before: beforeState,
            after: afterState,
            changedFields,
            actorEmail: userEmail,
        }).catch(err => console.error('Notification dispatch error:', err.message));
    } catch (err) {
        console.error('Audit Log Error:', err);
    }
};

const auditMiddleware = (req, res, next) => {
    req.audit = auditLog;
    next();
};

module.exports = {
    auditLog,
    auditMiddleware
};

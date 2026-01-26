const db = require('../config/db');

/**
 * Audit Log Middleware
 * @param {string} entityType - Table name (e.g., 'projects', 'tasks')
 * @param {string} entityId - UUID of the entity
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

        await db.query(
            `INSERT INTO audit_log (
                entity_type, entity_uuid, action, 
                before_state, after_state, changed_fields, 
                change_summary, user_email
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                entityType,
                entityId,
                action,
                beforeState ? JSON.stringify(beforeState) : null,
                afterState ? JSON.stringify(afterState) : null,
                changedFields,
                summary,
                userEmail
            ]
        );
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

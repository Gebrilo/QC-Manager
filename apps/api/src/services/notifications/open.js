'use strict';

const { gateEntity } = require('../../access/artifactLoaders');
const { buildLink } = require('./links');

// notification: { entity_type, entity_id }
// → { status: 'ok'|'forbidden'|'gone'|'info', href: string|null }
async function resolveNotificationTarget(user, notification, req) {
    const { entity_type: entityType, entity_id: entityId } = notification || {};
    if (!entityType || !entityId) return { status: 'info', href: null };

    const gate = await gateEntity(entityType, entityId, user, req);
    if (gate.status === 'ok') {
        return { status: 'ok', href: buildLink(entityType, entityId) };
    }
    return { status: gate.status, href: null };
}

module.exports = { resolveNotificationTarget };

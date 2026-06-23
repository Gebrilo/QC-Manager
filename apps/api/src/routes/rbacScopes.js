'use strict';

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth, requirePermission } = require('../middleware/authMiddleware');
const { ALL_SCOPE_VALUES } = require('../../../shared/rbac/catalog.ts');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isKnownScope(scopeKey) {
    return typeof scopeKey === 'string' && ALL_SCOPE_VALUES.includes(scopeKey);
}

function uniqueScopeList(scopes) {
    if (!Array.isArray(scopes)) return null;
    const known = scopes.filter(isKnownScope);
    if (known.length !== scopes.length) return null;
    return [...new Set(known)];
}

async function listRoleScopes(roleIdentifier) {
    const result = await db.query(
        'SELECT scope_key FROM role_scopes WHERE role_identifier = $1 ORDER BY scope_key',
        [roleIdentifier]
    );
    return result.rows.map(r => r.scope_key);
}

async function replaceRoleScopes(roleIdentifier, scopeKeys, actorEmail) {
    await db.query('DELETE FROM role_scopes WHERE role_identifier = $1', [roleIdentifier]);
    for (const scopeKey of scopeKeys) {
        await db.query(
            `INSERT INTO role_scopes (role_identifier, scope_key, granted_by)
             VALUES ($1, $2, $3)
             ON CONFLICT (role_identifier, scope_key) DO UPDATE SET granted_by = EXCLUDED.granted_by`,
            [roleIdentifier, scopeKey, actorEmail]
        );
    }
}

async function listUserScopes(userId) {
    const result = await db.query(
        'SELECT scope_key, granted FROM user_scopes WHERE user_id = $1 ORDER BY scope_key',
        [userId]
    );
    return result.rows;
}

async function replaceUserScopes(userId, scopeEntries, actorEmail) {
    await db.query('DELETE FROM user_scopes WHERE user_id = $1', [userId]);
    for (const entry of scopeEntries) {
        await db.query(
            `INSERT INTO user_scopes (user_id, scope_key, granted)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, scope_key) DO UPDATE
             SET granted = EXCLUDED.granted, updated_at = CURRENT_TIMESTAMP`,
            [userId, entry.scope_key, entry.granted]
        );
    }
}

async function auditScopeChange(client, payload) {
    await client.query(
        `INSERT INTO audit_log (
            entity_type, action, before_state, after_state, changed_fields, change_summary, user_email
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
            payload.entityType,
            'rbac_scope_audit',
            JSON.stringify(payload.before || {}),
            JSON.stringify(payload.after || {}),
            payload.changedFields || ['scopes'],
            payload.summary,
            payload.actorEmail || 'system',
        ]
    );
}

router.get('/scopes/role/:roleIdentifier', requireAuth, requirePermission('qc.admin.manage_permissions'), async (req, res, next) => {
    try {
        const roleIdentifier = String(req.params.roleIdentifier || '').toLowerCase();
        if (!roleIdentifier) {
            return res.status(400).json({ error: 'roleIdentifier is required' });
        }
        const scopes = await listRoleScopes(roleIdentifier);
        res.json({ role_identifier: roleIdentifier, scopes, known_scopes: ALL_SCOPE_VALUES });
    } catch (err) {
        next(err);
    }
});

router.put('/scopes/role/:roleIdentifier', requireAuth, requirePermission('qc.admin.manage_permissions'), async (req, res, next) => {
    try {
        const roleIdentifier = String(req.params.roleIdentifier || '').toLowerCase();
        const scopeKeys = uniqueScopeList(req.body.scopes);
        if (!scopeKeys) {
            return res.status(400).json({ error: 'scopes must be an array of known scope keys' });
        }

        const before = await listRoleScopes(roleIdentifier);
        const actorEmail = req.user?.email || 'system';
        await replaceRoleScopes(roleIdentifier, scopeKeys, actorEmail);
        await auditScopeChange(db, {
            entityType: 'role_scope',
            before: { scopes: before },
            after: { scopes: scopeKeys },
            changedFields: ['scopes'],
            summary: `Replaced role_scopes for ${roleIdentifier} (${before.length} -> ${scopeKeys.length})`,
            actorEmail,
        });

        res.json({ role_identifier: roleIdentifier, scopes: scopeKeys, before_scopes: before });
    } catch (err) {
        next(err);
    }
});

router.get('/scopes/user/:userId', requireAuth, requirePermission('qc.admin.manage_permissions'), async (req, res, next) => {
    try {
        const userId = String(req.params.userId || '');
        if (!UUID_PATTERN.test(userId)) {
            return res.status(400).json({ error: 'userId must be a UUID' });
        }
        const userCheck = await db.query('SELECT id FROM app_user WHERE id = $1', [userId]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: `User '${userId}' not found` });
        }
        const scopes = await listUserScopes(userId);
        res.json({ user_id: userId, scopes, known_scopes: ALL_SCOPE_VALUES });
    } catch (err) {
        next(err);
    }
});

router.put('/scopes/user/:userId', requireAuth, requirePermission('qc.admin.manage_permissions'), async (req, res, next) => {
    try {
        const userId = String(req.params.userId || '');
        if (!UUID_PATTERN.test(userId)) {
            return res.status(400).json({ error: 'userId must be a UUID' });
        }
        if (!Array.isArray(req.body.scopes)) {
            return res.status(400).json({ error: 'scopes must be an array of {scope_key, granted} entries' });
        }
        const entries = [];
        for (const item of req.body.scopes) {
            const key = item && (item.scope_key || item.scopeKey || item.key);
            if (!isKnownScope(key)) continue;
            const granted = item.granted !== false;
            entries.push({ scope_key: key, granted });
        }
        if (entries.length !== req.body.scopes.length) {
            return res.status(400).json({ error: 'one or more scopes are not in the known scope vocabulary' });
        }

        const userCheck = await db.query('SELECT id FROM app_user WHERE id = $1', [userId]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: `User '${userId}' not found` });
        }

        const before = await listUserScopes(userId);
        const actorEmail = req.user?.email || 'system';
        await replaceUserScopes(userId, entries, actorEmail);
        await auditScopeChange(db, {
            entityType: 'user_scope',
            before: { scopes: before },
            after: { scopes: entries },
            changedFields: ['scopes'],
            summary: `Replaced user_scopes for ${userId} (${before.length} -> ${entries.length})`,
            actorEmail,
        });

        res.json({ user_id: userId, scopes: entries, before_scopes: before });
    } catch (err) {
        next(err);
    }
});

module.exports = router;

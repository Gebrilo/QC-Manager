'use strict';

const db = require('../../config/db');
const FeatureFlagReader = require('../../access/FeatureFlagReader');
const AccessEngine = require('../../access/AccessEngine');
const RoleResolver = require('../../access/RoleResolver');

const FLAG_BY_ARTIFACT = Object.freeze({
    user_story: 'access_engine.user_stories',
    test_execution: 'access_engine.test_executions',
    test_suite: 'access_engine.test_suites',
});

const DEFAULT_ACTIONS = Object.freeze(['edit', 'delete', 'assign', 'comment']);

function flagKeyFor(artifactType) {
    return FLAG_BY_ARTIFACT[artifactType] || `access_engine.${artifactType}`;
}

function canEvaluateAccessEngine() {
    return typeof db.query === 'function';
}

function hasAccessActor(req) {
    return Boolean(req.user && req.user.id && req.user.role);
}

function normalizeArtifact(artifactType, row, overrides = {}) {
    return {
        type: artifactType,
        id: row.id,
        project_id: row.project_id,
        owner_team_id: row.owner_team_id,
        visibility_scope: row.visibility_scope,
        owner_user_id: row.created_by_user_id || row.created_by || row.executed_by,
        assignee_user_id: row.assigned_to,
        assignee_resource_id: row.resource1_id || row.resource2_id || row.owner_resource_id || row.submitted_by_resource_id,
        ...overrides,
    };
}

async function isEnabled(req, artifactType) {
    if (!hasAccessActor(req) || !canEvaluateAccessEngine()) return false;
    try {
        return await FeatureFlagReader.isEnabled(flagKeyFor(artifactType), req);
    } catch (err) {
        console.error('[access:enforcement:flag]', err.message);
        return false;
    }
}

async function logAuditEvent({ req, entityType, entityId, action, details, reason }) {
    try {
        await db.query(
            `INSERT INTO audit_log (entity_type, entity_uuid, entity_id, action, user_id, details, change_summary, user_email)
             VALUES ($1, $2, $2, $3, $4, $5, $6, $7)`,
            [
                entityType,
                entityId || null,
                action,
                req.user?.id || null,
                JSON.stringify({ ...details, reason }),
                `${action} ${entityType}${entityId ? ` ${entityId}` : ''}`,
                req.user?.email || 'system',
            ]
        );
    } catch (err) {
        console.error('[access:enforcement:audit]', err.message);
    }
}

async function logShadowDisagreement(req, payload) {
    await logAuditEvent({
        req,
        entityType: 'shadow_disagreement',
        entityId: payload.artifact_id || null,
        action: 'ACCESS_ENGINE_SHADOW_DISAGREEMENT',
        details: payload,
    });
}

async function logDenial(req, artifactType, artifactId, verb, result) {
    await logAuditEvent({
        req,
        entityType: artifactType,
        entityId: artifactId || null,
        action: 'ACCESS_DENIED',
        reason: result.reason,
        details: {
            artifact_type: artifactType,
            artifact_id: artifactId || null,
            verb,
            branch: result.branch || null,
        },
    });
}

async function enforceArtifact(req, res, artifactType, row, verb, opts = {}) {
    if (!hasAccessActor(req) || !canEvaluateAccessEngine()) {
        return { allowed: true, enabled: false, result: { allowed: true, branch: 'legacy_no_engine' } };
    }

    const artifact = normalizeArtifact(artifactType, row, opts.artifact || {});
    const enabled = await isEnabled(req, artifactType);
    let result;
    try {
        result = await AccessEngine.canPerform(req.user, artifact, verb, req);
    } catch (err) {
        console.error('[access:enforcement:evaluate]', err.message);
        return { allowed: true, enabled: false, result: { allowed: true, branch: 'legacy_engine_error' } };
    }
    const legacyResult = opts.legacyResult === undefined ? true : Boolean(opts.legacyResult);

    if (!enabled) {
        if (legacyResult !== result.allowed) {
            await logShadowDisagreement(req, {
                artifact_type: artifactType,
                artifact_id: artifact.id,
                route: opts.route || req.originalUrl,
                legacy_result: legacyResult,
                engine_result: result.allowed,
                branch: result.branch || result.reason || null,
            });
        }
        return { allowed: legacyResult, enabled, result };
    }

    if (!result.allowed) {
        await logDenial(req, artifactType, artifact.id, verb, result);
        res.status(403).json({ error: 'Access denied', reason: result.reason });
        return { allowed: false, enabled, result };
    }

    return { allowed: true, enabled, result };
}

async function appendListFilter(req, artifactType, whereClauses, params, opts = {}) {
    if (!hasAccessActor(req) || !canEvaluateAccessEngine()) return { enabled: false, nextIdx: opts.startIdx || params.length + 1 };
    const enabled = await isEnabled(req, artifactType);
    if (!enabled) return { enabled, nextIdx: opts.startIdx || params.length + 1 };

    const filter = await AccessEngine.buildListFilter(req.user, artifactType, 'view', {
        req,
        startIdx: opts.startIdx || params.length + 1,
        tableAlias: opts.tableAlias,
        projectExpr: opts.projectExpr,
        ownerTeamExpr: opts.ownerTeamExpr,
        visibilityExpr: opts.visibilityExpr,
        assigneeResourceExprs: opts.assigneeResourceExprs,
        userExprs: opts.userExprs,
    });
    whereClauses.push(filter.clause);
    params.push(...filter.params);
    return { enabled, nextIdx: filter.nextIdx };
}

async function decorateRows(req, artifactType, rows, opts = {}) {
    if (!hasAccessActor(req) || !canEvaluateAccessEngine()) return rows.map(row => ({ ...row, _can: {} }));

    const resolvedUser = await RoleResolver.resolve(req.user, req);
    const actions = opts.actions || DEFAULT_ACTIONS;
    const artifactOverrides = opts.artifact || (() => ({}));

    return Promise.all(rows.map(async (row) => {
        const artifact = normalizeArtifact(
            artifactType,
            row,
            typeof artifactOverrides === 'function' ? artifactOverrides(row) : artifactOverrides
        );
        const _can = {};
        for (const action of actions) {
            const verb = action === 'comment' ? 'view' : action;
            const result = await AccessEngine.canPerform(req.user, artifact, verb, req);
            _can[action] = Boolean(result.allowed);
        }
        return AccessEngine.filterFields(resolvedUser, artifactType, { ...row, _can });
    }));
}

async function shadowList(req, artifactType, rows, opts = {}) {
    if (!hasAccessActor(req) || !canEvaluateAccessEngine() || await isEnabled(req, artifactType)) return;

    await Promise.all(rows.map(async (row) => {
        const artifact = normalizeArtifact(
            artifactType,
            row,
            typeof opts.artifact === 'function' ? opts.artifact(row) : (opts.artifact || {})
        );
        let result;
        try {
            result = await AccessEngine.canPerform(req.user, artifact, 'view', req);
        } catch (err) {
            console.error('[access:enforcement:shadow]', err.message);
            return;
        }
        if (!result.allowed) {
            await logShadowDisagreement(req, {
                artifact_type: artifactType,
                artifact_id: artifact.id,
                route: opts.route || req.originalUrl,
                legacy_result: true,
                engine_result: false,
                branch: result.reason || null,
            });
        }
    }));
}

module.exports = {
    appendListFilter,
    decorateRows,
    enforceArtifact,
    flagKeyFor,
    logDenial,
    shadowList,
};

const express = require('express');
const db = require('../config/db');
const pool = db.pool;
const { requireAuth } = require('../middleware/authMiddleware');
const { auditLog } = require('../middleware/audit');
const {
    getAllowedRelationshipTypes,
    getDefaultRelationshipType,
    isAllowedRelationshipType,
} = require('../utils/linkRelationships');
const { canPerform } = require('../access/AccessEngine');
const { ARTIFACT_GATES } = require('../access/artifactLoaders');

const TABLES = {
    tasks: { table: 'tasks', key: 'task_id', title: 'task_name', deleted: true, artifactType: 'task', notFound: 'Task not found' },
    bugs: { table: 'bugs', key: 'bug_id', title: 'title', deleted: true, artifactType: 'bug', notFound: 'Bug not found' },
    test_case: { table: 'test_case', key: 'test_case_id', title: 'title', deleted: true, artifactType: 'test_case', notFound: 'Test case not found' },
    user_stories: { table: 'user_stories', key: null, title: 'title', deleted: true, artifactType: 'user_story', notFound: 'User story not found' },
};

const pairs = [
    { table: 'task_test_cases', fromCol: 'task_id', fromRef: 'tasks', fromLabel: 'task', toCol: 'test_case_id', toRef: 'test_case', toLabel: 'test-case', relDefault: getDefaultRelationshipType('task_test_cases') },
    { table: 'bug_test_cases', fromCol: 'bug_id', fromRef: 'bugs', fromLabel: 'bug', toCol: 'test_case_id', toRef: 'test_case', toLabel: 'test-case', relDefault: getDefaultRelationshipType('bug_test_cases') },
    { table: 'bug_tasks', fromCol: 'bug_id', fromRef: 'bugs', fromLabel: 'bug', toCol: 'task_id', toRef: 'tasks', toLabel: 'task', relDefault: getDefaultRelationshipType('bug_tasks') },
    { table: 'bug_user_stories', fromCol: 'bug_id', fromRef: 'bugs', fromLabel: 'bug', toCol: 'user_story_id', toRef: 'user_stories', toLabel: 'user-story', relDefault: getDefaultRelationshipType('bug_user_stories') },
    { table: 'test_case_user_stories', fromCol: 'test_case_id', fromRef: 'test_case', fromLabel: 'test-case', toCol: 'user_story_id', toRef: 'user_stories', toLabel: 'user-story', relDefault: getDefaultRelationshipType('test_case_user_stories') },
];

function displayExpr(alias, ref) {
    if (ref === 'user_stories') return `COALESCE('US-' || ${alias}.tuleap_artifact_id::text, ${alias}.id::text)`;
    return `${alias}.${TABLES[ref].key}`;
}

function fields(alias, ref, label) {
    const meta = TABLES[ref];
    const fieldPrefix = label.replace(/-/g, '_');
    const extras = [];
    if (ref === 'tasks') {
        extras.push(`${alias}.task_name AS task_name`, `${alias}.project_id AS project_id`);
    }
    if (ref === 'test_case') {
        extras.push(`${alias}.priority AS test_case_priority`);
    }
    return `${displayExpr(alias, ref)} AS "${fieldPrefix}_display_id",
            ${alias}.${meta.title} AS "${fieldPrefix}_title",
            ${alias}.status AS "${fieldPrefix}_status",
            ${alias}.project_id AS "${fieldPrefix}_project_id"
            ${extras.length ? `, ${extras.join(', ')}` : ''}`;
}

function pluralPath(label) {
    if (label === 'user-story') return 'user-stories';
    return `${label}s`;
}

async function getArtifact(ref, id, user, req) {
    const gate = ARTIFACT_GATES[TABLES[ref].artifactType];
    return gate ? gate.load(id, user, req) : null;
}

async function authorizeArtifact(req, res, artifact, verb) {
    const result = await canPerform(req.user, artifact, verb, req);
    if (!result.allowed) {
        res.status(403).json({ error: 'Access denied', reason: result.reason });
        return false;
    }
    return true;
}

function isCrossProject(own, other) {
    return (own.project_id || null) !== (other.project_id || null);
}

function artifactIdentity(ref, artifact, id) {
    return {
        type: artifact?.type || TABLES[ref].artifactType,
        id: artifact?.id || id,
        display_id: artifact?.display_id || artifact?.id || id,
        title: artifact?.title || null,
    };
}

function linkAuditPayload({ pair, link, action, artifact, counterpart, direction, req, occurredAt }) {
    return {
        event_type: 'artifact_link',
        action,
        link_table: pair.table,
        link_id: link.id,
        relationship_type: link.relationship_type || pair.relDefault,
        source: link.source || 'qc',
        actor_id: req.user?.id || null,
        actor_email: req.user?.email || null,
        occurred_at: occurredAt,
        artifact,
        counterpart,
        direction,
    };
}

async function auditLinkForArtifacts(pair, link, action, fromArtifact, toArtifact, req) {
    const occurredAt = new Date().toISOString();
    const actorEmail = req.user?.email || 'system';
    const fromIdentity = artifactIdentity(pair.fromRef, fromArtifact, link[pair.fromCol]);
    const toIdentity = artifactIdentity(pair.toRef, toArtifact, link[pair.toCol]);
    const afterForCreate = action === 'CREATE';

    const fromPayload = linkAuditPayload({
        pair,
        link,
        action,
        artifact: fromIdentity,
        counterpart: toIdentity,
        direction: 'from',
        req,
        occurredAt,
    });
    await auditLog(
        fromIdentity.type,
        fromIdentity.id,
        action,
        afterForCreate ? fromPayload : null,
        afterForCreate ? null : fromPayload,
        actorEmail
    );

    const toPayload = linkAuditPayload({
        pair,
        link,
        action,
        artifact: toIdentity,
        counterpart: fromIdentity,
        direction: 'to',
        req,
        occurredAt,
    });
    await auditLog(
        toIdentity.type,
        toIdentity.id,
        action,
        afterForCreate ? toPayload : null,
        afterForCreate ? null : toPayload,
        actorEmail
    );
}

function addRoutes(router, pair, side) {
    const isFrom = side === 'from';
    const ownRef = isFrom ? pair.fromRef : pair.toRef;
    const otherRef = isFrom ? pair.toRef : pair.fromRef;
    const ownCol = isFrom ? pair.fromCol : pair.toCol;
    const otherCol = isFrom ? pair.toCol : pair.fromCol;
    const otherLabel = isFrom ? pair.toLabel : pair.fromLabel;
    const otherPath = pluralPath(otherLabel);
    const otherFields = fields(isFrom ? 'other' : 'other', otherRef, otherLabel);
    const ownMeta = TABLES[ownRef];
    const otherMeta = TABLES[otherRef];
    const ownParam = 'id';
    const otherParam = otherCol.replace(/_id$/, 'Id').replace(/_([a-z])/g, (_, c) => c.toUpperCase());

    router.get(`/:${ownParam}/${otherPath}`, requireAuth, async (req, res, next) => {
        try {
            const ownId = req.params[ownParam];
            const own = await getArtifact(ownRef, ownId, req.user, req);
            if (!own) return res.status(404).json({ error: ownMeta.notFound });
            if (!(await authorizeArtifact(req, res, own, 'view'))) return;

            const result = await pool.query(
                `SELECT lk.id, lk.${pair.fromCol}, lk.${pair.toCol}, lk.relationship_type, lk.source, lk.created_at,
                        ${otherFields}
                 FROM ${pair.table} lk
                 JOIN ${otherMeta.table} other ON other.id = lk.${otherCol}
                 WHERE lk.${ownCol} = $1
                   ${otherMeta.deleted ? 'AND other.deleted_at IS NULL' : ''}
                 ORDER BY lk.created_at DESC`,
                [ownId]
            );
            res.json({ data: result.rows });
        } catch (err) {
            next(err);
        }
    });

    router.post(`/:${ownParam}/${otherPath}`, requireAuth, async (req, res, next) => {
        try {
            const ownId = req.params[ownParam];
            const otherId = req.body[otherCol];
            const relationshipType = req.body.relationship_type ?? pair.relDefault;
            if (!otherId) return res.status(400).json({ error: `${otherCol} is required` });
            if (!isAllowedRelationshipType(pair.table, relationshipType)) {
                return res.status(422).json({
                    error: 'Invalid relationship_type',
                    allowed: getAllowedRelationshipTypes(pair.table),
                });
            }

            const own = await getArtifact(ownRef, ownId, req.user, req);
            if (!own) return res.status(404).json({ error: ownMeta.notFound });
            if (!(await authorizeArtifact(req, res, own, 'edit'))) return;
            const other = await getArtifact(otherRef, otherId, req.user, req);
            if (!other) return res.status(404).json({ error: otherMeta.notFound });
            if (!(await authorizeArtifact(req, res, other, 'view'))) return;
            if (isCrossProject(own, other)) {
                return res.status(422).json({ error: 'Cross-project link rejected' });
            }

            const fromId = isFrom ? ownId : otherId;
            const toId = isFrom ? otherId : ownId;
            const result = await pool.query(
                `INSERT INTO ${pair.table} (${pair.fromCol}, ${pair.toCol}, relationship_type, source, created_by)
                 VALUES ($1, $2, $3, 'qc', $4)
                 ON CONFLICT (${pair.fromCol}, ${pair.toCol}) DO UPDATE
                 SET relationship_type = EXCLUDED.relationship_type
                 RETURNING *`,
                [fromId, toId, relationshipType, req.user?.id || null]
            );

            if (pair.fromRef === 'bugs' || pair.toRef === 'bugs') {
                const bugId = pair.fromRef === 'bugs' ? fromId : toId;
                await pool.query(`UPDATE bugs SET triage_status = 'triaged', updated_at = NOW() WHERE id = $1 AND triage_status = 'untriaged'`, [bugId]);
            }

            await auditLog(pair.table, result.rows[0].id, 'CREATE', result.rows[0], null, req.user?.email || 'system');
            await auditLinkForArtifacts(
                pair,
                result.rows[0],
                'CREATE',
                isFrom ? own : other,
                isFrom ? other : own,
                req
            );
            res.status(201).json({ data: result.rows[0] });
        } catch (err) {
            next(err);
        }
    });

    router.delete(`/:${ownParam}/${otherPath}/:${otherParam}`, requireAuth, async (req, res, next) => {
        try {
            const ownId = req.params[ownParam];
            const otherId = req.params[otherParam];
            const own = await getArtifact(ownRef, ownId, req.user, req);
            if (!own) return res.status(404).json({ error: ownMeta.notFound });
            if (!(await authorizeArtifact(req, res, own, 'edit'))) return;

            const fromId = isFrom ? ownId : otherId;
            const toId = isFrom ? otherId : ownId;

            const result = await pool.query(
                `DELETE FROM ${pair.table}
                 WHERE ${pair.fromCol} = $1 AND ${pair.toCol} = $2 AND (source = 'qc' OR source IS NULL)
                 RETURNING *`,
                [fromId, toId]
            );
            if (result.rows.length === 0) {
                const existing = await pool.query(`SELECT source FROM ${pair.table} WHERE ${pair.fromCol} = $1 AND ${pair.toCol} = $2`, [fromId, toId]);
                if (existing.rows[0]?.source === 'tuleap') {
                    return res.status(403).json({ error: 'Cannot delete Tuleap-sourced link from QC UI' });
                }
                return res.status(404).json({ error: 'Link not found' });
            }

            const other = await getArtifact(otherRef, otherId, req.user, req);
            await auditLog(pair.table, result.rows[0].id, 'DELETE', null, result.rows[0], req.user?.email || 'system');
            await auditLinkForArtifacts(
                pair,
                result.rows[0],
                'DELETE',
                isFrom ? own : other,
                isFrom ? other : own,
                req
            );
            res.json({ success: true, message: 'Link removed' });
        } catch (err) {
            next(err);
        }
    });
}

const taskSide = express.Router();
const testCaseSide = express.Router();
const bugSide = express.Router();
const userStorySide = express.Router();

for (const pair of pairs) {
    if (pair.fromRef === 'tasks') addRoutes(taskSide, pair, 'from');
    if (pair.toRef === 'tasks') addRoutes(taskSide, pair, 'to');
    if (pair.fromRef === 'test_case') addRoutes(testCaseSide, pair, 'from');
    if (pair.toRef === 'test_case') addRoutes(testCaseSide, pair, 'to');
    if (pair.fromRef === 'bugs') addRoutes(bugSide, pair, 'from');
    if (pair.toRef === 'bugs') addRoutes(bugSide, pair, 'to');
    if (pair.fromRef === 'user_stories') addRoutes(userStorySide, pair, 'from');
    if (pair.toRef === 'user_stories') addRoutes(userStorySide, pair, 'to');
}

module.exports = { taskSide, testCaseSide, bugSide, userStorySide };

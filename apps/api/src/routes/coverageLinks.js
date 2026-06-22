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
const { dispatchLinkNotification } = require('../services/notifications/dispatcher');
const { resolveArtifactParam } = require('../middleware/resolveArtifactParam');

const TABLES = {
    tasks: { table: 'tasks', key: 'task_id', title: 'task_name', deleted: true, artifactType: 'task', notFound: 'Task not found' },
    bugs: { table: 'bugs', key: 'bug_id', title: 'title', deleted: true, artifactType: 'bug', notFound: 'Bug not found' },
    test_case: { table: 'test_case', key: 'test_case_id', title: 'title', deleted: true, artifactType: 'test_case', notFound: 'Test case not found' },
    user_stories: { table: 'user_stories', key: null, title: 'title', deleted: true, artifactType: 'user_story', notFound: 'User story not found' },
    test_suites: { table: 'test_suites', key: 'suite_id', title: 'name', deleted: true, artifactType: 'test_suite', notFound: 'Test suite not found' },
    test_run: { table: 'test_run', key: 'run_id', title: 'name', deleted: true, artifactType: 'test_run', notFound: 'Test run not found' },
};

const pairs = [
    { table: 'task_test_cases', fromCol: 'task_id', fromRef: 'tasks', fromLabel: 'task', toCol: 'test_case_id', toRef: 'test_case', toLabel: 'test-case', relDefault: getDefaultRelationshipType('task_test_cases') },
    { table: 'bug_test_cases', fromCol: 'bug_id', fromRef: 'bugs', fromLabel: 'bug', toCol: 'test_case_id', toRef: 'test_case', toLabel: 'test-case', relDefault: getDefaultRelationshipType('bug_test_cases') },
    { table: 'bug_tasks', fromCol: 'bug_id', fromRef: 'bugs', fromLabel: 'bug', toCol: 'task_id', toRef: 'tasks', toLabel: 'task', relDefault: getDefaultRelationshipType('bug_tasks') },
    { table: 'bug_user_stories', fromCol: 'bug_id', fromRef: 'bugs', fromLabel: 'bug', toCol: 'user_story_id', toRef: 'user_stories', toLabel: 'user-story', relDefault: getDefaultRelationshipType('bug_user_stories') },
    { table: 'test_case_user_stories', fromCol: 'test_case_id', fromRef: 'test_case', fromLabel: 'test-case', toCol: 'user_story_id', toRef: 'user_stories', toLabel: 'user-story', relDefault: getDefaultRelationshipType('test_case_user_stories') },
    { table: 'story_suites', fromCol: 'user_story_id', fromRef: 'user_stories', fromLabel: 'user-story', toCol: 'test_suite_id', toRef: 'test_suites', toLabel: 'test-suite', relDefault: getDefaultRelationshipType('story_suites') },
    { table: 'story_runs', fromCol: 'user_story_id', fromRef: 'user_stories', fromLabel: 'user-story', toCol: 'test_run_id', toRef: 'test_run', toLabel: 'test-run', relDefault: getDefaultRelationshipType('story_runs') },
    { table: 'task_runs', fromCol: 'task_id', fromRef: 'tasks', fromLabel: 'task', toCol: 'test_run_id', toRef: 'test_run', toLabel: 'test-run', relDefault: getDefaultRelationshipType('task_runs') },
    { table: 'bug_runs', fromCol: 'bug_id', fromRef: 'bugs', fromLabel: 'bug', toCol: 'test_run_id', toRef: 'test_run', toLabel: 'test-run', relDefault: getDefaultRelationshipType('bug_runs') },
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
        // Legacy unprefixed columns kept for backward compat with older callers.
        extras.push(`${alias}.task_name AS task_name`, `${alias}.project_id AS project_id`);
        extras.push(`${alias}.priority AS ${fieldPrefix}_priority`);
        // task assignee: PRIMARY (or first) row in task_resource_assignment → resources.user_id → app_user.name
        extras.push(`(
            SELECT u.name
              FROM task_resource_assignment tra
              JOIN resources r ON r.id = tra.resource_id
              LEFT JOIN app_user u ON u.id = r.user_id
             WHERE tra.task_id = ${alias}.id
               AND r.user_id IS NOT NULL
               AND r.deleted_at IS NULL
             ORDER BY (tra.assignment_type = 'PRIMARY') DESC, tra.created_at, tra.id
             LIMIT 1
        ) AS ${fieldPrefix}_assignee_name`);
    }
    if (ref === 'test_case') {
        extras.push(`${alias}.priority AS ${fieldPrefix}_priority`);
        // test_case.assigned_to is a UUID app_user.id directly (not a resource).
        extras.push(`(SELECT u.name FROM app_user u WHERE u.id = ${alias}.assigned_to) AS ${fieldPrefix}_assignee_name`);
    }
    if (ref === 'bugs') {
        // Surface severity as the bug's "priority" — it's the field the dispatcher
        // treats as significant and the field users filter on.
        extras.push(`${alias}.severity AS ${fieldPrefix}_priority`);
        // bugs.assigned_to is a Tuleap username (TEXT); match resources.resource_name → user_id.
        extras.push(`(
            SELECT u.name
              FROM resources r
              LEFT JOIN app_user u ON u.id = r.user_id
             WHERE r.resource_name = ${alias}.assigned_to
               AND r.user_id IS NOT NULL
               AND r.deleted_at IS NULL
             LIMIT 1
        ) AS ${fieldPrefix}_assignee_name`);
    }
    if (ref === 'user_stories') {
        extras.push(`${alias}.priority AS ${fieldPrefix}_priority`);
        // Stories have no assignee column.
    }
    // test_suites and test_run: no priority/assignee surfaces — only status/project.
    return `${displayExpr(alias, ref)} AS "${fieldPrefix}_display_id",
            ${alias}.${meta.title} AS "${fieldPrefix}_title",
            ${alias}.status AS "${fieldPrefix}_status",
            ${alias}.project_id AS "${fieldPrefix}_project_id",
            p.project_name AS "${fieldPrefix}_project_name"
            ${extras.length ? `, ${extras.join(', ')}` : ''}`;
}

function pluralPath(label) {
    if (label === 'user-story') return 'user-stories';
    if (label === 'test-suite') return 'test-suites';
    if (label === 'test-run') return 'test-runs';
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

// Per-row instance-level access classification for linked targets.
// Mirrors gateEntity() but inlines the load + canPerform so the route can
// reuse the already-mocked deps in tests (ARTIFACT_GATES[...].load + canPerform).
// Returns 'ok' | 'forbidden' | 'gone' | 'info'.
async function classifyLinkAccess(otherType, otherId, user, req) {
    const gate = ARTIFACT_GATES[otherType];
    if (!gate) return 'info';
    const artifact = await gate.load(otherId, user, req);
    if (!artifact) return 'gone';
    const result = await canPerform(user, artifact, 'view', req);
    return result.allowed ? 'ok' : 'forbidden';
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
                        other.deleted_at AS ${otherLabel.replace(/-/g, '_')}_deleted_at,
                        ${otherFields}
                 FROM ${pair.table} lk
                 JOIN ${otherMeta.table} other ON other.id = lk.${otherCol}
                 LEFT JOIN projects p ON p.id = other.project_id
                 WHERE lk.${ownCol} = $1
                 ORDER BY lk.created_at DESC`,
                [ownId]
            );

            // Per-row instance-level access check so callers can render
            // redacted tombstones for deleted (gone) / inaccessible (forbidden)
            // targets without leaking content across teams.
            const otherType = otherMeta.artifactType;
            const prefix = otherLabel.replace(/-/g, '_');
            const data = [];
            for (const row of result.rows) {
                const otherId = row[otherCol];
                let accessStatus = 'info';
                try {
                    accessStatus = await classifyLinkAccess(otherType, otherId, req.user, req);
                    if (accessStatus === 'info') accessStatus = 'ok';
                } catch (err) {
                    // Defensive: never let a per-row access check blow up the list.
                    accessStatus = 'ok';
                }
                data.push({
                    ...row,
                    artifact_type: otherType,
                    access_status: accessStatus,
                    // Normalized (prefix-free) fields so the frontend doesn't
                    // need to know each pair's column prefix.
                    priority: row[`${prefix}_priority`] ?? null,
                    assignee_name: row[`${prefix}_assignee_name`] ?? null,
                    project_name: row[`${prefix}_project_name`] ?? null,
                });
            }

            res.json({ data });
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
            // Fire-and-forget notification: assignee + creator of both sides,
            // deduped, minus the actor. The source/target artifacts are already
            // loaded with the fields resolveLinkEndpointRecipients needs.
            dispatchLinkNotification({
                action: 'CREATE',
                relationshipType: result.rows[0].relationship_type,
                source: isFrom ? own : other,
                target: isFrom ? other : own,
                actorEmail: req.user?.email || 'system',
            }).catch(err => console.error('Link notification dispatch error:', err.message));
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
            // Fire-and-forget notification: same recipient rule as CREATE.
            dispatchLinkNotification({
                action: 'DELETE',
                relationshipType: result.rows[0].relationship_type,
                source: isFrom ? own : other,
                target: isFrom ? other : own,
                actorEmail: req.user?.email || 'system',
            }).catch(err => console.error('Link notification dispatch error:', err.message));
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
const testSuiteSide = express.Router();
const testRunSide = express.Router();

// These side-routers serve /:id/<links> where :id addresses the router's OWN
// artifact. They are mounted at the same base paths as the main artifact routers
// (bugs.js etc.), which resolve human ids -> UUID via router.param. These parallel
// routers must do the same, or a human id (e.g. TLP-355) reaches a uuid-typed
// column and Postgres throws "invalid input syntax for type uuid" (500).
taskSide.param('id', resolveArtifactParam('task'));
testCaseSide.param('id', resolveArtifactParam('test_case'));
bugSide.param('id', resolveArtifactParam('bug'));
userStorySide.param('id', resolveArtifactParam('user_story'));
testSuiteSide.param('id', resolveArtifactParam('test_suite'));
testRunSide.param('id', resolveArtifactParam('test_run'));

for (const pair of pairs) {
    if (pair.fromRef === 'tasks') addRoutes(taskSide, pair, 'from');
    if (pair.toRef === 'tasks') addRoutes(taskSide, pair, 'to');
    if (pair.fromRef === 'test_case') addRoutes(testCaseSide, pair, 'from');
    if (pair.toRef === 'test_case') addRoutes(testCaseSide, pair, 'to');
    if (pair.fromRef === 'bugs') addRoutes(bugSide, pair, 'from');
    if (pair.toRef === 'bugs') addRoutes(bugSide, pair, 'to');
    if (pair.fromRef === 'user_stories') addRoutes(userStorySide, pair, 'from');
    if (pair.toRef === 'user_stories') addRoutes(userStorySide, pair, 'to');
    if (pair.fromRef === 'test_suites') addRoutes(testSuiteSide, pair, 'from');
    if (pair.toRef === 'test_suites') addRoutes(testSuiteSide, pair, 'to');
    if (pair.fromRef === 'test_run') addRoutes(testRunSide, pair, 'from');
    if (pair.toRef === 'test_run') addRoutes(testRunSide, pair, 'to');
}

module.exports = { taskSide, testCaseSide, bugSide, userStorySide, testSuiteSide, testRunSide };

const express = require('express');
const db = require('../../config/db');
const pool = db.pool;
const { requireAuth, requirePermission } = require('../../middleware/authMiddleware');
const { auditLog } = require('../../middleware/audit');

function makeLinkRoutes(config) {
    const {
        table,
        fromCol, fromRef, fromLabel, fromPerms,
        toCol, toRef, toLabel, toPerms,
        relDefault
    } = config;

    const fromSide = express.Router();
    const toSide = express.Router();

    const fromDisplayAlias = `${fromLabel}_display_id`;
    const fromTitleAlias = `${fromLabel}_title`;
    const fromStatusAlias = `${fromLabel}_status`;
    const toDisplayAlias = `${toLabel}_display_id`;
    const toTitleAlias = `${toLabel}_title`;
    const toStatusAlias = `${toLabel}_status`;

    const displayExpr = (alias, ref) => {
        if (ref === 'test_case') return `${alias}.test_case_id`;
        if (ref === 'user_stories') return `COALESCE('US-' || ${alias}.tuleap_artifact_id::text, ${alias}.id::text)`;
        if (ref === 'tasks') return `${alias}.task_id`;
        if (ref === 'bugs') return `${alias}.bug_id`;
        return `${alias}.id::text`;
    };
    const titleExpr = (alias, ref) => {
        if (ref === 'tasks') return `${alias}.task_name`;
        if (ref === 'test_case' || ref === 'user_stories' || ref === 'bugs') return `${alias}.title`;
        return `${alias}.name`;
    };

    const fromFields = `${displayExpr('tf', fromRef)} AS "${fromDisplayAlias}", ${titleExpr('tf', fromRef)} AS "${fromTitleAlias}", tf.status AS "${fromStatusAlias}"`;
    const toFields = `${displayExpr('tt', toRef)} AS "${toDisplayAlias}", ${titleExpr('tt', toRef)} AS "${toTitleAlias}", tt.status AS "${toStatusAlias}"`;

    const fromLabelCap = fromLabel.charAt(0).toUpperCase() + fromLabel.slice(1).replace(/-/g, ' ');
    const toLabelCap = toLabel.charAt(0).toUpperCase() + toLabel.slice(1).replace(/-/g, ' ');

    fromSide.get(`/:fromId/${toLabel}s`, requireAuth, requirePermission(fromPerms.view), async (req, res, next) => {
        try {
            const { fromId } = req.params;
            const check = await pool.query(`SELECT id FROM ${fromRef} WHERE id = $1 AND deleted_at IS NULL`, [fromId]);
            if (check.rows.length === 0) return res.status(404).json({ error: `${fromLabelCap} not found` });

            const result = await pool.query(
                `SELECT lk.id, lk.${fromCol}, lk.${toCol}, lk.relationship_type, lk.source, lk.created_at,
                        ${toFields}
                 FROM ${table} lk
                 JOIN ${toRef} tt ON tt.id = lk.${toCol}
                 WHERE lk.${fromCol} = $1
                 ORDER BY lk.created_at DESC`,
                [fromId]
            );
            res.json({ data: result.rows });
        } catch (err) { next(err); }
    });

    fromSide.post(`/:fromId/${toLabel}s`, requireAuth, requirePermission(fromPerms.edit), async (req, res, next) => {
        try {
            const { fromId } = req.params;
            const { [toCol]: toId, relationship_type = relDefault } = req.body;
            if (!toId) return res.status(400).json({ error: `${toCol} is required` });

            const fromCheck = await pool.query(`SELECT id FROM ${fromRef} WHERE id = $1 AND deleted_at IS NULL`, [fromId]);
            if (fromCheck.rows.length === 0) return res.status(404).json({ error: `${fromLabelCap} not found` });
            const toCheck = await pool.query(`SELECT id FROM ${toRef} WHERE id = $1 AND deleted_at IS NULL`, [toId]);
            if (toCheck.rows.length === 0) return res.status(404).json({ error: `${toLabelCap} not found` });

            const result = await pool.query(
                `INSERT INTO ${table} (${fromCol}, ${toCol}, relationship_type, source, created_by)
                 VALUES ($1, $2, $3, 'qc', $4)
                 ON CONFLICT (${fromCol}, ${toCol}) DO NOTHING
                 RETURNING *`,
                [fromId, toId, relationship_type, req.user?.id || null]
            );
            if (result.rows.length === 0) return res.status(409).json({ error: 'Link already exists' });

            await auditLog(table, result.rows[0].id, 'CREATE', result.rows[0], null);
            res.status(201).json({ data: result.rows[0] });
        } catch (err) {
            if (err.message?.includes('Cross-project link rejected')) return res.status(422).json({ error: err.message });
            next(err);
        }
    });

    fromSide.delete(`/:fromId/${toLabel}s/:toId`, requireAuth, requirePermission(fromPerms.edit), async (req, res, next) => {
        try {
            const { fromId, toId } = req.params;

            const result = await pool.query(
                `DELETE FROM ${table} WHERE ${fromCol} = $1 AND ${toCol} = $2 AND (source = 'qc' OR source IS NULL) RETURNING *`,
                [fromId, toId]
            );

            if (result.rows.length === 0) {
                try {
                    const check = await pool.query(`SELECT source FROM ${table} WHERE ${fromCol} = $1 AND ${toCol} = $2`, [fromId, toId]);
                    if (check.rows.length > 0 && check.rows[0].source === 'tuleap') return res.status(403).json({ error: 'Cannot delete Tuleap-sourced link from QC UI' });
                } catch (_) { /* fall through to 404 */ }
                return res.status(404).json({ error: 'Link not found' });
            }

            await auditLog(table, result.rows[0].id, 'DELETE', null, result.rows[0]);
            res.json({ success: true, message: 'Link removed' });
        } catch (err) { next(err); }
    });

    toSide.get(`/:toId/${fromLabel}s`, requireAuth, requirePermission(toPerms.view), async (req, res, next) => {
        try {
            const { toId } = req.params;
            const check = await pool.query(`SELECT id FROM ${toRef} WHERE id = $1 AND deleted_at IS NULL`, [toId]);
            if (check.rows.length === 0) return res.status(404).json({ error: `${toLabelCap} not found` });

            const result = await pool.query(
                `SELECT lk.id, lk.${fromCol}, lk.${toCol}, lk.relationship_type, lk.source, lk.created_at,
                        ${fromFields}
                 FROM ${table} lk
                 JOIN ${fromRef} tf ON tf.id = lk.${fromCol}
                 WHERE lk.${toCol} = $1 AND tf.deleted_at IS NULL
                 ORDER BY lk.created_at DESC`,
                [toId]
            );
            res.json({ data: result.rows });
        } catch (err) { next(err); }
    });

    toSide.post(`/:toId/${fromLabel}s`, requireAuth, requirePermission(toPerms.edit), async (req, res, next) => {
        try {
            const { toId } = req.params;
            const { [fromCol]: fromId, relationship_type = relDefault } = req.body;
            if (!fromId) return res.status(400).json({ error: `${fromCol} is required` });

            const toCheck = await pool.query(`SELECT id FROM ${toRef} WHERE id = $1 AND deleted_at IS NULL`, [toId]);
            if (toCheck.rows.length === 0) return res.status(404).json({ error: `${toLabelCap} not found` });
            const fromCheck = await pool.query(`SELECT id FROM ${fromRef} WHERE id = $1 AND deleted_at IS NULL`, [fromId]);
            if (fromCheck.rows.length === 0) return res.status(404).json({ error: `${fromLabelCap} not found` });

            const result = await pool.query(
                `INSERT INTO ${table} (${fromCol}, ${toCol}, relationship_type, source, created_by)
                 VALUES ($1, $2, $3, 'qc', $4)
                 ON CONFLICT (${fromCol}, ${toCol}) DO NOTHING
                 RETURNING *`,
                [fromId, toId, relationship_type, req.user?.id || null]
            );
            if (result.rows.length === 0) return res.status(409).json({ error: 'Link already exists' });

            await auditLog(table, result.rows[0].id, 'CREATE', result.rows[0], null);
            res.status(201).json({ data: result.rows[0] });
        } catch (err) {
            if (err.message?.includes('Cross-project link rejected')) return res.status(422).json({ error: err.message });
            next(err);
        }
    });

    toSide.delete(`/:toId/${fromLabel}s/:fromId`, requireAuth, requirePermission(toPerms.edit), async (req, res, next) => {
        try {
            const { toId, fromId } = req.params;

            const result = await pool.query(
                `DELETE FROM ${table} WHERE ${fromCol} = $1 AND ${toCol} = $2 AND (source = 'qc' OR source IS NULL) RETURNING *`,
                [fromId, toId]
            );

            if (result.rows.length === 0) {
                try {
                    const check = await pool.query(`SELECT source FROM ${table} WHERE ${fromCol} = $1 AND ${toCol} = $2`, [fromId, toId]);
                    if (check.rows.length > 0 && check.rows[0].source === 'tuleap') return res.status(403).json({ error: 'Cannot delete Tuleap-sourced link from QC UI' });
                } catch (_) { /* fall through to 404 */ }
                return res.status(404).json({ error: 'Link not found' });
            }

            await auditLog(table, result.rows[0].id, 'DELETE', null, result.rows[0]);
            res.json({ success: true, message: 'Link removed' });
        } catch (err) { next(err); }
    });

    return { fromSide, toSide };
}

const PAIRS = [
    {
        table: 'task_test_cases', fromCol: 'task_id', fromRef: 'tasks', fromLabel: 'task',
        fromPerms: { view: 'qc.tasks.view', edit: 'qc.tasks.edit' },
        toCol: 'test_case_id', toRef: 'test_case', toLabel: 'test-case',
        toPerms: { view: 'qc.testcases.view', edit: 'qc.testcases.edit' },
        relDefault: 'covers'
    },
    {
        table: 'bug_test_cases', fromCol: 'bug_id', fromRef: 'bugs', fromLabel: 'bug',
        fromPerms: { view: 'qc.bugs.view', edit: 'qc.bugs.edit' },
        toCol: 'test_case_id', toRef: 'test_case', toLabel: 'test-case',
        toPerms: { view: 'qc.testcases.view', edit: 'qc.testcases.edit' },
        relDefault: 'reveals'
    },
    {
        table: 'bug_tasks', fromCol: 'bug_id', fromRef: 'bugs', fromLabel: 'bug',
        fromPerms: { view: 'qc.bugs.view', edit: 'qc.bugs.edit' },
        toCol: 'task_id', toRef: 'tasks', toLabel: 'task',
        toPerms: { view: 'qc.tasks.view', edit: 'qc.tasks.edit' },
        relDefault: 'blocks'
    },
    {
        table: 'bug_user_stories', fromCol: 'bug_id', fromRef: 'bugs', fromLabel: 'bug',
        fromPerms: { view: 'qc.bugs.view', edit: 'qc.bugs.edit' },
        toCol: 'user_story_id', toRef: 'user_stories', toLabel: 'user-story',
        toPerms: { view: 'qc.projects.view', edit: 'qc.projects.view' },
        relDefault: 'affects'
    },
    {
        table: 'test_case_user_stories', fromCol: 'test_case_id', fromRef: 'test_case', fromLabel: 'test-case',
        fromPerms: { view: 'qc.testcases.view', edit: 'qc.testcases.edit' },
        toCol: 'user_story_id', toRef: 'user_stories', toLabel: 'user-story',
        toPerms: { view: 'qc.projects.view', edit: 'qc.projects.view' },
        relDefault: 'verifies'
    }
];

const taskSide = express.Router();
const tcSide = express.Router();
const bugSide = express.Router();
const storySide = express.Router();

for (const pair of PAIRS) {
    const { fromSide, toSide } = makeLinkRoutes(pair);

    if (pair.fromRef === 'tasks') taskSide.use(fromSide);
    if (pair.fromRef === 'bugs') bugSide.use(fromSide);
    if (pair.fromRef === 'test_case') tcSide.use(fromSide);

    if (pair.toRef === 'test_case') tcSide.use(toSide);
    if (pair.toRef === 'tasks') taskSide.use(toSide);
    if (pair.toRef === 'user_stories') storySide.use(toSide);
    if (pair.toRef === 'bugs') bugSide.use(toSide);
}

module.exports = { taskSide, tcSide, bugSide, storySide };

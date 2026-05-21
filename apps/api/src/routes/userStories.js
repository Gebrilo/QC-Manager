const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { requireAuth, requirePermission } = require('../middleware/authMiddleware');
const { auditLog } = require('../middleware/audit');
const { emitToTuleap } = require('../services/emitters/user_story');
const { defaultClient } = require('../services/tuleapClient');
const { defaultRegistry } = require('../services/tuleapFieldRegistry');

function parseCsvParam(value) {
    if (!value) return [];
    return String(value).split(',').map(item => item.trim()).filter(Boolean);
}

router.get('/', requireAuth, requirePermission('qc.projects.view'), async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
        const offset = (page - 1) * limit;
        const search = String(req.query.q || req.query.search || '').trim();
        const projectIds = parseCsvParam(req.query.project_ids || req.query.project_id);
        const statuses = parseCsvParam(req.query.statuses || req.query.status);
        const relatedType = req.query.related_type || req.query.related_artifact_type;
        const relatedId = req.query.related_id || req.query.related_artifact_id;

        const where = ['us.deleted_at IS NULL'];
        const params = [];
        let pn = 1;

        if (projectIds.length > 0) { where.push(`us.project_id = ANY($${pn++}::uuid[])`); params.push(projectIds); }
        if (statuses.length > 0) { where.push(`us.status = ANY($${pn++}::text[])`); params.push(statuses); }
        if (search) {
            where.push(`(us.title ILIKE $${pn} OR us.description ILIKE $${pn} OR us.acceptance_criteria ILIKE $${pn} OR us.tuleap_artifact_id::text ILIKE $${pn})`);
            params.push(`%${search}%`);
            pn++;
        }
        if (relatedId) {
            if (relatedType === 'task') {
                where.push(`EXISTS (SELECT 1 FROM tasks t WHERE t.parent_user_story_id = us.id AND t.deleted_at IS NULL AND t.id = $${pn++}::uuid)`);
                params.push(relatedId);
            } else if (relatedType === 'test_case') {
                where.push(`EXISTS (SELECT 1 FROM test_case_user_stories tcus WHERE tcus.user_story_id = us.id AND tcus.test_case_id = $${pn++}::uuid)`);
                params.push(relatedId);
            } else if (relatedType === 'bug') {
                where.push(`EXISTS (SELECT 1 FROM bug_user_stories bus WHERE bus.user_story_id = us.id AND bus.bug_id = $${pn++}::uuid)`);
                params.push(relatedId);
            }
        }

        const whereSql = where.join(' AND ');
        const count = await pool.query(`SELECT COUNT(*) AS total FROM user_stories us WHERE ${whereSql}`, params);
        const result = await pool.query(
            `SELECT us.*, p.project_name
             FROM user_stories us
             LEFT JOIN projects p ON p.id = us.project_id
             WHERE ${whereSql}
             ORDER BY us.updated_at DESC NULLS LAST, us.created_at DESC
             LIMIT $${pn++} OFFSET $${pn++}`,
            [...params, limit, offset]
        );
        const total = parseInt(count.rows[0].total, 10);
        res.json({ data: result.rows, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) } });
    } catch (err) {
        next(err);
    }
});

router.get('/:id', requireAuth, requirePermission('qc.projects.view'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const isTuleapId = /^\d+$/.test(id);
        const whereClause = isTuleapId ? 'us.tuleap_artifact_id = $1' : 'us.id = $1';
        const paramValue = isTuleapId ? parseInt(id, 10) : id;
        const result = await pool.query(
            `SELECT us.*, p.project_name
             FROM user_stories us
             LEFT JOIN projects p ON p.id = us.project_id
             WHERE ${whereClause} AND us.deleted_at IS NULL`,
            [paramValue]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'User story not found' });
        res.json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

router.delete('/:id', requireAuth, requirePermission('qc.projects.edit'), async (req, res) => {
    try {
        const { id } = req.params;
        const originalRes = await pool.query('SELECT * FROM user_stories WHERE id = $1', [id]);
        if (originalRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'User story not found' });
        }
        const original = originalRes.rows[0];

        if (original.deleted_at) {
            return res.status(400).json({ success: false, error: 'User story already deleted' });
        }

        if (original.tuleap_artifact_id) {
            const configResult = await pool.query(
                `SELECT * FROM tuleap_sync_config
                 WHERE qc_project_id = $1 AND tracker_type = 'user_story' AND is_active = true`,
                [original.project_id]
            );
            const config = configResult.rows[0];
            if (!config) {
                return res.status(400).json({
                    success: false,
                    error: `No active user story sync config for project ${original.project_id}`,
                });
            }

            try {
                await emitToTuleap(
                    {
                        artifact_type: 'user_story',
                        project_id: original.project_id,
                        tuleap: { artifact_id: original.tuleap_artifact_id },
                    },
                    config,
                    'delete',
                    { client: defaultClient, registry: defaultRegistry, query: pool.query.bind(pool) }
                );
            } catch (emitErr) {
                console.error(`[route:user-stories:delete] emit_failed id=${id} err="${emitErr.message}"`);
                return res.status(emitErr.status || 502).json({
                    success: false,
                    error: 'Failed to delete in Tuleap',
                    message: emitErr.message,
                });
            }

            const refreshed = await pool.query('SELECT * FROM user_stories WHERE id = $1', [id]);
            const deleted = refreshed.rows[0];
            await auditLog('user_stories', id, 'DELETE', deleted, original);
            return res.json({
                success: true,
                message: `User story '${deleted.title}' has been deleted`,
                data: deleted,
            });
        }

        const result = await pool.query(
            'UPDATE user_stories SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *',
            [id]
        );
        const deleted = result.rows[0];
        await auditLog('user_stories', id, 'DELETE', deleted, original);

        res.json({
            success: true,
            message: `User story '${deleted.title}' has been deleted`,
            data: deleted,
        });
    } catch (error) {
        console.error('Error deleting user story:', error);
        res.status(500).json({ success: false, error: 'Failed to delete user story' });
    }
});

module.exports = router;

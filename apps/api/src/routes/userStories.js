const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { requireAuth, requirePermission } = require('../middleware/authMiddleware');

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
        const result = await pool.query(
            `SELECT us.*, p.project_name
             FROM user_stories us
             LEFT JOIN projects p ON p.id = us.project_id
             WHERE us.id = $1 AND us.deleted_at IS NULL`,
            [req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'User story not found' });
        res.json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

module.exports = router;

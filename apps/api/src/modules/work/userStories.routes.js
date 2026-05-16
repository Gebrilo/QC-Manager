const express = require('express');
const router = express.Router();
const { pool } = require('../../config/db');
const { requireAuth, requirePermission } = require('../../middleware/authMiddleware');

function parseCsvParam(value) {
    if (!value) return [];
    return String(value).split(',').map(item => item.trim()).filter(Boolean);
}

router.get('/', requireAuth, requirePermission('qc.projects.view'), async (req, res, next) => {
    try {
        const {
            page = 1,
            limit = 25,
            sort_by = 'created_at',
            sort_order = 'desc',
        } = req.query;
        const search = String(req.query.q || req.query.search || '').trim();
        const projectIds = parseCsvParam(req.query.project_ids || req.query.project_id);
        const statuses = parseCsvParam(req.query.statuses || req.query.status);
        const authors = parseCsvParam(req.query.author_ids || req.query.author || req.query.ba_author);
        const relatedType = req.query.related_type || req.query.related_artifact_type;
        const relatedId = req.query.related_id || req.query.related_artifact_id;

        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
        const offset = (pageNum - 1) * limitNum;
        const allowedSortColumns = ['created_at', 'updated_at', 'title', 'status', 'tuleap_artifact_id'];
        const safeSortBy = allowedSortColumns.includes(sort_by) ? sort_by : 'created_at';
        const safeSortOrder = String(sort_order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        const whereClauses = ['us.deleted_at IS NULL'];
        const params = [];
        let pn = 1;

        if (projectIds.length > 0) { whereClauses.push(`us.project_id = ANY($${pn++}::uuid[])`); params.push(projectIds); }
        if (statuses.length > 0) { whereClauses.push(`us.status = ANY($${pn++}::text[])`); params.push(statuses); }
        if (authors.length > 0) { whereClauses.push(`us.ba_author = ANY($${pn++}::text[])`); params.push(authors); }
        if (req.query.created_from) { whereClauses.push(`us.created_at >= $${pn++}::date`); params.push(req.query.created_from); }
        if (req.query.created_to) { whereClauses.push(`us.created_at < ($${pn++}::date + INTERVAL '1 day')`); params.push(req.query.created_to); }
        if (req.query.updated_from) { whereClauses.push(`us.updated_at >= $${pn++}::date`); params.push(req.query.updated_from); }
        if (req.query.updated_to) { whereClauses.push(`us.updated_at < ($${pn++}::date + INTERVAL '1 day')`); params.push(req.query.updated_to); }

        if (search) {
            whereClauses.push(`(
                us.title ILIKE $${pn}
                OR us.description ILIKE $${pn}
                OR us.acceptance_criteria ILIKE $${pn}
                OR us.ba_author ILIKE $${pn}
                OR us.tuleap_artifact_id::text ILIKE $${pn}
                OR p.project_name ILIKE $${pn}
            )`);
            params.push(`%${search}%`);
            pn++;
        }

        if (relatedId) {
            if (relatedType === 'task') {
                whereClauses.push(`EXISTS (
                    SELECT 1 FROM tasks t
                    WHERE t.parent_user_story_id = us.id
                      AND t.deleted_at IS NULL
                      AND t.id = $${pn++}::uuid
                )`);
                params.push(relatedId);
            } else if (relatedType === 'test_case') {
                whereClauses.push(`EXISTS (
                    SELECT 1 FROM tasks t
                    JOIN task_test_cases ttc ON ttc.task_id = t.id
                    WHERE t.parent_user_story_id = us.id
                      AND t.deleted_at IS NULL
                      AND ttc.test_case_id = $${pn++}::uuid
                )`);
                params.push(relatedId);
            } else if (relatedType === 'bug') {
                whereClauses.push(`EXISTS (
                    SELECT 1 FROM tasks t
                    JOIN bug_tasks bt ON bt.task_id = t.id
                    WHERE t.parent_user_story_id = us.id
                      AND t.deleted_at IS NULL
                      AND bt.bug_id = $${pn++}::uuid
                )`);
                params.push(relatedId);
            }
        }

        const where = whereClauses.join(' AND ');
        const countResult = await pool.query(
            `SELECT COUNT(*) AS total
             FROM user_stories us
             LEFT JOIN projects p ON p.id = us.project_id
             WHERE ${where}`,
            params
        );

        const dataParams = [...params, limitNum, offset];
        const result = await pool.query(
            `SELECT us.*, p.project_name
             FROM user_stories us
             LEFT JOIN projects p ON p.id = us.project_id
             WHERE ${where}
             ORDER BY us.${safeSortBy} ${safeSortOrder}
             LIMIT $${pn++} OFFSET $${pn++}`,
            dataParams
        );

        const total = parseInt(countResult.rows[0].total, 10);
        res.json({
            data: result.rows,
            pagination: { page: pageNum, limit: limitNum, total, total_pages: Math.ceil(total / limitNum) },
        });
    } catch (error) {
        next(error);
    }
});

router.get('/:id', requireAuth, requirePermission('qc.projects.view'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `SELECT us.*, p.project_name
             FROM user_stories us
             LEFT JOIN projects p ON p.id = us.project_id
             WHERE us.id = $1 AND us.deleted_at IS NULL`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User story not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        next(error);
    }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { requireAuth } = require('../middleware/authMiddleware');

const SEARCHABLE_TYPES = new Set(['task', 'user_story', 'test_case', 'bug']);
const TYPE_PERMISSIONS = {
    task: 'page:tasks',
    user_story: 'page:projects',
    test_case: 'page:test-cases',
    bug: 'page:bugs',
};

async function getAllowedTypes(req, requestedTypes) {
    const scopedTypes = requestedTypes.length > 0
        ? requestedTypes.filter(type => SEARCHABLE_TYPES.has(type))
        : [...SEARCHABLE_TYPES];

    if (scopedTypes.length === 0) return [];
    if (req.user?.role === 'admin') return scopedTypes;

    const permissionKeys = scopedTypes.map(type => TYPE_PERMISSIONS[type]);
    const placeholders = permissionKeys.map((_, idx) => `$${idx + 2}`).join(', ');
    const result = await pool.query(
        `SELECT permission_key
         FROM user_permissions
         WHERE user_id = $1
           AND permission_key IN (${placeholders})
           AND granted = true`,
        [req.user.id, ...permissionKeys]
    );
    const granted = new Set(result.rows.map(row => row.permission_key));
    return scopedTypes.filter(type => granted.has(TYPE_PERMISSIONS[type]));
}

function parseTypes(rawType) {
    if (!rawType) return [];
    return String(rawType)
        .split(',')
        .map(type => type.trim())
        .filter(Boolean);
}

function buildSearchQuery({ allowedTypes, includeArchived, projectId }) {
    const deletedFilter = includeArchived ? '1=1' : 'deleted_at IS NULL';
    const projectFilter = projectId ? 'AND project_id = $3' : '';
    const fragments = [];

    if (allowedTypes.includes('task')) {
        fragments.push(`
            SELECT
                'task' AS type,
                t.id::text AS id,
                COALESCE(t.task_id, t.id::text) AS display_id,
                t.task_name AS title,
                p.id::text AS project_id,
                p.project_name,
                t.status,
                ('/tasks/' || t.id::text) AS url,
                CASE
                    WHEN t.task_id ILIKE $1 THEN 10
                    WHEN t.task_name ILIKE $1 THEN 7
                    ELSE 1
                END AS rank
            FROM tasks t
            LEFT JOIN projects p ON p.id = t.project_id
            WHERE ${deletedFilter.replaceAll('deleted_at', 't.deleted_at')}
              ${projectFilter.replaceAll('project_id', 't.project_id')}
              AND (
                t.task_id ILIKE $1
                OR t.task_name ILIKE $1
                OR t.description ILIKE $1
                OR t.tuleap_artifact_id::text ILIKE $1
              )
        `);
    }

    if (allowedTypes.includes('user_story')) {
        fragments.push(`
            SELECT
                'user_story' AS type,
                us.id::text AS id,
                COALESCE('US-' || us.tuleap_artifact_id::text, us.id::text) AS display_id,
                us.title,
                p.id::text AS project_id,
                p.project_name,
                us.status,
                ('/user-stories/' || us.id::text) AS url,
                CASE
                    WHEN us.tuleap_artifact_id::text ILIKE $1 THEN 10
                    WHEN us.title ILIKE $1 THEN 7
                    ELSE 1
                END AS rank
            FROM user_stories us
            LEFT JOIN projects p ON p.id = us.project_id
            WHERE ${deletedFilter.replaceAll('deleted_at', 'us.deleted_at')}
              ${projectFilter.replaceAll('project_id', 'us.project_id')}
              AND (
                us.title ILIKE $1
                OR us.description ILIKE $1
                OR us.tuleap_artifact_id::text ILIKE $1
              )
        `);
    }

    if (allowedTypes.includes('test_case')) {
        fragments.push(`
            SELECT
                'test_case' AS type,
                tc.id::text AS id,
                COALESCE(tc.test_case_id, tc.id::text) AS display_id,
                tc.title,
                p.id::text AS project_id,
                p.project_name,
                tc.status,
                ('/test-cases/' || tc.id::text) AS url,
                CASE
                    WHEN tc.test_case_id ILIKE $1 THEN 10
                    WHEN tc.title ILIKE $1 THEN 7
                    ELSE 1
                END AS rank
            FROM test_case tc
            LEFT JOIN projects p ON p.id = tc.project_id
            WHERE ${deletedFilter.replaceAll('deleted_at', 'tc.deleted_at')}
              ${projectFilter.replaceAll('project_id', 'tc.project_id')}
              AND (
                tc.test_case_id ILIKE $1
                OR tc.title ILIKE $1
                OR tc.description ILIKE $1
                OR tc.tuleap_artifact_id::text ILIKE $1
              )
        `);
    }

    if (allowedTypes.includes('bug')) {
        fragments.push(`
            SELECT
                'bug' AS type,
                b.id::text AS id,
                COALESCE(b.bug_id, b.id::text) AS display_id,
                b.title,
                p.id::text AS project_id,
                p.project_name,
                b.status,
                ('/bugs/' || b.id::text) AS url,
                CASE
                    WHEN b.bug_id ILIKE $1 THEN 10
                    WHEN b.title ILIKE $1 THEN 7
                    ELSE 1
                END AS rank
            FROM bugs b
            LEFT JOIN projects p ON p.id = b.project_id
            WHERE ${deletedFilter.replaceAll('deleted_at', 'b.deleted_at')}
              ${projectFilter.replaceAll('project_id', 'b.project_id')}
              AND (
                b.bug_id ILIKE $1
                OR b.title ILIKE $1
                OR b.description ILIKE $1
                OR b.tuleap_artifact_id::text ILIKE $1
              )
        `);
    }

    return `
        SELECT type, id, display_id, title, project_id, project_name, status, url
        FROM (
            ${fragments.join('\nUNION ALL\n')}
        ) search_results
        ORDER BY rank DESC, title ASC
        LIMIT $2
    `;
}

router.get('/', requireAuth, async (req, res, next) => {
    try {
        const q = String(req.query.q || '').trim();
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
        const includeArchived = req.query.include_archived === 'true';
        const projectId = req.query.project_id ? String(req.query.project_id) : null;
        const requestedTypes = parseTypes(req.query.type);

        if (q.length < 2) {
            return res.json({ data: [], meta: { q, limit, types: [] } });
        }

        const invalidTypes = requestedTypes.filter(type => !SEARCHABLE_TYPES.has(type));
        if (invalidTypes.length > 0) {
            return res.status(400).json({ error: 'Invalid search type', invalid_types: invalidTypes });
        }

        const allowedTypes = await getAllowedTypes(req, requestedTypes);
        if (allowedTypes.length === 0) {
            return res.json({ data: [], meta: { q, limit, types: [] } });
        }

        const params = [`%${q}%`, limit];
        if (projectId) params.push(projectId);

        const result = await pool.query(
            buildSearchQuery({ allowedTypes, includeArchived, projectId }),
            params
        );

        res.json({
            data: result.rows,
            meta: { q, limit, types: allowedTypes },
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;

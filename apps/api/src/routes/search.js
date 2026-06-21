const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { requireAuth } = require('../middleware/authMiddleware');

const SEARCHABLE_TYPES = new Set(['task', 'user_story', 'test_case', 'bug', 'test_suite', 'test_run']);
const TYPE_PERMISSIONS = {
    task: 'page:tasks',
    user_story: 'page:projects',
    test_case: 'page:test-cases',
    bug: 'page:bugs',
    test_suite: 'page:test-suites',
    test_run: 'page:test-executions',
};

// Per-type metadata used by the search builder. `priorityColumn` and
// `assigneePredicate` are NULL when the type doesn't expose that surface —
// in that case the caller skips the fragment if the user filtered on it.
const TYPE_METADATA = {
    task: {
        alias: 't',
        table: 'tasks',
        deletedAt: 't.deleted_at',
        projectId: 't.project_id',
        priorityColumn: 't.priority',
        // task assignee: PRIMARY (or first) row in task_resource_assignment → resources.user_id → app_user.name
        assigneePredicate: assigneeParam => `EXISTS (
            SELECT 1 FROM task_resource_assignment tra
              JOIN resources r ON r.id = tra.resource_id
             WHERE tra.task_id = t.id AND r.user_id = ${assigneeParam}
               AND r.deleted_at IS NULL
        )`,
        assigneeNameColumn: `(
            SELECT u.name FROM task_resource_assignment tra
              JOIN resources r ON r.id = tra.resource_id
              LEFT JOIN app_user u ON u.id = r.user_id
             WHERE tra.task_id = t.id AND r.user_id IS NOT NULL AND r.deleted_at IS NULL
             ORDER BY (tra.assignment_type = 'PRIMARY') DESC, tra.created_at, tra.id
             LIMIT 1
        )`,
        displayIdExpr: 'COALESCE(t.task_id, t.id::text)',
        titleExpr: 't.task_name',
        searchCols: "t.task_id ILIKE $1 OR t.task_name ILIKE $1 OR t.description ILIKE $1 OR t.tuleap_artifact_id::text ILIKE $1",
        urlPrefix: '/tasks/',
        idExpr: 't.id::text',
        idRankExpr: 't.task_id',
        titleRankExpr: 't.task_name',
    },
    user_story: {
        alias: 'us',
        table: 'user_stories',
        deletedAt: 'us.deleted_at',
        projectId: 'us.project_id',
        priorityColumn: 'us.priority',
        // Stories have no assignee.
        assigneePredicate: null,
        assigneeNameColumn: 'NULL::text',
        displayIdExpr: "COALESCE('US-' || us.tuleap_artifact_id::text, us.id::text)",
        titleExpr: 'us.title',
        searchCols: "us.title ILIKE $1 OR us.description ILIKE $1 OR us.tuleap_artifact_id::text ILIKE $1",
        urlPrefix: '/user-stories/',
        idExpr: 'us.id::text',
        idRankExpr: 'us.tuleap_artifact_id::text',
        titleRankExpr: 'us.title',
    },
    test_case: {
        alias: 'tc',
        table: 'test_case',
        deletedAt: 'tc.deleted_at',
        projectId: 'tc.project_id',
        priorityColumn: 'tc.priority',
        // test_case.assigned_to is a UUID app_user.id directly.
        assigneePredicate: assigneeParam => `tc.assigned_to = ${assigneeParam}`,
        assigneeNameColumn: '(SELECT u.name FROM app_user u WHERE u.id = tc.assigned_to)',
        displayIdExpr: 'COALESCE(tc.test_case_id, tc.id::text)',
        titleExpr: 'tc.title',
        searchCols: "tc.test_case_id ILIKE $1 OR tc.title ILIKE $1 OR tc.description ILIKE $1 OR tc.tuleap_artifact_id::text ILIKE $1",
        urlPrefix: '/test-cases/',
        idExpr: 'tc.id::text',
        idRankExpr: 'tc.test_case_id',
        titleRankExpr: 'tc.title',
    },
    bug: {
        alias: 'b',
        table: 'bugs',
        deletedAt: 'b.deleted_at',
        projectId: 'b.project_id',
        // Surface severity as the bug's "priority" — it's the column the
        // dispatcher treats as significant and the field users filter on.
        priorityColumn: 'b.severity',
        // bugs.assigned_to is a Tuleap username; resolve via resources.resource_name → user_id.
        assigneePredicate: assigneeParam => `EXISTS (
            SELECT 1 FROM resources r
             WHERE r.resource_name = b.assigned_to AND r.user_id = ${assigneeParam}
               AND r.deleted_at IS NULL
        )`,
        assigneeNameColumn: `(
            SELECT u.name FROM resources r
              LEFT JOIN app_user u ON u.id = r.user_id
             WHERE r.resource_name = b.assigned_to AND r.user_id IS NOT NULL AND r.deleted_at IS NULL
             LIMIT 1
        )`,
        displayIdExpr: 'COALESCE(b.bug_id, b.id::text)',
        titleExpr: 'b.title',
        searchCols: "b.bug_id ILIKE $1 OR b.title ILIKE $1 OR b.description ILIKE $1 OR b.tuleap_artifact_id::text ILIKE $1",
        urlPrefix: '/bugs/',
        idExpr: 'b.id::text',
        idRankExpr: 'b.bug_id',
        titleRankExpr: 'b.title',
    },
    test_suite: {
        alias: 'ts',
        table: 'test_suites',
        deletedAt: 'ts.deleted_at',
        projectId: 'ts.project_id',
        // Suites have no priority and no assignee.
        priorityColumn: null,
        assigneePredicate: null,
        assigneeNameColumn: 'NULL::text',
        displayIdExpr: 'COALESCE(ts.suite_id, ts.id::text)',
        titleExpr: 'ts.name',
        searchCols: "ts.suite_id ILIKE $1 OR ts.name ILIKE $1 OR ts.description ILIKE $1",
        urlPrefix: '/test/suites/',
        idExpr: 'ts.id::text',
        idRankExpr: 'ts.suite_id',
        titleRankExpr: 'ts.name',
    },
    test_run: {
        alias: 'tr',
        table: 'test_run',
        deletedAt: 'tr.deleted_at',
        projectId: 'tr.project_id',
        // Runs have no priority and no assignee.
        priorityColumn: null,
        assigneePredicate: null,
        assigneeNameColumn: 'NULL::text',
        displayIdExpr: 'COALESCE(tr.run_id, tr.id::text)',
        titleExpr: 'tr.name',
        searchCols: "tr.run_id ILIKE $1 OR tr.name ILIKE $1 OR tr.description ILIKE $1",
        urlPrefix: '/test/runs/',
        idExpr: 'tr.id::text',
        idRankExpr: 'tr.run_id',
        titleRankExpr: 'tr.name',
    },
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

// Build the per-type fragment. Returns null if a filter rules the type out
// entirely (e.g. user filtered on priority but the type has no priority column).
function buildTypeFragment(typeName, ctx) {
    const meta = TYPE_METADATA[typeName];
    if (!meta) return null;

    // Contextual filters: if the user filtered on priority/assignee and this
    // type doesn't expose that surface, exclude the type from results.
    if (ctx.priorityFilter && !meta.priorityColumn) return null;
    if (ctx.assigneeFilter && !meta.assigneePredicate) return null;

    const deletedClause = ctx.includeArchived ? '1=1' : `${meta.deletedAt} IS NULL`;
    const whereClauses = [deletedClause, `(${meta.searchCols})`];

    if (ctx.projectId) {
        whereClauses.push(`${meta.projectId} = ${ctx.projectParam}`);
    }
    if (ctx.statusFilter) {
        whereClauses.push(`${meta.alias}.status = ${ctx.statusParam}`);
    }
    if (ctx.priorityFilter) {
        whereClauses.push(`${meta.priorityColumn} = ${ctx.priorityParam}`);
    }
    if (ctx.assigneeFilter) {
        whereClauses.push(meta.assigneePredicate(ctx.assigneeParam));
    }

    const prioritySelect = meta.priorityColumn
        ? `${meta.priorityColumn} AS priority`
        : 'NULL::text AS priority';
    const assigneeSelect = `${meta.assigneeNameColumn} AS assignee_name`;

    return `
        SELECT
            '${typeName}' AS type,
            ${meta.idExpr} AS id,
            ${meta.displayIdExpr} AS display_id,
            ${meta.titleExpr} AS title,
            p.id::text AS project_id,
            p.project_name,
            ${meta.alias}.status,
            ${prioritySelect},
            ${assigneeSelect},
            ('${meta.urlPrefix}' || ${meta.displayIdExpr}) AS url,
            CASE
                WHEN ${meta.idRankExpr} ILIKE $1 THEN 10
                WHEN ${meta.titleRankExpr} ILIKE $1 THEN 7
                ELSE 1
            END AS rank
        FROM ${meta.table} ${meta.alias}
        LEFT JOIN projects p ON p.id = ${meta.projectId}
        WHERE ${whereClauses.join('\n          AND ')}
    `;
}

// Build the full UNION query and the params array. Params are positional
// ($1=q%, $2=limit, then optional project_id / status / priority / assignee).
function buildSearchQuery({ allowedTypes, includeArchived, projectId, status, priority, assignee }) {
    const params = []; // index 0 → $1
    // Reserve $1 for the query pattern and $2 for the limit up front so the
    // dynamic params below get the right placeholder numbers.
    // We'll prepend them at the end of building.
    let nextIdx = 3; // $3 onward
    const ctx = {
        includeArchived,
        projectId: null,
        projectParam: null,
        statusFilter: null,
        statusParam: null,
        priorityFilter: null,
        priorityParam: null,
        assigneeFilter: null,
        assigneeParam: null,
    };

    if (projectId) {
        ctx.projectId = projectId;
        ctx.projectParam = `$${nextIdx++}`;
        params.push(projectId);
    }
    if (status) {
        ctx.statusFilter = status;
        ctx.statusParam = `$${nextIdx++}`;
        params.push(status);
    }
    if (priority) {
        ctx.priorityFilter = priority;
        ctx.priorityParam = `$${nextIdx++}`;
        params.push(priority);
    }
    if (assignee) {
        ctx.assigneeFilter = assignee;
        ctx.assigneeParam = `$${nextIdx++}`;
        params.push(assignee);
    }

    const fragments = [];
    for (const type of allowedTypes) {
        const frag = buildTypeFragment(type, ctx);
        if (frag) fragments.push(frag);
    }

    if (fragments.length === 0) {
        return { sql: null, params };
    }

    const sql = `
        SELECT type, id, display_id, title, project_id, project_name, status, priority, assignee_name, url
        FROM (
            ${fragments.join('\nUNION ALL\n')}
        ) search_results
        ORDER BY rank DESC, title ASC
        LIMIT $2
    `;
    return { sql, params };
}

router.get('/', requireAuth, async (req, res, next) => {
    try {
        const q = String(req.query.q || '').trim();
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
        const includeArchived = req.query.include_archived === 'true';
        const projectId = req.query.project_id ? String(req.query.project_id) : null;
        const status = req.query.status ? String(req.query.status) : null;
        const priority = req.query.priority ? String(req.query.priority) : null;
        const assignee = req.query.assignee ? String(req.query.assignee) : null;
        const requestedTypes = parseTypes(req.query.type);

        // Below 2 chars we normally return nothing. But when a specific type is
        // requested (a scoped picker, not the global search bar) we allow an
        // empty/short query to "browse" — returning a suggested list so the user
        // can see the relevant artifacts before typing. `%%` matches all rows,
        // ordered by title.
        const isBrowse = requestedTypes.length > 0;
        if (q.length < 2 && !isBrowse) {
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

        const { sql, params: filterParams } = buildSearchQuery({
            allowedTypes,
            includeArchived,
            projectId,
            status,
            priority,
            assignee,
        });

        // $1 = q pattern, $2 = limit, then the filter params in order.
        const params = [`%${q}%`, limit, ...filterParams];

        if (!sql) {
            // All types were ruled out by a contextual filter (e.g. priority
            // set but only suites requested) — return an empty result.
            return res.json({
                data: [],
                meta: { q, limit, types: allowedTypes, filters: { status, priority, assignee } },
            });
        }

        const result = await pool.query(sql, params);

        res.json({
            data: result.rows,
            meta: { q, limit, types: allowedTypes, filters: { status, priority, assignee } },
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;

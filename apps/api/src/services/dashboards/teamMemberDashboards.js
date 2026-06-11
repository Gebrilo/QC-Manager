'use strict';

const access = require('../../access/AccessEngine');
const { resolve: resolveRole } = require('../../access/RoleResolver');
const { withAccess } = require('./pmDashboard');
const { estimateAccuracy, isClosedWorkStatus } = require('../metrics/estimateAccuracy');

const TASK_FILTER_OPTS = {
    tableAlias: 't',
    // ADR 0009 / #195 — resolve assignees via the junction so every secondary's
    // tasks surface on their dashboard.
    assigneeJunction: { table: 'task_resource_assignment', idExpr: 't.id' },
    userExprs: ['t.created_by_user_id'],
};

const BUG_FILTER_OPTS = {
    tableAlias: 'b',
    assigneeResourceExprs: ['b.owner_resource_id'],
    userExprs: ['b.created_by_user_id'],
};

const STORY_FILTER_OPTS = {
    tableAlias: 'us',
    assigneeResourceExprs: [],
    userExprs: ['us.created_by_user_id'],
};

function number(value) {
    return Number(value || 0);
}

const TASK_ASSIGNMENT_ROLLUP_CTE = `
    assignment_rollup AS (
        SELECT
            tra.task_id,
            COALESCE(SUM(COALESCE(tra.estimate_hrs, 0)), 0)::numeric AS total_estimated_hrs,
            COALESCE(SUM(COALESCE(tra.actual_hrs, 0)), 0)::numeric AS total_actual_hrs,
            COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'resource_id', tra.resource_id,
                        'resource_name', res.resource_name,
                        'assignment_type', tra.assignment_type,
                        'estimate_hrs', COALESCE(tra.estimate_hrs, 0),
                        'actual_hrs', COALESCE(tra.actual_hrs, 0),
                        'completion_status', tra.completion_status,
                        'completed_at', tra.completed_at
                    )
                    ORDER BY (tra.assignment_type = 'PRIMARY') DESC, tra.created_at, tra.id
                ) FILTER (WHERE tra.id IS NOT NULL),
                '[]'::jsonb
            ) AS assignments
          FROM task_resource_assignment tra
          JOIN resources res ON res.id = tra.resource_id
         GROUP BY tra.task_id
    )
`;

function assignmentBreakdown(value) {
    if (!value) return [];
    const rows = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(rows)) return [];
    return rows.map(row => ({
        resource_id: row.resource_id,
        resource_name: row.resource_name,
        assignment_type: row.assignment_type,
        estimate_hrs: number(row.estimate_hrs),
        actual_hrs: number(row.actual_hrs),
        completion_status: row.completion_status,
        completed_at: row.completed_at || null,
    }));
}

function withAssignmentAccuracy(assignment, taskIsClosed) {
    if (!taskIsClosed && assignment.completion_status !== 'Completed') return assignment;
    return {
        ...assignment,
        estimate_accuracy: estimateAccuracy(assignment.estimate_hrs, assignment.actual_hrs),
    };
}

function hasPermission(resolved, key) {
    return resolved.effectivePermissions.has('*') || resolved.effectivePermissions.has(key);
}

function hasAnyPermission(resolved, keys) {
    return resolved.effectivePermissions.has('*') || keys.some(key => resolved.effectivePermissions.has(key));
}

function canTakeOverTask(resolved, task) {
    if (resolved.effectivePermissions.has('*')) return true;
    return resolved.effectivePermissions.has('qc.tasks.take_over')
        && resolved.scope.team_id
        && task.owner_team_id === resolved.scope.team_id;
}

function taskArtifact(task, assigneeResourceId) {
    return {
        type: 'task',
        id: task.id,
        project_id: task.project_id,
        owner_team_id: task.owner_team_id,
        visibility_scope: task.visibility_scope,
        created_by_user_id: task.created_by_user_id,
        assignee_resource_id: assigneeResourceId,
    };
}

async function canEditTask(user, task, req) {
    const assigneeIds = (Array.isArray(task.assignments) ? task.assignments : [])
        .map(a => a.resource_id)
        .filter(Boolean);
    if (assigneeIds.length === 0) {
        const result = await access.canPerform(user, taskArtifact(task, null), 'edit', req);
        return result.allowed;
    }

    for (const resourceId of assigneeIds) {
        const result = await access.canPerform(user, taskArtifact(task, resourceId), 'edit', req);
        if (result.allowed) return true;
    }
    return false;
}

async function taskCan(user, resolved, task, req) {
    return {
        view: true,
        edit: await canEditTask(user, task, req),
        take_over: canTakeOverTask(resolved, task),
    };
}

function normalizeTask(row, can) {
    const taskIsClosed = isClosedWorkStatus(row.status);
    const assignments = assignmentBreakdown(row.assignments)
        .map(assignment => withAssignmentAccuracy(assignment, taskIsClosed));
    return {
        id: row.id,
        task_id: row.task_id,
        task_name: row.task_name,
        status: row.status,
        priority: row.priority,
        project_id: row.project_id,
        project_name: row.project_name,
        owner_team_id: row.owner_team_id,
        parent_user_story_id: row.parent_user_story_id,
        deadline: row.deadline,
        total_est_hrs: number(row.total_est_hrs),
        total_estimated_effort: number(row.total_estimated_effort ?? row.total_est_hrs),
        total_actual_hrs: number(row.total_actual_hrs),
        assignments,
        // ADR 0009 / #195 — the viewer's own perspective on this task (present
        // only on the personal dashboard, which joins the viewer's assignment):
        // owning when they're the PRIMARY, supporting when SECONDARY, plus their
        // own per-assignment estimate/actual.
        ...(row.my_assignment_type !== undefined ? {
            assignment_role: row.my_assignment_type === 'PRIMARY' ? 'owning'
                : row.my_assignment_type === 'SECONDARY' ? 'supporting'
                : null,
            my_estimate_hrs: number(row.my_estimate_hrs),
            my_actual_hrs: number(row.my_actual_hrs),
            ...((taskIsClosed || row.my_completion_status === 'Completed') ? {
                my_estimate_accuracy: estimateAccuracy(row.my_estimate_hrs, row.my_actual_hrs),
            } : {}),
        } : {}),
        _can: can,
    };
}

async function getTaskRows(db, user, resolved, req, taskFilter, extraWhere = '', extraParams = [], limit = 25) {
    const startIdx = taskFilter.nextIdx + extraParams.length;
    const baseWhere = withAccess('t.deleted_at IS NULL', taskFilter);
    const limitPlaceholder = `$${startIdx}`;
    const sql = `
        WITH ${TASK_ASSIGNMENT_ROLLUP_CTE}
        SELECT t.id, t.task_id, t.task_name, t.status, t.priority, t.project_id,
               p.project_name, t.owner_team_id, t.visibility_scope, t.created_by_user_id,
               t.parent_user_story_id, t.deadline,
               COALESCE(ar.total_estimated_hrs, 0) AS total_est_hrs,
               COALESCE(ar.total_estimated_hrs, 0) AS total_estimated_effort,
               COALESCE(ar.total_actual_hrs, 0) AS total_actual_hrs,
               COALESCE(ar.assignments, '[]'::jsonb) AS assignments
          FROM tasks t
          LEFT JOIN projects p ON p.id = t.project_id
          LEFT JOIN assignment_rollup ar ON ar.task_id = t.id
         WHERE ${baseWhere}
           ${extraWhere}
         ORDER BY
           CASE t.status WHEN 'Blocked' THEN 1 WHEN 'In Progress' THEN 2 WHEN 'Todo' THEN 3 WHEN 'Backlog' THEN 4 ELSE 5 END,
           t.deadline NULLS LAST,
           t.created_at DESC
         LIMIT ${limitPlaceholder}`;
    const result = await db.query(sql, [...taskFilter.params, ...extraParams, limit]);
    return Promise.all(result.rows.map(async row => normalizeTask(row, await taskCan(user, resolved, row, req))));
}

function byStatus(rows) {
    const out = {};
    for (const row of rows) out[row.status || 'Unknown'] = number(row.c);
    return out;
}

async function getTeamDashboard(db, user, req) {
    const resolved = await resolveRole(user, req);
    const teamId = user.scope?.team_id || resolved.scope.team_id;
    if (!teamId) {
        const err = new Error('Team manager dashboard requires a team assignment');
        err.status = 403;
        throw err;
    }

    const teamResult = await db.query(
        `SELECT t.id, t.name, tt.code AS team_type
           FROM teams t
           LEFT JOIN team_types tt ON tt.id = t.team_type_id
          WHERE t.id = $1 AND t.deleted_at IS NULL`,
        [teamId]
    );
    const team = teamResult.rows[0] || { id: teamId, name: null, team_type: null };

    const taskFilter = await access.buildListFilter(user, 'task', 'view', { ...TASK_FILTER_OPTS, req });
    const bugFilter = await access.buildListFilter(user, 'bug', 'view', { ...BUG_FILTER_OPTS, req });
    const taskWhere = withAccess('t.deleted_at IS NULL', taskFilter);

    const [taskTotalResult, taskStatusResult, tasksByMemberResult, membersResult, teamTaskItems, blockedItems, overdueItems] = await Promise.all([
        db.query(`SELECT COUNT(*)::int AS c FROM tasks t WHERE ${taskWhere}`, taskFilter.params),
        db.query(`SELECT t.status, COUNT(*)::int AS c FROM tasks t WHERE ${taskWhere} GROUP BY t.status`, taskFilter.params),
        db.query(
            `WITH visible_tasks AS (
                SELECT t.id
                   FROM tasks t
                  WHERE ${taskWhere}
             ),
             assignments AS (
                SELECT tra.resource_id
                  FROM task_resource_assignment tra
                  JOIN visible_tasks vt ON vt.id = tra.task_id
             )
             SELECT au.id AS user_id, r.id AS resource_id, COALESCE(au.name, r.resource_name) AS name, COUNT(a.resource_id)::int AS total
               FROM app_user au
               LEFT JOIN resources r ON r.user_id = au.id AND r.deleted_at IS NULL
               LEFT JOIN assignments a ON a.resource_id = r.id
              WHERE au.team_id = $${taskFilter.nextIdx}
              GROUP BY au.id, au.name, r.id, r.resource_name
              ORDER BY name`,
            [...taskFilter.params, teamId]
        ),
        db.query(
            `WITH visible_tasks AS (
                SELECT t.id
                  FROM tasks t
                 WHERE ${taskWhere}
             )
             SELECT au.id AS user_id,
                    r.id AS resource_id,
                    COALESCE(au.name, r.resource_name) AS name,
                    COALESCE(r.weekly_capacity_hrs, 0)::numeric AS capacity_hrs,
                    COALESCE(SUM(COALESCE(tra.estimate_hrs, 0)), 0)::numeric AS workload_hrs,
                    COALESCE(SUM(COALESCE(tra.actual_hrs, 0)), 0)::numeric AS logged_hrs
               FROM app_user au
               LEFT JOIN resources r ON r.user_id = au.id AND r.deleted_at IS NULL
               LEFT JOIN task_resource_assignment tra
                      ON tra.resource_id = r.id
                     AND tra.task_id IN (SELECT id FROM visible_tasks)
              WHERE au.team_id = $${taskFilter.nextIdx}
              GROUP BY au.id, au.name, r.id, r.resource_name, r.weekly_capacity_hrs
              ORDER BY name`,
            [...taskFilter.params, teamId]
        ),
        getTaskRows(db, user, resolved, req, taskFilter, '', [], 100),
        getTaskRows(db, user, resolved, req, taskFilter, "AND t.status = 'Blocked'", [], 10),
        getTaskRows(
            db,
            user,
            resolved,
            req,
            taskFilter,
            "AND t.deadline IS NOT NULL AND t.deadline < CURRENT_DATE AND t.status NOT IN ('Done','Canceled','Cancelled')",
            [],
            10
        ),
    ]);

    let teamBugs = null;
    const bugTypes = new Set(['qc', 'dev']);
    if (bugTypes.has(team.team_type) && hasAnyPermission(resolved, ['qc.bugs.view_team', 'qc.bugs.view_any', 'qc.bugs.view_own'])) {
        const bugWhere = withAccess('b.deleted_at IS NULL', bugFilter);
        const [bugTotal, bugStatus] = await Promise.all([
            db.query(`SELECT COUNT(*)::int AS c FROM bugs b WHERE ${bugWhere}`, bugFilter.params),
            db.query(`SELECT b.status, COUNT(*)::int AS c FROM bugs b WHERE ${bugWhere} GROUP BY b.status`, bugFilter.params),
        ]);
        teamBugs = {
            total: number(bugTotal.rows[0]?.c),
            by_status: byStatus(bugStatus.rows),
        };
    }

    return {
        team_id: teamId,
        team_name: team.name,
        team_type: team.team_type,
        team_tasks: {
            total: number(taskTotalResult.rows[0]?.c),
            by_status: byStatus(taskStatusResult.rows),
            items: teamTaskItems,
        },
        tasks_by_member: tasksByMemberResult.rows.map(row => ({
            user_id: row.user_id,
            resource_id: row.resource_id,
            name: row.name,
            total: number(row.total),
        })),
        members: membersResult.rows.map(row => ({
            user_id: row.user_id,
            resource_id: row.resource_id,
            name: row.name,
            workload_hrs: number(row.workload_hrs),
            capacity_hrs: number(row.capacity_hrs),
            logged_hrs: number(row.logged_hrs),
        })),
        blocked_items: blockedItems,
        overdue_items: overdueItems,
        team_bugs: teamBugs,
        reports_link: `/quality/reports?team_id=${encodeURIComponent(teamId)}`,
    };
}

async function getRelatedUserStories(db, storyIds, user, req) {
    const ids = [...new Set(storyIds.filter(Boolean))];
    if (ids.length === 0) return [];
    const storyFilter = await access.buildListFilter(user, 'user_story', 'view', { ...STORY_FILTER_OPTS, req, startIdx: 2 });
    const sql = `
        SELECT us.id, us.tuleap_artifact_id, us.title, us.status, us.priority,
               us.project_id, p.project_name
          FROM user_stories us
          LEFT JOIN projects p ON p.id = us.project_id
         WHERE us.deleted_at IS NULL
           AND us.id = ANY($1::uuid[])
           AND ${storyFilter.clause}
         ORDER BY us.updated_at DESC NULLS LAST, us.created_at DESC`;
    const result = await db.query(sql, [ids, ...storyFilter.params]);
    return result.rows;
}

async function getSharedWithMe(db, user) {
    const result = await db.query(
        `SELECT * FROM (
            SELECT 'task' AS artifact_type, t.id AS artifact_id, t.task_id AS display_id,
                   t.task_name AS title, t.status, aa.action
              FROM artifact_access aa
              JOIN tasks t ON t.id = aa.artifact_id AND aa.artifact_type = 'task'
             WHERE aa.subject_type = 'user' AND aa.subject_id = $1 AND t.deleted_at IS NULL
            UNION ALL
            SELECT 'bug' AS artifact_type, b.id AS artifact_id, b.bug_id AS display_id,
                   b.title, b.status, aa.action
              FROM artifact_access aa
              JOIN bugs b ON b.id = aa.artifact_id AND aa.artifact_type = 'bug'
             WHERE aa.subject_type = 'user' AND aa.subject_id = $1 AND b.deleted_at IS NULL
            UNION ALL
            SELECT 'user_story' AS artifact_type, us.id AS artifact_id,
                   us.tuleap_artifact_id::text AS display_id, us.title, us.status, aa.action
              FROM artifact_access aa
              JOIN user_stories us ON us.id = aa.artifact_id AND aa.artifact_type = 'user_story'
             WHERE aa.subject_type = 'user' AND aa.subject_id = $1 AND us.deleted_at IS NULL
        ) shared
        ORDER BY artifact_type, title
        LIMIT 25`,
        [user.id]
    );
    return result.rows;
}

async function getMemberDashboard(db, user, req) {
    const resolved = await resolveRole(user, req);
    const taskFilter = await access.buildListFilter(user, 'task', 'view', { ...TASK_FILTER_OPTS, req, startIdx: 2 });
    // ADR 0009 / #195 — "my tasks" = tasks where I'm any assignee (primary OR
    // any secondary, incl. 3rd+) via the junction, not just the two cached slots.
    const taskAssignmentWhere = `
        EXISTS (
            SELECT 1 FROM task_resource_assignment tra
              JOIN resources mine ON mine.id = tra.resource_id
             WHERE tra.task_id = t.id
               AND mine.user_id = $1
               AND mine.deleted_at IS NULL
        )`;
    const myTaskWhere = `${taskAssignmentWhere} AND ${withAccess('t.deleted_at IS NULL', taskFilter)}`;

    const myTasksResult = await db.query(
        `WITH ${TASK_ASSIGNMENT_ROLLUP_CTE}
         SELECT t.id, t.task_id, t.task_name, t.status, t.priority, t.project_id,
                p.project_name, t.owner_team_id, t.visibility_scope, t.created_by_user_id,
                t.parent_user_story_id, t.deadline,
                COALESCE(ar.total_estimated_hrs, 0) AS total_est_hrs,
                COALESCE(ar.total_estimated_hrs, 0) AS total_estimated_effort,
                COALESCE(ar.total_actual_hrs, 0) AS total_actual_hrs,
                COALESCE(ar.assignments, '[]'::jsonb) AS assignments,
                my_a.assignment_type AS my_assignment_type,
                COALESCE(my_a.estimate_hrs, 0) AS my_estimate_hrs,
                COALESCE(my_a.actual_hrs, 0) AS my_actual_hrs,
                my_a.completion_status AS my_completion_status
           FROM tasks t
           LEFT JOIN projects p ON p.id = t.project_id
           LEFT JOIN resources mine ON mine.user_id = $1 AND mine.deleted_at IS NULL
           LEFT JOIN task_resource_assignment my_a ON my_a.task_id = t.id AND my_a.resource_id = mine.id
           LEFT JOIN assignment_rollup ar ON ar.task_id = t.id
          WHERE ${myTaskWhere}
          ORDER BY t.deadline NULLS LAST, t.updated_at DESC
          LIMIT 50`,
        [user.id, ...taskFilter.params]
    );
    const myTasks = await Promise.all(myTasksResult.rows.map(async row => normalizeTask(row, await taskCan(user, resolved, row, req))));

    const dueThisWeek = myTasks
        .filter(task => task.deadline)
        .filter(task => !['Done', 'Canceled', 'Cancelled'].includes(task.status))
        .filter(task => {
            const due = new Date(task.deadline);
            const now = new Date();
            const week = new Date();
            week.setDate(now.getDate() + 7);
            return due >= new Date(now.toISOString().slice(0, 10)) && due <= week;
        });

    // ADR 0009 / #195 — logged time = the viewer's own actual_hrs across all
    // their assignments (owning + supporting) on this week's tasks, from the junction.
    const loggedResult = await db.query(
        `SELECT COALESCE(SUM(COALESCE(tra.actual_hrs, 0)), 0) AS hours
           FROM resources r
           JOIN task_resource_assignment tra ON tra.resource_id = r.id
           JOIN tasks t ON t.id = tra.task_id
          WHERE r.user_id = $1
            AND r.deleted_at IS NULL
            AND t.deleted_at IS NULL
            AND t.status IN ('In Progress', 'Done')
            AND t.updated_at >= date_trunc('week', CURRENT_DATE)
            AND t.updated_at < date_trunc('week', CURRENT_DATE) + INTERVAL '7 days'
            AND ${taskFilter.clause}`,
        [user.id, ...taskFilter.params]
    );

    let myBugs = [];
    let bugStoryIds = [];
    if (hasPermission(resolved, 'qc.bugs.view_own') || hasPermission(resolved, 'qc.bugs.view_team') || hasPermission(resolved, 'qc.bugs.view_any')) {
        const bugFilter = await access.buildListFilter(user, 'bug', 'view', { ...BUG_FILTER_OPTS, req, startIdx: 2 });
        const bugWhere = `
            EXISTS (
                SELECT 1 FROM resources mine
                 WHERE mine.user_id = $1
                   AND mine.deleted_at IS NULL
                   AND mine.id = b.owner_resource_id
            )
            AND ${withAccess('b.deleted_at IS NULL', bugFilter)}`;
        const bugsResult = await db.query(
            `SELECT b.id, b.bug_id, b.tuleap_artifact_id, b.title, b.status, b.severity,
                    b.priority, b.project_id, p.project_name, b.owner_team_id
               FROM bugs b
               LEFT JOIN projects p ON p.id = b.project_id
              WHERE ${bugWhere}
              ORDER BY b.updated_at DESC
              LIMIT 50`,
            [user.id, ...bugFilter.params]
        );
        myBugs = bugsResult.rows;

        if (myBugs.length > 0) {
            const bugStoryResult = await db.query(
                `SELECT DISTINCT bus.user_story_id
                   FROM bug_user_stories bus
                  WHERE bus.bug_id = ANY($1::uuid[])`,
                [myBugs.map(b => b.id)]
            );
            bugStoryIds = bugStoryResult.rows.map(row => row.user_story_id);
        }
    }

    const relatedUserStories = await getRelatedUserStories(
        db,
        [...myTasks.map(task => task.parent_user_story_id), ...bugStoryIds],
        user,
        req
    );

    return {
        my_tasks: myTasks,
        my_bugs: myBugs,
        related_user_stories: relatedUserStories,
        due_this_week: dueThisWeek,
        logged_time_this_week: number(loggedResult.rows[0]?.hours),
        shared_with_me: await getSharedWithMe(db, user),
    };
}

module.exports = {
    getTeamDashboard,
    getMemberDashboard,
    canTakeOverTask,
    canEditTask,
};

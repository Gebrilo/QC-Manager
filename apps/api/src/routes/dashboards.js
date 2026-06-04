'use strict';

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth, requirePermission } = require('../middleware/authMiddleware');
const access = require('../access/AccessEngine');
const svc = require('../services/dashboards/pmDashboard');

// Column overrides per artifact type — passed to buildListFilter so we never
// reference a column that doesn't exist on a given table.
// (AccessEngine.buildListFilter defaults are tuned for `tasks`-style tables.)
const FILTER_OPTS = {
    tasks: {
        // defaults are correct for tasks
    },
    bugs: {
        assigneeResourceExprs: ['bugs.owner_resource_id'],
        userExprs: ['bugs.created_by_user_id'],
    },
    user_stories: {
        assigneeResourceExprs: [],
        userExprs: ['user_stories.created_by_user_id'],
    },
    test_executions: {
        assigneeResourceExprs: [],
        userExprs: ['test_executions.executed_by', 'test_executions.created_by_user_id'],
    },
};

async function listPmProjects(userId) {
    const r = await db.query(
        `SELECT pm.project_id, p.project_name
           FROM project_managers pm
           JOIN projects p ON p.id = pm.project_id
          WHERE pm.user_id = $1
            AND p.deleted_at IS NULL
          ORDER BY p.project_name`,
        [userId]
    );
    return r.rows;
}

async function buildFilterMap(user, req) {
    return {
        tasks:        await access.buildListFilter(user, 'task',       'view', { ...FILTER_OPTS.tasks,        req, startIdx: 2 }),
        bugs:         await access.buildListFilter(user, 'bug',        'view', { ...FILTER_OPTS.bugs,         req, startIdx: 2 }),
        user_stories: await access.buildListFilter(user, 'user_story', 'view', { ...FILTER_OPTS.user_stories, req, startIdx: 2 }),
    };
}

router.get(
    '/pm',
    requireAuth,
    requirePermission('qc.dashboard.pm.view'),
    async (req, res, next) => {
        try {
            const projects = await listPmProjects(req.user.id);
            if (projects.length === 0) {
                return res.json({ projects: [] });
            }

            const filters = await buildFilterMap(req.user, req);

            const out = [];
            for (const p of projects) {
                const [
                    total_workload,
                    tasks_by_status,
                    tasks_by_team,
                    bugs_by_status,
                    bugs_by_severity,
                    user_stories,
                    blocked_count,
                    overdue_count,
                    resources,
                    cross_team_dependencies,
                    test_execution_summary,
                ] = await Promise.all([
                    svc.getWorkloadCounts(db, p.project_id, filters),
                    svc.getTasksByStatus(db, p.project_id, filters.tasks),
                    svc.getTasksByTeam(db, p.project_id, filters.tasks),
                    svc.getBugsByStatus(db, p.project_id, filters.bugs),
                    svc.getBugsBySeverity(db, p.project_id, filters.bugs),
                    svc.getUserStoryProgress(db, p.project_id, filters.user_stories),
                    svc.getBlockedCount(db, p.project_id),
                    svc.getOverdueCount(db, p.project_id, filters.tasks),
                    svc.getResourceUtilization(db, p.project_id, filters.tasks),
                    svc.getCrossTeamDependencies(db, p.project_id),
                    svc.getTestExecutionSummary(db, p.project_id),
                ]);

                out.push({
                    project_id: p.project_id,
                    project_name: p.project_name,
                    total_workload,
                    tasks_by_status,
                    tasks_by_team,
                    bugs_by_status,
                    bugs_by_severity,
                    user_stories,
                    blocked_count,
                    overdue_count,
                    resources,
                    cross_team_dependencies,
                    test_execution_summary,
                });
            }

            res.json({ projects: out });
        } catch (err) {
            next(err);
        }
    }
);

module.exports = router;

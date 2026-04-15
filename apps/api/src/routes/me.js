const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { requireAuth, requirePermission } = require('../middleware/authMiddleware');

async function dashboardHandler(req, res) {
    try {
        const resourceRes = await pool.query(
            `SELECT id, resource_name, department
             FROM resources
             WHERE user_id = $1 AND deleted_at IS NULL AND is_active = true
             LIMIT 1`,
            [req.user.id]
        );

        if (resourceRes.rows.length === 0) {
            return res.status(404).json({ error: 'No resource linked to your account' });
        }

        const resource = resourceRes.rows[0];
        const resourceId = resource.id;

        const tasksRes = await pool.query(
            `SELECT
                t.status,
                t.project_id,
                p.project_name,
                CASE WHEN t.resource1_id = $1
                     THEN COALESCE(t.r1_estimate_hrs, 0)
                     ELSE COALESCE(t.r2_estimate_hrs, 0)
                END AS estimate_hrs,
                CASE WHEN t.resource1_id = $1
                     THEN COALESCE(t.r1_actual_hrs, 0)
                     ELSE COALESCE(t.r2_actual_hrs, 0)
                END AS actual_hrs
             FROM tasks t
             LEFT JOIN projects p ON t.project_id = p.id
             WHERE (t.resource1_id = $1 OR t.resource2_id = $1)
               AND t.deleted_at IS NULL`,
            [resourceId]
        );

        const tasks = tasksRes.rows;

        const totalTasks = tasks.length;
        const projectIds = new Set(tasks.map(t => t.project_id).filter(Boolean));
        const totalProjects = projectIds.size;
        const totalActual = tasks.reduce((s, t) => s + Number(t.actual_hrs), 0);
        const totalEstimate = tasks.reduce((s, t) => s + Number(t.estimate_hrs), 0);
        const hoursVariance = Math.round((totalActual - totalEstimate) * 100) / 100;

        const taskDistribution = {};
        for (const t of tasks) {
            if (t.status) {
                taskDistribution[t.status] = (taskDistribution[t.status] || 0) + 1;
            }
        }

        const projectMap = {};
        for (const t of tasks) {
            const key = t.project_id || 'unassigned';
            if (!projectMap[key]) {
                projectMap[key] = {
                    project_id: t.project_id || null,
                    project_name: t.project_name || 'Unassigned',
                    total: 0,
                    done: 0,
                    in_progress: 0,
                    backlog: 0,
                };
            }
            projectMap[key].total++;
            if (t.status === 'Done') projectMap[key].done++;
            else if (t.status === 'In Progress') projectMap[key].in_progress++;
            else if (t.status === 'Backlog') projectMap[key].backlog++;
        }
        const tasksByProject = Object.values(projectMap);

        const bugsRes = await pool.query(
            `SELECT
                b.id,
                b.bug_id,
                b.tuleap_url,
                b.title,
                b.status,
                b.severity,
                p.project_name,
                b.reported_date AS creation_date
             FROM bugs b
             LEFT JOIN projects p ON b.project_id = p.id
             WHERE b.submitted_by_resource_id = $1
               AND b.deleted_at IS NULL
             ORDER BY b.reported_date DESC NULLS LAST, b.created_at DESC
             LIMIT 100`,
            [resourceId]
        );

        res.json({
            profile: {
                resource_id: resource.id,
                resource_name: resource.resource_name,
                department: resource.department,
            },
            summary: {
                total_tasks: totalTasks,
                total_projects: totalProjects,
                hours_variance: hoursVariance,
            },
            task_distribution: taskDistribution,
            tasks_by_project: tasksByProject,
            submitted_bugs: bugsRes.rows,
        });
    } catch (err) {
        console.error('GET /me/dashboard error:', err);
        res.status(500).json({ error: 'Failed to load dashboard' });
    }
}

router.get('/dashboard', requireAuth, requirePermission('page:my-dashboard'), dashboardHandler);

module.exports = router;
module.exports.testExports = { dashboardHandler };

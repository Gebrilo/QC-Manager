const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { optionalAuth } = require('../middleware/authMiddleware');
const { getManagerTeamId } = require('../middleware/teamAccess');

const EMPTY_METRICS = {
    total_tasks: 0,
    tasks_done: 0,
    tasks_in_progress: 0,
    tasks_backlog: 0,
    tasks_cancelled: 0,
    overall_completion_rate_pct: 0,
    total_estimated_hrs: 0,
    total_actual_hrs: 0,
    total_hours_variance: 0,
    total_projects: 0,
    projects_with_tasks: 0,
    active_resources: 0,
    overallocated_resources: 0,
    calculated_at: new Date()
};

/**
 * Build team-scoped dashboard metrics for a manager.
 * Computes the same fields as v_dashboard_metrics but filtered by team_id.
 */
async function getTeamMetrics(teamId) {
    const result = await db.query(`
        SELECT
            COUNT(DISTINCT t.id) AS total_tasks,
            SUM(CASE WHEN t.status = 'Done' THEN 1 ELSE 0 END) AS tasks_done,
            SUM(CASE WHEN t.status = 'In Progress' THEN 1 ELSE 0 END) AS tasks_in_progress,
            SUM(CASE WHEN t.status = 'Backlog' THEN 1 ELSE 0 END) AS tasks_backlog,
            SUM(CASE WHEN t.status = 'Cancelled' THEN 1 ELSE 0 END) AS tasks_cancelled,
            CASE
                WHEN SUM(COALESCE(t.r1_estimate_hrs, 0) + COALESCE(t.r2_estimate_hrs, 0)) > 0 THEN
                    ROUND((SUM(CASE WHEN t.status = 'Done' THEN COALESCE(t.r1_actual_hrs, 0) + COALESCE(t.r2_actual_hrs, 0) ELSE 0 END) /
                           NULLIF(SUM(COALESCE(t.r1_estimate_hrs, 0) + COALESCE(t.r2_estimate_hrs, 0)), 0) * 100)::NUMERIC, 2)
                ELSE 0
            END AS overall_completion_rate_pct,
            SUM(COALESCE(t.r1_estimate_hrs, 0) + COALESCE(t.r2_estimate_hrs, 0)) AS total_estimated_hrs,
            SUM(COALESCE(t.r1_actual_hrs, 0) + COALESCE(t.r2_actual_hrs, 0)) AS total_actual_hrs,
            SUM(COALESCE(t.r1_actual_hrs, 0) + COALESCE(t.r2_actual_hrs, 0)) - SUM(COALESCE(t.r1_estimate_hrs, 0) + COALESCE(t.r2_estimate_hrs, 0)) AS total_hours_variance,
            COUNT(DISTINCT p.id) AS total_projects,
            COUNT(DISTINCT CASE WHEN t.id IS NOT NULL THEN p.id END) AS projects_with_tasks,
            (
                SELECT COUNT(*) FROM resources r
                JOIN app_user u ON u.id = r.user_id
                WHERE u.team_id = $1 AND r.is_active = TRUE AND r.deleted_at IS NULL
            ) AS active_resources,
            0 AS overallocated_resources,
            CURRENT_TIMESTAMP AS calculated_at
        FROM projects p
        LEFT JOIN tasks t ON p.id = t.project_id AND t.deleted_at IS NULL
        WHERE p.deleted_at IS NULL AND p.team_id = $1
    `, [teamId]);

    return result.rows.length > 0 ? result.rows[0] : EMPTY_METRICS;
}

// GET dashboard metrics — scoped by team for managers
router.get('/', optionalAuth, async (req, res, next) => {
    try {
        // Manager: scope metrics to their team
        if (req.user?.role === 'manager') {
            const teamId = await getManagerTeamId(req.user.id);
            if (!teamId) return res.json(EMPTY_METRICS);
            const metrics = await getTeamMetrics(teamId);
            return res.json(metrics);
        }

        // Admin or unauthenticated: global metrics
        const result = await db.query('SELECT * FROM v_dashboard_metrics');
        res.json(result.rows.length > 0 ? result.rows[0] : EMPTY_METRICS);
    } catch (err) {
        next(err);
    }
});

// GET /metrics (alias) — same scoping logic
router.get('/metrics', optionalAuth, async (req, res, next) => {
    try {
        if (req.user?.role === 'manager') {
            const teamId = await getManagerTeamId(req.user.id);
            if (!teamId) return res.json(EMPTY_METRICS);
            const metrics = await getTeamMetrics(teamId);
            return res.json(metrics);
        }

        const result = await db.query('SELECT * FROM v_dashboard_metrics');
        res.json(result.rows.length > 0 ? result.rows[0] : EMPTY_METRICS);
    } catch (err) {
        next(err);
    }
});

module.exports = router;

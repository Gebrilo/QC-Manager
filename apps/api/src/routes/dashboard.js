const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET dashboard metrics (from v_dashboard_metrics view)
router.get('/', async (req, res, next) => {
    try {
        const result = await db.query('SELECT * FROM v_dashboard_metrics');
        
        // View returns single row with all metrics
        if (result.rows.length === 0) {
            return res.json({
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
            });
        }

        res.json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

// GET /metrics (alias for /)
router.get('/metrics', async (req, res, next) => {
    try {
        const result = await db.query('SELECT * FROM v_dashboard_metrics');
        
        if (result.rows.length === 0) {
            return res.json({
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
            });
        }

        res.json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

module.exports = router;

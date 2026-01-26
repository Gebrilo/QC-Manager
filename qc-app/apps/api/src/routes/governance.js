/**
 * Governance Dashboard API Routes
 * Phase 2: Release Readiness, Risk Assessment, Project Health
 */

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const pool = db.pool;

// =====================================================
// GET /governance/release-readiness
// Get release readiness for all projects or specific project
// =====================================================
router.get('/release-readiness', async (req, res) => {
    try {
        const { project_id, status } = req.query;

        let query = `
            SELECT
                project_id,
                project_name,
                project_status,
                latest_pass_rate_pct,
                latest_not_run_pct,
                latest_failed_count,
                latest_fail_rate_pct,
                days_since_latest_execution,
                total_test_cases,
                latest_tests_executed,
                latest_passed_count,
                latest_execution_date,
                readiness_status,
                blocking_issues,
                blocking_issue_count,
                recommendation,
                created_at,
                updated_at
            FROM v_release_readiness
            WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;

        // Filter by project_id if provided
        if (project_id) {
            query += ` AND project_id = $${paramIndex}`;
            params.push(project_id);
            paramIndex++;
        }

        // Filter by readiness status if provided
        if (status) {
            query += ` AND readiness_status = $${paramIndex}`;
            params.push(status.toUpperCase());
            paramIndex++;
        }

        query += ' ORDER BY blocking_issue_count DESC, project_name';

        const result = await pool.query(query, params);

        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching release readiness:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch release readiness data',
            message: error.message
        });
    }
});

// =====================================================
// GET /governance/release-readiness/:projectId
// Get release readiness for a specific project
// =====================================================
router.get('/release-readiness/:projectId', async (req, res) => {
    try {
        const { projectId } = req.params;

        const query = `
            SELECT
                project_id,
                project_name,
                project_status,
                latest_pass_rate_pct,
                latest_not_run_pct,
                latest_failed_count,
                latest_fail_rate_pct,
                days_since_latest_execution,
                total_test_cases,
                latest_tests_executed,
                latest_passed_count,
                latest_execution_date,
                readiness_status,
                blocking_issues,
                blocking_issue_count,
                recommendation,
                created_at,
                updated_at
            FROM v_release_readiness
            WHERE project_id = $1
        `;

        const result = await pool.query(query, [projectId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error fetching project release readiness:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch project release readiness',
            message: error.message
        });
    }
});

// =====================================================
// GET /governance/quality-risks
// Get quality risk assessment for all projects
// =====================================================
router.get('/quality-risks', async (req, res) => {
    try {
        const { risk_level } = req.query;

        let query = `
            SELECT
                project_id,
                project_name,
                project_status,
                latest_pass_rate_pct,
                latest_not_run_pct,
                latest_failed_count,
                days_since_latest_execution,
                total_test_cases,
                recent_pass_rate,
                previous_pass_rate,
                pass_rate_change,
                recent_execution_days,
                risk_flags,
                risk_flag_count,
                risk_level
            FROM v_quality_risks
            WHERE 1=1
        `;

        const params = [];

        // Filter by risk level if provided
        if (risk_level) {
            query += ` AND risk_level = $1`;
            params.push(risk_level.toUpperCase());
        }

        query += ' ORDER BY risk_flag_count DESC, project_name';

        const result = await pool.query(query, params);

        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching quality risks:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch quality risks',
            message: error.message
        });
    }
});

// =====================================================
// GET /governance/quality-risks/:projectId
// Get quality risk assessment for a specific project
// =====================================================
router.get('/quality-risks/:projectId', async (req, res) => {
    try {
        const { projectId } = req.params;

        const query = `
            SELECT
                project_id,
                project_name,
                project_status,
                latest_pass_rate_pct,
                latest_not_run_pct,
                latest_failed_count,
                days_since_latest_execution,
                total_test_cases,
                recent_pass_rate,
                previous_pass_rate,
                pass_rate_change,
                recent_execution_days,
                risk_flags,
                risk_flag_count,
                risk_level
            FROM v_quality_risks
            WHERE project_id = $1
        `;

        const result = await pool.query(query, [projectId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error fetching project quality risks:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch project quality risks',
            message: error.message
        });
    }
});

// =====================================================
// GET /governance/workload-balance
// Get workload balance assessment for all projects
// =====================================================
router.get('/workload-balance', async (req, res) => {
    try {
        const { balance_status } = req.query;

        let query = `
            SELECT
                project_id,
                project_name,
                total_tasks,
                total_tests,
                tests_per_task_ratio,
                balance_status
            FROM v_workload_balance
            WHERE 1=1
        `;

        const params = [];

        // Filter by balance status if provided
        if (balance_status) {
            query += ` AND balance_status = $1`;
            params.push(balance_status.toUpperCase());
        }

        query += ' ORDER BY tests_per_task_ratio ASC, project_name';

        const result = await pool.query(query, params);

        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching workload balance:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch workload balance',
            message: error.message
        });
    }
});

// =====================================================
// GET /governance/project-health
// Get comprehensive project health summary
// =====================================================
router.get('/project-health', async (req, res) => {
    try {
        const { health_status } = req.query;

        let query = `
            SELECT
                project_id,
                project_name,
                project_status,
                readiness_status,
                risk_level,
                balance_status,
                overall_health_status,
                action_items,
                latest_pass_rate_pct,
                latest_failed_count,
                days_since_latest_execution,
                total_test_cases,
                total_tasks,
                total_tests,
                tests_per_task_ratio,
                latest_execution_date,
                blocking_issue_count,
                risk_flag_count,
                risk_flags,
                pass_rate_change
            FROM v_project_health_summary
            WHERE 1=1
        `;

        const params = [];

        // Filter by health status if provided
        if (health_status) {
            query += ` AND overall_health_status = $1`;
            params.push(health_status.toUpperCase());
        }

        query += `
            ORDER BY
                CASE overall_health_status
                    WHEN 'RED' THEN 1
                    WHEN 'AMBER' THEN 2
                    WHEN 'GREEN' THEN 3
                END,
                project_name
        `;

        const result = await pool.query(query, params);

        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching project health:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch project health',
            message: error.message
        });
    }
});

// =====================================================
// GET /governance/project-health/:projectId
// Get comprehensive health summary for a specific project
// =====================================================
router.get('/project-health/:projectId', async (req, res) => {
    try {
        const { projectId } = req.params;

        const query = `
            SELECT
                project_id,
                project_name,
                project_status,
                readiness_status,
                risk_level,
                balance_status,
                overall_health_status,
                action_items,
                latest_pass_rate_pct,
                latest_failed_count,
                days_since_latest_execution,
                total_test_cases,
                total_tasks,
                total_tests,
                tests_per_task_ratio,
                latest_execution_date,
                blocking_issue_count,
                risk_flag_count,
                risk_flags,
                pass_rate_change
            FROM v_project_health_summary
            WHERE project_id = $1
        `;

        const result = await pool.query(query, [projectId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error fetching project health summary:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch project health summary',
            message: error.message
        });
    }
});

// =====================================================
// GET /governance/dashboard-summary
// Get aggregated dashboard statistics
// =====================================================
router.get('/dashboard-summary', async (req, res) => {
    try {
        const summaryQuery = `
            WITH stats AS (
                SELECT
                    COUNT(*) AS total_projects,
                    COUNT(*) FILTER (WHERE overall_health_status = 'GREEN') AS green_count,
                    COUNT(*) FILTER (WHERE overall_health_status = 'AMBER') AS amber_count,
                    COUNT(*) FILTER (WHERE overall_health_status = 'RED') AS red_count,
                    COUNT(*) FILTER (WHERE readiness_status = 'GREEN') AS ready_for_release,
                    COUNT(*) FILTER (WHERE readiness_status = 'RED') AS not_ready_for_release,
                    COUNT(*) FILTER (WHERE risk_level = 'CRITICAL') AS critical_risk_count,
                    COUNT(*) FILTER (WHERE risk_level = 'WARNING') AS warning_risk_count,
                    COUNT(*) FILTER (WHERE risk_level = 'NORMAL') AS normal_risk_count
                FROM v_project_health_summary
            )
            SELECT * FROM stats;
        `;

        const result = await pool.query(summaryQuery);

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error fetching dashboard summary:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch dashboard summary',
            message: error.message
        });
    }
});

// =====================================================
// GET /governance/gates/:projectId
// Get quality gates configuration for a project
// =====================================================
router.get('/gates/:projectId', async (req, res) => {
    try {
        const { projectId } = req.params;
        const result = await pool.query(
            'SELECT * FROM quality_gates WHERE project_id = $1',
            [projectId]
        );

        if (result.rows.length === 0) {
            // Return defaults if no custom gates set
            return res.json({
                success: true,
                data: {
                    project_id: projectId,
                    min_pass_rate: 95.0,
                    max_critical_defects: 0,
                    min_test_coverage: 80.0,
                    is_default: true
                }
            });
        }

        res.json({
            success: true,
            data: { ...result.rows[0], is_default: false }
        });
    } catch (error) {
        console.error('Error fetching quality gates:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch gates' });
    }
});

// =====================================================
// POST /governance/gates
// Create or update quality gates for a project
// =====================================================
router.post('/gates', async (req, res) => {
    try {
        const { project_id, min_pass_rate, max_critical_defects, min_test_coverage } = req.body;

        const result = await pool.query(`
            INSERT INTO quality_gates (project_id, min_pass_rate, max_critical_defects, min_test_coverage, updated_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (project_id) 
            DO UPDATE SET 
                min_pass_rate = EXCLUDED.min_pass_rate,
                max_critical_defects = EXCLUDED.max_critical_defects,
                min_test_coverage = EXCLUDED.min_test_coverage,
                updated_at = NOW()
            RETURNING *
        `, [project_id, min_pass_rate, max_critical_defects, min_test_coverage]);

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error saving quality gates:', error);
        res.status(500).json({ success: false, error: 'Failed to save gates' });
    }
});

// =====================================================
// POST /governance/approvals
// Submit a release approval or rejection
// =====================================================
router.post('/approvals', async (req, res) => {
    try {
        const { project_id, release_version, status, approver_name, comments, gate_snapshot } = req.body;

        const result = await pool.query(`
            INSERT INTO release_approvals (
                project_id, release_version, status, approver_name, comments, gate_snapshot
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [project_id, release_version, status, approver_name, comments, gate_snapshot]);

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error submitting approval:', error);
        res.status(500).json({ success: false, error: 'Failed to submit approval' });
    }
});

// =====================================================
// GET /governance/approvals/:projectId
// Get approval history for a project
// =====================================================
router.get('/approvals/:projectId', async (req, res) => {
    try {
        const { projectId } = req.params;
        const result = await pool.query(
            'SELECT * FROM release_approvals WHERE project_id = $1 ORDER BY created_at DESC',
            [projectId]
        );

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching approvals:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch approvals' });
    }
});

// =====================================================
// Trend Analysis (Mock for now, as DB view implementation is complex)
// =====================================================
router.get('/execution-trend', async (req, res) => {
    // Return empty to trigger mock on frontend, or implement simple query if execution_history exists
    // For now, let frontend handle mock if API returns 404 or empty
    res.status(404).json({ success: false, message: 'Not implemented' });
});

module.exports = router;

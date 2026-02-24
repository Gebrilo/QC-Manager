/**
 * Governance Dashboard API Routes
 * Phase 2: Release Readiness, Risk Assessment, Project Health
 */

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const pool = db.pool;
const { requireAuth, requirePermission } = require('../middleware/authMiddleware');

// =====================================================
// GET /governance/release-readiness
// Get release readiness for all projects or specific project
// =====================================================
router.get('/release-readiness', requireAuth, requirePermission('page:governance'), async (req, res) => {
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
router.get('/release-readiness/:projectId', requireAuth, requirePermission('page:governance'), async (req, res) => {
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
router.get('/quality-risks', requireAuth, requirePermission('page:governance'), async (req, res) => {
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
router.get('/quality-risks/:projectId', requireAuth, requirePermission('page:governance'), async (req, res) => {
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
router.get('/workload-balance', requireAuth, requirePermission('page:governance'), async (req, res) => {
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

        // Transform data to ensure correct types and balance_status
        const transformedData = result.rows.map(row => {
            const totalTasks = parseInt(row.total_tasks, 10) || 0;
            const totalTests = parseInt(row.total_tests, 10) || 0;

            // Recalculate balance_status based on actual values
            let balanceStatus = row.balance_status;
            if (totalTasks === 0) {
                balanceStatus = 'NO_TASKS';
            } else if (totalTests === 0) {
                balanceStatus = 'NO_TESTS';
            } else {
                const ratio = totalTests / totalTasks;
                if (ratio >= 2) {
                    balanceStatus = 'OVER_TESTED';
                } else if (ratio >= 0.5) {
                    balanceStatus = 'BALANCED';
                } else {
                    balanceStatus = 'UNDER_TESTED';
                }
            }

            return {
                project_id: row.project_id,
                project_name: row.project_name,
                total_tasks: totalTasks,
                total_tests: totalTests,
                tests_per_task_ratio: row.tests_per_task_ratio,
                balance_status: balanceStatus
            };
        });

        res.json({
            success: true,
            count: transformedData.length,
            data: transformedData
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
router.get('/project-health', requireAuth, requirePermission('page:governance'), async (req, res) => {
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
router.get('/project-health/:projectId', requireAuth, requirePermission('page:governance'), async (req, res) => {
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
router.get('/dashboard-summary', requireAuth, requirePermission('page:governance'), async (req, res) => {
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
router.get('/gates/:projectId', requireAuth, requirePermission('page:governance'), async (req, res) => {
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
router.post('/gates', requireAuth, requirePermission('action:governance:manage_gates'), async (req, res) => {
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
router.post('/approvals', requireAuth, requirePermission('action:governance:approve_release'), async (req, res) => {
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
router.get('/approvals/:projectId', requireAuth, requirePermission('page:governance'), async (req, res) => {
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
// GET /governance/execution-trend
// Get daily pass rate trend for last 30 days
// =====================================================
router.get('/execution-trend', requireAuth, requirePermission('page:governance'), async (req, res) => {
    try {
        const { project_id } = req.query;

        let query = `
            WITH date_series AS (
                SELECT generate_series(
                    CURRENT_DATE - INTERVAL '29 days',
                    CURRENT_DATE,
                    INTERVAL '1 day'
                )::DATE AS date
            ),
            daily_stats AS (
                SELECT 
                    DATE(tr.started_at) AS execution_date,
                    ${project_id ? 'tr.project_id,' : ''}
                    SUM(
                        COALESCE((
                            SELECT COUNT(*) FROM test_execution te 
                            WHERE te.test_run_id = tr.id AND te.status = 'pass'
                        ), 0)
                    ) AS passed_count,
                    SUM(
                        COALESCE((
                            SELECT COUNT(*) FROM test_execution te 
                            WHERE te.test_run_id = tr.id
                        ), 0)
                    ) AS total_tests
                FROM test_run tr
                WHERE tr.deleted_at IS NULL
                    AND tr.started_at >= CURRENT_DATE - INTERVAL '30 days'
                    ${project_id ? 'AND tr.project_id = $1' : ''}
                GROUP BY DATE(tr.started_at)${project_id ? ', tr.project_id' : ''}
            )
            SELECT 
                ds.date,
                COALESCE(
                    CASE 
                        WHEN dst.total_tests > 0 
                        THEN ROUND((dst.passed_count::NUMERIC / dst.total_tests) * 100, 2)
                        ELSE NULL
                    END,
                    NULL
                ) AS pass_rate,
                COALESCE(dst.total_tests, 0) AS total_tests,
                COALESCE(dst.passed_count, 0) AS passed_count
            FROM date_series ds
            LEFT JOIN daily_stats dst ON ds.date = dst.execution_date
            ORDER BY ds.date ASC
        `;

        const params = project_id ? [project_id] : [];
        const result = await pool.query(query, params);

        // Transform for frontend compatibility
        const trendData = result.rows.map(row => ({
            date: row.date,
            passRate: row.pass_rate !== null ? parseFloat(row.pass_rate) : null,
            totalTests: parseInt(row.total_tests, 10),
            passedCount: parseInt(row.passed_count, 10)
        }));

        res.json({
            success: true,
            count: trendData.length,
            data: trendData
        });
    } catch (error) {
        console.error('Error fetching execution trend:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch execution trend',
            message: error.message
        });
    }
});

// =====================================================
// GET /governance/global-settings
// Get global quality gate settings
// =====================================================
router.get('/global-settings', requireAuth, requirePermission('page:governance'), async (req, res) => {
    try {
        // Ensure table exists
        await pool.query(`
            CREATE TABLE IF NOT EXISTS governance_settings (
                id INTEGER PRIMARY KEY DEFAULT 1,
                min_pass_rate_green NUMERIC(5,2) DEFAULT 95.0,
                max_not_run_green NUMERIC(5,2) DEFAULT 5.0,
                max_days_stale_green INTEGER DEFAULT 3,
                max_failing_tests_green INTEGER DEFAULT 0,
                min_pass_rate_amber NUMERIC(5,2) DEFAULT 80.0,
                max_not_run_amber NUMERIC(5,2) DEFAULT 15.0,
                max_days_stale_amber INTEGER DEFAULT 7,
                low_pass_rate_trigger NUMERIC(5,2) DEFAULT 80.0,
                high_not_run_trigger NUMERIC(5,2) DEFAULT 20.0,
                stale_tests_trigger INTEGER DEFAULT 14,
                high_failure_count_trigger INTEGER DEFAULT 10,
                declining_trend_trigger NUMERIC(5,2) DEFAULT 10.0,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT single_row CHECK (id = 1)
            )
        `);

        const result = await pool.query(
            'SELECT * FROM governance_settings WHERE id = 1'
        );

        if (result.rows.length === 0) {
            // Return defaults
            return res.json({
                success: true,
                data: {
                    min_pass_rate_green: 95.0,
                    max_not_run_green: 5.0,
                    max_days_stale_green: 3,
                    max_failing_tests_green: 0,
                    min_pass_rate_amber: 80.0,
                    max_not_run_amber: 15.0,
                    max_days_stale_amber: 7,
                    low_pass_rate_trigger: 80.0,
                    high_not_run_trigger: 20.0,
                    stale_tests_trigger: 14,
                    high_failure_count_trigger: 10,
                    declining_trend_trigger: 10.0,
                    is_default: true
                }
            });
        }

        res.json({
            success: true,
            data: { ...result.rows[0], is_default: false }
        });
    } catch (error) {
        console.error('Error fetching global settings:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch settings' });
    }
});

// =====================================================
// POST /governance/global-settings
// Save global quality gate settings
// =====================================================
router.post('/global-settings', requireAuth, requirePermission('action:governance:manage_gates'), async (req, res) => {
    try {
        const settings = req.body;

        // Create table if not exists
        await pool.query(`
            CREATE TABLE IF NOT EXISTS governance_settings (
                id INTEGER PRIMARY KEY DEFAULT 1,
                min_pass_rate_green NUMERIC(5,2) DEFAULT 95.0,
                max_not_run_green NUMERIC(5,2) DEFAULT 5.0,
                max_days_stale_green INTEGER DEFAULT 3,
                max_failing_tests_green INTEGER DEFAULT 0,
                min_pass_rate_amber NUMERIC(5,2) DEFAULT 80.0,
                max_not_run_amber NUMERIC(5,2) DEFAULT 15.0,
                max_days_stale_amber INTEGER DEFAULT 7,
                low_pass_rate_trigger NUMERIC(5,2) DEFAULT 80.0,
                high_not_run_trigger NUMERIC(5,2) DEFAULT 20.0,
                stale_tests_trigger INTEGER DEFAULT 14,
                high_failure_count_trigger INTEGER DEFAULT 10,
                declining_trend_trigger NUMERIC(5,2) DEFAULT 10.0,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT single_row CHECK (id = 1)
            )
        `);

        const result = await pool.query(`
            INSERT INTO governance_settings (
                id,
                min_pass_rate_green,
                max_not_run_green,
                max_days_stale_green,
                max_failing_tests_green,
                min_pass_rate_amber,
                max_not_run_amber,
                max_days_stale_amber,
                low_pass_rate_trigger,
                high_not_run_trigger,
                stale_tests_trigger,
                high_failure_count_trigger,
                declining_trend_trigger,
                updated_at
            ) VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
            ON CONFLICT (id) DO UPDATE SET
                min_pass_rate_green = EXCLUDED.min_pass_rate_green,
                max_not_run_green = EXCLUDED.max_not_run_green,
                max_days_stale_green = EXCLUDED.max_days_stale_green,
                max_failing_tests_green = EXCLUDED.max_failing_tests_green,
                min_pass_rate_amber = EXCLUDED.min_pass_rate_amber,
                max_not_run_amber = EXCLUDED.max_not_run_amber,
                max_days_stale_amber = EXCLUDED.max_days_stale_amber,
                low_pass_rate_trigger = EXCLUDED.low_pass_rate_trigger,
                high_not_run_trigger = EXCLUDED.high_not_run_trigger,
                stale_tests_trigger = EXCLUDED.stale_tests_trigger,
                high_failure_count_trigger = EXCLUDED.high_failure_count_trigger,
                declining_trend_trigger = EXCLUDED.declining_trend_trigger,
                updated_at = NOW()
            RETURNING *
        `, [
            settings.min_pass_rate_green,
            settings.max_not_run_green,
            settings.max_days_stale_green,
            settings.max_failing_tests_green,
            settings.min_pass_rate_amber,
            settings.max_not_run_amber,
            settings.max_days_stale_amber,
            settings.low_pass_rate_trigger,
            settings.high_not_run_trigger,
            settings.stale_tests_trigger,
            settings.high_failure_count_trigger,
            settings.declining_trend_trigger
        ]);

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error saving global settings:', error);
        res.status(500).json({ success: false, error: 'Failed to save settings' });
    }
});

module.exports = router;

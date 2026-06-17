/**
 * Governance Dashboard API Routes
 * Phase 2: Release Readiness, Risk Assessment, Project Health
 */

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const pool = db.pool;
const { requireAuth, requirePermission, blockContributors } = require('../middleware/authMiddleware');
const { classifyWorkloadBalance } = require('../services/metrics/workloadBalance');

// =====================================================
// GET /governance/release-readiness
// Get release readiness for all projects or specific project
// =====================================================
router.get('/release-readiness', requireAuth, blockContributors, requirePermission('qc.governance.view'), async (req, res) => {
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
router.get('/release-readiness/:projectId', requireAuth, blockContributors, requirePermission('qc.governance.view'), async (req, res) => {
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
router.get('/quality-risks', requireAuth, blockContributors, requirePermission('qc.governance.view'), async (req, res) => {
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
router.get('/quality-risks/:projectId', requireAuth, blockContributors, requirePermission('qc.governance.view'), async (req, res) => {
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
router.get('/workload-balance', requireAuth, blockContributors, requirePermission('qc.governance.view'), async (req, res) => {
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

        // Transform data to ensure correct types and balance_status.
        // total_tests holds the count of COMPLETED test runs (see v_workload_balance).
        const transformedData = result.rows.map(row => {
            const totalTasks = parseInt(row.total_tasks, 10) || 0;
            const totalRuns = parseInt(row.total_tests, 10) || 0;

            return {
                project_id: row.project_id,
                project_name: row.project_name,
                total_tasks: totalTasks,
                total_tests: totalRuns,
                tests_per_task_ratio: row.tests_per_task_ratio,
                balance_status: classifyWorkloadBalance(totalRuns, totalTasks)
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
router.get('/project-health', requireAuth, blockContributors, requirePermission('qc.governance.view'), async (req, res) => {
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
router.get('/project-health/:projectId', requireAuth, blockContributors, requirePermission('qc.governance.view'), async (req, res) => {
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
router.get('/dashboard-summary', requireAuth, blockContributors, requirePermission('qc.governance.view'), async (req, res) => {
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
router.get('/gates/:projectId', requireAuth, blockContributors, requirePermission('qc.governance.view'), async (req, res) => {
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
router.post('/gates', requireAuth, blockContributors, requirePermission('qc.governance.manage_gates'), async (req, res) => {
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
router.post('/approvals', requireAuth, blockContributors, requirePermission('qc.governance.approve_release'), async (req, res) => {
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
router.get('/approvals/:projectId', requireAuth, blockContributors, requirePermission('qc.governance.view'), async (req, res) => {
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
router.get('/execution-trend', requireAuth, blockContributors, requirePermission('qc.governance.view'), async (req, res) => {
    try {
        const { project_id, date_from, date_to } = req.query;

        const params = [];
        let paramIdx = 1;

        const startExpr = date_from
            ? `$${paramIdx++}::DATE`
            : `CURRENT_DATE - INTERVAL '29 days'`;
        if (date_from) params.push(date_from);

        const endExpr = date_to
            ? `$${paramIdx++}::DATE`
            : `CURRENT_DATE`;
        if (date_to) params.push(date_to);

        const projectFilterStats = project_id ? `AND tr.project_id = $${paramIdx++}` : ``;
        if (project_id) params.push(project_id);

        let query = `
            WITH date_series AS (
                SELECT generate_series(
                    ${startExpr},
                    ${endExpr},
                    INTERVAL '1 day'
                )::DATE AS date
            ),
            daily_stats AS (
                SELECT
                    DATE(tr.started_at) AS execution_date,
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
                    AND tr.started_at >= ${startExpr}
                    AND tr.started_at <= ${endExpr} + INTERVAL '1 day'
                    ${projectFilterStats}
                GROUP BY DATE(tr.started_at)
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
router.get('/global-settings', requireAuth, blockContributors, requirePermission('qc.governance.view'), async (req, res) => {
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
router.post('/global-settings', requireAuth, blockContributors, requirePermission('qc.governance.manage_gates'), async (req, res) => {
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

// =====================================================
// GET /governance/quality-metrics
// Joins v_execution_progress + v_test_effectiveness
// =====================================================
router.get('/quality-metrics', requireAuth, blockContributors, requirePermission('qc.governance.view'), async (req, res) => {
    try {
        const { project_id } = req.query;
        let query = `
            SELECT
                ep.project_id,
                ep.project_name,
                ep.execution_coverage_pct,
                ep.requirement_coverage_pct,
                ep.gross_progress_pct,
                ep.net_progress_pct,
                ep.total_planned_tests,
                ep.executed_tests,
                ep.covered_requirements,
                ep.total_requirements,
                te.defects_from_testing,
                te.total_tests_run,
                te.effectiveness_pct
            FROM v_execution_progress ep
            LEFT JOIN v_test_effectiveness te ON ep.project_id = te.project_id
            WHERE 1=1
        `;
        const params = [];
        if (project_id) {
            query += ` AND ep.project_id = $1`;
            params.push(project_id);
        }
        query += ' ORDER BY ep.project_name';
        const result = await pool.query(query, params);
        res.json({ success: true, count: result.rows.length, data: result.rows });
    } catch (error) {
        console.error('Error fetching quality metrics:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch quality metrics', message: error.message });
    }
});

// =====================================================
// GET /governance/blocked-analysis
// Per-module blocked % with pivot flags
// =====================================================
router.get('/blocked-analysis', requireAuth, blockContributors, requirePermission('qc.governance.view'), async (req, res) => {
    try {
        const { project_id } = req.query;
        let query = `SELECT * FROM v_blocked_test_analysis WHERE 1=1`;
        const params = [];
        if (project_id) {
            query += ` AND project_id = $1`;
            params.push(project_id);
        }
        query += ' ORDER BY project_name, module_name';
        const result = await pool.query(query, params);
        res.json({ success: true, count: result.rows.length, data: result.rows });
    } catch (error) {
        console.error('Error fetching blocked analysis:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch blocked analysis', message: error.message });
    }
});

// =====================================================
// GET /governance/execution-progress
// Gross/Net Progress + Execution/Requirement Coverage
// =====================================================
router.get('/execution-progress', requireAuth, blockContributors, requirePermission('qc.governance.view'), async (req, res) => {
    try {
        const { project_id } = req.query;
        let query = `SELECT * FROM v_execution_progress WHERE 1=1`;
        const params = [];
        if (project_id) {
            query += ` AND project_id = $1`;
            params.push(project_id);
        }
        query += ' ORDER BY project_name';
        const result = await pool.query(query, params);
        res.json({ success: true, count: result.rows.length, data: result.rows });
    } catch (error) {
        console.error('Error fetching execution progress:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch execution progress', message: error.message });
    }
});

// =====================================================
// GET /governance/test-coverage
// Task & story test coverage using normalized task_test_cases
// =====================================================
router.get('/test-coverage', requireAuth, blockContributors, requirePermission('qc.governance.view'), async (req, res) => {
    try {
        const { project_id } = req.query;

        const taskCoverageQuery = `
            SELECT
                ttc.project_id,
                p.project_name,
                ttc.total_tasks,
                ttc.tasks_with_active_test_cases,
                ttc.task_test_coverage_pct
            FROM v_task_test_coverage ttc
            JOIN projects p ON p.id = ttc.project_id
            WHERE p.deleted_at IS NULL
                ${project_id ? 'AND ttc.project_id = $1' : ''}
            ORDER BY ttc.task_test_coverage_pct ASC
        `;
        const taskParams = project_id ? [project_id] : [];
        const taskResult = await pool.query(taskCoverageQuery, taskParams);

        const storyCoverageQuery = `
            SELECT
                ustc.project_id,
                p.project_name,
                ustc.total_user_stories,
                ustc.user_stories_with_active_test_cases,
                ustc.story_test_coverage_pct
            FROM v_user_story_test_coverage ustc
            JOIN projects p ON p.id = ustc.project_id
            WHERE p.deleted_at IS NULL
                ${project_id ? 'AND ustc.project_id = $1' : ''}
            ORDER BY ustc.story_test_coverage_pct ASC
        `;
        const storyResult = await pool.query(storyCoverageQuery, taskParams);

        res.json({
            success: true,
            data: {
                task_coverage: taskResult.rows,
                story_coverage: storyResult.rows
            }
        });
    } catch (error) {
        console.error('Error fetching test coverage:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch test coverage', message: error.message });
    }
});

// =====================================================
// GET /governance/suite-readiness
// Per-suite readiness using latest completed test runs
// =====================================================
router.get('/suite-readiness', requireAuth, blockContributors, requirePermission('qc.governance.view'), async (req, res) => {
    try {
        const { project_id } = req.query;
        if (!project_id) {
            return res.status(400).json({ success: false, error: 'project_id query parameter is required' });
        }

        const projectCheck = await pool.query('SELECT id FROM projects WHERE id = $1 AND deleted_at IS NULL', [project_id]);
        if (projectCheck.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Project not found' });
        }

        const suiteQuery = `
            SELECT
                ts.id AS suite_id,
                ts.suite_id AS suite_display_id,
                ts.name AS suite_name,
                ts.suite_type,
                ts.readiness_scope,
                latest_run.id AS latest_run_id,
                latest_run.run_id AS latest_run_display_id,
                latest_run.name AS latest_run_name,
                latest_run.completed_at,
                run_stats.total_cases,
                run_stats.passed_count,
                run_stats.failed_count,
                run_stats.blocked_count,
                run_stats.not_run_count,
                run_stats.pass_rate,
                CASE
                    WHEN ts.readiness_scope = 'required' AND latest_run.id IS NULL THEN 'blocked'
                    WHEN ts.readiness_scope = 'required' AND run_stats.pass_rate IS NULL THEN 'blocked'
                    WHEN latest_run.id IS NULL THEN 'unknown'
                    WHEN run_stats.pass_rate >= 95 AND COALESCE(run_stats.failed_count, 0) = 0 THEN 'ready'
                    WHEN run_stats.pass_rate >= 80 THEN 'warning'
                    ELSE 'blocked'
                END AS readiness_status,
                CASE
                    WHEN ts.readiness_scope = 'required' AND latest_run.id IS NULL THEN 'missing_required_suite_run'
                    WHEN COALESCE(run_stats.failed_count, 0) > 0 THEN 'failed_cases_present'
                    WHEN COALESCE(run_stats.blocked_count, 0) > 0 THEN 'blocked_cases_present'
                    WHEN run_stats.pass_rate IS NULL THEN 'no_run_data'
                    WHEN run_stats.pass_rate < 80 THEN 'pass_rate_below_threshold'
                    ELSE NULL
                END AS risk_reason
            FROM test_suites ts
            LEFT JOIN LATERAL (
                SELECT tr.id, tr.run_id, tr.name, tr.completed_at
                FROM test_run tr
                WHERE tr.suite_id = ts.id
                  AND tr.deleted_at IS NULL
                  AND tr.status = 'completed'
                ORDER BY tr.completed_at DESC
                LIMIT 1
            ) latest_run ON true
            LEFT JOIN LATERAL (
                SELECT
                    COUNT(te.id) AS total_cases,
                    COUNT(te.id) FILTER (WHERE te.status = 'pass') AS passed_count,
                    COUNT(te.id) FILTER (WHERE te.status = 'fail') AS failed_count,
                    COUNT(te.id) FILTER (WHERE te.status = 'blocked') AS blocked_count,
                    COUNT(te.id) FILTER (WHERE te.status = 'not_run') AS not_run_count,
                    ROUND(
                        COUNT(te.id) FILTER (WHERE te.status = 'pass')::NUMERIC
                        / NULLIF(COUNT(te.id), 0) * 100
                    , 2) AS pass_rate
                FROM test_execution te
                WHERE te.test_run_id = latest_run.id
            ) run_stats ON true
            WHERE ts.project_id = $1
              AND ts.deleted_at IS NULL
            ORDER BY ts.readiness_scope DESC, ts.name ASC
        `;
        const result = await pool.query(suiteQuery, [project_id]);

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching suite readiness:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch suite readiness', message: error.message });
    }
});

// =====================================================
// GET /governance/project-readiness
// Roll-up readiness across all required suites for a project
// =====================================================
router.get('/project-readiness', requireAuth, blockContributors, requirePermission('qc.governance.view'), async (req, res) => {
    try {
        const { project_id } = req.query;
        if (!project_id) {
            return res.status(400).json({ success: false, error: 'project_id query parameter is required' });
        }

        const projectCheck = await pool.query('SELECT id, project_name FROM projects WHERE id = $1 AND deleted_at IS NULL', [project_id]);
        if (projectCheck.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Project not found' });
        }
        const projectName = projectCheck.rows[0].project_name;

        const taskCoverageResult = await pool.query(
            `SELECT task_test_coverage_pct FROM v_task_test_coverage WHERE project_id = $1`,
            [project_id]
        );
        const storyCoverageResult = await pool.query(
            `SELECT story_test_coverage_pct FROM v_user_story_test_coverage WHERE project_id = $1`,
            [project_id]
        );

        const suiteQuery = `
            SELECT
                ts.id AS suite_id,
                ts.suite_id AS suite_display_id,
                ts.name AS suite_name,
                ts.suite_type,
                ts.readiness_scope,
                latest_run.id AS latest_run_id,
                latest_run.completed_at,
                run_stats.total_cases,
                run_stats.passed_count,
                run_stats.failed_count,
                run_stats.blocked_count,
                run_stats.not_run_count,
                run_stats.pass_rate,
                CASE
                    WHEN ts.readiness_scope = 'required' AND latest_run.id IS NULL THEN 'blocked'
                    WHEN latest_run.id IS NULL THEN 'unknown'
                    WHEN run_stats.pass_rate >= 95 AND COALESCE(run_stats.failed_count, 0) = 0 THEN 'ready'
                    WHEN run_stats.pass_rate >= 80 THEN 'warning'
                    ELSE 'blocked'
                END AS readiness_status,
                CASE
                    WHEN ts.readiness_scope = 'required' AND latest_run.id IS NULL THEN 'missing_required_suite_run'
                    WHEN COALESCE(run_stats.failed_count, 0) > 0 THEN 'failed_cases_present'
                    WHEN COALESCE(run_stats.blocked_count, 0) > 0 THEN 'blocked_cases_present'
                    WHEN run_stats.pass_rate IS NULL THEN 'no_run_data'
                    WHEN run_stats.pass_rate < 80 THEN 'pass_rate_below_threshold'
                    ELSE NULL
                END AS risk_reason
            FROM test_suites ts
            LEFT JOIN LATERAL (
                SELECT tr.id, tr.completed_at
                FROM test_run tr
                WHERE tr.suite_id = ts.id
                  AND tr.deleted_at IS NULL
                  AND tr.status = 'completed'
                ORDER BY tr.completed_at DESC
                LIMIT 1
            ) latest_run ON true
            LEFT JOIN LATERAL (
                SELECT
                    COUNT(te.id) AS total_cases,
                    COUNT(te.id) FILTER (WHERE te.status = 'pass') AS passed_count,
                    COUNT(te.id) FILTER (WHERE te.status = 'fail') AS failed_count,
                    COUNT(te.id) FILTER (WHERE te.status = 'blocked') AS blocked_count,
                    COUNT(te.id) FILTER (WHERE te.status = 'not_run') AS not_run_count,
                    ROUND(
                        COUNT(te.id) FILTER (WHERE te.status = 'pass')::NUMERIC
                        / NULLIF(COUNT(te.id), 0) * 100
                    , 2) AS pass_rate
                FROM test_execution te
                WHERE te.test_run_id = latest_run.id
            ) run_stats ON true
            WHERE ts.project_id = $1
              AND ts.deleted_at IS NULL
            ORDER BY ts.readiness_scope DESC, ts.name ASC
        `;
        const suiteResult = await pool.query(suiteQuery, [project_id]);

        const requiredSuites = suiteResult.rows.filter(s => s.readiness_scope === 'required');
        const requiredSuitesTotal = requiredSuites.length;
        const requiredSuitesWithRun = requiredSuites.filter(s => s.latest_run_id !== null).length;
        const untriagedBugsResult = await pool.query(
            `SELECT COUNT(*) AS untriaged_count FROM bugs WHERE project_id = $1 AND deleted_at IS NULL AND triage_status = 'untriaged'`,
            [project_id]
        );

        const riskReasons = [];
        const missingRequired = requiredSuites.filter(s => s.latest_run_id === null);
        if (missingRequired.length > 0) riskReasons.push('missing_required_suite_run');
        const failedSuites = suiteResult.rows.filter(s => s.readiness_status === 'blocked' && s.risk_reason === 'failed_cases_present');
        if (failedSuites.length > 0) riskReasons.push('failed_cases_present');
        const blockedSuites = suiteResult.rows.filter(s => s.risk_reason === 'blocked_cases_present');
        if (blockedSuites.length > 0) riskReasons.push('blocked_cases_present');
        const lowPassRate = suiteResult.rows.filter(s => s.risk_reason === 'pass_rate_below_threshold');
        if (lowPassRate.length > 0) riskReasons.push('pass_rate_below_threshold');
        const taskCovPct = taskCoverageResult.rows.length > 0 ? parseFloat(taskCoverageResult.rows[0].task_test_coverage_pct) || 0 : 0;
        const storyCovPct = storyCoverageResult.rows.length > 0 ? parseFloat(storyCoverageResult.rows[0].story_test_coverage_pct) || 0 : 0;
        if (taskCovPct < 50) riskReasons.push('task_test_coverage_below_threshold');
        if (storyCovPct < 50) riskReasons.push('story_test_coverage_below_threshold');
        const untriagedCount = parseInt(untriagedBugsResult.rows[0].untriaged_count) || 0;
        if (untriagedCount > 0) riskReasons.push('untriaged_bugs_present');

        let readinessStatus;
        if (requiredSuitesTotal === 0) {
            readinessStatus = 'unknown';
        } else if (missingRequired.length > 0) {
            readinessStatus = 'blocked';
        } else if (riskReasons.length === 0) {
            readinessStatus = 'ready';
        } else if (riskReasons.some(r => r === 'failed_cases_present' || r === 'pass_rate_below_threshold')) {
            readinessStatus = 'blocked';
        } else {
            readinessStatus = 'warning';
        }

        res.json({
            success: true,
            data: {
                project_id,
                project_name: projectName,
                readiness_status: readinessStatus,
                task_test_coverage_pct: taskCovPct,
                story_test_coverage_pct: storyCovPct,
                required_suites_total: requiredSuitesTotal,
                required_suites_with_completed_run: requiredSuitesWithRun,
                risk_reasons: riskReasons,
                untriaged_bugs: untriagedCount,
                suites: suiteResult.rows
            }
        });
    } catch (error) {
        console.error('Error fetching project readiness:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch project readiness', message: error.message });
    }
});

module.exports = router;

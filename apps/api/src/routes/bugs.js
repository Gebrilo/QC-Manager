/**
 * Bugs API Routes
 * CRUD operations for bugs synced from Tuleap
 */

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const pool = db.pool;
const { auditLog } = require('../middleware/audit');
const { requireAuth, requirePermission } = require('../middleware/authMiddleware');

// =====================================================
// GET /bugs/summary
// Get aggregated bug statistics for dashboard
// =====================================================
router.get('/summary', requireAuth, requirePermission('page:bugs'), async (req, res) => {
    try {
        const { project_id } = req.query;

        // Get global totals
        const globalQuery = `SELECT * FROM v_bug_summary_global`;
        const globalResult = await pool.query(globalQuery);
        const totals = globalResult.rows[0] || {
            total_bugs: 0,
            open_bugs: 0,
            closed_bugs: 0,
            critical_bugs: 0,
            high_bugs: 0,
            medium_bugs: 0,
            low_bugs: 0,
            bugs_from_testing: 0,
            standalone_bugs: 0
        };

        // Get by project
        let byProjectQuery = `SELECT * FROM v_bug_summary`;
        const byProjectParams = [];
        if (project_id) {
            byProjectQuery += ` WHERE project_id = $1`;
            byProjectParams.push(project_id);
        }
        byProjectQuery += ` ORDER BY total_bugs DESC`;
        const byProjectResult = await pool.query(byProjectQuery, byProjectParams);

        // Get recent bugs
        let recentQuery = `
            SELECT
                b.id,
                b.bug_id,
                b.title,
                b.status,
                b.severity,
                b.priority,
                b.reported_date,
                b.tuleap_url,
                p.project_name,
                CASE WHEN array_length(b.linked_test_execution_ids, 1) > 0 THEN true ELSE false END AS has_test_link
            FROM bugs b
            LEFT JOIN projects p ON b.project_id = p.id
            WHERE b.deleted_at IS NULL
        `;
        const recentParams = [];
        if (project_id) {
            recentQuery += ` AND b.project_id = $1`;
            recentParams.push(project_id);
        }
        recentQuery += ` ORDER BY b.reported_date DESC NULLS LAST, b.created_at DESC LIMIT 10`;
        const recentResult = await pool.query(recentQuery, recentParams);

        res.json({
            success: true,
            data: {
                totals: {
                    total_bugs: parseInt(totals.total_bugs) || 0,
                    open_bugs: parseInt(totals.open_bugs) || 0,
                    closed_bugs: parseInt(totals.closed_bugs) || 0,
                    bugs_from_testing: parseInt(totals.bugs_from_testing) || 0,
                    standalone_bugs: parseInt(totals.standalone_bugs) || 0
                },
                by_severity: {
                    critical: parseInt(totals.critical_bugs) || 0,
                    high: parseInt(totals.high_bugs) || 0,
                    medium: parseInt(totals.medium_bugs) || 0,
                    low: parseInt(totals.low_bugs) || 0
                },
                by_project: byProjectResult.rows,
                recent_bugs: recentResult.rows
            }
        });
    } catch (error) {
        console.error('Error fetching bug summary:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch bug summary',
            message: error.message
        });
    }
});

// =====================================================
// GET /bugs
// List bugs with filters
// =====================================================
router.get('/', requireAuth, requirePermission('page:bugs'), async (req, res) => {
    try {
        const { project_id, status, severity, limit = 50, offset = 0, sort = 'created_at:desc' } = req.query;

        let query = `
            SELECT
                b.*,
                p.project_name,
                CASE WHEN array_length(b.linked_test_execution_ids, 1) > 0 THEN true ELSE false END AS has_test_link
            FROM bugs b
            LEFT JOIN projects p ON b.project_id = p.id
            WHERE b.deleted_at IS NULL
        `;
        const params = [];
        let paramIndex = 1;

        if (project_id) {
            query += ` AND b.project_id = $${paramIndex}`;
            params.push(project_id);
            paramIndex++;
        }

        if (status) {
            query += ` AND b.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        if (severity) {
            query += ` AND b.severity = $${paramIndex}`;
            params.push(severity);
            paramIndex++;
        }

        // Parse sort parameter
        const [sortField, sortDir] = sort.split(':');
        const validSortFields = ['created_at', 'reported_date', 'severity', 'status', 'title'];
        const sortColumn = validSortFields.includes(sortField) ? sortField : 'created_at';
        const sortDirection = sortDir === 'asc' ? 'ASC' : 'DESC';

        query += ` ORDER BY b.${sortColumn} ${sortDirection} NULLS LAST`;
        query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await pool.query(query, params);

        // Get total count
        let countQuery = `SELECT COUNT(*) FROM bugs WHERE deleted_at IS NULL`;
        const countParams = [];
        let countParamIndex = 1;
        if (project_id) {
            countQuery += ` AND project_id = $${countParamIndex}`;
            countParams.push(project_id);
            countParamIndex++;
        }
        if (status) {
            countQuery += ` AND status = $${countParamIndex}`;
            countParams.push(status);
            countParamIndex++;
        }
        if (severity) {
            countQuery += ` AND severity = $${countParamIndex}`;
            countParams.push(severity);
        }
        const countResult = await pool.query(countQuery, countParams);

        res.json({
            success: true,
            count: result.rows.length,
            total: parseInt(countResult.rows[0].count),
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching bugs:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch bugs',
            message: error.message
        });
    }
});

// =====================================================
// GET /bugs/:id
// Get single bug by ID
// =====================================================
router.get('/:id', requireAuth, requirePermission('page:bugs'), async (req, res) => {
    try {
        const { id } = req.params;

        const query = `
            SELECT
                b.*,
                p.project_name,
                CASE WHEN array_length(b.linked_test_execution_ids, 1) > 0 THEN true ELSE false END AS has_test_link
            FROM bugs b
            LEFT JOIN projects p ON b.project_id = p.id
            WHERE b.id = $1 AND b.deleted_at IS NULL
        `;
        const result = await pool.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Bug not found'
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error fetching bug:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch bug',
            message: error.message
        });
    }
});

// =====================================================
// GET /bugs/by-project/:projectId
// Get bugs for a specific project
// =====================================================
router.get('/by-project/:projectId', requireAuth, requirePermission('page:bugs'), async (req, res) => {
    try {
        const { projectId } = req.params;

        const query = `
            SELECT
                b.*,
                p.project_name,
                CASE WHEN array_length(b.linked_test_execution_ids, 1) > 0 THEN true ELSE false END AS has_test_link
            FROM bugs b
            LEFT JOIN projects p ON b.project_id = p.id
            WHERE b.project_id = $1 AND b.deleted_at IS NULL
            ORDER BY b.reported_date DESC NULLS LAST, b.created_at DESC
        `;
        const result = await pool.query(query, [projectId]);

        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching project bugs:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch project bugs',
            message: error.message
        });
    }
});

// =====================================================
// POST /bugs
// Create a new bug (internal use / testing)
// =====================================================
router.post('/', requireAuth, requirePermission('action:bugs:create'), async (req, res) => {
    try {
        const {
            tuleap_artifact_id,
            tuleap_tracker_id,
            tuleap_url,
            bug_id,
            title,
            description,
            status = 'Open',
            severity = 'medium',
            priority = 'medium',
            bug_type,
            component,
            project_id,
            linked_test_case_ids = [],
            linked_test_execution_ids = [],
            reported_by,
            assigned_to,
            reported_date,
            raw_tuleap_payload
        } = req.body;

        // Generate bug_id if not provided
        const finalBugId = bug_id || `BUG-${Date.now().toString(36).toUpperCase()}`;

        const query = `
            INSERT INTO bugs (
                tuleap_artifact_id, tuleap_tracker_id, tuleap_url,
                bug_id, title, description, status, severity, priority,
                bug_type, component, project_id,
                linked_test_case_ids, linked_test_execution_ids,
                reported_by, assigned_to, reported_date, raw_tuleap_payload
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
            )
            RETURNING *
        `;

        const values = [
            tuleap_artifact_id, tuleap_tracker_id, tuleap_url,
            finalBugId, title, description, status, severity, priority,
            bug_type, component, project_id,
            linked_test_case_ids, linked_test_execution_ids,
            reported_by, assigned_to, reported_date || new Date(), raw_tuleap_payload
        ];

        const result = await pool.query(query, values);
        const bug = result.rows[0];

        // Audit log
        await auditLog('bugs', bug.id, 'CREATE', bug, null);

        res.status(201).json({
            success: true,
            data: bug
        });
    } catch (error) {
        console.error('Error creating bug:', error);

        // Handle duplicate tuleap_artifact_id
        if (error.code === '23505' && error.constraint === 'bugs_tuleap_artifact_id_key') {
            return res.status(409).json({
                success: false,
                error: 'Bug with this Tuleap artifact ID already exists',
                message: error.message
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to create bug',
            message: error.message
        });
    }
});

// =====================================================
// PATCH /bugs/:id
// Update a bug
// =====================================================
router.patch('/:id', requireAuth, requirePermission('action:bugs:edit'), async (req, res) => {
    try {
        const { id } = req.params;

        // Fetch original
        const originalRes = await pool.query('SELECT * FROM bugs WHERE id = $1', [id]);
        if (originalRes.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Bug not found'
            });
        }
        const original = originalRes.rows[0];

        // Build update query
        const allowedFields = [
            'title', 'description', 'status', 'severity', 'priority',
            'bug_type', 'component', 'assigned_to', 'resolved_date',
            'linked_test_case_ids', 'linked_test_execution_ids', 'raw_tuleap_payload'
        ];

        const fields = [];
        const values = [];
        let idx = 1;

        for (const [key, value] of Object.entries(req.body)) {
            if (allowedFields.includes(key)) {
                fields.push(`${key} = $${idx++}`);
                values.push(value);
            }
        }

        if (fields.length === 0) {
            return res.json({ success: true, data: original });
        }

        fields.push(`updated_at = NOW()`);
        fields.push(`last_sync_at = NOW()`);
        values.push(id);

        const query = `UPDATE bugs SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
        const result = await pool.query(query, values);
        const updated = result.rows[0];

        // Audit log
        await auditLog('bugs', id, 'UPDATE', updated, original);

        res.json({
            success: true,
            data: updated
        });
    } catch (error) {
        console.error('Error updating bug:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update bug',
            message: error.message
        });
    }
});

// =====================================================
// DELETE /bugs/:id
// Soft delete a bug
// =====================================================
router.delete('/:id', requireAuth, requirePermission('action:bugs:delete'), async (req, res) => {
    try {
        const { id } = req.params;

        // Fetch original
        const originalRes = await pool.query('SELECT * FROM bugs WHERE id = $1', [id]);
        if (originalRes.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Bug not found'
            });
        }
        const original = originalRes.rows[0];

        if (original.deleted_at) {
            return res.status(400).json({
                success: false,
                error: 'Bug already deleted'
            });
        }

        // Soft delete
        const result = await pool.query(
            `UPDATE bugs SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
            [id]
        );
        const deleted = result.rows[0];

        // Audit log
        await auditLog('bugs', id, 'DELETE', deleted, original);

        res.json({
            success: true,
            message: `Bug '${deleted.title}' has been deleted`,
            data: deleted
        });
    } catch (error) {
        console.error('Error deleting bug:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete bug',
            message: error.message
        });
    }
});

module.exports = router;

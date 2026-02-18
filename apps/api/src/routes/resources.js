const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { createResourceSchema, updateResourceSchema } = require('../schemas/resource');
const { auditLog } = require('../middleware/audit');
const { triggerWorkflow } = require('../utils/n8n');
const { requireAuth, requirePermission, requireRole } = require('../middleware/authMiddleware');
const { computeTaskTimeline } = require('../utils/workingDays');

// ========================================
// Resource Analytics Dashboard
// ========================================

// GET all resources with utilization metrics (from view)
router.get('/', async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT * 
            FROM v_resources_with_utilization 
            ORDER BY resource_name ASC
        `);
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

// GET resource analytics dashboard (admin/manager only)
router.get('/:id/analytics', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { id } = req.params;

        // 1. Profile + utilization from view
        const profileResult = await db.query(`
            SELECT * FROM v_resources_with_utilization WHERE id = $1
        `, [id]);

        if (profileResult.rows.length === 0) {
            return res.status(404).json({ error: 'Resource not found' });
        }
        const resource = profileResult.rows[0];

        // 2. Current week actuals (Monday–Sunday ISO week)
        const weekActualsResult = await db.query(`
            SELECT
                COALESCE(SUM(
                    CASE WHEN t.resource1_id = $1 THEN COALESCE(t.r1_actual_hrs, 0) ELSE 0 END +
                    CASE WHEN t.resource2_id = $1 THEN COALESCE(t.r2_actual_hrs, 0) ELSE 0 END
                ), 0) AS current_week_actual_hrs
            FROM tasks t
            WHERE (t.resource1_id = $1 OR t.resource2_id = $1)
              AND t.deleted_at IS NULL
              AND t.status IN ('In Progress', 'Done')
              AND t.updated_at >= date_trunc('week', CURRENT_DATE)
              AND t.updated_at < date_trunc('week', CURRENT_DATE) + INTERVAL '7 days'
        `, [id]);

        // 3. Backlog: total estimated hours for incomplete tasks
        const backlogResult = await db.query(`
            SELECT
                COALESCE(SUM(
                    CASE WHEN t.resource1_id = $1 THEN COALESCE(t.r1_estimate_hrs, 0) ELSE 0 END +
                    CASE WHEN t.resource2_id = $1 THEN COALESCE(t.r2_estimate_hrs, 0) ELSE 0 END
                ), 0) AS backlog_hrs
            FROM tasks t
            WHERE (t.resource1_id = $1 OR t.resource2_id = $1)
              AND t.deleted_at IS NULL
              AND t.status IN ('Backlog', 'In Progress')
        `, [id]);

        // 4. Assigned tasks list with timeline date fields
        const tasksResult = await db.query(`
            SELECT t.id, t.task_id, t.task_name, t.status, t.priority,
                   p.project_name,
                   CASE WHEN t.resource1_id = $1 THEN COALESCE(t.r1_estimate_hrs, 0) ELSE COALESCE(t.r2_estimate_hrs, 0) END AS estimate_hrs,
                   CASE WHEN t.resource1_id = $1 THEN COALESCE(t.r1_actual_hrs, 0) ELSE COALESCE(t.r2_actual_hrs, 0) END AS actual_hrs,
                   CASE WHEN t.resource1_id = $1 THEN 'Primary' ELSE 'Secondary' END AS assignment_role,
                   t.expected_start_date,
                   t.actual_start_date,
                   t.completed_date,
                   t.deadline,
                   t.estimate_days
            FROM tasks t
            LEFT JOIN projects p ON t.project_id = p.id
            WHERE (t.resource1_id = $1 OR t.resource2_id = $1)
              AND t.deleted_at IS NULL
            ORDER BY 
                CASE t.status WHEN 'In Progress' THEN 1 WHEN 'Backlog' THEN 2 WHEN 'Done' THEN 3 ELSE 4 END,
                t.created_at DESC
        `, [id]);

        // 5. Compute timeline metrics per task
        const now = new Date();
        const timelineSummary = { on_track: 0, at_risk: 0, overdue: 0, completed_early: 0 };

        const enrichedTasks = tasksResult.rows.map(task => {
            const timeline = computeTaskTimeline(task, now);
            if (timeline.health_status && timelineSummary[timeline.health_status] !== undefined) {
                timelineSummary[timeline.health_status]++;
            }
            return { ...task, ...timeline };
        });

        res.json({
            profile: {
                id: resource.id,
                resource_name: resource.resource_name,
                email: resource.email,
                department: resource.department,
                role: resource.role,
                is_active: resource.is_active,
                user_id: resource.user_id,
            },
            utilization: {
                weekly_capacity_hrs: Number(resource.weekly_capacity_hrs),
                current_allocation_hrs: Number(resource.current_allocation_hrs || 0),
                utilization_pct: Number(resource.utilization_pct || 0),
                active_tasks_count: Number(resource.active_tasks_count || 0),
                backlog_tasks_count: Number(resource.backlog_tasks_count || 0),
            },
            current_week_actual_hrs: Number(weekActualsResult.rows[0]?.current_week_actual_hrs || 0),
            backlog_hrs: Number(backlogResult.rows[0]?.backlog_hrs || 0),
            timeline_summary: timelineSummary,
            tasks: enrichedTasks,
        });
    } catch (err) {
        next(err);
    }
});

// GET single resource with utilization (from view)
router.get('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await db.query(`
            SELECT * 
            FROM v_resources_with_utilization 
            WHERE id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Resource not found' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

// POST create resource
router.post('/', requireAuth, requirePermission('action:resources:create'), async (req, res, next) => {
    try {
        // Validate with Zod
        const data = createResourceSchema.parse(req.body);

        const result = await db.query(
            `INSERT INTO resources (
                resource_name, weekly_capacity_hrs, email, department, role, is_active
            ) VALUES ($1, $2, $3, $4, $5, $6) 
            RETURNING *`,
            [
                data.resource_name,
                data.weekly_capacity_hrs,
                data.email || null,
                data.department || null,
                data.role || null,
                data.is_active
            ]
        );

        const resource = result.rows[0];

        // Audit log
        await auditLog('resources', resource.id, 'CREATE', resource, null);

        // Trigger n8n workflow
        triggerWorkflow('resource-created', resource);

        // Return with utilization metrics from view
        const viewResult = await db.query(`
            SELECT * FROM v_resources_with_utilization WHERE id = $1
        `, [resource.id]);

        res.status(201).json(viewResult.rows[0]);
    } catch (err) {
        next(err);
    }
});

// PATCH update resource
router.patch('/:id', requireAuth, requirePermission('action:resources:edit'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = updateResourceSchema.parse(req.body);

        // Fetch original for audit
        const originalRes = await db.query('SELECT * FROM resources WHERE id = $1', [id]);
        if (originalRes.rows.length === 0) {
            return res.status(404).json({ error: 'Resource not found' });
        }
        const original = originalRes.rows[0];

        // Build dynamic update query
        const fields = [];
        const values = [];
        let idx = 1;

        if (data.resource_name !== undefined) {
            fields.push(`resource_name = $${idx++}`);
            values.push(data.resource_name);
        }
        if (data.weekly_capacity_hrs !== undefined) {
            fields.push(`weekly_capacity_hrs = $${idx++}`);
            values.push(data.weekly_capacity_hrs);
        }
        if (data.email !== undefined) {
            fields.push(`email = $${idx++}`);
            values.push(data.email);
        }
        if (data.department !== undefined) {
            fields.push(`department = $${idx++}`);
            values.push(data.department);
        }
        if (data.role !== undefined) {
            fields.push(`role = $${idx++}`);
            values.push(data.role);
        }
        if (data.is_active !== undefined) {
            fields.push(`is_active = $${idx++}`);
            values.push(data.is_active);
        }

        if (fields.length === 0) {
            return res.json(original);
        }

        fields.push(`updated_at = NOW()`);
        values.push(id);

        const query = `UPDATE resources SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
        const result = await db.query(query, values);
        const updated = result.rows[0];

        // Audit log
        await auditLog('resources', id, 'UPDATE', updated, original);

        // Trigger n8n workflow
        triggerWorkflow('resource-updated', updated);

        // Return with utilization metrics from view
        const viewResult = await db.query(`
            SELECT * FROM v_resources_with_utilization WHERE id = $1
        `, [id]);

        res.json(viewResult.rows[0]);
    } catch (err) {
        next(err);
    }
});

// DELETE soft delete resource
router.delete('/:id', requireAuth, requirePermission('action:resources:delete'), async (req, res, next) => {
    try {
        const { id } = req.params;

        // Fetch original for audit
        const originalRes = await db.query('SELECT * FROM resources WHERE id = $1', [id]);
        if (originalRes.rows.length === 0) {
            return res.status(404).json({ error: 'Resource not found' });
        }
        const original = originalRes.rows[0];

        // Check if already deleted
        if (original.deleted_at) {
            return res.status(400).json({ error: 'Resource already deleted' });
        }

        // Soft delete: set deleted_at and is_active = false
        const result = await db.query(
            `UPDATE resources 
             SET deleted_at = NOW(), 
                 is_active = false,
                 updated_at = NOW()
             WHERE id = $1 
             RETURNING *`,
            [id]
        );

        const deleted = result.rows[0];

        // Audit log
        await auditLog('resources', id, 'DELETE', deleted, original);

        // Trigger n8n workflow
        triggerWorkflow('resource-deleted', deleted);

        res.json({
            success: true,
            message: `Resource '${deleted.resource_name}' has been deleted`,
            data: deleted
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;

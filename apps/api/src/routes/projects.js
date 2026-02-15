const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { createProjectSchema, updateProjectSchema } = require('../schemas/project');
const { auditLog } = require('../middleware/audit');
const { triggerWorkflow } = require('../utils/n8n');
const { requireAuth, requirePermission } = require('../middleware/authMiddleware');

// GET all projects (from View)
router.get('/', async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT *
            FROM v_projects_with_metrics 
            ORDER BY created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

// GET single project (from View)
router.get('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await db.query(`
            SELECT *
            FROM v_projects_with_metrics 
            WHERE id = $1
        `, [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
        res.json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

// POST create project
router.post('/', requireAuth, requirePermission('action:projects:create'), async (req, res, next) => {
    try {
        // Validation
        const data = createProjectSchema.parse(req.body);

        const result = await db.query(
            `INSERT INTO projects (
                project_id, project_name, description, total_weight, priority, start_date, target_date
            ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [
                data.project_id,
                data.name,
                data.description || null,
                data.total_weight,
                data.priority,
                data.start_date,
                data.target_date
            ]
        );

        const project = result.rows[0];

        // Audit (New Signature: type, id, action, afterState, beforeState)
        await auditLog('projects', project.id, 'CREATE', project, null);

        // n8n
        triggerWorkflow('project-created', project);

        res.status(201).json(project);
    } catch (err) {
        next(err);
    }
});

// PATCH update project
router.patch('/:id', requireAuth, requirePermission('action:projects:edit'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = req.body;

        // Validation (Partial)
        const validatedData = updateProjectSchema.parse(data);

        // Map client fields to DB fields
        const dbFields = {};
        if (validatedData.name) dbFields.project_name = validatedData.name;
        if (validatedData.description !== undefined) dbFields.description = validatedData.description;
        if (validatedData.total_weight) dbFields.total_weight = validatedData.total_weight;
        if (validatedData.priority) dbFields.priority = validatedData.priority;
        if (validatedData.start_date) dbFields.start_date = validatedData.start_date;
        if (validatedData.target_date) dbFields.target_date = validatedData.target_date;

        const keys = Object.keys(dbFields);
        if (keys.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

        // Get current state for audit
        const currentResult = await db.query('SELECT * FROM projects WHERE id = $1', [id]);
        if (currentResult.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
        const internalProject = currentResult.rows[0]; // Raw table data

        const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
        const values = [id, ...keys.map(k => dbFields[k])];

        const result = await db.query(
            `UPDATE projects SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
            values
        );

        const updatedProject = result.rows[0];

        // Audit (Update: type, id, action, afterState, beforeState)
        await auditLog('projects', id, 'UPDATE', updatedProject, internalProject);

        // Return the VIEW representation
        const viewResult = await db.query('SELECT * FROM v_projects_with_metrics WHERE id = $1', [id]);
        res.json(viewResult.rows[0]);

    } catch (err) {
        next(err);
    }
});

// DELETE soft delete project
router.delete('/:id', requireAuth, requirePermission('action:projects:delete'), async (req, res, next) => {
    try {
        const { id } = req.params;

        // Fetch original for audit
        const originalRes = await db.query('SELECT * FROM projects WHERE id = $1', [id]);
        if (originalRes.rows.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }
        const original = originalRes.rows[0];

        // Check if already deleted
        if (original.deleted_at) {
            return res.status(400).json({ error: 'Project already deleted' });
        }

        // Check if project has any tasks assigned
        const tasksResult = await db.query(
            'SELECT COUNT(*) as count FROM tasks WHERE project_id = $1 AND deleted_at IS NULL',
            [id]
        );
        const taskCount = parseInt(tasksResult.rows[0].count, 10);

        if (taskCount > 0) {
            return res.status(400).json({
                error: `Cannot delete project. ${taskCount} task(s) are still assigned to this project. Please delete or reassign tasks first.`,
                taskCount: taskCount
            });
        }

        // Soft delete: set deleted_at
        const result = await db.query(
            `UPDATE projects 
             SET deleted_at = NOW(),
                 updated_at = NOW()
             WHERE id = $1 
             RETURNING *`,
            [id]
        );

        const deleted = result.rows[0];

        // Audit log
        await auditLog('projects', id, 'DELETE', deleted, original);

        // Trigger n8n workflow
        triggerWorkflow('project-deleted', deleted);

        res.json({
            success: true,
            message: `Project '${deleted.project_name}' has been deleted`,
            data: deleted
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;

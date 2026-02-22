const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { createProjectSchema, updateProjectSchema } = require('../schemas/project');
const { auditLog } = require('../middleware/audit');
const { triggerWorkflow } = require('../utils/n8n');
const { requireAuth, requirePermission } = require('../middleware/authMiddleware');
const { getManagerTeamId } = require('../middleware/teamAccess');

/**
 * Resolve team-scoped WHERE clause for projects.
 * Admins see all; managers see only their team's projects.
 * Returns { clause, params } for use in queries.
 */
async function buildTeamFilter(user) {
    if (user.role === 'admin') {
        return { clause: '', params: [] };
    }
    if (user.role === 'manager') {
        const teamId = await getManagerTeamId(user.id);
        if (!teamId) return { clause: 'AND 1=0', params: [] }; // No team → no projects
        return { clause: 'AND team_id = $1', params: [teamId] };
    }
    // Other roles: return all (legacy behaviour for non-manager/non-admin)
    return { clause: '', params: [] };
}

// GET all projects (from View), scoped by team for managers
router.get('/', requireAuth, async (req, res, next) => {
    try {
        const { clause, params } = await buildTeamFilter(req.user);

        const result = await db.query(
            `SELECT * FROM v_projects_with_metrics WHERE 1=1 ${clause} ORDER BY created_at DESC`,
            params
        );
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

// GET single project (from View) — enforce team scope for managers
router.get('/:id', requireAuth, async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await db.query(
            `SELECT * FROM v_projects_with_metrics WHERE id = $1`,
            [id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Project not found' });

        const project = result.rows[0];

        // Enforce team scope for managers
        if (req.user.role === 'manager') {
            const teamId = await getManagerTeamId(req.user.id);
            if (!teamId || project.team_id !== teamId) {
                return res.status(403).json({ error: 'You do not have access to this project' });
            }
        }

        res.json(project);
    } catch (err) {
        next(err);
    }
});

// POST create project
router.post('/', requireAuth, requirePermission('action:projects:create'), async (req, res, next) => {
    try {
        const data = createProjectSchema.parse(req.body);

        // Managers must create projects in their own team
        let teamId = data.team_id || null;
        if (req.user.role === 'manager') {
            const managerTeamId = await getManagerTeamId(req.user.id);
            if (!managerTeamId) {
                return res.status(403).json({ error: 'You are not assigned to a team. Ask an admin to assign you.' });
            }
            teamId = managerTeamId;
        }

        const result = await db.query(
            `INSERT INTO projects (
                project_id, project_name, description, total_weight, priority,
                start_date, target_date, team_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [
                data.project_id,
                data.name,
                data.description || null,
                data.total_weight,
                data.priority,
                data.start_date,
                data.target_date,
                teamId,
            ]
        );

        const project = result.rows[0];
        await auditLog('projects', project.id, 'CREATE', project, null);
        triggerWorkflow('project-created', project);

        res.status(201).json(project);
    } catch (err) {
        next(err);
    }
});

// PATCH update project — enforce team scope
router.patch('/:id', requireAuth, requirePermission('action:projects:edit'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = req.body;

        // Validate (Partial)
        const validatedData = updateProjectSchema.parse(data);

        // Fetch current project for scope check and audit
        const currentResult = await db.query('SELECT * FROM projects WHERE id = $1', [id]);
        if (currentResult.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
        const internalProject = currentResult.rows[0];

        // Managers can only edit projects in their team
        if (req.user.role === 'manager') {
            const teamId = await getManagerTeamId(req.user.id);
            if (!teamId || internalProject.team_id !== teamId) {
                return res.status(403).json({ error: 'You do not have access to this project' });
            }
        }

        const dbFields = {};
        if (validatedData.name) dbFields.project_name = validatedData.name;
        if (validatedData.description !== undefined) dbFields.description = validatedData.description;
        if (validatedData.total_weight) dbFields.total_weight = validatedData.total_weight;
        if (validatedData.priority) dbFields.priority = validatedData.priority;
        if (validatedData.start_date) dbFields.start_date = validatedData.start_date;
        if (validatedData.target_date) dbFields.target_date = validatedData.target_date;
        // Admins may reassign team; managers cannot change team
        if (validatedData.team_id !== undefined && req.user.role === 'admin') {
            dbFields.team_id = validatedData.team_id;
        }

        const keys = Object.keys(dbFields);
        if (keys.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

        const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
        const values = [id, ...keys.map(k => dbFields[k])];

        const result = await db.query(
            `UPDATE projects SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
            values
        );

        const updatedProject = result.rows[0];
        await auditLog('projects', id, 'UPDATE', updatedProject, internalProject);

        const viewResult = await db.query('SELECT * FROM v_projects_with_metrics WHERE id = $1', [id]);
        res.json(viewResult.rows[0]);
    } catch (err) {
        next(err);
    }
});

// DELETE soft delete project — enforce team scope
router.delete('/:id', requireAuth, requirePermission('action:projects:delete'), async (req, res, next) => {
    try {
        const { id } = req.params;

        const originalRes = await db.query('SELECT * FROM projects WHERE id = $1', [id]);
        if (originalRes.rows.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }
        const original = originalRes.rows[0];

        // Managers can only delete projects in their team
        if (req.user.role === 'manager') {
            const teamId = await getManagerTeamId(req.user.id);
            if (!teamId || original.team_id !== teamId) {
                return res.status(403).json({ error: 'You do not have access to this project' });
            }
        }

        if (original.deleted_at) {
            return res.status(400).json({ error: 'Project already deleted' });
        }

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

        const result = await db.query(
            `UPDATE projects SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
            [id]
        );

        const deleted = result.rows[0];
        await auditLog('projects', id, 'DELETE', deleted, original);
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

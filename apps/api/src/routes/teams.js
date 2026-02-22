/**
 * Teams API Routes
 *
 * Admin:
 *   GET    /teams              — list all teams with member counts
 *   POST   /teams              — create a team
 *   GET    /teams/:id          — get one team with members and projects
 *   PATCH  /teams/:id          — update team (name, description, manager)
 *   DELETE /teams/:id          — soft delete team
 *   POST   /teams/:id/members  — add user to team
 *   DELETE /teams/:id/members/:userId — remove user from team
 *   POST   /teams/:id/projects — assign project to team
 *   DELETE /teams/:id/projects/:projectId — unassign project from team
 *
 * Manager (own team only):
 *   GET    /teams/mine         — get own team details
 */

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { getManagerTeam } = require('../middleware/teamAccess');

// ──────────────────────────────────────────────
// Admin-only endpoints
// ──────────────────────────────────────────────

// GET /teams — list all teams
router.get('/', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT
                t.id,
                t.name,
                t.description,
                t.manager_id,
                u.name  AS manager_name,
                u.email AS manager_email,
                COUNT(DISTINCT m.id) FILTER (WHERE m.id IS NOT NULL)   AS member_count,
                COUNT(DISTINCT p.id) FILTER (WHERE p.id IS NOT NULL AND p.deleted_at IS NULL) AS project_count,
                t.created_at,
                t.updated_at
            FROM teams t
            LEFT JOIN app_user u  ON t.manager_id = u.id
            LEFT JOIN app_user m  ON m.team_id    = t.id
            LEFT JOIN projects p  ON p.team_id    = t.id
            WHERE t.deleted_at IS NULL
            GROUP BY t.id, u.name, u.email
            ORDER BY t.name
        `);
        res.json(result.rows);
    } catch (err) { next(err); }
});

// POST /teams — create a team
router.post('/', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        const { name, description, manager_id } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Team name is required' });
        }

        // Validate manager exists and has role = manager (or admin)
        if (manager_id) {
            const managerCheck = await db.query(
                `SELECT id, role FROM app_user WHERE id = $1`,
                [manager_id]
            );
            if (managerCheck.rows.length === 0) {
                return res.status(400).json({ error: 'Manager user not found' });
            }
            if (!['admin', 'manager'].includes(managerCheck.rows[0].role)) {
                return res.status(400).json({ error: 'Assigned manager must have role "manager" or "admin"' });
            }
        }

        const result = await db.query(
            `INSERT INTO teams (name, description, manager_id, created_by)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [name.trim(), description || null, manager_id || null, req.user.email]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) { next(err); }
});

// GET /teams/mine — manager sees their own team (must be before /:id)
router.get('/mine', requireAuth, async (req, res, next) => {
    try {
        if (req.user.role === 'admin') {
            return res.status(400).json({ error: 'Admins do not belong to a team. Use GET /teams instead.' });
        }
        const team = await getManagerTeam(req.user.id);
        if (!team) {
            return res.status(404).json({ error: 'You are not assigned as a manager of any team' });
        }

        const details = await db.query(`
            SELECT
                t.id, t.name, t.description, t.manager_id,
                u.name  AS manager_name,
                u.email AS manager_email,
                t.created_at, t.updated_at
            FROM teams t
            LEFT JOIN app_user u ON t.manager_id = u.id
            WHERE t.id = $1 AND t.deleted_at IS NULL
        `, [team.id]);

        if (details.rows.length === 0) return res.status(404).json({ error: 'Team not found' });

        const members = await db.query(`
            SELECT id, name, email, role, active, activated, team_id
            FROM app_user
            WHERE team_id = $1 AND active = true
            ORDER BY name
        `, [team.id]);

        const projects = await db.query(`
            SELECT id, project_id, project_name, status, priority, start_date, target_date
            FROM projects
            WHERE team_id = $1 AND deleted_at IS NULL
            ORDER BY project_name
        `, [team.id]);

        res.json({
            ...details.rows[0],
            members: members.rows,
            projects: projects.rows,
        });
    } catch (err) { next(err); }
});

// GET /teams/:id — get one team with members and projects
router.get('/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        const { id } = req.params;

        const teamResult = await db.query(`
            SELECT
                t.id, t.name, t.description, t.manager_id,
                u.name  AS manager_name,
                u.email AS manager_email,
                t.created_at, t.updated_at
            FROM teams t
            LEFT JOIN app_user u ON t.manager_id = u.id
            WHERE t.id = $1 AND t.deleted_at IS NULL
        `, [id]);

        if (teamResult.rows.length === 0) return res.status(404).json({ error: 'Team not found' });

        const members = await db.query(`
            SELECT id, name, email, role, active, activated, team_id
            FROM app_user
            WHERE team_id = $1
            ORDER BY name
        `, [id]);

        const projects = await db.query(`
            SELECT id, project_id, project_name, status, priority, start_date, target_date, team_id
            FROM projects
            WHERE team_id = $1 AND deleted_at IS NULL
            ORDER BY project_name
        `, [id]);

        res.json({
            ...teamResult.rows[0],
            members: members.rows,
            projects: projects.rows,
        });
    } catch (err) { next(err); }
});

// PATCH /teams/:id — update name, description, or manager
router.patch('/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, description, manager_id } = req.body;

        const check = await db.query(`SELECT id FROM teams WHERE id = $1 AND deleted_at IS NULL`, [id]);
        if (check.rows.length === 0) return res.status(404).json({ error: 'Team not found' });

        const fields = [];
        const values = [];
        let idx = 1;

        if (name !== undefined) {
            if (!name.trim()) return res.status(400).json({ error: 'Team name cannot be empty' });
            fields.push(`name = $${idx++}`);
            values.push(name.trim());
        }
        if (description !== undefined) {
            fields.push(`description = $${idx++}`);
            values.push(description || null);
        }
        if (manager_id !== undefined) {
            if (manager_id) {
                const managerCheck = await db.query(
                    `SELECT id, role FROM app_user WHERE id = $1`, [manager_id]
                );
                if (managerCheck.rows.length === 0) return res.status(400).json({ error: 'Manager user not found' });
                if (!['admin', 'manager'].includes(managerCheck.rows[0].role)) {
                    return res.status(400).json({ error: 'Assigned manager must have role "manager" or "admin"' });
                }
            }
            fields.push(`manager_id = $${idx++}`);
            values.push(manager_id || null);
        }

        if (fields.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

        fields.push(`updated_at = NOW()`);
        values.push(id);

        const result = await db.query(
            `UPDATE teams SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
            values
        );
        res.json(result.rows[0]);
    } catch (err) { next(err); }
});

// DELETE /teams/:id — soft delete
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        const { id } = req.params;

        const check = await db.query(`SELECT id FROM teams WHERE id = $1 AND deleted_at IS NULL`, [id]);
        if (check.rows.length === 0) return res.status(404).json({ error: 'Team not found' });

        // Unlink members and projects before soft-deleting
        await db.query(`UPDATE app_user SET team_id = NULL WHERE team_id = $1`, [id]);
        await db.query(`UPDATE projects SET team_id = NULL WHERE team_id = $1`, [id]);

        await db.query(
            `UPDATE teams SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
            [id]
        );

        res.json({ success: true, message: 'Team deleted and members/projects unlinked' });
    } catch (err) { next(err); }
});

// ──────────────────────────────────────────────
// Member management
// ──────────────────────────────────────────────

// POST /teams/:id/members — add user to team
router.post('/:id/members', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { user_id } = req.body;
        if (!user_id) return res.status(400).json({ error: 'user_id is required' });

        const teamCheck = await db.query(`SELECT id FROM teams WHERE id = $1 AND deleted_at IS NULL`, [id]);
        if (teamCheck.rows.length === 0) return res.status(404).json({ error: 'Team not found' });

        const userCheck = await db.query(`SELECT id, name, team_id FROM app_user WHERE id = $1`, [user_id]);
        if (userCheck.rows.length === 0) return res.status(404).json({ error: 'User not found' });

        if (userCheck.rows[0].team_id && userCheck.rows[0].team_id !== id) {
            return res.status(409).json({
                error: 'User is already a member of another team. Remove them from that team first.'
            });
        }

        await db.query(`UPDATE app_user SET team_id = $1 WHERE id = $2`, [id, user_id]);

        res.json({ success: true, message: `User added to team` });
    } catch (err) { next(err); }
});

// DELETE /teams/:id/members/:userId — remove user from team
router.delete('/:id/members/:userId', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        const { id, userId } = req.params;

        const check = await db.query(
            `SELECT id FROM app_user WHERE id = $1 AND team_id = $2`,
            [userId, id]
        );
        if (check.rows.length === 0) {
            return res.status(404).json({ error: 'User is not a member of this team' });
        }

        await db.query(`UPDATE app_user SET team_id = NULL WHERE id = $1`, [userId]);
        res.json({ success: true, message: 'User removed from team' });
    } catch (err) { next(err); }
});

// ──────────────────────────────────────────────
// Project assignment
// ──────────────────────────────────────────────

// POST /teams/:id/projects — assign project to team
router.post('/:id/projects', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { project_id } = req.body;
        if (!project_id) return res.status(400).json({ error: 'project_id is required' });

        const teamCheck = await db.query(`SELECT id FROM teams WHERE id = $1 AND deleted_at IS NULL`, [id]);
        if (teamCheck.rows.length === 0) return res.status(404).json({ error: 'Team not found' });

        const projCheck = await db.query(
            `SELECT id, project_name, team_id FROM projects WHERE id = $1 AND deleted_at IS NULL`,
            [project_id]
        );
        if (projCheck.rows.length === 0) return res.status(404).json({ error: 'Project not found' });

        if (projCheck.rows[0].team_id && projCheck.rows[0].team_id !== id) {
            return res.status(409).json({
                error: 'Project is already assigned to another team. Unassign it first.'
            });
        }

        await db.query(`UPDATE projects SET team_id = $1 WHERE id = $2`, [id, project_id]);
        res.json({ success: true, message: 'Project assigned to team' });
    } catch (err) { next(err); }
});

// DELETE /teams/:id/projects/:projectId — unassign project from team
router.delete('/:id/projects/:projectId', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
        const { id, projectId } = req.params;

        const check = await db.query(
            `SELECT id FROM projects WHERE id = $1 AND team_id = $2 AND deleted_at IS NULL`,
            [projectId, id]
        );
        if (check.rows.length === 0) {
            return res.status(404).json({ error: 'Project is not assigned to this team' });
        }

        await db.query(`UPDATE projects SET team_id = NULL WHERE id = $1`, [projectId]);
        res.json({ success: true, message: 'Project unassigned from team' });
    } catch (err) { next(err); }
});

module.exports = router;

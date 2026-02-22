const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth, requirePermission } = require('../middleware/authMiddleware');
const { getManagerTeam, getManagerTeamId } = require('../middleware/teamAccess');

// All manager endpoints require authentication
router.use(requireAuth);

// ──────────────────────────────────────────────────────────────────────────────
// Team membership & progress
// ──────────────────────────────────────────────────────────────────────────────

// GET /manager/team — List all members of the manager's team
router.get('/team', requirePermission('action:journeys:view_team_progress'), async (req, res, next) => {
    try {
        if (req.user.role === 'admin') {
            // Admins: return all users (or let them use /users endpoint)
            const result = await db.query(
                `SELECT id, name, email, role, active, activated, onboarding_completed, team_id, manager_id
                 FROM app_user WHERE active = true ORDER BY name`
            );
            return res.json(result.rows);
        }

        const team = await getManagerTeam(req.user.id);
        if (!team) {
            return res.status(404).json({ error: 'You are not assigned as a manager of any team' });
        }

        const result = await db.query(
            `SELECT id, name, email, role, active, activated, onboarding_completed, team_id
             FROM app_user
             WHERE team_id = $1 AND active = true
             ORDER BY name`,
            [team.id]
        );
        res.json(result.rows);
    } catch (err) { next(err); }
});

// GET /manager/team/:userId/journeys — Journey progress for a team member
router.get('/team/:userId/journeys', requirePermission('action:journeys:view_team_progress'), async (req, res, next) => {
    try {
        const { userId } = req.params;

        // Admins bypass scope check; managers must verify team membership
        if (req.user.role !== 'admin') {
            const team = await getManagerTeam(req.user.id);
            if (!team) return res.status(403).json({ error: 'You are not assigned as a manager of any team' });

            const check = await db.query(
                `SELECT id FROM app_user WHERE id = $1 AND team_id = $2`,
                [userId, team.id]
            );
            if (check.rows.length === 0) {
                return res.status(403).json({ error: 'This user is not in your team' });
            }
        }

        const assignments = await db.query(`
            SELECT uja.*, j.slug, j.title, j.description, j.sort_order
            FROM user_journey_assignments uja
            JOIN journeys j ON uja.journey_id = j.id
            WHERE uja.user_id = $1 AND j.deleted_at IS NULL
            ORDER BY j.sort_order
        `, [userId]);

        const journeys = [];
        for (const a of assignments.rows) {
            const totalResult = await db.query(`
                SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE jt.is_mandatory) AS mandatory
                FROM journey_tasks jt
                JOIN journey_quests jq ON jt.quest_id = jq.id
                JOIN journey_chapters jc ON jq.chapter_id = jc.id
                WHERE jc.journey_id = $1
            `, [a.journey_id]);

            const completedResult = await db.query(`
                SELECT COUNT(*) AS completed,
                    COUNT(*) FILTER (WHERE jt.is_mandatory) AS mandatory_completed
                FROM user_task_completions utc
                JOIN journey_tasks jt ON utc.task_id = jt.id
                JOIN journey_quests jq ON jt.quest_id = jq.id
                JOIN journey_chapters jc ON jq.chapter_id = jc.id
                WHERE jc.journey_id = $1 AND utc.user_id = $2
            `, [a.journey_id, userId]);

            const total = parseInt(totalResult.rows[0].total) || 0;
            const mandatory = parseInt(totalResult.rows[0].mandatory) || 0;
            const completed = parseInt(completedResult.rows[0].completed) || 0;
            const mandatoryCompleted = parseInt(completedResult.rows[0].mandatory_completed) || 0;

            journeys.push({
                ...a,
                progress: {
                    total_tasks: total,
                    mandatory_tasks: mandatory,
                    completed_tasks: completed,
                    mandatory_completed: mandatoryCompleted,
                    completion_pct: mandatory > 0 ? Math.round((mandatoryCompleted / mandatory) * 100) : 0,
                },
            });
        }

        res.json(journeys);
    } catch (err) { next(err); }
});

// GET /manager/team/:userId — Profile + summary for one team member
router.get('/team/:userId', requirePermission('action:journeys:view_team_progress'), async (req, res, next) => {
    try {
        const { userId } = req.params;

        if (req.user.role !== 'admin') {
            const team = await getManagerTeam(req.user.id);
            if (!team) return res.status(403).json({ error: 'You are not assigned as a manager of any team' });

            const check = await db.query(
                `SELECT id FROM app_user WHERE id = $1 AND team_id = $2`,
                [userId, team.id]
            );
            if (check.rows.length === 0) {
                return res.status(403).json({ error: 'This user is not in your team' });
            }
        }

        const userResult = await db.query(
            `SELECT id, name, email, role, active, activated, onboarding_completed, manager_id, team_id
             FROM app_user WHERE id = $1`,
            [userId]
        );
        if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });

        const xpResult = await db.query(
            `SELECT COALESCE(SUM(total_xp), 0) AS total_xp FROM user_journey_assignments WHERE user_id = $1`,
            [userId]
        );

        res.json({
            ...userResult.rows[0],
            total_xp: parseInt(xpResult.rows[0].total_xp) || 0,
        });
    } catch (err) { next(err); }
});

// ──────────────────────────────────────────────────────────────────────────────
// Team project & task overview (manager dashboard)
// ──────────────────────────────────────────────────────────────────────────────

// GET /manager/projects — Projects scoped to manager's team
router.get('/projects', requirePermission('action:journeys:view_team_progress'), async (req, res, next) => {
    try {
        if (req.user.role === 'admin') {
            const result = await db.query(`SELECT * FROM v_projects_with_metrics ORDER BY created_at DESC`);
            return res.json(result.rows);
        }

        const teamId = await getManagerTeamId(req.user.id);
        if (!teamId) return res.json([]);

        const result = await db.query(
            `SELECT * FROM v_projects_with_metrics WHERE team_id = $1 ORDER BY created_at DESC`,
            [teamId]
        );
        res.json(result.rows);
    } catch (err) { next(err); }
});

// GET /manager/tasks — Tasks scoped to manager's team projects
router.get('/tasks', requirePermission('action:journeys:view_team_progress'), async (req, res, next) => {
    try {
        if (req.user.role === 'admin') {
            const result = await db.query(`SELECT * FROM v_tasks_with_metrics ORDER BY created_at DESC`);
            return res.json(result.rows);
        }

        const teamId = await getManagerTeamId(req.user.id);
        if (!teamId) return res.json([]);

        const result = await db.query(`
            SELECT v.* FROM v_tasks_with_metrics v
            JOIN projects p ON p.id = v.project_id
            WHERE p.team_id = $1 AND p.deleted_at IS NULL
            ORDER BY v.created_at DESC
        `, [teamId]);
        res.json(result.rows);
    } catch (err) { next(err); }
});

// GET /manager/summary — Aggregated team summary (members, projects, task counts, XP)
router.get('/summary', requirePermission('action:journeys:view_team_progress'), async (req, res, next) => {
    try {
        if (req.user.role === 'admin') {
            // For admins, return global summary
            const [members, projects, tasks, xp] = await Promise.all([
                db.query(`SELECT COUNT(*) FROM app_user WHERE active = true`),
                db.query(`SELECT COUNT(*) FROM projects WHERE deleted_at IS NULL`),
                db.query(`SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL`),
                db.query(`SELECT COALESCE(SUM(total_xp), 0) AS total_xp FROM user_journey_assignments`),
            ]);
            return res.json({
                team_name: 'All Teams',
                member_count: parseInt(members.rows[0].count),
                project_count: parseInt(projects.rows[0].count),
                task_count: parseInt(tasks.rows[0].count),
                total_xp: parseInt(xp.rows[0].total_xp),
            });
        }

        const team = await getManagerTeam(req.user.id);
        if (!team) {
            return res.status(404).json({ error: 'You are not assigned as a manager of any team' });
        }

        const [members, projects, tasks, xp] = await Promise.all([
            db.query(`SELECT COUNT(*) FROM app_user WHERE team_id = $1 AND active = true`, [team.id]),
            db.query(`SELECT COUNT(*) FROM projects WHERE team_id = $1 AND deleted_at IS NULL`, [team.id]),
            db.query(`
                SELECT COUNT(t.id) FROM tasks t
                JOIN projects p ON p.id = t.project_id
                WHERE p.team_id = $1 AND t.deleted_at IS NULL AND p.deleted_at IS NULL
            `, [team.id]),
            db.query(`
                SELECT COALESCE(SUM(uja.total_xp), 0) AS total_xp
                FROM user_journey_assignments uja
                JOIN app_user u ON u.id = uja.user_id
                WHERE u.team_id = $1
            `, [team.id]),
        ]);

        res.json({
            team_id: team.id,
            team_name: team.name,
            member_count: parseInt(members.rows[0].count),
            project_count: parseInt(projects.rows[0].count),
            task_count: parseInt(tasks.rows[0].count),
            total_xp: parseInt(xp.rows[0].total_xp),
        });
    } catch (err) { next(err); }
});

module.exports = router;

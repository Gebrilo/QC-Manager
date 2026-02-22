const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth } = require('../middleware/authMiddleware');

// All manager endpoints require authentication + the view_team_progress permission
router.use(requireAuth);

const requirePermission = (perm) => (req, res, next) => {
    const userPerms = req.user?.permissions || [];
    const isAdmin = req.user?.role === 'admin';
    if (isAdmin || userPerms.includes(perm)) return next();
    return res.status(403).json({ error: 'Insufficient permissions' });
};

// GET /manager/team — List all direct reports of the current user
router.get('/team', requirePermission('action:journeys:view_team_progress'), async (req, res, next) => {
    try {
        const managerId = req.user.id;
        const result = await db.query(
            `SELECT id, name, email, role, active, activated, onboarding_completed
             FROM app_user
             WHERE manager_id = $1 AND active = true
             ORDER BY name`,
            [managerId]
        );
        res.json(result.rows);
    } catch (err) { next(err); }
});

// GET /manager/team/:userId/journeys — All journeys for a direct report with progress
router.get('/team/:userId/journeys', requirePermission('action:journeys:view_team_progress'), async (req, res, next) => {
    try {
        const managerId = req.user.id;
        const { userId } = req.params;

        // Ensure the user is actually a direct report (or admin can see any user)
        if (req.user.role !== 'admin') {
            const check = await db.query(
                `SELECT id FROM app_user WHERE id = $1 AND manager_id = $2`,
                [userId, managerId]
            );
            if (check.rows.length === 0) {
                return res.status(403).json({ error: 'This user is not in your team' });
            }
        }

        const assignments = await db.query(`
            SELECT uja.*, j.slug, j.title, j.description, j.sort_order, j.next_journey_id, j.required_xp
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

// GET /manager/team/:userId — Profile + summary for one direct report
router.get('/team/:userId', requirePermission('action:journeys:view_team_progress'), async (req, res, next) => {
    try {
        const managerId = req.user.id;
        const { userId } = req.params;

        if (req.user.role !== 'admin') {
            const check = await db.query(
                `SELECT id FROM app_user WHERE id = $1 AND manager_id = $2`,
                [userId, managerId]
            );
            if (check.rows.length === 0) {
                return res.status(403).json({ error: 'This user is not in your team' });
            }
        }

        const userResult = await db.query(
            `SELECT id, name, email, role, active, activated, onboarding_completed, manager_id
             FROM app_user WHERE id = $1`,
            [userId]
        );
        if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });

        // Total XP across all journeys
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

module.exports = router;

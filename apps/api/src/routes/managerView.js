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
            // Admins: return all users
            const result = await db.query(`
                SELECT u.id, u.name, u.email, u.role, u.active, u.activated, 
                       u.onboarding_completed, u.team_id, u.manager_id, u.probation_completed,
                       CASE WHEN r.id IS NOT NULL THEN true ELSE false END AS is_resource
                FROM app_user u
                LEFT JOIN resources r ON u.id = r.user_id AND r.deleted_at IS NULL
                WHERE u.active = true 
                ORDER BY u.name
            `);
            return res.json(result.rows);
        }

        // Managers strictly filtered to users where manager_id == req.user.id
        const result = await db.query(`
            SELECT u.id, u.name, u.email, u.role, u.active, u.activated, 
                   u.onboarding_completed, u.team_id, u.manager_id, u.probation_completed,
                   CASE WHEN r.id IS NOT NULL THEN true ELSE false END AS is_resource
            FROM app_user u
            LEFT JOIN resources r ON u.id = r.user_id AND r.deleted_at IS NULL
            WHERE u.manager_id = $1 AND u.active = true
            ORDER BY u.name
        `, [req.user.id]);

        res.json(result.rows);
    } catch (err) { next(err); }
});

// GET /manager/team/:userId — Get a single team member
router.get('/team/:userId', requirePermission('action:journeys:view_team_progress'), async (req, res, next) => {
    try {
        const { userId } = req.params;
        let query = `
            SELECT u.id, u.name, u.email, u.role, u.active, u.activated, 
                   u.onboarding_completed, u.team_id, u.manager_id, u.probation_completed,
                   CASE WHEN r.id IS NOT NULL THEN true ELSE false END AS is_resource,
                   -- Fetch total XP by summing valid journey XP
                   (SELECT COALESCE(SUM(uja.total_xp), 0) 
                    FROM user_journey_assignments uja 
                    JOIN journeys j ON uja.journey_id = j.id AND j.deleted_at IS NULL 
                    WHERE uja.user_id = u.id) AS total_xp
            FROM app_user u
            LEFT JOIN resources r ON u.id = r.user_id AND r.deleted_at IS NULL
            WHERE u.id = $1 AND u.active = true
        `;
        const params = [userId];

        if (req.user.role !== 'admin') {
            query += ` AND u.manager_id = $2`;
            params.push(req.user.id);
        }

        const result = await db.query(query, params);
        if (result.rows.length === 0) return res.status(404).json({ error: 'User not found in your team' });

        res.json({ ...result.rows[0], total_xp: parseInt(result.rows[0].total_xp) || 0 });
    } catch (err) { next(err); }
});

// PATCH /manager/team/:userId/probation — Toggle probation status
router.patch('/team/:userId/probation', requirePermission('action:journeys:view_team_progress'), async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { completed } = req.body;

        if (req.user.role !== 'admin') {
            // Strictly enforce manager_id == req.user.id
            const check = await db.query(`SELECT id FROM app_user WHERE id = $1 AND manager_id = $2`, [userId, req.user.id]);
            if (check.rows.length === 0) {
                return res.status(403).json({ error: 'This user is not directly managed by you.' });
            }
        }

        const result = await db.query(
            `UPDATE app_user SET probation_completed = $1 WHERE id = $2 RETURNING *`,
            [!!completed, userId]
        );
        res.json(result.rows[0]);
    } catch (err) { next(err); }
});

// GET /manager/eligible-resources — Dropdown list of users eligible to become resources
router.get('/eligible-resources', requirePermission('action:journeys:view_team_progress'), async (req, res, next) => {
    try {
        let query = `
            SELECT u.id, u.name, u.email, u.role 
            FROM app_user u
            LEFT JOIN resources r ON u.id = r.user_id AND r.deleted_at IS NULL
            WHERE u.probation_completed = true 
              AND u.active = true 
              AND r.id IS NULL
        `;
        const params = [];

        if (req.user.role !== 'admin') {
            query += ` AND u.manager_id = $1`;
            params.push(req.user.id);
        }

        query += ` ORDER BY u.name`;

        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) { next(err); }
});

// POST /manager/team/:userId/make-resource — Convert an eligible user to a resource
router.post('/team/:userId/make-resource', requirePermission('action:journeys:view_team_progress'), async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { weekly_capacity_hrs = 40, department = null } = req.body;

        const userQuery = await db.query(`
            SELECT id, name, email, role, probation_completed, manager_id 
            FROM app_user 
            WHERE id = $1 AND active = true
        `, [userId]);

        if (userQuery.rows.length === 0) {
            return res.status(404).json({ error: 'User not found or inactive.' });
        }

        const user = userQuery.rows[0];

        // Validations
        if (req.user.role !== 'admin' && user.manager_id !== req.user.id) {
            return res.status(403).json({ error: 'This user is not directly managed by you.' });
        }

        if (!user.probation_completed) {
            return res.status(400).json({ error: 'User probation is not yet completed. Cannot assign as a resource.' });
        }

        const resourceCheck = await db.query(`SELECT id FROM resources WHERE user_id = $1 AND deleted_at IS NULL`, [userId]);
        if (resourceCheck.rows.length > 0) {
            return res.status(400).json({ error: 'User is already assigned as a resource.' });
        }

        const result = await db.query(
            `INSERT INTO resources (
                resource_name, user_id, email, role, department, weekly_capacity_hrs
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *`,
            [user.name, user.id, user.email, user.role, department, weekly_capacity_hrs]
        );

        res.status(201).json(result.rows[0]);
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

// GET /manager/team/:userId/journeys/:journeyId — Full read-only detail view for a team member's journey
router.get('/team/:userId/journeys/:journeyId', requirePermission('action:journeys:view_team_progress'), async (req, res, next) => {
    try {
        const { userId, journeyId } = req.params;

        // Verify manager controls this user
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

        // Verify assignment
        const assignment = await db.query(
            `SELECT uja.*, j.slug, j.title, j.description, j.sort_order
             FROM user_journey_assignments uja
             JOIN journeys j ON uja.journey_id = j.id
             WHERE uja.user_id = $1 AND uja.journey_id = $2 AND j.deleted_at IS NULL`,
            [userId, journeyId]
        );
        if (assignment.rows.length === 0) {
            return res.status(404).json({ error: 'Journey not assigned to this user' });
        }

        // Fetch full tree
        const chapters = await db.query(
            `SELECT * FROM journey_chapters WHERE journey_id = $1 ORDER BY sort_order`, [journeyId]
        );
        const chapterIds = chapters.rows.map(c => c.id);
        let quests = [];
        let tasks = [];
        let completions = [];
        let attachments = [];

        if (chapterIds.length > 0) {
            quests = (await db.query(
                `SELECT * FROM journey_quests WHERE chapter_id = ANY($1) ORDER BY sort_order`, [chapterIds]
            )).rows;

            const questIds = quests.map(q => q.id);
            if (questIds.length > 0) {
                tasks = (await db.query(
                    `SELECT * FROM journey_tasks WHERE quest_id = ANY($1) ORDER BY sort_order`, [questIds]
                )).rows;

                const taskIds = tasks.map(t => t.id);
                if (taskIds.length > 0) {
                    completions = (await db.query(
                        `SELECT * FROM user_task_completions WHERE user_id = $1 AND task_id = ANY($2)`,
                        [userId, taskIds]
                    )).rows;
                    attachments = (await db.query(
                        `SELECT * FROM journey_task_attachments WHERE user_id = $1 AND task_id = ANY($2)`,
                        [userId, taskIds]
                    )).rows;
                }
            }
        }

        const completionMap = {};
        for (const c of completions) {
            completionMap[c.task_id] = c;
        }

        const attachmentMap = {};
        for (const a of attachments) {
            attachmentMap[a.task_id] = a;
        }

        // Build nested tree with read-only completion flags and file details
        const chaptersWithProgress = chapters.rows.map(ch => {
            const chQuests = quests.filter(q => q.chapter_id === ch.id);
            const questsWithTasks = chQuests.map(q => {
                const qTasks = tasks.filter(t => t.quest_id === q.id).map(t => {
                    const taskAtt = attachmentMap[t.id];
                    return {
                        ...t,
                        is_completed: !!completionMap[t.id],
                        completion: completionMap[t.id] || null,
                        attachment: taskAtt ? {
                            id: taskAtt.id,
                            original_name: taskAtt.original_name,
                            size_bytes: taskAtt.size_bytes,
                            created_at: taskAtt.created_at
                        } : null
                    };
                });
                const mandatoryTasks = qTasks.filter(t => t.is_mandatory);
                const mandatoryDone = mandatoryTasks.filter(t => t.is_completed).length;
                return {
                    ...q,
                    tasks: qTasks,
                    progress: {
                        total: qTasks.length,
                        completed: qTasks.filter(t => t.is_completed).length,
                        mandatory_total: mandatoryTasks.length,
                        mandatory_completed: mandatoryDone,
                        is_complete: mandatoryTasks.length > 0 ? mandatoryDone === mandatoryTasks.length : true,
                    },
                };
            });
            const mandatoryQuests = questsWithTasks.filter(q => q.is_mandatory);
            const mandatoryQuestsDone = mandatoryQuests.filter(q => q.progress.is_complete).length;
            return {
                ...ch,
                quests: questsWithTasks,
                progress: {
                    total_quests: questsWithTasks.length,
                    completed_quests: questsWithTasks.filter(q => q.progress.is_complete).length,
                    mandatory_total: mandatoryQuests.length,
                    mandatory_completed: mandatoryQuestsDone,
                    is_complete: mandatoryQuests.length > 0 ? mandatoryQuestsDone === mandatoryQuests.length : true,
                },
            };
        });

        res.json({
            ...assignment.rows[0],
            chapters: chaptersWithProgress,
        });
    } catch (err) { next(err); }
});

// GET /manager/team/:userId/journeys/:journeyId/tasks/:taskId/attachment — Download attachment
router.get('/team/:userId/journeys/:journeyId/tasks/:taskId/attachment', requirePermission('action:journeys:view_team_progress'), async (req, res, next) => {
    try {
        const { userId, journeyId, taskId } = req.params;

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

        const attachment = await db.query(
            `SELECT jta.* FROM journey_task_attachments jta
             JOIN journey_tasks jt ON jta.task_id = jt.id
             JOIN journey_quests jq ON jt.quest_id = jq.id
             JOIN journey_chapters jc ON jq.chapter_id = jc.id
             WHERE jta.user_id = $1 AND jta.task_id = $2 AND jc.journey_id = $3`,
            [userId, taskId, journeyId]
        );

        if (attachment.rows.length === 0) {
            return res.status(404).json({ error: 'Attachment not found for this task' });
        }

        const fileRecord = attachment.rows[0];
        const filePath = require('path').join(__dirname, '..', '..', 'uploads', 'journey-tasks', fileRecord.filename);

        if (!require('fs').existsSync(filePath)) {
            return res.status(404).json({ error: 'File missing on server' });
        }

        res.download(filePath, fileRecord.original_name);
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

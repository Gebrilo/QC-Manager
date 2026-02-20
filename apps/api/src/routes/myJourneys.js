const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth } = require('../middleware/authMiddleware');
const { completeTaskSchema } = require('../schemas/journey');

router.use(requireAuth);

// GET /my-journeys — List assigned journeys with progress summary
router.get('/', async (req, res, next) => {
    try {
        const userId = req.user.id;

        const assignments = await db.query(`
            SELECT uja.*, j.slug, j.title, j.description, j.sort_order
            FROM user_journey_assignments uja
            JOIN journeys j ON uja.journey_id = j.id
            WHERE uja.user_id = $1 AND j.deleted_at IS NULL
            ORDER BY j.sort_order
        `, [userId]);

        // Compute progress for each journey
        const journeys = [];
        for (const a of assignments.rows) {
            const taskCounts = await db.query(`
                SELECT
                    COUNT(jt.id) AS total_tasks,
                    COUNT(jt.id) FILTER (WHERE jt.is_mandatory) AS mandatory_tasks,
                    COUNT(utc.id) AS completed_tasks,
                    COUNT(utc.id) FILTER (WHERE jt.is_mandatory) AS mandatory_completed
                FROM journey_tasks jt
                JOIN journey_quests jq ON jt.quest_id = jq.id
                JOIN journey_chapters jc ON jq.chapter_id = jc.id
                WHERE jc.journey_id = $1
                LEFT JOIN user_task_completions utc ON utc.task_id = jt.id AND utc.user_id = $2
            `, [a.journey_id, userId]);

            // Use a simpler approach: count total tasks and completions separately
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

// GET /my-journeys/:journeyId — Full tree with completion status
router.get('/:journeyId', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { journeyId } = req.params;

        // Verify assignment
        const assignment = await db.query(
            `SELECT uja.*, j.slug, j.title, j.description, j.sort_order
             FROM user_journey_assignments uja
             JOIN journeys j ON uja.journey_id = j.id
             WHERE uja.user_id = $1 AND uja.journey_id = $2 AND j.deleted_at IS NULL`,
            [userId, journeyId]
        );
        if (assignment.rows.length === 0) {
            return res.status(404).json({ error: 'Journey not assigned to you' });
        }

        // Fetch full tree
        const chapters = await db.query(
            `SELECT * FROM journey_chapters WHERE journey_id = $1 ORDER BY sort_order`, [journeyId]
        );
        const chapterIds = chapters.rows.map(c => c.id);
        let quests = [];
        let tasks = [];
        let completions = [];

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
                }
            }
        }

        const completionMap = {};
        for (const c of completions) {
            completionMap[c.task_id] = c;
        }

        // Build nested tree with completion flags
        const tree = {
            ...assignment.rows[0],
            chapters: chapters.rows.map(ch => {
                const chQuests = quests.filter(q => q.chapter_id === ch.id);
                const questsWithTasks = chQuests.map(q => {
                    const qTasks = tasks.filter(t => t.quest_id === q.id).map(t => ({
                        ...t,
                        is_completed: !!completionMap[t.id],
                        completion: completionMap[t.id] || null,
                    }));
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
            }),
        };

        // Overall progress
        const allTasks = tasks.map(t => ({ ...t, is_completed: !!completionMap[t.id] }));
        const mandatoryAll = allTasks.filter(t => t.is_mandatory);
        tree.progress = {
            total_tasks: allTasks.length,
            completed_tasks: allTasks.filter(t => t.is_completed).length,
            mandatory_tasks: mandatoryAll.length,
            mandatory_completed: mandatoryAll.filter(t => t.is_completed).length,
            completion_pct: mandatoryAll.length > 0
                ? Math.round((mandatoryAll.filter(t => t.is_completed).length / mandatoryAll.length) * 100)
                : 0,
        };

        res.json(tree);
    } catch (err) { next(err); }
});

// POST /my-journeys/:journeyId/tasks/:taskId/complete — Complete a task
router.post('/:journeyId/tasks/:taskId/complete', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { journeyId, taskId } = req.params;
        const data = completeTaskSchema.parse(req.body);

        // Verify assignment
        const assignment = await db.query(
            `SELECT id, status FROM user_journey_assignments WHERE user_id = $1 AND journey_id = $2`,
            [userId, journeyId]
        );
        if (assignment.rows.length === 0) {
            return res.status(404).json({ error: 'Journey not assigned to you' });
        }

        // Verify task belongs to this journey
        const taskCheck = await db.query(`
            SELECT jt.id FROM journey_tasks jt
            JOIN journey_quests jq ON jt.quest_id = jq.id
            JOIN journey_chapters jc ON jq.chapter_id = jc.id
            WHERE jt.id = $1 AND jc.journey_id = $2
        `, [taskId, journeyId]);
        if (taskCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Task not found in this journey' });
        }

        // Insert completion
        const result = await db.query(
            `INSERT INTO user_task_completions (user_id, task_id, validation_data)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, task_id) DO UPDATE SET validation_data = $3, completed_at = NOW()
             RETURNING *`,
            [userId, taskId, JSON.stringify(data.validation_data)]
        );

        // Update assignment status to in_progress if still assigned
        if (assignment.rows[0].status === 'assigned') {
            await db.query(
                `UPDATE user_journey_assignments SET status = 'in_progress', started_at = NOW() WHERE user_id = $1 AND journey_id = $2`,
                [userId, journeyId]
            );
        }

        // Check if all mandatory tasks are now complete
        const mandatoryCheck = await db.query(`
            SELECT COUNT(*) AS total,
                COUNT(utc.id) AS completed
            FROM journey_tasks jt
            JOIN journey_quests jq ON jt.quest_id = jq.id
            JOIN journey_chapters jc ON jq.chapter_id = jc.id
            LEFT JOIN user_task_completions utc ON utc.task_id = jt.id AND utc.user_id = $2
            WHERE jc.journey_id = $1 AND jt.is_mandatory = true
        `, [journeyId, userId]);

        const { total, completed } = mandatoryCheck.rows[0];
        if (parseInt(total) > 0 && parseInt(completed) === parseInt(total)) {
            await db.query(
                `UPDATE user_journey_assignments SET status = 'completed', completed_at = NOW() WHERE user_id = $1 AND journey_id = $2`,
                [userId, journeyId]
            );

            // Check if all auto-assigned journeys are complete → set onboarding_completed
            const incompleteJourneys = await db.query(`
                SELECT COUNT(*) AS cnt FROM user_journey_assignments uja
                JOIN journeys j ON uja.journey_id = j.id
                WHERE uja.user_id = $1 AND j.auto_assign_on_activation = true AND uja.status != 'completed'
            `, [userId]);

            if (parseInt(incompleteJourneys.rows[0].cnt) === 0) {
                await db.query(
                    `UPDATE app_user SET onboarding_completed = true, updated_at = NOW() WHERE id = $1`,
                    [userId]
                );
            }
        }

        res.json(result.rows[0]);
    } catch (err) { next(err); }
});

// DELETE /my-journeys/:journeyId/tasks/:taskId/complete — Undo task completion
router.delete('/:journeyId/tasks/:taskId/complete', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { journeyId, taskId } = req.params;

        const result = await db.query(
            `DELETE FROM user_task_completions WHERE user_id = $1 AND task_id = $2 RETURNING *`,
            [userId, taskId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Completion not found' });
        }

        // Revert journey assignment status if it was completed
        await db.query(
            `UPDATE user_journey_assignments SET status = 'in_progress', completed_at = NULL
             WHERE user_id = $1 AND journey_id = $2 AND status = 'completed'`,
            [userId, journeyId]
        );

        res.json({ success: true, message: 'Task completion undone' });
    } catch (err) { next(err); }
});

module.exports = router;

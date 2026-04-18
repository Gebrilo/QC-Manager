'use strict';

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { canAccessUser } = require('../middleware/teamAccess');

function buildProgress(tasks, completions) {
    const completionMap = new Map(completions.map(c => [c.task_id, c]));
    const total = tasks.length;
    const mandatory = tasks.filter(t => t.is_mandatory).length;
    let done = 0;
    let mandatoryDone = 0;
    let overdue = 0;
    const today = new Date().toISOString().slice(0, 10);

    for (const t of tasks) {
        const c = completionMap.get(t.id);
        const isDone = c?.progress_status === 'DONE';
        if (isDone) { done++; if (t.is_mandatory) mandatoryDone++; }
        if (!isDone && t.due_date && t.due_date < today) overdue++;
    }

    return {
        total_tasks: total,
        done_tasks: done,
        completion_pct: total > 0 ? Math.round((done / total) * 100) : 0,
        mandatory_tasks: mandatory,
        mandatory_done: mandatoryDone,
        overdue_tasks: overdue,
    };
}

async function getPlanForUser(userId) {
    const planResult = await db.query(
        `SELECT * FROM journeys WHERE owner_user_id = $1 AND plan_type = 'idp' AND is_active = true AND deleted_at IS NULL LIMIT 1`,
        [userId]
    );
    return planResult.rows[0] || null;
}

router.post('/:userId', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { title, description, required_xp = 0 } = req.body;

        if (!title) return res.status(400).json({ error: 'title is required' });

        const allowed = await canAccessUser(req.user, userId);
        if (!allowed) return res.status(403).json({ error: 'User is not in your team' });

        const userResult = await db.query(
            `SELECT id, status, name FROM app_user WHERE id = $1 AND active = true`,
            [userId]
        );
        if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });

        const user = userResult.rows[0];
        if (user.status !== 'ACTIVE') {
            return res.status(400).json({ error: 'IDP plans can only be created for ACTIVE users' });
        }

        const existingPlan = await db.query(
            `SELECT id FROM journeys WHERE owner_user_id = $1 AND plan_type = 'idp' AND is_active = true AND deleted_at IS NULL`,
            [userId]
        );
        if (existingPlan.rows.length > 0) {
            return res.status(409).json({ error: 'User already has an active IDP plan' });
        }

        const slug = `idp-${userId}-${Date.now()}`;
        const planResult = await db.query(
            `INSERT INTO journeys (slug, title, description, plan_type, owner_user_id, created_by_manager, is_active, required_xp)
             VALUES ($1, $2, $3, 'idp', $4, $5, true, $6) RETURNING *`,
            [slug, title, description || null, userId, req.user.id, required_xp]
        );
        const plan = planResult.rows[0];

        await db.query(
            `INSERT INTO user_journey_assignments (user_id, journey_id) VALUES ($1, $2)`,
            [userId, plan.id]
        );

        res.status(201).json(plan);
    } catch (err) { next(err); }
});

router.get('/:userId', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { userId } = req.params;

        const allowed = await canAccessUser(req.user, userId);
        if (!allowed) return res.status(403).json({ error: 'User is not in your team' });

        const plan = await getPlanForUser(userId);
        if (!plan) return res.status(404).json({ error: 'No active IDP plan found for this user' });

        const chapters = await db.query(
            `SELECT * FROM journey_chapters WHERE journey_id = $1 ORDER BY sort_order`,
            [plan.id]
        );
        const chapterIds = chapters.rows.map(c => c.id);

        let quests = [];
        let tasks = [];
        let completions = [];

        if (chapterIds.length > 0) {
            quests = (await db.query(
                `SELECT * FROM journey_quests WHERE chapter_id = ANY($1)`, [chapterIds]
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

        const completionMap = new Map(completions.map(c => [c.task_id, c]));
        const today = new Date().toISOString().slice(0, 10);

        const objectives = chapters.rows.map(ch => {
            const chQuest = quests.find(q => q.chapter_id === ch.id);
            const chTasks = chQuest ? tasks.filter(t => t.quest_id === chQuest.id) : [];
            const chCompletions = chTasks.map(t => completionMap.get(t.id)).filter(Boolean);
            const done = chCompletions.filter(c => c.progress_status === 'DONE').length;
            const overdue = chTasks.filter(t => {
                const c = completionMap.get(t.id);
                return (!c || c.progress_status !== 'DONE') && t.due_date && t.due_date < today;
            }).length;

            return {
                id: ch.id,
                title: ch.title,
                description: ch.description,
                due_date: ch.due_date,
                sort_order: ch.sort_order,
                progress: {
                    total: chTasks.length,
                    done,
                    completion_pct: chTasks.length > 0 ? Math.round((done / chTasks.length) * 100) : 0,
                    overdue,
                },
                tasks: chTasks.map(t => {
                    const c = completionMap.get(t.id);
                    return {
                        id: t.id,
                        title: t.title,
                        description: t.description,
                        due_date: t.due_date,
                        priority: t.priority,
                        difficulty: t.difficulty,
                        is_mandatory: t.is_mandatory,
                        progress_status: c?.progress_status || 'TODO',
                        completed_at: c?.completed_at || null,
                    };
                }),
            };
        });

        const allProgress = buildProgress(tasks, completions);

        res.json({ ...plan, objectives, progress: allProgress });
    } catch (err) { next(err); }
});

module.exports = router;

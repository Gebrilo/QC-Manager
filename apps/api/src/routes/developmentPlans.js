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
    let onHold = 0;
    const today = new Date().toISOString().slice(0, 10);

    for (const t of tasks) {
        const c = completionMap.get(t.id);
        const isDone = c?.progress_status === 'DONE';
        if (isDone) { done++; if (t.is_mandatory) mandatoryDone++; }
        if (c?.progress_status === 'ON_HOLD') onHold++;
        if (!isDone && t.due_date && t.due_date < today) overdue++;
    }

    return {
        total_tasks: total,
        done_tasks: done,
        completion_pct: total > 0 ? Math.round((done / total) * 100) : 0,
        mandatory_tasks: mandatory,
        mandatory_done: mandatoryDone,
        overdue_tasks: overdue,
        on_hold_tasks: onHold,
    };
}

function computeCompletedLate(task, completion) {
    if (completion?.progress_status !== 'DONE') return null;
    if (!task.due_date || !completion.completed_at) return null;
    const completedDate = completion.completed_at instanceof Date
        ? completion.completed_at.toISOString().slice(0, 10)
        : String(completion.completed_at).slice(0, 10);
    return completedDate > task.due_date;
}

async function getPlanForUser(userId) {
    const planResult = await db.query(
        `SELECT * FROM journeys WHERE owner_user_id = $1 AND plan_type = 'idp' AND is_active = true AND deleted_at IS NULL LIMIT 1`,
        [userId]
    );
    return planResult.rows[0] || null;
}

// ─── GET /my — user views own IDP plan ───────────────────────────────────────

router.get('/my', requireAuth, async (req, res, next) => {
    try {
        const userId = req.user.id;
        const plan = await getPlanForUser(userId);
        if (!plan) return res.status(404).json({ error: 'No active IDP plan found' });

        const chapters = await db.query(
            `SELECT * FROM journey_chapters WHERE journey_id = $1 ORDER BY sort_order`, [plan.id]
        );
        const chapterIds = chapters.rows.map(c => c.id);
        let quests = [], tasks = [], completions = [];

        if (chapterIds.length > 0) {
            quests = (await db.query(`SELECT * FROM journey_quests WHERE chapter_id = ANY($1)`, [chapterIds])).rows;
            const questIds = quests.map(q => q.id);
            if (questIds.length > 0) {
                tasks = (await db.query(`SELECT * FROM journey_tasks WHERE quest_id = ANY($1) ORDER BY sort_order`, [questIds])).rows;
                const taskIds = tasks.map(t => t.id);
                if (taskIds.length > 0) {
                    completions = (await db.query(
                        `SELECT * FROM user_task_completions WHERE user_id = $1 AND task_id = ANY($2)`, [userId, taskIds]
                    )).rows;
                }
            }
        }

        const completionMap = new Map(completions.map(c => [c.task_id, c]));
        const today = new Date().toISOString().slice(0, 10);

        const objectives = chapters.rows.map(ch => {
            const chQuest = quests.find(q => q.chapter_id === ch.id);
            const chTasks = chQuest ? tasks.filter(t => t.quest_id === chQuest.id) : [];
            const done = chTasks.filter(t => completionMap.get(t.id)?.progress_status === 'DONE').length;
            const overdue = chTasks.filter(t => {
                const c = completionMap.get(t.id);
                return (!c || c.progress_status !== 'DONE') && t.due_date && t.due_date < today;
            }).length;
            return {
                id: ch.id,
                title: ch.title,
                description: ch.description,
                start_date: ch.start_date,
                due_date: ch.due_date,
                progress: {
                    total: chTasks.length,
                    done,
                    completion_pct: chTasks.length > 0 ? Math.round((done / chTasks.length) * 100) : 0,
                    overdue,
                },
                tasks: chTasks.map(t => {
                    const c = completionMap.get(t.id);
                    const progressStatus = c?.progress_status || 'TODO';
                    const notDone = progressStatus !== 'DONE';
                    return {
                        id: t.id,
                        title: t.title,
                        description: t.description,
                        start_date: t.start_date,
                        due_date: t.due_date,
                        priority: t.priority,
                        difficulty: t.difficulty,
                        is_mandatory: t.is_mandatory,
                        progress_status: progressStatus,
                        is_overdue: notDone && !!t.due_date && t.due_date < today,
                        completed_at: c?.completed_at || null,
                        completed_late: computeCompletedLate(t, c),
                        hold_reason: c?.hold_reason ?? null,
                    };
                }),
            };
        });

        res.json({ ...plan, objectives, progress: buildProgress(tasks, completions) });
    } catch (err) { next(err); }
});

// ─── PATCH /my/tasks/:taskId/status — update task status ─────────────────────

router.patch('/my/tasks/:taskId/status', requireAuth, async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { taskId } = req.params;
        const { status, comment } = req.body;

        const VALID = ['TODO', 'IN_PROGRESS', 'ON_HOLD', 'DONE'];
        if (!VALID.includes(status)) {
            return res.status(400).json({ error: `status must be one of: ${VALID.join(', ')}` });
        }

        const trimmedComment = typeof comment === 'string' ? comment.trim() : '';
        if (status === 'ON_HOLD' && trimmedComment.length === 0) {
            return res.status(400).json({ error: 'A comment is required when placing a task On Hold' });
        }

        const plan = await getPlanForUser(userId);
        if (!plan) return res.status(404).json({ error: 'No active IDP plan found' });

        const taskCheck = await db.query(
            `SELECT jt.id FROM journey_tasks jt
             JOIN journey_quests jq ON jt.quest_id = jq.id
             JOIN journey_chapters jc ON jq.chapter_id = jc.id
             WHERE jt.id = $1 AND jc.journey_id = $2`,
            [taskId, plan.id]
        );
        if (taskCheck.rows.length === 0) return res.status(404).json({ error: 'Task not found in your plan' });

        if (status === 'TODO') {
            await db.query(`DELETE FROM user_task_completions WHERE user_id = $1 AND task_id = $2`, [userId, taskId]);
            return res.json({ task_id: taskId, progress_status: 'TODO', hold_reason: null });
        }

        if (status === 'ON_HOLD') {
            const upsert = await db.query(
                `INSERT INTO user_task_completions (user_id, task_id, progress_status, hold_reason)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (user_id, task_id)
                 DO UPDATE SET progress_status = $3, hold_reason = $4, completed_at = NULL
                 RETURNING *`,
                [userId, taskId, 'ON_HOLD', trimmedComment]
            );
            await db.query(
                `INSERT INTO idp_task_comment (user_id, task_id, author_id, body)
                 VALUES ($1, $2, $3, $4)`,
                [userId, taskId, userId, trimmedComment]
            );
            return res.json(upsert.rows[0]);
        }

        const result = await db.query(
            `INSERT INTO user_task_completions (user_id, task_id, progress_status, hold_reason)
             VALUES ($1, $2, $3, NULL)
             ON CONFLICT (user_id, task_id)
             DO UPDATE SET
                progress_status = $3,
                hold_reason = NULL,
                completed_at = CASE WHEN $3 = 'DONE' THEN NOW() ELSE NULL END
             RETURNING *`,
            [userId, taskId, status]
        );
        res.json(result.rows[0]);
    } catch (err) { next(err); }
});

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
                start_date: ch.start_date,
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
                        start_date: t.start_date,
                        due_date: t.due_date,
                        priority: t.priority,
                        difficulty: t.difficulty,
                        is_mandatory: t.is_mandatory,
                        progress_status: c?.progress_status || 'TODO',
                        completed_at: c?.completed_at || null,
                        completed_late: computeCompletedLate(t, c),
                        hold_reason: c?.hold_reason ?? null,
                    };
                }),
            };
        });

        const allProgress = buildProgress(tasks, completions);

        res.json({ ...plan, objectives, progress: allProgress });
    } catch (err) { next(err); }
});

// ─── POST /:userId/objectives — add objective (chapter + system quest) ────────

router.post('/:userId/objectives', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { title, description, start_date, due_date, sort_order = 0 } = req.body;
        if (!title) return res.status(400).json({ error: 'title is required' });

        const allowed = await canAccessUser(req.user, userId);
        if (!allowed) return res.status(403).json({ error: 'User is not in your team' });

        const plan = await getPlanForUser(userId);
        if (!plan) return res.status(404).json({ error: 'No active IDP plan found' });

        const slug = `obj-${Date.now()}`;
        const chapterResult = await db.query(
            `INSERT INTO journey_chapters (journey_id, slug, title, description, start_date, due_date, sort_order, is_mandatory, xp_reward)
             VALUES ($1, $2, $3, $4, $5, $6, $7, true, 0) RETURNING *`,
            [plan.id, slug, title, description || null, start_date || null, due_date || null, sort_order]
        );
        const chapter = chapterResult.rows[0];

        // Auto-create the single system quest that holds all tasks for this objective
        await db.query(
            `INSERT INTO journey_quests (chapter_id, slug, title, sort_order, is_mandatory)
             VALUES ($1, $2, 'Tasks', 0, true)`,
            [chapter.id, `idp-tasks-${chapter.id}`]
        );

        res.status(201).json(chapter);
    } catch (err) { next(err); }
});

// ─── PATCH /:userId/objectives/:chapterId — update objective ──────────────────

router.patch('/:userId/objectives/:chapterId', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { userId, chapterId } = req.params;
        const { title, description, start_date, due_date, sort_order } = req.body;

        const allowed = await canAccessUser(req.user, userId);
        if (!allowed) return res.status(403).json({ error: 'User is not in your team' });

        const plan = await getPlanForUser(userId);
        if (!plan) return res.status(404).json({ error: 'No active IDP plan found' });

        const fields = [];
        const values = [];
        let idx = 1;
        if (title !== undefined)       { fields.push(`title = $${idx++}`);       values.push(title); }
        if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
        if (start_date !== undefined)  { fields.push(`start_date = $${idx++}`);  values.push(start_date); }
        if (due_date !== undefined)    { fields.push(`due_date = $${idx++}`);    values.push(due_date); }
        if (sort_order !== undefined)  { fields.push(`sort_order = $${idx++}`);  values.push(sort_order); }
        if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

        fields.push(`updated_at = NOW()`);
        values.push(chapterId, plan.id);
        const result = await db.query(
            `UPDATE journey_chapters SET ${fields.join(', ')} WHERE id = $${idx} AND journey_id = $${idx + 1} RETURNING *`,
            values
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Objective not found' });
        res.json(result.rows[0]);
    } catch (err) { next(err); }
});

// ─── DELETE /:userId/objectives/:chapterId — delete objective ─────────────────

router.delete('/:userId/objectives/:chapterId', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { userId, chapterId } = req.params;

        const allowed = await canAccessUser(req.user, userId);
        if (!allowed) return res.status(403).json({ error: 'User is not in your team' });

        const plan = await getPlanForUser(userId);
        if (!plan) return res.status(404).json({ error: 'No active IDP plan found' });

        // Verify chapter belongs to this plan
        const check = await db.query(
            `SELECT id FROM journey_chapters WHERE id = $1 AND journey_id = $2`, [chapterId, plan.id]
        );
        if (check.rows.length === 0) return res.status(404).json({ error: 'Objective not found' });

        // Cascade: delete chapter (quests and tasks cascade via FK in DB)
        await db.query(`DELETE FROM journey_chapters WHERE id = $1`, [chapterId]);

        res.json({ success: true });
    } catch (err) { next(err); }
});

// ─── POST /:userId/objectives/:chapterId/tasks — add action item ──────────────

router.post('/:userId/objectives/:chapterId/tasks', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { userId, chapterId } = req.params;
        const { title, description, start_date, due_date, priority, difficulty, is_mandatory = true, sort_order = 0 } = req.body;
        if (!title) return res.status(400).json({ error: 'title is required' });

        const allowed = await canAccessUser(req.user, userId);
        if (!allowed) return res.status(403).json({ error: 'User is not in your team' });

        const plan = await getPlanForUser(userId);
        if (!plan) return res.status(404).json({ error: 'No active IDP plan found' });

        const questResult = await db.query(
            `SELECT jq.id FROM journey_quests jq
             JOIN journey_chapters jc ON jq.chapter_id = jc.id
             WHERE jq.chapter_id = $1 AND jc.journey_id = $2 LIMIT 1`,
            [chapterId, plan.id]
        );
        if (questResult.rows.length === 0) return res.status(404).json({ error: 'Objective not found' });
        const questId = questResult.rows[0].id;

        const slug = `task-${Date.now()}`;
        const taskResult = await db.query(
            `INSERT INTO journey_tasks (quest_id, slug, title, description, start_date, due_date, priority, difficulty, is_mandatory, sort_order, validation_type, validation_config)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'none', '{}') RETURNING *`,
            [questId, slug, title, description || null, start_date || null, due_date || null, priority || null, difficulty || null, is_mandatory, sort_order]
        );
        res.status(201).json(taskResult.rows[0]);
    } catch (err) { next(err); }
});

// ─── PATCH /:userId/tasks/:taskId — update task ───────────────────────────────

router.patch('/:userId/tasks/:taskId', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { userId, taskId } = req.params;
        const { title, description, start_date, due_date, priority, difficulty, is_mandatory, sort_order } = req.body;

        const allowed = await canAccessUser(req.user, userId);
        if (!allowed) return res.status(403).json({ error: 'User is not in your team' });

        const plan = await getPlanForUser(userId);
        if (!plan) return res.status(404).json({ error: 'No active IDP plan found' });

        const fields = [];
        const values = [];
        let idx = 1;
        if (title !== undefined)        { fields.push(`title = $${idx++}`);        values.push(title); }
        if (description !== undefined)  { fields.push(`description = $${idx++}`);  values.push(description); }
        if (start_date !== undefined)   { fields.push(`start_date = $${idx++}`);   values.push(start_date); }
        if (due_date !== undefined)     { fields.push(`due_date = $${idx++}`);     values.push(due_date); }
        if (priority !== undefined)     { fields.push(`priority = $${idx++}`);     values.push(priority); }
        if (difficulty !== undefined)   { fields.push(`difficulty = $${idx++}`);   values.push(difficulty); }
        if (is_mandatory !== undefined) { fields.push(`is_mandatory = $${idx++}`); values.push(is_mandatory); }
        if (sort_order !== undefined)   { fields.push(`sort_order = $${idx++}`);   values.push(sort_order); }
        if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

        fields.push(`updated_at = NOW()`);
        values.push(taskId);

        const result = await db.query(
            `UPDATE journey_tasks SET ${fields.join(', ')}
             WHERE id = $${idx}
               AND quest_id IN (
                 SELECT jq.id FROM journey_quests jq
                 JOIN journey_chapters jc ON jq.chapter_id = jc.id
                 WHERE jc.journey_id = $${idx + 1}
               )
             RETURNING *`,
            [...values, plan.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found in this plan' });
        res.json(result.rows[0]);
    } catch (err) { next(err); }
});

// ─── DELETE /:userId/tasks/:taskId — delete task ──────────────────────────────

router.delete('/:userId/tasks/:taskId', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { userId, taskId } = req.params;

        const allowed = await canAccessUser(req.user, userId);
        if (!allowed) return res.status(403).json({ error: 'User is not in your team' });

        const plan = await getPlanForUser(userId);
        if (!plan) return res.status(404).json({ error: 'No active IDP plan found' });

        const check = await db.query(
            `SELECT jt.id FROM journey_tasks jt
             JOIN journey_quests jq ON jt.quest_id = jq.id
             JOIN journey_chapters jc ON jq.chapter_id = jc.id
             WHERE jt.id = $1 AND jc.journey_id = $2`,
            [taskId, plan.id]
        );
        if (check.rows.length === 0) return res.status(404).json({ error: 'Task not found in this plan' });

        await db.query(`DELETE FROM journey_tasks WHERE id = $1`, [taskId]);
        res.json({ success: true });
    } catch (err) { next(err); }
});

// ─── POST /:userId/complete — mark plan complete + award XP ──────────────────

router.post('/:userId/complete', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { userId } = req.params;

        const allowed = await canAccessUser(req.user, userId);
        if (!allowed) return res.status(403).json({ error: 'User is not in your team' });

        const plan = await getPlanForUser(userId);
        if (!plan) return res.status(404).json({ error: 'No active IDP plan found' });

        const incompleteResult = await db.query(
            `SELECT COUNT(*) AS incomplete_mandatory
             FROM journey_tasks jt
             JOIN journey_quests jq ON jt.quest_id = jq.id
             JOIN journey_chapters jc ON jq.chapter_id = jc.id
             WHERE jc.journey_id = $1 AND jt.is_mandatory = true
               AND NOT EXISTS (
                 SELECT 1 FROM user_task_completions utc
                 WHERE utc.task_id = jt.id AND utc.user_id = $2 AND utc.progress_status = 'DONE'
               )`,
            [plan.id, userId]
        );
        const incomplete = parseInt(incompleteResult.rows[0].incomplete_mandatory) || 0;
        if (incomplete > 0) {
            return res.status(400).json({ error: `${incomplete} mandatory task(s) are still incomplete` });
        }

        await db.query(`UPDATE journeys SET is_active = false, updated_at = NOW() WHERE id = $1`, [plan.id]);
        await db.query(
            `UPDATE user_journey_assignments SET total_xp = total_xp + $1 WHERE user_id = $2 AND journey_id = $3`,
            [plan.required_xp || 0, userId, plan.id]
        );
        await db.query(
            `INSERT INTO notification (user_id, type, title, message) VALUES ($1, 'IDP_COMPLETED', 'Development Plan Completed', 'Congratulations! Your development plan has been marked complete.')`,
            [userId]
        );

        res.json({ success: true });
    } catch (err) { next(err); }
});

// ─── GET /:userId/report — performance report ─────────────────────────────────

router.get('/:userId/report', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { userId } = req.params;

        const allowed = await canAccessUser(req.user, userId);
        if (!allowed) return res.status(403).json({ error: 'User is not in your team' });

        const userResult = await db.query(`SELECT id, name, email FROM app_user WHERE id = $1`, [userId]);
        if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });

        const plan = await getPlanForUser(userId);
        if (!plan) return res.status(404).json({ error: 'No active IDP plan found' });

        const chapters = await db.query(
            `SELECT * FROM journey_chapters WHERE journey_id = $1 ORDER BY sort_order`, [plan.id]
        );
        const chapterIds = chapters.rows.map(c => c.id);
        let quests = [], tasks = [], completions = [];

        if (chapterIds.length > 0) {
            quests = (await db.query(`SELECT * FROM journey_quests WHERE chapter_id = ANY($1)`, [chapterIds])).rows;
            const questIds = quests.map(q => q.id);
            if (questIds.length > 0) {
                tasks = (await db.query(`SELECT * FROM journey_tasks WHERE quest_id = ANY($1)`, [questIds])).rows;
                const taskIds = tasks.map(t => t.id);
                if (taskIds.length > 0) {
                    completions = (await db.query(
                        `SELECT * FROM user_task_completions WHERE user_id = $1 AND task_id = ANY($2)`, [userId, taskIds]
                    )).rows;
                }
            }
        }

        const completionMap = new Map(completions.map(c => [c.task_id, c]));
        const today = new Date().toISOString().slice(0, 10);

        let doneOnTime = 0;
        let doneLate = 0;

        const objectivesReport = chapters.rows.map(ch => {
            const chQuest = quests.find(q => q.chapter_id === ch.id);
            const chTasks = chQuest ? tasks.filter(t => t.quest_id === chQuest.id) : [];
            const done = chTasks.filter(t => completionMap.get(t.id)?.progress_status === 'DONE').length;

            return {
                title: ch.title,
                start_date: ch.start_date,
                due_date: ch.due_date,
                completion_pct: chTasks.length > 0 ? Math.round((done / chTasks.length) * 100) : 0,
                tasks: chTasks.map(t => {
                    const c = completionMap.get(t.id);
                    const isDone = c?.progress_status === 'DONE';
                    const completedDate = c?.completed_at ? c.completed_at.toISOString?.().slice(0, 10) : null;
                    const onTime = isDone && t.due_date ? completedDate <= t.due_date : null;
                    if (isDone) { onTime ? doneOnTime++ : doneLate++; }
                    return {
                        title: t.title,
                        status: c?.progress_status || 'TODO',
                        start_date: t.start_date,
                        due_date: t.due_date,
                        completed_at: c?.completed_at || null,
                        on_time: onTime,
                    };
                }),
            };
        });

        const totalTasks = tasks.length;
        const completedTasks = completions.filter(c => c.progress_status === 'DONE').length;
        const overdueTasks = tasks.filter(t => {
            const c = completionMap.get(t.id);
            return (!c || c.progress_status !== 'DONE') && t.due_date && t.due_date < today;
        }).length;
        const onHoldTasks = completions.filter(c => c.progress_status === 'ON_HOLD').length;

        res.json({
            user: userResult.rows[0],
            plan: { title: plan.title, created_at: plan.created_at, status: plan.is_active ? 'active' : 'completed' },
            summary: {
                total_tasks: totalTasks,
                completed_tasks: completedTasks,
                completion_pct: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
                overdue_tasks: overdueTasks,
                on_time_completed: doneOnTime,
                late_completed: doneLate,
                on_hold_tasks: onHoldTasks,
            },
            objectives: objectivesReport,
        });
    } catch (err) { next(err); }
});

module.exports = router;

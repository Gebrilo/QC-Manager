'use strict';

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { canAccessUser } = require('../middleware/teamAccess');
const multer = require('multer');
const storage = require('../config/storage');

const idpUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = [
            'application/pdf',
            'image/png', 'image/jpeg', 'image/gif', 'image/webp',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/plain', 'text/csv',
            'application/zip',
        ];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`File type ${file.mimetype} not allowed`));
        }
    },
});

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

async function getActivePlansForUser(userId) {
    const result = await db.query(
        `SELECT * FROM journeys WHERE owner_user_id = $1 AND plan_type = 'idp' AND is_active = true AND deleted_at IS NULL ORDER BY created_at ASC`,
        [userId]
    );
    return result.rows;
}

async function assertTaskInPlan(planId, taskId) {
    const r = await db.query(
        `SELECT jt.id FROM journey_tasks jt
         JOIN journey_quests jq ON jt.quest_id = jq.id
         JOIN journey_chapters jc ON jq.chapter_id = jc.id
         WHERE jt.id = $1 AND jc.journey_id = $2`,
        [taskId, planId]
    );
    return r.rows.length > 0;
}

// ─── GET /my/plans — user views own IDP plan summaries ─────────────────────

router.get('/my/plans', requireAuth, async (req, res, next) => {
    try {
        const userId = req.user.id;
        const plans = await db.query(
            `SELECT j.id, j.title, j.description, j.is_active, j.created_at, j.updated_at
             FROM journeys j
             WHERE j.owner_user_id = $1 AND j.plan_type = 'idp' AND j.is_active = true AND j.deleted_at IS NULL
             ORDER BY j.created_at ASC`,
            [userId]
        );
        res.json(plans.rows);
    } catch (err) { next(err); }
});

// ─── GET /my — user views own IDP plan(s) ────────────────────────────────────

router.get('/my', requireAuth, async (req, res, next) => {
    try {
        const userId = req.user.id;
        const plans = await getActivePlansForUser(userId);
        if (plans.length === 0) return res.json([]);

        const results = [];
        for (const plan of plans) {
            const chapters = await db.query(
                `SELECT * FROM journey_chapters WHERE journey_id = $1 ORDER BY sort_order`, [plan.id]
            );
            const chapterIds = chapters.rows.map(c => c.id);
            let quests = [], tasks = [], completions = [], attachmentsByTask = {};

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
                        const attsResult = await db.query(
                            `SELECT id, task_id, original_name, mime_type, size_bytes, uploaded_by_role, uploaded_at, user_id
                             FROM journey_task_attachments WHERE task_id = ANY($1)
                             ORDER BY uploaded_at ASC`,
                            [taskIds]
                        );
                        for (const a of attsResult.rows) {
                            if (!attachmentsByTask[a.task_id]) attachmentsByTask[a.task_id] = [];
                            attachmentsByTask[a.task_id].push(a);
                        }
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
                            requires_attachment: t.requires_attachment || false,
                            progress_status: progressStatus,
                            is_overdue: notDone && !!t.due_date && t.due_date < today,
                            completed_at: c?.completed_at || null,
                            completed_late: computeCompletedLate(t, c),
                            hold_reason: c?.hold_reason ?? null,
                            attachments: attachmentsByTask[t.id] || [],
                        };
                    }),
                };
            });

            results.push({ ...plan, objectives, progress: buildProgress(tasks, completions) });
        }

        res.json(results);
    } catch (err) { next(err); }
});

// ─── GET /my/history — user views own archived IDP plans ─────────────────────

router.get('/my/history', requireAuth, async (req, res, next) => {
    try {
        const userId = req.user.id;

        const plansResult = await db.query(
            `SELECT id, title, description, created_at, updated_at AS archived_at
             FROM journeys
             WHERE owner_user_id = $1
               AND plan_type = 'idp'
               AND is_active = false
               AND deleted_at IS NULL
             ORDER BY updated_at DESC`,
            [userId]
        );

        if (plansResult.rows.length === 0) return res.json([]);

        const planIds = plansResult.rows.map(p => p.id);

        const summaryResult = await db.query(
            `SELECT jc.journey_id AS plan_id,
                    COUNT(jt.id) AS total_tasks,
                    SUM(CASE WHEN jt.is_mandatory THEN 1 ELSE 0 END) AS mandatory_tasks,
                    SUM(CASE WHEN utc.progress_status = 'DONE' THEN 1 ELSE 0 END) AS done_tasks,
                    SUM(CASE WHEN jt.is_mandatory AND utc.progress_status = 'DONE' THEN 1 ELSE 0 END) AS mandatory_done
             FROM journey_chapters jc
             JOIN journey_quests jq ON jq.chapter_id = jc.id
             JOIN journey_tasks jt ON jt.quest_id = jq.id
             LEFT JOIN user_task_completions utc ON utc.task_id = jt.id AND utc.user_id = $1
             WHERE jc.journey_id = ANY($2)
             GROUP BY jc.journey_id`,
            [userId, planIds]
        );

        const summaryMap = new Map(summaryResult.rows.map(r => [r.plan_id, r]));

        const body = plansResult.rows.map(p => {
            const s = summaryMap.get(p.id);
            const total = Number(s?.total_tasks) || 0;
            const done = Number(s?.done_tasks) || 0;
            return {
                id: p.id,
                title: p.title,
                description: p.description,
                created_at: p.created_at,
                archived_at: p.archived_at,
                progress: {
                    total_tasks: total,
                    done_tasks: done,
                    completion_pct: total > 0 ? Math.round((done / total) * 100) : 0,
                    mandatory_tasks: Number(s?.mandatory_tasks) || 0,
                    mandatory_done: Number(s?.mandatory_done) || 0,
                },
            };
        });

        res.json(body);
    } catch (err) { next(err); }
});

// ─── GET /my/plan/:planId — user views single active plan detail ────────────

router.get('/my/plan/:planId', requireAuth, async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { planId } = req.params;
        const planResult = await db.query(
            `SELECT * FROM journeys WHERE id = $1 AND owner_user_id = $2 AND plan_type = 'idp' AND is_active = true AND deleted_at IS NULL`,
            [planId, userId]
        );
        if (planResult.rows.length === 0) return res.status(404).json({ error: 'Plan not found' });
        const plan = planResult.rows[0];

        const chapters = await db.query(
            `SELECT * FROM journey_chapters WHERE journey_id = $1 ORDER BY sort_order`, [plan.id]
        );
        const chapterIds = chapters.rows.map(c => c.id);
        let quests = [], tasks = [], completions = [], linksByTask = {}, attachmentsByTask = {};
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
                    const linksResult = await db.query(
                        `SELECT id, task_id, url, label, created_at FROM idp_task_links WHERE task_id = ANY($1)`,
                        [taskIds]
                    );
                    for (const l of linksResult.rows) {
                        if (!linksByTask[l.task_id]) linksByTask[l.task_id] = [];
                        linksByTask[l.task_id].push(l);
                    }
                    const attsResult = await db.query(
                        `SELECT id, task_id, original_name, mime_type, size_bytes, uploaded_by_role, uploaded_at, user_id
                         FROM journey_task_attachments WHERE task_id = ANY($1)
                         ORDER BY uploaded_at ASC`,
                        [taskIds]
                    );
                    for (const a of attsResult.rows) {
                        if (!attachmentsByTask[a.task_id]) attachmentsByTask[a.task_id] = [];
                        attachmentsByTask[a.task_id].push(a);
                    }
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
                sort_order: ch.sort_order,
                progress: { total: chTasks.length, done, completion_pct: chTasks.length > 0 ? Math.round((done / chTasks.length) * 100) : 0, overdue },
                tasks: chTasks.map(t => {
                    const c = completionMap.get(t.id);
                    return {
                        id: t.id, title: t.title, description: t.description,
                        start_date: t.start_date, due_date: t.due_date,
                        priority: t.priority, difficulty: t.difficulty,
                        is_mandatory: t.is_mandatory, requires_attachment: t.requires_attachment || false,
                        progress_status: c?.progress_status || 'TODO',
                        is_overdue: (c?.progress_status || 'TODO') !== 'DONE' && !!t.due_date && t.due_date < today,
                        completed_at: c?.completed_at || null,
                        completed_late: computeCompletedLate(t, c),
                        hold_reason: c?.hold_reason ?? null,
                        links: linksByTask[t.id] || [],
                        attachments: attachmentsByTask[t.id] || [],
                    };
                }),
            };
        });
        res.json({ ...plan, plan_type: 'idp', objectives, progress: buildProgress(tasks, completions) });
    } catch (err) { next(err); }
});

// ─── GET /my/history/:planId — single archived plan detail ───────────────────

router.get('/my/history/:planId', requireAuth, async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { planId } = req.params;

        const planResult = await db.query(
            `SELECT * FROM journeys
             WHERE id = $1 AND owner_user_id = $2 AND plan_type = 'idp'
               AND is_active = false AND deleted_at IS NULL
             LIMIT 1`,
            [planId, userId]
        );
        if (planResult.rows.length === 0) return res.status(404).json({ error: 'Archived plan not found' });
        const plan = planResult.rows[0];

        const chapters = await db.query(
            `SELECT * FROM journey_chapters WHERE journey_id = $1 ORDER BY sort_order`, [plan.id]
        );
        const chapterIds = chapters.rows.map(c => c.id);
        let quests = [], tasks = [], completions = [], linksByTask = {}, attachmentsByTask = {};
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
                    const linksResult = await db.query(
                        `SELECT id, task_id, url, label, created_at FROM idp_task_links WHERE task_id = ANY($1)`,
                        [taskIds]
                    );
                    for (const l of linksResult.rows) {
                        if (!linksByTask[l.task_id]) linksByTask[l.task_id] = [];
                        linksByTask[l.task_id].push(l);
                    }
                    const attsResult = await db.query(
                        `SELECT id, task_id, original_name, mime_type, size_bytes, uploaded_by_role, uploaded_at, user_id
                         FROM journey_task_attachments WHERE task_id = ANY($1)
                         ORDER BY uploaded_at ASC`,
                        [taskIds]
                    );
                    for (const a of attsResult.rows) {
                        if (!attachmentsByTask[a.task_id]) attachmentsByTask[a.task_id] = [];
                        attachmentsByTask[a.task_id].push(a);
                    }
                }
            }
        }

        const completionMap = new Map(completions.map(c => [c.task_id, c]));

        const objectives = chapters.rows.map(ch => {
            const chQuest = quests.find(q => q.chapter_id === ch.id);
            const chTasks = chQuest ? tasks.filter(t => t.quest_id === chQuest.id) : [];
            const done = chTasks.filter(t => completionMap.get(t.id)?.progress_status === 'DONE').length;
            return {
                id: ch.id,
                title: ch.title,
                description: ch.description,
                start_date: ch.start_date,
                due_date: ch.due_date,
                sort_order: ch.sort_order,
                progress: {
                    total_tasks: chTasks.length,
                    done_tasks: done,
                    completion_pct: chTasks.length > 0 ? Math.round((done / chTasks.length) * 100) : 0,
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
                        requires_attachment: t.requires_attachment || false,
                        progress_status: c?.progress_status || 'TODO',
                        completed_at: c?.completed_at || null,
                        hold_reason: c?.hold_reason || null,
                        links: linksByTask[t.id] || [],
                        attachments: attachmentsByTask[t.id] || [],
                    };
                }),
            };
        });

        res.json({
            id: plan.id,
            title: plan.title,
            description: plan.description,
            is_active: false,
            archived_at: plan.updated_at,
            created_at: plan.created_at,
            progress: buildProgress(tasks, completions),
            objectives,
        });
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

        if (status === 'DONE') {
            const taskInfo = await db.query(
                `SELECT requires_attachment FROM journey_tasks WHERE id = $1`,
                [taskId]
            );
            if (taskInfo.rows.length > 0 && taskInfo.rows[0].requires_attachment) {
                const hasAttachment = await db.query(
                    `SELECT id FROM journey_task_attachments WHERE task_id = $1 AND user_id = $2 AND uploaded_by_role = 'resource'`,
                    [taskId, userId]
                );
                if (hasAttachment.rows.length === 0) {
                    return res.status(400).json({ error: 'This task requires an attachment before it can be marked as done' });
                }
            }
        }

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

// ─── GET /my/tasks/:taskId/comments — list own task comments ─────────────────

router.get('/my/tasks/:taskId/comments', requireAuth, async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { taskId } = req.params;
        const plan = await getPlanForUser(userId);
        if (!plan) return res.status(404).json({ error: 'No active IDP plan found' });
        if (!(await assertTaskInPlan(plan.id, taskId))) {
            return res.status(404).json({ error: 'Task not found in your plan' });
        }
        const result = await db.query(
            `SELECT c.id, c.user_id, c.task_id, c.author_id, c.body, c.created_at, c.updated_at,
                    u.name AS author_name, u.role AS author_role
             FROM idp_task_comment c
             LEFT JOIN app_user u ON u.id = c.author_id
             WHERE c.user_id = $1 AND c.task_id = $2
             ORDER BY c.created_at ASC`,
            [userId, taskId]
        );
        res.json(result.rows);
    } catch (err) { next(err); }
});

// ─── POST /my/tasks/:taskId/comments — add own comment ───────────────────────

router.post('/my/tasks/:taskId/comments', requireAuth, async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { taskId } = req.params;
        const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
        if (body.length === 0) return res.status(400).json({ error: 'body is required' });

        const plan = await getPlanForUser(userId);
        if (!plan) return res.status(404).json({ error: 'No active IDP plan found' });
        if (!(await assertTaskInPlan(plan.id, taskId))) {
            return res.status(404).json({ error: 'Task not found in your plan' });
        }
        const inserted = await db.query(
            `INSERT INTO idp_task_comment (user_id, task_id, author_id, body)
             VALUES ($1, $2, $3, $4)
             RETURNING id`,
            [userId, taskId, userId, body]
        );
        const full = await db.query(
            `SELECT c.id, c.user_id, c.task_id, c.author_id, c.body, c.created_at, c.updated_at,
                    u.name AS author_name, u.role AS author_role
             FROM idp_task_comment c
             LEFT JOIN app_user u ON u.id = c.author_id
             WHERE c.id = $1`,
            [inserted.rows[0].id]
        );
        res.status(201).json(full.rows[0]);
    } catch (err) { next(err); }
});

// ─── POST /my/tasks/:taskId/links — resource cannot add links ────────────────

router.post('/my/tasks/:taskId/links', requireAuth, (req, res) => {
    res.status(403).json({ error: 'Only managers can add learning links' });
});

// ─── GET /my/tasks/:taskId/links — resource views links ──────────────────────

router.get('/my/tasks/:taskId/links', requireAuth, async (req, res, next) => {
    try {
        const result = await db.query(
            `SELECT l.id, l.url, l.label, l.created_at, u.name AS created_by_name
             FROM idp_task_links l
             JOIN app_user u ON u.id = l.created_by
             WHERE l.task_id = $1
             ORDER BY l.created_at ASC`,
            [req.params.taskId]
        );
        res.json(result.rows);
    } catch (err) { next(err); }
});

// ─── POST /my/tasks/:taskId/attachments — resource uploads submission ─────────

router.post('/my/tasks/:taskId/attachments', requireAuth, idpUpload.single('file'), async (req, res, next) => {
    try {
        const { taskId } = req.params;
        const userId = req.user.id;
        if (!req.file) return res.status(400).json({ error: 'No file provided' });

        const task = await db.query(
            `SELECT jt.id FROM journey_tasks jt
             JOIN journey_quests jq ON jq.id = jt.quest_id
             JOIN journey_chapters jc ON jc.id = jq.chapter_id
             JOIN journeys j ON j.id = jc.journey_id
             WHERE jt.id = $1 AND j.owner_user_id = $2 AND j.plan_type = 'idp' AND j.is_active = true`,
            [taskId, userId]
        );
        if (task.rows.length === 0) return res.status(404).json({ error: 'Task not found' });

        const storagePath = `idp/${userId}/${taskId}/${userId}-${Date.now()}-${req.file.originalname}`;
        await storage.uploadFile(storagePath, req.file.buffer, req.file.mimetype);

        const result = await db.query(
            `INSERT INTO journey_task_attachments (task_id, user_id, filename, original_name, mime_type, size_bytes, uploaded_by_role, storage_path, bucket_name)
             VALUES ($1, $2, $3, $4, $5, $6, 'resource', $7, $8)
             RETURNING id, original_name, mime_type, size_bytes, uploaded_by_role, uploaded_at`,
            [taskId, userId, storagePath, req.file.originalname, req.file.mimetype, req.file.size, storagePath, storage.IDP_ATTACHMENTS_BUCKET]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.message && err.message.includes('not allowed')) {
            return res.status(400).json({ error: err.message });
        }
        next(err);
    }
});

// ─── GET /attachments/:attachmentId — download (signed URL) ───────────────────

router.get('/attachments/:attachmentId', requireAuth, async (req, res, next) => {
    try {
        const { attachmentId } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role;

        const att = await db.query(
            `SELECT a.*, j.owner_user_id
             FROM journey_task_attachments a
             JOIN journey_tasks jt ON jt.id = a.task_id
             JOIN journey_quests jq ON jq.id = jt.quest_id
             JOIN journey_chapters jc ON jc.id = jq.chapter_id
             JOIN journeys j ON j.id = jc.journey_id
             WHERE a.id = $1`,
            [attachmentId]
        );
        if (att.rows.length === 0) return res.status(404).json({ error: 'Attachment not found' });

        const file = att.rows[0];
        if (userRole !== 'admin' && userRole !== 'manager') {
            if (file.owner_user_id !== userId) {
                return res.status(403).json({ error: 'Access denied' });
            }
        }

        const signedUrl = await storage.createSignedUrl(file.storage_path, 300);
        res.json({ url: signedUrl, original_name: file.original_name, mime_type: file.mime_type, size_bytes: file.size_bytes });
    } catch (err) { next(err); }
});

// ─── DELETE /attachments/:attachmentId — delete attachment ─────────────────────

router.delete('/attachments/:attachmentId', requireAuth, async (req, res, next) => {
    try {
        const { attachmentId } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role;

        const att = await db.query(
            `SELECT a.*, j.owner_user_id
             FROM journey_task_attachments a
             JOIN journey_tasks jt ON jt.id = a.task_id
             JOIN journey_quests jq ON jq.id = jt.quest_id
             JOIN journey_chapters jc ON jc.id = jq.chapter_id
             JOIN journeys j ON j.id = jc.journey_id
             WHERE a.id = $1`,
            [attachmentId]
        );
        if (att.rows.length === 0) return res.status(404).json({ error: 'Attachment not found' });

        const file = att.rows[0];

        if (userRole === 'admin' || userRole === 'manager') {
            // Manager can delete any file
        } else {
            if (file.uploaded_by_role !== 'resource' || file.user_id !== userId) {
                return res.status(403).json({ error: 'You can only delete your own uploads' });
            }
        }

        if (file.storage_path) {
            try { await storage.deleteFile(file.storage_path); } catch (e) { /* ignore storage errors */ }
        }
        await db.query(`DELETE FROM journey_task_attachments WHERE id = $1`, [attachmentId]);
        res.json({ deleted: true });
    } catch (err) { next(err); }
});

// ─── POST /:userId/tasks/:taskId/links — manager adds a link ─────────────────

router.post('/:userId/tasks/:taskId/links', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { userId, taskId } = req.params;
        const { url, label } = req.body;

        if (!url || !label || !/^https?:\/\/.+/.test(url)) {
            return res.status(400).json({ error: 'Valid url and label are required' });
        }
        if (label.length > 500) {
            return res.status(400).json({ error: 'Label must be 500 characters or less' });
        }

        const allowed = await canAccessUser(req.user, userId);
        if (!allowed) return res.status(403).json({ error: 'User is not in your team' });

        const task = await db.query(
            `SELECT jt.id FROM journey_tasks jt
             JOIN journey_quests jq ON jq.id = jt.quest_id
             JOIN journey_chapters jc ON jc.id = jq.chapter_id
             JOIN journeys j ON j.id = jc.journey_id
             WHERE jt.id = $1 AND j.owner_user_id = $2 AND j.plan_type = 'idp'`,
            [taskId, userId]
        );
        if (task.rows.length === 0) return res.status(404).json({ error: 'Task not found' });

        const result = await db.query(
            `INSERT INTO idp_task_links (task_id, url, label, created_by)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [taskId, url, label, req.user.id]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) { next(err); }
});

// ─── GET /:userId/tasks/:taskId/links — manager views links ──────────────────

router.get('/:userId/tasks/:taskId/links', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { userId, taskId } = req.params;
        const allowed = await canAccessUser(req.user, userId);
        if (!allowed) return res.status(403).json({ error: 'User is not in your team' });

        const result = await db.query(
            `SELECT l.id, l.url, l.label, l.created_at, u.name AS created_by_name
             FROM idp_task_links l
             JOIN app_user u ON u.id = l.created_by
             WHERE l.task_id = $1
             ORDER BY l.created_at ASC`,
            [taskId]
        );
        res.json(result.rows);
    } catch (err) { next(err); }
});

// ─── DELETE /:userId/tasks/:taskId/links/:linkId — manager deletes a link ────

router.delete('/:userId/tasks/:taskId/links/:linkId', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { userId, taskId, linkId } = req.params;
        const allowed = await canAccessUser(req.user, userId);
        if (!allowed) return res.status(403).json({ error: 'User is not in your team' });

        const result = await db.query(
            `DELETE FROM idp_task_links WHERE id = $1 AND task_id = $2 RETURNING *`,
            [linkId, taskId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Link not found' });
        res.json({ deleted: true });
    } catch (err) { next(err); }
});

// ─── POST /:userId/tasks/:taskId/attachments — manager uploads material ──────

router.post('/:userId/tasks/:taskId/attachments', requireAuth, requireRole('admin', 'manager'), idpUpload.single('file'), async (req, res, next) => {
    try {
        const { userId, taskId } = req.params;
        if (!req.file) return res.status(400).json({ error: 'No file provided' });

        const allowed = await canAccessUser(req.user, userId);
        if (!allowed) return res.status(403).json({ error: 'User is not in your team' });

        const task = await db.query(
            `SELECT jt.id FROM journey_tasks jt
             JOIN journey_quests jq ON jq.id = jt.quest_id
             JOIN journey_chapters jc ON jc.id = jq.chapter_id
             JOIN journeys j ON j.id = jc.journey_id
             WHERE jt.id = $1 AND j.owner_user_id = $2 AND j.plan_type = 'idp'`,
            [taskId, userId]
        );
        if (task.rows.length === 0) return res.status(404).json({ error: 'Task not found' });

        const storagePath = `idp/${userId}/${taskId}/${req.user.id}-${Date.now()}-${req.file.originalname}`;
        await storage.uploadFile(storagePath, req.file.buffer, req.file.mimetype);

        const result = await db.query(
            `INSERT INTO journey_task_attachments (task_id, user_id, filename, original_name, mime_type, size_bytes, uploaded_by_role, storage_path, bucket_name)
             VALUES ($1, $2, $3, $4, $5, $6, 'manager', $7, $8)
             RETURNING id, original_name, mime_type, size_bytes, uploaded_by_role, uploaded_at`,
            [taskId, req.user.id, storagePath, req.file.originalname, req.file.mimetype, req.file.size, storagePath, storage.IDP_ATTACHMENTS_BUCKET]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.message && err.message.includes('not allowed')) {
            return res.status(400).json({ error: err.message });
        }
        next(err);
    }
});

// ─── GET /:userId/tasks/:taskId/comments — manager reads ─────────────────────

router.get('/:userId/tasks/:taskId/comments', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { userId, taskId } = req.params;
        const allowed = await canAccessUser(req.user, userId);
        if (!allowed) return res.status(403).json({ error: 'User is not in your team' });

        const plan = await getPlanForUser(userId);
        if (!plan) return res.status(404).json({ error: 'No active IDP plan found' });
        if (!(await assertTaskInPlan(plan.id, taskId))) {
            return res.status(404).json({ error: 'Task not found in this plan' });
        }
        const result = await db.query(
            `SELECT c.id, c.user_id, c.task_id, c.author_id, c.body, c.created_at, c.updated_at,
                    u.name AS author_name, u.role AS author_role
             FROM idp_task_comment c
             LEFT JOIN app_user u ON u.id = c.author_id
             WHERE c.user_id = $1 AND c.task_id = $2
             ORDER BY c.created_at ASC`,
            [userId, taskId]
        );
        res.json(result.rows);
    } catch (err) { next(err); }
});

// ─── POST /:userId/tasks/:taskId/comments — manager comments ─────────────────

router.post('/:userId/tasks/:taskId/comments', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { userId, taskId } = req.params;
        const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
        if (body.length === 0) return res.status(400).json({ error: 'body is required' });

        const allowed = await canAccessUser(req.user, userId);
        if (!allowed) return res.status(403).json({ error: 'User is not in your team' });

        const plan = await getPlanForUser(userId);
        if (!plan) return res.status(404).json({ error: 'No active IDP plan found' });
        if (!(await assertTaskInPlan(plan.id, taskId))) {
            return res.status(404).json({ error: 'Task not found in this plan' });
        }
        const inserted = await db.query(
            `INSERT INTO idp_task_comment (user_id, task_id, author_id, body)
             VALUES ($1, $2, $3, $4)
             RETURNING id`,
            [userId, taskId, req.user.id, body]
        );
        const full = await db.query(
            `SELECT c.id, c.user_id, c.task_id, c.author_id, c.body, c.created_at, c.updated_at,
                    u.name AS author_name, u.role AS author_role
             FROM idp_task_comment c
             LEFT JOIN app_user u ON u.id = c.author_id
             WHERE c.id = $1`,
            [inserted.rows[0].id]
        );
        res.status(201).json(full.rows[0]);
    } catch (err) { next(err); }
});

// ─── PATCH /:userId/plan/:planId — edit plan-level fields ──────────────────

router.patch('/:userId/plan/:planId', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { userId, planId } = req.params;
        const { title, description } = req.body;

        const allowed = await canAccessUser(req.user, userId);
        if (!allowed) return res.status(403).json({ error: 'User is not in your team' });

        const updates = [];
        const values = [];
        let paramIdx = 1;

        if (title !== undefined) { updates.push(`title = $${paramIdx++}`); values.push(title); }
        if (description !== undefined) { updates.push(`description = $${paramIdx++}`); values.push(description); }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        updates.push(`updated_at = NOW()`);
        values.push(planId, userId);
        const result = await db.query(
            `UPDATE journeys SET ${updates.join(', ')}
             WHERE id = $${paramIdx++} AND owner_user_id = $${paramIdx++} AND plan_type = 'idp'
             RETURNING id, title, description, updated_at`,
            values
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Plan not found' });
        }

        res.json(result.rows[0]);
    } catch (err) { next(err); }
});

router.delete('/:userId/plan/:planId', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { userId, planId } = req.params;

        const allowed = await canAccessUser(req.user, userId);
        if (!allowed) return res.status(403).json({ error: 'User is not in your team' });

        const plan = await db.query(
            `SELECT id FROM journeys WHERE id = $1 AND owner_user_id = $2 AND plan_type = 'idp'`,
            [planId, userId]
        );
        if (plan.rows.length === 0) return res.status(404).json({ error: 'Plan not found' });

        await db.query(`DELETE FROM journeys WHERE id = $1`, [planId]);

        res.json({ deleted: true });
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
        let attachmentsByTask = {};

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
                    const attsResult = await db.query(
                        `SELECT id, task_id, original_name, mime_type, size_bytes, uploaded_by_role, uploaded_at, user_id
                         FROM journey_task_attachments WHERE task_id = ANY($1)
                         ORDER BY uploaded_at ASC`,
                        [taskIds]
                    );
                    for (const a of attsResult.rows) {
                        if (!attachmentsByTask[a.task_id]) attachmentsByTask[a.task_id] = [];
                        attachmentsByTask[a.task_id].push(a);
                    }
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
                        requires_attachment: t.requires_attachment || false,
                        progress_status: c?.progress_status || 'TODO',
                        completed_at: c?.completed_at || null,
                        completed_late: computeCompletedLate(t, c),
                        hold_reason: c?.hold_reason ?? null,
                        attachments: attachmentsByTask[t.id] || [],
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
        const { title, description, start_date, due_date, priority, difficulty, is_mandatory = true, requires_attachment = false, sort_order = 0 } = req.body;
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
            `INSERT INTO journey_tasks (quest_id, slug, title, description, start_date, due_date, priority, difficulty, is_mandatory, requires_attachment, sort_order, validation_type, validation_config)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'none', '{}') RETURNING *`,
            [questId, slug, title, description || null, start_date || null, due_date || null, priority || null, difficulty || null, is_mandatory, requires_attachment, sort_order]
        );
        res.status(201).json(taskResult.rows[0]);
    } catch (err) { next(err); }
});

// ─── PATCH /:userId/tasks/:taskId — update task ───────────────────────────────

router.patch('/:userId/tasks/:taskId', requireAuth, requireRole('admin', 'manager'), async (req, res, next) => {
    try {
        const { userId, taskId } = req.params;
        const { title, description, start_date, due_date, priority, difficulty, is_mandatory, requires_attachment, sort_order } = req.body;

        const allowed = await canAccessUser(req.user, userId);
        if (!allowed) return res.status(403).json({ error: 'User is not in your team' });

        const plan = await getPlanForUser(userId);
        if (!plan) return res.status(404).json({ error: 'No active IDP plan found' });

        const completion = await db.query(
            `SELECT progress_status FROM user_task_completions WHERE user_id = $1 AND task_id = $2`,
            [userId, taskId]
        );
        if (completion.rows.length > 0 && completion.rows[0].progress_status === 'DONE') {
            return res.status(409).json({ error: 'Cannot edit a completed task. Reopen it first.' });
        }

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
        if (requires_attachment !== undefined) { fields.push(`requires_attachment = $${idx++}`); values.push(requires_attachment); }
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

        const completion = await db.query(
            `SELECT progress_status FROM user_task_completions WHERE user_id = $1 AND task_id = $2`,
            [userId, taskId]
        );
        if (completion.rows.length > 0 && completion.rows[0].progress_status === 'DONE') {
            return res.status(409).json({ error: 'Cannot edit a completed task. Reopen it first.' });
        }

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
        let quests = [], tasks = [], completions = [], linksByTask = {}, attachmentsByTask = {};

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
                    const linksResult = await db.query(
                        `SELECT id, task_id, url, label, created_at FROM idp_task_links WHERE task_id = ANY($1)`,
                        [taskIds]
                    );
                    for (const l of linksResult.rows) {
                        if (!linksByTask[l.task_id]) linksByTask[l.task_id] = [];
                        linksByTask[l.task_id].push(l);
                    }
                    const attsResult = await db.query(
                        `SELECT id, task_id, original_name, mime_type, size_bytes, uploaded_by_role, uploaded_at, user_id
                         FROM journey_task_attachments WHERE task_id = ANY($1)
                         ORDER BY uploaded_at ASC`,
                        [taskIds]
                    );
                    for (const a of attsResult.rows) {
                        if (!attachmentsByTask[a.task_id]) attachmentsByTask[a.task_id] = [];
                        attachmentsByTask[a.task_id].push(a);
                    }
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
                        links: linksByTask[t.id] || [],
                        attachments: attachmentsByTask[t.id] || [],
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

'use strict';

const express = require('express');
const router = express.Router();
const { z } = require('zod');
const db = require('../config/db');
const { auditLog } = require('../middleware/audit');
const { validateAgentSecret } = require('./landingContentWebhooks');
const {
    handleAiStoryIntake,
    aiIntakeRateLimit,
} = require('./aiIntake');
const {
    TASK_REQUEST_TYPE,
    MAX_TASKS,
    AI_SOURCE,
    loadAiStoryContext,
    insertAiContentLog,
    updateAiContentLog,
    createAiTasksForStory,
    touchStoryForAiActivity,
    loadLatestTaskGenerationLog,
} = require('../services/aiIntake');

const aiTaskSchema = z.object({
    task_name: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    notes: z.string().optional(),
    priority: z.enum(['High', 'Medium', 'Low']).optional(),
    estimate_days: z.number().nullable().optional(),
    deadline: z.string().optional().nullable(),
    expected_start_date: z.string().optional().nullable(),
    actual_start_date: z.string().optional().nullable(),
    tags: z.array(z.string()).optional(),
}).passthrough();

const aiTaskCallbackSchema = z.object({
    tasks: z.array(aiTaskSchema).optional(),
    generated_tasks: z.array(aiTaskSchema).optional(),
    job_id: z.string().uuid().optional(),
    status: z.enum(['processed', 'failed']).optional(),
    error: z.string().optional(),
    error_message: z.string().optional(),
    force_import: z.boolean().optional().default(false),
}).passthrough();

function actorLabel(origin) {
    return `agent:${origin}`;
}

function isAiIntakeStory(story) {
    return Boolean(story && (story.generated_by_ai || story.source === AI_SOURCE));
}

async function ensureTaskGenerationLog({ story, body, origin }) {
    if (body.job_id) {
        const existing = await loadLatestTaskGenerationLog(story.id);
        if (existing && existing.id === body.job_id) {
            return { log: existing, created: false };
        }
        const byId = await db.query(
            `SELECT *
               FROM ai_content_generation_logs
              WHERE id = $1 AND user_story_id = $2 AND request_type = $3
              LIMIT 1`,
            [body.job_id, story.id, TASK_REQUEST_TYPE]
        );
        if (byId.rows[0]) {
            return { log: byId.rows[0], created: false };
        }
    }

    const log = await insertAiContentLog({
        requestType: TASK_REQUEST_TYPE,
        projectId: story.project_id,
        userStoryId: story.id,
        contentHash: null,
        rawPayload: body,
        generatedContent: { story_id: story.id, status: 'received', source: origin },
        status: 'received',
        forceImport: body.force_import || false,
        source: origin,
    });
    return { log, created: true };
}

router.post('/user-story', aiIntakeRateLimit, async (req, res, next) => {
    const secret = validateAgentSecret(req);
    if (!secret.ok) {
        return res.status(secret.status).json({ success: false, error: secret.error });
    }
    return handleAiStoryIntake(req, res, next, 'webhook');
});

router.post('/user-story/:id/tasks', aiIntakeRateLimit, async (req, res, next) => {
    const secret = validateAgentSecret(req);
    if (!secret.ok) {
        return res.status(secret.status).json({ success: false, error: secret.error });
    }

    try {
        const story = await loadAiStoryContext(req.params.id);
        if (!story) {
            return res.status(404).json({ success: false, error: 'User story not found' });
        }
        if (!isAiIntakeStory(story)) {
            return res.status(400).json({ success: false, error: 'This story was not created through AI intake' });
        }

        const parsed = aiTaskCallbackSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: parsed.error.issues.map(issue => ({
                    path: issue.path,
                    message: issue.message,
                })),
            });
        }

        const data = parsed.data;
        const tasks = data.tasks || data.generated_tasks || [];
        const { log: taskLog, created: createdTaskLog } = await ensureTaskGenerationLog({
            story,
            body: req.body,
            origin: 'n8n',
        });
        const actor = actorLabel('n8n');
        if (createdTaskLog) {
            await auditLog('ai_content_generation_logs', taskLog.id, 'CREATE', taskLog, null, actor);
        }

        const callbackError = data.error_message || data.error;
        if (data.status === 'failed' || callbackError) {
            await updateAiContentLog(taskLog.id, {
                status: 'failed',
                error_message: String(callbackError || 'Task generation failed').slice(0, 1024),
                generated_content: {
                    story_id: story.id,
                    status: 'failed',
                    source: 'n8n',
                },
            });
            return res.json({
                success: true,
                story: {
                    ...story,
                    generated_by_ai: true,
                    source: story.source || 'ai_intake',
                },
                task_generation: {
                    status: 'failed',
                    job_id: taskLog.id,
                    error: String(callbackError || 'Task generation failed').slice(0, 1024),
                },
            });
        }

        if (!Array.isArray(tasks) || tasks.length === 0) {
            await updateAiContentLog(taskLog.id, {
                status: 'failed',
                error_message: 'At least one task is required',
            });
            return res.status(400).json({
                success: false,
                error: 'At least one task is required',
            });
        }

        const receivedTaskCount = tasks.length;
        const cappedTasks = tasks.slice(0, MAX_TASKS);
        const capApplied = receivedTaskCount > MAX_TASKS;

        const projectRow = {
            id: story.project_id,
            team_id: story.team_id,
            project_name: story.project_name,
        };

        const { tasks: createdTasks, skipped_titles: skippedTitles } = await createAiTasksForStory({
            projectRow,
            storyId: story.id,
            tasks: cappedTasks,
            actorUserId: null,
        });
        for (const task of createdTasks) {
            await auditLog('tasks', task.id, 'CREATE', task, null, actor);
        }

        await updateAiContentLog(taskLog.id, {
            status: 'processed',
            generated_content: {
                story_id: story.id,
                created_task_ids: createdTasks.map(task => task.id),
                created_task_count: createdTasks.length,
                skipped_titles: skippedTitles,
                received_task_count: receivedTaskCount,
                max_tasks: MAX_TASKS,
                cap_applied: capApplied,
                force_import: data.force_import || false,
            },
        });

        const updatedStory = await touchStoryForAiActivity(story.id);
        if (updatedStory) {
            await auditLog('user_stories', story.id, 'UPDATE', updatedStory, story, actor);
        }

        res.status(201).json({
            success: true,
            story: {
                ...(updatedStory || story),
                generated_by_ai: true,
                source: (updatedStory || story).source || 'ai_intake',
            },
            tasks: createdTasks,
            task_generation: {
                status: 'processed',
                job_id: taskLog.id,
                created_task_count: createdTasks.length,
                skipped_titles: skippedTitles,
                received_task_count: receivedTaskCount,
                cap_applied: capApplied,
                max_tasks: MAX_TASKS,
            },
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;

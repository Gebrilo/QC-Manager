'use strict';

const express = require('express');
const { z } = require('zod');
const router = express.Router();
const { auditLog } = require('../middleware/audit');
const {
    requireAuth,
    requirePermission,
    userHasAnyPermission,
} = require('../middleware/authMiddleware');
const { validateAgentSecret } = require('./landingContentWebhooks');
const {
    AI_SOURCE,
    STORY_REQUEST_TYPE,
    TASK_REQUEST_TYPE,
    MAX_TASKS,
    sanitizeMarkdown,
    hashContent,
    parseAiStoryMarkdown,
    requireAiIntakeProject,
    findDuplicateStoryIntake,
    insertAiContentLog,
    updateAiContentLog,
    createStandaloneAiStory,
    createAiTasksForStory,
    touchStoryForAiActivity,
    loadAiStoryContext,
    loadGeneratedTasks,
    loadLatestTaskGenerationLog,
} = require('../services/aiIntake');
const { triggerWorkflow } = require('../utils/n8n');

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

const aiStoryIntakeSchema = z.object({
    project_id: z.string().uuid(),
    content_markdown: z.string().optional(),
    markdown: z.string().optional(),
    tasks: z.array(aiTaskSchema).optional(),
    force_import: z.boolean().optional().default(false),
    create_tasks: z.boolean().optional().default(false),
    generate_tasks: z.boolean().optional().default(false),
}).passthrough();

const aiTaskGenerationSchema = z.object({
    tasks: z.array(aiTaskSchema).optional(),
    generated_tasks: z.array(aiTaskSchema).optional(),
    job_id: z.string().uuid().optional(),
    force_import: z.boolean().optional().default(false),
}).passthrough();

const RATE_LIMIT_WINDOW_MS = parseInt(process.env.AI_INTAKE_RATE_LIMIT_WINDOW_MS || '', 10) || 60000;
const RATE_LIMIT_MAX = parseInt(process.env.AI_INTAKE_RATE_LIMIT_MAX || '', 10) || 30;
const rateLimitBuckets = new Map();

function aiIntakeRateLimit(req, res, next) {
    if (RATE_LIMIT_MAX <= 0) return next();

    const now = Date.now();
    const key = [
        req.user?.id || req.ip || req.get('x-forwarded-for') || 'anonymous',
        req.path,
    ].join(':');
    const bucket = rateLimitBuckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
        rateLimitBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return next();
    }

    if (bucket.count >= RATE_LIMIT_MAX) {
        return res.status(429).json({
            success: false,
            error: 'AI intake rate limit exceeded. Try again later.',
        });
    }

    bucket.count += 1;
    return next();
}

function requestOrigin(req) {
    const protocol = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
    const host = (req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
    return host ? `${protocol}://${host}` : '';
}

function actorLabel(req, origin) {
    return req.user?.email || `agent:${origin}`;
}

function responseStory(story) {
    return {
        ...story,
        generated_by_ai: Boolean(story.generated_by_ai || story.source === AI_SOURCE),
        source: story.source || AI_SOURCE,
        url: `/work/stories/${story.id}`,
    };
}

function isAiIntakeStory(story) {
    return Boolean(story && (story.generated_by_ai || story.source === AI_SOURCE));
}

function duplicateStoryId(duplicate) {
    if (!duplicate) return null;
    if (duplicate.user_story_id) return duplicate.user_story_id;
    if (duplicate.generated_content && typeof duplicate.generated_content === 'object') {
        return duplicate.generated_content.story_id || null;
    }
    return null;
}

async function auditAiIntakeValidationFailure(req, origin, message, details = undefined) {
    await auditLog('ai_intake', 'validation', 'VALIDATION_FAILED', {
        origin,
        message,
        details,
        project_id: req.body?.project_id || null,
    }, null, actorLabel(req, origin));
}

function requireAiIntakeApiCaller(req, res, next) {
    const secret = validateAgentSecret(req);
    if (secret.ok) {
        req.aiIntakeAgent = true;
        req.user = req.user || {
            id: null,
            email: 'agent:api',
            name: 'AI Intake Agent',
            role: 'agent',
            active: true,
            status: 'ACTIVE',
        };
        return next();
    }

    return requireAuth(req, res, () => {
        requirePermission('qc.user_stories.create')(req, res, next);
    });
}

async function handleAiStoryIntake(req, res, next, origin) {
    try {
        const parsed = aiStoryIntakeSchema.safeParse(req.body);
        if (!parsed.success) {
            await auditAiIntakeValidationFailure(req, origin, 'Validation failed', parsed.error.issues.map(issue => ({
                path: issue.path,
                message: issue.message,
            })));
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
        const markdown = sanitizeMarkdown(data.content_markdown || data.markdown || '');
        const contentHash = hashContent(markdown);
        const project = await requireAiIntakeProject(data.project_id);
        const actor = actorLabel(req, origin);
        const parsedStory = parseAiStoryMarkdown(markdown);
        const wantsTaskGeneration = data.create_tasks || data.generate_tasks;
        const providedTasks = Array.isArray(data.tasks) ? data.tasks : [];
        const markdownTasks = wantsTaskGeneration && providedTasks.length === 0
            ? (parsedStory.suggested_tasks || [])
            : [];
        const directTasks = providedTasks.length > 0 ? providedTasks : markdownTasks;
        const needsTaskPermission = directTasks.length > 0 || wantsTaskGeneration;

        if (needsTaskPermission) {
            const canCreateTasks = req.aiIntakeAgent || await userHasAnyPermission(req.user, ['qc.tasks.create'], req);
            if (!canCreateTasks) {
                return res.status(403).json({ success: false, error: 'You do not have permission to generate tasks' });
            }
        }

        if (directTasks.length > MAX_TASKS) {
            await auditAiIntakeValidationFailure(req, origin, `AI intake cannot create more than ${MAX_TASKS} tasks at once`);
            return res.status(400).json({
                success: false,
                error: `AI intake cannot create more than ${MAX_TASKS} tasks at once`,
            });
        }

        const duplicate = await findDuplicateStoryIntake({
            projectId: project.id,
            contentHash,
        });
        if (duplicate && !data.force_import) {
            const existingUserStoryId = duplicateStoryId(duplicate);
            await auditAiIntakeValidationFailure(req, origin, 'Duplicate AI intake content detected', { existing_user_story_id: existingUserStoryId });
            return res.status(409).json({
                success: false,
                error: existingUserStoryId
                    ? `Duplicate AI intake content detected for user story ${existingUserStoryId}. Use force_import to override.`
                    : 'Duplicate AI intake content detected. Use force_import to override.',
                existing_user_story_id: existingUserStoryId,
            });
        }

        const storyLog = await insertAiContentLog({
            requestType: STORY_REQUEST_TYPE,
            projectId: project.id,
            contentHash,
            rawPayload: req.body,
            generatedContent: { parsed_story: parsedStory },
            status: 'received',
            forceImport: data.force_import,
            source: origin,
        });
        await auditLog('ai_content_generation_logs', storyLog.id, 'CREATE', storyLog, null, actor);

        let story;
        try {
            story = await createStandaloneAiStory({
                projectRow: project,
                parsedStory,
                rawPayload: req.body,
                actorUserId: req.user?.id || null,
            });
        } catch (err) {
            await updateAiContentLog(storyLog.id, {
                status: 'failed',
                error_message: String(err.message).slice(0, 1024),
            });
            throw err;
        }
        await auditLog('user_stories', story.id, 'CREATE', story, null, actor);

        await updateAiContentLog(storyLog.id, {
            status: 'processed',
            user_story_id: story.id,
            generated_content: {
                story_id: story.id,
                title: story.title,
                source: AI_SOURCE,
                generated_by_ai: true,
                warnings: parsedStory.warnings || [],
            },
        });

        const response = {
            success: true,
            story: responseStory(story),
        };

        if (directTasks.length > 0) {
            const taskLog = await insertAiContentLog({
                requestType: TASK_REQUEST_TYPE,
                projectId: project.id,
                userStoryId: story.id,
                contentHash,
                rawPayload: { tasks: directTasks },
                generatedContent: { story_id: story.id, task_count: directTasks.length },
                status: 'received',
                forceImport: data.force_import,
                source: origin,
            });
            await auditLog('ai_content_generation_logs', taskLog.id, 'CREATE', taskLog, null, actor);

            try {
                const { tasks, skipped_titles: skippedTitles } = await createAiTasksForStory({
                    projectRow: project,
                    storyId: story.id,
                    tasks: directTasks,
                    actorUserId: req.user?.id || null,
                });
                for (const task of tasks) {
                    await auditLog('tasks', task.id, 'CREATE', task, null, actor);
                }

                await updateAiContentLog(taskLog.id, {
                    status: 'processed',
                    generated_content: {
                        story_id: story.id,
                        created_task_ids: tasks.map(task => task.id),
                        created_task_count: tasks.length,
                        skipped_titles: skippedTitles,
                    },
                });

                const updatedStory = await touchStoryForAiActivity(story.id);
                if (updatedStory) {
                    await auditLog('user_stories', story.id, 'UPDATE', updatedStory, story, actor);
                }

                response.tasks = tasks;
                response.task_generation = {
                    status: 'processed',
                    created_task_count: tasks.length,
                    skipped_titles: skippedTitles,
                };
                return res.status(201).json(response);
            } catch (err) {
                await updateAiContentLog(taskLog.id, {
                    status: 'failed',
                    error_message: String(err.message).slice(0, 1024),
                });
                throw err;
            }
        }

        if (wantsTaskGeneration) {
            const taskLog = await insertAiContentLog({
                requestType: TASK_REQUEST_TYPE,
                projectId: project.id,
                userStoryId: story.id,
                contentHash,
                rawPayload: req.body,
                generatedContent: { story_id: story.id, status: 'pending' },
                status: 'pending',
                forceImport: data.force_import,
                source: origin,
            });
            await auditLog('ai_content_generation_logs', taskLog.id, 'CREATE', taskLog, null, actor);

            const callbackBase = requestOrigin(req);
            const callbackUrl = callbackBase ? `${callbackBase}/api/webhooks/ai-intake/user-story/${story.id}/tasks` : '';

            if (!callbackUrl) {
                await updateAiContentLog(taskLog.id, {
                    status: 'failed',
                    error_message: 'Unable to determine task-generation callback URL',
                });
                return res.status(500).json({
                    success: false,
                    error: 'Unable to determine task-generation callback URL',
                });
            }

            await triggerWorkflow('ai-intake-task-generation', {
                source: origin,
                project_id: project.id,
                user_story_id: story.id,
                content_markdown: markdown,
                content_hash: contentHash,
                callback_url: callbackUrl,
                max_tasks: MAX_TASKS,
                force_import: data.force_import,
                job_id: taskLog.id,
            });

            response.task_generation = {
                status: 'pending',
                job_id: taskLog.id,
                max_tasks: MAX_TASKS,
            };
            return res.status(202).json(response);
        }

        return res.status(201).json(response);
    } catch (err) {
        if (err.status && err.status < 500) {
            await auditAiIntakeValidationFailure(req, origin, err.message);
        }
        next(err);
    }
}

async function handleGetGeneratedTasks(req, res, next) {
    try {
        const story = await loadAiStoryContext(req.params.id);
        if (!story) {
            return res.status(404).json({ success: false, error: 'User story not found' });
        }
        if (!isAiIntakeStory(story)) {
            return res.status(400).json({ success: false, error: 'This story was not created through AI intake' });
        }

        const tasks = await loadGeneratedTasks(story.id);
        const job = await loadLatestTaskGenerationLog(story.id);

        res.json({
            success: true,
            story: responseStory(story),
            tasks,
            job,
            max_tasks: MAX_TASKS,
        });
    } catch (err) {
        next(err);
    }
}

async function handleGenerateTasks(req, res, next) {
    try {
        const story = await loadAiStoryContext(req.params.id);
        if (!story) {
            return res.status(404).json({ success: false, error: 'User story not found' });
        }
        if (!isAiIntakeStory(story)) {
            return res.status(400).json({ success: false, error: 'This story was not created through AI intake' });
        }
        if (!story.ai_intake_enabled) {
            return res.status(403).json({ success: false, error: 'AI intake is disabled for this project' });
        }

        const callbackBase = requestOrigin(req);
        const callbackUrl = callbackBase ? `${callbackBase}/api/webhooks/ai-intake/user-story/${story.id}/tasks` : '';
        if (!callbackUrl) {
            return res.status(500).json({
                success: false,
                error: 'Unable to determine task-generation callback URL',
            });
        }

        const regenerated = Boolean(req.body?.regenerate);
        const actor = actorLabel(req, 'api');
        const job = await insertAiContentLog({
            requestType: TASK_REQUEST_TYPE,
            projectId: story.project_id,
            userStoryId: story.id,
            contentHash: hashContent(`${story.id}:${regenerated ? Date.now() : (story.updated_at || story.created_at || Date.now())}`),
            rawPayload: {
                source: 'api',
                action: regenerated ? 'regenerate' : 'generate',
                user_story_id: story.id,
                title: story.title,
                description: story.description,
                acceptance_criteria: story.acceptance_criteria,
            },
            generatedContent: { story_id: story.id, status: 'pending', regenerated },
            status: 'pending',
            source: 'api',
        });
        await auditLog('ai_content_generation_logs', job.id, 'CREATE', job, null, actor);

        await triggerWorkflow('ai-intake-task-generation', {
            source: 'api',
            action: regenerated ? 'regenerate' : 'generate',
            project_id: story.project_id,
            user_story_id: story.id,
            content_markdown: story.description || story.title || '',
            content_hash: job.source_content_hash || job.content_hash,
            callback_url: callbackUrl,
            max_tasks: MAX_TASKS,
            job_id: job.id,
        });

        res.status(202).json({
            success: true,
            story: responseStory(story),
            task_generation: {
                status: 'pending',
                job_id: job.id,
                max_tasks: MAX_TASKS,
                ...(regenerated ? { regenerated: true } : {}),
            },
        });
    } catch (err) {
        next(err);
    }
}

async function handleRegenerateTasks(req, res, next) {
    req.body = { ...req.body, regenerate: true };
    return handleGenerateTasks(req, res, next);
}

router.post('/user-story', requireAiIntakeApiCaller, aiIntakeRateLimit, async (req, res, next) => {
    await handleAiStoryIntake(req, res, next, 'api');
});

router.get('/user-story/:id/generated-tasks', requireAuth, requirePermission('qc.projects.view'), handleGetGeneratedTasks);

router.post('/user-story/:id/generate-tasks', requireAuth, requirePermission('qc.tasks.create'), aiIntakeRateLimit, handleGenerateTasks);

router.post('/user-story/:id/regenerate-tasks', requireAuth, requirePermission('qc.tasks.create'), aiIntakeRateLimit, handleRegenerateTasks);

module.exports = router;
module.exports.handleAiStoryIntake = handleAiStoryIntake;
module.exports.handleGetGeneratedTasks = handleGetGeneratedTasks;
module.exports.handleGenerateTasks = handleGenerateTasks;
module.exports.handleRegenerateTasks = handleRegenerateTasks;
module.exports.aiIntakeRateLimit = aiIntakeRateLimit;

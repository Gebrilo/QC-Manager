'use strict';

const express = require('express');
const request = require('supertest');

const mockAuditLog = jest.fn().mockResolvedValue(undefined);
const mockTriggerWorkflow = jest.fn().mockResolvedValue(undefined);
const mockUserHasAnyPermission = jest.fn().mockResolvedValue(true);
const mockValidateAgentSecret = jest.fn();

const mockAiIntakeService = {
    AI_SOURCE: 'ai_intake',
    STORY_REQUEST_TYPE: 'ai_intake_user_story',
    TASK_REQUEST_TYPE: 'ai_intake_task_generation',
    MAX_TASKS: 20,
    sanitizeMarkdown: jest.fn(value => String(value ?? '').trim()),
    hashContent: jest.fn(() => 'content-hash'),
    parseAiStoryMarkdown: jest.fn(() => ({
        title: 'AI Story',
        description: 'Story description',
        acceptance_criteria: 'Acceptance criteria',
    })),
    requireAiIntakeProject: jest.fn(),
    findDuplicateStoryIntake: jest.fn(),
    insertAiContentLog: jest.fn(),
    updateAiContentLog: jest.fn(),
    createStandaloneAiStory: jest.fn(),
    createAiTasksForStory: jest.fn(),
    touchStoryForAiActivity: jest.fn(),
    loadAiStoryContext: jest.fn(),
    loadGeneratedTasks: jest.fn(),
    loadLatestTaskGenerationLog: jest.fn(),
};

jest.mock('../src/config/db', () => ({
    query: jest.fn(),
    pool: { query: jest.fn() },
}));
jest.mock('../src/middleware/audit', () => ({
    auditLog: mockAuditLog,
}));
jest.mock('../src/middleware/authMiddleware', () => ({
    requireAuth: (req, res, next) => next(),
    requirePermission: () => (req, res, next) => next(),
    userHasAnyPermission: mockUserHasAnyPermission,
}));
jest.mock('../src/utils/n8n', () => ({
    triggerWorkflow: mockTriggerWorkflow,
}));
jest.mock('../src/routes/landingContentWebhooks', () => ({
    validateAgentSecret: mockValidateAgentSecret,
}));
jest.mock('../src/services/aiIntake', () => mockAiIntakeService);

const aiIntakeRouter = require('../src/routes/aiIntake');
const aiIntakeWebhookRouter = require('../src/routes/aiIntakeWebhooks');

function createApp() {
    const app = express();
    app.use(express.json());
    app.use('/ai-intake', aiIntakeRouter);
    app.use('/webhooks/ai-intake', aiIntakeWebhookRouter);
    app.use((err, req, res, _next) => {
        res.status(500).json({ success: false, error: err.message });
    });
    return app;
}

const PROJECT_ID = '00000000-0000-0000-0000-000000000101';
const STORY_ID = '00000000-0000-0000-0000-000000000102';
const JOB_ID = '00000000-0000-0000-0000-000000000103';

describe('AI intake routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockValidateAgentSecret.mockReturnValue({ ok: true });
        mockUserHasAnyPermission.mockResolvedValue(true);
    });

    it('creates a standalone story with direct task imports', async () => {
        mockAiIntakeService.requireAiIntakeProject.mockResolvedValue({
            id: PROJECT_ID,
            project_name: 'Alpha',
            team_id: 'team-1',
            ai_intake_enabled: true,
        });
        mockAiIntakeService.findDuplicateStoryIntake.mockResolvedValue(null);
        mockAiIntakeService.insertAiContentLog
            .mockResolvedValueOnce({ id: 'story-log' })
            .mockResolvedValueOnce({ id: 'task-log' });
        mockAiIntakeService.createStandaloneAiStory.mockResolvedValue({
            id: STORY_ID,
            title: 'AI Story',
            source: 'ai_intake',
            generated_by_ai: true,
            sync_status: 'standalone',
            project_id: PROJECT_ID,
        });
        mockAiIntakeService.createAiTasksForStory.mockResolvedValue({
            tasks: [{ id: 'task-1', task_name: 'Task 1' }],
            skipped_titles: [],
        });
        mockAiIntakeService.touchStoryForAiActivity.mockResolvedValue({
            id: STORY_ID,
            source: 'ai_intake',
            generated_by_ai: true,
        });

        const res = await request(createApp())
            .post('/ai-intake/user-story')
            .send({
                project_id: PROJECT_ID,
                content_markdown: '# AI Story',
                tasks: [{ title: 'Task 1' }],
            });

        expect(res.status).toBe(201);
        expect(res.body.story.generated_by_ai).toBe(true);
        expect(res.body.story.source).toBe('ai_intake');
        expect(res.body.tasks).toHaveLength(1);
        expect(res.body.task_generation.status).toBe('processed');
        expect(mockAiIntakeService.createStandaloneAiStory).toHaveBeenCalledTimes(1);
        expect(mockTriggerWorkflow).not.toHaveBeenCalled();
    });

    it('queues task generation when tasks are omitted', async () => {
        mockAiIntakeService.requireAiIntakeProject.mockResolvedValue({
            id: PROJECT_ID,
            project_name: 'Alpha',
            team_id: 'team-1',
            ai_intake_enabled: true,
        });
        mockAiIntakeService.findDuplicateStoryIntake.mockResolvedValue(null);
        mockAiIntakeService.insertAiContentLog
            .mockResolvedValueOnce({ id: 'story-log' })
            .mockResolvedValueOnce({ id: JOB_ID, content_hash: 'content-hash' });
        mockAiIntakeService.createStandaloneAiStory.mockResolvedValue({
            id: STORY_ID,
            title: 'AI Story',
            source: 'ai_intake',
            generated_by_ai: true,
            sync_status: 'standalone',
            project_id: PROJECT_ID,
        });

        const res = await request(createApp())
            .post('/ai-intake/user-story')
            .send({
                project_id: PROJECT_ID,
                content_markdown: '# AI Story',
                create_tasks: true,
            });

        expect(res.status).toBe(202);
        expect(res.body.task_generation.status).toBe('pending');
        expect(res.body.task_generation.job_id).toBe(JOB_ID);
        expect(mockTriggerWorkflow).toHaveBeenCalledTimes(1);
        expect(mockTriggerWorkflow.mock.calls[0][0]).toBe('ai-intake-task-generation');
        expect(mockTriggerWorkflow.mock.calls[0][1].callback_url).toContain(`/api/webhooks/ai-intake/user-story/${STORY_ID}/tasks`);
    });

    it('rejects duplicate intake content without force import', async () => {
        mockAiIntakeService.requireAiIntakeProject.mockResolvedValue({
            id: PROJECT_ID,
            project_name: 'Alpha',
            team_id: 'team-1',
            ai_intake_enabled: true,
        });
        mockAiIntakeService.findDuplicateStoryIntake.mockResolvedValue({ id: 'existing-log' });

        const res = await request(createApp())
            .post('/ai-intake/user-story')
            .send({
                project_id: PROJECT_ID,
                content_markdown: '# AI Story',
            });

        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/Duplicate AI intake content/i);
    });

    it('returns the generated tasks snapshot for an AI story', async () => {
        mockAiIntakeService.loadAiStoryContext.mockResolvedValue({
            id: STORY_ID,
            project_id: PROJECT_ID,
            project_name: 'Alpha',
            team_id: 'team-1',
            ai_intake_enabled: true,
            generated_by_ai: true,
            source: 'ai_intake',
        });
        mockAiIntakeService.loadGeneratedTasks.mockResolvedValue([
            { id: 'task-1', task_name: 'Task 1', generated_by_ai: true, source: 'ai_intake' },
        ]);
        mockAiIntakeService.loadLatestTaskGenerationLog.mockResolvedValue({ id: JOB_ID });

        const res = await request(createApp()).get(`/ai-intake/user-story/${STORY_ID}/generated-tasks`);

        expect(res.status).toBe(200);
        expect(res.body.story.generated_by_ai).toBe(true);
        expect(res.body.tasks).toHaveLength(1);
        expect(res.body.job.id).toBe(JOB_ID);
    });

    it('queues regeneration for an AI story', async () => {
        mockAiIntakeService.loadAiStoryContext.mockResolvedValue({
            id: STORY_ID,
            project_id: PROJECT_ID,
            project_name: 'Alpha',
            team_id: 'team-1',
            ai_intake_enabled: true,
            generated_by_ai: true,
            source: 'ai_intake',
            updated_at: '2026-07-02T00:00:00Z',
            created_at: '2026-07-01T00:00:00Z',
        });
        mockAiIntakeService.insertAiContentLog.mockResolvedValue({ id: JOB_ID, content_hash: 'content-hash' });

        const res = await request(createApp()).post(`/ai-intake/user-story/${STORY_ID}/generate-tasks`);

        expect(res.status).toBe(202);
        expect(res.body.task_generation.status).toBe('pending');
        expect(mockTriggerWorkflow).toHaveBeenCalledTimes(1);
        expect(mockAiIntakeService.insertAiContentLog).toHaveBeenCalledTimes(1);
    });

    it('rejects webhook requests without the agent secret', async () => {
        mockValidateAgentSecret.mockReturnValue({
            ok: false,
            status: 401,
            error: 'Missing agent webhook secret',
        });

        const res = await request(createApp())
            .post('/webhooks/ai-intake/user-story')
            .send({ project_id: PROJECT_ID, content_markdown: '# AI Story' });

        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Missing agent webhook secret');
    });

    it('creates tasks from the webhook callback payload', async () => {
        mockAiIntakeService.loadAiStoryContext.mockResolvedValue({
            id: STORY_ID,
            project_id: PROJECT_ID,
            project_name: 'Alpha',
            team_id: 'team-1',
            ai_intake_enabled: true,
            generated_by_ai: true,
            source: 'ai_intake',
            created_at: '2026-07-01T00:00:00Z',
        });
        mockAiIntakeService.loadLatestTaskGenerationLog.mockResolvedValue({ id: JOB_ID });
        mockAiIntakeService.createAiTasksForStory.mockResolvedValue({
            tasks: [{ id: 'task-1', task_name: 'Task 1' }],
            skipped_titles: [],
        });
        mockAiIntakeService.updateAiContentLog.mockResolvedValue({ id: JOB_ID });
        mockAiIntakeService.touchStoryForAiActivity.mockResolvedValue({
            id: STORY_ID,
            generated_by_ai: true,
            source: 'ai_intake',
        });

        const res = await request(createApp())
            .post(`/webhooks/ai-intake/user-story/${STORY_ID}/tasks`)
            .send({
                job_id: JOB_ID,
                tasks: [{ title: 'Task 1' }],
            });

        expect(res.status).toBe(201);
        expect(res.body.story.generated_by_ai).toBe(true);
        expect(res.body.tasks).toHaveLength(1);
        expect(res.body.task_generation.job_id).toBe(JOB_ID);
        expect(mockAiIntakeService.createAiTasksForStory).toHaveBeenCalledTimes(1);
    });

    it('caps over-limit callback tasks and records the cap on the job', async () => {
        mockAiIntakeService.loadAiStoryContext.mockResolvedValue({
            id: STORY_ID,
            project_id: PROJECT_ID,
            project_name: 'Alpha',
            team_id: 'team-1',
            ai_intake_enabled: true,
            generated_by_ai: true,
            source: 'ai_intake',
        });
        mockAiIntakeService.loadLatestTaskGenerationLog.mockResolvedValue({ id: JOB_ID });
        mockAiIntakeService.createAiTasksForStory.mockResolvedValue({
            tasks: [{ id: 'task-1', task_name: 'Task 1' }],
            skipped_titles: [],
        });
        mockAiIntakeService.updateAiContentLog.mockResolvedValue({ id: JOB_ID });

        const res = await request(createApp())
            .post(`/webhooks/ai-intake/user-story/${STORY_ID}/tasks`)
            .send({
                job_id: JOB_ID,
                tasks: Array.from({ length: 25 }, (_, index) => ({ title: `Task ${index + 1}` })),
            });

        expect(res.status).toBe(201);
        expect(mockAiIntakeService.createAiTasksForStory.mock.calls[0][0].tasks).toHaveLength(20);
        expect(mockAiIntakeService.updateAiContentLog.mock.calls[0][1].generated_content).toEqual(expect.objectContaining({
            received_task_count: 25,
            max_tasks: 20,
            cap_applied: true,
        }));
        expect(res.body.task_generation.cap_applied).toBe(true);
    });

    it('records failed callback generation without losing the story', async () => {
        mockAiIntakeService.loadAiStoryContext.mockResolvedValue({
            id: STORY_ID,
            project_id: PROJECT_ID,
            project_name: 'Alpha',
            team_id: 'team-1',
            ai_intake_enabled: true,
            generated_by_ai: true,
            source: 'ai_intake',
        });
        mockAiIntakeService.loadLatestTaskGenerationLog.mockResolvedValue({ id: JOB_ID });
        mockAiIntakeService.updateAiContentLog.mockResolvedValue({ id: JOB_ID });

        const res = await request(createApp())
            .post(`/webhooks/ai-intake/user-story/${STORY_ID}/tasks`)
            .send({
                job_id: JOB_ID,
                status: 'failed',
                error_message: 'LLM timeout',
            });

        expect(res.status).toBe(200);
        expect(res.body.task_generation.status).toBe('failed');
        expect(mockAiIntakeService.updateAiContentLog).toHaveBeenCalledWith(JOB_ID, expect.objectContaining({
            status: 'failed',
            error_message: 'LLM timeout',
        }));
        expect(mockAiIntakeService.createAiTasksForStory).not.toHaveBeenCalled();
    });
});

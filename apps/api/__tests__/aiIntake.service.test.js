'use strict';

const mockQuery = jest.fn();
const mockGenerateTaskId = jest.fn();

jest.mock('../src/config/db', () => ({
    query: mockQuery,
    pool: { query: mockQuery },
}));

jest.mock('../src/services/persisters/task', () => ({
    generateTaskId: mockGenerateTaskId,
}));

const {
    sanitizeMarkdown,
    hashContent,
    parseAiStoryMarkdown,
    createStandaloneAiStory,
    createAiTasksForStory,
} = require('../src/services/aiIntake');

describe('ai intake service helpers', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGenerateTaskId.mockResolvedValue('TSK-123');
    });

    it('sanitizes AI markdown and keeps the useful story text', () => {
        const markdown = sanitizeMarkdown(`\r\n# Login flow\r\n\r\n<script>alert('x')</script>\r\n## Description\r\nShip login\r\n<iframe src="evil"></iframe>\r\n`);

        expect(markdown).toContain('# Login flow');
        expect(markdown).toContain('## Description');
        expect(markdown).not.toContain('<script');
        expect(markdown).not.toContain('<iframe');
    });

    it('extracts a title and description from AI markdown', () => {
        const parsed = parseAiStoryMarkdown(`# Checkout flow\n\n## Description\nAs a customer, I want to pay\n\n## Acceptance Criteria\n- Card accepted`);

        expect(parsed).toEqual({
            title: 'Checkout flow',
            description: 'As a customer, I want to pay',
            acceptance_criteria: '- Card accepted',
            warnings: [],
            suggested_tasks: [],
        });
    });

    it('normalizes whitespace before hashing duplicate intake content', () => {
        expect(hashContent('# Story\n\n## Description\nShip it')).toBe(hashContent('  # Story   ## Description   Ship it  '));
    });

    it('extracts suggested tasks from markdown', () => {
        const parsed = parseAiStoryMarkdown(`# Checkout flow

## Acceptance Criteria
- Card accepted

## Suggested Tasks
- [High] Design checkout - Draw the happy path
- Implement payment form`);

        expect(parsed.suggested_tasks).toEqual([
            { title: 'Design checkout', description: 'Draw the happy path', priority: 'High' },
            { title: 'Implement payment form', description: '', priority: undefined },
        ]);
    });

    it('creates standalone AI stories with provenance fields', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{
                id: 'story-1',
                title: 'Checkout flow',
                generated_by_ai: true,
                source: 'ai_intake',
                sync_status: 'standalone',
            }],
        });

        const story = await createStandaloneAiStory({
            projectRow: { id: 'project-1', team_id: 'team-1' },
            parsedStory: {
                title: 'Checkout flow',
                description: 'Do the thing',
                acceptance_criteria: 'It works',
                priority: 'High',
            },
            rawPayload: { source: 'ai' },
            actorUserId: 'user-1',
        });

        expect(story.id).toBe('story-1');
        expect(mockQuery.mock.calls[0][0]).toContain('generated_by_ai');
        expect(mockQuery.mock.calls[0][0]).toContain("source");
        expect(mockQuery.mock.calls[0][0]).toContain("TRUE, 'ai_intake'");
    });

    it('creates standalone AI tasks and skips duplicate titles', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({
                rows: [{
                    id: 'task-1',
                    task_id: 'TSK-123',
                    task_name: 'Design login',
                    generated_by_ai: true,
                    source: 'ai_intake',
                    sync_status: 'standalone',
                }],
            })
            .mockResolvedValueOnce({ rows: [{ id: 'existing-task' }] });

        const result = await createAiTasksForStory({
            projectRow: { id: 'project-1', team_id: 'team-1' },
            storyId: 'story-1',
            tasks: [
                { title: 'Design login', priority: 'High' },
                { task_name: 'Design login' },
            ],
            actorUserId: 'user-1',
        });

        expect(result.tasks).toHaveLength(1);
        expect(result.skipped_titles).toEqual(['Design login']);
        expect(mockQuery.mock.calls[1][0]).toContain('generated_by_ai');
        expect(mockQuery.mock.calls[1][0]).toContain('source');
        expect(mockQuery.mock.calls[1][0]).toContain("sync_status");
        expect(mockQuery.mock.calls[1][0]).toContain("TRUE, 'ai_intake'");
    });

});

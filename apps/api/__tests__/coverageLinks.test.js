const mockQuery = jest.fn();

jest.mock('../src/config/db', () => ({
    pool: { query: mockQuery },
}));

jest.mock('../src/middleware/authMiddleware', () => ({
    requireAuth: (req, res, next) => {
        req.user = {
            id: '22222222-2222-2222-2222-222222222222',
            role: 'admin',
        };
        next();
    },
    requirePermission: () => (req, res, next) => next(),
}));

jest.mock('../src/middleware/audit', () => ({
    auditLog: jest.fn().mockResolvedValue(undefined),
}));

const express = require('express');
const request = require('supertest');
const coverageLinks = require('../src/routes/coverageLinks');

describe('Coverage link router', () => {
    let app;

    const projectId = '99999999-9999-9999-9999-999999999999';
    const otherProjectId = '88888888-8888-8888-8888-888888888888';
    const bugId = '55555555-5555-5555-5555-555555555555';
    const taskId = '11111111-1111-1111-1111-111111111111';
    const testCaseId = '33333333-3333-3333-3333-333333333333';
    const userStoryId = '77777777-7777-7777-7777-777777777777';
    const linkId = '44444444-4444-4444-4444-444444444444';

    beforeEach(() => {
        app = express();
        app.use(express.json());
        app.use('/tasks', coverageLinks.taskSide);
        app.use('/test-cases', coverageLinks.testCaseSide);
        app.use('/bugs', coverageLinks.bugSide);
        app.use('/user-stories', coverageLinks.userStorySide);
        jest.clearAllMocks();
    });

    test('lists bug test cases from the generic link table', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: bugId, project_id: projectId }] })
            .mockResolvedValueOnce({
                rows: [{
                    id: linkId,
                    bug_id: bugId,
                    test_case_id: testCaseId,
                    relationship_type: 'reveals',
                    source: 'qc',
                    test_case_display_id: 'TC-001',
                    test_case_title: 'Login failure',
                    test_case_status: 'active',
                    test_case_project_id: projectId,
                }],
            });

        const res = await request(app).get(`/bugs/${bugId}/test-cases`);

        expect(res.status).toBe(200);
        expect(res.body.data[0].test_case_id).toBe(testCaseId);
        expect(mockQuery.mock.calls[1][0]).toContain('FROM bug_test_cases');
    });

    test('creates a bug test case link and auto-triages the bug', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: bugId, project_id: projectId }] })
            .mockResolvedValueOnce({ rows: [{ id: testCaseId, project_id: projectId }] })
            .mockResolvedValueOnce({
                rows: [{
                    id: linkId,
                    bug_id: bugId,
                    test_case_id: testCaseId,
                    relationship_type: 'reveals',
                    source: 'qc',
                }],
            })
            .mockResolvedValueOnce({ rows: [] });

        const res = await request(app)
            .post(`/bugs/${bugId}/test-cases`)
            .send({ test_case_id: testCaseId });

        expect(res.status).toBe(201);
        expect(res.body.data.source).toBe('qc');
        expect(mockQuery.mock.calls[2][0]).toContain('source');
        expect(mockQuery.mock.calls[3][0]).toContain("triage_status = 'triaged'");
    });

    test('rejects relationship types outside the pair allowed set', async () => {
        const res = await request(app)
            .post(`/bugs/${bugId}/tasks`)
            .send({ task_id: taskId, relationship_type: 'found in' });

        expect(res.status).toBe(422);
        expect(res.body.error).toBe('Invalid relationship_type');
        expect(res.body.allowed).toEqual(['blocks', 'is blocked by', 'relates to']);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test('updates the relationship type when the directed link already exists', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: bugId, project_id: projectId }] })
            .mockResolvedValueOnce({ rows: [{ id: taskId, project_id: projectId }] })
            .mockResolvedValueOnce({
                rows: [{
                    id: linkId,
                    bug_id: bugId,
                    task_id: taskId,
                    relationship_type: 'relates to',
                    source: 'qc',
                }],
            })
            .mockResolvedValueOnce({ rows: [] });

        const res = await request(app)
            .post(`/bugs/${bugId}/tasks`)
            .send({ task_id: taskId, relationship_type: 'relates to' });

        expect(res.status).toBe(201);
        expect(res.body.data.relationship_type).toBe('relates to');
        expect(mockQuery.mock.calls[2][0]).toContain('ON CONFLICT (bug_id, task_id) DO UPDATE');
        expect(mockQuery.mock.calls[2][0]).toContain('relationship_type = EXCLUDED.relationship_type');
    });

    test('rejects cross-project links', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: bugId, project_id: projectId }] })
            .mockResolvedValueOnce({ rows: [{ id: testCaseId, project_id: otherProjectId }] });

        const res = await request(app)
            .post(`/bugs/${bugId}/test-cases`)
            .send({ test_case_id: testCaseId });

        expect(res.status).toBe(422);
        expect(res.body.error).toBe('Cross-project link rejected');
        expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    test('blocks deletion of Tuleap-sourced links', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ source: 'tuleap' }] });

        const res = await request(app).delete(`/bugs/${bugId}/tasks/${taskId}`);

        expect(res.status).toBe(403);
        expect(res.body.error).toContain('Tuleap-sourced');
    });

    test('supports reverse links from user stories to test cases', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: userStoryId, project_id: projectId }] })
            .mockResolvedValueOnce({
                rows: [{
                    id: linkId,
                    test_case_id: testCaseId,
                    user_story_id: userStoryId,
                    relationship_type: 'verifies',
                    test_case_display_id: 'TC-001',
                    test_case_title: 'Login flow',
                    test_case_status: 'active',
                    test_case_project_id: projectId,
                }],
            });

        const res = await request(app).get(`/user-stories/${userStoryId}/test-cases`);

        expect(res.status).toBe(200);
        expect(res.body.data[0].test_case_id).toBe(testCaseId);
        expect(mockQuery.mock.calls[1][0]).toContain('FROM test_case_user_stories');
    });
});

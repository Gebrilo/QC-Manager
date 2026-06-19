const mockQuery = jest.fn();
const mockCanPerform = jest.fn();
const mockLoadArtifact = jest.fn();
const mockAuditLog = jest.fn();

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
    auditLog: (...args) => mockAuditLog(...args),
}));

jest.mock('../src/access/AccessEngine', () => ({
    canPerform: (...args) => mockCanPerform(...args),
}));

jest.mock('../src/access/artifactLoaders', () => ({
    ARTIFACT_GATES: {
        task: { load: (...args) => mockLoadArtifact('task', ...args) },
        bug: { load: (...args) => mockLoadArtifact('bug', ...args) },
        test_case: { load: (...args) => mockLoadArtifact('test_case', ...args) },
        user_story: { load: (...args) => mockLoadArtifact('user_story', ...args) },
        test_suite: { load: (...args) => mockLoadArtifact('test_suite', ...args) },
        test_run: { load: (...args) => mockLoadArtifact('test_run', ...args) },
    },
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
    const testSuiteId = '66666666-6666-6666-6666-666666666666';
    const testRunId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const linkId = '44444444-4444-4444-4444-444444444444';

    const artifactById = () => ({
        [bugId]: { type: 'bug', id: bugId, display_id: 'BUG-001', title: 'Login bug', project_id: projectId },
        [taskId]: { type: 'task', id: taskId, display_id: 'TASK-001', title: 'Fix login', project_id: projectId },
        [testCaseId]: { type: 'test_case', id: testCaseId, display_id: 'TC-001', title: 'Login failure', project_id: projectId },
        [userStoryId]: { type: 'user_story', id: userStoryId, display_id: 'US-001', title: 'Login flow', project_id: projectId },
        [testSuiteId]: { type: 'test_suite', id: testSuiteId, display_id: 'TS-001', title: 'Regression suite', project_id: projectId },
        [testRunId]: { type: 'test_run', id: testRunId, display_id: 'TR-001', title: 'Regression run', project_id: projectId },
    });

    beforeEach(() => {
        app = express();
        app.use(express.json());
        app.use('/tasks', coverageLinks.taskSide);
        app.use('/test-cases', coverageLinks.testCaseSide);
        app.use('/bugs', coverageLinks.bugSide);
        app.use('/user-stories', coverageLinks.userStorySide);
        app.use('/test-suites', coverageLinks.testSuiteSide);
        app.use('/test-runs', coverageLinks.testRunSide);
        jest.clearAllMocks();
        mockCanPerform.mockResolvedValue({ allowed: true, branch: 'test' });
        mockLoadArtifact.mockImplementation((_type, id) => artifactById()[id] || null);
        mockAuditLog.mockResolvedValue(undefined);
    });

    test('lists bug test cases from the generic link table', async () => {
        mockQuery.mockResolvedValueOnce({
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
        expect(mockQuery.mock.calls[0][0]).toContain('FROM bug_test_cases');
        expect(mockCanPerform).toHaveBeenCalledWith(
            expect.objectContaining({ id: '22222222-2222-2222-2222-222222222222' }),
            expect.objectContaining({ type: 'bug', id: bugId }),
            'view',
            expect.anything()
        );
    });

    test('creates a bug test case link and auto-triages the bug', async () => {
        mockQuery
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
        expect(mockCanPerform).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ type: 'bug', id: bugId }), 'edit', expect.anything());
        expect(mockCanPerform).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ type: 'test_case', id: testCaseId }), 'view', expect.anything());
        expect(mockQuery.mock.calls[0][0]).toContain('source');
        expect(mockQuery.mock.calls[1][0]).toContain("triage_status = 'triaged'");
        expect(mockAuditLog).toHaveBeenCalledWith('bug_test_cases', linkId, 'CREATE', expect.objectContaining({ id: linkId }), null, 'system');
        expect(mockAuditLog).toHaveBeenCalledWith(
            'bug',
            bugId,
            'CREATE',
            expect.objectContaining({
                event_type: 'artifact_link',
                action: 'CREATE',
                link_table: 'bug_test_cases',
                link_id: linkId,
                relationship_type: 'reveals',
                actor_id: '22222222-2222-2222-2222-222222222222',
                artifact: expect.objectContaining({ type: 'bug', id: bugId, display_id: 'BUG-001' }),
                counterpart: expect.objectContaining({ type: 'test_case', id: testCaseId, display_id: 'TC-001' }),
                direction: 'from',
            }),
            null,
            'system'
        );
        expect(mockAuditLog).toHaveBeenCalledWith(
            'test_case',
            testCaseId,
            'CREATE',
            expect.objectContaining({
                event_type: 'artifact_link',
                action: 'CREATE',
                link_table: 'bug_test_cases',
                relationship_type: 'reveals',
                artifact: expect.objectContaining({ type: 'test_case', id: testCaseId, display_id: 'TC-001' }),
                counterpart: expect.objectContaining({ type: 'bug', id: bugId, display_id: 'BUG-001' }),
                direction: 'to',
            }),
            null,
            'system'
        );
    });

    test('denies create when source instance edit access is missing', async () => {
        mockCanPerform.mockResolvedValueOnce({ allowed: false, reason: 'team_mismatch' });

        const res = await request(app)
            .post(`/bugs/${bugId}/test-cases`)
            .send({ test_case_id: testCaseId });

        expect(res.status).toBe(403);
        expect(res.body.reason).toBe('team_mismatch');
        expect(mockCanPerform).toHaveBeenCalledTimes(1);
        expect(mockCanPerform).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ id: bugId }), 'edit', expect.anything());
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test('denies create when target instance view access is missing', async () => {
        mockCanPerform
            .mockResolvedValueOnce({ allowed: true, branch: 'source' })
            .mockResolvedValueOnce({ allowed: false, reason: 'acl_missing' });

        const res = await request(app)
            .post(`/bugs/${bugId}/test-cases`)
            .send({ test_case_id: testCaseId });

        expect(res.status).toBe(403);
        expect(res.body.reason).toBe('acl_missing');
        expect(mockCanPerform).toHaveBeenNthCalledWith(1, expect.any(Object), expect.objectContaining({ id: bugId }), 'edit', expect.anything());
        expect(mockCanPerform).toHaveBeenNthCalledWith(2, expect.any(Object), expect.objectContaining({ id: testCaseId }), 'view', expect.anything());
        expect(mockQuery).not.toHaveBeenCalled();
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
        expect(mockQuery.mock.calls[0][0]).toContain('ON CONFLICT (bug_id, task_id) DO UPDATE');
        expect(mockQuery.mock.calls[0][0]).toContain('relationship_type = EXCLUDED.relationship_type');
    });

    test('rejects cross-project links', async () => {
        mockLoadArtifact.mockImplementation((type, id) => ({
            ...artifactById()[id],
            type,
            project_id: id === testCaseId ? otherProjectId : projectId,
        }));

        const res = await request(app)
            .post(`/bugs/${bugId}/test-cases`)
            .send({ test_case_id: testCaseId });

        expect(res.status).toBe(422);
        expect(res.body.error).toBe('Cross-project link rejected');
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test('rejects links when exactly one side has no project', async () => {
        mockLoadArtifact.mockImplementation((type, id) => ({
            ...artifactById()[id],
            type,
            project_id: id === testCaseId ? null : projectId,
        }));

        const res = await request(app)
            .post(`/bugs/${bugId}/test-cases`)
            .send({ test_case_id: testCaseId });

        expect(res.status).toBe(422);
        expect(res.body.error).toBe('Cross-project link rejected');
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test('blocks deletion of Tuleap-sourced links', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ source: 'tuleap' }] });

        const res = await request(app).delete(`/bugs/${bugId}/tasks/${taskId}`);

        expect(res.status).toBe(403);
        expect(res.body.error).toContain('Tuleap-sourced');
        expect(mockCanPerform).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ id: bugId }), 'edit', expect.anything());
    });

    test('deleting a link writes audit entries keyed to both artifacts', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{
                id: linkId,
                bug_id: bugId,
                task_id: taskId,
                relationship_type: 'blocks',
                source: 'qc',
            }],
        });

        const res = await request(app).delete(`/bugs/${bugId}/tasks/${taskId}`);

        expect(res.status).toBe(200);
        expect(mockAuditLog).toHaveBeenCalledWith('bug_tasks', linkId, 'DELETE', null, expect.objectContaining({ id: linkId }), 'system');
        expect(mockAuditLog).toHaveBeenCalledWith(
            'bug',
            bugId,
            'DELETE',
            null,
            expect.objectContaining({
                event_type: 'artifact_link',
                action: 'DELETE',
                link_table: 'bug_tasks',
                link_id: linkId,
                relationship_type: 'blocks',
                artifact: expect.objectContaining({ type: 'bug', id: bugId, display_id: 'BUG-001' }),
                counterpart: expect.objectContaining({ type: 'task', id: taskId, display_id: 'TASK-001' }),
                direction: 'from',
            }),
            'system'
        );
        expect(mockAuditLog).toHaveBeenCalledWith(
            'task',
            taskId,
            'DELETE',
            null,
            expect.objectContaining({
                event_type: 'artifact_link',
                action: 'DELETE',
                link_table: 'bug_tasks',
                relationship_type: 'blocks',
                artifact: expect.objectContaining({ type: 'task', id: taskId, display_id: 'TASK-001' }),
                counterpart: expect.objectContaining({ type: 'bug', id: bugId, display_id: 'BUG-001' }),
                direction: 'to',
            }),
            'system'
        );
    });

    test('supports task to test run links through the generic router', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{
                id: linkId,
                task_id: taskId,
                test_run_id: testRunId,
                relationship_type: 'exercised by',
                source: 'qc',
                test_run_display_id: 'TR-001',
                test_run_title: 'Regression run',
                test_run_status: 'in_progress',
                test_run_project_id: projectId,
            }],
        });

        const listRes = await request(app).get(`/tasks/${taskId}/test-runs`);

        expect(listRes.status).toBe(200);
        expect(listRes.body.data[0].test_run_id).toBe(testRunId);
        expect(mockQuery.mock.calls[0][0]).toContain('FROM task_runs');

        mockQuery.mockReset();
        mockQuery.mockResolvedValueOnce({
            rows: [{
                id: linkId,
                task_id: taskId,
                test_run_id: testRunId,
                relationship_type: 'exercised by',
                source: 'qc',
            }],
        });

        const createRes = await request(app)
            .post(`/tasks/${taskId}/test-runs`)
            .send({ test_run_id: testRunId, relationship_type: 'exercised by' });

        expect(createRes.status).toBe(201);
        expect(mockQuery.mock.calls[0][0]).toContain('ON CONFLICT (task_id, test_run_id) DO UPDATE');
        expect(mockAuditLog).toHaveBeenCalledWith(
            'task',
            taskId,
            'CREATE',
            expect.objectContaining({
                link_table: 'task_runs',
                relationship_type: 'exercised by',
                counterpart: expect.objectContaining({ type: 'test_run', id: testRunId, display_id: 'TR-001' }),
            }),
            null,
            'system'
        );

        mockQuery.mockReset();
        mockQuery.mockResolvedValueOnce({
            rows: [{
                id: linkId,
                task_id: taskId,
                test_run_id: testRunId,
                relationship_type: 'exercised by',
                source: 'qc',
            }],
        });

        const deleteRes = await request(app).delete(`/tasks/${taskId}/test-runs/${testRunId}`);

        expect(deleteRes.status).toBe(200);
        expect(mockQuery.mock.calls[0][0]).toContain('DELETE FROM task_runs');
        expect(mockAuditLog).toHaveBeenCalledWith(
            'test_run',
            testRunId,
            'DELETE',
            null,
            expect.objectContaining({
                link_table: 'task_runs',
                relationship_type: 'exercised by',
                counterpart: expect.objectContaining({ type: 'task', id: taskId, display_id: 'TASK-001' }),
            }),
            'system'
        );
    });

    test('denies deletion when source instance edit access is missing', async () => {
        mockCanPerform.mockResolvedValueOnce({ allowed: false, reason: 'acl_missing' });

        const res = await request(app).delete(`/bugs/${bugId}/tasks/${taskId}`);

        expect(res.status).toBe(403);
        expect(res.body.reason).toBe('acl_missing');
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test('supports reverse links from user stories to test cases', async () => {
        mockQuery.mockResolvedValueOnce({
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
        expect(mockQuery.mock.calls[0][0]).toContain('FROM test_case_user_stories');
    });
});

'use strict';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery }));

const mockCanPerform = jest.fn();
jest.mock('../src/access/AccessEngine', () => ({ canPerform: (...a) => mockCanPerform(...a) }));

const { resolveNotificationTarget } = require('../src/services/notifications/open');

afterEach(() => jest.resetAllMocks());

const user = { id: 'u-1', role: 'qc' };

function mockTaskFound() {
    mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'task-1', project_id: 'p1', owner_team_id: 't1', created_by_user_id: 'c1', visibility_scope: 'team' }] }) // task row
        .mockResolvedValueOnce({ rows: [{ resource_id: 'res-1', user_id: 'u-1' }] }); // assignee rows
}

test('ok + href when the user may view the task', async () => {
    mockTaskFound();
    mockCanPerform.mockResolvedValue({ allowed: true });
    const out = await resolveNotificationTarget(user, { entity_type: 'task', entity_id: 'task-1' }, {});
    expect(out).toEqual({ status: 'ok', href: '/work/tasks/task-1' });
});

test('forbidden + null href when the user may not view it', async () => {
    mockTaskFound();
    mockCanPerform.mockResolvedValue({ allowed: false });
    const out = await resolveNotificationTarget(user, { entity_type: 'task', entity_id: 'task-1' }, {});
    expect(out).toEqual({ status: 'forbidden', href: null });
});

test('gone when the task no longer exists', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // task row missing
    const out = await resolveNotificationTarget(user, { entity_type: 'task', entity_id: 'task-1' }, {});
    expect(out).toEqual({ status: 'gone', href: null });
    expect(mockCanPerform).not.toHaveBeenCalled();
});

test('info (non-navigable) when the notification carries no entity', async () => {
    const out = await resolveNotificationTarget(user, { entity_type: null, entity_id: null }, {});
    expect(out).toEqual({ status: 'info', href: null });
    expect(mockQuery).not.toHaveBeenCalled();
});

describe('resolveNotificationTarget — bugs', () => {
    function mockBugFound({ withAssignee = false } = {}) {
        mockQuery.mockResolvedValueOnce({
            rows: [{
                id: 'bug-1',
                project_id: 'p1',
                owner_team_id: 't1',
                created_by_user_id: 'c1',
                visibility_scope: 'team',
                assigned_to: withAssignee ? 'alice' : null,
                owner_resource_id: 'res-owner',
            }],
        });
        if (withAssignee) {
            mockQuery.mockResolvedValueOnce({ rows: [{ id: 'res-alice' }] });
        }
    }

    test('ok + href when the user may view the bug', async () => {
        mockBugFound();
        mockCanPerform.mockResolvedValue({ allowed: true });
        const out = await resolveNotificationTarget(user, { entity_type: 'bug', entity_id: 'bug-1' }, {});
        expect(out).toEqual({ status: 'ok', href: '/work/bugs/bug-1' });
    });

    test('ok when the bug has an assigned_to that resolves to a resource', async () => {
        mockBugFound({ withAssignee: true });
        mockCanPerform.mockResolvedValue({ allowed: true });
        const out = await resolveNotificationTarget(user, { entity_type: 'bug', entity_id: 'bug-1' }, {});
        expect(out).toEqual({ status: 'ok', href: '/work/bugs/bug-1' });
        // The artifact handed to canPerform should expose the resolved resource
        // id so the assignee branch can fire.
        const call = mockCanPerform.mock.calls[0];
        expect(call[1]).toMatchObject({ type: 'bug', id: 'bug-1', assignee_resource_id: 'res-owner' });
    });

    test('forbidden + null href when the user may not view the bug', async () => {
        mockBugFound();
        mockCanPerform.mockResolvedValue({ allowed: false });
        const out = await resolveNotificationTarget(user, { entity_type: 'bug', entity_id: 'bug-1' }, {});
        expect(out).toEqual({ status: 'forbidden', href: null });
    });

    test('gone when the bug no longer exists', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });
        const out = await resolveNotificationTarget(user, { entity_type: 'bug', entity_id: 'bug-1' }, {});
        expect(out).toEqual({ status: 'gone', href: null });
        expect(mockCanPerform).not.toHaveBeenCalled();
    });
});

describe('resolveNotificationTarget — user_stories', () => {
    function mockStoryFound() {
        mockQuery.mockResolvedValueOnce({
            rows: [{
                id: 'story-1',
                project_id: 'p1',
                owner_team_id: 't1',
                created_by_user_id: 'c1',
                visibility_scope: 'team',
            }],
        });
    }

    test('ok + href when the user may view the story', async () => {
        mockStoryFound();
        mockCanPerform.mockResolvedValue({ allowed: true });
        const out = await resolveNotificationTarget(user, { entity_type: 'user_story', entity_id: 'story-1' }, {});
        expect(out).toEqual({ status: 'ok', href: '/work/stories/story-1' });
    });

    test('forbidden + null href when the user may not view the story', async () => {
        mockStoryFound();
        mockCanPerform.mockResolvedValue({ allowed: false });
        const out = await resolveNotificationTarget(user, { entity_type: 'user_story', entity_id: 'story-1' }, {});
        expect(out).toEqual({ status: 'forbidden', href: null });
    });

    test('gone when the story no longer exists', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });
        const out = await resolveNotificationTarget(user, { entity_type: 'user_story', entity_id: 'story-1' }, {});
        expect(out).toEqual({ status: 'gone', href: null });
        expect(mockCanPerform).not.toHaveBeenCalled();
    });
});

describe('resolveNotificationTarget — test_case', () => {
    function mockTestCaseFound() {
        mockQuery.mockResolvedValueOnce({
            rows: [{
                id: 'tc-1',
                project_id: 'p1',
                owner_team_id: 't1',
                created_by_user_id: 'c1',
                visibility_scope: 'team',
                assigned_to: null,
            }],
        });
    }

    test('ok + href when the user may view the test case', async () => {
        mockTestCaseFound();
        mockCanPerform.mockResolvedValue({ allowed: true });
        const out = await resolveNotificationTarget(user, { entity_type: 'test_case', entity_id: 'tc-1' }, {});
        expect(out).toEqual({ status: 'ok', href: '/test/cases/tc-1' });
    });

    test('forbidden + null href when the user may not view the test case', async () => {
        mockTestCaseFound();
        mockCanPerform.mockResolvedValue({ allowed: false });
        const out = await resolveNotificationTarget(user, { entity_type: 'test_case', entity_id: 'tc-1' }, {});
        expect(out).toEqual({ status: 'forbidden', href: null });
    });

    test('gone when the test case no longer exists', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });
        const out = await resolveNotificationTarget(user, { entity_type: 'test_case', entity_id: 'tc-1' }, {});
        expect(out).toEqual({ status: 'gone', href: null });
        expect(mockCanPerform).not.toHaveBeenCalled();
    });
});

describe('resolveNotificationTarget — test_suite', () => {
    function mockTestSuiteFound() {
        mockQuery.mockResolvedValueOnce({
            rows: [{
                id: 'ts-1',
                project_id: 'p1',
                owner_team_id: 't1',
                created_by_user_id: 'c1',
                visibility_scope: 'team',
            }],
        });
    }

    test('ok + href when the user may view the test suite', async () => {
        mockTestSuiteFound();
        mockCanPerform.mockResolvedValue({ allowed: true });
        const out = await resolveNotificationTarget(user, { entity_type: 'test_suite', entity_id: 'ts-1' }, {});
        expect(out).toEqual({ status: 'ok', href: '/test/suites/ts-1' });
    });

    test('forbidden + null href when the user may not view the test suite', async () => {
        mockTestSuiteFound();
        mockCanPerform.mockResolvedValue({ allowed: false });
        const out = await resolveNotificationTarget(user, { entity_type: 'test_suite', entity_id: 'ts-1' }, {});
        expect(out).toEqual({ status: 'forbidden', href: null });
    });

    test('gone when the test suite no longer exists', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });
        const out = await resolveNotificationTarget(user, { entity_type: 'test_suite', entity_id: 'ts-1' }, {});
        expect(out).toEqual({ status: 'gone', href: null });
        expect(mockCanPerform).not.toHaveBeenCalled();
    });
});

describe('resolveNotificationTarget — test_execution', () => {
    function mockTestExecutionFound() {
        // The artifact loader runs a JOIN query (test_execution + test_run).
        mockQuery.mockResolvedValueOnce({
            rows: [{
                id: 'te-1',
                test_run_id: 'run-1',
                assigned_to: 'qa-1',
                executed_by: 'qa-1',
                project_id: 'p1',
                owner_team_id: 't1',
                created_by: 'run-owner',
                visibility_scope: 'team',
            }],
        });
        // The async buildLink does a second query to resolve test_run_id.
        mockQuery.mockResolvedValueOnce({ rows: [{ test_run_id: 'run-1' }] });
    }

    test('ok + href resolves to the parent test run page', async () => {
        mockTestExecutionFound();
        mockCanPerform.mockResolvedValue({ allowed: true });
        const out = await resolveNotificationTarget(user, { entity_type: 'test_execution', entity_id: 'te-1' }, {});
        expect(out).toEqual({ status: 'ok', href: '/test/runs/run-1' });
    });

    test('forbidden + null href when the user may not view the test execution', async () => {
        mockTestExecutionFound();
        mockCanPerform.mockResolvedValue({ allowed: false });
        const out = await resolveNotificationTarget(user, { entity_type: 'test_execution', entity_id: 'te-1' }, {});
        expect(out).toEqual({ status: 'forbidden', href: null });
    });

    test('gone when the test execution no longer exists', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });
        const out = await resolveNotificationTarget(user, { entity_type: 'test_execution', entity_id: 'te-1' }, {});
        expect(out).toEqual({ status: 'gone', href: null });
        expect(mockCanPerform).not.toHaveBeenCalled();
    });
});

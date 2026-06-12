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

describe('resolveNotificationTarget — project', () => {
    function mockProjectFound() {
        // loadProjectArtifact: SELECT id, team_id FROM projects ...
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'proj-1', team_id: 't1' }] });
    }

    test('ok + href when the user is a PM of the project', async () => {
        mockProjectFound();
        // canAccessProject: PM lookup returns a row → allowed (no team fallback needed)
        mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'u-1' }] });
        const out = await resolveNotificationTarget(user, { entity_type: 'project', entity_id: 'proj-1' }, {});
        expect(out).toEqual({ status: 'ok', href: '/work/projects/proj-1' });
    });

    test('ok + href when the user is on a member team of the project', async () => {
        mockProjectFound();
        const teamMember = { id: 'u-1', role: 'member', team_id: 't1' };
        // canAccessProject: PM lookup empty, then project_teams lookup matches user's team_id
        mockQuery.mockResolvedValueOnce({ rows: [] });
        mockQuery.mockResolvedValueOnce({ rows: [{ project_id: 'proj-1' }] });
        const out = await resolveNotificationTarget(teamMember, { entity_type: 'project', entity_id: 'proj-1' }, {});
        expect(out).toEqual({ status: 'ok', href: '/work/projects/proj-1' });
    });

    test('ok + href when the user is an admin (no PM/team queries fired)', async () => {
        mockProjectFound();
        const adminUser = { id: 'admin-1', role: 'admin' };
        const out = await resolveNotificationTarget(adminUser, { entity_type: 'project', entity_id: 'proj-1' }, {});
        expect(out).toEqual({ status: 'ok', href: '/work/projects/proj-1' });
        // Only the load query — canAccess short-circuits for admin
        expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    test('forbidden + null href when the user is not a PM and not on a member team', async () => {
        mockProjectFound();
        const memberUser = { id: 'u-1', role: 'member', team_id: 'other-team' };
        mockQuery.mockResolvedValueOnce({ rows: [] });   // PM lookup empty
        mockQuery.mockResolvedValueOnce({ rows: [] });   // project_teams empty
        const out = await resolveNotificationTarget(memberUser, { entity_type: 'project', entity_id: 'proj-1' }, {});
        expect(out).toEqual({ status: 'forbidden', href: null });
    });

    test('forbidden for a user with no team who is not a PM', async () => {
        mockProjectFound();
        const orphan = { id: 'u-1', role: 'member', team_id: null };
        mockQuery.mockResolvedValueOnce({ rows: [] });   // PM lookup empty
        // canAccessProject returns false on team_id===null without firing the project_teams query
        const out = await resolveNotificationTarget(orphan, { entity_type: 'project', entity_id: 'proj-1' }, {});
        expect(out).toEqual({ status: 'forbidden', href: null });
    });

    test('gone when the project no longer exists', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });
        const out = await resolveNotificationTarget(user, { entity_type: 'project', entity_id: 'proj-1' }, {});
        expect(out).toEqual({ status: 'gone', href: null });
    });
});

describe('resolveNotificationTarget — resource', () => {
    function mockResourceFound() {
        // loadResourceArtifact: resources LEFT JOIN app_user
        mockQuery.mockResolvedValueOnce({
            rows: [{
                id: 'res-1',
                user_id: 'u-1',
                team_id: 't1',
                manager_id: 'mgr-1',
            }],
        });
    }

    test('ok + href when the user is the linked user (self)', async () => {
        mockResourceFound();
        const self = { id: 'u-1', role: 'member' };
        const out = await resolveNotificationTarget(self, { entity_type: 'resource', entity_id: 'res-1' }, {});
        expect(out).toEqual({ status: 'ok', href: '/team/resources/res-1' });
        // canAccessResource short-circuits for self — no further queries
        expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    test('ok + href when the user is the linked user\'s manager', async () => {
        mockResourceFound();
        const mgr = { id: 'mgr-1', role: 'team_manager' };
        const out = await resolveNotificationTarget(mgr, { entity_type: 'resource', entity_id: 'res-1' }, {});
        expect(out).toEqual({ status: 'ok', href: '/team/resources/res-1' });
    });

    test('ok + href when the user is an admin', async () => {
        mockResourceFound();
        const admin = { id: 'admin-1', role: 'admin' };
        const out = await resolveNotificationTarget(admin, { entity_type: 'resource', entity_id: 'res-1' }, {});
        expect(out).toEqual({ status: 'ok', href: '/team/resources/res-1' });
        expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    test('forbidden + null href when the user is unrelated', async () => {
        mockResourceFound();
        const stranger = { id: 'stranger', role: 'member' };
        const out = await resolveNotificationTarget(stranger, { entity_type: 'resource', entity_id: 'res-1' }, {});
        expect(out).toEqual({ status: 'forbidden', href: null });
    });

    test('forbidden + null href when the resource has no linked user', async () => {
        // unlinked resource: user_id null, manager_id null
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'res-1', user_id: null, team_id: null, manager_id: null }] });
        const stranger = { id: 'stranger', role: 'member' };
        const out = await resolveNotificationTarget(stranger, { entity_type: 'resource', entity_id: 'res-1' }, {});
        expect(out).toEqual({ status: 'forbidden', href: null });
    });

    test('gone when the resource no longer exists', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });
        const out = await resolveNotificationTarget(user, { entity_type: 'resource', entity_id: 'res-1' }, {});
        expect(out).toEqual({ status: 'gone', href: null });
    });
});

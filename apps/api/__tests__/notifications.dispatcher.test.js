'use strict';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery }));

const { dispatchFromAudit, dispatchTaskAssignment, insertNotification } = require('../src/services/notifications/dispatcher');

afterEach(() => jest.clearAllMocks());

// Helper: pull the user_id of every "INSERT INTO notification" call.
function notifiedUserIds() {
    return mockQuery.mock.calls
        .filter(c => /INSERT INTO notification/i.test(c[0]))
        .map(c => c[1][0]);
}

const taskAfter = {
    id: 'task-1',
    task_name: 'Build login',
    status: 'In Progress',
    project_id: 'proj-1',
    created_by_user_id: 'creator-1',
};

describe('dispatchFromAudit — tasks', () => {
    test('CREATE notifies assignees, creator and PMs, excluding the actor', async () => {
        mockQuery.mockResolvedValue({ rows: [] }); // default (covers inserts)
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'creator-1' }] })            // resolveActorId → actor IS the creator
            .mockResolvedValueOnce({ rows: [{ user_id: 'assignee-1' }, { user_id: 'assignee-2' }] }) // junction
            .mockResolvedValueOnce({ rows: [{ user_id: 'pm-1' }] });           // project_managers

        await dispatchFromAudit({
            entityType: 'tasks', entityId: 'task-1', action: 'CREATE',
            before: null, after: taskAfter, changedFields: [], actorEmail: 'actor@x',
        });

        // creator-1 is the actor → excluded; assignees + pm remain
        expect(notifiedUserIds().sort()).toEqual(['assignee-1', 'assignee-2', 'pm-1'].sort());
    });

    test('UPDATE with a significant field (status) notifies', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        // actorEmail 'system' → resolveActorId returns null WITHOUT a query,
        // so the first real queries are the recipient lookups.
        mockQuery
            .mockResolvedValueOnce({ rows: [{ user_id: 'assignee-1' }] })       // junction
            .mockResolvedValueOnce({ rows: [{ user_id: 'pm-1' }] });            // PMs

        await dispatchFromAudit({
            entityType: 'tasks', entityId: 'task-1', action: 'UPDATE',
            before: { ...taskAfter, status: 'Todo' }, after: taskAfter,
            changedFields: ['status', 'updated_at'], actorEmail: 'system',
        });

        expect(notifiedUserIds().sort()).toEqual(['assignee-1', 'creator-1', 'pm-1'].sort());
        const insert = mockQuery.mock.calls.find(c => /INSERT INTO notification/i.test(c[0]));
        expect(insert[1][1]).toBe('task_status_changed'); // type column
    });

    test('UPDATE with no significant field does nothing (no queries at all)', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        await dispatchFromAudit({
            entityType: 'tasks', entityId: 'task-1', action: 'UPDATE',
            before: taskAfter, after: taskAfter,
            changedFields: ['updated_at', 'notes'], actorEmail: 'system',
        });
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test('unmapped entity type is a silent no-op', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        await dispatchFromAudit({
            entityType: 'widgets', entityId: 'w-1', action: 'CREATE',
            before: null, after: {}, changedFields: [], actorEmail: 'system',
        });
        expect(mockQuery).not.toHaveBeenCalled();
    });
});

describe('dispatchTaskAssignment — only newly-added assignees', () => {
    test('notifies the added assignees, excluding the actor', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'task-1', task_name: 'Build login' }] })  // task lookup
            .mockResolvedValueOnce({ rows: [{ id: 'actor-9' }] })                            // resolveActorId
            .mockResolvedValueOnce({ rows: [{ user_id: 'new-1' }, { user_id: 'actor-9' }] }); // resources of added ids

        await dispatchTaskAssignment('task-1', 'actor@x', ['res-1', 'res-2']);

        // actor-9 is the acting user → excluded; only the newly-added user remains
        expect(notifiedUserIds()).toEqual(['new-1']);
        const insert = mockQuery.mock.calls.find(c => /INSERT INTO notification/i.test(c[0]));
        expect(insert[1][1]).toBe('task_assigned');
    });

    test('no-op when no resources were added', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        await dispatchTaskAssignment('task-1', 'actor@x', []);
        expect(mockQuery).not.toHaveBeenCalled();
    });
});

const bugAfter = {
    id: 'bug-1',
    title: 'Login crashes on submit',
    status: 'Open',
    severity: 'Major impact',
    assigned_to: 'alice',
    project_id: 'proj-1',
    created_by_user_id: 'reporter-1',
};

describe('dispatchFromAudit — bugs', () => {
    test('CREATE notifies reporter + assignee (matched by name) + PMs, excluding actor', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'reporter-1' }] })               // resolveActorId → actor IS reporter
            .mockResolvedValueOnce({ rows: [{ user_id: 'assignee-alice' }] })      // resource match for 'alice'
            .mockResolvedValueOnce({ rows: [{ user_id: 'pm-1' }] });              // project_managers

        await dispatchFromAudit({
            entityType: 'bugs', entityId: 'bug-1', action: 'CREATE',
            before: null, after: bugAfter, changedFields: [], actorEmail: 'actor@x',
        });

        // reporter-1 is the actor → excluded; assignee-alice + pm-1 remain
        expect(notifiedUserIds().sort()).toEqual(['assignee-alice', 'pm-1'].sort());
        const insert = mockQuery.mock.calls.find(c => /INSERT INTO notification/i.test(c[0]));
        expect(insert[1][1]).toBe('bug_created');
        expect(insert[1][5]).toBe('bug');   // entity_type
        expect(insert[1][6]).toBe('bug-1'); // entity_id
    });

    test('CREATE works when assigned_to is unresolvable (no resource row)', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        mockQuery
            .mockResolvedValueOnce({ rows: [] })                                   // resolveActorId → no actor
            .mockResolvedValueOnce({ rows: [] })                                   // assigned_to lookup → empty
            .mockResolvedValueOnce({ rows: [{ user_id: 'pm-1' }] });               // PMs

        await dispatchFromAudit({
            entityType: 'bugs', entityId: 'bug-1', action: 'CREATE',
            before: null, after: bugAfter, changedFields: [], actorEmail: 'unknown@x',
        });

        expect(notifiedUserIds().sort()).toEqual(['pm-1', 'reporter-1'].sort());
    });

    test('UPDATE with status change notifies the standard set', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        // actorEmail 'system' → resolveActorId returns null WITHOUT a query,
        // so the first real queries are the recipient lookups.
        mockQuery
            .mockResolvedValueOnce({ rows: [{ user_id: 'assignee-alice' }] }) // resource match
            .mockResolvedValueOnce({ rows: [{ user_id: 'pm-1' }] });           // PMs

        await dispatchFromAudit({
            entityType: 'bugs', entityId: 'bug-1', action: 'UPDATE',
            before: { ...bugAfter, status: 'New' },
            after: { ...bugAfter, status: 'In Progress' },
            changedFields: ['status', 'updated_at'],
            actorEmail: 'system',
        });

        expect(notifiedUserIds().sort()).toEqual(['assignee-alice', 'pm-1', 'reporter-1'].sort());
        const insert = mockQuery.mock.calls.find(c => /INSERT INTO notification/i.test(c[0]));
        expect(insert[1][1]).toBe('bug_status_changed');
    });

    test('UPDATE with severity changed TO "Critical Impact" includes all active team_managers', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        mockQuery
            .mockResolvedValueOnce({ rows: [{ user_id: 'assignee-alice' }] }) // resource match
            .mockResolvedValueOnce({ rows: [{ user_id: 'pm-1' }] })           // PMs
            .mockResolvedValueOnce({ rows: [{ id: 'tm-1' }, { id: 'tm-2' }] }); // team_managers

        await dispatchFromAudit({
            entityType: 'bugs', entityId: 'bug-1', action: 'UPDATE',
            before: { ...bugAfter, severity: 'Major impact' },
            after: { ...bugAfter, severity: 'Critical Impact' },
            changedFields: ['severity', 'updated_at'],
            actorEmail: 'system',
        });

        // recipients from base set + team_managers (dedup is fine since they don't overlap)
        expect(notifiedUserIds().sort()).toEqual(
            ['assignee-alice', 'pm-1', 'reporter-1', 'tm-1', 'tm-2'].sort()
        );
        const insert = mockQuery.mock.calls.find(c => /INSERT INTO notification/i.test(c[0]));
        expect(insert[1][1]).toBe('bug_severity_changed');
    });

    test('UPDATE with severity changed to anything but Critical Impact does NOT pull team_managers', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        mockQuery
            .mockResolvedValueOnce({ rows: [{ user_id: 'assignee-alice' }] }) // resource match
            .mockResolvedValueOnce({ rows: [{ user_id: 'pm-1' }] });           // PMs

        await dispatchFromAudit({
            entityType: 'bugs', entityId: 'bug-1', action: 'UPDATE',
            before: { ...bugAfter, severity: 'Major impact' },
            after: { ...bugAfter, severity: 'Minor Impact' },
            changedFields: ['severity', 'updated_at'],
            actorEmail: 'system',
        });

        expect(notifiedUserIds().sort()).toEqual(['assignee-alice', 'pm-1', 'reporter-1'].sort());
        // Only 2 recipient lookups (resource + PMs) — no team_managers query
        expect(mockQuery.mock.calls.filter(c => /FROM app_user/i.test(c[0]))).toHaveLength(0);
    });

    test('UPDATE with assigned_to change emits a reassigned notification', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        mockQuery
            .mockResolvedValueOnce({ rows: [{ user_id: 'assignee-bob' }] }) // resource match for new assignee
            .mockResolvedValueOnce({ rows: [{ user_id: 'pm-1' }] });

        await dispatchFromAudit({
            entityType: 'bugs', entityId: 'bug-1', action: 'UPDATE',
            before: { ...bugAfter, assigned_to: 'alice' },
            after: { ...bugAfter, assigned_to: 'bob' },
            changedFields: ['assigned_to', 'updated_at'],
            actorEmail: 'system',
        });

        const insert = mockQuery.mock.calls.find(c => /INSERT INTO notification/i.test(c[0]));
        expect(insert[1][1]).toBe('bug_reassigned');
    });

    test('UPDATE with no significant field is a silent no-op (no queries at all)', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        await dispatchFromAudit({
            entityType: 'bugs', entityId: 'bug-1', action: 'UPDATE',
            before: bugAfter, after: bugAfter,
            changedFields: ['updated_at', 'description'], actorEmail: 'system',
        });
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test('DELETE notifies reporter + assignee + PMs', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        // DELETE always passes the significant-field gate.
        mockQuery
            .mockResolvedValueOnce({ rows: [{ user_id: 'assignee-alice' }] })
            .mockResolvedValueOnce({ rows: [{ user_id: 'pm-1' }] });

        await dispatchFromAudit({
            entityType: 'bugs', entityId: 'bug-1', action: 'DELETE',
            before: bugAfter, after: null, changedFields: [], actorEmail: 'system',
        });

        const insert = mockQuery.mock.calls.find(c => /INSERT INTO notification/i.test(c[0]));
        expect(insert[1][1]).toBe('bug_deleted');
        expect(notifiedUserIds().sort()).toEqual(['assignee-alice', 'pm-1', 'reporter-1'].sort());
    });
});

const storyAfter = {
    id: 'story-1',
    title: 'Login flow',
    status: 'Draft',
    project_id: 'proj-1',
    created_by_user_id: 'creator-1',
};

describe('dispatchFromAudit — user_stories', () => {
    test('CREATE notifies creator + PMs, excluding the actor', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'creator-1' }] })            // resolveActorId → actor IS the creator
            .mockResolvedValueOnce({ rows: [{ user_id: 'pm-1' }] });           // project_managers

        await dispatchFromAudit({
            entityType: 'user_stories', entityId: 'story-1', action: 'CREATE',
            before: null, after: storyAfter, changedFields: [], actorEmail: 'actor@x',
        });

        // creator-1 is the actor → excluded; only pm-1 remains
        expect(notifiedUserIds().sort()).toEqual(['pm-1'].sort());
        const insert = mockQuery.mock.calls.find(c => /INSERT INTO notification/i.test(c[0]));
        expect(insert[1][1]).toBe('story_created');
        expect(insert[1][5]).toBe('user_story');  // entity_type
        expect(insert[1][6]).toBe('story-1');     // entity_id
    });

    test('UPDATE with status change notifies creator + PMs', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        // actorEmail 'system' → resolveActorId returns null WITHOUT a query,
        // so the first real query is the PMs lookup.
        mockQuery
            .mockResolvedValueOnce({ rows: [{ user_id: 'pm-1' }] });

        await dispatchFromAudit({
            entityType: 'user_stories', entityId: 'story-1', action: 'UPDATE',
            before: { ...storyAfter, status: 'Draft' },
            after: { ...storyAfter, status: 'Review' },
            changedFields: ['status', 'updated_at'],
            actorEmail: 'system',
        });

        expect(notifiedUserIds().sort()).toEqual(['creator-1', 'pm-1'].sort());
        const insert = mockQuery.mock.calls.find(c => /INSERT INTO notification/i.test(c[0]));
        expect(insert[1][1]).toBe('story_status_changed');
    });

    test('UPDATE with no significant field is a silent no-op (no queries at all)', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        await dispatchFromAudit({
            entityType: 'user_stories', entityId: 'story-1', action: 'UPDATE',
            before: storyAfter, after: storyAfter,
            changedFields: ['updated_at', 'description'], actorEmail: 'system',
        });
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test('DELETE notifies creator + PMs', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        // DELETE always passes the significant-field gate.
        mockQuery
            .mockResolvedValueOnce({ rows: [{ user_id: 'pm-1' }] });

        await dispatchFromAudit({
            entityType: 'user_stories', entityId: 'story-1', action: 'DELETE',
            before: storyAfter, after: null, changedFields: [], actorEmail: 'system',
        });

        const insert = mockQuery.mock.calls.find(c => /INSERT INTO notification/i.test(c[0]));
        expect(insert[1][1]).toBe('story_deleted');
        expect(notifiedUserIds().sort()).toEqual(['creator-1', 'pm-1'].sort());
    });
});

const testCaseAfter = {
    id: 'tc-1',
    title: 'Login returns 200 on valid creds',
    status: 'Not Run',
    project_id: 'proj-1',
    created_by_user_id: 'creator-1',
    assigned_to: 'qa-1',
};

describe('dispatchFromAudit — test_case', () => {
    test('CREATE notifies creator + PMs, excluding the actor', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'creator-1' }] })            // resolveActorId → actor IS creator
            .mockResolvedValueOnce({ rows: [{ user_id: 'pm-1' }] });           // project_managers

        await dispatchFromAudit({
            entityType: 'test_case', entityId: 'tc-1', action: 'CREATE',
            before: null, after: testCaseAfter, changedFields: [], actorEmail: 'actor@x',
        });

        // creator-1 is the actor → excluded; only pm-1 remains
        expect(notifiedUserIds().sort()).toEqual(['pm-1'].sort());
        const insert = mockQuery.mock.calls.find(c => /INSERT INTO notification/i.test(c[0]));
        expect(insert[1][1]).toBe('test_case_created');
        expect(insert[1][5]).toBe('test_case');  // entity_type
        expect(insert[1][6]).toBe('tc-1');       // entity_id
    });

    test('UPDATE with status change notifies creator + PMs', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        // actorEmail 'system' → resolveActorId returns null WITHOUT a query.
        mockQuery
            .mockResolvedValueOnce({ rows: [{ user_id: 'pm-1' }] });

        await dispatchFromAudit({
            entityType: 'test_case', entityId: 'tc-1', action: 'UPDATE',
            before: { ...testCaseAfter, status: 'Not Run' },
            after: { ...testCaseAfter, status: 'Pass' },
            changedFields: ['status', 'updated_at'],
            actorEmail: 'system',
        });

        expect(notifiedUserIds().sort()).toEqual(['creator-1', 'pm-1'].sort());
        const insert = mockQuery.mock.calls.find(c => /INSERT INTO notification/i.test(c[0]));
        expect(insert[1][1]).toBe('test_case_status_changed');
    });

    test('UPDATE with title change renders a "renamed" notification', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'pm-1' }] });

        await dispatchFromAudit({
            entityType: 'test_case', entityId: 'tc-1', action: 'UPDATE',
            before: { ...testCaseAfter, title: 'Old name' },
            after: { ...testCaseAfter, title: 'New name' },
            changedFields: ['title', 'updated_at'],
            actorEmail: 'system',
        });

        const insert = mockQuery.mock.calls.find(c => /INSERT INTO notification/i.test(c[0]));
        expect(insert[1][1]).toBe('test_case_updated');
        expect(insert[1][3]).toMatch(/New name/);
    });

    test('UPDATE with no significant field is a silent no-op', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        await dispatchFromAudit({
            entityType: 'test_case', entityId: 'tc-1', action: 'UPDATE',
            before: testCaseAfter, after: testCaseAfter,
            changedFields: ['updated_at', 'description'], actorEmail: 'system',
        });
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test('DELETE notifies creator + PMs', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'pm-1' }] });

        await dispatchFromAudit({
            entityType: 'test_case', entityId: 'tc-1', action: 'DELETE',
            before: testCaseAfter, after: null, changedFields: [], actorEmail: 'system',
        });

        const insert = mockQuery.mock.calls.find(c => /INSERT INTO notification/i.test(c[0]));
        expect(insert[1][1]).toBe('test_case_deleted');
        expect(notifiedUserIds().sort()).toEqual(['creator-1', 'pm-1'].sort());
    });
});

const testSuiteAfter = {
    id: 'ts-1',
    name: 'Smoke suite',
    status: 'draft',
    project_id: 'proj-1',
    created_by_user_id: 'creator-1',
};

describe('dispatchFromAudit — test_suites', () => {
    test('CREATE notifies creator + PMs, excluding the actor', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'creator-1' }] })            // resolveActorId
            .mockResolvedValueOnce({ rows: [{ user_id: 'pm-1' }] });           // PMs

        await dispatchFromAudit({
            entityType: 'test_suites', entityId: 'ts-1', action: 'CREATE',
            before: null, after: testSuiteAfter, changedFields: [], actorEmail: 'actor@x',
        });

        expect(notifiedUserIds().sort()).toEqual(['pm-1'].sort());
        const insert = mockQuery.mock.calls.find(c => /INSERT INTO notification/i.test(c[0]));
        expect(insert[1][1]).toBe('test_suite_created');
        expect(insert[1][5]).toBe('test_suite');
        expect(insert[1][6]).toBe('ts-1');
    });

    test('UPDATE with status change notifies creator + PMs', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'pm-1' }] });

        await dispatchFromAudit({
            entityType: 'test_suites', entityId: 'ts-1', action: 'UPDATE',
            before: { ...testSuiteAfter, status: 'draft' },
            after: { ...testSuiteAfter, status: 'active' },
            changedFields: ['status', 'updated_at'],
            actorEmail: 'system',
        });

        expect(notifiedUserIds().sort()).toEqual(['creator-1', 'pm-1'].sort());
        const insert = mockQuery.mock.calls.find(c => /INSERT INTO notification/i.test(c[0]));
        expect(insert[1][1]).toBe('test_suite_status_changed');
    });

    test('UPDATE with no significant field is a silent no-op', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        await dispatchFromAudit({
            entityType: 'test_suites', entityId: 'ts-1', action: 'UPDATE',
            before: testSuiteAfter, after: testSuiteAfter,
            changedFields: ['updated_at', 'description'], actorEmail: 'system',
        });
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test('DELETE notifies creator + PMs', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'pm-1' }] });

        await dispatchFromAudit({
            entityType: 'test_suites', entityId: 'ts-1', action: 'DELETE',
            before: testSuiteAfter, after: null, changedFields: [], actorEmail: 'system',
        });

        const insert = mockQuery.mock.calls.find(c => /INSERT INTO notification/i.test(c[0]));
        expect(insert[1][1]).toBe('test_suite_deleted');
        expect(notifiedUserIds().sort()).toEqual(['creator-1', 'pm-1'].sort());
    });
});

const testExecutionAfter = {
    id: 'te-1',
    test_case_id: 'tc-1',
    test_run_id: 'run-1',
    status: 'pass',
    executed_by: 'qa-1',
};

describe('dispatchFromAudit — test_execution', () => {
    test('CREATE notifies executor + test run owner + PMs, excluding the actor', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        // actor IS the executor → resolveActorId returns the executor's id
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'qa-1' }] })                  // resolveActorId
            .mockResolvedValueOnce({ rows: [{ created_by: 'run-owner', project_id: 'proj-1' }] }) // test_run lookup
            .mockResolvedValueOnce({ rows: [{ user_id: 'pm-1' }] });           // PMs

        await dispatchFromAudit({
            entityType: 'test_execution', entityId: 'te-1', action: 'CREATE',
            before: null, after: testExecutionAfter, changedFields: [], actorEmail: 'actor@x',
        });

        // qa-1 (executor) is the actor → excluded; run-owner + pm-1 remain
        expect(notifiedUserIds().sort()).toEqual(['pm-1', 'run-owner'].sort());
        const insert = mockQuery.mock.calls.find(c => /INSERT INTO notification/i.test(c[0]));
        expect(insert[1][1]).toBe('test_execution_created');
        expect(insert[1][5]).toBe('test_execution');
        expect(insert[1][6]).toBe('te-1');
    });

    test('CREATE with no executed_by (e.g. not_run) still notifies the run owner + PMs', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        mockQuery
            .mockResolvedValueOnce({ rows: [] })                                            // resolveActorId → no actor
            .mockResolvedValueOnce({ rows: [{ created_by: 'run-owner', project_id: 'proj-1' }] }) // test_run lookup
            .mockResolvedValueOnce({ rows: [{ user_id: 'pm-1' }] });                        // PMs

        await dispatchFromAudit({
            entityType: 'test_execution', entityId: 'te-1', action: 'CREATE',
            before: null, after: { ...testExecutionAfter, executed_by: null },
            changedFields: [], actorEmail: 'unknown@x',
        });

        expect(notifiedUserIds().sort()).toEqual(['pm-1', 'run-owner'].sort());
    });

    test('UPDATE with status change notifies the standard set', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        // actorEmail 'system' → resolveActorId returns null WITHOUT a query.
        mockQuery
            .mockResolvedValueOnce({ rows: [{ created_by: 'run-owner', project_id: 'proj-1' }] }) // test_run
            .mockResolvedValueOnce({ rows: [{ user_id: 'pm-1' }] });           // PMs

        await dispatchFromAudit({
            entityType: 'test_execution', entityId: 'te-1', action: 'UPDATE',
            before: { ...testExecutionAfter, status: 'not_run' },
            after: { ...testExecutionAfter, status: 'pass' },
            changedFields: ['status', 'updated_at'],
            actorEmail: 'system',
        });

        expect(notifiedUserIds().sort()).toEqual(['pm-1', 'qa-1', 'run-owner'].sort());
        const insert = mockQuery.mock.calls.find(c => /INSERT INTO notification/i.test(c[0]));
        expect(insert[1][1]).toBe('test_execution_status_changed');
    });

    test('UPDATE with no significant field is a silent no-op', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        await dispatchFromAudit({
            entityType: 'test_execution', entityId: 'te-1', action: 'UPDATE',
            before: testExecutionAfter, after: testExecutionAfter,
            changedFields: ['updated_at', 'notes'], actorEmail: 'system',
        });
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test('DELETE notifies the standard set', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        mockQuery
            .mockResolvedValueOnce({ rows: [{ created_by: 'run-owner', project_id: 'proj-1' }] }) // test_run
            .mockResolvedValueOnce({ rows: [{ user_id: 'pm-1' }] });

        await dispatchFromAudit({
            entityType: 'test_execution', entityId: 'te-1', action: 'DELETE',
            before: testExecutionAfter, after: null, changedFields: [], actorEmail: 'system',
        });

        const insert = mockQuery.mock.calls.find(c => /INSERT INTO notification/i.test(c[0]));
        expect(insert[1][1]).toBe('test_execution_deleted');
        expect(notifiedUserIds().sort()).toEqual(['pm-1', 'qa-1', 'run-owner'].sort());
    });
});

const projectAfter = {
    id: 'proj-1',
    project_name: 'Onboarding portal',
    status: 'active',
    team_id: 'team-1',
};

describe('dispatchFromAudit — projects', () => {
    test('CREATE notifies all active admins (no PMs or team leads yet)', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        mockQuery
            .mockResolvedValueOnce({ rows: [] })                                           // resolveActorId → no actor
            .mockResolvedValueOnce({ rows: [{ id: 'admin-1' }, { id: 'admin-2' }] });      // admins

        await dispatchFromAudit({
            entityType: 'projects', entityId: 'proj-1', action: 'CREATE',
            before: null, after: projectAfter, changedFields: [], actorEmail: 'unknown@x',
        });

        expect(notifiedUserIds().sort()).toEqual(['admin-1', 'admin-2'].sort());
        const insert = mockQuery.mock.calls.find(c => /INSERT INTO notification/i.test(c[0]));
        expect(insert[1][1]).toBe('project_created');
        expect(insert[1][5]).toBe('project');
        expect(insert[1][6]).toBe('proj-1');
    });

    test('CREATE excludes the actor when they are themselves an admin', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'admin-1' }] })                    // resolveActorId → actor IS admin-1
            .mockResolvedValueOnce({ rows: [{ id: 'admin-1' }, { id: 'admin-2' }] }); // admins

        await dispatchFromAudit({
            entityType: 'projects', entityId: 'proj-1', action: 'CREATE',
            before: null, after: projectAfter, changedFields: [], actorEmail: 'actor@x',
        });

        expect(notifiedUserIds()).toEqual(['admin-2']);
    });

    test('UPDATE on status notifies PMs and member-team leads', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        // actorEmail 'system' → resolveActorId returns null WITHOUT a query.
        mockQuery
            .mockResolvedValueOnce({ rows: [{ user_id: 'pm-1' }, { user_id: 'pm-2' }] })       // project_managers
            .mockResolvedValueOnce({ rows: [{ manager_id: 'lead-1' }, { manager_id: 'lead-2' }] }); // team leads

        await dispatchFromAudit({
            entityType: 'projects', entityId: 'proj-1', action: 'UPDATE',
            before: { ...projectAfter, status: 'active' },
            after: { ...projectAfter, status: 'on_hold' },
            changedFields: ['status', 'updated_at'],
            actorEmail: 'system',
        });

        expect(notifiedUserIds().sort()).toEqual(['lead-1', 'lead-2', 'pm-1', 'pm-2'].sort());
        const insert = mockQuery.mock.calls.find(c => /INSERT INTO notification/i.test(c[0]));
        expect(insert[1][1]).toBe('project_status_changed');
    });

    test('UPDATE with no significant field is a silent no-op (no queries at all)', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        await dispatchFromAudit({
            entityType: 'projects', entityId: 'proj-1', action: 'UPDATE',
            before: projectAfter, after: projectAfter,
            changedFields: ['description', 'updated_at'], actorEmail: 'system',
        });
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test('DELETE notifies PMs and member-team leads', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        mockQuery
            .mockResolvedValueOnce({ rows: [{ user_id: 'pm-1' }] })
            .mockResolvedValueOnce({ rows: [{ manager_id: 'lead-1' }] });

        await dispatchFromAudit({
            entityType: 'projects', entityId: 'proj-1', action: 'DELETE',
            before: projectAfter, after: null, changedFields: [], actorEmail: 'system',
        });

        const insert = mockQuery.mock.calls.find(c => /INSERT INTO notification/i.test(c[0]));
        expect(insert[1][1]).toBe('project_deleted');
        expect(notifiedUserIds().sort()).toEqual(['lead-1', 'pm-1'].sort());
    });
});

const resourceAfter = {
    id: 'res-1',
    resource_name: 'Alice',
    user_id: 'user-1',
    weekly_capacity_hrs: 40,
    is_active: true,
};

describe('dispatchFromAudit — resources', () => {
    test('CREATE notifies the linked user + their manager + all admins, excluding the actor', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 'user-1' }] })                       // resolveActorId → actor IS the linked user
            .mockResolvedValueOnce({ rows: [{ manager_id: 'mgr-1' }] })               // linked user's manager
            .mockResolvedValueOnce({ rows: [{ id: 'admin-1' }, { id: 'admin-2' }] });  // admins

        await dispatchFromAudit({
            entityType: 'resources', entityId: 'res-1', action: 'CREATE',
            before: null, after: resourceAfter, changedFields: [], actorEmail: 'actor@x',
        });

        // user-1 (actor) excluded; manager + admins remain
        expect(notifiedUserIds().sort()).toEqual(['admin-1', 'admin-2', 'mgr-1'].sort());
        const insert = mockQuery.mock.calls.find(c => /INSERT INTO notification/i.test(c[0]));
        expect(insert[1][1]).toBe('resource_created');
        expect(insert[1][5]).toBe('resource');
        expect(insert[1][6]).toBe('res-1');
    });

    test('CREATE works when the linked user has no manager', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        mockQuery
            .mockResolvedValueOnce({ rows: [] })                                       // resolveActorId → no actor
            .mockResolvedValueOnce({ rows: [{ manager_id: null }] })                   // manager lookup → null
            .mockResolvedValueOnce({ rows: [{ id: 'admin-1' }] });                     // admins

        await dispatchFromAudit({
            entityType: 'resources', entityId: 'res-1', action: 'CREATE',
            before: null, after: { ...resourceAfter, user_id: 'user-1' },
            changedFields: [], actorEmail: 'unknown@x',
        });

        expect(notifiedUserIds().sort()).toEqual(['admin-1', 'user-1'].sort());
    });

    test('CREATE works when resource is not linked to any user', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        mockQuery
            .mockResolvedValueOnce({ rows: [] })                                       // resolveActorId
            .mockResolvedValueOnce({ rows: [{ id: 'admin-1' }] });                     // admins (no manager lookup)

        await dispatchFromAudit({
            entityType: 'resources', entityId: 'res-1', action: 'CREATE',
            before: null, after: { ...resourceAfter, user_id: null },
            changedFields: [], actorEmail: 'unknown@x',
        });

        expect(notifiedUserIds()).toEqual(['admin-1']);
    });

    test('UPDATE on is_active renders an "activated/deactivated" notification', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        mockQuery
            .mockResolvedValueOnce({ rows: [{ manager_id: 'mgr-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'admin-1' }] });

        await dispatchFromAudit({
            entityType: 'resources', entityId: 'res-1', action: 'UPDATE',
            before: { ...resourceAfter, is_active: true },
            after: { ...resourceAfter, is_active: false },
            changedFields: ['is_active', 'updated_at'],
            actorEmail: 'system',
        });

        const insert = mockQuery.mock.calls.find(c => /INSERT INTO notification/i.test(c[0]));
        expect(insert[1][1]).toBe('resource_updated');
        expect(insert[1][2]).toBe('Resource deactivated');
        expect(notifiedUserIds().sort()).toEqual(['admin-1', 'mgr-1', 'user-1'].sort());
    });

    test('UPDATE on weekly_capacity_hrs renders a "capacity changed" notification', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        mockQuery
            .mockResolvedValueOnce({ rows: [{ manager_id: 'mgr-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'admin-1' }] });

        await dispatchFromAudit({
            entityType: 'resources', entityId: 'res-1', action: 'UPDATE',
            before: { ...resourceAfter, weekly_capacity_hrs: 40 },
            after: { ...resourceAfter, weekly_capacity_hrs: 32 },
            changedFields: ['weekly_capacity_hrs', 'updated_at'],
            actorEmail: 'system',
        });

        const insert = mockQuery.mock.calls.find(c => /INSERT INTO notification/i.test(c[0]));
        expect(insert[1][1]).toBe('resource_updated');
        expect(insert[1][2]).toBe('Resource capacity changed');
        expect(insert[1][3]).toMatch(/32h/);
    });

    test('UPDATE with no significant field is a silent no-op', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        await dispatchFromAudit({
            entityType: 'resources', entityId: 'res-1', action: 'UPDATE',
            before: resourceAfter, after: resourceAfter,
            changedFields: ['email', 'updated_at'], actorEmail: 'system',
        });
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test('DELETE notifies the linked user + manager + admins', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        mockQuery
            .mockResolvedValueOnce({ rows: [{ manager_id: 'mgr-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'admin-1' }] });

        await dispatchFromAudit({
            entityType: 'resources', entityId: 'res-1', action: 'DELETE',
            before: resourceAfter, after: null, changedFields: [], actorEmail: 'system',
        });

        const insert = mockQuery.mock.calls.find(c => /INSERT INTO notification/i.test(c[0]));
        expect(insert[1][1]).toBe('resource_deleted');
        expect(notifiedUserIds().sort()).toEqual(['admin-1', 'mgr-1', 'user-1'].sort());
    });
});

describe('insertNotification — user lifecycle shape', () => {
    test('user_activated writes the full entity_type/entity_id/actor_id columns', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        await insertNotification({
            user_id: 'user-1',
            type: 'user_activated',
            title: 'You are now an Active Resource',
            message: 'Your account has been activated. You now have full system access.',
            entity_type: 'user',
            entity_id: 'user-1',
            actor_id: 'admin-1',
        });

        const insert = mockQuery.mock.calls.find(c => /INSERT INTO notification/i.test(c[0]));
        expect(insert).toBeDefined();
        // Column order in the INSERT statement:
        // user_id, type, title, message, metadata, entity_type, entity_id, action, actor_id
        const cols = insert[1];
        expect(cols[0]).toBe('user-1');          // user_id
        expect(cols[1]).toBe('user_activated');  // type
        expect(cols[5]).toBe('user');            // entity_type
        expect(cols[6]).toBe('user-1');          // entity_id
        expect(cols[7]).toBeNull();              // action (not set for lifecycle events)
        expect(cols[8]).toBe('admin-1');         // actor_id
    });

    test('user_deactivated can be written with metadata, no action', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        await insertNotification({
            user_id: 'user-1',
            type: 'user_deactivated',
            title: 'Your account has been deactivated',
            message: 'Your account has been deactivated by an admin.',
            metadata: { user_name: 'Alice', user_email: 'alice@x' },
            entity_type: 'user',
            entity_id: 'user-1',
            actor_id: 'admin-1',
        });

        const insert = mockQuery.mock.calls.find(c => /INSERT INTO notification/i.test(c[0]));
        expect(insert[1][1]).toBe('user_deactivated');
        expect(insert[1][5]).toBe('user');
        expect(insert[1][6]).toBe('user-1');
        // metadata is JSON.stringified into the 5th column
        const meta = JSON.parse(insert[1][4]);
        expect(meta.user_name).toBe('Alice');
    });

    test('user_deleted writes to the admin (not the deleted user)', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        await insertNotification({
            user_id: 'admin-1',
            type: 'user_deleted',
            title: 'User deleted',
            message: 'Alice was permanently deleted.',
            metadata: { user_name: 'Alice', user_email: 'alice@x' },
            entity_type: 'user',
            entity_id: 'deleted-user-1', // intentionally a non-existent id
            actor_id: 'admin-2',
        });

        const insert = mockQuery.mock.calls.find(c => /INSERT INTO notification/i.test(c[0]));
        expect(insert[1][0]).toBe('admin-1');     // recipient is an admin
        expect(insert[1][1]).toBe('user_deleted'); // type
        expect(insert[1][5]).toBe('user');         // entity_type
        expect(insert[1][6]).toBe('deleted-user-1'); // entity_id can be a now-deleted user
    });

    test('user_registered writes the admin-recipient shape with auth metadata', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        await insertNotification({
            user_id: 'admin-1',
            type: 'user_registered',
            title: 'New User Registered',
            message: 'Alice (alice@x) has registered via magic link.',
            metadata: { user_name: 'Alice', user_email: 'alice@x', auth_provider: 'google' },
            entity_type: 'user',
            entity_id: 'new-user-1',
        });

        const insert = mockQuery.mock.calls.find(c => /INSERT INTO notification/i.test(c[0]));
        expect(insert[1][1]).toBe('user_registered');
        expect(insert[1][5]).toBe('user');
        expect(insert[1][6]).toBe('new-user-1');
        const meta = JSON.parse(insert[1][4]);
        expect(meta.auth_provider).toBe('google');
    });
});

describe('userLifecycle activation flow — insertNotification shape', () => {
    // The activation flow uses `insertNotification` directly (not
    // dispatchFromAudit), so we don't exercise the audit path here.
    // This block documents the contract: activation produces exactly
    // one notification, targeting the activated user, with the
    // entity_type='user' / entity_id=<their id> shape the bell needs.
    test('activation produces a single notification for the activated user', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        await insertNotification({
            user_id: 'user-1',
            type: 'user_activated',
            title: 'You are now an Active Resource',
            message: 'Your account has been activated. You now have full system access.',
            entity_type: 'user',
            entity_id: 'user-1',
        });

        const inserts = mockQuery.mock.calls.filter(c => /INSERT INTO notification/i.test(c[0]));
        expect(inserts).toHaveLength(1);
        expect(inserts[0][1][0]).toBe('user-1');         // user_id
        expect(inserts[0][1][1]).toBe('user_activated'); // type
        expect(inserts[0][1][5]).toBe('user');           // entity_type
        expect(inserts[0][1][6]).toBe('user-1');         // entity_id
    });
});

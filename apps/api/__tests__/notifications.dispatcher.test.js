'use strict';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery }));

const { dispatchFromAudit, dispatchTaskAssignment } = require('../src/services/notifications/dispatcher');

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

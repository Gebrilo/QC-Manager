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

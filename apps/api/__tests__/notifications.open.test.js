'use strict';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery }));

const mockCanPerform = jest.fn();
jest.mock('../src/access/AccessEngine', () => ({ canPerform: (...a) => mockCanPerform(...a) }));

const { resolveNotificationTarget } = require('../src/services/notifications/open');

afterEach(() => jest.clearAllMocks());

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

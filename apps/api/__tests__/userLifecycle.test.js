'use strict';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery }));

const { activateUser, rollbackUser, markReadyForActivation } = require('../src/services/userLifecycle');

afterEach(() => jest.clearAllMocks());

// ─── activateUser ────────────────────────────────────────────────────────────

describe('activateUser', () => {
    const managerId = 'manager-1';
    const userId    = 'user-1';

    test('throws 400 when user not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });
        await expect(activateUser(userId, managerId)).rejects.toMatchObject({
            status: 404, message: 'User not found',
        });
    });

    test('throws 409 when user is already ACTIVE', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: userId, status: 'ACTIVE', team_id: 't1', ready_for_activation: true, manager_id: managerId }] });
        await expect(activateUser(userId, managerId)).rejects.toMatchObject({
            status: 409, message: 'User is already active',
        });
    });

    test('throws 400 when user has no team', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: userId, status: 'PREPARATION', team_id: null, ready_for_activation: true, manager_id: managerId }] });
        await expect(activateUser(userId, managerId)).rejects.toMatchObject({
            status: 400, message: 'User must be assigned to a team before activation',
        });
    });

    test('throws 400 when ready_for_activation is false', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: userId, status: 'PREPARATION', team_id: 't1', ready_for_activation: false, manager_id: managerId }] });
        await expect(activateUser(userId, managerId)).rejects.toMatchObject({
            status: 400, message: 'User is not marked as ready for activation',
        });
    });

    test('throws 403 when manager does not manage user (non-admin)', async () => {
        // User is in team-A; actor's team will be team-B → mismatch
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: userId, status: 'PREPARATION', team_id: 'team-A',
                     ready_for_activation: true, manager_id: 'other-manager' }],
        });
        // getManagerTeamId → actor manages team-B
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'team-B', name: 'Team B', manager_id: managerId }] });

        await expect(activateUser(userId, managerId, {}, 'manager')).rejects.toMatchObject({
            status: 403, message: 'You can only activate users in your team',
        });
    });

    test('throws 403 when manager belongs to a different team', async () => {
        // Call 1: user lookup
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: userId, name: 'Test', email: 't@t.com', role: 'user',
                     status: 'PREPARATION', team_id: 'team-A',
                     ready_for_activation: true, manager_id: 'other-mgr' }],
        });
        // Call 2: getManagerTeamId — actor manages team-B (mismatch with team-A)
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'team-B', name: 'Team B', manager_id: managerId }] });

        await expect(activateUser(userId, managerId, {}, 'manager')).rejects.toMatchObject({
            status: 403, message: 'You can only activate users in your team',
        });
    });

    test('throws 403 when manager has no team assigned', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: userId, name: 'Test', email: 't@t.com', role: 'user',
                     status: 'PREPARATION', team_id: 'team-A',
                     ready_for_activation: true, manager_id: null }],
        });
        // getManagerTeamId → no team found
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await expect(activateUser(userId, managerId, {}, 'manager')).rejects.toMatchObject({
            status: 403,
        });
    });

    test('succeeds for admin regardless of manager_id', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: userId, name: 'Sara', email: 's@x.com', role: 'contributor', status: 'PREPARATION', team_id: 't1', ready_for_activation: true, manager_id: 'other-manager' }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ id: userId }] })
            .mockResolvedValueOnce({ rows: [{ id: 'r1' }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });
        await expect(activateUser(userId, 'any-admin', {}, 'admin')).resolves.toMatchObject({ id: userId });
    });

    test('activates user and returns updated row', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: userId, name: 'Sara', email: 's@x.com', role: 'contributor', status: 'PREPARATION', team_id: 't1', ready_for_activation: true, manager_id: managerId }] })
            // NEW: getManagerTeamId — actor manages team 't1' (matches user's team_id)
            .mockResolvedValueOnce({ rows: [{ id: 't1', name: 'Team A', manager_id: managerId }] })
            .mockResolvedValueOnce({ rows: [] })                              // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: userId, status: 'ACTIVE' }] }) // UPDATE app_user
            .mockResolvedValueOnce({ rows: [{ id: 'r1' }] })                 // INSERT resources
            .mockResolvedValueOnce({ rows: [] })                              // INSERT notification
            .mockResolvedValueOnce({ rows: [] });                             // COMMIT
        const result = await activateUser(userId, managerId, {}, 'manager');
        expect(result).toMatchObject({ id: userId, status: 'ACTIVE' });
    });
});

// ─── rollbackUser ────────────────────────────────────────────────────────────

describe('rollbackUser', () => {
    const adminId = 'admin-1';
    const userId  = 'user-1';

    test('throws 404 when user not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });
        await expect(rollbackUser(userId, adminId)).rejects.toMatchObject({ status: 404 });
    });

    test('throws 409 when user is not ACTIVE', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: userId, status: 'PREPARATION' }] });
        await expect(rollbackUser(userId, adminId)).rejects.toMatchObject({
            status: 409, message: 'User is not currently active',
        });
    });

    test('rolls back ACTIVE user to PREPARATION', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: userId, status: 'ACTIVE' }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ id: userId, status: 'PREPARATION' }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });
        const result = await rollbackUser(userId, adminId);
        expect(result).toMatchObject({ id: userId, status: 'PREPARATION' });
    });
});

// ─── markReadyForActivation ──────────────────────────────────────────────────

describe('markReadyForActivation', () => {
    const managerId = 'manager-1';
    const userId    = 'user-1';

    test('throws 404 when user not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });
        await expect(markReadyForActivation(userId, managerId, true)).rejects.toMatchObject({ status: 404 });
    });

    test('throws 400 when user is not in PREPARATION', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: userId, status: 'ACTIVE', manager_id: managerId }] });
        await expect(markReadyForActivation(userId, managerId, true)).rejects.toMatchObject({
            status: 400, message: 'Can only update ready_for_activation for users in PREPARATION status',
        });
    });

    test('throws 403 when manager does not manage user (non-admin)', async () => {
        // User is in team-A; actor's team will be team-B
        mockQuery.mockResolvedValueOnce({ rows: [{ id: userId, status: 'PREPARATION', team_id: 'team-A' }] });
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'team-B', name: 'Team B', manager_id: managerId }] });

        await expect(markReadyForActivation(userId, managerId, true, 'manager')).rejects.toMatchObject({
            status: 403,
        });
    });

    test('throws 403 when manager belongs to a different team', async () => {
        // user SELECT now returns team_id instead of manager_id
        mockQuery.mockResolvedValueOnce({ rows: [{ id: userId, status: 'PREPARATION', team_id: 'team-A' }] });
        // getManagerTeamId → actor manages team-B (mismatch)
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'team-B', name: 'Team B', manager_id: managerId }] });

        await expect(markReadyForActivation(userId, managerId, true, 'manager')).rejects.toMatchObject({
            status: 403,
        });
    });

    test('throws 403 when manager has no team assigned', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: userId, status: 'PREPARATION', team_id: 'team-A' }] });
        mockQuery.mockResolvedValueOnce({ rows: [] }); // no team

        await expect(markReadyForActivation(userId, managerId, true, 'manager')).rejects.toMatchObject({
            status: 403,
        });
    });

    test('sets ready_for_activation flag', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: userId, status: 'PREPARATION', team_id: 't1' }] })
            // NEW: getManagerTeamId — actor manages team 't1' (match)
            .mockResolvedValueOnce({ rows: [{ id: 't1', name: 'Team A', manager_id: managerId }] })
            .mockResolvedValueOnce({ rows: [{ id: userId, ready_for_activation: true }] }); // UPDATE
        const result = await markReadyForActivation(userId, managerId, true, 'manager');
        expect(result.ready_for_activation).toBe(true);
    });
});

'use strict';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery }));

const {
    requireTeamScope,
    canAccessUser,
    getTeamScopeFilter,
} = require('../src/middleware/teamAccess');

function makeRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

afterEach(() => jest.clearAllMocks());

// ── requireTeamScope ──────────────────────────────────────────────────────────

describe('requireTeamScope', () => {
    test('passes admin — sets req.teamId = null', async () => {
        const req = { user: { id: 'admin-1', role: 'admin' } };
        const res = makeRes();
        const next = jest.fn();

        await requireTeamScope(req, res, next);

        expect(req.teamId).toBeNull();
        expect(next).toHaveBeenCalledWith();
        expect(res.status).not.toHaveBeenCalled();
    });

    test('passes manager with team — sets req.teamId to team UUID', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: 'team-abc', name: 'Team A', manager_id: 'mgr-1' }],
        });
        const req = { user: { id: 'mgr-1', role: 'manager' } };
        const res = makeRes();
        const next = jest.fn();

        await requireTeamScope(req, res, next);

        expect(req.teamId).toBe('team-abc');
        expect(next).toHaveBeenCalledWith();
    });

    test('blocks manager with no team — 403', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });
        const req = { user: { id: 'mgr-2', role: 'manager' } };
        const res = makeRes();
        const next = jest.fn();

        await requireTeamScope(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: expect.stringContaining('not assigned') })
        );
        expect(next).not.toHaveBeenCalled();
    });

    test('blocks non-manager non-admin role — 403', async () => {
        const req = { user: { id: 'user-1', role: 'user' } };
        const res = makeRes();
        const next = jest.fn();

        await requireTeamScope(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: expect.stringContaining('Manager or admin') })
        );
        expect(next).not.toHaveBeenCalled();
    });

    test('returns 401 if req.user is null', async () => {
        const req = { user: null };
        const res = makeRes();
        const next = jest.fn();

        await requireTeamScope(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('calls next(err) when DB throws', async () => {
        const dbError = new Error('DB down');
        mockQuery.mockRejectedValueOnce(dbError);
        const req = { user: { id: 'mgr-1', role: 'manager' } };
        const res = makeRes();
        const next = jest.fn();
        await requireTeamScope(req, res, next);
        expect(next).toHaveBeenCalledWith(dbError);
    });
});

// ── canAccessUser ─────────────────────────────────────────────────────────────

describe('canAccessUser', () => {
    test('admin returns true without any DB call', async () => {
        const result = await canAccessUser({ id: 'admin-1', role: 'admin' }, 'any-user');
        expect(result).toBe(true);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test('self-access returns true without any DB call', async () => {
        const result = await canAccessUser({ id: 'user-1', role: 'user' }, 'user-1');
        expect(result).toBe(true);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test('manager whose team contains target user returns true', async () => {
        // Call 1: getManagerTeamId — teams query
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'team-x', name: 'X', manager_id: 'mgr-1' }] });
        // Call 2: app_user team check
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'target-user' }] });

        const result = await canAccessUser({ id: 'mgr-1', role: 'manager' }, 'target-user');
        expect(result).toBe(true);
    });

    test('manager whose team does NOT contain target user returns false', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'team-x', name: 'X', manager_id: 'mgr-1' }] });
        mockQuery.mockResolvedValueOnce({ rows: [] }); // user not in this team

        const result = await canAccessUser({ id: 'mgr-1', role: 'manager' }, 'other-user');
        expect(result).toBe(false);
    });

    test('manager with no team returns false', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] }); // no team found

        const result = await canAccessUser({ id: 'mgr-2', role: 'manager' }, 'target-user');
        expect(result).toBe(false);
    });

    test('non-manager non-admin non-self returns false without DB call', async () => {
        const result = await canAccessUser({ id: 'user-1', role: 'user' }, 'user-2');
        expect(result).toBe(false);
        expect(mockQuery).not.toHaveBeenCalled();
    });
});

// ── getTeamScopeFilter ────────────────────────────────────────────────────────

describe('getTeamScopeFilter', () => {
    test('admin returns empty clause with no DB call', async () => {
        const filter = await getTeamScopeFilter({ role: 'admin' });
        expect(filter).toEqual({ clause: '', params: [], nextIdx: 1, teamId: null });
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test('manager with team — default alias and startIdx', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'team-y', name: 'Y', manager_id: 'mgr-1' }] });
        const filter = await getTeamScopeFilter({ id: 'mgr-1', role: 'manager' });
        expect(filter).toEqual({
            clause: 'AND u.team_id = $1',
            params: ['team-y'],
            nextIdx: 2,
            teamId: 'team-y',
        });
    });

    test('manager with team — custom alias and startIdx', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'team-z', name: 'Z', manager_id: 'mgr-1' }] });
        const filter = await getTeamScopeFilter({ id: 'mgr-1', role: 'manager' }, 'au', 3);
        expect(filter).toEqual({
            clause: 'AND au.team_id = $3',
            params: ['team-z'],
            nextIdx: 4,
            teamId: 'team-z',
        });
    });

    test('manager with no team — returns AND 1=0 guard clause', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });
        const filter = await getTeamScopeFilter({ id: 'mgr-3', role: 'manager' });
        expect(filter).toEqual({ clause: 'AND 1=0', params: [], nextIdx: 1, teamId: null });
    });
});

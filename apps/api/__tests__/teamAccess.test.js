'use strict';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery }));

// Team-view access is permission-driven; stub the permission primitive so these
// tests exercise teamAccess's scope-resolution logic in isolation from the
// RBAC resolver / DB. teamAccess only consumes userHasAnyPermission.
jest.mock('../src/middleware/authMiddleware', () => ({ userHasAnyPermission: jest.fn() }));

const { userHasAnyPermission } = require('../src/middleware/authMiddleware');
const {
    requireTeamScope,
    canAccessUser,
    getTeamScopeFilter,
} = require('../src/middleware/teamAccess');

const ALL_TEAMS = 'qc.journeys.view_all_teams_progress';
const OWN_TEAM = 'qc.journeys.view_team_progress';

// Configure which grant(s) the actor holds, keyed by the permission list the
// caller passes (mirrors requireTeamScope's all-teams-then-own-team order).
function grant({ allTeams = false, ownTeam = false } = {}) {
    userHasAnyPermission.mockImplementation(async (_user, keys) => {
        if (keys.includes(ALL_TEAMS)) return allTeams;
        if (keys.includes(OWN_TEAM)) return ownTeam;
        return false;
    });
}

function makeRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

afterEach(() => jest.clearAllMocks());

// ── requireTeamScope ──────────────────────────────────────────────────────────

describe('requireTeamScope', () => {
    test('passes admin — sets req.teamId = null, no permission check', async () => {
        const req = { user: { id: 'admin-1', role: 'admin' } };
        const res = makeRes();
        const next = jest.fn();

        await requireTeamScope(req, res, next);

        expect(req.teamId).toBeNull();
        expect(next).toHaveBeenCalledWith();
        expect(res.status).not.toHaveBeenCalled();
        expect(userHasAnyPermission).not.toHaveBeenCalled();
    });

    test('all-teams grant — sets req.teamId = null (every team), no team lookup', async () => {
        grant({ allTeams: true });
        const req = { user: { id: 'pm-1', role: 'pm' } };
        const res = makeRes();
        const next = jest.fn();

        await requireTeamScope(req, res, next);

        expect(req.teamId).toBeNull();
        expect(next).toHaveBeenCalledWith();
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test('own-team grant, manages a team — scopes to managed team', async () => {
        grant({ ownTeam: true });
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'team-abc', name: 'A', manager_id: 'mgr-1' }] });
        const req = { user: { id: 'mgr-1', role: 'team_manager' } };
        const res = makeRes();
        const next = jest.fn();

        await requireTeamScope(req, res, next);

        expect(req.teamId).toBe('team-abc');
        expect(next).toHaveBeenCalledWith();
    });

    test('own-team grant, no managed team — falls back to the team they belong to', async () => {
        grant({ ownTeam: true });
        mockQuery.mockResolvedValueOnce({ rows: [] }); // getManagerTeamId → none
        mockQuery.mockResolvedValueOnce({ rows: [{ team_id: 'team-belong' }] }); // getUserTeamId
        const req = { user: { id: 'lead-1', role: 'tester' } };
        const res = makeRes();
        const next = jest.fn();

        await requireTeamScope(req, res, next);

        expect(req.teamId).toBe('team-belong');
        expect(next).toHaveBeenCalledWith();
    });

    test('own-team grant but no team at all — 403 not assigned', async () => {
        grant({ ownTeam: true });
        mockQuery.mockResolvedValueOnce({ rows: [] }); // no managed team
        mockQuery.mockResolvedValueOnce({ rows: [{ team_id: null }] }); // no membership
        const req = { user: { id: 'mgr-2', role: 'team_manager' } };
        const res = makeRes();
        const next = jest.fn();

        await requireTeamScope(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: expect.stringContaining('not assigned') })
        );
        expect(next).not.toHaveBeenCalled();
    });

    test('holds neither grant — 403 manager or admin required', async () => {
        grant({});
        const req = { user: { id: 'user-1', role: 'tester' } };
        const res = makeRes();
        const next = jest.fn();

        await requireTeamScope(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: expect.stringContaining('Manager or admin') })
        );
        expect(next).not.toHaveBeenCalled();
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test('returns 401 if req.user is null', async () => {
        const req = { user: null };
        const res = makeRes();
        const next = jest.fn();

        await requireTeamScope(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('calls next(err) when team lookup throws', async () => {
        grant({ ownTeam: true });
        const dbError = new Error('DB down');
        mockQuery.mockRejectedValueOnce(dbError);
        const req = { user: { id: 'mgr-1', role: 'team_manager' } };
        const res = makeRes();
        const next = jest.fn();

        await requireTeamScope(req, res, next);

        expect(next).toHaveBeenCalledWith(dbError);
    });
});

// ── canAccessUser ─────────────────────────────────────────────────────────────

describe('canAccessUser', () => {
    test('admin returns true without any DB or permission call', async () => {
        const result = await canAccessUser({ id: 'admin-1', role: 'admin' }, 'any-user');
        expect(result).toBe(true);
        expect(mockQuery).not.toHaveBeenCalled();
        expect(userHasAnyPermission).not.toHaveBeenCalled();
    });

    test('self-access returns true without any DB or permission call', async () => {
        const result = await canAccessUser({ id: 'user-1', role: 'tester' }, 'user-1');
        expect(result).toBe(true);
        expect(mockQuery).not.toHaveBeenCalled();
        expect(userHasAnyPermission).not.toHaveBeenCalled();
    });

    test('all-teams grant reaches any user — no team lookup', async () => {
        grant({ allTeams: true });
        const result = await canAccessUser({ id: 'pm-1', role: 'pm' }, 'target-user');
        expect(result).toBe(true);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test('own-team grant whose team contains target returns true', async () => {
        grant({ ownTeam: true });
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'team-x', name: 'X', manager_id: 'mgr-1' }] });
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'target-user' }] });

        const result = await canAccessUser({ id: 'mgr-1', role: 'team_manager' }, 'target-user');
        expect(result).toBe(true);
    });

    test('own-team grant whose team does NOT contain target returns false', async () => {
        grant({ ownTeam: true });
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'team-x', name: 'X', manager_id: 'mgr-1' }] });
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await canAccessUser({ id: 'mgr-1', role: 'team_manager' }, 'other-user');
        expect(result).toBe(false);
    });

    test('own-team grant with no team returns false', async () => {
        grant({ ownTeam: true });
        mockQuery.mockResolvedValueOnce({ rows: [] }); // no managed team
        mockQuery.mockResolvedValueOnce({ rows: [{ team_id: null }] }); // no membership

        const result = await canAccessUser({ id: 'mgr-2', role: 'team_manager' }, 'target-user');
        expect(result).toBe(false);
    });

    test('holds neither grant returns false without DB call', async () => {
        grant({});
        const result = await canAccessUser({ id: 'user-1', role: 'tester' }, 'user-2');
        expect(result).toBe(false);
        expect(mockQuery).not.toHaveBeenCalled();
    });
});

// ── getTeamScopeFilter (unchanged role-scoped helper) ─────────────────────────

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

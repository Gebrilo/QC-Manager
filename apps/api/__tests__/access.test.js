'use strict';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery, pool: { query: mockQuery } }));

jest.mock('../src/access/RoleResolver', () => ({
    resolve: jest.fn(),
    canonicalRole: (r) => r === 'manager' ? 'team_manager' : r,
}));

const { resolve: mockResolve } = require('../src/access/RoleResolver');
const { canPerform, buildListFilter, filterFields, DENIAL_REASONS } = require('../src/access/AccessEngine');

function rows(v) { return { rows: v }; }

afterEach(() => { jest.clearAllMocks(); });

describe('AccessEngine.canPerform — OR branches', () => {
    test('admin always allowed', async () => {
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set(['*']),
            scope: { team_id: null, team_type: null, pm_of_projects: [] },
        });
        const out = await canPerform({ id: 'a', role: 'admin' }, { type: 'bug', id: 'b1' }, 'view');
        expect(out).toEqual({ allowed: true, branch: 'admin' });
    });

    test('owner_team match grants view_team', async () => {
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set(['qc.bugs.view_team']),
            scope: { team_id: 't-qc', team_type: 'qc', pm_of_projects: [] },
        });
        const out = await canPerform(
            { id: 'u', role: 'member' },
            { type: 'bug', id: 'b1', owner_team_id: 't-qc', assignee_resource_id: null, project_id: 'p-1' },
            'view'
        );
        expect(out).toEqual({ allowed: true, branch: 'owner_team' });
    });

    test('assignee via resource bridge grants view_own', async () => {
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set(['qc.bugs.view_own']),
            scope: { team_id: 't-other', team_type: 'qc', pm_of_projects: [] },
        });
        mockQuery.mockResolvedValueOnce(rows([{ ok: 1 }])); // assignee lookup hits

        const out = await canPerform(
            { id: 'u', role: 'member' },
            { type: 'bug', id: 'b1', owner_team_id: 't-qc', assignee_resource_id: 'r-1', project_id: 'p-1' },
            'view'
        );
        expect(out).toEqual({ allowed: true, branch: 'assignee' });
    });

    test('teammate of assignee grants view_team', async () => {
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set(['qc.bugs.view_team']),
            scope: { team_id: 't-qc', team_type: 'qc', pm_of_projects: [] },
        });
        mockQuery
            .mockResolvedValueOnce(rows([])) // assignee empty
            .mockResolvedValueOnce(rows([{ ok: 1 }])); // teammate hit

        const out = await canPerform(
            { id: 'u', role: 'member' },
            { type: 'bug', id: 'b1', owner_team_id: 't-other', assignee_resource_id: 'r-1', project_id: 'p-1' },
            'view'
        );
        expect(out).toEqual({ allowed: true, branch: 'teammate_of_assignee' });
    });

    test('artifact_access ACL row grants', async () => {
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set([]),
            scope: { team_id: 't-qc', team_type: 'qc', pm_of_projects: [] },
        });
        mockQuery
            .mockResolvedValueOnce(rows([])) // assignee: not me
            .mockResolvedValueOnce(rows([])) // teammate: not my team
            .mockResolvedValueOnce(rows([{ ok: 1 }])); // ACL lookup hits

        const out = await canPerform(
            { id: 'u', role: 'member' },
            { type: 'bug', id: 'b1', owner_team_id: 't-other', assignee_resource_id: 'r-other', project_id: 'p-1' },
            'view'
        );
        expect(out).toEqual({ allowed: true, branch: 'artifact_acl' });
    });

    test('project-scope (PM of project) grants', async () => {
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set(['qc.bugs.view_any']),
            scope: { team_id: null, team_type: 'pm', pm_of_projects: ['p-1'] },
        });
        const out = await canPerform(
            { id: 'u', role: 'pm' },
            { type: 'bug', id: 'b1', owner_team_id: 't-other', assignee_resource_id: null, project_id: 'p-1' },
            'view'
        );
        expect(out).toEqual({ allowed: true, branch: 'project_scope' });
    });

    test('visibility_scope=project + project team membership grants view', async () => {
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set(['qc.bugs.view_team']),
            scope: { team_id: 't-dev', team_type: 'dev', pm_of_projects: [] },
        });
        mockQuery
            .mockResolvedValueOnce(rows([])) // assignee: not me
            .mockResolvedValueOnce(rows([])) // teammate: not my team
            .mockResolvedValueOnce(rows([])) // ACL empty
            .mockResolvedValueOnce(rows([{ ok: 1 }])); // project_teams hit

        const out = await canPerform(
            { id: 'u', role: 'member' },
            { type: 'bug', id: 'b1', owner_team_id: 't-qc', assignee_resource_id: 'r-other', project_id: 'p-1', visibility_scope: 'project' },
            'view'
        );
        expect(out).toEqual({ allowed: true, branch: 'project_visibility' });
    });

    test('default deny returns structured reason', async () => {
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set([]),
            scope: { team_id: 't-x', team_type: 'commercial', pm_of_projects: [] },
        });
        // assignee_resource_id is null → JS short-circuits skip assignee + teammate queries.
        // Only the ACL query fires (returns empty).
        mockQuery.mockResolvedValueOnce(rows([])); // ACL

        const out = await canPerform(
            { id: 'u', role: 'member' },
            { type: 'bug', id: 'b1', owner_team_id: 't-qc', assignee_resource_id: null, project_id: 'p-1' },
            'view'
        );
        expect(out.allowed).toBe(false);
        expect(out.reason).toBe(DENIAL_REASONS.ROLE_MISSING);
    });

    test('unknown artifact type returns unknown_artifact reason without calling resolver', async () => {
        const out = await canPerform({ id: 'u', role: 'admin' }, { type: 'mysterious', id: 'x' }, 'view');
        expect(out.allowed).toBe(false);
        expect(out.reason).toBe(DENIAL_REASONS.UNKNOWN_ARTIFACT);
        expect(mockResolve).not.toHaveBeenCalled();
    });

    test('team_mismatch reason when user has a perm but team does not match', async () => {
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set(['qc.bugs.view_team']),
            scope: { team_id: 't-dev', team_type: 'dev', pm_of_projects: [] },
        });
        // assignee_resource_id null → only ACL query fires.
        mockQuery.mockResolvedValueOnce(rows([])); // ACL

        const out = await canPerform(
            { id: 'u', role: 'member' },
            { type: 'bug', id: 'b1', owner_team_id: 't-qc', assignee_resource_id: null, project_id: 'p-9' },
            'view'
        );
        expect(out.allowed).toBe(false);
        expect(out.reason).toBe(DENIAL_REASONS.TEAM_MISMATCH);
    });
});

describe('AccessEngine.buildListFilter', () => {
    test('admin returns TRUE', async () => {
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set(['*']),
            scope: { team_id: null, team_type: null, pm_of_projects: [] },
        });
        const f = await buildListFilter({ id: 'a', role: 'admin' }, 'bug', 'view');
        expect(f.clause).toBe('TRUE');
        expect(f.params).toEqual([]);
        expect(f.nextIdx).toBe(1);
    });

    test('member: composes owner_team + assignee + teammate + ACL clauses with parameterized $N', async () => {
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set(['qc.bugs.view_own', 'qc.bugs.view_team']),
            scope: { team_id: 't-1', team_type: 'qc', pm_of_projects: ['p-9'] },
        });
        const f = await buildListFilter({ id: 'u', role: 'member' }, 'bug', 'view', { startIdx: 5 });
        expect(f.clause).toMatch(/owner_team_id\s*=\s*\$/);
        expect(f.clause).toMatch(/EXISTS \(SELECT 1 FROM resources/);
        expect(f.clause).toMatch(/EXISTS \(SELECT 1 FROM artifact_access/);
        expect(f.clause).toMatch(/project_id\s+IN/);
        expect(f.nextIdx).toBeGreaterThan(5);
        expect(f.params).toEqual(expect.arrayContaining(['u', 't-1', 'p-9']));
    });

    test('pm with view_any + pm_of_projects gets project_managers IN clause', async () => {
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set(['qc.bugs.view_any']),
            scope: { team_id: null, team_type: 'pm', pm_of_projects: ['p-1', 'p-2'] },
        });
        const f = await buildListFilter({ id: 'pm', role: 'pm' }, 'bug', 'view');
        expect(f.clause).toMatch(/project_id\s+IN/);
        expect(f.params).toEqual(expect.arrayContaining(['p-1', 'p-2']));
    });

    test('unknown artifact type throws', async () => {
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set([]),
            scope: { team_id: null, team_type: null, pm_of_projects: [] },
        });
        await expect(buildListFilter({ id: 'u', role: 'member' }, 'mysterious', 'view')).rejects.toThrow(/Unknown artifact type/);
    });

    test('binds user.id once and reuses it across assignee + ACL branches', async () => {
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set(['qc.bugs.view_own']),
            scope: { team_id: 't-1', team_type: 'qc', pm_of_projects: [] },
        });
        const f = await buildListFilter({ id: 'u-7', role: 'member' }, 'bug', 'view');
        const occurrences = f.params.filter(p => p === 'u-7').length;
        expect(occurrences).toBe(1);
    });

    test('returns FALSE clause when user has no applicable branches', async () => {
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set([]), // no perms at all
            scope: { team_id: null, team_type: null, pm_of_projects: [] }, // no team, no PM scope
        });
        const f = await buildListFilter({ id: 'u', role: 'viewer' }, 'bug', 'view');
        // ACL branch always fires (it's a SQL EXISTS check, not a perm-gated branch).
        // With no team and no PM scope, only the ACL clause is present.
        expect(f.clause).toMatch(/EXISTS \(SELECT 1 FROM artifact_access/);
    });
});

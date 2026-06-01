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
            .mockResolvedValueOnce(rows([])) // assignee empty
            .mockResolvedValueOnce(rows([])) // teammate empty
            .mockResolvedValueOnce(rows([{ ok: 1 }])); // ACL lookup hits

        const out = await canPerform(
            { id: 'u', role: 'member' },
            { type: 'bug', id: 'b1', owner_team_id: 't-other', assignee_resource_id: null, project_id: 'p-1' },
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
            .mockResolvedValueOnce(rows([])) // assignee empty
            .mockResolvedValueOnce(rows([])) // teammate empty
            .mockResolvedValueOnce(rows([])) // ACL empty
            .mockResolvedValueOnce(rows([{ ok: 1 }])); // project_teams hit

        const out = await canPerform(
            { id: 'u', role: 'member' },
            { type: 'bug', id: 'b1', owner_team_id: 't-qc', assignee_resource_id: null, project_id: 'p-1', visibility_scope: 'project' },
            'view'
        );
        expect(out).toEqual({ allowed: true, branch: 'project_visibility' });
    });

    test('default deny returns structured reason', async () => {
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set([]),
            scope: { team_id: 't-x', team_type: 'commercial', pm_of_projects: [] },
        });
        mockQuery
            .mockResolvedValueOnce(rows([])) // assignee
            .mockResolvedValueOnce(rows([])) // teammate
            .mockResolvedValueOnce(rows([])); // ACL

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
        mockQuery
            .mockResolvedValueOnce(rows([])) // assignee
            .mockResolvedValueOnce(rows([])) // teammate
            .mockResolvedValueOnce(rows([])); // ACL

        const out = await canPerform(
            { id: 'u', role: 'member' },
            { type: 'bug', id: 'b1', owner_team_id: 't-qc', assignee_resource_id: null, project_id: 'p-9' },
            'view'
        );
        expect(out.allowed).toBe(false);
        expect(out.reason).toBe(DENIAL_REASONS.TEAM_MISMATCH);
    });
});

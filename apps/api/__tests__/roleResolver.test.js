'use strict';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery, pool: { query: mockQuery } }));

const { resolve } = require('../src/access/RoleResolver');

function rows(value) { return { rows: value }; }

afterEach(() => jest.clearAllMocks());

describe('RoleResolver.resolve', () => {
    test('admin gets wildcard set + empty scope', async () => {
        mockQuery
            .mockResolvedValueOnce(rows([])) // role_permissions
            .mockResolvedValueOnce(rows([])) // user_permissions
            .mockResolvedValueOnce(rows([{ team_id: null, team_type: null }])) // team join
            .mockResolvedValueOnce(rows([])); // project_managers

        const out = await resolve({ id: 'u1', role: 'admin' });
        expect(out.effectivePermissions.has('*')).toBe(true);
        expect(out.scope).toEqual({ team_id: null, team_type: null, pm_of_projects: [] });
    });

    test('member without role_permissions row falls back to catalog defaults', async () => {
        mockQuery
            .mockResolvedValueOnce(rows([])) // role_permissions empty
            .mockResolvedValueOnce(rows([])) // user_permissions empty
            .mockResolvedValueOnce(rows([{ team_id: 't-1', team_type: 'qc' }]))
            .mockResolvedValueOnce(rows([]));

        const out = await resolve({ id: 'u2', role: 'member' });
        expect(out.effectivePermissions.has('qc.tasks.view_own')).toBe(true);
        expect(out.effectivePermissions.has('qc.testcases.view_steps')).toBe(true);
        expect(out.scope.team_type).toBe('qc');
    });

    test('role_permissions table is canonical when populated', async () => {
        mockQuery
            .mockResolvedValueOnce(rows([{ permission_key: 'qc.bugs.triage' }]))
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([{ team_id: 't-1', team_type: 'qc' }]))
            .mockResolvedValueOnce(rows([]));

        const out = await resolve({ id: 'u3', role: 'team_manager' });
        expect(out.effectivePermissions.has('qc.bugs.triage')).toBe(true);
        expect(out.effectivePermissions.has('qc.dashboard.view')).toBe(false);
    });

    test('user_permissions allow adds and deny strips', async () => {
        mockQuery
            .mockResolvedValueOnce(rows([{ permission_key: 'qc.tasks.view_own' }]))
            .mockResolvedValueOnce(rows([
                { permission_key: 'qc.bugs.triage', granted: true },
                { permission_key: 'qc.tasks.view_own', granted: false },
            ]))
            .mockResolvedValueOnce(rows([{ team_id: 't-1', team_type: 'qc' }]))
            .mockResolvedValueOnce(rows([]));

        const out = await resolve({ id: 'u4', role: 'member' });
        expect(out.effectivePermissions.has('qc.bugs.triage')).toBe(true);
        expect(out.effectivePermissions.has('qc.tasks.view_own')).toBe(false);
    });

    test('manager role aliases team_manager', async () => {
        mockQuery
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([{ team_id: 't-1', team_type: 'qc' }]))
            .mockResolvedValueOnce(rows([]));

        const out = await resolve({ id: 'u5', role: 'manager' });
        expect(out.effectivePermissions.has('qc.bugs.triage')).toBe(true);
    });

    test('pm_of_projects populated from project_managers join', async () => {
        mockQuery
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([{ team_id: 't-1', team_type: 'pm' }]))
            .mockResolvedValueOnce(rows([{ project_id: 'p-A' }, { project_id: 'p-B' }]));

        const out = await resolve({ id: 'u6', role: 'pm' });
        expect(out.scope.pm_of_projects).toEqual(['p-A', 'p-B']);
    });

    test('canonicalises role BEFORE the role_permissions DB lookup', async () => {
        mockQuery
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([{ team_id: null, team_type: null }]))
            .mockResolvedValueOnce(rows([]));

        await resolve({ id: 'u', role: 'manager' });
        expect(mockQuery).toHaveBeenNthCalledWith(
            1,
            'SELECT permission_key FROM role_permissions WHERE role_identifier = $1',
            ['team_manager']
        );
    });

    test('contributor (not in BUILT_IN_ROLE_PERMISSION_DEFAULTS) still resolves via catalog', async () => {
        // Defense against silent lockout: a role that exists in ROLES but not in
        // the pre-baked defaults map must still get its catalog permissions via
        // collectRolePermissions, never an empty Set.
        mockQuery
            .mockResolvedValueOnce(rows([])) // role_permissions empty
            .mockResolvedValueOnce(rows([])) // user_permissions empty
            .mockResolvedValueOnce(rows([{ team_id: null, team_type: null }]))
            .mockResolvedValueOnce(rows([]));

        const out = await resolve({ id: 'u', role: 'contributor' });
        expect(out.effectivePermissions.has('qc.tasks.view')).toBe(true);
        expect(out.effectivePermissions.has('qc.tasks.edit')).toBe(true);
        expect(out.effectivePermissions.has('qc.mywork.dashboard.view')).toBe(true);
    });

    test('memoizes on req when supplied', async () => {
        mockQuery
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([{ team_id: 't-1', team_type: 'qc' }]))
            .mockResolvedValueOnce(rows([]));

        const req = { user: { id: 'u7', role: 'member' } };
        const first = await resolve(req.user, req);
        const second = await resolve(req.user, req);
        expect(first).toBe(second);
        expect(mockQuery).toHaveBeenCalledTimes(4); // not 8
    });
});

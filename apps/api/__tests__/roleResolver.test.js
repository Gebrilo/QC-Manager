'use strict';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery, pool: { query: mockQuery } }));

const { resolve } = require('../src/access/RoleResolver');

function rows(value) { return { rows: value }; }

afterEach(() => jest.clearAllMocks());

describe('RoleResolver.resolve', () => {
    test('admin gets wildcard set + empty scope', async () => {
        mockQuery
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([{ scope_key: 'active_only' }]))
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([{ team_id: null, team_type: null }]))
            .mockResolvedValueOnce(rows([]));

        const out = await resolve({ id: 'u1', role: 'admin' });
        expect(out.effectivePermissions.has('*')).toBe(true);
        expect(out.scope).toEqual({ team_id: null, team_type: null, pm_of_projects: [] });
    });

    test('tester without role_permissions row falls back to catalog defaults', async () => {
        mockQuery
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([{ scope_key: 'active_only' }]))
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([{ team_id: 't-1', team_type: 'qc' }]))
            .mockResolvedValueOnce(rows([]));

        const out = await resolve({ id: 'u2', role: 'tester' });
        expect(out.effectivePermissions.has('qc.tasks.view')).toBe(true);
        expect(out.effectivePermissions.has('qc.tasks.delete')).toBe(true);
        expect(out.effectivePermissions.has('qc.testcases.view_steps')).toBe(true);
        expect(out.scope.team_type).toBe('qc');
    });

    test('role_permissions table is canonical when populated', async () => {
        mockQuery
            .mockResolvedValueOnce(rows([{ permission_key: 'qc.bugs.edit_team' }]))
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([{ scope_key: 'team' }, { scope_key: 'active_only' }]))
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([{ team_id: 't-1', team_type: 'qc' }]))
            .mockResolvedValueOnce(rows([]));

        const out = await resolve({ id: 'u3', role: 'team_manager' });
        expect(out.effectivePermissions.has('qc.bugs.edit_team')).toBe(true);
        expect(out.effectivePermissions.has('qc.dashboard.view')).toBe(false);
    });

    test('user_permissions allow adds and deny strips', async () => {
        mockQuery
            .mockResolvedValueOnce(rows([{ permission_key: 'qc.tasks.view' }]))
            .mockResolvedValueOnce(rows([
                { permission_key: 'qc.governance.manage_gates', granted: true },
                { permission_key: 'qc.tasks.view', granted: false },
            ]))
            .mockResolvedValueOnce(rows([{ scope_key: 'active_only' }]))
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([{ team_id: 't-1', team_type: 'qc' }]))
            .mockResolvedValueOnce(rows([]));

        const out = await resolve({ id: 'u4', role: 'tester' });
        expect(out.effectivePermissions.has('qc.governance.manage_gates')).toBe(true);
        expect(out.effectivePermissions.has('qc.tasks.view')).toBe(false);
    });

    test('legacy manager role canonicalizes to team_manager', async () => {
        mockQuery
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([{ scope_key: 'team' }, { scope_key: 'active_only' }]))
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([{ team_id: 't-1', team_type: 'qc' }]))
            .mockResolvedValueOnce(rows([]));

        const out = await resolve({ id: 'u5', role: 'manager' });
        expect(out.effectivePermissions.has('qc.bugs.edit_team')).toBe(true);
    });

    test('pm_of_projects populated from project_managers join', async () => {
        mockQuery
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([{ scope_key: 'active_only' }]))
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
            .mockResolvedValueOnce(rows([{ scope_key: 'team' }, { scope_key: 'active_only' }]))
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

    test('contributor still resolves via catalog when role_permissions is empty', async () => {
        mockQuery
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([{ team_id: null, team_type: null }]))
            .mockResolvedValueOnce(rows([{ '?column?': 1 }]))
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
            .mockResolvedValueOnce(rows([{ scope_key: 'active_only' }]))
            .mockResolvedValueOnce(rows([]))
            .mockResolvedValueOnce(rows([{ team_id: 't-1', team_type: 'qc' }]))
            .mockResolvedValueOnce(rows([]));

        const req = { user: { id: 'u7', role: 'tester' } };
        const first = await resolve(req.user, req);
        const second = await resolve(req.user, req);
        expect(first).toBe(second);
        expect(mockQuery).toHaveBeenCalledTimes(6);
    });
});

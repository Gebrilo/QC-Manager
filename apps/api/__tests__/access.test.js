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

    test('bug change_severity is granted only on same-team bugs', async () => {
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set(['qc.bugs.change_severity']),
            scope: { team_id: 't-qc', team_type: 'qc', pm_of_projects: [] },
        });
        const allowed = await canPerform(
            { id: 'u', role: 'tester' },
            { type: 'bug', id: 'b1', owner_team_id: 't-qc', project_id: 'p-1' },
            'change_severity'
        );
        expect(allowed).toEqual({ allowed: true, branch: 'bug_severity_team' });

        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set(['qc.bugs.change_severity']),
            scope: { team_id: 't-qc', team_type: 'qc', pm_of_projects: [] },
        });
        const denied = await canPerform(
            { id: 'u', role: 'tester' },
            { type: 'bug', id: 'b2', owner_team_id: 't-other', project_id: 'p-1' },
            'change_severity'
        );
        expect(denied).toEqual({ allowed: false, reason: DENIAL_REASONS.TEAM_MISMATCH });
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

    test('project-scope (PM of project) grants via qc.reports.view_project', async () => {
        // verb_any short-circuits earlier now, so project_scope is reachable
        // only for users who have qc.reports.view_project but lack the
        // verb_any grant on the specific artifact type.
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set(['qc.reports.view_project']),
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

    test('view_any allows regardless of ownership / team match', async () => {
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set(['qc.tasks.view_any']),
            scope: { team_id: 't-x', team_type: 'qc', pm_of_projects: [] },
        });
        const out = await canPerform(
            { id: 'tester-1', role: 'tester' },
            { type: 'task', id: 'task-99', owner_team_id: 't-other', assignee_resource_id: null, project_id: 'p-other' },
            'view'
        );
        expect(out).toEqual({ allowed: true, branch: 'verb_any' });
    });

    test('bare verb permits view of an owned item even without _own scope', async () => {
        // contributor catalog has only qc.tasks.view (no view_own).
        // Single-item GET should still let them load tasks they created
        // (current legacy behavior — without this fallback the engine
        // would 403 the same task they could see in the list).
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set(['qc.tasks.view']),
            scope: { team_id: 't-x', team_type: 'qc', pm_of_projects: [] },
        });
        const out = await canPerform(
            { id: 'u-7', role: 'contributor' },
            { type: 'task', id: 'task-1', owner_team_id: 't-other', owner_user_id: 'u-7', assignee_resource_id: null, project_id: 'p-x' },
            'view'
        );
        expect(out.allowed).toBe(true);
        expect(out.branch).toBe('owner_user');
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

    test('view_any short-circuits to TRUE (see-all regardless of team/own/PM scope)', async () => {
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set(['qc.bugs.view_any']),
            scope: { team_id: 't-x', team_type: 'pm', pm_of_projects: ['p-1', 'p-2'] },
        });
        const f = await buildListFilter({ id: 'pm', role: 'pm' }, 'bug', 'view');
        expect(f.clause).toBe('TRUE');
        expect(f.params).toEqual([]);
    });

    test('pm with view_team + pm_of_projects gets project_id IN clause', async () => {
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set(['qc.bugs.view_team']),
            scope: { team_id: null, team_type: 'pm', pm_of_projects: ['p-1', 'p-2'] },
        });
        const f = await buildListFilter({ id: 'pm', role: 'pm' }, 'bug', 'view');
        expect(f.clause).toMatch(/project_id\s+IN/);
        expect(f.params).toEqual(expect.arrayContaining(['p-1', 'p-2']));
    });

    test('bare verb (qc.tasks.view) without scope variants emits user/assignee branches (legacy own fallback)', async () => {
        // catalog grants some built-in roles only the unscoped verb (e.g.
        // contributor: qc.tasks.view). The legacy route filtered them by
        // resource bridge → "see assigned". Engine treats the bare verb
        // as an implicit _own scope so wiring the engine into tasks.js
        // doesn't regress those roles to FALSE / zero rows.
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set(['qc.tasks.view']),
            scope: { team_id: null, team_type: 'qc', pm_of_projects: [] },
        });
        const f = await buildListFilter({ id: 'u-9', role: 'contributor' }, 'task', 'view', {
            tableAlias: 't',
            assigneeResourceExprs: ['t.resource1_id', 't.resource2_id'],
            userExprs: ['t.created_by_user_id'],
        });
        expect(f.clause).toMatch(/t\.created_by_user_id\s*=\s*\$/);
        expect(f.clause).toMatch(/EXISTS \(SELECT 1 FROM resources r WHERE r\.user_id = \$/);
    });

    test('task junction (ADR 0009): own + teammate branches resolve every assignee via task_resource_assignment EXISTS', async () => {
        // #192 — a 3rd+ Secondary Resource is not in the two cached slots, so
        // access must resolve through the junction. When opts.assigneeJunction
        // is set the assignee branches query task_resource_assignment instead of
        // the fixed resource1_id/resource2_id columns.
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set(['qc.tasks.view_own', 'qc.tasks.view_team']),
            scope: { team_id: 't-1', team_type: 'qc', pm_of_projects: [] },
        });
        const f = await buildListFilter({ id: 'u-1', role: 'member' }, 'task', 'view', {
            tableAlias: 'v',
            assigneeJunction: { table: 'task_resource_assignment', idExpr: 'v.id' },
            userExprs: ['v.created_by_user_id'],
        });
        // own-scope assignee branch: any assignee (primary or Nth secondary)
        expect(f.clause).toMatch(
            /EXISTS \(SELECT 1 FROM task_resource_assignment tra JOIN resources r ON r\.id = tra\.resource_id WHERE tra\.task_id = v\.id AND r\.user_id = \$\d+::uuid AND r\.deleted_at IS NULL\)/
        );
        // teammate-of-assignee branch: same junction, team-scoped
        expect(f.clause).toMatch(
            /EXISTS \(SELECT 1 FROM task_resource_assignment tra JOIN resources r2 ON r2\.id = tra\.resource_id JOIN app_user au ON au\.id = r2\.user_id WHERE tra\.task_id = v\.id AND au\.team_id = \$\d+::uuid AND r2\.deleted_at IS NULL\)/
        );
        // no longer references the two fixed slots
        expect(f.clause).not.toMatch(/resource1_id|resource2_id/);
    });

    test('unknown artifact type throws', async () => {
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set([]),
            scope: { team_id: null, team_type: null, pm_of_projects: [] },
        });
        await expect(buildListFilter({ id: 'u', role: 'member' }, 'mysterious', 'view')).rejects.toThrow(/Unknown artifact type/);
    });

    test('binds user.id separately for assignee (uuid) and ACL (varchar) branches', async () => {
        // artifact_access.subject_id is varchar while user-id columns
        // (created_by_user_id / assigned_to-on-uuid-tables / etc.) are uuid.
        // Sharing one $N across both made pg infer it as uuid, then
        // aa.subject_id = $N (uuid) failed with "varchar = uuid". Each branch
        // must get its own bind so its type is inferred from one column only.
        mockResolve.mockReset();
        mockResolve.mockResolvedValueOnce({
            effectivePermissions: new Set(['qc.bugs.view_own']),
            scope: { team_id: 't-1', team_type: 'qc', pm_of_projects: [] },
        });
        const f = await buildListFilter({ id: 'u-7', role: 'member' }, 'bug', 'view');
        const occurrences = f.params.filter(p => p === 'u-7').length;
        expect(occurrences).toBe(2);

        const userBranchMatch = f.clause.match(/bugs\.created_by_user_id\s*=\s*\$(\d+)/);
        const aclMatch = f.clause.match(/aa\.subject_id\s*=\s*\$(\d+)/);
        expect(userBranchMatch).not.toBeNull();
        expect(aclMatch).not.toBeNull();
        const assigneeBindNum = Number(userBranchMatch[1]);
        const aclBindNum = Number(aclMatch[1]);
        expect(aclBindNum).not.toBe(assigneeBindNum);
        expect(f.params[assigneeBindNum - 1]).toBe('u-7');
        expect(f.params[aclBindNum - 1]).toBe('u-7');
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

describe('AccessEngine.filterFields', () => {
    test('strips test_case steps + expected_results when user lacks view_steps', () => {
        const out = filterFields(
            { effectivePermissions: new Set([]) },
            'test_case',
            { id: 'tc1', title: 'x', steps: 'do thing', expected_results: 'pass' }
        );
        expect(out.steps).toBeUndefined();
        expect(out.expected_results).toBeUndefined();
        expect(out.title).toBe('x');
    });

    test('keeps test_case steps when user has view_steps', () => {
        const out = filterFields(
            { effectivePermissions: new Set(['qc.testcases.view_steps']) },
            'test_case',
            { id: 'tc1', title: 'x', steps: 'do thing', expected_results: 'pass' }
        );
        expect(out.steps).toBe('do thing');
        expect(out.expected_results).toBe('pass');
    });

    test('keeps test_case body fields when user has the * wildcard (admin)', () => {
        // Regression: admins resolve to effectivePermissions = {'*'} (catalog
        // role admin → permissions:['*']). filterFields must honor the wildcard
        // the same way canPerform/route checks do, otherwise admins lose
        // description/preconditions/test_steps/expected_result on every GET while
        // they briefly reappear after a status PATCH (which skips decorateRows).
        const out = filterFields(
            { effectivePermissions: new Set(['*']) },
            'test_case',
            {
                id: 'tc1',
                title: 'x',
                description: 'desc',
                preconditions: 'pre',
                test_steps: 'do thing',
                expected_result: 'pass',
            }
        );
        expect(out.description).toBe('desc');
        expect(out.preconditions).toBe('pre');
        expect(out.test_steps).toBe('do thing');
        expect(out.expected_result).toBe('pass');
    });

    test('non-test_case artifacts pass through unchanged', () => {
        const row = { id: 'b1', title: 'bug', severity: 'Major impact' };
        expect(filterFields({ effectivePermissions: new Set() }, 'bug', row)).toEqual(row);
    });

    test('returns a NEW object rather than mutating the input row', () => {
        const row = { id: 'tc1', title: 'x', steps: 'secret', expected_results: 'p' };
        const out = filterFields({ effectivePermissions: new Set() }, 'test_case', row);
        expect(out).not.toBe(row);
        expect(row.steps).toBe('secret'); // input unmutated
        expect(out.steps).toBeUndefined();
    });
});

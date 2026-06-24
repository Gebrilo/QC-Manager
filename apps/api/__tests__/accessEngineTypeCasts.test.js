'use strict';

const mockQuery = jest.fn();
jest.mock('../src/config/db', () => ({ query: mockQuery, pool: { query: mockQuery } }));

jest.mock('../src/access/RoleResolver', () => ({
    resolve: jest.fn(),
    canonicalRole: (r) => r === 'manager' ? 'team_manager' : r,
}));

const { resolve: mockResolve } = require('../src/access/RoleResolver');
const { buildListFilter } = require('../src/access/AccessEngine');

afterEach(() => { jest.clearAllMocks(); });

function resolveWith(perms, scope = {}) {
    mockResolve.mockResolvedValueOnce({
        effectivePermissions: new Set(perms),
        scope: {
            team_id: scope.team_id || null,
            team_type: scope.team_type || null,
            pm_of_projects: scope.pm_of_projects || [],
        },
    });
}

describe('AccessEngine.buildListFilter — explicit type casts (issue #120 regression)', () => {
    test('viewer with no ACL rows: every $N comparing UUID columns has ::uuid', async () => {
        resolveWith(['qc.bugs.view_team'], { team_id: 't-1', team_type: 'qc' });
        const f = await buildListFilter({ id: 'u-1', role: 'viewer' }, 'bug', 'view');
        expect(f.clause).toMatch(/owner_team_id\s*=\s*\$\d+::uuid/);
        expect(f.clause).not.toMatch(/owner_team_id\s*=\s*\$\d+(?!::uuid)/);
    });

    test('member with view_own: userBind gets ::uuid in both userExpr and assignee branches', async () => {
        resolveWith(['qc.bugs.view_own'], { team_id: null, team_type: null });
        const f = await buildListFilter({ id: 'u-2', role: 'member' }, 'bug', 'view');
        const userExprCasts = f.clause.match(/created_by_user_id\s*=\s*\$(\d+)::uuid/g);
        expect(userExprCasts).not.toBeNull();
        const resourceJoinCasts = f.clause.match(/r\.user_id\s*=\s*\$(\d+)::uuid/g);
        expect(resourceJoinCasts).not.toBeNull();
    });

    test('ACL branch: all parameters comparing against varchar columns get ::text', async () => {
        resolveWith([], { team_id: 't-1', team_type: 'qc' });
        const f = await buildListFilter({ id: 'u-3', role: 'member' }, 'bug', 'view');
        expect(f.clause).toMatch(/aa\.artifact_type\s*=\s*\$\d+::text/);
        expect(f.clause).toMatch(/aa\.action\s*=\s*\$\d+::text/);
        expect(f.clause).toMatch(/aa\.subject_id\s*=\s*\$\d+::text/);
    });

    test('ACL branch with no team: teamForAcl is literal NULL (no bind, no cast)', async () => {
        resolveWith([], { team_id: null, team_type: null });
        const f = await buildListFilter({ id: 'u-4', role: 'member' }, 'bug', 'view');
        expect(f.clause).toMatch(/aa\.subject_type='team' AND aa\.subject_id=NULL/);
    });

    test('pm_of_projects branch: each placeholder gets ::uuid for IN clause', async () => {
        resolveWith(['qc.bugs.view'], { team_id: null, team_type: 'pm', pm_of_projects: ['p-1', 'p-2'] });
        const f = await buildListFilter({ id: 'u-5', role: 'pm' }, 'bug', 'view');
        const inCasts = f.clause.match(/\$\d+::uuid/g);
        expect(inCasts.length).toBeGreaterThanOrEqual(2);
        expect(f.params).toContain('p-1');
        expect(f.params).toContain('p-2');
    });

    test('visibility_scope branch: team_id gets ::uuid in project_teams EXISTS', async () => {
        resolveWith(['qc.bugs.view_team'], { team_id: 't-2', team_type: 'qc' });
        const f = await buildListFilter({ id: 'u-6', role: 'viewer' }, 'bug', 'view');
        expect(f.clause).toMatch(/pt\.team_id\s*=\s*\$\d+::uuid/);
    });

    test('teammate branch: au.team_id gets ::uuid', async () => {
        resolveWith(['qc.bugs.view_team'], { team_id: 't-3', team_type: 'qc' });
        const f = await buildListFilter({ id: 'u-7', role: 'member' }, 'bug', 'view');
        expect(f.clause).toMatch(/au\.team_id\s*=\s*\$\d+::uuid/);
    });

    test('combined scenario: user with view_team + pm_of_projects has casts on all branches', async () => {
        resolveWith(
            ['qc.user_stories.view', 'qc.user_stories.view_team'],
            { team_id: 't-combined', team_type: 'qc', pm_of_projects: ['proj-a'] }
        );
        const f = await buildListFilter(
            { id: 'u-combined', role: 'member' },
            'user_story',
            'view',
            { tableAlias: 'us', assigneeResourceExprs: [], userExprs: ['us.created_by_user_id'] }
        );
        expect(f.clause).toMatch(/us\.owner_team_id\s*=\s*\$\d+::uuid/);
        expect(f.clause).toMatch(/us\.created_by_user_id\s*=\s*\$\d+::uuid/);
        expect(f.clause).toMatch(/aa\.artifact_type\s*=\s*\$\d+::text/);
        expect(f.clause).toMatch(/project_id\s+IN\s*\(\$\d+::uuid\)/);
    });

    test('no untyped $N remains in generated clause (all have explicit cast)', async () => {
        resolveWith(
            ['qc.bugs.view', 'qc.bugs.view_own', 'qc.bugs.view_team'],
            { team_id: 't-full', team_type: 'qc', pm_of_projects: ['proj-x'] }
        );
        const f = await buildListFilter({ id: 'u-full', role: 'member' }, 'bug', 'view');
        const allParams = [...f.clause.matchAll(/\$\d+/g)];
        const untyped = allParams.filter(m => !f.clause.slice(m.index + m[0].length).startsWith('::'));
        expect(untyped).toEqual([]);
    });
});

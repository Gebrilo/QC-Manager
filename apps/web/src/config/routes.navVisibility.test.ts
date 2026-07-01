import { describe, it, expect } from 'vitest';
import {
    getVisibleNavSections,
    canSeeRoutePath,
    routeAllowsScope,
    routeAllowsPermission,
    type NavigationNode,
} from './routes';

const { PERMISSIONS, SCOPES, BUILT_IN_ROLE_PERMISSION_DEFAULTS, collectRoleScopes } =
    require('../../../shared/rbac/catalog.ts');

const ACTIVE_ONLY = SCOPES.ACTIVE_ONLY.key;
const PREPARATION_ONLY = SCOPES.PREPARATION_ONLY.key;

function collectPaths(nodes: NavigationNode[]): string[] {
    const out: string[] = [];
    for (const node of nodes) {
        if (node.path) out.push(node.path);
        if (node.children) out.push(...collectPaths(node.children));
    }
    return out;
}

interface Ctx {
    role: string;
    isAdmin: boolean;
    hasPermission: (key: string) => boolean;
    effectiveScopes: string[];
}

/**
 * Build a `NavVisibilityContext` for a built-in role using its catalog
 * defaults (`*` wildcard for admin, role's flat permission set for the rest,
 * and the role's `collectRoleScopes` from the catalog). The admin `*` matches
 * any permission key; admin scopes are empty (admin is gated by the `active`
 * flag and the `*` permission, never by a scope row).
 */
function contextForBuiltInRole(role: string): Ctx {
    const isAdmin = role === 'admin';
    const permissions = BUILT_IN_ROLE_PERMISSION_DEFAULTS[role] || [];
    const permSet = new Set(permissions);
    return {
        role,
        isAdmin,
        hasPermission: (key: string) => isAdmin || permSet.has(key),
        // Admin is special: the API seeds zero role_scopes for admin (admin is
        // gated by `*` + the `active` flag, not by scope). The client treats
        // admin as scope-unrestricted; `hasScope` in AuthProvider mirrors that.
        effectiveScopes: isAdmin ? [] : collectRoleScopes(role, new Set()),
    };
}

function visiblePathsFor(role: string): string[] {
    const sections = getVisibleNavSections(contextForBuiltInRole(role));
    return sections.flatMap(section => collectPaths(section.children));
}

function visibleSectionsFor(role: string): string[] {
    return getVisibleNavSections(contextForBuiltInRole(role)).map(s => s.key);
}

describe('sidebar nav visibility — Resources for PM (regression)', () => {
    // Regression: pm has qc.resources.view in role_permissions, but under the
    // old design the "Manage" section was role-gated to ['team_manager','admin']
    // so the link never rendered for PMs. Issue #270 removed the section
    // roles; this test guards that the regression doesn't re-appear.
    it('shows /team/resources to a pm who has qc.resources.view', () => {
        expect(visiblePathsFor('pm')).toContain('/team/resources');
    });

    it('still shows /team/resources to team_manager and admin', () => {
        expect(visiblePathsFor('team_manager')).toContain('/team/resources');
        expect(visiblePathsFor('admin')).toContain('/team/resources');
    });
});

describe('per-role sidebar smoke test (ADR 0010 / issue #270 cutover)', () => {
    // For each built-in role, with its catalog defaults, the sidebar must
    // surface the routes the API would admit. Cosmetic drift on the rest is
    // allowed (ADR §8: "residual menu drift is acceptable — the API
    // enforces"). We assert the *positive* surface for each role and a
    // couple of high-value negatives. Section visibility is a pure function
    // of child-link visibility — granting qc.resources.view anywhere in the
    // chain surfaces the Manage section, etc.

    it('admin sees admin-only routes (Users, Roles, Permissions Matrix, Integrations)', () => {
        const paths = visiblePathsFor('admin');
        expect(paths).toContain('/admin/users');
        expect(paths).toContain('/admin/teams');
        expect(paths).toContain('/admin/roles');
        expect(paths).toContain('/admin/permissions/matrix');
        expect(paths).toContain('/admin/integrations/tuleap');
        expect(visibleSectionsFor('admin')).toEqual(
            expect.arrayContaining(['admin', 'manage', 'quality', 'my-work'])
        );
    });

    it('team_manager sees the full set of manager surfaces', () => {
        const sections = visibleSectionsFor('team_manager');
        expect(sections).toContain('manage');
        expect(sections).toContain('quality');
        expect(sections).toContain('my-work');
        // /admin/* is admin-only (issues #292/#297): team_manager no longer
        // sees the admin section even though it holds qc.team.view.
        expect(sections).not.toContain('admin');

        const paths = visiblePathsFor('team_manager');
        expect(paths).toContain('/team/resources');
        expect(paths).toContain('/dashboards/team-manager');
        expect(paths).toContain('/team/journeys');
        expect(paths).not.toContain('/admin/teams');
        // /admin/permissions/matrix requires qc.admin.manage_permissions, which
        // team_manager does not hold — no link, no section-child visibility.
        expect(paths).not.toContain('/admin/permissions/matrix');
        expect(paths).not.toContain('/admin/users');
    });

    it('pm sees Resources and Work projects but not team-manager dashboard or Admin-restricted', () => {
        const paths = visiblePathsFor('pm');
        expect(paths).toContain('/team/resources');
        expect(paths).toContain('/work/projects');
        expect(paths).toContain('/quality/governance');
        expect(paths).not.toContain('/dashboards/team-manager');
        expect(paths).not.toContain('/admin/users');
        expect(paths).not.toContain('/admin/permissions/matrix');
    });

    it('tester sees My Work + Quality; manage surfaces because tester holds qc.resources.view', () => {
        const sections = visibleSectionsFor('tester');
        expect(sections).toContain('my-work');
        expect(sections).toContain('quality');
        // tester has qc.resources.view → /team/resources → manage section visible.
        expect(sections).toContain('manage');
        // tester has no qc.admin.* keys → no admin section.
        expect(sections).not.toContain('admin');

        const paths = visiblePathsFor('tester');
        expect(paths).toContain('/me/tasks');
        expect(paths).toContain('/work/tasks');
        expect(paths).toContain('/test/cases');
        expect(paths).toContain('/test/runs');
        expect(paths).toContain('/team/resources');
        expect(paths).not.toContain('/admin/users');
        expect(paths).not.toContain('/dashboards/team-manager');
    });

    it('viewer sees only the routes their view permissions admit', () => {
        const paths = visiblePathsFor('viewer');
        // viewer has qc.tasks.view, qc.projects.view, qc.resources.view, etc.
        expect(paths).toContain('/me/tasks');
        expect(paths).toContain('/work/tasks');
        expect(paths).toContain('/work/projects');
        // viewer does NOT have qc.team.view, qc.admin.*, or qc.dashboards.team_manager.view
        expect(paths).not.toContain('/team/journeys');
        expect(paths).not.toContain('/admin/users');
        expect(paths).not.toContain('/dashboards/team-manager');
    });

    it('contributor with preparation_only scope does NOT see active-only routes', () => {
        const paths = visiblePathsFor('contributor');
        // /me/tasks has no scope gate in the route config, so it stays
        // visible to a contributor (and is the safe default landing page).
        expect(paths).toContain('/me/tasks');
        // active-only routes are filtered out by routeAllowsScope.
        expect(paths).not.toContain('/work/tasks');
        expect(paths).not.toContain('/test/cases');
        expect(paths).not.toContain('/team/resources');
    });
});

describe('routeAllowsScope — direct membership test', () => {
    const route = {
        path: '/work/tasks',
        label: 'Tasks',
        permission: PERMISSIONS.TASKS_VIEW,
        scopes: [ACTIVE_ONLY] as readonly string[],
    };

    it('passes when every required scope is in effective_scopes', () => {
        expect(routeAllowsScope(route, [ACTIVE_ONLY])).toBe(true);
        expect(routeAllowsScope(route, [ACTIVE_ONLY, PREPARATION_ONLY])).toBe(true);
    });

    it('fails when a required scope is missing', () => {
        expect(routeAllowsScope(route, [PREPARATION_ONLY])).toBe(false);
        expect(routeAllowsScope(route, [])).toBe(false);
        expect(routeAllowsScope(route, undefined)).toBe(false);
    });

    it('passes for routes that declare no scope requirement', () => {
        const openRoute = { path: '/me/tasks', label: 'My Tasks', permission: PERMISSIONS.MY_TASKS_VIEW };
        expect(routeAllowsScope(openRoute, [])).toBe(true);
        expect(routeAllowsScope(openRoute, undefined)).toBe(true);
    });
});

describe('anyPermission — OR-gated routes (team-view feature)', () => {
    const OWN_TEAM = PERMISSIONS.JOURNEYS_VIEW_TEAM_PROGRESS;
    const ALL_TEAMS = PERMISSIONS.JOURNEYS_VIEW_ALL_TEAMS_PROGRESS;

    function ctxWith(keys: string[]): Ctx {
        const set = new Set(keys);
        return {
            role: 'custom',
            isAdmin: false,
            hasPermission: (key: string) => set.has(key),
            effectiveScopes: [ACTIVE_ONLY],
        };
    }

    it('/team/journeys is visible to a holder of ONLY the all-teams grant', () => {
        expect(canSeeRoutePath('/team/journeys', ctxWith([ALL_TEAMS]))).toBe(true);
    });

    it('/team/journeys is visible to a holder of ONLY the own-team grant', () => {
        expect(canSeeRoutePath('/team/journeys', ctxWith([OWN_TEAM]))).toBe(true);
    });

    it('/team/journeys is hidden when the actor holds neither grant', () => {
        expect(canSeeRoutePath('/team/journeys', ctxWith([]))).toBe(false);
        expect(canSeeRoutePath('/team/journeys', ctxWith(['qc.unrelated.key']))).toBe(false);
    });

    it('routeAllowsPermission honors anyPermission (OR), single permission, and no gate', () => {
        const anyRoute = { path: '/x', label: 'X', anyPermission: [OWN_TEAM, ALL_TEAMS] as readonly string[] };
        expect(routeAllowsPermission(anyRoute, k => k === OWN_TEAM)).toBe(true);
        expect(routeAllowsPermission(anyRoute, k => k === ALL_TEAMS)).toBe(true);
        expect(routeAllowsPermission(anyRoute, () => false)).toBe(false);

        const singleRoute = { path: '/y', label: 'Y', permission: OWN_TEAM };
        expect(routeAllowsPermission(singleRoute, k => k === OWN_TEAM)).toBe(true);
        expect(routeAllowsPermission(singleRoute, () => false)).toBe(false);

        const openRoute = { path: '/z', label: 'Z' };
        expect(routeAllowsPermission(openRoute, () => false)).toBe(true);
    });
});

describe('canSeeRoutePath — scope-first, permission-second', () => {
    it('hides a scope-gated route when the actor lacks the scope', () => {
        const ctx = contextForBuiltInRole('contributor');
        expect(canSeeRoutePath('/work/tasks', ctx)).toBe(false);
    });

    it('hides a route when the actor has the scope but not the permission', () => {
        const ctx = contextForBuiltInRole('pm');
        expect(canSeeRoutePath('/admin/users', ctx)).toBe(false);
    });

    it('admits a route when the actor has both scope and permission', () => {
        const ctx = contextForBuiltInRole('tester');
        expect(canSeeRoutePath('/work/tasks', ctx)).toBe(true);
    });

    it('admin is admitted to admin-only routes regardless of scope/permission set', () => {
        // Admin's `*` matches every permission AND admin's effective_scopes is
        // empty (admin is the one role not seeded with any role_scopes row).
        // The client `hasPermission` / `hasScope` calls short-circuit on admin,
        // so the pure `routeAllowsScope` membership test is not the gate for
        // admin — the permission check via `*` is. This test pins that.
        const ctx = contextForBuiltInRole('admin');
        expect(ctx.effectiveScopes).toEqual([]);
        expect(ctx.hasPermission(PERMISSIONS.ADMIN_USERS_VIEW)).toBe(true);
        expect(canSeeRoutePath('/admin/users', ctx)).toBe(true);
    });
});

import { describe, it, expect } from 'vitest';
import { getVisibleNavSections, type NavigationNode } from './routes';

const { PERMISSIONS } = require('../../../shared/rbac/catalog.ts');

function collectPaths(nodes: NavigationNode[]): string[] {
    const out: string[] = [];
    for (const node of nodes) {
        if (node.path) out.push(node.path);
        if (node.children) out.push(...collectPaths(node.children));
    }
    return out;
}

function visiblePathsFor(role: string, granted: string[]): string[] {
    const set = new Set(granted);
    const sections = getVisibleNavSections({
        role,
        status: 'ACTIVE',
        isAdmin: role === 'admin',
        hasPermission: (key: string) => role === 'admin' || set.has(key),
    });
    return sections.flatMap(section => collectPaths(section.children));
}

describe('sidebar nav visibility — Resources for PM', () => {
    // Regression: pm had qc.resources.view granted in role_permissions, but the
    // "Manage" section was role-gated to ['team_manager','admin'] so the link
    // never rendered for PMs regardless of the permission grant.
    it('shows /team/resources to a pm who has qc.resources.view', () => {
        const paths = visiblePathsFor('pm', [PERMISSIONS.RESOURCES_VIEW]);
        expect(paths).toContain('/team/resources');
    });

    // Blast-radius guard: qc.resources.view is granted to nearly every role, so
    // the Manage section must stay manager-level. A viewer holding the same
    // permission must NOT get the Manage section in their menu.
    it('does not expose the Manage section to a viewer who has qc.resources.view', () => {
        const sections = getVisibleNavSections({
            role: 'viewer',
            status: 'ACTIVE',
            isAdmin: false,
            hasPermission: (key: string) => key === PERMISSIONS.RESOURCES_VIEW,
        });
        expect(sections.find(section => section.key === 'manage')).toBeUndefined();
    });

    it('still shows /team/resources to team_manager and admin', () => {
        expect(visiblePathsFor('team_manager', [PERMISSIONS.RESOURCES_VIEW])).toContain('/team/resources');
        expect(visiblePathsFor('admin', [])).toContain('/team/resources');
    });
});

import { LucideIcon, CheckSquare, LayoutGrid, ListTodo, FolderKanban, Users, ShieldCheck, FlaskConical, BarChart3, UserCog, History, Map, Settings2, Users2, Bug, GraduationCap, Layers, ClipboardList, BookOpen, PlayCircle, FileText, TestTube2 } from 'lucide-react';

const { PERMISSIONS, SCOPES, getScope, resolvePermissionKey } = require('../../../shared/rbac/catalog.ts');

export type UserStatus = 'PREPARATION' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';

export interface RouteConfig {
    path: string;
    label: string;
    permission?: string;
    scopes?: readonly string[];
    adminOnly?: boolean;
    showInNavbar?: boolean;
    navOrder?: number;
    icon?: LucideIcon;
    onboardingStep?: number;
    onboardingGroup?: string;
}

export interface NavigationNode {
    label: string;
    path?: string;
    icon?: LucideIcon;
    children?: NavigationNode[];
}

export interface NavigationSection {
    key: 'my-work' | 'quality' | 'manage' | 'admin';
    label: string;
    icon: LucideIcon;
    roles?: readonly string[];
    children: NavigationNode[];
}

interface RouteVisibilityUser {
    status?: UserStatus | null;
}

const PUBLIC_PATHS = ['/login', '/register', '/auth/callback', '/auth/reset-password', '/auth/confirmed'];
const ACTIVE_ONLY_SCOPES = [SCOPES.ACTIVE_ONLY.key] as const;

const ROUTES: RouteConfig[] = [
    { path: '/login', label: 'Login' },
    { path: '/register', label: 'Register' },
    { path: '/auth/callback', label: 'Auth Callback' },
    { path: '/auth/reset-password', label: 'Reset Password' },
    { path: '/me/tasks', label: 'My Tasks', permission: PERMISSIONS.MY_TASKS_VIEW, showInNavbar: true, navOrder: 1, icon: CheckSquare },
    { path: '/me/journeys', label: 'My Journeys', permission: PERMISSIONS.MY_TASKS_VIEW, showInNavbar: true, navOrder: 1.5, icon: Map },
    { path: '/me/journeys/[id]', label: 'Journey Details', permission: PERMISSIONS.MY_TASKS_VIEW },
    { path: '/me/idp', label: 'My Development Plan', permission: PERMISSIONS.MY_TASKS_VIEW, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: true, navOrder: 1.5, icon: GraduationCap },
    { path: '/me/idp/history', label: 'Plan History', permission: PERMISSIONS.MY_TASKS_VIEW, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: true, navOrder: 1.6, icon: History },
    { path: '/me/idp/history/[planId]', label: 'Archived Plan', permission: PERMISSIONS.MY_TASKS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/me/dashboard', label: 'My Dashboard', permission: PERMISSIONS.MY_DASHBOARD_VIEW, showInNavbar: true, navOrder: 1.8, icon: LayoutGrid },
    { path: '/dashboards/pm', label: 'PM Dashboard', permission: PERMISSIONS.DASHBOARD_PM_VIEW, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: true, navOrder: 1.9, icon: LayoutGrid },
    { path: '/dashboards/member', label: 'Member Dashboard', permission: PERMISSIONS.DASHBOARDS_MEMBER_VIEW, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: true, navOrder: 1.85, icon: LayoutGrid },
    { path: '/dashboards/team-manager', label: 'Team Dashboard', permission: PERMISSIONS.DASHBOARDS_TEAM_MANAGER_VIEW, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: true, navOrder: 1.95, icon: LayoutGrid },
    { path: '/work/stories', label: 'Stories', permission: PERMISSIONS.PROJECTS_VIEW, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: true, navOrder: 2.9, icon: BookOpen },
    { path: '/work/tasks', label: 'Tasks', permission: PERMISSIONS.TASKS_VIEW, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: true, navOrder: 3, icon: ListTodo },
    { path: '/work/tasks/create', label: 'Create Task', permission: PERMISSIONS.TASKS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/work/tasks/[id]', label: 'Task Details', permission: PERMISSIONS.TASKS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/work/tasks/[id]/edit', label: 'Edit Task', permission: PERMISSIONS.TASKS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/work/projects', label: 'Projects', permission: PERMISSIONS.PROJECTS_VIEW, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: true, navOrder: 4, icon: FolderKanban },
    { path: '/work/projects/create', label: 'Create Project', permission: PERMISSIONS.PROJECTS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/work/projects/[id]', label: 'Project Details', permission: PERMISSIONS.PROJECTS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/work/projects/[id]/edit', label: 'Edit Project', permission: PERMISSIONS.PROJECTS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/work/projects/[id]/quality', label: 'Project Quality', permission: PERMISSIONS.PROJECTS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/work/stories/create', label: 'Create User Story', permission: PERMISSIONS.PROJECTS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/work/stories/[id]', label: 'User Story Details', permission: PERMISSIONS.PROJECTS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/work/stories/[id]/edit', label: 'Edit User Story', permission: PERMISSIONS.PROJECTS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/team/resources', label: 'Resources', permission: PERMISSIONS.RESOURCES_VIEW, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: true, navOrder: 5, icon: Users },
    { path: '/team/resources/create', label: 'Create Resource', permission: PERMISSIONS.RESOURCES_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/team/resources/[id]', label: 'Resource Dashboard', permission: PERMISSIONS.RESOURCES_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/work/bugs', label: 'Bugs', permission: PERMISSIONS.BUGS_VIEW, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: true, navOrder: 5.5, icon: Bug },
    { path: '/work/bugs/create', label: 'Create Bug', permission: PERMISSIONS.BUGS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/work/bugs/[id]', label: 'Bug Details', permission: PERMISSIONS.BUGS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/work/bugs/[id]/edit', label: 'Edit Bug', permission: PERMISSIONS.BUGS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/quality/governance', label: 'Governance', permission: PERMISSIONS.GOVERNANCE_VIEW, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: true, navOrder: 6, icon: ShieldCheck },
    { path: '/test/runs', label: 'Test Runs', permission: PERMISSIONS.TESTEXECUTIONS_VIEW, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: true, navOrder: 7, icon: FlaskConical },
    { path: '/test/cases', label: 'Test Cases', permission: PERMISSIONS.TESTCASES_VIEW, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: true, navOrder: 7, icon: FlaskConical },
    { path: '/test/cases/create', label: 'Create Test Case', permission: PERMISSIONS.TESTCASES_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/test/cases/[id]', label: 'Test Case Details', permission: PERMISSIONS.TESTCASES_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/test/cases/[id]/edit', label: 'Edit Test Case', permission: PERMISSIONS.TESTCASES_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/test/suites', label: 'Test Suites', permission: PERMISSIONS.TESTSUITES_VIEW, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: true, navOrder: 7.5, icon: Layers },
    { path: '/test/suites/create', label: 'Create Suite', permission: PERMISSIONS.TESTSUITES_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/test/suites/[id]', label: 'Suite Details', permission: PERMISSIONS.TESTSUITES_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/test/suites/[id]/edit', label: 'Edit Suite', permission: PERMISSIONS.TESTSUITES_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/test/runs/create', label: 'Create Test Run', permission: PERMISSIONS.TESTEXECUTIONS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/test/runs/[id]', label: 'Test Run Details', permission: PERMISSIONS.TESTEXECUTIONS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/test/results', label: 'Test Results', permission: PERMISSIONS.TESTEXECUTIONS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/test/results/upload', label: 'Upload Results', permission: PERMISSIONS.TESTEXECUTIONS_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/team/history', label: 'Task History', permission: PERMISSIONS.TASK_HISTORY_VIEW, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: true, navOrder: 10, icon: History },
    { path: '/quality/reports', label: 'Reports', permission: PERMISSIONS.REPORTS_VIEW, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: true, navOrder: 8, icon: BarChart3 },
    { path: '/admin', label: 'Settings', permission: PERMISSIONS.ADMIN_SETTINGS_VIEW, adminOnly: true, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/admin/teams', label: 'Teams', permission: PERMISSIONS.TEAM_VIEW, adminOnly: true, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: true, navOrder: 9.3, icon: Users2 },
    { path: '/admin/journeys', label: 'Manage Journeys', permission: PERMISSIONS.JOURNEYS_VIEW, adminOnly: true, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: true, navOrder: 9.5, icon: Map },
    { path: '/admin/journeys/[id]', label: 'Edit Journey', permission: PERMISSIONS.JOURNEYS_VIEW, adminOnly: true, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/admin/roles', label: 'Roles & Permissions', permission: PERMISSIONS.ADMIN_ROLES_VIEW, adminOnly: true, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: true, navOrder: 10, icon: ShieldCheck },
    { path: '/admin/permissions/matrix', label: 'Permissions Matrix', permission: PERMISSIONS.ADMIN_MANAGE_PERMISSIONS, adminOnly: true, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: true, navOrder: 10.2, icon: ShieldCheck },
    { path: '/admin/integrations/tuleap', label: 'Tuleap Integration', permission: PERMISSIONS.ADMIN_SETTINGS_VIEW, adminOnly: true, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: true, navOrder: 9.1, icon: Settings2 },
    { path: '/admin/users', label: 'Users', permission: PERMISSIONS.ADMIN_USERS_VIEW, adminOnly: true, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: true, navOrder: 11, icon: UserCog },
    { path: '/team/journeys', label: 'Team Journeys', permission: PERMISSIONS.JOURNEYS_VIEW_TEAM_PROGRESS, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: true, navOrder: 9.8, icon: Users2 },
    { path: '/team/journeys/[userId]', label: 'Team Member Journey', permission: PERMISSIONS.JOURNEYS_VIEW_TEAM_PROGRESS, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/team/journeys/[userId]/[journeyId]', label: 'Team Member Journey', permission: PERMISSIONS.JOURNEYS_VIEW_TEAM_PROGRESS, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/team/idp', label: 'Dev Plans', permission: PERMISSIONS.RESOURCES_VIEW, scopes: ACTIVE_ONLY_SCOPES, showInNavbar: true, navOrder: 9.6, icon: GraduationCap },
    { path: '/team/idp/[userId]', label: 'IDP Builder', permission: PERMISSIONS.RESOURCES_VIEW, scopes: ACTIVE_ONLY_SCOPES },
    { path: '/me/preferences', label: 'Preferences' },
];

const NAVIGATION_SECTIONS: NavigationSection[] = [
    {
        key: 'my-work',
        label: 'My Work',
        icon: CheckSquare,
        children: [
            { path: '/me/dashboard', label: 'My Dashboard', icon: LayoutGrid },
            { path: '/dashboards/member', label: 'Member Dashboard', icon: LayoutGrid },
            { path: '/me/tasks', label: 'My Tasks', icon: CheckSquare },
            { path: '/me/journeys', label: 'My Journeys', icon: Map },
            { path: '/me/idp', label: 'My Development Plan', icon: GraduationCap },
            { path: '/me/idp/history', label: 'Plan History', icon: History },
            { path: '/me/preferences', label: 'Preferences', icon: Settings2 },
        ],
    },
    {
        key: 'quality',
        label: 'Quality',
        icon: ShieldCheck,
        children: [
            { path: '/work/projects', label: 'Projects', icon: FolderKanban },
            {
                label: 'Work Tracking',
                icon: ClipboardList,
                children: [
                    { path: '/work/stories', label: 'Stories', icon: BookOpen },
                    { path: '/work/tasks', label: 'Tasks', icon: ListTodo },
                    { path: '/work/bugs', label: 'Bugs', icon: Bug },
                ],
            },
            {
                label: 'Test Authoring',
                icon: TestTube2,
                children: [
                    { path: '/test/cases', label: 'Cases', icon: FlaskConical },
                    { path: '/test/suites', label: 'Suites', icon: Layers },
                ],
            },
            {
                label: 'Test Execution',
                icon: PlayCircle,
                children: [
                    { path: '/test/runs', label: 'Test Runs', icon: PlayCircle },
                    { path: '/test/results', label: 'Results', icon: FileText },
                ],
            },
            { path: '/quality/governance', label: 'Governance', icon: ShieldCheck },
            { path: '/quality/reports', label: 'Reports', icon: BarChart3 },
        ],
    },
    {
        key: 'manage',
        label: 'Manage',
        icon: Users,
        roles: ['manager', 'team_manager', 'admin'],
        children: [
            { path: '/dashboards/team-manager', label: 'Team Dashboard', icon: LayoutGrid },
            { path: '/team/resources', label: 'Resources', icon: Users },
            { path: '/team/idp', label: 'Development Plans', icon: GraduationCap },
            { path: '/team/journeys', label: 'Team Journeys', icon: Users2 },
            { path: '/team/history', label: 'Task History', icon: History },
        ],
    },
    {
        key: 'admin',
        label: 'Admin',
        icon: Settings2,
        roles: ['admin'],
        children: [
            { path: '/admin/users', label: 'Users', icon: UserCog },
            { path: '/admin/teams', label: 'Teams', icon: Users2 },
            { path: '/admin/journeys', label: 'Journey Templates', icon: Map },
            { path: '/admin/roles', label: 'Roles & Permissions', icon: ShieldCheck },
            { path: '/admin/permissions/matrix', label: 'Permissions Matrix', icon: ShieldCheck },
            {
                label: 'Integrations',
                icon: Settings2,
                children: [
                    { path: '/admin/integrations/tuleap', label: 'Tuleap', icon: Settings2 },
                ],
            },
        ],
    },
];

function pathToRegex(routePath: string): RegExp {
    const escaped = routePath
        .replace(/\[[\w]+\]/g, '[^/]+')
        .replace(/\//g, '\\/');
    return new RegExp(`^${escaped}$`);
}

function getStatus(userOrStatus?: RouteVisibilityUser | UserStatus | null): UserStatus | null {
    if (!userOrStatus) return null;
    if (typeof userOrStatus === 'string') return userOrStatus;
    return userOrStatus.status ?? null;
}

export function hasCatalogPermission(permissions: readonly string[] | undefined, key: string): boolean {
    if (!permissions) return false;

    const canonicalKey = resolvePermissionKey(key);
    return permissions.some(permission => {
        if (permission === '*') return true;
        return resolvePermissionKey(permission) === canonicalKey;
    });
}

export function routeAllowsStatus(route: RouteConfig, userOrStatus?: RouteVisibilityUser | UserStatus | null): boolean {
    if (!route.scopes?.length) return true;

    const status = getStatus(userOrStatus);
    return route.scopes.every(scopeKey => {
        const scope = getScope(scopeKey);
        if (!scope?.statuses) return true;
        return status ? scope.statuses.includes(status) : false;
    });
}

export function getRouteConfig(pathname: string): RouteConfig | undefined {
    return ROUTES.find(route => {
        if (route.path === pathname) return true;
        if (route.path.includes('[')) {
            return pathToRegex(route.path).test(pathname);
        }
        return false;
    });
}

export function getNavbarRoutes(userOrStatus?: RouteVisibilityUser | UserStatus | null): RouteConfig[] {
    return ROUTES
        .filter(r => r.showInNavbar)
        .filter(r => routeAllowsStatus(r, userOrStatus))
        .sort((a, b) => (a.navOrder || 99) - (b.navOrder || 99));
}

export function isPublicRoute(pathname: string): boolean {
    return PUBLIC_PATHS.includes(pathname);
}

interface UserForLanding extends RouteVisibilityUser {
    status: UserStatus;
    role?: string;
    preferences?: {
        default_page?: string;
        [key: string]: any;
    };
}

const DEFAULT_LANDING = '/me/tasks';

/**
 * Returns the user's preferred landing page with route, status scope, and
 * permission validation. Falls back to /me/tasks because it is accessible to
 * all roles that have an authenticated session.
 */
export function getLandingPage(user: UserForLanding | null, permissions?: string[]): string {
    if (!user) return '/login';
    if (user.status !== 'ACTIVE') return '/me/tasks';

    const preferredPage = user.preferences?.default_page;
    if (!preferredPage) return DEFAULT_LANDING;

    const route = getRouteConfig(preferredPage);
    if (!route) return DEFAULT_LANDING;
    if (!routeAllowsStatus(route, user)) return DEFAULT_LANDING;

    if (route.adminOnly && user.role !== 'admin') {
        return DEFAULT_LANDING;
    }

    if (route.permission && permissions) {
        if (user.role === 'admin') return preferredPage;
        if (!hasCatalogPermission(permissions, route.permission)) return DEFAULT_LANDING;
    }

    return preferredPage;
}

export interface BreadcrumbItem {
    label: string;
    path?: string;
}

function findNodePath(nodes: NavigationNode[], targetPath: string): NavigationNode[] | null {
    for (const node of nodes) {
        if (node.path && targetPath === node.path) return [node];
        if (node.path && targetPath.startsWith(node.path + '/')) {
            const deeper = node.children ? findNodePath(node.children, targetPath) : null;
            if (deeper) return [node, ...deeper];
        }
        if (node.children) {
            const deeper = findNodePath(node.children, targetPath);
            if (deeper) return deeper;
        }
    }
    return null;
}

export function getBreadcrumbs(pathname: string): BreadcrumbItem[] {
    for (const section of NAVIGATION_SECTIONS) {
        const nodePath = findNodePath(section.children, pathname);
        if (nodePath) {
            return [
                { label: section.label },
                ...nodePath.map(n => ({ label: n.label, path: n.path })),
            ];
        }
    }
    return [];
}

export { ROUTES, PUBLIC_PATHS, NAVIGATION_SECTIONS };

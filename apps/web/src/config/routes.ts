import { LucideIcon, CheckSquare, LayoutDashboard, ListTodo, FolderKanban, Users, ShieldCheck, FlaskConical, BarChart3, UserCog, History, Map, Settings2, Users2 } from 'lucide-react';

export interface RouteConfig {
    path: string;
    label: string;
    permission?: string;
    adminOnly?: boolean;
    requiresActivation?: boolean;
    showInNavbar?: boolean;
    navOrder?: number;
    icon?: LucideIcon;
    onboardingStep?: number;
    onboardingGroup?: string;
}

const PUBLIC_PATHS = ['/login', '/register'];

const ROUTES: RouteConfig[] = [
    { path: '/login', label: 'Login' },
    { path: '/register', label: 'Register' },
    { path: '/my-tasks', label: 'My Tasks', permission: 'page:my-tasks', requiresActivation: false, showInNavbar: true, navOrder: 1, icon: CheckSquare },
    { path: '/journeys', label: 'My Journeys', permission: 'page:my-tasks', requiresActivation: false, showInNavbar: true, navOrder: 1.5, icon: Map },
    { path: '/journeys/[id]', label: 'Journey Details', permission: 'page:my-tasks', requiresActivation: false },
    { path: '/dashboard', label: 'Dashboard', permission: 'page:dashboard', requiresActivation: true, showInNavbar: true, navOrder: 2, icon: LayoutDashboard },
    { path: '/tasks', label: 'Tasks', permission: 'page:tasks', requiresActivation: true, showInNavbar: true, navOrder: 3, icon: ListTodo },
    { path: '/tasks/create', label: 'Create Task', permission: 'page:tasks', requiresActivation: true },
    { path: '/tasks/[id]', label: 'Task Details', permission: 'page:tasks', requiresActivation: true },
    { path: '/tasks/[id]/edit', label: 'Edit Task', permission: 'page:tasks', requiresActivation: true },
    { path: '/projects', label: 'Projects', permission: 'page:projects', requiresActivation: true, showInNavbar: true, navOrder: 4, icon: FolderKanban },
    { path: '/projects/create', label: 'Create Project', permission: 'page:projects', requiresActivation: true },
    { path: '/projects/[id]', label: 'Project Details', permission: 'page:projects', requiresActivation: true },
    { path: '/projects/[id]/edit', label: 'Edit Project', permission: 'page:projects', requiresActivation: true },
    { path: '/projects/[id]/quality', label: 'Project Quality', permission: 'page:projects', requiresActivation: true },
    { path: '/resources', label: 'Resources', permission: 'page:resources', requiresActivation: true, showInNavbar: true, navOrder: 5, icon: Users },
    { path: '/resources/create', label: 'Create Resource', permission: 'page:resources', requiresActivation: true },
    { path: '/resources/[id]', label: 'Resource Dashboard', permission: 'page:resources', requiresActivation: true },
    { path: '/governance', label: 'Governance', permission: 'page:governance', requiresActivation: true, showInNavbar: true, navOrder: 6, icon: ShieldCheck },
    { path: '/test-executions', label: 'Test Runs', permission: 'page:test-executions', requiresActivation: true, showInNavbar: true, navOrder: 7, icon: FlaskConical },
    { path: '/test-cases', label: 'Test Cases', permission: 'page:test-executions', requiresActivation: true },
    { path: '/test-results', label: 'Test Results', permission: 'page:test-executions', requiresActivation: true },
    { path: '/test-results/upload', label: 'Upload Results', permission: 'page:test-executions', requiresActivation: true },
    { path: '/task-history', label: 'Task History', permission: 'page:task-history', requiresActivation: true, showInNavbar: true, navOrder: 10, icon: History },
    { path: '/reports', label: 'Reports', permission: 'page:reports', requiresActivation: true, showInNavbar: true, navOrder: 8, icon: BarChart3 },
    { path: '/settings', label: 'Settings', adminOnly: true, requiresActivation: true },
    { path: '/settings/teams', label: 'Teams', permission: 'page:teams', adminOnly: true, requiresActivation: true, showInNavbar: true, navOrder: 9.3, icon: Users2 },
    { path: '/settings/journeys', label: 'Manage Journeys', adminOnly: true, requiresActivation: true, showInNavbar: true, navOrder: 9.5, icon: Map },
    { path: '/settings/journeys/[id]', label: 'Edit Journey', adminOnly: true, requiresActivation: true },
    { path: '/settings/roles', label: 'Roles & Permissions', adminOnly: true, requiresActivation: true, showInNavbar: true, navOrder: 10, icon: ShieldCheck },
    { path: '/users', label: 'Users', permission: 'page:users', adminOnly: true, requiresActivation: true, showInNavbar: true, navOrder: 11, icon: UserCog },
    { path: '/settings/team-journeys', label: 'Team Journeys', permission: 'action:journeys:view_team_progress', requiresActivation: true, showInNavbar: true, navOrder: 9.8, icon: Users2 },
    { path: '/settings/team-journeys/[userId]', label: 'Team Member Journey', permission: 'action:journeys:view_team_progress', requiresActivation: true },
    { path: '/preferences', label: 'Preferences', requiresActivation: false },
];

function pathToRegex(routePath: string): RegExp {
    const escaped = routePath
        .replace(/\[[\w]+\]/g, '[^/]+')
        .replace(/\//g, '\\/');
    return new RegExp(`^${escaped}$`);
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

export function getNavbarRoutes(): RouteConfig[] {
    return ROUTES
        .filter(r => r.showInNavbar)
        .sort((a, b) => (a.navOrder || 99) - (b.navOrder || 99));
}

export function isPublicRoute(pathname: string): boolean {
    return PUBLIC_PATHS.includes(pathname);
}

interface UserForLanding {
    activated: boolean;
    role?: string;
    preferences?: {
        default_page?: string;
        [key: string]: any;
    };
}

/**
 * Returns the user's preferred landing page with permission validation.
 * Falls back to /dashboard if the preferred page is invalid, doesn't exist,
 * or the user lacks permission.
 *
 * @param user - User object with activation status and preferences
 * @param permissions - Array of permission keys the user has (optional, needed for validation)
 */
export function getLandingPage(user: UserForLanding | null, permissions?: string[]): string {
    if (!user) return '/login';
    if (!user.activated) return '/my-tasks';

    const preferredPage = user.preferences?.default_page;

    // If no preference set, default to /dashboard
    if (!preferredPage || preferredPage === '/dashboard') return '/dashboard';

    // Validate the preferred page exists in our route config
    const route = getRouteConfig(preferredPage);
    if (!route) return '/dashboard';

    // Check if route requires activation (user is already activated at this point)
    if (route.requiresActivation === false) {
        // Non-activation routes are always accessible — allow it
        return preferredPage;
    }

    // Check admin-only routes
    if (route.adminOnly && user.role !== 'admin') {
        return '/dashboard';
    }

    // Check permission if required
    if (route.permission && permissions) {
        // Admins bypass all permission checks
        if (user.role === 'admin') return preferredPage;
        if (!permissions.includes(route.permission)) return '/dashboard';
    }

    return preferredPage;
}

export { ROUTES, PUBLIC_PATHS };

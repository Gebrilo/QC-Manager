import { LucideIcon, CheckSquare, LayoutDashboard, ListTodo, FolderKanban, Users, ShieldCheck, FlaskConical, BarChart3, UserCog, History } from 'lucide-react';

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
    { path: '/governance', label: 'Governance', permission: 'page:governance', requiresActivation: true, showInNavbar: true, navOrder: 6, icon: ShieldCheck },
    { path: '/test-executions', label: 'Test Runs', permission: 'page:test-executions', requiresActivation: true, showInNavbar: true, navOrder: 7, icon: FlaskConical },
    { path: '/test-cases', label: 'Test Cases', permission: 'page:test-executions', requiresActivation: true },
    { path: '/test-results', label: 'Test Results', permission: 'page:test-executions', requiresActivation: true },
    { path: '/test-results/upload', label: 'Upload Results', permission: 'page:test-executions', requiresActivation: true },
    { path: '/task-history', label: 'Task History', permission: 'page:task-history', requiresActivation: true, showInNavbar: true, navOrder: 10, icon: History },
    { path: '/reports', label: 'Reports', permission: 'page:reports', requiresActivation: true, showInNavbar: true, navOrder: 8, icon: BarChart3 },
    { path: '/settings', label: 'Settings', adminOnly: true, requiresActivation: true },
    { path: '/users', label: 'Users', permission: 'page:users', adminOnly: true, requiresActivation: true, showInNavbar: true, navOrder: 9, icon: UserCog },
    { path: '/preferences', label: 'Preferences', requiresActivation: false },
    { path: '/test', label: 'Test', requiresActivation: false },
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
}

export function getLandingPage(user: UserForLanding | null): string {
    if (!user) return '/login';
    if (!user.activated) return '/my-tasks';
    return '/dashboard';
}

export { ROUTES, PUBLIC_PATHS };

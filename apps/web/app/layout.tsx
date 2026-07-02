'use client';

import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { AuthProvider } from '@/components/providers/AuthProvider';
import { RouteGuard, PagePermissionGuard } from '@/components/providers/RouteGuard';
import { SidebarProvider } from '@/components/providers/SidebarProvider';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { ToastProvider } from '@/components/ui/Toast';
import { ConfirmDialogProvider } from '@/components/ui/ConfirmDialog';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { ApiErrorToaster } from '@/components/providers/ApiErrorToaster';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { ActivationBanner } from '@/components/ui/ActivationBanner';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const inter = Inter({ subsets: ['latin'] });

const AUTH_PAGES = ['/login', '/register', '/auth/callback', '/auth/confirmed'];
const CHROMELESS_PAGES = ['/', ...AUTH_PAGES];

const PAGE_TITLES: Record<string, string> = {
    '/': 'Landing Page',
    '/my-tasks': 'My Tasks',
    '/me/tasks': 'My Tasks',
    '/projects': 'Projects',
    '/work/projects': 'Projects',
    '/tasks': 'Tasks',
    '/work/tasks': 'Tasks',
    '/work/stories': 'Stories',
    '/work/stories/ai-intake': 'AI Story Intake',
    '/work/bugs': 'Bugs',
    '/resources': 'Resources',
    '/team/resources': 'Resources',
    '/governance': 'Governance',
    '/quality/governance': 'Governance',
    '/settings': 'Settings',
    '/me/preferences': 'Preferences',
    '/users': 'User Management',
    '/admin/users': 'User Management',
    '/teams': 'Teams',
    '/admin/teams': 'Teams',
    '/roles': 'Roles',
    '/admin/roles': 'Roles',
    '/admin': 'Admin',
    '/journeys': 'Journeys',
    '/team/journeys': 'Team Journeys',
    '/me/journeys': 'My Journeys',
    '/idp': 'Individual Development Plans',
    '/team/idp': 'Individual Development Plans',
    '/me/idp': 'My Development Plan',
    '/reports': 'Reports',
    '/quality/reports': 'Reports',
    '/test-cases': 'Test Cases',
    '/test/cases': 'Test Cases',
    '/test/suites': 'Test Suites',
    '/test/runs': 'Test Runs',
    '/test-results': 'Test Results',
    '/test/results': 'Test Results',
    '/quality/tasks': 'Quality Tasks',
    '/quality/stories': 'Quality Stories',
    '/quality/projects': 'Quality Projects',
    '/quality/runs': 'Quality Runs',
    '/quality/results': 'Quality Results',
    '/dashboard': 'Dashboard',
    '/dashboards': 'Dashboards',
    '/dashboards/pm': 'PM Dashboard',
    '/dashboards/team-manager': 'Team Manager Dashboard',
    '/dashboards/member': 'Member Dashboard',
    '/me/dashboard': 'My Dashboard',
    '/task-history': 'Task History',
    '/team/history': 'Team History',
    '/admin/journeys': 'Journey Management',
    '/admin/landing-config': 'Landing Page Configuration',
    '/admin/permissions': 'Permissions',
    '/admin/integrations': 'Integrations',
    '/login': 'Login',
    '/register': 'Register',
    '/auth/callback': 'Auth Callback',
    '/auth/confirmed': 'Confirmed',
    '/auth/reset-password': 'Reset Password',
    '/bugs': 'Bugs',
};

const getPageTitle = (pathname: string | null) => {
    if (!pathname) return 'QC Manager';
    if (PAGE_TITLES[pathname]) return `QC Manager - ${PAGE_TITLES[pathname]}`;

    const baseRoute = '/' + pathname.split('/')[1];
    if (PAGE_TITLES[baseRoute]) {
        return `QC Manager - ${PAGE_TITLES[baseRoute]}`;
    }

    return 'QC Manager';
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const isChromelessPage = CHROMELESS_PAGES.includes(pathname || '');

    // useEffect(() => {
    //     document.title = getPageTitle(pathname);
    // }, [pathname]);

    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <title>{getPageTitle(pathname)}</title>
            </head>
            <body className={inter.className}>
                <TooltipProvider delayDuration={300}>
                    <ThemeProvider>
                        <AuthProvider>
                            <ToastProvider>
                                <ConfirmDialogProvider>
                                    <RouteGuard>
                                        <SidebarProvider>
                                            <ApiErrorToaster />
                                            {isChromelessPage ? (
                                                <ErrorBoundary>{children}</ErrorBoundary>
                                            ) : (
                                                <div className="flex h-screen overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 transition-colors duration-200 relative">
                                                    {/* Global decorative orbs */}
                                                    <div aria-hidden="true" className="fixed inset-0 pointer-events-none overflow-hidden">
                                                        <div className="absolute -top-24 -right-24 w-[400px] h-[400px] rounded-full opacity-20 dark:opacity-25" style={{ background: '#6366f1', filter: 'blur(100px)' }} />
                                                        <div className="absolute top-1/2 -left-32 w-[400px] h-[400px] rounded-full opacity-20 dark:opacity-25" style={{ background: '#7c3aed', filter: 'blur(100px)' }} />
                                                    </div>
                                                    <Sidebar />
                                                    <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
                                                        <TopBar />
                                                        <ActivationBanner />
                                                        <main className="flex-1 min-h-0 overflow-y-auto">
                                                            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                                                                <ErrorBoundary>
                                                                    <PagePermissionGuard>{children}</PagePermissionGuard>
                                                                </ErrorBoundary>
                                                            </div>
                                                        </main>
                                                    </div>
                                                </div>
                                            )}
                                        </SidebarProvider>
                                    </RouteGuard>
                                </ConfirmDialogProvider>
                            </ToastProvider>
                        </AuthProvider>
                    </ThemeProvider>
                </TooltipProvider>
            </body>
        </html>
    );
}

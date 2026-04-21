'use client';

import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '../src/components/providers/ThemeProvider';
import { AuthProvider } from '../src/components/providers/AuthProvider';
import { RouteGuard } from '../src/components/providers/RouteGuard';
import { SidebarProvider } from '../src/components/providers/SidebarProvider';
import { TooltipProvider } from '../src/components/ui/Tooltip';
import { ToastProvider } from '../src/components/ui/Toast';
import { Sidebar } from '../src/components/layout/Sidebar';
import { TopBar } from '../src/components/layout/TopBar';
import { ActivationBanner } from '../src/components/ui/ActivationBanner';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const inter = Inter({ subsets: ['latin'] });

const AUTH_PAGES = ['/login', '/register', '/auth/callback', '/auth/confirmed'];

const PAGE_TITLES: Record<string, string> = {
    '/': 'Dashboard',
    '/my-tasks': 'My Tasks',
    '/projects': 'Projects',
    '/tasks': 'Tasks',
    '/resources': 'Resources',
    '/governance': 'Governance',
    '/settings': 'Settings',
    '/reports': 'Reports',
    '/login': 'Login',
    '/register': 'Register',
    '/preferences': 'Preferences',
    '/users': 'User Management',
    '/journeys': 'Journeys',
    '/test-cases': 'Test Cases',
    '/test-executions': 'Test Executions',
    '/test-results': 'Test Results',
    '/task-history': 'Task History',
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
    const isAuthPage = AUTH_PAGES.includes(pathname || '');

    // useEffect(() => {
    //     document.title = getPageTitle(pathname);
    // }, [pathname]);

    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <title>{getPageTitle(pathname)}</title>
                <link rel="icon" type="image/svg+xml" href="/icon.svg" />
            </head>
            <body className={inter.className}>
                <TooltipProvider delayDuration={300}>
                    <ThemeProvider>
                        <AuthProvider>
                            <RouteGuard>
                                <SidebarProvider>
                                    <ToastProvider>
                                        {isAuthPage ? (
                                            children
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
                                                            {children}
                                                        </div>
                                                    </main>
                                                </div>
                                            </div>
                                        )}
                                    </ToastProvider>
                                </SidebarProvider>
                            </RouteGuard>
                        </AuthProvider>
                    </ThemeProvider>
                </TooltipProvider>
            </body>
        </html>
    );
}

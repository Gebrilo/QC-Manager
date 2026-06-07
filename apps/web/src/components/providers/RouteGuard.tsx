'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { getRouteConfig, isPublicRoute, getLandingPage, routeAllowsStatus } from '../../config/routes';
import { UnauthorizedPage } from '../PermissionGuard';

export function RouteGuard({ children }: { children: React.ReactNode }) {
    const { user, permissions, loading, hasPermission, isAdmin } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (loading) return;

        if (user && (pathname === '/login' || pathname === '/register')) {
            router.replace(getLandingPage(user, permissions));
            return;
        }

        if (isPublicRoute(pathname || '')) return;

        if (!user) {
            router.replace('/login');
            return;
        }

        const route = getRouteConfig(pathname || '');
        if (!route) return;

        const landing = getLandingPage(user, permissions);

        if (user.role === 'contributor' && route.scopes?.includes('active_only')) {
            router.replace('/me/tasks');
            return;
        }

        if (!routeAllowsStatus(route, user)) {
            router.replace('/me/tasks');
            return;
        }

        if (route.adminOnly && !isAdmin) {
            router.replace(landing);
            return;
        }

        if (route.permission && !hasPermission(route.permission)) {
            router.replace(landing);
            return;
        }
    }, [loading, user, permissions, pathname, router, hasPermission, isAdmin]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
                <div className="flex flex-col items-center gap-3">
                    <svg className="animate-spin h-8 w-8 text-indigo-500" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Loading...</p>
                </div>
            </div>
        );
    }

    if (isPublicRoute(pathname || '')) {
        return <>{children}</>;
    }

    if (!user) return null;

    return <>{children}</>;
}

export function PagePermissionGuard({ children }: { children: React.ReactNode }) {
    const { user, hasPermission, isAdmin } = useAuth();
    const pathname = usePathname();

    if (!user) return null;

    const route = getRouteConfig(pathname || '');
    if (!route) return <>{children}</>;

    if (user.role === 'contributor' && route.scopes?.includes('active_only')) return <UnauthorizedPage />;
    if (!routeAllowsStatus(route, user)) return <UnauthorizedPage />;
    if (route.adminOnly && !isAdmin) return <UnauthorizedPage />;
    if (route.permission && !hasPermission(route.permission)) return <UnauthorizedPage />;

    return <>{children}</>;
}

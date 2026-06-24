'use client';

import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { getRouteConfig, isPublicRoute, getLandingPage, routeAllowsPermission } from '../../config/routes';
import { UnauthorizedPage } from '../PermissionGuard';
import { useToastSafe } from '../ui/Toast';

export function RouteGuard({ children }: { children: React.ReactNode }) {
    const { user, permissions, scopes, loading, hasPermission, hasScope, isAdmin } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const toast = useToastSafe();
    const lastRedirectPath = useRef<string | null>(null);

    useEffect(() => {
        if (loading) return;

        if (user && (pathname === '/login' || pathname === '/register')) {
            router.replace(getLandingPage(user, permissions, scopes));
            return;
        }

        if (isPublicRoute(pathname || '')) return;

        if (!user) {
            router.replace('/login');
            return;
        }

        const route = getRouteConfig(pathname || '');
        if (!route) return;

        const landing = getLandingPage(user, permissions, scopes);

        // ADR 0010 / issue #270: gating is purely on the unified resolver data
        // pushed through the auth response — `effective_scopes` for status/scope
        // and `effective_permissions` for capability. No more adminOnly or
        // catalog-status fallback. The API remains the security boundary.
        // Admin is short-circuited (hasScope / isAdmin) because the resolver
        // intentionally seeds zero role_scopes rows for admin.
        const scopeOk = !route.scopes?.length || route.scopes.every(s => hasScope(s));
        if (!scopeOk) {
            if (lastRedirectPath.current !== pathname) {
                toast.warning("You don't have permission to access this page. Redirected to My Tasks.");
                lastRedirectPath.current = pathname;
            }
            router.replace('/me/tasks');
            return;
        }

        if (!routeAllowsPermission(route, hasPermission) && !isAdmin) {
            if (lastRedirectPath.current !== pathname) {
                toast.warning("You don't have permission to access this page. Redirected to your landing page.");
                lastRedirectPath.current = pathname;
            }
            router.replace(landing);
            return;
        }
    }, [loading, user, permissions, scopes, pathname, router, hasPermission, hasScope, isAdmin, toast]);

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
    const { user, scopes, hasPermission, hasScope, isAdmin } = useAuth();
    const pathname = usePathname();

    if (!user) return null;

    const route = getRouteConfig(pathname || '');
    if (!route) return <>{children}</>;

    if (route.scopes?.length && !route.scopes.every(s => hasScope(s))) return <UnauthorizedPage />;
    if (!routeAllowsPermission(route, hasPermission) && !isAdmin) return <UnauthorizedPage />;

    return <>{children}</>;
}

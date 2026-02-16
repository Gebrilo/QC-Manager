'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { getRouteConfig, isPublicRoute, getLandingPage } from '../../config/routes';

export function RouteGuard({ children }: { children: React.ReactNode }) {
    const { user, loading, hasPermission, isAdmin } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (loading) return;

        if (isPublicRoute(pathname || '')) return;

        if (!user) {
            router.replace('/login');
            return;
        }

        const route = getRouteConfig(pathname || '');
        if (!route) return;

        const landing = getLandingPage(user);

        if (route.requiresActivation && !user.activated) {
            router.replace('/my-tasks');
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
    }, [loading, user, pathname, router, hasPermission, isAdmin]);

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

    const route = getRouteConfig(pathname || '');
    if (route) {
        if (route.requiresActivation && !user.activated) return null;
        if (route.adminOnly && !isAdmin) return null;
        if (route.permission && !hasPermission(route.permission)) return null;
    }

    return <>{children}</>;
}

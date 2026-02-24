'use client';

import { ReactNode } from 'react';
import { useAuth } from './providers/AuthProvider';

interface PermissionGuardProps {
    /** Single permission key or array of permission keys. User needs at least one (OR logic). */
    permission: string | string[];
    /** If true, user must have ALL listed permissions (AND logic). Default is false (OR). */
    requireAll?: boolean;
    /** Content to show when user lacks permission. Defaults to nothing (hidden). */
    fallback?: ReactNode;
    children: ReactNode;
}

/**
 * PermissionGuard - Conditionally renders children based on user permissions.
 *
 * Usage:
 *   <PermissionGuard permission="action:tasks:create">
 *     <button>Create Task</button>
 *   </PermissionGuard>
 *
 *   <PermissionGuard permission={['action:tasks:edit', 'action:tasks:delete']} requireAll>
 *     <button>Manage Task</button>
 *   </PermissionGuard>
 */
export function PermissionGuard({ permission, requireAll = false, fallback = null, children }: PermissionGuardProps) {
    const { hasPermission, user } = useAuth();

    if (!user) return null;

    const perms = Array.isArray(permission) ? permission : [permission];

    const hasAccess = requireAll
        ? perms.every(p => hasPermission(p))
        : perms.some(p => hasPermission(p));

    if (!hasAccess) return <>{fallback}</>;

    return <>{children}</>;
}

/**
 * AdminOnly - Only renders children for admin users.
 */
export function AdminOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
    const { isAdmin } = useAuth();
    if (!isAdmin) return <>{fallback}</>;
    return <>{children}</>;
}

/**
 * Unauthorized page component - shown when user doesn't have access.
 */
export function UnauthorizedPage() {
    return (
        <div className="min-h-[60vh] flex items-center justify-center">
            <div className="text-center space-y-4 max-w-md">
                <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m10-6a10 10 0 11-20 0 10 10 0 0120 0z" />
                    </svg>
                </div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Access Denied</h2>
                <p className="text-slate-600 dark:text-slate-400">
                    You don&apos;t have permission to access this page. Contact your administrator if you believe this is an error.
                </p>
                <a
                    href="/my-tasks"
                    className="inline-block px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                    Go to My Tasks
                </a>
            </div>
        </div>
    );
}

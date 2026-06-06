'use client';

import { ReactNode } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/Tooltip';
import { Lock } from 'lucide-react';

interface PermissionGateProps {
    permission: string;
    mode?: 'disable' | 'hide';
    fallbackTooltip?: string;
    children: ReactNode;
}

export function PermissionGate({
    permission,
    mode = 'disable',
    fallbackTooltip = 'You need editor access for this action',
    children,
}: PermissionGateProps) {
    const { hasPermission } = useAuth();
    if (hasPermission(permission)) return <>{children}</>;
    if (mode === 'hide') return null;

    return (
        <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
                <span
                    className="relative inline-block cursor-not-allowed opacity-50"
                    tabIndex={0}
                    role="button"
                    aria-disabled="true"
                    aria-label={fallbackTooltip}
                >
                    <div className="pointer-events-none">{children}</div>
                    <Lock className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 rounded-full p-0.5 ring-1 ring-slate-300 dark:ring-slate-600" />
                </span>
            </TooltipTrigger>
            <TooltipContent>{fallbackTooltip}</TooltipContent>
        </Tooltip>
    );
}

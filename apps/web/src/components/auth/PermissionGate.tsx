'use client';

import { ReactNode } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/Tooltip';

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
                <span className="inline-block cursor-not-allowed opacity-50" aria-disabled="true">
                    <div className="pointer-events-none">{children}</div>
                </span>
            </TooltipTrigger>
            <TooltipContent>{fallbackTooltip}</TooltipContent>
        </Tooltip>
    );
}

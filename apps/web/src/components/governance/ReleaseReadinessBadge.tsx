/**
 * Release Readiness Badge
 * Phase 2: Compact status badge for lists and dashboards
 */

import React from 'react';
import type { ReadinessStatus } from '../../types/governance';
import {
    READINESS_BADGE_COLORS,
    getReadinessStatusIcon
} from '../../types/governance';

interface ReleaseReadinessBadgeProps {
    status: ReadinessStatus;
    size?: 'sm' | 'md' | 'lg';
    onClick?: () => void;
    className?: string;
}

export default function ReleaseReadinessBadge({
    status,
    size = 'md',
    onClick,
    className = ''
}: ReleaseReadinessBadgeProps) {
    const badgeColor = READINESS_BADGE_COLORS[status];
    const icon = getReadinessStatusIcon(status);

    const sizeClasses = {
        sm: 'px-2 py-1 text-xs',
        md: 'px-3 py-1.5 text-sm',
        lg: 'px-4 py-2 text-base'
    };

    const baseClasses = `inline-flex items-center rounded-full font-bold ${badgeColor} ${sizeClasses[size]} ${className}`;
    const interactiveClasses = onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : '';

    return (
        <span
            className={`${baseClasses} ${interactiveClasses}`}
            onClick={onClick}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
        >
            <span className="mr-1.5">{icon}</span>
            <span>{status}</span>
        </span>
    );
}

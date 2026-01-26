import * as React from 'react';

interface ProgressBarProps {
    value: number; // 0-100
    variant?: 'complete' | 'ontrack' | 'atrisk' | 'default' | 'notasks';
    className?: string;
}

export function ProgressBar({ value, variant = 'default', className = '' }: ProgressBarProps) {
    const clampedValue = Math.min(100, Math.max(0, value));

    const colorClasses = {
        complete: 'bg-emerald-500',
        ontrack: 'bg-blue-500',
        atrisk: 'bg-rose-500',
        default: 'bg-slate-400',
        notasks: 'bg-slate-300', // Saturated slate for empty state
    };

    return (
        <div className={`h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden ${className}`}>
            <div
                className={`h-full ${colorClasses[variant]} transition-all duration-1000`}
                style={{ width: `${clampedValue}%` }}
            />
        </div>
    );
}

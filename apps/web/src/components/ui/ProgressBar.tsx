import * as React from 'react';

interface ProgressBarProps {
    value: number;
    max?: number;
    variant?: 'complete' | 'ontrack' | 'atrisk' | 'default' | 'notasks';
    color?: string;
    className?: string;
}

export function ProgressBar({ value, max = 100, variant = 'default', color, className = '' }: ProgressBarProps) {
    const percentage = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

    const colorClasses: Record<string, string> = {
        complete: 'bg-emerald-500',
        ontrack: 'bg-blue-500',
        atrisk: 'bg-rose-500',
        default: 'bg-slate-400',
        notasks: 'bg-slate-300',
    };

    const barColor = color || colorClasses[variant];

    return (
        <div className={`h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden ${className}`}>
            <div
                className={`h-full ${color ? '' : colorClasses[variant]} transition-all duration-1000`}
                style={{ 
                    width: `${percentage}%`,
                    ...(color ? { backgroundColor: color } : {})
                }}
            />
        </div>
    );
}

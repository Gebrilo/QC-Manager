import * as React from 'react';
import { twMerge } from 'tailwind-merge';
import { clsx, type ClassValue } from 'clsx';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: 'default' | 'complete' | 'ontrack' | 'atrisk' | 'notasks' | 'inprogress' | 'backlog' | 'cancelled' | 'secondary' | 'success' | 'warning' | 'danger' | 'info';
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
    return (
        <div
            className={cn(
                "inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider transition-colors",
                {
                    "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300": variant === 'default',
                    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400": variant === 'complete' || variant === 'success',
                    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400": variant === 'ontrack' || variant === 'info',
                    "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400": variant === 'atrisk' || variant === 'danger',
                    "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400": variant === 'notasks' || variant === 'secondary',
                    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400": variant === 'inprogress' || variant === 'warning',
                    "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400": variant === 'backlog',
                    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400": variant === 'cancelled',
                },
                className
            )}
            {...props}
        />
    );
}

'use client';

import { ReactNode } from 'react';

export type TaskBadgeKind =
    | 'todo'
    | 'in_progress'
    | 'on_hold'
    | 'done'
    | 'done_late'
    | 'overdue';

interface TaskStatusBadgeProps {
    kind: TaskBadgeKind;
    /** Optional extra label suffix, e.g. "Late by 3d" */
    suffix?: string;
    className?: string;
}

interface BadgeSpec {
    label: string;
    icon: ReactNode;
    classes: string;
}

function iconCheck() {
    return (
        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function iconPause() {
    return (
        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
            <rect x="3" y="2" width="2" height="8" rx="0.5" />
            <rect x="7" y="2" width="2" height="8" rx="0.5" />
        </svg>
    );
}

function iconClock() {
    return (
        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" aria-hidden>
            <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth={1.5} />
            <path d="M6 3v3l2 1.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
        </svg>
    );
}

function iconHalf() {
    return (
        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" aria-hidden>
            <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth={1.5} />
            <path d="M6 1a5 5 0 010 10z" fill="currentColor" />
        </svg>
    );
}

function iconCircle() {
    return (
        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" aria-hidden>
            <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth={1.5} />
        </svg>
    );
}

const SPECS: Record<TaskBadgeKind, BadgeSpec> = {
    todo: {
        label: 'Todo',
        icon: iconCircle(),
        classes: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    },
    in_progress: {
        label: 'In progress',
        icon: iconHalf(),
        classes: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-900',
    },
    on_hold: {
        label: 'On hold',
        icon: iconPause(),
        classes: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
    },
    done: {
        label: 'Done',
        icon: iconCheck(),
        classes: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900',
    },
    done_late: {
        label: 'Done · Late',
        icon: iconCheck(),
        classes: 'bg-emerald-100 text-emerald-700 border-amber-400 ring-1 ring-amber-400 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-amber-500',
    },
    overdue: {
        label: 'Overdue',
        icon: iconClock(),
        classes: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900',
    },
};

export function TaskStatusBadge({ kind, suffix, className = '' }: TaskStatusBadgeProps) {
    const spec = SPECS[kind];
    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${spec.classes} ${className}`}
            aria-label={suffix ? `${spec.label} ${suffix}` : spec.label}
        >
            {spec.icon}
            <span>{spec.label}{suffix ? ` · ${suffix}` : ''}</span>
        </span>
    );
}

/** Helper: map an `IDPTask` shape to the badge kind it should render. */
export function inferBadgeKind(task: {
    progress_status: 'TODO' | 'IN_PROGRESS' | 'ON_HOLD' | 'DONE';
    is_overdue?: boolean;
    completed_late?: boolean | null;
}): TaskBadgeKind {
    if (task.progress_status === 'DONE') return task.completed_late ? 'done_late' : 'done';
    if (task.progress_status === 'ON_HOLD') return 'on_hold';
    if (task.is_overdue) return 'overdue';
    if (task.progress_status === 'IN_PROGRESS') return 'in_progress';
    return 'todo';
}

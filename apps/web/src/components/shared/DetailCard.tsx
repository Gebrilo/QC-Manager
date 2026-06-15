import React from 'react';

// ── Shared detail-page primitives ────────────────────────────────────────────
// The visual language used by every artifact detail page (task, story, bug,
// test case, test suite). Keep these in sync across pages by importing here
// rather than redefining them locally.

export function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-3">
            {children}
        </div>
    );
}

export function QCCard({ className = '', children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm ${className}`}
            {...props}
        >
            {children}
        </div>
    );
}

export function EditIcon() {
    return (
        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M12 20h9M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
    );
}

export function TrashIcon() {
    return (
        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M3 6h18M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a2 2 0 012-2h2a2 2 0 012 2v2" />
        </svg>
    );
}

// ── Reusable composite pieces ────────────────────────────────────────────────

/** A label/value row used inside "Details" sidebar cards. */
export function DetailRow({
    label,
    value,
    valueClass = 'text-slate-700 dark:text-slate-200',
}: {
    label: string;
    value: React.ReactNode;
    valueClass?: string;
}) {
    return (
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 last:border-0 py-3 last:pb-0 first:pt-0">
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 flex-shrink-0">
                {label}
            </div>
            <div className={`text-sm font-semibold tabular-nums text-right min-w-0 truncate ${value ? valueClass : 'text-slate-400'}`}>
                {value || '—'}
            </div>
        </div>
    );
}

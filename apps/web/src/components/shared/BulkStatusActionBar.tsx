'use client';

import { useEffect, useState } from 'react';
import { CheckSquare, Loader2, X } from 'lucide-react';
import { statusRegistry, type StatusArtifactType } from '@/lib/statusRegistry';

interface BulkStatusActionBarProps {
    artifactType: StatusArtifactType;
    selectedCount: number;
    isApplying?: boolean;
    onApplyStatus: (status: string) => void | Promise<void>;
    onClear: () => void;
    className?: string;
}

export function BulkStatusActionBar({
    artifactType,
    selectedCount,
    isApplying = false,
    onApplyStatus,
    onClear,
    className = '',
}: BulkStatusActionBarProps) {
    const entry = statusRegistry[artifactType];
    const [selectedStatus, setSelectedStatus] = useState(entry.statuses[0]);

    useEffect(() => {
        setSelectedStatus(entry.statuses[0]);
    }, [entry]);

    if (selectedCount === 0) return null;

    const selectedOption = entry.getOption(selectedStatus);
    const disabled = isApplying || selectedCount === 0;

    return (
        <div
            data-testid="bulk-status-bar"
            className={[
                'flex flex-col gap-3 rounded-xl border border-indigo-200 bg-indigo-50/80 px-4 py-3 shadow-sm',
                'dark:border-indigo-900/60 dark:bg-indigo-950/30 sm:flex-row sm:items-center sm:justify-between',
                className,
            ].join(' ')}
        >
            <div className="flex items-center gap-2 text-sm font-medium text-indigo-900 dark:text-indigo-100">
                <CheckSquare className="h-4 w-4 text-indigo-600 dark:text-indigo-300" aria-hidden />
                <span>{selectedCount} selected</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor={`bulk-status-${artifactType}`}>Bulk status</label>
                <div className="relative">
                    <select
                        id={`bulk-status-${artifactType}`}
                        data-testid="bulk-status-select"
                        aria-label="Bulk status"
                        value={selectedStatus}
                        disabled={disabled}
                        onChange={event => setSelectedStatus(event.target.value)}
                        className="h-9 min-w-[160px] appearance-none rounded-lg border border-indigo-200 bg-white pl-3 pr-8 text-sm text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-indigo-800 dark:bg-slate-950 dark:text-slate-200"
                    >
                        {entry.statuses.map(status => {
                            const option = entry.getOption(status);
                            return <option key={option.value} value={option.value}>{option.label}</option>;
                        })}
                    </select>
                    <span
                        className={`pointer-events-none absolute right-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full ${selectedOption.dotClass}`}
                        aria-hidden
                    />
                </div>

                <button
                    type="button"
                    data-testid="bulk-status-apply"
                    disabled={disabled}
                    onClick={() => onApplyStatus(selectedStatus)}
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                >
                    {isApplying && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                    Apply status
                </button>

                <button
                    type="button"
                    data-testid="bulk-selection-clear"
                    aria-label="Clear selection"
                    disabled={isApplying}
                    onClick={onClear}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white"
                >
                    <X className="h-4 w-4" aria-hidden />
                </button>
            </div>
        </div>
    );
}

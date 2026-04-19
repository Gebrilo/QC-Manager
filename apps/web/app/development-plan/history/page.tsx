'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { developmentPlansApi, IDPHistoryEntry } from '../../../src/lib/api';
import { useToast } from '../../../src/components/ui/Toast';

function fmtDate(v?: string | null) {
    if (!v) return '';
    return v.slice(0, 10);
}

export default function DevelopmentPlanHistoryPage() {
    const [plans, setPlans] = useState<IDPHistoryEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const toast = useToast();

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const data = await developmentPlansApi.listMyHistory();
                if (!cancelled) setPlans(data);
            } catch (err: any) {
                if (!cancelled) toast.error(err?.message || 'Could not load history');
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [toast]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
            </div>
        );
    }

    return (
        <div>
            <div className="mb-6 flex items-center gap-3">
                <Link href="/development-plan" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                    ← Current plan
                </Link>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Plan History</h1>
            </div>

            {plans.length === 0 ? (
                <div className="text-center py-16 text-slate-500 dark:text-slate-400">
                    <p className="text-lg font-medium mb-1">No archived plans</p>
                    <p className="text-sm">Completed plans will appear here.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {plans.map(p => (
                        <Link
                            key={p.id}
                            href={`/development-plan/history/${p.id}`}
                            className="block bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 hover:border-indigo-400 transition-colors"
                        >
                            <div className="flex items-center justify-between gap-4">
                                <div className="min-w-0">
                                    <p className="font-semibold text-slate-900 dark:text-white truncate">{p.title}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                        Archived {fmtDate(p.archived_at)}
                                    </p>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <span className="text-sm text-slate-600 dark:text-slate-300">
                                        {p.progress.completion_pct}%
                                    </span>
                                    <span className="text-xs text-slate-400">
                                        {p.progress.done_tasks}/{p.progress.total_tasks} tasks
                                    </span>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}

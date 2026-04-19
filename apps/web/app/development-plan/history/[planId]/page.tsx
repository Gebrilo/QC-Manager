'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { developmentPlansApi, IDPPlan } from '../../../../src/lib/api';
import { useToast } from '../../../../src/components/ui/Toast';

function fmtDate(v?: string | null) {
    if (!v) return '';
    return v.slice(0, 10);
}

export default function ArchivedPlanDetailPage() {
    const params = useParams();
    const planId = params.planId as string;
    const [plan, setPlan] = useState<IDPPlan | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const toast = useToast();

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const p = await developmentPlansApi.getMyHistoryPlan(planId);
                if (!cancelled) setPlan(p);
            } catch (err: any) {
                if (cancelled) return;
                if (err?.status === 404 || /not found/i.test(err?.message || '')) {
                    setNotFound(true);
                } else {
                    toast.error(err?.message || 'Could not load plan');
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [planId, toast]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
            </div>
        );
    }

    if (notFound || !plan) {
        return (
            <div className="text-center py-16 text-slate-500 dark:text-slate-400">
                <p className="text-lg font-medium mb-1">Plan not found</p>
                <Link href="/development-plan/history" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                    ← Back to history
                </Link>
            </div>
        );
    }

    return (
        <div>
            <div className="mb-6">
                <Link href="/development-plan/history" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                    ← History
                </Link>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{plan.title}</h1>
                {plan.description && (
                    <p className="text-slate-500 dark:text-slate-400 mt-1">{plan.description}</p>
                )}
                <div className="flex items-center gap-3 mt-3 text-sm text-slate-600 dark:text-slate-300">
                    <span>{plan.progress.completion_pct}% complete</span>
                    <span className="text-slate-400">·</span>
                    <span>{plan.progress.done_tasks}/{plan.progress.total_tasks} tasks done</span>
                </div>
            </div>

            <div className="space-y-5">
                {plan.objectives.map(obj => (
                    <div key={obj.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                        <div className="flex items-start justify-between mb-3">
                            <div>
                                <h3 className="font-semibold text-slate-900 dark:text-white">{obj.title}</h3>
                                {obj.due_date && <p className="text-xs text-slate-400 mt-0.5">Due {fmtDate(obj.due_date)}</p>}
                            </div>
                            <span className="text-sm text-slate-500">{obj.progress.completion_pct}%</span>
                        </div>
                        <div className="space-y-2">
                            {obj.tasks.map(task => (
                                <div key={task.id} className="flex items-center gap-3 py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                                    <span className="text-xs font-mono text-slate-500">{task.progress_status}</span>
                                    <span className={`flex-1 text-sm ${task.progress_status === 'DONE' ? 'text-slate-500 line-through' : 'text-slate-800 dark:text-slate-200'}`}>
                                        {task.title}
                                    </span>
                                    {task.progress_status === 'DONE' && task.completed_at && (
                                        <span className="text-xs text-emerald-600 dark:text-emerald-400">
                                            Completed {fmtDate(task.completed_at)}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

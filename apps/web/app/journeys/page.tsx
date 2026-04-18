'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { myJourneysApi, developmentPlansApi, AssignedJourney, IDPPlan } from '../../src/lib/api';
import { useAuth } from '../../src/components/providers/AuthProvider';

function showError(msg: string) { alert(msg); }
function showSuccess(msg: string) { console.log(msg); }

function fmtDate(v?: string | null) {
    if (!v) return '';
    return v.slice(0, 10);
}

export default function JourneysPage() {
    const [journeys, setJourneys] = useState<AssignedJourney[]>([]);
    const [idpPlan, setIdpPlan] = useState<IDPPlan | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();
    const { userStatus } = useAuth();

    const isActive = userStatus === 'ACTIVE';
    const pageTitle   = isActive ? 'My Development Plan' : 'My Journeys';
    const pageSubtitle = isActive
        ? 'Your ongoing development journey as an active resource.'
        : 'Track your onboarding progress and complete assigned tasks.';
    const statusBadge = isActive
        ? { label: 'Active',         classes: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300' }
        : { label: 'In Preparation', classes: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' };

    useEffect(() => {
        async function load() {
            try {
                if (isActive) {
                    try {
                        const plan = await developmentPlansApi.getMy();
                        setIdpPlan(plan);
                    } catch {
                        // No IDP plan yet — show empty state
                    }
                } else {
                    const data = await myJourneysApi.list();
                    setJourneys(data);
                }
            } catch (err) {
                console.error('Failed to load journeys:', err);
            } finally {
                setIsLoading(false);
            }
        }
        load();
    }, [isActive]);

    async function handleUpdateTaskStatus(taskId: string, currentStatus: string) {
        const next = currentStatus === 'TODO' ? 'IN_PROGRESS' : currentStatus === 'IN_PROGRESS' ? 'DONE' : 'TODO';
        try {
            await developmentPlansApi.updateMyTaskStatus(taskId, next as 'TODO' | 'IN_PROGRESS' | 'DONE');
            const updated = await developmentPlansApi.getMy();
            setIdpPlan(updated);
        } catch (err) {
            console.error('Failed to update task status:', err);
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
            </div>
        );
    }

    return (
        <div>
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-1">
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{pageTitle}</h1>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusBadge.classes}`}>
                        {statusBadge.label}
                    </span>
                </div>
                <p className="text-slate-500 dark:text-slate-400">{pageSubtitle}</p>
            </div>

            {/* ACTIVE: show IDP plan */}
            {isActive && (
                <>
                    {!idpPlan ? (
                        <div className="text-center py-16 text-slate-500 dark:text-slate-400">
                            <p className="text-lg font-medium mb-1">No Development Plan Yet</p>
                            <p className="text-sm">Your manager will create your development plan. Check back soon.</p>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            <div className="flex items-center gap-4 mb-4">
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                    {idpPlan.progress.completion_pct}% complete
                                </span>
                                <div className="flex-1 max-w-xs bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                                    <div className="bg-indigo-500 h-2 rounded-full transition-all" style={{ width: `${idpPlan.progress.completion_pct}%` }} />
                                </div>
                                {idpPlan.progress.overdue_tasks > 0 && (
                                    <span className="text-xs bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 px-2 py-0.5 rounded-full">
                                        {idpPlan.progress.overdue_tasks} overdue
                                    </span>
                                )}
                            </div>

                            {idpPlan.objectives.map(obj => (
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
                                            <div key={task.id} className={`flex items-center gap-3 py-2 border-b border-slate-100 dark:border-slate-700 last:border-0 ${task.is_overdue ? 'opacity-80' : ''}`}>
                                                <button
                                                    onClick={() => handleUpdateTaskStatus(task.id, task.progress_status)}
                                                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors
                                                        ${task.progress_status === 'DONE' ? 'bg-emerald-500 border-emerald-500' :
                                                          task.progress_status === 'IN_PROGRESS' ? 'bg-indigo-200 border-indigo-500' :
                                                          'border-slate-300 dark:border-slate-600'}`}
                                                    title={`Click to advance: ${task.progress_status}`}
                                                >
                                                    {task.progress_status === 'DONE' && (
                                                        <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                                                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                                                        </svg>
                                                    )}
                                                </button>
                                                <span className={`flex-1 text-sm ${task.progress_status === 'DONE' ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-200'}`}>
                                                    {task.title}
                                                </span>
                                                {task.is_overdue && (
                                                    <span className="text-xs text-red-500">overdue</span>
                                                )}
                                                {task.due_date && !task.is_overdue && (
                                                    <span className="text-xs text-slate-400">{fmtDate(task.due_date)}</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* PREPARATION: show onboarding journeys (existing behaviour) */}
            {!isActive && journeys.length === 0 && (
                <div className="text-center py-20">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">No Journeys Assigned</h3>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">You don&apos;t have any journeys assigned yet.</p>
                </div>
            )}

            {!isActive && journeys.length > 0 && (
                <div className="space-y-4">
                    {journeys.map(j => (
                        <div
                            key={j.id}
                            onClick={() => router.push(`/journeys/${j.journey_id}`)}
                            className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 cursor-pointer hover:border-indigo-400 transition-colors"
                        >
                            <p className="font-semibold text-slate-900 dark:text-white">{j.title}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

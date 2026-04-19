'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { myJourneysApi, developmentPlansApi, AssignedJourney, IDPPlan, IDPTask } from '../../src/lib/api';
import { useAuth } from '../../src/components/providers/AuthProvider';
import { useToast } from '../../src/components/ui/Toast';
import { TaskStatusControl } from '../../src/components/idp/TaskStatusControl';
import { TaskStatusBadge, inferBadgeKind } from '../../src/components/idp/TaskStatusBadge';
import { TaskCommentsPanel } from '../../src/components/idp/TaskCommentsPanel';

function fmtDate(v?: string | null) {
    if (!v) return '';
    return v.slice(0, 10);
}

function lateSuffix(dueDate: string, completedAt: string) {
    const due = new Date(dueDate);
    const done = new Date(completedAt);
    const days = Math.max(1, Math.round((done.getTime() - due.getTime()) / 86400000));
    return `Late by ${days}d`;
}

export default function JourneysPage() {
    const [journeys, setJourneys] = useState<AssignedJourney[]>([]);
    const [idpPlan, setIdpPlan] = useState<IDPPlan | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();
    const { userStatus, user } = useAuth();
    const toast = useToast();
    const [commentsTask, setCommentsTask] = useState<IDPTask | null>(null);

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

    async function reloadPlan() {
        try {
            const updated = await developmentPlansApi.getMy();
            setIdpPlan(updated);
        } catch (err: any) {
            toast.error(err?.message || 'Could not refresh plan');
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
                                        {obj.tasks.map(task => {
                                            const badgeKind = inferBadgeKind(task);
                                            const showBadge = ['on_hold', 'overdue', 'done_late'].includes(badgeKind);
                                            return (
                                                <div
                                                    key={task.id}
                                                    className="flex items-center gap-3 py-2 border-b border-slate-100 dark:border-slate-700 last:border-0"
                                                >
                                                    <TaskStatusControl task={task} onStatusChanged={reloadPlan} />
                                                    <span className={`flex-1 text-sm ${task.progress_status === 'DONE' ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-200'}`}>
                                                        {task.title}
                                                    </span>
                                                    {showBadge && (
                                                        <TaskStatusBadge
                                                            kind={badgeKind}
                                                            suffix={badgeKind === 'done_late' && task.completed_at && task.due_date
                                                                ? lateSuffix(task.due_date, task.completed_at)
                                                                : undefined}
                                                        />
                                                    )}
                                                    {task.progress_status === 'DONE' && badgeKind === 'done' && task.completed_at && (
                                                        <span className="text-xs text-emerald-600 dark:text-emerald-400">
                                                            Completed {fmtDate(task.completed_at)}
                                                        </span>
                                                    )}
                                                    {(task.start_date || task.due_date) && task.progress_status !== 'DONE' && badgeKind !== 'overdue' && badgeKind !== 'on_hold' && (
                                                        <span className="text-xs text-slate-400">
                                                            {task.start_date ? fmtDate(task.start_date) : ''}{task.start_date && task.due_date ? ' → ' : ''}{task.due_date ? fmtDate(task.due_date) : ''}
                                                        </span>
                                                    )}
                                                    <button
                                                        type="button"
                                                        aria-label={`Open comments for ${task.title}`}
                                                        onClick={() => setCommentsTask(task)}
                                                        className="text-xs text-slate-400 hover:text-indigo-500 px-1.5 py-1 rounded"
                                                        title="Comments"
                                                    >
                                                        💬
                                                    </button>
                                                </div>
                                            );
                                        })}
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

            <TaskCommentsPanel
                open={commentsTask !== null}
                taskId={commentsTask?.id ?? null}
                taskTitle={commentsTask?.title ?? ''}
                currentUserId={user?.id ?? ''}
                onClose={() => setCommentsTask(null)}
            />
        </div>
    );
}

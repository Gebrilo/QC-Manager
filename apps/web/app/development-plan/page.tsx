'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { developmentPlansApi, IDPPlan, IDPTask } from '../../src/lib/api';
import { useAuth } from '../../src/components/providers/AuthProvider';
import { useToast } from '../../src/components/ui/Toast';
import { TaskStatusControl } from '../../src/components/idp/TaskStatusControl';
import { TaskStatusBadge, inferBadgeKind } from '../../src/components/idp/TaskStatusBadge';
import { TaskCommentsPanel } from '../../src/components/idp/TaskCommentsPanel';
import PlanTabs from '../../src/components/idp/PlanTabs';
import TaskLinks from '../../src/components/idp/TaskLinks';
import TaskAttachments from '../../src/components/idp/TaskAttachments';

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

export default function DevelopmentPlanPage() {
    const [plans, setPlans] = useState<IDPPlan[]>([]);
    const [activePlanId, setActivePlanId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const { user } = useAuth();
    const toast = useToast();
    const [commentsTask, setCommentsTask] = useState<IDPTask | null>(null);

    const plan = plans.find(p => p.id === activePlanId) || plans[0] || null;

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const allPlans = await developmentPlansApi.getMy();
                if (!cancelled && allPlans.length > 0) {
                    setPlans(allPlans);
                    setActivePlanId(allPlans[0].id);
                }
            } catch {
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    async function handlePlanChange(planId: string) {
        setActivePlanId(planId);
        try {
            const fullPlan = await developmentPlansApi.getMyPlan(planId);
            setPlans(prev => prev.map(p => p.id === planId ? fullPlan : p));
        } catch (err: any) {
            toast.error(err?.message || 'Could not load plan');
        }
    }

    const reloadPlan = useCallback(async () => {
        try {
            const allPlans = await developmentPlansApi.getMy();
            setPlans(allPlans);
            if (allPlans.length > 0) {
                setActivePlanId(prev => {
                    if (!prev || !allPlans.find(p => p.id === prev)) {
                        return allPlans[0].id;
                    }
                    return prev;
                });
            }
        } catch (err: any) {
            toast.error(err?.message || 'Could not refresh plan');
        }
    }, [toast]);

    async function handleUpload(taskId: string, file: File) {
        await developmentPlansApi.uploadMyTaskAttachment(taskId, file);
        await reloadPlan();
    }

    async function handleDelete(attachmentId: string) {
        await developmentPlansApi.deleteAttachment(attachmentId);
        await reloadPlan();
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
            <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My Development Plan</h1>
                        {plan?.is_active && (
                            <span className="text-xs font-medium px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                                Active
                            </span>
                        )}
                    </div>
                    <p className="text-slate-500 dark:text-slate-400">Your ongoing development journey as an active resource.</p>
                </div>
                <Link
                    href="/development-plan/history"
                    className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap"
                >
                    View history →
                </Link>
            </div>

            {!plan ? (
                <div className="text-center py-16 text-slate-500 dark:text-slate-400">
                    <p className="text-lg font-medium mb-1">No Development Plan Yet</p>
                    <p className="text-sm">Your manager will create your development plan. Check back soon.</p>
                </div>
            ) : (
                <div className="space-y-5">
                    <PlanTabs
                        plans={plans.map(p => ({ id: p.id, title: p.title, completion_pct: p.progress.completion_pct }))}
                        activePlanId={activePlanId || plan.id}
                        onPlanChange={handlePlanChange}
                    />

                    <div className="flex items-center gap-4 mb-4">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            {plan.progress.completion_pct}% complete
                        </span>
                        <div className="flex-1 max-w-xs bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                            <div className="bg-indigo-500 h-2 rounded-full transition-all" style={{ width: `${plan.progress.completion_pct}%` }} />
                        </div>
                        {plan.progress.overdue_tasks > 0 && (
                            <span className="text-xs bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 px-2 py-0.5 rounded-full">
                                {plan.progress.overdue_tasks} overdue
                            </span>
                        )}
                    </div>

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
                                {obj.tasks.map(task => {
                                    const badgeKind = inferBadgeKind(task);
                                    const showBadge = ['on_hold', 'overdue', 'done_late'].includes(badgeKind);
                                    return (
                                        <div
                                            key={task.id}
                                            className="py-2 border-b border-slate-100 dark:border-slate-700 last:border-0"
                                        >
                                            <div className="flex items-center gap-3">
                                                <TaskStatusControl task={task} onStatusChanged={reloadPlan} />
                                                <span className={`flex-1 text-sm ${task.progress_status === 'DONE' ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-200'}`}>
                                                    {task.title}
                                                </span>
                                                {task.requires_attachment && !task.attachments?.some(a => a.uploaded_by_role === 'resource') && (
                                                    <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 py-0.5 rounded">
                                                        Attachment required
                                                    </span>
                                                )}
                                                {showBadge && (
                                                    <TaskStatusBadge
                                                        kind={badgeKind}
                                                        suffix={badgeKind === 'done_late' && task.completed_at && task.due_date
                                                            ? lateSuffix(task.due_date, task.completed_at)
                                                            : undefined}
                                                    />
                                                )}
                                                {task.progress_status === 'ON_HOLD' && task.hold_reason && (
                                                    <span
                                                        className="text-xs italic text-amber-600 dark:text-amber-300 truncate max-w-[200px]"
                                                        title={task.hold_reason}
                                                    >
                                                        &ldquo;{task.hold_reason}&rdquo;
                                                    </span>
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
                                                    className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-500 px-1.5 py-1 rounded"
                                                    title="Comments"
                                                >
                                                    💬
                                                    {(task.comment_count ?? 0) > 0 && (
                                                        <span className="font-medium text-indigo-500">{task.comment_count}</span>
                                                    )}
                                                </button>
                                            </div>
                                            {(task.links && task.links.length > 0) && (
                                                <TaskLinks links={task.links} isManager={false} />
                                            )}
                                            <TaskAttachments
                                                attachments={task.attachments || []}
                                                isManager={false}
                                                currentUserId={user?.id ?? ''}
                                                onUpload={async (file) => handleUpload(task.id, file)}
                                                onDelete={async (attachmentId) => handleDelete(attachmentId)}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
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
'use client';

import { useMemo, useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { fetchApi, taskTestCaseLinksApi } from '@/lib/api';
import { Task } from '@/types';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { TaskCommentSection } from '@/components/tasks/TaskCommentSection';
import {
    LinkedArtifactsSection,
    type LinkedArtifactsSectionConfig,
} from '@/components/shared/LinkedArtifactsSection';
import type { ArtifactPickerItem } from '@/components/shared/ArtifactPicker';
import { AttachmentSection } from '@/components/shared/AttachmentSection';
import { SyncPanel } from '@/components/shared/SyncPanel';
import { tasksApi } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import Link from 'next/link';
import { StatusControl } from '@/components/shared/StatusControl';
import { useAuth } from '@/components/providers/AuthProvider';
import { taskStatusRegistry } from '@/lib/statusRegistry';
import { QCCard, SectionLabel } from '@/components/shared/DetailCard';

// ── Page ────────────────────────────────────────────────────────────────────

export default function TaskDetailPage() {
    const params = useParams();
    const id = (params?.id as string) || '';
    const router = useRouter();
    const toast = useToast();
    const confirmAction = useConfirm();
    const { hasPermission } = useAuth();
    const [task, setTask] = useState<Task | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function load() {
            try {
                const data = await fetchApi<Task>(`/tasks/${id}`);
                setTask(data);
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        }
        if (id) load();
    }, [id]);

    const handleDelete = async () => {
        if (!task) return;
        const confirmed = await confirmAction({
            title: 'Archive task',
            message: `Are you sure you want to delete task "${task.task_name}"? This will archive the task.`,
            confirmLabel: 'Archive',
            variant: 'danger',
        });
        if (!confirmed) return;
        try {
            await fetchApi(`/tasks/${task.id}`, { method: 'DELETE' });
            toast.success('Task deleted successfully');
            router.push('/work/tasks');
        } catch (err: any) {
            toast.error(`Failed to delete task: ${err.message}`);
        }
    };

    if (isLoading) return <div className="p-10 text-center"><Spinner size="lg" /></div>;
    if (!task) return <div className="p-10 text-center text-slate-500">Task not found</div>;

    const status = task.status || '';
    const progress = Number(task.overall_completion_pct || 0);
    const statusOption = taskStatusRegistry.getOption(status);
    const progressGradient = statusOption.progressGradient || 'from-slate-400 to-slate-300';
    const progressTextColor = statusOption.progressTextClass || 'text-slate-500';

    const patchTask = (patch: Partial<Task>) => {
        setTask(prev => prev ? { ...prev, ...patch } : prev);
    };

    const handleStatusCommitted = (_nextStatus: string, updated: unknown) => {
        if (!updated || typeof updated !== 'object') return;
        setTask(prev => {
            if (!prev) return prev;
            const next = updated as Partial<Task>;
            return { ...prev, ...next, _can: next._can ?? prev._can };
        });
    };

    return (
        <div className="max-w-[1280px] mx-auto px-6 py-6 space-y-5">

            {/* ── Header ─────────────────────────────────────────────── */}
            <div className="flex items-start justify-between gap-6">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                    <button
                        onClick={() => router.back()}
                        className="mt-2 text-sm font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors flex-shrink-0"
                    >
                        ← Back
                    </button>
                    <div className="min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white" dir="auto">
                                {task.task_name}
                            </h1>
                            <StatusControl
                                artifactType="task"
                                artifactId={task.id}
                                value={status}
                                canEdit={task._can?.edit}
                                hasFallbackPermission={hasPermission(taskStatusRegistry.editPermission)}
                                size="md"
                                align="left"
                                onOptimisticChange={(nextStatus) => patchTask({ status: nextStatus as Task['status'] })}
                                onChangeCommitted={handleStatusCommitted}
                                onChangeRolledBack={(previousStatus) => patchTask({ status: previousStatus as Task['status'] })}
                            />
                        </div>
                        <div className="mt-1.5 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                            {task.tuleap_url ? (
                                <a
                                    href={task.tuleap_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-mono font-semibold text-violet-600 dark:text-violet-300 hover:underline"
                                >
                                    {task.task_id}
                                </a>
                            ) : (
                                <span className="font-mono font-semibold text-violet-600 dark:text-violet-300">
                                    {task.task_id}
                                </span>
                            )}
                            <span className="text-slate-300 dark:text-slate-600">·</span>
                            <span>{task.project_name || 'No Project'}</span>
                        </div>
                        {task.parent_user_story_id && (
                            <Link
                                href={`/work/stories/${task.parent_user_story_id}`}
                                className="mt-1 inline-flex text-xs font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
                            >
                                ↗ Parent user story
                            </Link>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    <Link href={`/work/tasks/${task.id}/edit`}>
                        <Button variant="outline" size="sm" className="gap-1.5">
                            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z" />
                            </svg>
                            Edit Task
                        </Button>
                    </Link>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDelete}
                        className="gap-1.5 text-rose-600 border-rose-300 hover:bg-rose-50 dark:text-rose-400 dark:border-rose-800 dark:hover:bg-rose-900/20"
                    >
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M3 6h18M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a2 2 0 012-2h2a2 2 0 012 2v2" />
                        </svg>
                        Delete
                    </Button>
                </div>
            </div>

            {/* ── Two-column layout ───────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-5">

                {/* Left (2/3) */}
                <div className="col-span-2 space-y-5">

                    {/* Description */}
                    <QCCard>
                        <SectionLabel>Description</SectionLabel>
                        {task.description ? (
                            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                                {task.description}
                            </p>
                        ) : (
                            <p className="text-sm text-slate-400 italic">No description provided.</p>
                        )}
                    </QCCard>

                    {/* Work & Time */}
                    <QCCard>
                        <SectionLabel>Work & Time</SectionLabel>
                        <div className="grid grid-cols-2 gap-6 mb-6">
                            <div>
                                <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">
                                    Estimated Hours
                                </div>
                                <div className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
                                    {Number(task.total_est_hrs || 0).toFixed(1)}
                                </div>
                            </div>
                            <div>
                                <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">
                                    Actual Hours
                                </div>
                                <div className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
                                    {Number(task.total_actual_hrs || 0).toFixed(1)}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-baseline justify-between mb-2">
                            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Progress</div>
                            <div className={`text-sm font-bold tabular-nums ${progressTextColor}`}>
                                {progress.toFixed(2)}%
                            </div>
                        </div>
                        <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                                className={`h-full bg-gradient-to-r ${progressGradient} transition-all duration-700`}
                                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                            />
                        </div>
                    </QCCard>

                    {/* Notes */}
                    <QCCard>
                        <SectionLabel>Notes</SectionLabel>
                        {task.notes ? (
                            <div
                                className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_strong]:font-semibold [&_em]:italic [&_a]:text-indigo-600 [&_a]:underline"
                                dangerouslySetInnerHTML={{
                                    __html: task.notes
                                        .replace(/<script[\s\S]*?<\/script>/gi, '')
                                        .replace(/<iframe[\s\S]*?<\/iframe>/gi, ''),
                                }}
                            />
                        ) : (
                            <p className="text-sm text-slate-400 italic">No notes added.</p>
                        )}
                    </QCCard>

                    {/* Comments */}
                    <TaskCommentSection taskId={task.id} />
                </div>

                {/* Right column (1/3) */}
                <div className="space-y-5">
                    <SyncPanel
                        status={task.sync_status}
                        lastAttemptedAt={task.last_sync_attempted_at}
                        error={task.last_sync_error}
                        tuleapUrl={task.tuleap_url}
                        artifactType="task"
                        artifactId={task.id}
                        syncFn={(id) => tasksApi.sync(id)}
                    />

                    {/* Resources */}
                    <QCCard>
                        <SectionLabel>Resources</SectionLabel>
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-lg shadow-violet-500/30 flex-shrink-0">
                                    R1
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                                        {task.resource1_name || 'Unassigned'}
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Primary Resource</p>
                                </div>
                            </div>
                            {task.resource2_name && (
                                <div className="flex items-center gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white font-bold text-xs shadow-lg shadow-indigo-500/30 flex-shrink-0">
                                        R2
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                                            {task.resource2_name}
                                        </p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">Secondary Resource</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </QCCard>

                    {/* Dates */}
                    <QCCard>
                        <SectionLabel>Dates</SectionLabel>
                        <div className="space-y-0">
                            {([
                                { label: 'Expected Start', value: task.expected_start_date, cls: 'text-slate-700 dark:text-slate-200' },
                                { label: 'Actual Start',   value: task.actual_start_date,   cls: 'text-slate-700 dark:text-slate-200' },
                                { label: 'Deadline',       value: task.deadline,             cls: 'text-rose-600 dark:text-rose-400' },
                                { label: 'Completed',      value: task.completed_date,       cls: 'text-emerald-600 dark:text-emerald-400' },
                            ] as const).map(({ label, value, cls }) => (
                                <div
                                    key={label}
                                    className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 last:border-0 py-3 last:pb-0 first:pt-0"
                                >
                                    <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                                        {label}
                                    </div>
                                    <div className={`text-sm font-semibold tabular-nums ${value ? cls : 'text-slate-400'}`}>
                                        {value ? new Date(value).toLocaleDateString() : '—'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </QCCard>

                    {/* Quick Actions */}
                    <QCCard>
                        <SectionLabel>Quick Actions</SectionLabel>
                        <div className="space-y-1">
                            <Link
                                href={`/work/tasks/${task.id}/edit`}
                                className="w-full px-3 py-2 rounded-lg text-sm text-left text-slate-700 dark:text-slate-200 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors flex items-center gap-2"
                            >
                                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75M8.5 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                                Reassign resource
                            </Link>
                            <Link
                                href={`/work/tasks/${task.id}/edit`}
                                className="w-full px-3 py-2 rounded-lg text-sm text-left text-slate-700 dark:text-slate-200 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors flex items-center gap-2"
                            >
                                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                                </svg>
                                Reschedule
                            </Link>
                            <button
                                disabled
                                className="w-full px-3 py-2 rounded-lg text-sm text-left text-slate-400 cursor-not-allowed flex items-center gap-2"
                            >
                                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                                </svg>
                                Export task
                            </button>
                        </div>
                    </QCCard>
                </div>
            </div>

            {/* ── Linked Artifacts ────────────────────────────────────── */}
            <TaskLinkedArtifactsSections taskId={task.id} projectId={task.project_id || null} />

            <AttachmentSection
                artifactType="task"
                artifactId={task.id}
                tempId={null}
            />
        </div>
    );
}

// ── Linked artifacts ─────────────────────────────────────────────────────────

function TaskLinkedArtifactsSections({ taskId, projectId }: { taskId: string; projectId: string | null }) {
    const sections: LinkedArtifactsSectionConfig[] = useMemo(() => [
        {
            title: 'Linked Test Cases',
            emptyLabel: 'No linked test cases yet.',
            artifactType: 'test_case',
            pickerTitle: 'Link test cases to this task',
            viewPermission: 'qc.testcases.view',
            editPermission: 'qc.tasks.edit',
            load: async () => {
                const response = await taskTestCaseLinksApi.listTestCases(taskId);
                return response.data.map(row => ({
                    id: row.id,
                    artifactId: row.test_case_id,
                    displayId: row.test_case_display_id || row.test_case_id.slice(0, 8),
                    title: row.test_case_title || '(no title)',
                    status: row.test_case_status,
                    href: `/test/cases/${row.test_case_id}`,
                    source: row.source || 'qc',
                    relationshipType: row.relationship_type || 'covers',
                }));
            },
            add: async (items: ArtifactPickerItem[]) => {
                for (const item of items) {
                    await taskTestCaseLinksApi.addTestCase(taskId, item.id, 'covers');
                }
            },
            remove: async (row) => {
                await taskTestCaseLinksApi.removeTestCase(taskId, row.artifactId);
            },
        },
        {
            title: 'Linked Bugs',
            emptyLabel: 'No linked bugs yet.',
            artifactType: 'bug',
            pickerTitle: 'Link bugs to this task',
            viewPermission: 'qc.bugs.view',
            editPermission: 'qc.tasks.edit',
            load: async () => {
                const response = await taskTestCaseLinksApi.listBugsForTask(taskId);
                return response.data.map(row => ({
                    id: row.id,
                    artifactId: row.bug_id,
                    displayId: row.bug_display_id || row.bug_id.slice(0, 8),
                    title: row.bug_title || '(no title)',
                    status: row.bug_status,
                    href: `/work/bugs/${row.bug_id}`,
                    source: row.source || 'qc',
                    relationshipType: row.relationship_type || 'blocks',
                }));
            },
            add: async (items: ArtifactPickerItem[]) => {
                for (const item of items) {
                    await taskTestCaseLinksApi.addBugToTask(taskId, item.id, 'blocks');
                }
            },
            remove: async (row) => {
                await taskTestCaseLinksApi.removeBugFromTask(taskId, row.artifactId);
            },
        },
    ], [taskId]);

    return (
        <div className="space-y-4">
            {sections.map(section => (
                <LinkedArtifactsSection key={section.title} config={section} projectId={projectId} />
            ))}
        </div>
    );
}

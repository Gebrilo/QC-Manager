'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { fetchApi, projectsApi, resourcesApi } from '@/lib/api';
import { Task } from '@/types';
import { TaskTable, HIDEABLE_TASK_COLUMNS } from '@/components/tasks/TaskTable';
import type { VisibilityState } from '@tanstack/react-table';
import { ViewToggle } from '@/components/tasks/ViewToggle';
import Link from 'next/link';
import { useAuth } from '@/components/providers/AuthProvider';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { Skeleton } from '@/components/ui/Skeleton';
import { taskStatusRegistry, canEditStatus } from '@/lib/statusRegistry';
import { BulkStatusActionBar } from '@/components/shared/BulkStatusActionBar';
import { useToast } from '@/components/ui/Toast';

interface Project { id: string; project_id: string; project_name: string; }
interface Resource { id: string; resource_name: string; }

const PRIORITY_COLORS: Record<string, string> = {
    High:   'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
    Medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    Low:    'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
};

const BULK_SELECTION_LIMIT = 50;
const BULK_STATUS_CONCURRENCY = 5;

const TASK_BOARD_COLUMNS = taskStatusRegistry.statuses.map(status => {
    const option = taskStatusRegistry.getOption(status);
    return {
        status,
        label: option.label,
        badge: option.pillClass,
        border: option.borderClass || 'border-slate-300 dark:border-slate-600',
    };
});

function GlassSelect({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
    return (
        <div className="relative">
            <select
                value={value}
                onChange={e => onChange(e.target.value)}
                className="appearance-none h-10 pl-3.5 pr-8 rounded-lg bg-white/70 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/50 dark:border-slate-700/50 text-sm text-slate-600 dark:text-slate-300 hover:border-violet-400/60 transition-colors focus:outline-none focus:border-violet-500 cursor-pointer"
            >
                {children}
            </select>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <path d="M6 9l6 6 6-6" />
            </svg>
        </div>
    );
}

function getBulkErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'unknown error';
}

async function runWithConcurrency<T, R>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<R>
) {
    const results: R[] = new Array(items.length);
    let nextIndex = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            results[currentIndex] = await worker(items[currentIndex]);
        }
    });
    await Promise.all(workers);
    return results;
}

export default function TasksPage() {
    const router = useRouter();
    const { hasPermission } = useAuth();
    const toast = useToast();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [resources, setResources] = useState<Resource[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProject, setSelectedProject] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('');
    const [selectedAssignee, setSelectedAssignee] = useState('');
    const [selectedPriority, setSelectedPriority] = useState('');
    const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
    const [isApplyingBulkStatus, setIsApplyingBulkStatus] = useState(false);

    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
        expected_start_date: false,
        actual_start_date: false,
    });

    const [viewMode, setViewMode] = useState<'table' | 'board'>(() => {
        if (typeof window !== 'undefined') {
            return (localStorage.getItem('tasks_view_mode') as 'table' | 'board') || 'table';
        }
        return 'table';
    });

    const handleViewChange = (mode: 'table' | 'board') => {
        setViewMode(mode);
        if (typeof window !== 'undefined') localStorage.setItem('tasks_view_mode', mode);
    };

    const patchTask = (taskId: string, patch: Partial<Task>) => {
        setTasks(prev => prev.map(task => task.id === taskId ? { ...task, ...patch } : task));
    };

    const handleStatusCommitted = (taskId: string, _nextStatus: string, updated: unknown) => {
        if (!updated || typeof updated !== 'object') return;
        setTasks(prev => prev.map(task => {
            if (task.id !== taskId) return task;
            const next = updated as Partial<Task>;
            return { ...task, ...next, _can: next._can ?? task._can };
        }));
    };

    const hasTaskStatusEditPermission = hasPermission(taskStatusRegistry.editPermission);

    useEffect(() => {
        async function load() {
            try {
                const [tasksData, projectsData, resourcesData] = await Promise.all([
                    fetchApi<Task[]>('/tasks', { cache: 'no-store' }),
                    projectsApi.list().catch(() => []),
                    resourcesApi.list().catch(() => [])
                ]);
                setTasks(tasksData);
                setProjects(Array.isArray(projectsData) ? projectsData : []);
                setResources(Array.isArray(resourcesData) ? resourcesData : []);
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        }
        load();
    }, []);

    const filteredTasks = useMemo(() => {
        return tasks.filter(task => {
            if (searchTerm) {
                const lower = searchTerm.toLowerCase();
                const matchesSearch =
                    task.task_name.toLowerCase().includes(lower) ||
                    task.task_id.toLowerCase().includes(lower) ||
                    task.project_name?.toLowerCase().includes(lower) ||
                    task.resource1_name?.toLowerCase().includes(lower);
                if (!matchesSearch) return false;
            }
            if (selectedProject && task.project_id !== selectedProject) return false;
            if (selectedStatus && taskStatusRegistry.normalize(task.status) !== selectedStatus) return false;
            if (selectedAssignee && task.resource1_id !== selectedAssignee && task.resource2_id !== selectedAssignee) return false;
            if (selectedPriority && task.priority !== selectedPriority) return false;
            return true;
        });
    }, [tasks, searchTerm, selectedProject, selectedStatus, selectedAssignee, selectedPriority]);

    useEffect(() => {
        const visibleTaskIds = new Set(filteredTasks.map(task => task.id));
        setSelectedTaskIds(prev => {
            let changed = false;
            const next = new Set<string>();
            prev.forEach(id => {
                if (visibleTaskIds.has(id)) {
                    next.add(id);
                } else {
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, [filteredTasks]);

    const stats = useMemo(() => ({
        total:       tasks.length,
        inProgress:  tasks.filter(t => taskStatusRegistry.normalize(t.status) === 'In Progress').length,
        done:        tasks.filter(t => taskStatusRegistry.normalize(t.status) === 'Done').length,
        highPriority: tasks.filter(t => t.priority === 'High').length,
    }), [tasks]);

    const hasAnyFilter = !!(searchTerm || selectedProject || selectedStatus || selectedAssignee || selectedPriority);
    const taskById = useMemo(() => new Map(tasks.map(task => [task.id, task])), [tasks]);
    const selectedTasks = useMemo(
        () => Array.from(selectedTaskIds)
            .map(id => taskById.get(id))
            .filter((task): task is Task => Boolean(task)),
        [selectedTaskIds, taskById]
    );

    const isTaskSelectable = (task: Task) => canEditStatus(task._can?.edit, hasTaskStatusEditPermission);

    const handleToggleTaskSelection = (taskId: string, selected: boolean) => {
        const task = taskById.get(taskId);
        if (!task) return;
        if (selected && !isTaskSelectable(task)) {
            toast.warning("You don't have permission to select this task");
            return;
        }
        if (selected && !selectedTaskIds.has(taskId) && selectedTaskIds.size >= BULK_SELECTION_LIMIT) {
            toast.warning(`Selection is limited to ${BULK_SELECTION_LIMIT} tasks`);
            return;
        }
        setSelectedTaskIds(prev => {
            const next = new Set(prev);
            if (selected) {
                next.add(taskId);
            } else {
                next.delete(taskId);
            }
            return next;
        });
    };

    const handleToggleAllSelection = (selected: boolean) => {
        if (!selected) {
            setSelectedTaskIds(new Set());
            return;
        }

        const selectableIds = filteredTasks
            .filter(task => isTaskSelectable(task))
            .map(task => task.id);
        const cappedIds = selectableIds.slice(0, BULK_SELECTION_LIMIT);
        setSelectedTaskIds(new Set(cappedIds));
        if (selectableIds.length > BULK_SELECTION_LIMIT) {
            toast.warning(`Selected the first ${BULK_SELECTION_LIMIT} editable tasks. Refine filters to update more.`);
        }
    };

    const handleBulkStatusApply = async (nextStatus: string) => {
        if (selectedTasks.length === 0 || isApplyingBulkStatus) return;

        const normalizedStatus = taskStatusRegistry.normalize(nextStatus);
        const candidates = selectedTasks.slice(0, BULK_SELECTION_LIMIT);
        const previousStatuses = new Map(candidates.map(task => [task.id, taskStatusRegistry.normalize(task.status)]));
        const editableTasks: Task[] = [];
        const failureReasons: string[] = [];

        candidates.forEach(task => {
            if (isTaskSelectable(task)) {
                editableTasks.push(task);
            } else {
                failureReasons.push('no permission');
            }
        });

        editableTasks.forEach(task => {
            patchTask(task.id, { status: normalizedStatus as Task['status'] });
        });

        setIsApplyingBulkStatus(true);
        try {
            const results = await runWithConcurrency(editableTasks, BULK_STATUS_CONCURRENCY, async (task) => {
                const previousStatus = previousStatuses.get(task.id) || taskStatusRegistry.normalize(task.status);
                const payload = taskStatusRegistry.defaultFills?.(normalizedStatus, { previousStatus }) || {};
                try {
                    const updated = await taskStatusRegistry.update(task.id, normalizedStatus, payload);
                    return { task, ok: true as const, updated };
                } catch (error) {
                    return { task, ok: false as const, error };
                }
            });

            let updatedCount = 0;
            let failedCount = failureReasons.length;

            results.forEach(result => {
                if (result.ok) {
                    updatedCount += 1;
                    handleStatusCommitted(result.task.id, normalizedStatus, result.updated);
                    return;
                }
                failedCount += 1;
                failureReasons.push(getBulkErrorMessage(result.error));
                const previousStatus = previousStatuses.get(result.task.id) || taskStatusRegistry.normalize(result.task.status);
                patchTask(result.task.id, { status: previousStatus as Task['status'] });
            });

            const distinctReasons = Array.from(new Set(failureReasons.filter(Boolean)));
            const reasonSuffix = distinctReasons.length > 0 ? ` (${distinctReasons.slice(0, 2).join(', ')})` : '';
            if (failedCount === 0) {
                toast.success(`${updatedCount} updated`);
            } else if (updatedCount > 0) {
                toast.warning(`${updatedCount} updated, ${failedCount} failed${reasonSuffix}`);
            } else {
                toast.error(`0 updated, ${failedCount} failed${reasonSuffix}`);
            }
            setSelectedTaskIds(new Set());
        } finally {
            setIsApplyingBulkStatus(false);
        }
    };

    return (
        <div className="max-w-[1600px] mx-auto px-6 py-6 space-y-5">

            {/* ── Header ─────────────────────────────────────────────── */}
            <div className="flex items-end justify-between">
                <div>
                    <h1 className="text-4xl font-bold text-slate-900 dark:text-white tracking-tight">Tasks</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
                        All tasks across projects · Total{' '}
                        <span className="font-semibold text-slate-700 dark:text-slate-200">{tasks.length}</span>
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <ViewToggle view={viewMode} onChange={handleViewChange} />
                <PermissionGate permission="qc.tasks.create" fallbackTooltip="Requires editor access to create tasks">
                    <Link
                        href="/work/tasks/create"
                        className="inline-flex items-center gap-2 h-10 px-4 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 active:scale-95 transition-all"
                    >
                        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M12 5v14M5 12h14" />
                        </svg>
                        New Task
                    </Link>
                </PermissionGate>
                {!hasAnyFilter && filteredTasks.length === 0 && !isLoading && (
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                        Tasks you can view may be limited by your permissions. Check your dashboard to see tasks assigned to you.
                    </div>
                )}
                </div>
            </div>

            {/* ── Stat strip ─────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                    { label: 'Total',        value: isLoading ? '—' : stats.total,        dot: 'bg-slate-400' },
                    { label: 'In Progress',  value: isLoading ? '—' : stats.inProgress,   dot: 'bg-indigo-500' },
                    { label: 'Done',         value: isLoading ? '—' : stats.done,          dot: 'bg-emerald-500' },
                    { label: 'High Priority', value: isLoading ? '—' : stats.highPriority, dot: 'bg-rose-500' },
                ].map(s => (
                    <div key={s.label} className="glass-card rounded-xl px-4 py-3 flex items-center justify-between">
                        <div>
                            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{s.label}</div>
                            {isLoading ? (
                                <Skeleton className="mt-1 h-7 w-12" />
                            ) : (
                                <div className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">{s.value}</div>
                            )}
                        </div>
                        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${s.dot}`} />
                    </div>
                ))}
            </div>

            {/* ── Filter bar ─────────────────────────────────────────── */}
            <div className="glass-card rounded-2xl p-3 flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[240px]">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                        <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                    </svg>
                    <input
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Search name, ID, project…"
                        className="w-full h-10 pl-10 pr-4 rounded-lg bg-white/70 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/50 dark:border-slate-700/50 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-violet-500 transition-colors"
                    />
                </div>
                <GlassSelect value={selectedProject} onChange={setSelectedProject}>
                    <option value="">All Projects</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
                </GlassSelect>
                <GlassSelect value={selectedStatus} onChange={setSelectedStatus}>
                    <option value="">All Statuses</option>
                    {taskStatusRegistry.statuses.map(s => {
                        const option = taskStatusRegistry.getOption(s);
                        return <option key={s} value={s}>{option.label}</option>;
                    })}
                </GlassSelect>
                <GlassSelect value={selectedAssignee} onChange={setSelectedAssignee}>
                    <option value="">All Assignees</option>
                    {resources.map(r => <option key={r.id} value={r.id}>{r.resource_name}</option>)}
                </GlassSelect>
                <GlassSelect value={selectedPriority} onChange={setSelectedPriority}>
                    <option value="">All Priorities</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                </GlassSelect>
                {hasAnyFilter && (
                    <button
                        onClick={() => { setSearchTerm(''); setSelectedProject(''); setSelectedStatus(''); setSelectedAssignee(''); setSelectedPriority(''); }}
                        className="h-10 px-3 rounded-lg text-sm text-slate-500 hover:text-rose-500 dark:text-slate-400 dark:hover:text-rose-400 flex items-center gap-1.5 transition-colors"
                    >
                        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                        Clear
                    </button>
                )}

                {/* Column visibility toggle */}
                {viewMode === 'table' && (
                    <div className="relative group ml-auto">
                        <button className="h-10 w-10 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-800/60 transition-colors">
                            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                                <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </button>
                        <div className="absolute right-0 top-full mt-2 w-52 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 z-30 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 p-2">
                            <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                Columns
                            </div>
                            {HIDEABLE_TASK_COLUMNS.map(col => (
                                <label
                                    key={col.id}
                                    className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        checked={columnVisibility[col.id] !== false}
                                        onChange={e => setColumnVisibility(prev => ({ ...prev, [col.id]: e.target.checked }))}
                                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span>{col.header}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* ── Table / Board ──────────────────────────────────────── */}
            {viewMode === 'board' ? (
                <TaskBoardView
                    tasks={filteredTasks}
                    filteredTasks={filteredTasks}
                    isLoading={isLoading}
                    onTaskClick={(id) => router.push(`/work/tasks/${id}`)}
                />
            ) : (
                <>
                    <BulkStatusActionBar
                        artifactType="task"
                        selectedCount={selectedTaskIds.size}
                        isApplying={isApplyingBulkStatus}
                        onApplyStatus={handleBulkStatusApply}
                        onClear={() => setSelectedTaskIds(new Set())}
                    />
                    <TaskTable
                        tasks={filteredTasks}
                        isLoading={isLoading}
                        columnVisibility={columnVisibility}
                        onColumnVisibilityChange={setColumnVisibility}
                        hasStatusEditPermission={hasTaskStatusEditPermission}
                        selectedTaskIds={selectedTaskIds}
                        selectionLimit={BULK_SELECTION_LIMIT}
                        onToggleTaskSelection={handleToggleTaskSelection}
                        onToggleAllSelection={handleToggleAllSelection}
                        onStatusOptimisticChange={(taskId, nextStatus) => patchTask(taskId, { status: nextStatus as Task['status'] })}
                        onStatusCommitted={handleStatusCommitted}
                        onStatusRolledBack={(taskId, previousStatus) => patchTask(taskId, { status: previousStatus as Task['status'] })}
                    />
                </>
            )}
        </div>
    );
}

function TaskBoardView({ tasks, filteredTasks, isLoading, onTaskClick }: { tasks: Task[]; filteredTasks: Task[]; isLoading: boolean; onTaskClick: (id: string) => void }) {
    const grouped = useMemo(() => {
        const g = Object.fromEntries(taskStatusRegistry.statuses.map(status => [status, [] as Task[]])) as Record<string, Task[]>;
        tasks.forEach(t => {
            const status = taskStatusRegistry.normalize(t.status);
            if (g[status]) g[status].push(t);
        });
        return g;
    }, [tasks]);

    if (isLoading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {TASK_BOARD_COLUMNS.map(col => (
                    <div key={col.status} className="space-y-3">
                        <Skeleton className="h-10 rounded-xl" />
                        {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {TASK_BOARD_COLUMNS.map(col => {
                const colTasks = grouped[col.status] || [];
                return (
                    <div key={col.status} className="flex flex-col">
                        <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 border-t-2 ${col.border} px-4 py-2.5 rounded-xl mb-3 flex items-center justify-between`}>
                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{col.label}</span>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${col.badge}`}>{colTasks.length}</span>
                        </div>
                        <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-320px)]">
                             {colTasks.length === 0 ? (
                                 <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-5 text-center">
                                     <p className="text-sm text-slate-400">No tasks</p>
                                     {!isLoading && filteredTasks.length === 0 && (
                                         <p className="text-xs text-slate-500 dark:text-slate-500 mt-1 max-w-[150px] mx-auto">
                                             Tasks you can view may be limited by permissions
                                         </p>
                                     )}
                                 </div>
                             ) : colTasks.map(task => (
                                <div
                                    key={task.id}
                                    onClick={() => onTaskClick(task.id)}
                                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-sm transition-all"
                                >
                                    <p className="text-sm font-medium text-slate-900 dark:text-white line-clamp-2 leading-snug mb-2">{task.task_name}</p>
                                    {task.project_name && (
                                        <p className="text-xs text-slate-400 mb-2 truncate">{task.project_name}</p>
                                    )}
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            {task.priority && (
                                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.Low}`}>
                                                    {task.priority}
                                                </span>
                                            )}
                                            {task.overall_completion_pct !== undefined && task.overall_completion_pct > 0 && (
                                                <span className="text-[10px] text-slate-400">{Math.round(task.overall_completion_pct)}%</span>
                                            )}
                                        </div>
                                        {(task.resource1_name || task.resource2_name) && (
                                            <span className="text-[10px] text-slate-400 truncate max-w-[80px]">
                                                {task.resource1_name || task.resource2_name}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

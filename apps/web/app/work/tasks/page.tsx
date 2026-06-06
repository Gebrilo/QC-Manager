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

interface Project { id: string; project_id: string; project_name: string; }
interface Resource { id: string; resource_name: string; }

const STATUS_OPTIONS = ['Backlog', 'In Progress', 'Done', 'Cancelled'];

const PRIORITY_COLORS: Record<string, string> = {
    High:   'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
    Medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    Low:    'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
};

const TASK_BOARD_COLUMNS = [
    { status: 'Backlog',     label: 'Backlog',     badge: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',      border: 'border-slate-300 dark:border-slate-600' },
    { status: 'In Progress', label: 'In Progress', badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400', border: 'border-indigo-300 dark:border-indigo-600' },
    { status: 'Done',        label: 'Done',        badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', border: 'border-emerald-300 dark:border-emerald-600' },
    { status: 'Cancelled',   label: 'Cancelled',   badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',        border: 'border-rose-300 dark:border-rose-600' },
];

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

export default function TasksPage() {
    const router = useRouter();
    const { hasPermission } = useAuth();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [resources, setResources] = useState<Resource[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProject, setSelectedProject] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('');
    const [selectedAssignee, setSelectedAssignee] = useState('');
    const [selectedPriority, setSelectedPriority] = useState('');

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
            if (selectedStatus && task.status !== selectedStatus) return false;
            if (selectedAssignee && task.resource1_id !== selectedAssignee && task.resource2_id !== selectedAssignee) return false;
            if (selectedPriority && task.priority !== selectedPriority) return false;
            return true;
        });
    }, [tasks, searchTerm, selectedProject, selectedStatus, selectedAssignee, selectedPriority]);

    const stats = useMemo(() => ({
        total:       tasks.length,
        inProgress:  tasks.filter(t => t.status === 'In Progress').length,
        done:        tasks.filter(t => t.status === 'Done').length,
        highPriority: tasks.filter(t => t.priority === 'High').length,
    }), [tasks]);

    const hasAnyFilter = !!(searchTerm || selectedProject || selectedStatus || selectedAssignee || selectedPriority);

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
                            <div className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">{s.value}</div>
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
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
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
                    isLoading={isLoading}
                    onTaskClick={(id) => router.push(`/work/tasks/${id}`)}
                />
            ) : (
                <TaskTable
                    tasks={filteredTasks}
                    isLoading={isLoading}
                    columnVisibility={columnVisibility}
                    onColumnVisibilityChange={setColumnVisibility}
                />
            )}
        </div>
    );
}

function TaskBoardView({ tasks, isLoading, onTaskClick }: { tasks: Task[]; isLoading: boolean; onTaskClick: (id: string) => void }) {
    const grouped = useMemo(() => {
        const g: Record<string, Task[]> = { Backlog: [], 'In Progress': [], Done: [], Cancelled: [] };
        tasks.forEach(t => { if (g[t.status]) g[t.status].push(t); });
        return g;
    }, [tasks]);

    if (isLoading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {TASK_BOARD_COLUMNS.map(col => (
                    <div key={col.status} className="space-y-3">
                        <div className="h-10 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
                        {[1, 2, 3].map(i => <div key={i} className="h-24 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />)}
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

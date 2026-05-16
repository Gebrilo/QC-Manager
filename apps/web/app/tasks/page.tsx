'use client';

import { useState, useEffect, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { fetchApi, projectsApi, resourcesApi } from '@/lib/api';
import { Task } from '@/types';
import { TaskTable } from '@/components/tasks/TaskTable';
import { ViewToggle } from '@/components/tasks/ViewToggle';
import { Button } from '@/components/ui/Button';
import {
    ActivityFilters,
    type ActivityFilterOption,
    type ActivityFiltersConfig,
    type ActivityFiltersValue,
} from '@/components/ui/ActivityFilters';
import { buildActivityQuery, parseActivityFilters, writeActivityFiltersToParams } from '@/lib/activityFilters';
import Link from 'next/link';
import { useAuth } from '@/components/providers/AuthProvider';

interface Project {
    id: string;
    project_id: string;
    project_name: string;
}

interface Resource {
    id: string;
    resource_name: string;
}

const STATUS_OPTIONS = ['All', 'Backlog', 'In Progress', 'Done', 'Cancelled'];
const PRIORITY_OPTIONS = ['High', 'Medium', 'Low'];

const TASK_FILTER_CONFIG: ActivityFiltersConfig = {
    slots: ['search', 'project', 'status', 'assignee', 'priority', 'source', 'date', 'relatedArtifact'],
    statusOptions: STATUS_OPTIONS.filter(status => status !== 'All').map(status => ({ value: status, label: status })),
    priorityOptions: PRIORITY_OPTIONS.map(priority => ({ value: priority, label: priority })),
    relatedArtifactTypes: [
        { value: 'user_story', label: 'User Story', searchTypes: ['user_story'] },
        { value: 'test_case', label: 'Test Case', searchTypes: ['test_case'] },
        { value: 'bug', label: 'Bug', searchTypes: ['bug'] },
    ],
};

function buildTaskQuery(filters: ActivityFiltersValue) {
    return buildActivityQuery(filters, {
        projectIds: 'project_id',
        statuses: 'statuses',
        assigneeIds: 'assignee_ids',
        priorities: 'priorities',
    });
}

export default function TasksPage() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { hasPermission } = useAuth();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [resources, setResources] = useState<Resource[]>([]);
    const [relatedArtifacts, setRelatedArtifacts] = useState<ActivityFilterOption[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const searchParamString = searchParams.toString();
    const filters = useMemo(() => parseActivityFilters(new URLSearchParams(searchParamString)), [searchParamString]);

    // View mode with localStorage persistence
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
                const [projectsData, resourcesData] = await Promise.all([
                    projectsApi.list().catch(() => []),
                    resourcesApi.list().catch(() => []),
                ]);
                setProjects(Array.isArray(projectsData) ? projectsData : []);
                setResources(Array.isArray(resourcesData) ? resourcesData : []);
            } catch (err) {
                console.error(err);
            }
        }
        load();
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function loadTasks() {
            setIsLoading(true);
            try {
                const tasksData = await fetchApi<Task[]>(`/tasks${buildTaskQuery(filters)}`, { cache: 'no-store' });
                if (!cancelled) setTasks(tasksData);
            } catch (err) {
                console.error(err);
                if (!cancelled) setTasks([]);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        loadTasks();
        return () => { cancelled = true; };
    }, [filters]);

    useEffect(() => {
        if (filters.relatedId && relatedArtifacts.every(option => option.value !== filters.relatedId)) {
            setRelatedArtifacts([{ value: filters.relatedId, label: filters.relatedId }]);
        }
    }, [filters.relatedId, relatedArtifacts]);

    const updateFilters = (nextFilters: ActivityFiltersValue) => {
        const params = new URLSearchParams(searchParamString);
        writeActivityFiltersToParams(params, nextFilters);
        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    };

    const handleRelatedArtifactSearch = async (query: string, relatedType: string) => {
        if (query.trim().length < 2 || !relatedType) {
            setRelatedArtifacts(filters.relatedId ? [{ value: filters.relatedId, label: filters.relatedId }] : []);
            return;
        }

        try {
            const response = await fetchApi<{ data: Array<{ id: string; display_id: string; title: string }> }>(
                `/search?q=${encodeURIComponent(query.trim())}&type=${encodeURIComponent(relatedType)}&limit=20`
            );
            setRelatedArtifacts(response.data.map(item => ({
                value: item.id,
                label: `${item.display_id} - ${item.title}`,
            })));
        } catch (err) {
            console.error(err);
            setRelatedArtifacts([]);
        }
    };

    const projectOptions = useMemo<ActivityFilterOption[]>(
        () => projects.map(project => ({ value: project.id, label: project.project_name })),
        [projects]
    );
    const assigneeOptions = useMemo<ActivityFilterOption[]>(
        () => resources.map(resource => ({ value: resource.id, label: resource.resource_name })),
        [resources]
    );

    return (
        <div className="space-y-6 py-6 px-4 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Tasks</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Manage all tasks across projects.</p>
                </div>
                <div className="flex items-center gap-3">
                    <ViewToggle view={viewMode} onChange={handleViewChange} />
                    {hasPermission('qc.tasks.create') && (
                        <Link href="/work/tasks/create">
                            <Button className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-500/30 border-none">
                                + New Task
                            </Button>
                        </Link>
                    )}
                </div>
            </div>

            <ActivityFilters
                value={filters}
                config={TASK_FILTER_CONFIG}
                projects={projectOptions}
                assignees={assigneeOptions}
                relatedArtifacts={relatedArtifacts}
                relatedArtifactPlaceholder="Search by ID or title"
                resultSummary={`${tasks.length} task${tasks.length === 1 ? '' : 's'}`}
                onChange={updateFilters}
                onRelatedArtifactSearch={handleRelatedArtifactSearch}
            />

            {/* Task Table / Board */}
            {viewMode === 'board' ? (
                <TaskBoardView
                    tasks={tasks}
                    isLoading={isLoading}
                    onTaskClick={(id) => router.push(`/work/tasks/${id}`)}
                />
            ) : (
                <TaskTable tasks={tasks} isLoading={isLoading} />
            )}
        </div>
    );
}

// ─── Board View ───────────────────────────────────────────────────────────────

const TASK_BOARD_COLUMNS = [
    { status: 'Backlog',     label: 'Backlog',      badge: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',  border: 'border-slate-300 dark:border-slate-600' },
    { status: 'In Progress', label: 'In Progress',  badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400', border: 'border-indigo-300 dark:border-indigo-600' },
    { status: 'Done',        label: 'Done',         badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', border: 'border-emerald-300 dark:border-emerald-600' },
    { status: 'Cancelled',   label: 'Cancelled',    badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',    border: 'border-rose-300 dark:border-rose-600' },
];

const PRIORITY_COLORS: Record<string, string> = {
    High:   'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
    Medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    Low:    'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
};

function TaskBoardView({ tasks, isLoading, onTaskClick }: { tasks: Task[], isLoading: boolean, onTaskClick: (id: string) => void }) {
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
                        {[1,2,3].map(i => <div key={i} className="h-24 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />)}
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

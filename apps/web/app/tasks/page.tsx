'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { fetchApi, projectsApi, resourcesApi } from '@/lib/api';
import { Task } from '@/types';
import { TaskTable } from '@/components/tasks/TaskTable';
import { Button } from '@/components/ui/Button';
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

export default function TasksPage() {
    const router = useRouter();
    const { hasPermission } = useAuth();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [resources, setResources] = useState<Resource[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Filter states
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProject, setSelectedProject] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('');
    const [selectedAssignee, setSelectedAssignee] = useState('');

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
            // Search filter
            if (searchTerm) {
                const lower = searchTerm.toLowerCase();
                const matchesSearch =
                    task.task_name.toLowerCase().includes(lower) ||
                    task.task_id.toLowerCase().includes(lower) ||
                    task.project_name?.toLowerCase().includes(lower) ||
                    task.resource1_name?.toLowerCase().includes(lower);
                if (!matchesSearch) return false;
            }

            // Project filter
            if (selectedProject && task.project_id !== selectedProject) {
                return false;
            }

            // Status filter
            if (selectedStatus && selectedStatus !== 'All' && task.status !== selectedStatus) {
                return false;
            }

            // Assignee filter
            if (selectedAssignee) {
                if (task.resource1_id !== selectedAssignee && task.resource2_id !== selectedAssignee) {
                    return false;
                }
            }

            return true;
        });
    }, [tasks, searchTerm, selectedProject, selectedStatus, selectedAssignee]);

    const clearFilters = () => {
        setSearchTerm('');
        setSelectedProject('');
        setSelectedStatus('');
        setSelectedAssignee('');
    };

    const hasActiveFilters = searchTerm || selectedProject || selectedStatus || selectedAssignee;

    return (
        <div className="space-y-6 py-6 px-4 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Tasks</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Manage all tasks across projects.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => router.push('/task-history')}
                        className="px-4 py-2 text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium transition-colors"
                    >
                        View Task History →
                    </button>
                    {hasPermission('action:tasks:create') && (
                        <Link href="/tasks/create">
                            <Button className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-500/30 border-none">
                                + New Task
                            </Button>
                        </Link>
                    )}
                </div>
            </div>

            {/* Filter Bar */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
                <div className="flex flex-col lg:flex-row gap-4">
                    {/* Search Input */}
                    <div className="relative flex-1 min-w-0">
                        <input
                            type="text"
                            placeholder="Search tasks by name, ID..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all outline-none"
                        />
                        <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>

                    {/* Filter Dropdowns */}
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Project Filter */}
                        <div className="relative">
                            <select
                                value={selectedProject}
                                onChange={(e) => setSelectedProject(e.target.value)}
                                className="appearance-none pl-3 pr-8 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all outline-none cursor-pointer min-w-[140px]"
                            >
                                <option value="">All Projects</option>
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.project_name}</option>
                                ))}
                            </select>
                            <svg className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>

                        {/* Status Filter */}
                        <div className="relative">
                            <select
                                value={selectedStatus}
                                onChange={(e) => setSelectedStatus(e.target.value)}
                                className="appearance-none pl-3 pr-8 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all outline-none cursor-pointer min-w-[130px]"
                            >
                                <option value="">All Statuses</option>
                                {STATUS_OPTIONS.filter(s => s !== 'All').map(status => (
                                    <option key={status} value={status}>{status}</option>
                                ))}
                            </select>
                            <svg className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>

                        {/* Assignee Filter */}
                        <div className="relative">
                            <select
                                value={selectedAssignee}
                                onChange={(e) => setSelectedAssignee(e.target.value)}
                                className="appearance-none pl-3 pr-8 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all outline-none cursor-pointer min-w-[140px]"
                            >
                                <option value="">All Assignees</option>
                                {resources.map(r => (
                                    <option key={r.id} value={r.id}>{r.resource_name}</option>
                                ))}
                            </select>
                            <svg className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>

                        {/* Clear Filters */}
                        {hasActiveFilters && (
                            <button
                                onClick={clearFilters}
                                className="px-3 py-2 text-sm text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors flex items-center gap-1"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                Clear
                            </button>
                        )}
                    </div>
                </div>

                {/* Active Filters Display */}
                {hasActiveFilters && (
                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Active:</span>
                        {searchTerm && (
                            <span className="px-2 py-1 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs rounded-md">
                                Search: "{searchTerm}"
                            </span>
                        )}
                        {selectedProject && (
                            <span className="px-2 py-1 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs rounded-md">
                                Project: {projects.find(p => p.id === selectedProject)?.project_name}
                            </span>
                        )}
                        {selectedStatus && (
                            <span className="px-2 py-1 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs rounded-md">
                                Status: {selectedStatus}
                            </span>
                        )}
                        {selectedAssignee && (
                            <span className="px-2 py-1 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs rounded-md">
                                Assignee: {resources.find(r => r.id === selectedAssignee)?.resource_name}
                            </span>
                        )}
                        <span className="text-xs text-slate-400 ml-2">
                            ({filteredTasks.length} of {tasks.length} tasks)
                        </span>
                    </div>
                )}
            </div>

            {/* Task Table */}
            <TaskTable tasks={filteredTasks} isLoading={isLoading} />
        </div>
    );
}

'use client';

import { useState, useEffect, useMemo } from 'react';
import { fetchApi } from '@/lib/api';
import { Project } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { InfoTooltip } from '@/components/ui/Tooltip';
import { Skeleton } from '@/components/ui/Skeleton';
import Link from 'next/link';
import { useAuth } from '@/components/providers/AuthProvider';

interface ProjectWithStats extends Project {
    taskHrsEst: number;
    taskHrsActual: number;
    taskHrsDone: number;
    tasksTotal: number;
    tasksDone: number;
    completionPct: number;
    effortPct: number | null;
    computedStatus: string;
}

function ProjectCardSkeleton() {
    return (
        <Card className="space-y-6">
            <div className="flex items-start gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                <Skeleton className="h-16 w-16 shrink-0 rounded-xl" />
                <div className="flex-1 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                        <div className="space-y-2 flex-1">
                            <Skeleton className="h-6 w-48 max-w-full" />
                            <Skeleton className="h-4 w-full max-w-md" />
                        </div>
                        <Skeleton className="h-6 w-20 rounded-full" />
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-y-6 gap-x-4">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="space-y-2">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-4 w-14" />
                    </div>
                ))}
            </div>
            <Skeleton className="h-3 w-full rounded-full" />
        </Card>
    );
}

export default function ProjectsPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const { hasPermission } = useAuth();

    useEffect(() => {
        async function load() {
            try {
                const pData = await fetchApi<Project[]>('/projects', { cache: 'no-store' });
                setProjects(pData);
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        }
        load();
    }, []);



    const projectStats = useMemo(() => {
        return projects.map(p => {
            // Use API-provided metrics from v_projects_with_metrics view
            // These are calculated server-side and include all tasks regardless of user permissions
            const tasksTotal = Number(p.tasks_total_count) || 0;
            const tasksDone = Number(p.tasks_done_count) || 0;
            const completionPct = Number(p.overall_completion_pct) || 0;
            
            // Calculate effort completion if not provided by API
            const taskHrsEst = Number(p.task_hrs_est) || 0;
            const taskHrsActual = Number(p.task_hrs_actual) || 0;
            const taskHrsDone = Number(p.task_hrs_done) || 0;
            const effortPct = p.effort_completion_pct != null ? Number(p.effort_completion_pct) : 
                              (taskHrsEst > 0 ? Math.round((taskHrsDone / taskHrsEst) * 100 * 100) / 100 : null);

            // Determine dynamic status based on completion percentage
            // Formula matches API: No Tasks if count=0, Complete if all done, On Track if >=70%, else At Risk
            let status = p.dynamic_status || 'Active';
            if (!status || status === 'Active') {
                if (tasksTotal === 0) status = 'No Tasks';
                else if (tasksDone === tasksTotal) status = 'Complete';
                else if (completionPct >= 70) status = 'On Track';
                else status = 'At Risk';
            }

            return {
                ...p,
                taskHrsEst,
                taskHrsActual,
                taskHrsDone,
                tasksTotal,
                tasksDone,
                completionPct,
                effortPct,
                computedStatus: status
            } as ProjectWithStats;
        });
    }, [projects]);

    const filteredProjects = useMemo(() => {
        return projectStats.filter(p => {
            if (searchTerm) {
                const q = searchTerm.toLowerCase();
                if (!p.project_name.toLowerCase().includes(q) &&
                    !p.project_id.toLowerCase().includes(q) &&
                    !(p.description?.toLowerCase().includes(q))) {
                    return false;
                }
            }
            if (statusFilter && p.computedStatus !== statusFilter) return false;
            return true;
        });
    }, [projectStats, searchTerm, statusFilter]);

    const getLogo = (projectId: string) => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem(`project_logo_${projectId}`);
        }
        return null;
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString();
    };

    return (
        <div className="space-y-8 py-6 px-4 max-w-7xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Projects Registry</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Overview of all active portfolios and their health.</p>
                </div>
                {hasPermission('qc.projects.create') && (
                    <Link href="/work/projects/create">
                        <Button>+ New Project</Button>
                    </Link>
                )}
            </div>

            {!isLoading && projects.length > 0 && (
                <div className="glass-card rounded-xl p-4 flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1 min-w-0">
                        <input
                            type="text"
                            placeholder="Search projects by name, ID, description..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all outline-none"
                        />
                        <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <select
                                value={statusFilter}
                                onChange={e => setStatusFilter(e.target.value)}
                                className="appearance-none pl-3 pr-8 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all outline-none cursor-pointer min-w-[140px]"
                            >
                                <option value="">All Statuses</option>
                                <option value="Complete">Complete</option>
                                <option value="On Track">On Track</option>
                                <option value="At Risk">At Risk</option>
                                <option value="No Tasks">No Tasks</option>
                            </select>
                            <svg className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                        {(searchTerm || statusFilter) && (
                            <button
                                onClick={() => { setSearchTerm(''); setStatusFilter(''); }}
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
            )}

            {(searchTerm || statusFilter) && !isLoading && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Showing {filteredProjects.length} of {projectStats.length} projects
                </p>
            )}

            {isLoading ? (
                <div className="grid grid-cols-1 gap-6">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <ProjectCardSkeleton key={i} />
                    ))}
                </div>
            ) : projects.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-20 text-center">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">No projects found</h3>
                    <p className="text-slate-500 dark:text-slate-400 mt-2 italic">Create a new project to get started.</p>
                </div>
            ) : filteredProjects.length === 0 && (searchTerm || statusFilter) ? (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-20 text-center">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">No projects match your filters</h3>
                    <p className="text-slate-500 dark:text-slate-400 mt-2">Try adjusting your search or filter criteria.</p>
                    <button onClick={() => { setSearchTerm(''); setStatusFilter(''); }} className="mt-4 text-sm text-indigo-600 hover:text-indigo-700">Clear filters</button>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-8">
                    {filteredProjects.map((project) => {
                        const logo = getLogo(project.id);

                        const statusVariants: Record<string, "complete" | "ontrack" | "atrisk" | "notasks"> = {
                            'Complete': 'complete',
                            'On Track': 'ontrack',
                            'At Risk': 'atrisk',
                            'No Tasks': 'notasks'
                        };

                        const variant = statusVariants[project.computedStatus] || 'notasks';

                        return (
                            <Link key={project.id} href={`/work/projects/${project.id}`}>
                                <Card hover className="group transition-all duration-300">
                                    {/* Header: Logo + Name */}
                                    <div className="flex items-start gap-4 mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                                        <div className="w-16 h-16 rounded-xl bg-slate-100 dark:bg-slate-800 p-1 shrink-0 border border-slate-200 dark:border-slate-700 overflow-hidden">
                                            {logo ? (
                                                <img src={logo} alt={project.project_name} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-indigo-500 font-bold bg-white dark:bg-slate-900 rounded-lg text-2xl">
                                                    {project.project_name?.charAt(0) || '?'}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h3 className="text-xl font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 transition-colors">{project.project_name}</h3>
                                                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">{project.description || 'No description provided.'}</p>
                                                </div>
                                                <Badge variant={variant}>
                                                    {project.computedStatus}
                                                </Badge>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Detailed Grid Stats */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-y-6 gap-x-4 mb-6">
                                        <StatItem label="Project ID" value={project.project_id} />
                                        <StatItem label="Total Weight" value={project.total_weight} />
                                        <StatItem label="Task Hrs Est" value={project.taskHrsEst.toFixed(1)} />
                                        <StatItem label="Task Hrs Actual" value={project.taskHrsActual.toFixed(1)} />
                                        <StatItem label="Task Hrs Done" value={project.taskHrsDone.toFixed(1)} highlight />
                                        <StatItem label="Completion %" value={`${Math.round(project.completionPct)}%`} tooltip="Percentage of tasks marked Done" />
                                        {project.effortPct != null && (
                                            <StatItem label="Effort Completion" value={`${project.effortPct}%`} tooltip="Actual vs estimated hours for Done tasks" />
                                        )}
                                        {/* Additional stats if needed */}
                                    </div>

                                    {/* Progress Bar */}
                                    <ProgressBar value={project.completionPct} variant={variant} />
                                </Card>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function StatItem({ label, value, highlight = false, tooltip }: { label: string, value: string | number, highlight?: boolean, tooltip?: string }) {
    return (
        <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1 flex items-center gap-1">
                {label}
                {tooltip && <InfoTooltip content={tooltip} position="top" />}
            </span>
            <span className={`text-sm font-semibold ${highlight ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-900 dark:text-white'}`}>
                {value}
            </span>
        </div>
    );
}

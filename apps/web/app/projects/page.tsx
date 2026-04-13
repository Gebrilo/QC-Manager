'use client';

import { useState, useEffect, useMemo } from 'react';
import { fetchApi } from '@/lib/api';
import { Project, Task } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import Link from 'next/link';
import { useAuth } from '@/components/providers/AuthProvider';

interface ProjectStats {
    taskHrsEst: number;
    taskHrsActual: number;
    taskHrsDone: number;
    tasksTotal: number;
    tasksDone: number;
    completionPct: number;
    computedStatus: string;
}

type ProjectWithStats = Project & ProjectStats;

export default function ProjectsPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const { hasPermission } = useAuth();

    useEffect(() => {
        async function load() {
            try {
                const [pData, tData] = await Promise.all([
                    fetchApi<Project[]>('/projects', { cache: 'no-store' }),
                    fetchApi<Task[]>('/tasks', { cache: 'no-store' })
                ]);
                setProjects(pData);
                setTasks(tData);
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        }
        load();
    }, []);



    const projectStats = useMemo(() => {
        // Map project ID to basic sums
        const stats = new Map<string, {
            est: number, act: number, doneHrs: number,
            doneCnt: number, totalCnt: number
        }>();

        tasks.forEach(t => {
            if (!t.project_id) return;
            // Tasks link via project UUID (p.id), not display ID (p.project_id)

            const current = stats.get(t.project_id) || { est: 0, act: 0, doneHrs: 0, doneCnt: 0, totalCnt: 0 };

            // Use R1+R2 hours if total_est_hrs not available from API
            const tEst = Number(t.total_est_hrs) || (Number(t.r1_estimate_hrs || 0) + Number(t.r2_estimate_hrs || 0));
            const tAct = Number(t.total_actual_hrs) || (Number(t.r1_actual_hrs || 0) + Number(t.r2_actual_hrs || 0));

            current.est += tEst;
            current.act += tAct;
            current.totalCnt++;

            if (t.status === 'Done') {
                current.doneCnt++;
                current.doneHrs += tAct; // "Task Hrs Done" = Sum of Actuals for Done tasks
            }
            stats.set(t.project_id, current);
        });

        return projects.map(p => {
            // Match using Project internal ID (p.id) since tasks store project UUID
            const s = stats.get(p.id) || { est: 0, act: 0, doneHrs: 0, doneCnt: 0, totalCnt: 0 };

            // Formula: Completion % = Task Hrs Done / Task Hrs Est
            // Note: If no estimate, but work done? Context says IF(Est>0, Done/Est, 0)
            let pct = 0;
            if (s.est > 0) pct = (s.doneHrs / s.est) * 100;

            // Formula: Status
            // No Tasks if count=0
            // Complete if Tasks Done = Tasks Total
            // On Track if Pct >= 70%
            // At Risk if Pct < 70%

            let status = 'At Risk';
            if (s.totalCnt === 0) status = 'No Tasks';
            else if (s.doneCnt === s.totalCnt) status = 'Complete';
            else if (pct >= 70) status = 'On Track';

            return {
                ...p,
                taskHrsEst: s.est,
                taskHrsActual: s.act,
                taskHrsDone: s.doneHrs,
                tasksTotal: s.totalCnt,
                tasksDone: s.doneCnt,
                completionPct: pct,
                computedStatus: status
            } as ProjectWithStats;
        });
    }, [projects, tasks]);

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
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Projects Registry</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Overview of all active portfolios and their health.</p>
                </div>
                {hasPermission('action:projects:create') && (
                    <Link href="/projects/create">
                        <Button>+ New Project</Button>
                    </Link>
                )}
            </div>

            {!isLoading && projects.length > 0 && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row gap-3">
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
                    {[1, 2].map(i => (
                        <div key={i} className="h-48 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
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
                            <Link key={project.id} href={`/projects/${project.id}`}>
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
                                        <StatItem label="Completion %" value={`${Math.round(project.completionPct)}%`} />
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

function StatItem({ label, value, highlight = false }: { label: string, value: string | number, highlight?: boolean }) {
    return (
        <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">{label}</span>
            <span className={`text-sm font-semibold ${highlight ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-900 dark:text-white'}`}>
                {value}
            </span>
        </div>
    );
}

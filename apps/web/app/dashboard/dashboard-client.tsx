'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { TaskTable } from '@/components/tasks/TaskTable';
import { dashboardApi, tasksApi, myJourneysApi, fetchApi, type DashboardMetrics, type Task, type AssignedJourney } from '@/lib/api';
import { DonutChart, BarChart } from '@/components/dashboard/ChartComponents';
import { ResourceUtilizationChart } from '@/components/dashboard/ResourceUtilizationChart';
import { ResourceStats } from '@/components/dashboard/ResourceStats';
import { useTheme } from '@/components/providers/ThemeProvider';
import { supabase } from '@/lib/supabase';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { InfoTooltip } from '@/components/ui/Tooltip';
import { QuickNavCards } from '@/components/shared/QuickNavCards';

interface PersonalTask { id: string; status: 'pending' | 'in_progress' | 'done' | 'cancelled'; }

export function DashboardClient() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [journeys, setJourneys] = useState<AssignedJourney[]>([]);
    const [showQuickNav, setShowQuickNav] = useState(true);
    const [pendingPersonalTasks, setPendingPersonalTasks] = useState(0);

    // Filter State
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});

    // Month filter states for charts
    const [distributionMonth, setDistributionMonth] = useState<string>('All');
    const [projectsMonth, setProjectsMonth] = useState<string>('All');

    const MONTHS = ['All', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    // Helper to get month name from date string
    const getMonthFromDate = (dateStr?: string): string | null => {
        if (!dateStr) return null;
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return null;
            return date.toLocaleString('en-US', { month: 'long' });
        } catch {
            return null;
        }
    };

    // Theme context available if needed for dynamic styling
    useTheme();

    const load = useCallback(async () => {
        try {
            const [tasksData, metricsData, journeyData, meData, personalTasksData] = await Promise.all([
                tasksApi.list().catch(() => []),
                dashboardApi.getMetrics().catch(() => null),
                myJourneysApi.list().catch(() => []),
                fetchApi<{ user: { preferences?: { quick_nav_visible?: boolean } } }>('/auth/me').catch(() => null),
                fetchApi<PersonalTask[]>('/my-tasks').catch(() => [] as PersonalTask[]),
            ]);

            setTasks(tasksData || []);
            if (metricsData) setMetrics(metricsData);
            setJourneys(journeyData || []);
            if (meData?.user?.preferences?.quick_nav_visible === false) setShowQuickNav(false);
            setPendingPersonalTasks(
                (personalTasksData as PersonalTask[]).filter(
                    t => t.status === 'pending' || t.status === 'in_progress'
                ).length
            );
        } catch (err) {
            console.error('API failed', err);
            setTasks([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { load() }, [load]);

    // Supabase Realtime: refetch dashboard data when tasks change in the DB
    useEffect(() => {
        if (!supabase) return // Realtime disabled — polling is the fallback

        const channel = supabase
            .channel('dashboard-task-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'tasks' },
                () => {
                    // Don't use payload data — refetch from API to respect permissions
                    load()
                }
            )
            .subscribe()

        return () => {
            supabase!.removeChannel(channel)
        }
    }, [load]);

    // Derived Statistics - filtered by month selections
    const stats = useMemo(() => {
        // Filter tasks for distribution chart by month
        const distributionTasks = distributionMonth === 'All'
            ? tasks
            : tasks.filter(t => {
                const taskMonth = getMonthFromDate(t.deadline) || getMonthFromDate(t.completed_date) || getMonthFromDate(t.created_at);
                return taskMonth === distributionMonth;
            });

        const backlog = distributionTasks.filter(t => t.status === 'Backlog').length;
        const inProgress = distributionTasks.filter(t => t.status === 'In Progress').length;
        const done = distributionTasks.filter(t => t.status === 'Done').length;
        const cancelled = distributionTasks.filter(t => t.status === 'Cancelled').length;

        // Filter tasks for projects chart by month
        const projectTasks = projectsMonth === 'All'
            ? tasks
            : tasks.filter(t => {
                const taskMonth = getMonthFromDate(t.deadline) || getMonthFromDate(t.completed_date) || getMonthFromDate(t.created_at);
                return taskMonth === projectsMonth;
            });

        const projectCounts: Record<string, number> = {};
        projectTasks.forEach(t => {
            const name = t.project_name || 'Unassigned';
            projectCounts[name] = (projectCounts[name] || 0) + 1;
        });

        const barData = Object.entries(projectCounts).slice(0, 5).map(([label, value]) => ({ label, value }));

        return {
            donutData: [
                { label: 'Backlog', value: backlog, color: '#64748b' },
                { label: 'In Progress', value: inProgress, color: '#6366f1' },
                { label: 'Done', value: done, color: '#10b981' },
                { label: 'Cancelled', value: cancelled, color: '#f43f5e' },
            ],
            barData
        };
    }, [tasks, distributionMonth, projectsMonth]);

    // Filtering logic
    const filteredTasks = useMemo(() => {
        let result = tasks;

        // 1. Search Query
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(t =>
                t.task_name?.toLowerCase().includes(q) ||
                t.task_id?.toLowerCase().includes(q) ||
                t.project_name?.toLowerCase().includes(q)
            );
        }

        // 2. Active Filters
        Object.entries(activeFilters).forEach(([key, value]) => {
            if (!value) return;
            if (key === 'status') {
                result = result.filter(t => t.status === value);
            } else if (key === 'priority') {
                result = result.filter(t => t.priority === value);
            } else if (key === 'resource') {
                result = result.filter(t => t.resource1_name === value || t.resource2_name === value);
            }
        });

        return result;
    }, [tasks, searchQuery, activeFilters]);

    // Listen for search/filter events from FilterBar
    useEffect(() => {
        const handleFilterUpdate = (e: any) => {
            const { search, filters } = e.detail;
            setSearchQuery(search);
            setActiveFilters(filters);
        };
        window.addEventListener('qc-filter-update', handleFilterUpdate);
        return () => window.removeEventListener('qc-filter-update', handleFilterUpdate);
    }, []);

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Quick Nav Cards */}
            {showQuickNav && !isLoading && (
                <QuickNavCards journeys={journeys} pendingTasks={pendingPersonalTasks} />
            )}
            {/* Metrics Summary Cards — skeleton while loading */}
            {isLoading && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="glass-card rounded-xl p-5 animate-pulse">
                            <div className="h-2.5 bg-slate-200 dark:bg-slate-700 rounded w-1/2 mb-3" />
                            <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mb-2" />
                            <div className="h-2.5 bg-slate-200 dark:bg-slate-700 rounded w-2/3" />
                        </div>
                    ))}
                </div>
            )}
            {!isLoading && metrics && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <StatCard
                        title="Total Tasks"
                        value={metrics.total_tasks || 0}
                        subtitle={`${Number(metrics.overall_completion_rate_pct || 0).toFixed(1)}% complete`}
                        icon={
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                        }
                        trend={metrics.overall_completion_rate_pct && metrics.overall_completion_rate_pct > 50 ? 'up' : undefined}
                        tooltip="Total number of tasks across all projects, including completed and active ones."
                    />
                    <StatCard
                        title="Total Projects"
                        value={metrics.total_projects || 0}
                        subtitle={`${metrics.projects_with_tasks || 0} with tasks`}
                        icon={
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                            </svg>
                        }
                        tooltip="Total active projects. Projects without tasks are tracked but may not show in some charts."
                    />
                    <StatCard
                        title="Active Resources"
                        value={metrics.active_resources || 0}
                        subtitle={metrics.overallocated_resources ? `${metrics.overallocated_resources} overallocated` : 'All balanced'}
                        icon={
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                        }
                        trend={metrics.overallocated_resources && metrics.overallocated_resources > 0 ? 'down' : undefined}
                        tooltip="Number of resources currently available. 'Overallocated' means they have more hours assigned than their capacity."
                    />
                    <StatCard
                        title="Hours Variance"
                        value={metrics.total_hours_variance ? `${Number(metrics.total_hours_variance) > 0 ? '+' : ''}${Number(metrics.total_hours_variance).toFixed(1)}` : '0'}
                        subtitle={`${Number(metrics.total_actual_hrs || 0).toFixed(1)} / ${Number(metrics.total_estimated_hrs || 0).toFixed(1)} hrs`}
                        icon={
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        }
                        trend={metrics.total_hours_variance && metrics.total_hours_variance < 0 ? 'up' : metrics.total_hours_variance && metrics.total_hours_variance > 0 ? 'down' : undefined}
                        tooltip="Difference between Actual and Estimated hours. Positive (+) means over budget, Negative (-) is under budget."
                    />
                </div>
            )}

            {/* Charts Section */}
            {!isLoading && tasks.length > 0 && (
                <div className="space-y-6">
                    {/* Row 1: Task Distribution & Projects */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card className="flex flex-col items-center hover:shadow-md transition-shadow duration-300">
                            <CardHeader className="self-start w-full flex flex-row items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200">Task Distribution</CardTitle>
                                    <InfoTooltip content="Distribution of tasks by their current status (Backlog, In Progress, Done, Cancelled)." position="right" />
                                </div>
                                <select
                                    value={distributionMonth}
                                    onChange={(e) => setDistributionMonth(e.target.value)}
                                    className="text-xs border-none bg-indigo-50 dark:bg-slate-800 rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-500 text-slate-600 dark:text-slate-300"
                                >
                                    {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </CardHeader>
                            <CardContent className="flex flex-col items-center w-full">
                                <DonutChart data={stats.donutData} />
                                <div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-6 w-full px-4">
                                    {stats.donutData.map(d => (
                                        <div key={d.label} className="flex items-center gap-2">
                                            <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: d.color }} />
                                            <span className="text-xs text-slate-600 dark:text-slate-400 font-medium truncate">{d.label} ({d.value})</span>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="md:col-span-2 hover:shadow-md transition-shadow duration-300">
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200">Tasks per Project</CardTitle>
                                    <InfoTooltip content="Top 5 active projects by task count. Shows workload distribution across key initiatives." position="right" />
                                </div>
                                <select
                                    value={projectsMonth}
                                    onChange={(e) => setProjectsMonth(e.target.value)}
                                    className="text-xs border-none bg-indigo-50 dark:bg-slate-800 rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-500 text-slate-600 dark:text-slate-300"
                                >
                                    {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </CardHeader>
                            <CardContent>
                                <BarChart data={stats.barData} height={200} />
                            </CardContent>
                        </Card>
                    </div>

                    {/* Row 2: Resource Analysis */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="md:col-span-2">
                            <ResourceUtilizationChart tasks={filteredTasks} />
                        </div>
                        <div>
                            <ResourceStats tasks={filteredTasks} />
                        </div>
                    </div>
                </div>
            )}

            <section>
                <div className="glass-card rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                        Task List
                        {!isLoading && (searchQuery || Object.values(activeFilters).some(Boolean)) && (
                            <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
                                ({filteredTasks.length} of {tasks.length})
                            </span>
                        )}
                    </h2>
                    <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                        {filteredTasks.length} tasks
                    </span>
                </div>
                <TaskTable
                    tasks={filteredTasks}
                    isLoading={isLoading}
                    pagination={{ total: filteredTasks.length, limit: 10, offset: 0 }}
                    onPageChange={() => { }}
                />
                </div>
            </section>
        </div>
    );
}

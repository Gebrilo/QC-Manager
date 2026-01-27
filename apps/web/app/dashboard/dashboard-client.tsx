'use client';

import { useEffect, useState, useMemo } from 'react';
import { TaskTable } from '@/components/tasks/TaskTable';
import { dashboardApi, tasksApi, type DashboardMetrics, type Task } from '@/lib/api';
import { DonutChart, BarChart } from '@/components/dashboard/ChartComponents';
import { ResourceUtilizationChart } from '@/components/dashboard/ResourceUtilizationChart';
import { ResourceStats } from '@/components/dashboard/ResourceStats';
import { useTheme } from '@/components/providers/ThemeProvider';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';

// MOCK DATA - Fresh, realistic test data for verification (Phase 4)
import { MOCK_TASKS } from '@/data/mockData';

// MOCK DATA - Use centralized mock data
const generateMockTasks = (): Task[] => {
    return MOCK_TASKS;
};

export function DashboardClient() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Filter State
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});

    // Theme context available if needed for dynamic styling
    useTheme();

    useEffect(() => {
        async function load() {
            try {
                // Fetch both tasks and dashboard metrics in parallel
                const [tasksData, metricsData] = await Promise.all([
                    tasksApi.list().catch(() => null),
                    dashboardApi.getMetrics().catch(() => null)
                ]);

                if (tasksData && tasksData.length > 0) {
                    setTasks(tasksData);
                } else {
                    setTasks(generateMockTasks());
                }

                if (metricsData) {
                    setMetrics(metricsData);
                }
            } catch (err) {
                console.error("API failed, using mock data", err);
                setTasks(generateMockTasks());
            } finally {
                setIsLoading(false);
            }
        }
        load();
    }, []);

    // Derived Statistics - Use API metrics if available, fallback to local calculation
    const stats = useMemo(() => {
        const backlog = metrics?.tasks_backlog ?? tasks.filter(t => t.status === 'Backlog').length;
        const inProgress = metrics?.tasks_in_progress ?? tasks.filter(t => t.status === 'In Progress').length;
        const done = metrics?.tasks_done ?? tasks.filter(t => t.status === 'Done').length;
        const cancelled = metrics?.tasks_cancelled ?? tasks.filter(t => t.status === 'Cancelled').length;

        const projectCounts: Record<string, number> = {};
        tasks.forEach(t => {
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
    }, [tasks, metrics]);

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
            {/* Metrics Summary Cards */}
            {!isLoading && metrics && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard
                        title="Total Tasks"
                        value={metrics.total_tasks || 0}
                        subtitle={`${metrics.overall_completion_rate_pct?.toFixed(1) || 0}% complete`}
                        icon={
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                        }
                        trend={metrics.overall_completion_rate_pct && metrics.overall_completion_rate_pct > 50 ? 'up' : undefined}
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
                    />
                    <StatCard
                        title="Hours Variance"
                        value={metrics.total_hours_variance ? `${metrics.total_hours_variance > 0 ? '+' : ''}${metrics.total_hours_variance.toFixed(1)}` : '0'}
                        subtitle={`${metrics.total_actual_hrs?.toFixed(1) || 0} / ${metrics.total_estimated_hrs?.toFixed(1) || 0} hrs`}
                        icon={
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        }
                        trend={metrics.total_hours_variance && metrics.total_hours_variance < 0 ? 'up' : metrics.total_hours_variance && metrics.total_hours_variance > 0 ? 'down' : undefined}
                    />
                </div>
            )}

            {/* Charts Section */}
            {!isLoading && tasks.length > 0 && (
                <div className="space-y-6">
                    {/* Row 1: Task Distribution & Projects */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card className="flex flex-col items-center shadow-md hover:shadow-lg transition-shadow duration-300">
                            <CardHeader className="self-start w-full">
                                <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200">Task Distribution</CardTitle>
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

                        <Card className="md:col-span-2 shadow-md hover:shadow-lg transition-shadow duration-300">
                            <CardHeader>
                                <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200">Tasks per Project</CardTitle>
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

            <TaskTable
                tasks={filteredTasks}
                isLoading={isLoading}
                pagination={{ total: filteredTasks.length, limit: 10, offset: 0 }}
                onPageChange={() => { }}
            />
        </div>
    );
}

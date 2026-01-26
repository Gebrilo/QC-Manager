'use client';

import { useEffect, useState, useMemo } from 'react';
import { TaskTable } from '@/components/tasks/TaskTable';
import { fetchApi } from '@/lib/api';
import { Task } from '@/types';
import { DonutChart, BarChart } from '@/components/dashboard/ChartComponents';
import { ResourceUtilizationChart } from '@/components/dashboard/ResourceUtilizationChart';
import { ResourceStats } from '@/components/dashboard/ResourceStats';
import { useTheme } from '@/components/providers/ThemeProvider';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';

// MOCK DATA - Fresh, realistic test data for verification (Phase 4)
import { MOCK_TASKS } from '@/data/mockData';

// MOCK DATA - Use centralized mock data
const generateMockTasks = (): Task[] => {
    return MOCK_TASKS;
};

export function DashboardClient() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Filter State
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});

    // Theme context available if needed for dynamic styling
    useTheme();

    useEffect(() => {
        async function load() {
            try {
                const data = await fetchApi<Task[]>('/tasks');
                if (data && data.length > 0) {
                    setTasks(data);
                } else {
                    setTasks(generateMockTasks());
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

    // Derived Statistics
    const stats = useMemo(() => {
        const backlog = tasks.filter(t => t.status === 'Backlog').length;
        const inProgress = tasks.filter(t => t.status === 'In Progress').length;
        const done = tasks.filter(t => t.status === 'Done').length;
        const cancelled = tasks.filter(t => t.status === 'Cancelled').length;

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
    }, [tasks]);

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

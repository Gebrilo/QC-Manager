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
const generateMockTasks = (): Task[] => {
    const mockTasks: Task[] = [
        // Project Alpha - Web Platform Revamp (High Priority, nearing completion)
        { id: 't-101', task_id: 'WEB-101', project_id: 'prj-alpha', task_name: 'Implement OAuth2 Authentication', status: 'Done', priority: 'High', resource1_uuid: 'res-1', resource1_name: 'Elena Fisher', project_name: 'Web Platform Revamp', r1_estimate_hrs: 16, r1_actual_hrs: 14, r2_estimate_hrs: 0, r2_actual_hrs: 0, total_est_hrs: 16, total_actual_hrs: 14 },
        { id: 't-102', task_id: 'WEB-102', project_id: 'prj-alpha', task_name: 'Dashboard Analytics Integration', status: 'In Progress', priority: 'High', resource1_uuid: 'res-2', resource1_name: 'Marcus Chen', project_name: 'Web Platform Revamp', r1_estimate_hrs: 24, r1_actual_hrs: 10, r2_estimate_hrs: 0, r2_actual_hrs: 0, total_est_hrs: 24, total_actual_hrs: 10 },
        { id: 't-103', task_id: 'WEB-103', project_id: 'prj-alpha', task_name: 'User Profile Settings', status: 'Done', priority: 'Medium', resource1_uuid: 'res-3', resource1_name: 'Sarah Jones', project_name: 'Web Platform Revamp', r1_estimate_hrs: 8, r1_actual_hrs: 9, r2_estimate_hrs: 0, r2_actual_hrs: 0, total_est_hrs: 8, total_actual_hrs: 9 },
        { id: 't-104', task_id: 'WEB-104', project_id: 'prj-alpha', task_name: 'Payment Gateway Setup', status: 'Backlog', priority: 'High', resource1_uuid: 'res-1', resource1_name: 'Elena Fisher', project_name: 'Web Platform Revamp', r1_estimate_hrs: 12, r1_actual_hrs: 0, r2_estimate_hrs: 0, r2_actual_hrs: 0, total_est_hrs: 12, total_actual_hrs: 0 },

        // Project Beta - Mobile App Migration (Medium Priority, early stages)
        { id: 't-201', task_id: 'MOB-201', project_id: 'prj-beta', task_name: 'Initial Scaffolding Setup', status: 'Done', priority: 'High', resource1_uuid: 'res-4', resource1_name: 'David Kim', project_name: 'Mobile App Migration', r1_estimate_hrs: 4, r1_actual_hrs: 3, r2_estimate_hrs: 0, r2_actual_hrs: 0, total_est_hrs: 4, total_actual_hrs: 3 },
        { id: 't-202', task_id: 'MOB-202', project_id: 'prj-beta', task_name: 'Login Screen UI', status: 'In Progress', priority: 'Medium', resource1_uuid: 'res-4', resource1_name: 'David Kim', project_name: 'Mobile App Migration', r1_estimate_hrs: 8, r1_actual_hrs: 5, r2_estimate_hrs: 0, r2_actual_hrs: 0, total_est_hrs: 8, total_actual_hrs: 5 },
        { id: 't-203', task_id: 'MOB-203', project_id: 'prj-beta', task_name: 'Offline Storage implementation', status: 'Backlog', priority: 'High', resource1_uuid: 'res-2', resource1_name: 'Marcus Chen', project_name: 'Mobile App Migration', r1_estimate_hrs: 16, r1_actual_hrs: 0, r2_estimate_hrs: 0, r2_actual_hrs: 0, total_est_hrs: 16, total_actual_hrs: 0 },
        { id: 't-204', task_id: 'MOB-204', project_id: 'prj-beta', task_name: 'Push Notification Service', status: 'Backlog', priority: 'Low', resource1_uuid: 'res-3', resource1_name: 'Sarah Jones', project_name: 'Mobile App Migration', r1_estimate_hrs: 8, r1_actual_hrs: 0, r2_estimate_hrs: 0, r2_actual_hrs: 0, total_est_hrs: 8, total_actual_hrs: 0 },

        // Project Gamma - Marketing Website (Done)
        { id: 't-301', task_id: 'MKT-301', project_id: 'prj-gamma', task_name: 'Landing Page Design', status: 'Done', priority: 'High', resource1_uuid: 'res-5', resource1_name: 'Alex Morgan', project_name: 'Marketing Website', r1_estimate_hrs: 10, r1_actual_hrs: 10, r2_estimate_hrs: 0, r2_actual_hrs: 0, total_est_hrs: 10, total_actual_hrs: 10 },
        { id: 't-302', task_id: 'MKT-302', project_id: 'prj-gamma', task_name: 'SEO Optimization', status: 'Done', priority: 'Medium', resource1_uuid: 'res-5', resource1_name: 'Alex Morgan', project_name: 'Marketing Website', r1_estimate_hrs: 6, r1_actual_hrs: 7, r2_estimate_hrs: 0, r2_actual_hrs: 0, total_est_hrs: 6, total_actual_hrs: 7 },
        { id: 't-303', task_id: 'MKT-303', project_id: 'prj-gamma', task_name: 'Contact Form Logic', status: 'Done', priority: 'Low', resource1_uuid: 'res-1', resource1_name: 'Elena Fisher', project_name: 'Marketing Website', r1_estimate_hrs: 4, r1_actual_hrs: 2, r2_estimate_hrs: 0, r2_actual_hrs: 0, total_est_hrs: 4, total_actual_hrs: 2 },

        // Project Delta - Legacy System Upgrade (Mixed states)
        { id: 't-401', task_id: 'LEG-401', project_id: 'prj-delta', task_name: 'Database Schema Audit', status: 'Done', priority: 'High', resource1_uuid: 'res-2', resource1_name: 'Marcus Chen', project_name: 'Legacy Upgrade', r1_estimate_hrs: 12, r1_actual_hrs: 12, r2_estimate_hrs: 0, r2_actual_hrs: 0, total_est_hrs: 12, total_actual_hrs: 12 },
        { id: 't-402', task_id: 'LEG-402', project_id: 'prj-delta', task_name: 'Data Migration Scripts', status: 'In Progress', priority: 'High', resource1_uuid: 'res-2', resource1_name: 'Marcus Chen', project_name: 'Legacy Upgrade', r1_estimate_hrs: 20, r1_actual_hrs: 15, r2_estimate_hrs: 0, r2_actual_hrs: 0, total_est_hrs: 20, total_actual_hrs: 15 },
        { id: 't-403', task_id: 'LEG-403', project_id: 'prj-delta', task_name: 'API Versioning Strategy', status: 'Backlog', priority: 'Medium', resource1_uuid: 'res-4', resource1_name: 'David Kim', project_name: 'Legacy Upgrade', r1_estimate_hrs: 8, r1_actual_hrs: 0, r2_estimate_hrs: 0, r2_actual_hrs: 0, total_est_hrs: 8, total_actual_hrs: 0 },
        { id: 't-404', task_id: 'LEG-404', project_id: 'prj-delta', task_name: 'Deprecated Code Removal', status: 'Cancelled', priority: 'Low', resource1_uuid: 'res-6', resource1_name: 'Tom Baker', project_name: 'Legacy Upgrade', r1_estimate_hrs: 5, r1_actual_hrs: 1, r2_estimate_hrs: 0, r2_actual_hrs: 0, total_est_hrs: 5, total_actual_hrs: 1 },

        // Project Epsilon - AI Integration (Research phase)
        { id: 't-501', task_id: 'AI-501', project_id: 'prj-epsilon', task_name: 'Model Selection POC', status: 'In Progress', priority: 'High', resource1_uuid: 'res-1', resource1_name: 'Elena Fisher', project_name: 'AI Integration', r1_estimate_hrs: 40, r1_actual_hrs: 32, r2_estimate_hrs: 0, r2_actual_hrs: 0, total_est_hrs: 40, total_actual_hrs: 32 },
        { id: 't-502', task_id: 'AI-502', project_id: 'prj-epsilon', task_name: 'Data Cleanup Pipeline', status: 'Backlog', priority: 'Medium', resource1_uuid: 'res-3', resource1_name: 'Sarah Jones', project_name: 'AI Integration', r1_estimate_hrs: 16, r1_actual_hrs: 0, r2_estimate_hrs: 0, r2_actual_hrs: 0, total_est_hrs: 16, total_actual_hrs: 0 },
    ];

    return mockTasks;
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

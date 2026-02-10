'use client';

import { useMemo, useState } from 'react';
import { Task } from '@/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { InfoTooltip } from '@/components/ui/Tooltip';

interface ResourceStatsProps {
    tasks: Task[];
}

// Helper to get month name from a date string
function getMonthFromDate(dateStr?: string): string | null {
    if (!dateStr) return null;
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return null;
        return date.toLocaleString('en-US', { month: 'long' });
    } catch {
        return null;
    }
}

export function ResourceStats({ tasks }: ResourceStatsProps) {
    const [selectedMonth, setSelectedMonth] = useState<string>('All');
    const [selectedResource, setSelectedResource] = useState<string>('All');

    // Extract unique resources (both R1 and R2)
    const resources = useMemo(() => {
        const unique = new Set<string>();
        tasks.forEach(t => {
            if (t.resource1_name) unique.add(t.resource1_name);
            if (t.resource2_name) unique.add(t.resource2_name);
        });
        return ['All', ...Array.from(unique).sort()];
    }, [tasks]);

    const months = ['All', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    const stats = useMemo(() => {
        let totalEst = 0;
        let totalActual = 0;
        let finishedCount = 0;
        let totalTaskCount = 0;

        tasks.forEach(t => {
            // Get the task's month from deadline or completed_date
            const taskMonth = getMonthFromDate(t.deadline) || getMonthFromDate(t.completed_date) || getMonthFromDate(t.created_at);

            // Month filter - skip if doesn't match selected month
            if (selectedMonth !== 'All' && taskMonth !== selectedMonth) {
                return;
            }

            // Process based on selected resource
            if (selectedResource === 'All') {
                // Count all resources
                // R1 contribution
                if (t.resource1_name) {
                    totalEst += Number(t.r1_estimate_hrs || 0);
                    totalActual += Number(t.r1_actual_hrs || 0);
                    if (t.status === 'Done') finishedCount++;
                    totalTaskCount++;
                }
                // R2 contribution (if different resource)
                if (t.resource2_name) {
                    totalEst += Number(t.r2_estimate_hrs || 0);
                    totalActual += Number(t.r2_actual_hrs || 0);
                }
            } else {
                // Filter by specific resource
                // Check if resource is R1
                if (t.resource1_name === selectedResource) {
                    totalEst += Number(t.r1_estimate_hrs || 0);
                    totalActual += Number(t.r1_actual_hrs || 0);
                    if (t.status === 'Done') finishedCount++;
                    totalTaskCount++;
                }
                // Check if resource is R2
                if (t.resource2_name === selectedResource) {
                    totalEst += Number(t.r2_estimate_hrs || 0);
                    totalActual += Number(t.r2_actual_hrs || 0);
                    // Don't double count finished tasks if same resource is both R1 and R2
                    if (t.resource1_name !== selectedResource && t.status === 'Done') {
                        finishedCount++;
                    }
                    if (t.resource1_name !== selectedResource) {
                        totalTaskCount++;
                    }
                }
            }
        });

        const efficiency = totalActual > 0 ? (totalEst / totalActual).toFixed(2) : '0.00';

        return {
            finishedCount,
            efficiency,
            totalEst: totalEst.toFixed(1),
            totalActual: totalActual.toFixed(1),
            totalTaskCount
        };
    }, [tasks, selectedResource, selectedMonth]);

    return (
        <Card className="shadow-md hover:shadow-lg transition-shadow duration-300 border-indigo-100 dark:border-indigo-900/20 bg-gradient-to-br from-white to-indigo-50/20 dark:from-slate-900 dark:to-indigo-900/10 h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        Resource Analytics
                    </CardTitle>
                    <InfoTooltip content="Key performance indicators including finished tasks count, efficiency score (Est/Actual), and total hours." position="right" />
                </div>
                <div className="flex gap-2">
                    <select
                        value={selectedResource}
                        onChange={(e) => setSelectedResource(e.target.value)}
                        className="text-xs border-none bg-indigo-50 dark:bg-slate-800 rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-500 text-slate-600 dark:text-slate-300"
                    >
                        {resources.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="text-xs border-none bg-indigo-50 dark:bg-slate-800 rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-500 text-slate-600 dark:text-slate-300"
                    >
                        {months.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col gap-4 h-full">
                    <div className="flex-1 p-4 bg-white dark:bg-slate-800/80 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center space-y-1">
                        <span className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">
                            {stats.finishedCount}
                        </span>
                        <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Finished Tasks</span>
                    </div>

                    <div className="flex-1 p-4 bg-white dark:bg-slate-800/80 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center space-y-1">
                        <span className={`text-3xl font-bold ${Number(stats.efficiency) >= 1 ? 'text-emerald-500' : 'text-amber-500'}`}>
                            {stats.efficiency}
                        </span>
                        <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Efficiency Score</span>
                        <div className="text-[10px] text-slate-400">
                            Est / Actual
                        </div>
                    </div>

                    {/* Hours Summary */}
                    <div className="flex-1 p-4 bg-white dark:bg-slate-800/80 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center space-y-1">
                        <div className="flex items-baseline gap-2">
                            <span className="text-xl font-bold text-emerald-600">{stats.totalActual}h</span>
                            <span className="text-slate-400">/</span>
                            <span className="text-xl font-bold text-indigo-600">{stats.totalEst}h</span>
                        </div>
                        <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Actual / Estimated</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

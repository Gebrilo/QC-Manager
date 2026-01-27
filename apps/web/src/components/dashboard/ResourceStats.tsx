'use client';

import { useMemo, useState } from 'react';
import { Task } from '@/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';

interface ResourceStatsProps {
    tasks: Task[];
}

export function ResourceStats({ tasks }: ResourceStatsProps) {
    const [selectedMonth, setSelectedMonth] = useState<string>('All');
    const [selectedResource, setSelectedResource] = useState<string>('All');

    // Extract unique resources
    const resources = useMemo(() => {
        const unique = new Set<string>();
        tasks.forEach(t => { if (t.resource1_name) unique.add(t.resource1_name); });
        return ['All', ...Array.from(unique)];
    }, [tasks]);

    // Extract unique months (Mocking logic or using completed_date/deadline)
    // Assuming mock data will have formatted dates or we derive from current state
    const months = ['All', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    const stats = useMemo(() => {
        let filtered = tasks;

        if (selectedResource !== 'All') {
            filtered = filtered.filter(t => t.resource1_name === selectedResource);
        }

        // Mock date filtering for now since mock data might not have dates
        // If real data has dates, parse them.
        // For MVP "Wow", let's rely on tasks being filtered.

        let totalEst = 0;
        let totalActual = 0;
        let finishedCount = 0;

        filtered.forEach(t => {
            if (t.status === 'Done') finishedCount++;

            // Only count efficiency for tasks that have actuals > 0 (as per formula requirement for denominator)
            // But usually aggregate efficiency is Sum(Est) / Sum(Actual).
            // Formula requested: "IF(Total actual>0, Total Estimation/Total actual,0)"
            totalEst += Number(t.total_est_hrs || 0);
            totalActual += Number(t.total_actual_hrs || t.r1_actual_hrs || 0);
        });

        const efficiency = totalActual > 0 ? (totalEst / totalActual).toFixed(2) : '0.00';

        return {
            finishedCount,
            efficiency,
            totalEst,
            totalActual
        };
    }, [tasks, selectedResource, selectedMonth]);

    return (
        <Card className="shadow-md hover:shadow-lg transition-shadow duration-300 border-indigo-100 dark:border-indigo-900/20 bg-gradient-to-br from-white to-indigo-50/20 dark:from-slate-900 dark:to-indigo-900/10 h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Resource Analytics
                </CardTitle>
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
                </div>
            </CardContent>
        </Card>
    );
}

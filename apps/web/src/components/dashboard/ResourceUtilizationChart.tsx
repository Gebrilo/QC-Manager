'use client';

import { useMemo, useState } from 'react';
import { Task } from '@/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { InfoTooltip } from '@/components/ui/Tooltip';

interface ResourceUtilizationChartProps {
    tasks: Task[];
}

const MONTHS = ['All', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

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

export function ResourceUtilizationChart({ tasks }: ResourceUtilizationChartProps) {
    const [selectedMonth, setSelectedMonth] = useState<string>('All');

    const resourceData = useMemo(() => {
        // Filter by month
        const filteredTasks = selectedMonth === 'All'
            ? tasks
            : tasks.filter(t => {
                const taskMonth = getMonthFromDate(t.deadline) || getMonthFromDate(t.completed_date) || getMonthFromDate(t.created_at);
                return taskMonth === selectedMonth;
            });

        const stats: Record<string, { est: number; actual: number; taskCount: number }> = {};

        filteredTasks.forEach(t => {
            // Process Resource 1
            const res1 = t.resource1_name;
            if (res1 && res1 !== 'Unassigned') {
                if (!stats[res1]) stats[res1] = { est: 0, actual: 0, taskCount: 0 };
                stats[res1].est += Number(t.r1_estimate_hrs || 0);
                stats[res1].actual += Number(t.r1_actual_hrs || 0);
                stats[res1].taskCount += 1;
            }

            // Process Resource 2 (if assigned)
            const res2 = t.resource2_name;
            if (res2 && res2 !== 'Unassigned') {
                if (!stats[res2]) stats[res2] = { est: 0, actual: 0, taskCount: 0 };
                stats[res2].est += Number(t.r2_estimate_hrs || 0);
                stats[res2].actual += Number(t.r2_actual_hrs || 0);
                stats[res2].taskCount += 1;
            }
        });

        // Convert to array and sort by Estimated Hours desc
        return Object.entries(stats)
            .map(([name, data]) => {
                // Calculate efficiency: (estimated / actual) * 100 - if actual > 0
                // > 100% means done faster than estimated, < 100% means took longer
                const efficiency = data.actual > 0
                    ? Math.round((data.est / data.actual) * 100)
                    : data.est > 0 ? 100 : 0;
                return { name, ...data, efficiency };
            })
            .sort((a, b) => b.est - a.est);
    }, [tasks, selectedMonth]);

    const maxHours = Math.max(...resourceData.map(d => Math.max(d.est, d.actual)), 10);

    return (
        <Card className="shadow-md hover:shadow-lg transition-shadow duration-300 h-full">
            <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200">Resource Utilization</CardTitle>
                    <InfoTooltip content="Visualizes allocated vs actual hours per resource. Bars show progress against estimates. Red indicates over budget." position="right" />
                </div>
                <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="text-xs border-none bg-indigo-50 dark:bg-slate-800 rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-500 text-slate-600 dark:text-slate-300"
                >
                    {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {resourceData.map((res) => (
                        <div key={res.name} className="space-y-1">
                            <div className="flex justify-between text-xs">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-slate-700 dark:text-slate-300">{res.name}</span>
                                    <span className="text-[10px] text-slate-400">({res.taskCount} tasks)</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-slate-500">
                                        <span className="text-emerald-600 font-medium">{res.actual.toFixed(1)}h</span>
                                        {' / '}
                                        <span className="text-indigo-600 font-medium">{res.est.toFixed(1)}h</span>
                                    </span>
                                    {/* Efficiency Badge */}
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${res.efficiency >= 100
                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                        : res.efficiency >= 80
                                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                            : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                                        }`}>
                                        {res.efficiency}% eff
                                    </span>
                                </div>
                            </div>
                            <div className="relative h-2.5 bg-slate-100 dark:bg-slate-800/50 rounded-full overflow-hidden">
                                {/* Estimated Bar (Background/Target) */}
                                <div
                                    className="absolute top-0 left-0 h-full bg-indigo-200 dark:bg-indigo-900/50 rounded-full animate-in slide-in-from-left duration-1000"
                                    style={{ width: `${(res.est / maxHours) * 100}%` }}
                                />
                                {/* Actual Bar (Progress) */}
                                <div
                                    className={`absolute top-0 left-0 h-full rounded-full transition-all duration-1000 ${res.actual > res.est
                                        ? 'bg-rose-500' // Over budget
                                        : 'bg-emerald-500' // Within budget
                                        }`}
                                    style={{ width: `${Math.min((res.actual / maxHours) * 100, 100)}%` }}
                                />
                            </div>
                        </div>
                    ))}
                    {resourceData.length === 0 && (
                        <div className="text-center py-4 text-xs text-slate-400">No resource data available</div>
                    )}
                </div>

                <div className="mt-4 flex flex-wrap gap-3 justify-end">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-indigo-200 dark:bg-indigo-900/50"></div>
                        <span className="text-[10px] text-slate-500">Estimated</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                        <span className="text-[10px] text-slate-500">Actual (On/Under Budget)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                        <span className="text-[10px] text-slate-500">Over Budget</span>
                    </div>
                </div>

                <div className="mt-2 text-[10px] text-slate-400 text-right">
                    Efficiency = Est ÷ Actual × 100 (≥100% = on track)
                </div>
            </CardContent>
        </Card>
    );
}


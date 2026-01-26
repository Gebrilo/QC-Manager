'use client';

import { useMemo } from 'react';
import { Task } from '@/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';

interface ResourceUtilizationChartProps {
    tasks: Task[];
}

export function ResourceUtilizationChart({ tasks }: ResourceUtilizationChartProps) {
    const resourceData = useMemo(() => {
        const stats: Record<string, { est: number; actual: number }> = {};

        tasks.forEach(t => {
            const res = t.resource1_name || 'Unassigned';
            if (res === 'Unassigned') return;

            if (!stats[res]) stats[res] = { est: 0, actual: 0 };
            stats[res].est += Number(t.total_est_hrs || 0); // Using total_est_hrs
            stats[res].actual += Number(t.total_actual_hrs || t.r1_actual_hrs || 0); // Using total or r1 actual
        });

        // Convert to array and sort by Estimated Hours desc
        return Object.entries(stats)
            .map(([name, data]) => ({ name, ...data }))
            .sort((a, b) => b.est - a.est);
    }, [tasks]);

    const maxHours = Math.max(...resourceData.map(d => Math.max(d.est, d.actual)), 10);

    return (
        <Card className="shadow-md hover:shadow-lg transition-shadow duration-300 h-full">
            <CardHeader>
                <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200">Resource Utilization</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {resourceData.map((res) => (
                        <div key={res.name} className="space-y-1">
                            <div className="flex justify-between text-xs">
                                <span className="font-medium text-slate-700 dark:text-slate-300">{res.name}</span>
                                <span className="text-slate-500">
                                    <span className="text-emerald-600 font-medium">{res.actual}h</span> / <span className="text-indigo-600 font-medium">{res.est}h</span>
                                </span>
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
                                {/* Overlap marker if actual > max ? Not handling visual overflow for now, assuming scaling covers it */}
                            </div>
                        </div>
                    ))}
                    {resourceData.length === 0 && (
                        <div className="text-center py-4 text-xs text-slate-400">No resource data available</div>
                    )}
                </div>

                <div className="mt-4 flex gap-4 justify-end">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-indigo-200 dark:bg-indigo-900/50"></div>
                        <span className="text-[10px] text-slate-500">Estimated</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                        <span className="text-[10px] text-slate-500">Actual</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                        <span className="text-[10px] text-slate-500">Over Budget</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

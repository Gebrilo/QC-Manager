'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { DonutChart } from '@/components/dashboard/ChartComponents';
import { InfoTooltip } from '@/components/ui/Tooltip';

const STATUS_COLORS: Record<string, string> = {
    'Backlog':     '#64748b',
    'In Progress': '#6366f1',
    'Done':        '#10b981',
    'Cancelled':   '#f43f5e',
};

interface TaskDistributionChartProps {
    distribution: Record<string, number>;
}

export function TaskDistributionChart({ distribution }: TaskDistributionChartProps) {
    const donutData = Object.entries(distribution).map(([label, value]) => ({
        label,
        value,
        color: STATUS_COLORS[label] || '#94a3b8',
    }));

    if (donutData.length === 0) {
        return (
            <Card className="flex flex-col items-center shadow-md">
                <CardHeader className="self-start w-full">
                    <div className="flex items-center gap-2">
                        <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200">Task Distribution</CardTitle>
                        <InfoTooltip content="Distribution of your tasks by status." position="right" />
                    </div>
                </CardHeader>
                <CardContent className="flex items-center justify-center py-8 w-full">
                    <p className="text-sm text-slate-400">No tasks assigned yet.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="flex flex-col items-center shadow-md hover:shadow-lg transition-shadow duration-300">
            <CardHeader className="self-start w-full">
                <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200">Task Distribution</CardTitle>
                    <InfoTooltip content="Distribution of your tasks by status." position="right" />
                </div>
            </CardHeader>
            <CardContent className="flex flex-col items-center w-full">
                <DonutChart data={donutData} />
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-6 w-full px-4">
                    {donutData.map(d => (
                        <div key={d.label} className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: d.color }} />
                            <span className="text-xs text-slate-600 dark:text-slate-400 font-medium truncate">
                                {d.label} ({d.value})
                            </span>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

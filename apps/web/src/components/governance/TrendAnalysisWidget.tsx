'use client';

import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendData } from '@/types/governance';

interface TrendAnalysisWidgetProps {
    data: TrendData[];
    title?: string;
}

export function TrendAnalysisWidget({ data }: TrendAnalysisWidgetProps) {
    const chartData = useMemo(() => {
        return data.map(item => ({
            ...item,
            formattedDate: new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        }));
    }, [data]);

    const hasData = chartData.some(d => d.passRate !== null && d.passRate !== undefined);

    if (!hasData) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2 py-10">
                <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-1">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M22 12h-4l-3 9L9 3l-3 9H2" />
                    </svg>
                </div>
                <p className="text-sm font-medium">No test executions in the last 30 days</p>
                <p className="text-xs">Run your first test suite to see the trend</p>
            </div>
        );
    }

    return (
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                    <linearGradient id="colorPassRate" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:stroke-slate-700" />
                <XAxis
                    dataKey="formattedDate"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    dy={10}
                />
                <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    domain={[0, 100]}
                    unit="%"
                />
                <Tooltip
                    contentStyle={{
                        backgroundColor: 'white',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                        border: 'none',
                        fontSize: '12px',
                    }}
                    formatter={(value: any) => value !== null ? [`${value}%`, 'Pass Rate'] : [null, null]}
                />
                <Area
                    type="monotone"
                    dataKey="passRate"
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorPassRate)"
                    name="Pass Rate"
                    dot={{ r: 3, fill: '#10b981', strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                />
            </AreaChart>
        </ResponsiveContainer>
    );
}

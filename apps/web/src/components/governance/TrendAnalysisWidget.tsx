'use client';

import React, { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendData } from '@/types/governance';

interface TrendAnalysisWidgetProps {
    data: TrendData[];
    title?: string;
}

export function TrendAnalysisWidget({ data, title = "Execution Trend (Last 30 Days)" }: TrendAnalysisWidgetProps) {
    const chartData = useMemo(() => {
        return data.map(item => ({
            ...item,
            formattedDate: new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        }));
    }, [data]);

    const hasData = chartData.some(d => d.passRate !== null && d.passRate !== undefined);

    return (
        <Card className="h-full shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white flex justify-between items-center">
                    {title}
                    <div className="flex gap-2">
                        <span className="text-xs font-normal px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full">Pass Rate</span>
                    </div>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[250px] w-full">
                    {!hasData ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                            <svg className="w-10 h-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                            </svg>
                            <p className="text-sm">No test executions in the last 30 days</p>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorPassRate" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis
                                    dataKey="formattedDate"
                                    tickLine={false}
                                    axisLine={false}
                                    tick={{ fill: '#64748b', fontSize: 12 }}
                                    dy={10}
                                />
                                <YAxis
                                    tickLine={false}
                                    axisLine={false}
                                    tick={{ fill: '#64748b', fontSize: 12 }}
                                    domain={[0, 100]}
                                    unit="%"
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'white',
                                        borderRadius: '8px',
                                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                        border: 'none'
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
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

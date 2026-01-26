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

    return (
        <Card className="h-full shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white flex justify-between items-center">
                    {title}
                    <div className="flex gap-2">
                        <span className="text-xs font-normal px-2 py-1 bg-green-100 text-green-800 rounded-full">Pass Rate</span>
                        {/* <span className="text-xs font-normal px-2 py-1 bg-blue-100 text-blue-800 rounded-full">Volume</span> */}
                    </div>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[250px] w-full">
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
                            />
                            <Area
                                type="monotone"
                                dataKey="passRate"
                                stroke="#10b981"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorPassRate)"
                                name="Pass Rate"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}

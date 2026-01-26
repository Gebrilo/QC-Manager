import * as React from 'react';

interface StatCardProps {
    label: string;
    value: string | number;
    trend?: {
        value: number;
        isPositive: boolean;
    };
    icon?: React.ReactNode;
}

export function StatCard({ label, value, trend, icon }: StatCardProps) {
    return (
        <div className="flex flex-col">
            <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                    {label}
                </span>
                {icon && (
                    <div className="text-slate-400">
                        {icon}
                    </div>
                )}
            </div>
            <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                    {value}
                </span>
                {trend && (
                    <span className={`text-xs font-semibold ${trend.isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
                    </span>
                )}
            </div>
        </div>
    );
}

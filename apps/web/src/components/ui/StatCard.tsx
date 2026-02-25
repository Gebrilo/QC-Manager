import * as React from 'react';
import { InfoTooltip } from './Tooltip';

interface StatCardProps {
    label?: string;
    title?: string;
    value: string | number;
    subtitle?: string;
    trend?: {
        value: number;
        isPositive: boolean;
    } | 'up' | 'down';
    icon?: React.ReactNode;
    tooltip?: string;
}

export function StatCard({ label, title, value, subtitle, trend, icon, tooltip }: StatCardProps) {
    const displayLabel = label || title || '';

    const trendObj = typeof trend === 'string'
        ? { value: 0, isPositive: trend === 'up' }
        : trend;

    return (
        <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                        {displayLabel}
                    </span>
                    {tooltip && <InfoTooltip content={tooltip} position="right" />}
                </div>
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
                {trendObj && (
                    <span className={`text-xs font-semibold ${trendObj.isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {trendObj.isPositive ? '↑' : '↓'} {trendObj.value > 0 ? `${Math.abs(trendObj.value)}%` : ''}
                    </span>
                )}
            </div>
            {subtitle && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>
            )}
        </div>
    );
}


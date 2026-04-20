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

    const trendDir = typeof trend === 'string' ? trend
        : trend ? (trend.isPositive ? 'up' : 'down') : undefined;

    return (
        <div className="glass-card rounded-xl p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                        {displayLabel}
                    </span>
                    {tooltip && <InfoTooltip content={tooltip} position="right" />}
                </div>
                {icon && (
                    <div className="text-slate-300 dark:text-slate-600">
                        {icon}
                    </div>
                )}
            </div>
            <div className="text-3xl font-bold text-slate-900 dark:text-white mb-1">
                {value}
            </div>
            {subtitle && (
                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    {trendDir === 'up' && (
                        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-emerald-500 shrink-0">
                            <path d="M12 19V5M5 12l7-7 7 7"/>
                        </svg>
                    )}
                    {trendDir === 'down' && (
                        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-rose-500 shrink-0">
                            <path d="M12 5v14M19 12l-7 7-7-7"/>
                        </svg>
                    )}
                    {subtitle}
                </div>
            )}
        </div>
    );
}

/**
 * Risk Indicators Widget
 * Phase 2: Shows quality risks with flags and trend analysis
 */

'use client';

import React, { useEffect, useState } from 'react';
import { getProjectQualityRisk } from '../../services/governanceApi';
import type { QualityRisk } from '../../types/governance';
import {
    RISK_LEVEL_COLORS,
    RISK_LEVEL_BADGE_COLORS,
    RISK_FLAG_LABELS,
    RISK_FLAG_DESCRIPTIONS,
    getRiskLevelIcon,
    formatPassRate
} from '../../types/governance';

interface RiskIndicatorsWidgetProps {
    projectId: string;
    showTrend?: boolean;
    onRiskClick?: () => void;
}

export default function RiskIndicatorsWidget({
    projectId,
    showTrend = true,
    onRiskClick
}: RiskIndicatorsWidgetProps) {
    const [data, setData] = useState<QualityRisk | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, [projectId]);

    const loadData = async () => {
        try {
            setLoading(true);
            setError(null);
            const result = await getProjectQualityRisk(projectId);
            setData(result);
        } catch (err) {
            console.error('Error loading quality risks:', err);
            setError('Failed to load quality risk data');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
                <div className="animate-pulse">
                    <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-1/2 mb-4"></div>
                    <div className="h-16 bg-slate-200 dark:bg-slate-700 rounded mb-4"></div>
                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full"></div>
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Quality Risks</h3>
                <div className="text-rose-600 dark:text-rose-400">
                    {error || 'No data available'}
                </div>
            </div>
        );
    }

    const badgeColor = RISK_LEVEL_BADGE_COLORS[data.risk_level] || 'bg-slate-500 text-white';
    const riskColorClass = RISK_LEVEL_COLORS[data.risk_level] || 'border-slate-300';
    const borderColor = riskColorClass.split(' ').find(c => c.startsWith('border-')) || 'border-slate-300';
    const icon = getRiskLevelIcon(data.risk_level);

    const getTrendIcon = () => {
        if (data.pass_rate_change > 5) return '↑';
        if (data.pass_rate_change < -5) return '↓';
        return '→';
    };

    const getTrendColor = () => {
        if (data.pass_rate_change > 5) return 'text-emerald-600 dark:text-emerald-400';
        if (data.pass_rate_change < -5) return 'text-rose-600 dark:text-rose-400';
        return 'text-slate-600 dark:text-slate-400';
    };

    return (
        <div className={`bg-white dark:bg-slate-800 rounded-lg shadow border-l-4 ${borderColor || 'border-slate-300'}`}>
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                        Quality Risks
                    </h3>
                    <button
                        onClick={onRiskClick}
                        className={`px-4 py-2 rounded-full font-bold text-sm ${badgeColor} hover:opacity-80 transition-opacity`}
                    >
                        {icon} {data.risk_level}
                    </button>
                </div>
            </div>

            <div className="p-6">
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                        <div className="text-2xl font-bold text-slate-900 dark:text-white">
                            {formatPassRate(data.latest_pass_rate_pct)}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Current Pass Rate</div>
                    </div>
                    <div>
                        <div className="text-2xl font-bold text-slate-900 dark:text-white">
                            {data.risk_flag_count}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Risk Flags</div>
                    </div>
                </div>

                {showTrend && data.pass_rate_change !== 0 && (
                    <div className="mb-6">
                        <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">
                                        Week-over-Week Trend
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                        Recent: {formatPassRate(data.recent_pass_rate)} vs Previous: {formatPassRate(data.previous_pass_rate)}
                                    </p>
                                </div>
                                <div className={`text-3xl font-bold ${getTrendColor()}`}>
                                    {getTrendIcon()}
                                    {Math.abs(data.pass_rate_change).toFixed(1)}%
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {data.risk_flags && data.risk_flags.length > 0 && (
                    <div className="mb-6">
                        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                            Active Risk Flags
                        </h4>
                        <div className="space-y-2">
                            {data.risk_flags.map((flag) => {
                                const label = RISK_FLAG_LABELS[flag as keyof typeof RISK_FLAG_LABELS] || flag;
                                const description = RISK_FLAG_DESCRIPTIONS[flag as keyof typeof RISK_FLAG_DESCRIPTIONS] || '';

                                return (
                                    <div
                                        key={flag}
                                        className="flex items-start p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg"
                                        title={description}
                                    >
                                        <span className="inline-flex items-center justify-center w-6 h-6 bg-amber-500 text-white rounded-full text-xs font-bold mr-3 flex-shrink-0">
                                            !
                                        </span>
                                        <div className="flex-1">
                                            <p className="text-sm font-medium text-slate-900 dark:text-white">{label}</p>
                                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{description}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {(!data.risk_flags || data.risk_flags.length === 0) && (
                    <div className="text-center py-8">
                        <div className="text-5xl mb-3">✓</div>
                        <p className="text-slate-600 dark:text-slate-400">No quality risks detected</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Project quality is within acceptable ranges</p>
                    </div>
                )}

                <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="text-slate-500 dark:text-slate-400">Failed Tests:</span>
                            <span className="ml-2 text-slate-900 dark:text-white font-medium">{data.latest_failed_count}</span>
                        </div>
                        <div>
                            <span className="text-slate-500 dark:text-slate-400">Total Tests:</span>
                            <span className="ml-2 text-slate-900 dark:text-white font-medium">{data.total_test_cases}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

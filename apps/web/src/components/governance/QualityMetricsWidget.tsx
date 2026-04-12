'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { pertEstimate, pertStdDev } from '@/lib/pert';
import type { QualityMetrics } from '@/types/governance';

interface QualityMetricsWidgetProps {
    data: QualityMetrics[];
}

function MetricCard({
    label,
    value,
    subtitle,
    color = 'indigo',
}: {
    label: string;
    value: string;
    subtitle?: string;
    color?: 'indigo' | 'emerald' | 'amber' | 'rose';
}) {
    const colors = {
        indigo: 'text-indigo-600 dark:text-indigo-400',
        emerald: 'text-emerald-600 dark:text-emerald-400',
        amber: 'text-amber-600 dark:text-amber-400',
        rose: 'text-rose-600 dark:text-rose-400',
    };
    return (
        <div className="flex flex-col gap-1 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</span>
            <span className={`text-2xl font-bold ${colors[color]}`}>{value}</span>
            {subtitle && <span className="text-xs text-slate-400">{subtitle}</span>}
        </div>
    );
}

export function QualityMetricsWidget({ data }: QualityMetricsWidgetProps) {
    const total = data.length;
    const agg = data.reduce(
        (acc, d) => ({
            execution_coverage: acc.execution_coverage + parseFloat(d.execution_coverage_pct || '0'),
            effectiveness:      acc.effectiveness      + parseFloat(d.effectiveness_pct      || '0'),
            req_coverage_sum:   acc.req_coverage_sum   + (d.requirement_coverage_pct ? parseFloat(d.requirement_coverage_pct) : 0),
            req_coverage_count: acc.req_coverage_count + (d.requirement_coverage_pct ? 1 : 0),
        }),
        { execution_coverage: 0, effectiveness: 0, req_coverage_sum: 0, req_coverage_count: 0 }
    );

    const avgExecCoverage = total > 0 ? (agg.execution_coverage / total).toFixed(1) : '—';
    const avgEffectiveness = total > 0 ? (agg.effectiveness / total).toFixed(1) : '—';
    const avgReqCoverage = agg.req_coverage_count > 0
        ? (agg.req_coverage_sum / agg.req_coverage_count).toFixed(1)
        : null;

    const [pert, setPert] = useState({ o: '', m: '', p: '' });
    const pertValid = pert.o !== '' && pert.m !== '' && pert.p !== '';
    const pertResult = pertValid
        ? pertEstimate(parseFloat(pert.o), parseFloat(pert.m), parseFloat(pert.p))
        : null;
    const pertSd = pertValid
        ? pertStdDev(parseFloat(pert.o), parseFloat(pert.p))
        : null;

    return (
        <Card className="shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">
                    Quality Metrics
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <MetricCard
                        label="Execution Coverage"
                        value={total > 0 ? `${avgExecCoverage}%` : '—'}
                        subtitle="Executed / Planned Tests"
                        color="indigo"
                    />
                    <MetricCard
                        label="Requirement Coverage"
                        value={avgReqCoverage ? `${avgReqCoverage}%` : 'N/A'}
                        subtitle={avgReqCoverage ? 'Covered Reqs / Total Reqs' : 'Add requirement_id to uploads'}
                        color="emerald"
                    />
                    <MetricCard
                        label="TC Effectiveness"
                        value={total > 0 ? `${avgEffectiveness}%` : '—'}
                        subtitle="Defects Found / Tests Run"
                        color="amber"
                    />
                </div>

                <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                        PERT Effort Estimator
                        <span className="ml-2 text-xs text-slate-400 font-normal">(O + 4ML + P) / 6</span>
                    </p>
                    <div className="flex gap-2 flex-wrap">
                        {(['o', 'm', 'p'] as const).map((key, i) => (
                            <div key={key} className="flex flex-col gap-1">
                                <label className="text-xs text-slate-500">
                                    {['Optimistic (hrs)', 'Most Likely (hrs)', 'Pessimistic (hrs)'][i]}
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    value={pert[key]}
                                    onChange={e => setPert(prev => ({ ...prev, [key]: e.target.value }))}
                                    className="w-28 px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                    placeholder="0"
                                />
                            </div>
                        ))}
                        {pertResult !== null && (
                            <div className="flex flex-col gap-1 justify-end">
                                <span className="text-xs text-slate-500">Estimate ± 1σ</span>
                                <div className="px-3 py-1.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-md text-sm font-semibold">
                                    {pertResult}h ± {pertSd}h
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

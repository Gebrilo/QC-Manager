'use client';

import React, { useState } from 'react';
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
        <div className="p-4 rounded-xl bg-slate-50/60 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-700/50">
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 mb-1">{label}</div>
            <div className={`text-3xl font-extrabold ${colors[color]}`}>{value}</div>
            {subtitle && <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{subtitle}</div>}
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

    const avgExecCoverage  = total > 0 ? (agg.execution_coverage / total).toFixed(1) : '—';
    const avgEffectiveness = total > 0 ? (agg.effectiveness / total).toFixed(1) : '—';
    const avgReqCoverage   = agg.req_coverage_count > 0
        ? (agg.req_coverage_sum / agg.req_coverage_count).toFixed(1)
        : null;

    const [pert, setPert] = useState({ o: '', m: '', p: '' });
    const pertValid  = pert.o !== '' && pert.m !== '' && pert.p !== '';
    const pertResult = pertValid ? pertEstimate(parseFloat(pert.o), parseFloat(pert.m), parseFloat(pert.p)) : null;
    const pertSd     = pertValid ? pertStdDev(parseFloat(pert.o), parseFloat(pert.p)) : null;

    return (
        <div className="space-y-5">
            {/* Metric tiles */}
            <div className="grid grid-cols-3 gap-4">
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

            {/* PERT Estimator */}
            <div className="rounded-xl border border-slate-200/60 dark:border-slate-700/50 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50/60 dark:bg-slate-800/40 border-b border-slate-200/50 dark:border-slate-700/50 flex items-center justify-between">
                    <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">PERT Effort Estimator</div>
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">(O + 4ML + P) ÷ 6</div>
                </div>
                <div className="p-4 grid grid-cols-4 gap-4 items-end">
                    {(['o', 'm', 'p'] as const).map((key, i) => (
                        <div key={key}>
                            <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                                {['Optimistic (hrs)', 'Most Likely (hrs)', 'Pessimistic (hrs)'][i]}
                            </div>
                            <input
                                type="number"
                                min="0"
                                step="0.5"
                                value={pert[key]}
                                onChange={e => setPert(prev => ({ ...prev, [key]: e.target.value }))}
                                placeholder="0"
                                className="w-full h-9 px-3 rounded-lg border border-slate-200/60 dark:border-slate-700/60 bg-white/60 dark:bg-slate-900/50 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all"
                            />
                        </div>
                    ))}
                    <div>
                        <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Estimate</div>
                        <div className="h-9 px-3 rounded-lg border border-violet-300/60 dark:border-violet-700/50 bg-violet-50/60 dark:bg-violet-950/30 flex items-center">
                            {pertResult !== null
                                ? <span className="text-sm font-bold text-violet-700 dark:text-violet-300">{pertResult}h ± {pertSd}h</span>
                                : <span className="text-xs leading-tight text-slate-400">Fill all three fields (O, ML, P)</span>
                            }
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

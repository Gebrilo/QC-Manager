'use client';

import React from 'react';
import {
    type ReportDefinition,
    STATUS_CONFIG, PAPER_STATUS_CLS, SUMMARY_TONE, SUMMARY_TEXT,
    GAUGE_DATA, cn,
} from './reportTypes';
import { Gauge, Sparkline, ColumnChart } from './ReportCharts';
import { Ico } from './ReportIcons';

function StatusBadge({ status, paper = false }: { status: string; paper?: boolean }) {
    const s = STATUS_CONFIG[status] || STATUS_CONFIG.ontrack;
    return (
        <span className={cn(
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
            paper ? PAPER_STATUS_CLS[status] || PAPER_STATUS_CLS.ontrack : s.cls
        )}>
            {s.label}
        </span>
    );
}

function RateBar({ value, status, paper = false }: { value: number; status: string; paper?: boolean }) {
    const color = (STATUS_CONFIG[status] || STATUS_CONFIG.ontrack).bar;
    return (
        <div className="flex items-center gap-2">
            <div className={cn('h-1.5 w-16 flex-shrink-0 rounded-full overflow-hidden', paper ? 'bg-slate-100' : 'bg-slate-100 dark:bg-slate-800')}>
                <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(100, value)}%`, background: color }} />
            </div>
            <span className={cn('text-sm tabular-nums w-9', paper ? 'text-slate-700' : 'text-slate-700 dark:text-slate-300')}>
                {value}%
            </span>
        </div>
    );
}

interface DocumentPreviewProps {
    report: ReportDefinition;
    generating: boolean;
    stamp: string;
    range: string;
    project: string;
}

export function DocumentPreview({ report, generating, stamp, range, project }: DocumentPreviewProps) {
    const gauge = GAUGE_DATA[report.id] || { value: report.rows[0]?.rate || 0, label: 'Headline', caption: '' };
    const sparkData = report.chart.bars.map(b => b.value);

    return (
        <div className="rounded-2xl p-3 sm:p-6 bg-slate-100 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
            <div className="relative mx-auto max-w-[820px] bg-white rounded-xl shadow-[0_10px_40px_-12px_rgba(0,0,0,0.25)] ring-1 ring-slate-200/80 overflow-hidden">

                {/* Generating overlay */}
                {generating && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-white/80 backdrop-blur-sm">
                        <span className="w-8 h-8 border-[3px] border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
                        <p className="text-xs font-medium text-slate-500">Compiling {report.name}…</p>
                    </div>
                )}

                {/* Letterhead */}
                <div className="px-8 sm:px-10 pt-9 pb-5">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{report.category} Report</p>
                            <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-1 leading-none">{report.name}</h3>
                            <p className="text-xs text-slate-400 mt-2">Generated {stamp}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                            <p className="text-base font-extrabold tracking-tight text-indigo-600">QC Manager</p>
                            <p className="text-[11px] text-slate-400">Governance System</p>
                            <div className="mt-2 flex justify-end">
                                <Sparkline data={sparkData} />
                            </div>
                        </div>
                    </div>
                    <div className="h-1 w-full mt-5 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600" />

                    {/* Meta row */}
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mt-4">
                        {[
                            ['Reporting period', range],
                            ['Scope', project],
                            ['Prepared by', 'admin user'],
                            ['Classification', 'Confidential'],
                        ].map(([k, v]) => (
                            <div key={k} className="flex items-center gap-1.5">
                                <span className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-400">{k}</span>
                                <span className="text-xs font-semibold text-slate-700">{v}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="px-8 sm:px-10 pb-9 space-y-7">
                    {/* Executive summary */}
                    <div className={cn('rounded-xl border p-4', SUMMARY_TONE[report.summaryTone] || SUMMARY_TONE.ontrack)}>
                        <p className={cn('text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5', SUMMARY_TEXT[report.summaryTone] || SUMMARY_TEXT.ontrack)}>
                            Executive summary
                        </p>
                        <p className="text-sm leading-relaxed text-slate-700">{report.summary}</p>
                    </div>

                    {/* KPI tiles */}
                    <div className="grid grid-cols-3 gap-3">
                        {report.kpis.map((k, i) => (
                            <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                                <p className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-400">{k.label}</p>
                                <div className="flex items-end gap-1.5 mt-2">
                                    <span className="text-2xl font-extrabold text-slate-900 leading-none">{k.value}</span>
                                    {k.delta && (
                                        <span className={cn('text-[11px] font-bold mb-0.5', k.trend === 'up' ? 'text-emerald-600' : 'text-rose-500')}>
                                            {k.trend === 'up' ? '▲' : '▼'} {k.delta}
                                        </span>
                                    )}
                                </div>
                                <p className="text-[11px] text-slate-400 mt-1">{k.sub}</p>
                            </div>
                        ))}
                    </div>

                    {/* Gauge + chart */}
                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
                        <div className="sm:col-span-2 rounded-xl border border-slate-200 p-4">
                            <Gauge {...gauge} />
                        </div>
                        <div className="sm:col-span-3 rounded-xl border border-slate-200 p-4">
                            <ColumnChart data={report.chart} />
                        </div>
                    </div>

                    {/* Detail table */}
                    <div>
                        <p className="text-[10px] uppercase tracking-[0.12em] font-bold text-slate-400 mb-2">Detail breakdown</p>
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b-2 border-slate-200">
                                    {report.columns.map((h, i) => (
                                        <th key={h} className={cn(
                                            'text-[10px] uppercase tracking-[0.08em] font-bold text-slate-400 pb-2',
                                            i === 0 ? 'pr-4' : 'px-3'
                                        )}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {report.rows.map((row, i) => (
                                    <tr key={i} className="border-b border-slate-100">
                                        <td className="py-2.5 pr-4 text-sm font-semibold text-slate-800">{row.c[0]}</td>
                                        <td className="py-2.5 px-3"><StatusBadge status={row.status} paper /></td>
                                        <td className="py-2.5 px-3"><RateBar value={row.rate} status={row.status} paper /></td>
                                        <td className="py-2.5 px-3 text-sm tabular-nums text-slate-600">{row.defects}</td>
                                        <td className="py-2.5 px-3 text-sm text-slate-500 italic">{row.rec}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-8 sm:px-10 py-4 border-t border-slate-100 bg-slate-50/70 text-center">
                    <span className="text-[10px] text-slate-400 uppercase tracking-[0.14em]">
                        QC Management Tool · Confidential · Internal Use Only
                    </span>
                </div>
            </div>
        </div>
    );
}

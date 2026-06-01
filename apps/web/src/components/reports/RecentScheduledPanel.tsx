'use client';

import React, { useState } from 'react';
import { HISTORY, INITIAL_SCHEDULED, STATUS_CONFIG, cn, type ScheduledItem } from './reportTypes';
import { Ico } from './ReportIcons';

function StatusBadge({ status }: { status: string }) {
    const s = STATUS_CONFIG[status] || STATUS_CONFIG.ontrack;
    return (
        <span className={cn(
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
            s.cls
        )}>
            {s.label}
        </span>
    );
}

const fmtIcon = (f: string) => f === 'Excel' ? 'excel' : f === 'CSV' ? 'csv' : 'pdf';
const fmtTint = (f: string) => f === 'Excel' ? 'text-emerald-600' : f === 'CSV' ? 'text-blue-500' : 'text-rose-500';

interface RecentScheduledPanelProps {
    notify: (msg: string) => void;
    onSchedule: () => void;
}

export function RecentScheduledPanel({ notify, onSchedule }: RecentScheduledPanelProps) {
    const [tab, setTab] = useState<'recent' | 'scheduled'>('recent');
    const [scheduled, setScheduled] = useState<ScheduledItem[]>(INITIAL_SCHEDULED);

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center gap-1 px-3 py-2.5 border-b border-slate-100 dark:border-slate-800">
                {([
                    ['recent', 'history', 'Recent', HISTORY.length],
                    ['scheduled', 'calendar', 'Scheduled', scheduled.length],
                ] as const).map(([id, ic, lbl, n]) => (
                    <button key={id} onClick={() => setTab(id)}
                        className={cn(
                            'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition',
                            tab === id
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                        )}>
                        <Ico k={ic} size={14} /> {lbl}
                        <span className="px-1.5 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-700 text-[10px] font-bold text-slate-500 dark:text-slate-300">{n}</span>
                    </button>
                ))}
            </div>

            {tab === 'recent' ? (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px]">
                        <thead>
                            <tr className="bg-slate-50/70 dark:bg-slate-800/40">
                                {['Report', 'Category', 'Format', 'Generated', 'By', 'Status', ''].map((h, i) => (
                                    <th key={i} className={cn(
                                        'text-[10px] uppercase tracking-[0.1em] font-bold text-slate-400 py-2.5 text-left',
                                        i === 0 ? 'pl-5 pr-4' : 'px-4',
                                        i === 6 && 'pr-5'
                                    )}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {HISTORY.map((it, i) => (
                                <tr key={it.id} className={cn(
                                    'hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition',
                                    i > 0 && 'border-t border-slate-50 dark:border-slate-800/60'
                                )}>
                                    <td className="pl-5 pr-4 py-3 text-sm font-medium text-slate-800 dark:text-slate-200">{it.name}</td>
                                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{it.category}</td>
                                    <td className="px-4 py-3">
                                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                                            <Ico k={fmtIcon(it.format)} size={13} cls={fmtTint(it.format)} />{it.format}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{it.when}</td>
                                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{it.by}</td>
                                    <td className="px-4 py-3"><StatusBadge status={it.status} /></td>
                                    <td className="pr-5 py-3 text-right">
                                        {it.status === 'ready' ? (
                                            <button onClick={() => notify(`Downloading ${it.name}.${it.format.toLowerCase()}`)}
                                                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:opacity-80 transition whitespace-nowrap">
                                                <Ico k="download" size={13} /> Download
                                            </button>
                                        ) : it.status === 'failed' ? (
                                            <button onClick={() => notify('Retrying report generation…')}
                                                className="inline-flex items-center gap-1 text-xs font-medium text-rose-500 hover:opacity-80 transition">
                                                <Ico k="refresh" size={12} /> Retry
                                            </button>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 text-xs text-amber-500">
                                                <span className="w-3 h-3 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin inline-block" /> Working
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="p-3 space-y-2">
                    <button onClick={onSchedule}
                        className="flex items-center gap-2 w-full px-4 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-500 dark:text-slate-400 hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition">
                        <Ico k="plus" size={15} /> New scheduled report
                    </button>
                    {scheduled.map(s => (
                        <div key={s.id} className="flex items-center gap-4 px-4 py-3 rounded-xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition">
                            <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center flex-shrink-0">
                                <Ico k="calendar" size={15} cls="text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{s.name}</p>
                                <p className="text-xs text-slate-400 mt-0.5">{s.cadence} · {s.recipients} recipients</p>
                            </div>
                            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                                <Ico k={fmtIcon(s.format)} size={13} cls={fmtTint(s.format)} /> {s.format}
                            </div>
                            <div className="hidden md:block text-xs text-slate-400 whitespace-nowrap">
                                Next: {s.next}
                            </div>
                            <button
                                onClick={() => setScheduled(arr => arr.map(x => x.id === s.id ? { ...x, active: !x.active } : x))}
                                className={cn(
                                    'relative w-9 h-5 rounded-full transition flex-shrink-0',
                                    s.active ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                                )}>
                                <span className={cn(
                                    'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                                    s.active && 'translate-x-4'
                                )} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

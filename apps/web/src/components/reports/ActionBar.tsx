'use client';

import React, { useState, useEffect, useRef } from 'react';
import { type ReportDefinition, cn } from './reportTypes';
import { Ico } from './ReportIcons';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/components/providers/AuthProvider';

interface ExportMenuProps {
    onPick: (fmt: string) => void;
    onClose: () => void;
}

function ExportMenu({ onPick, onClose }: ExportMenuProps) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const h = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, [onClose]);

    const items = [
        { fmt: 'PDF',   icon: 'pdf',   tint: 'text-rose-500',    desc: 'Print-ready document' },
        { fmt: 'Excel', icon: 'excel', tint: 'text-emerald-600', desc: 'Spreadsheet (.xlsx)' },
        { fmt: 'CSV',   icon: 'csv',   tint: 'text-blue-500',    desc: 'Raw data (.csv)' },
    ];

    return (
        <div ref={ref} className="absolute right-0 top-full mt-2 w-56 z-50 rounded-xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-slate-200 dark:ring-slate-800 p-1.5 animate-in fade-in zoom-in-95 duration-150">
            {items.map(it => (
                <button key={it.fmt} onClick={() => onPick(it.fmt)}
                    className="flex items-center gap-3 w-full px-2.5 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition text-left">
                    <Ico k={it.icon} size={18} cls={it.tint} />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Export {it.fmt}</p>
                        <p className="text-[11px] text-slate-400">{it.desc}</p>
                    </div>
                </button>
            ))}
        </div>
    );
}

interface SelectishOption {
    value: string;
    label: string;
}

function Selectish({ icon, value, onChange, options }: {
    icon: string;
    value: string;
    onChange: (v: string) => void;
    options: Array<string | SelectishOption>;
}) {
    return (
        <div className="relative">
            <select value={value} onChange={e => onChange(e.target.value)}
                className="appearance-none h-7 pl-7 pr-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition cursor-pointer">
                {options.map(o => {
                    const opt = typeof o === 'string' ? { value: o, label: o } : o;
                    return <option key={opt.value} value={opt.value}>{opt.label}</option>;
                })}
            </select>
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <Ico k={icon} size={12} />
            </span>
            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <Ico k="chevDown" size={11} />
            </span>
        </div>
    );
}

interface ActionBarProps {
    report: ReportDefinition;
    generating: boolean;
    onGenerate: () => void;
    fmt: string;
    setFmt: (f: string) => void;
    range: string;
    setRange: (r: string) => void;
    dateFrom: string;
    setDateFrom: (d: string) => void;
    dateTo: string;
    setDateTo: (d: string) => void;
    project: string;
    setProject: (p: string) => void;
    projects?: Array<{ id: string; name: string }>;
    onShare: () => void;
    onSchedule: () => void;
    notify: (msg: string) => void;
}

export function ActionBar({
    report, generating, onGenerate, fmt, setFmt,
    range, setRange, dateFrom, setDateFrom, dateTo, setDateTo,
    project, setProject, projects = [],
    onShare, onSchedule, notify,
}: ActionBarProps) {
    const [menu, setMenu] = useState(false);
    const { hasPermission } = useAuth();
    const canExport = hasPermission('qc.reports.export');
    const canGenerate = hasPermission('qc.reports.generate');

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-visible">
            <div className="flex items-center justify-between gap-3 px-5 py-4 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white flex-shrink-0 bg-gradient-to-br from-indigo-600 to-violet-600">
                        <Ico k={report.iconKey} size={20} />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight truncate">{report.name}</h2>
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex-shrink-0">
                                {report.category}
                            </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                            <Ico k="clock" size={11} /> Last generated {report.lastGenerated} · Est. {report.est}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={onSchedule}
                        className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                        <Ico k="calendar" size={14} /> <span className="hidden sm:inline">Schedule</span>
                    </button>
                    <button onClick={onShare}
                        className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                        <Ico k="share" size={14} /> <span className="hidden sm:inline">Share</span>
                    </button>
                    {canExport && (
                        <div className="relative">
                            <button onClick={() => setMenu(m => !m)}
                                className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                                <Ico k="download" size={14} /> Export <Ico k="chevDown" size={12} cls="text-slate-400" />
                            </button>
                            {menu && (
                                <ExportMenu
                                    onClose={() => setMenu(false)}
                                    onPick={f => { setMenu(false); setFmt(f); notify(`Exported ${report.name} as ${f}`); }}
                                />
                            )}
                        </div>
                    )}
                    {canGenerate && (
                        <Button
                            variant="primary"
                            onClick={onGenerate}
                            loading={generating}
                            loadingText="Generating… (est ~30s)"
                            disabled={generating}
                            className="min-w-[220px]"
                        >
                            Generate
                        </Button>
                    )}
                </div>
            </div>

            {/* Filter strip */}
            <div className="flex items-center gap-3 px-5 py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 flex-wrap rounded-b-2xl">
                <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] font-bold text-slate-400">
                    <Ico k="filter" size={12} /> Filters
                </span>
                <Selectish icon="calendar" value={range} onChange={setRange}
                    options={['Last 7 days', 'Last 30 days', 'This quarter', 'Year to date', 'Custom range']} />
                {range === 'Custom range' && (
                    <>
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={e => setDateFrom(e.target.value)}
                            className="h-7 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                        />
                        <span className="text-xs text-slate-400">—</span>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={e => setDateTo(e.target.value)}
                            min={dateFrom || undefined}
                            className="h-7 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                        />
                    </>
                )}
                <Selectish
                    icon="grid"
                    value={project}
                    onChange={setProject}
                    options={[
                        { value: '', label: 'All projects' },
                        ...projects.map(p => ({ value: p.id, label: p.name })),
                    ]}
                />
                {canExport && (
                    <div className="ml-auto flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                        {['PDF', 'Excel', 'CSV'].map(f => (
                            <button key={f} onClick={() => setFmt(f)}
                                className={cn(
                                    'px-2.5 h-6 rounded-md text-[11px] font-bold transition',
                                    fmt === f
                                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                                )}>
                                {f}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

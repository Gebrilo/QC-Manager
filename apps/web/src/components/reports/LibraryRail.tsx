'use client';

import React, { useState } from 'react';
import { REPORTS, type ReportDefinition, cn } from './reportTypes';
import { Ico } from './ReportIcons';

const ICON_GRAD: Record<string, string> = {
    rocket:    'from-indigo-500 to-violet-500',
    pulse:     'from-blue-500 to-indigo-500',
    scale:     'from-emerald-500 to-teal-500',
    barChart:  'from-slate-500 to-slate-600',
    bug:       'from-rose-400 to-rose-500',
    grid:      'from-blue-400 to-cyan-500',
    users:     'from-violet-400 to-violet-500',
    trendUp:   'from-blue-500 to-indigo-500',
};

interface LibraryRailProps {
    activeId: string;
    onSelect: (id: string) => void;
}

export function LibraryRail({ activeId, onSelect }: LibraryRailProps) {
    const [q, setQ] = useState('');
    const groups: Array<'Governance' | 'Operational'> = ['Governance', 'Operational'];
    const filtered = REPORTS.filter(r =>
        (r.name + r.desc).toLowerCase().includes(q.toLowerCase())
    );

    return (
        <div className="w-64 xl:w-72 flex-shrink-0">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden sticky top-[72px]">
                <div className="p-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2 h-9 px-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-transparent focus-within:border-indigo-500 focus-within:bg-white dark:focus-within:bg-slate-800 transition">
                        <Ico k="search" size={14} cls="text-slate-400 flex-shrink-0" />
                        <input
                            value={q}
                            onChange={e => setQ(e.target.value)}
                            placeholder="Search reports"
                            className="flex-1 bg-transparent text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none min-w-0"
                        />
                        {q && (
                            <button onClick={() => setQ('')} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                                <Ico k="x" size={13} />
                            </button>
                        )}
                    </div>
                </div>
                <div className="p-2 max-h-[calc(100vh-220px)] overflow-y-auto">
                    {groups.map(g => {
                        const items = filtered.filter(r => r.category === g);
                        if (!items.length) return null;
                        return (
                            <div key={g} className="mb-1">
                                <div className="flex items-center gap-1.5 px-2.5 pt-2.5 pb-1.5">
                                    <Ico k={g === 'Governance' ? 'governance' : 'barChart'} size={11} cls="text-slate-400" />
                                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{g}</span>
                                    <span className="text-[10px] font-bold text-slate-300 dark:text-slate-600">{items.length}</span>
                                </div>
                                {items.map(r => {
                                    const active = r.id === activeId;
                                    return (
                                        <button
                                            key={r.id}
                                            onClick={() => onSelect(r.id)}
                                            className={cn(
                                                'group w-full text-left flex items-start gap-2.5 px-2.5 py-2.5 rounded-xl transition-all duration-150',
                                                active ? 'bg-indigo-50 dark:bg-indigo-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                                            )}
                                        >
                                            <div className={cn(
                                                'mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition',
                                                active
                                                    ? `bg-gradient-to-br ${ICON_GRAD[r.iconKey] || 'from-indigo-500 to-violet-500'} text-white`
                                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200'
                                            )}>
                                                <Ico k={r.iconKey} size={13} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={cn(
                                                    'text-[13px] font-semibold leading-tight truncate',
                                                    active ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200'
                                                )}>{r.name}</p>
                                                <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1 truncate">
                                                    <Ico k="clock" size={9} cls="flex-shrink-0" /> {r.lastGenerated}
                                                </p>
                                            </div>
                                            {active && <Ico k="chevRight" size={13} cls="text-indigo-400 mt-1.5 flex-shrink-0" />}
                                        </button>
                                    );
                                })}
                            </div>
                        );
                    })}
                    {!filtered.length && (
                        <p className="text-center text-xs text-slate-400 py-8">No reports match "{q}"</p>
                    )}
                </div>
            </div>
        </div>
    );
}

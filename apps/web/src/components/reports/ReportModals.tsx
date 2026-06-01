'use client';

import React, { useState, useEffect, useRef } from 'react';
import { cn } from './reportTypes';
import { Ico } from './ReportIcons';

// ── Modal shell ──────────────────────────────────────────────────────────────
function Modal({
    title, subtitle, icon, onClose, children, footer, wide,
}: {
    title: string; subtitle?: string; icon: string; onClose: () => void;
    children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
            <div className={cn(
                'relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl ring-1 ring-slate-200 dark:ring-slate-800 w-full animate-in zoom-in-95 duration-150',
                wide ? 'max-w-lg' : 'max-w-md'
            )}>
                <div className="flex items-start gap-3 px-6 pt-6 pb-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0 bg-gradient-to-br from-indigo-600 to-violet-600">
                        <Ico k={icon} size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">{title}</h3>
                        {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
                    </div>
                    <button onClick={onClose}
                        className="p-1.5 -mr-1.5 -mt-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <Ico k="x" size={16} />
                    </button>
                </div>
                <div className="px-6 pb-2">{children}</div>
                {footer && (
                    <div className="flex items-center justify-end gap-2 px-6 py-4 mt-2 border-t border-slate-100 dark:border-slate-800">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}

const fieldCls = 'h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition';
const FieldLabel = ({ children }: { children: React.ReactNode }) => (
    <label className="block text-[10px] uppercase tracking-[0.1em] font-bold text-slate-400 mb-1.5">{children}</label>
);

function GhostBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
    return (
        <button onClick={onClick} className="h-9 px-4 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            {children}
        </button>
    );
}

function PrimaryBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
    return (
        <button onClick={onClick}
            className="h-9 px-4 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:opacity-95 active:scale-95 transition shadow-lg shadow-indigo-500/30">
            {children}
        </button>
    );
}

// ── Share modal ───────────────────────────────────────────────────────────────
interface ShareModalProps {
    report: { id: string; name: string; format?: string };
    onClose: () => void;
    notify: (msg: string) => void;
}

export function ShareModal({ report, onClose, notify }: ShareModalProps) {
    const [recipients, setRecipients] = useState(['leadership@qc.io']);
    const [input, setInput] = useState('');
    const link = `https://qc.app/r/${report.id}-share`;

    function add() {
        const v = input.trim();
        if (v && !recipients.includes(v)) setRecipients(r => [...r, v]);
        setInput('');
    }

    return (
        <Modal icon="share" title="Share report" subtitle={report.name} onClose={onClose} wide
            footer={
                <>
                    <GhostBtn onClick={onClose}>Cancel</GhostBtn>
                    <PrimaryBtn onClick={() => {
                        onClose();
                        notify(`Shared with ${recipients.length} recipient${recipients.length > 1 ? 's' : ''}`);
                    }}>Send</PrimaryBtn>
                </>
            }
        >
            <FieldLabel>Shareable link</FieldLabel>
            <div className="flex items-center gap-2 mb-4">
                <div className="flex-1 flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 min-w-0">
                    <Ico k="link" size={13} cls="text-slate-400 flex-shrink-0" />
                    <span className="text-xs text-slate-500 dark:text-slate-400 truncate">{link}</span>
                </div>
                <button onClick={() => notify('Link copied to clipboard')}
                    className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition flex-shrink-0">
                    <Ico k="copy" size={13} /> Copy
                </button>
            </div>

            <FieldLabel>Recipients</FieldLabel>
            <div className="flex flex-wrap gap-1.5 mb-2">
                {recipients.map(r => (
                    <span key={r} className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 text-xs font-medium">
                        {r}
                        <button onClick={() => setRecipients(x => x.filter(i => i !== r))} className="opacity-60 hover:opacity-100">
                            <Ico k="x" size={11} sw={2.5} />
                        </button>
                    </span>
                ))}
            </div>
            <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                    <Ico k="mail" size={13} cls="text-slate-400" />
                    <input value={input} onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && add()}
                        placeholder="name@company.com"
                        className="flex-1 bg-transparent text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none" />
                </div>
                <button onClick={add}
                    className="h-9 w-9 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                    <Ico k="plus" size={15} />
                </button>
            </div>
            <label className="flex items-center gap-2 mt-4 mb-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                <input type="checkbox" defaultChecked className="accent-indigo-600 w-4 h-4" />
                Attach the {report.format || 'PDF'} export
            </label>
        </Modal>
    );
}

// ── Schedule modal ────────────────────────────────────────────────────────────
interface ScheduleModalProps {
    report: { name: string };
    onClose: () => void;
    notify: (msg: string) => void;
}

export function ScheduleModal({ report, onClose, notify }: ScheduleModalProps) {
    const [cadence, setCadence] = useState('Weekly');
    const [day, setDay] = useState('Monday');
    const [time, setTime] = useState('08:00');
    const [fmt, setFmt] = useState('PDF');

    return (
        <Modal icon="calendar" title="Schedule report" subtitle={report.name} onClose={onClose} wide
            footer={
                <>
                    <GhostBtn onClick={onClose}>Cancel</GhostBtn>
                    <PrimaryBtn onClick={() => {
                        onClose();
                        notify(`Scheduled ${cadence.toLowerCase()} · delivers as ${fmt}`);
                    }}>Create schedule</PrimaryBtn>
                </>
            }
        >
            <FieldLabel>Frequency</FieldLabel>
            <div className="flex gap-1.5 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 mb-4">
                {['Daily', 'Weekly', 'Monthly'].map(c => (
                    <button key={c} onClick={() => setCadence(c)}
                        className={cn(
                            'flex-1 h-8 rounded-md text-sm font-medium transition',
                            cadence === c
                                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                        )}>
                        {c}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
                {cadence === 'Weekly' && (
                    <div>
                        <FieldLabel>Day</FieldLabel>
                        <select className={fieldCls} value={day} onChange={e => setDay(e.target.value)}>
                            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(d => <option key={d}>{d}</option>)}
                        </select>
                    </div>
                )}
                <div>
                    <FieldLabel>Time</FieldLabel>
                    <input type="time" value={time} onChange={e => setTime(e.target.value)} className={fieldCls} />
                </div>
                <div>
                    <FieldLabel>Format</FieldLabel>
                    <select className={fieldCls} value={fmt} onChange={e => setFmt(e.target.value)}>
                        <option>PDF</option><option>Excel</option><option>CSV</option>
                    </select>
                </div>
            </div>

            <div className="flex items-center gap-2 p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 mb-2">
                <Ico k="clock" size={14} cls="text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                <span className="text-xs text-indigo-700 dark:text-indigo-300 font-medium">
                    Delivers {cadence.toLowerCase()}{cadence === 'Weekly' ? ` on ${day}` : ''} at {time} to subscribed recipients.
                </span>
            </div>
        </Modal>
    );
}

// ── Toast ─────────────────────────────────────────────────────────────────────
export function Toast({ toast }: { toast: string | null }) {
    if (!toast) return null;
    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-2xl ring-1 ring-black/10">
                <span className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-white flex-shrink-0">
                    <Ico k="check" size={13} sw={2.5} />
                </span>
                <span className="text-sm font-medium whitespace-nowrap">{toast}</span>
            </div>
        </div>
    );
}

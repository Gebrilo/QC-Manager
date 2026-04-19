'use client';

import { useEffect, useRef, useState } from 'react';
import { IDPTask, developmentPlansApi } from '../../lib/api';
import { useToast } from '../ui/Toast';
import { HoldTaskDialog } from './HoldTaskDialog';

type Status = IDPTask['progress_status']; // 'TODO' | 'IN_PROGRESS' | 'ON_HOLD' | 'DONE'

interface TaskStatusControlProps {
    task: IDPTask;
    onStatusChanged: () => void;
}

const STATUS_META: Record<Status, { label: string; swatch: string }> = {
    TODO:        { label: 'Todo',        swatch: 'bg-slate-300 dark:bg-slate-600' },
    IN_PROGRESS: { label: 'In progress', swatch: 'bg-indigo-500' },
    ON_HOLD:     { label: 'On hold',     swatch: 'bg-amber-500' },
    DONE:        { label: 'Done',        swatch: 'bg-emerald-500' },
};

const MENU_ORDER: Status[] = ['TODO', 'IN_PROGRESS', 'ON_HOLD', 'DONE'];

export function TaskStatusControl({ task, onStatusChanged }: TaskStatusControlProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [holdOpen, setHoldOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const toast = useToast();

    useEffect(() => {
        if (!menuOpen) return;
        const handler = (e: MouseEvent) => {
            if (!menuRef.current?.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) {
                setMenuOpen(false);
            }
        };
        const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
        document.addEventListener('mousedown', handler);
        window.addEventListener('keydown', keyHandler);
        return () => {
            document.removeEventListener('mousedown', handler);
            window.removeEventListener('keydown', keyHandler);
        };
    }, [menuOpen]);

    async function applyStatus(next: Status) {
        if (saving) return;
        if (next === task.progress_status) { setMenuOpen(false); return; }
        if (next === 'ON_HOLD') {
            setMenuOpen(false);
            setHoldOpen(true);
            return;
        }
        setSaving(true);
        try {
            await developmentPlansApi.updateMyTaskStatus(task.id, next);
            toast.success(next === 'DONE' ? 'Task completed' : `Status updated to ${STATUS_META[next].label}`);
            onStatusChanged();
        } catch (err: any) {
            toast.error(err?.message || 'Could not update status');
        } finally {
            setSaving(false);
            setMenuOpen(false);
        }
    }

    async function toggleDone() {
        if (saving) return;
        const next: Status = task.progress_status === 'DONE' ? 'IN_PROGRESS' : 'DONE';
        await applyStatus(next);
    }

    const current = STATUS_META[task.progress_status];
    const isDone = task.progress_status === 'DONE';

    return (
        <>
            <div className="flex items-center gap-2">
                {/* Checkbox: only toggles DONE ↔ IN_PROGRESS. Never silently reverts completion on a stray click. */}
                <button
                    type="button"
                    role="checkbox"
                    aria-checked={isDone}
                    aria-label={isDone ? 'Mark task as not done' : 'Mark task as done'}
                    disabled={saving}
                    onClick={toggleDone}
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors
                        ${isDone
                            ? 'bg-emerald-500 border-emerald-500'
                            : 'border-slate-300 dark:border-slate-600 hover:border-indigo-400'}
                        disabled:opacity-50`}
                >
                    {isDone && (
                        <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none" aria-hidden>
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    )}
                </button>

                {/* Status pill: opens popover with all 4 statuses */}
                <div className="relative">
                    <button
                        ref={triggerRef}
                        type="button"
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        aria-label={`Change status, currently ${current.label}`}
                        onClick={() => setMenuOpen(v => !v)}
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                    >
                        <span className={`w-1.5 h-1.5 rounded-full ${current.swatch}`} aria-hidden />
                        <span>{current.label}</span>
                        <svg className="w-3 h-3 text-slate-400" viewBox="0 0 12 12" fill="none" aria-hidden>
                            <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>

                    {menuOpen && (
                        <div
                            ref={menuRef}
                            role="menu"
                            className="absolute right-0 mt-1 z-20 w-40 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1"
                        >
                            {MENU_ORDER.map(s => {
                                const meta = STATUS_META[s];
                                const isCurrent = s === task.progress_status;
                                return (
                                    <button
                                        key={s}
                                        role="menuitem"
                                        type="button"
                                        onClick={() => applyStatus(s)}
                                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-slate-50 dark:hover:bg-slate-800 ${isCurrent ? 'font-semibold' : ''}`}
                                    >
                                        <span className={`w-1.5 h-1.5 rounded-full ${meta.swatch}`} aria-hidden />
                                        <span className="flex-1">{meta.label}</span>
                                        {isCurrent && (
                                            <svg className="w-3 h-3 text-indigo-500" viewBox="0 0 12 12" fill="none" aria-hidden>
                                                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <HoldTaskDialog
                taskId={task.id}
                taskTitle={task.title}
                open={holdOpen}
                onClose={() => setHoldOpen(false)}
                onSuccess={onStatusChanged}
            />
        </>
    );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { developmentPlansApi } from '../../lib/api';
import { useToast } from '../ui/Toast';

interface HoldTaskDialogProps {
    taskId: string;
    taskTitle: string;
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const MIN_REASON_LEN = 3;

export function HoldTaskDialog({ taskId, taskTitle, open, onClose, onSuccess }: HoldTaskDialogProps) {
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const [visible, setVisible] = useState(false);
    const toast = useToast();
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (!open) {
            setReason('');
            setVisible(false);
            return;
        }
        const raf = requestAnimationFrame(() => setVisible(true));
        const focusRaf = requestAnimationFrame(() => textareaRef.current?.focus());
        return () => { cancelAnimationFrame(raf); cancelAnimationFrame(focusRaf); };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', handler);
            document.body.style.overflow = prevOverflow;
        };
    }, [open, onClose]);

    if (!open) return null;

    const trimmed = reason.trim();
    const canSubmit = trimmed.length >= MIN_REASON_LEN && !saving;

    async function handleSubmit() {
        if (!canSubmit) return;
        setSaving(true);
        try {
            await developmentPlansApi.updateMyTaskStatus(taskId, 'ON_HOLD', trimmed);
            toast.success('Task placed on hold');
            onSuccess();
            onClose();
        } catch (err: any) {
            toast.error(err?.message || 'Could not place task on hold');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="hold-dialog-title"
            className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-150 ${visible ? 'opacity-100' : 'opacity-0'}`}
        >
            <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
            <div className="relative bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl w-full max-w-md mx-4 p-5">
                <h2 id="hold-dialog-title" className="text-base font-semibold text-slate-900 dark:text-white">
                    Place task on hold
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">{taskTitle}</p>

                <label className="block mt-4 text-xs font-medium text-slate-600 dark:text-slate-300" htmlFor="hold-reason">
                    Why is this blocked? (required)
                </label>
                <textarea
                    ref={textareaRef}
                    id="hold-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    minLength={MIN_REASON_LEN}
                    className="mt-1 w-full text-sm p-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
                    placeholder="e.g. Waiting on feedback from design review"
                />
                <p className="mt-1 text-xs text-slate-400">
                    {trimmed.length}/{MIN_REASON_LEN}+ chars · saved as the first comment on this task
                </p>

                <div className="mt-4 flex items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-500 text-slate-900 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? 'Saving…' : 'Place on hold'}
                    </button>
                </div>
            </div>
        </div>
    );
}

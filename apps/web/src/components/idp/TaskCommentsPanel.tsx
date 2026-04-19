'use client';

import { useEffect, useState } from 'react';
import { developmentPlansApi, IDPTaskComment } from '../../lib/api';
import { useToast } from '../ui/Toast';

interface TaskCommentsPanelProps {
    open: boolean;
    taskId: string | null;
    taskTitle: string;
    currentUserId: string;
    managerUserId?: string;
    onClose: () => void;
}

function fmtTime(iso: string) {
    try {
        const d = new Date(iso);
        return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch {
        return iso.slice(0, 16);
    }
}

export function TaskCommentsPanel({ open, taskId, taskTitle, currentUserId, managerUserId, onClose }: TaskCommentsPanelProps) {
    const [comments, setComments] = useState<IDPTaskComment[]>([]);
    const [loading, setLoading] = useState(false);
    const [draft, setDraft] = useState('');
    const [posting, setPosting] = useState(false);
    const [visible, setVisible] = useState(false);
    const toast = useToast();

    useEffect(() => {
        if (!open) { setVisible(false); return; }
        const raf = requestAnimationFrame(() => setVisible(true));
        return () => cancelAnimationFrame(raf);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, onClose]);

    useEffect(() => {
        if (!open || !taskId) return;
        let cancelled = false;
        setLoading(true);
        const list = managerUserId
            ? developmentPlansApi.listTaskComments(managerUserId, taskId)
            : developmentPlansApi.listMyTaskComments(taskId);
        list
            .then(data => { if (!cancelled) setComments(data); })
            .catch((err: any) => { if (!cancelled) toast.error(err?.message || 'Could not load comments'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [open, taskId, managerUserId, toast]);

    async function submit() {
        if (!taskId) return;
        const body = draft.trim();
        if (body.length === 0 || posting) return;
        setPosting(true);
        try {
            const created = managerUserId
                ? await developmentPlansApi.addTaskComment(managerUserId, taskId, body)
                : await developmentPlansApi.addMyTaskComment(taskId, body);
            setComments(prev => [...prev, created]);
            setDraft('');
        } catch (err: any) {
            toast.error(err?.message || 'Could not add comment');
        } finally {
            setPosting(false);
        }
    }

    if (!open) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="comments-panel-title"
            className="fixed inset-0 z-40"
        >
            <div
                className={`absolute inset-0 bg-slate-900/40 transition-opacity duration-150 ${visible ? 'opacity-100' : 'opacity-0'}`}
                onClick={onClose}
            />
            <div
                className={`absolute top-0 right-0 h-full w-full max-w-md bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 shadow-xl flex flex-col transition-transform duration-200 ${visible ? 'translate-x-0' : 'translate-x-full'}`}
            >
                <div className="flex items-start justify-between p-4 border-b border-slate-200 dark:border-slate-700">
                    <div className="min-w-0">
                        <h2 id="comments-panel-title" className="text-sm font-semibold text-slate-900 dark:text-white">Comments</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{taskTitle}</p>
                    </div>
                    <button
                        type="button"
                        aria-label="Close comments panel"
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-sm"
                    >
                        ✕
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {loading && <p className="text-xs text-slate-400">Loading…</p>}
                    {!loading && comments.length === 0 && (
                        <p className="text-xs text-slate-400">No comments yet. Start the thread below.</p>
                    )}
                    {comments.map(c => {
                        const isMe = c.author_id === currentUserId;
                        return (
                            <div key={c.id} className={`rounded-lg px-3 py-2 ${isMe ? 'bg-indigo-50 dark:bg-indigo-900/20 ml-6' : 'bg-slate-50 dark:bg-slate-800/60'}`}>
                                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
                                    <span className="font-medium text-slate-700 dark:text-slate-200">
                                        {c.author_name || 'Unknown'}
                                        {c.author_role === 'manager' && (
                                            <span className="ml-1 text-[10px] uppercase tracking-wide text-indigo-500">Manager</span>
                                        )}
                                    </span>
                                    <span>·</span>
                                    <span>{fmtTime(c.created_at)}</span>
                                </div>
                                <p className="text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap">{c.body}</p>
                            </div>
                        );
                    })}
                </div>

                <div className="p-4 border-t border-slate-200 dark:border-slate-700">
                    <label htmlFor="comment-draft" className="sr-only">New comment</label>
                    <textarea
                        id="comment-draft"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={3}
                        placeholder="Add a comment…"
                        className="w-full text-sm p-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
                    />
                    <div className="mt-2 flex items-center justify-end">
                        <button
                            type="button"
                            onClick={submit}
                            disabled={posting || draft.trim().length === 0}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {posting ? 'Posting…' : 'Post comment'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

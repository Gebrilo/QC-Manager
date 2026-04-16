'use client';

import { useState, useEffect } from 'react';

interface PersonalTask {
    id: string;
    title: string;
    description: string | null;
    status: 'pending' | 'in_progress' | 'done' | 'cancelled';
    priority: 'low' | 'medium' | 'high';
    due_date: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface TaskFormPayload {
    title: string;
    description: string | null;
    status: 'pending' | 'in_progress' | 'done' | 'cancelled';
    priority: 'low' | 'medium' | 'high';
    due_date: string | null;
}

interface TaskDetailModalProps {
    task: PersonalTask | null;
    onClose: () => void;
    onSave: (data: TaskFormPayload, id?: string) => Promise<void>;
    onDelete: (id: string) => void;
}

export function TaskDetailModal({ task, onClose, onSave, onDelete }: TaskDetailModalProps) {
    const isCreate = task === null;
    const [formData, setFormData] = useState<TaskFormPayload>({
        title: '',
        description: null,
        status: 'pending',
        priority: 'medium',
        due_date: null,
    });
    const [saving, setSaving] = useState(false);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        setFormData(
            task
                ? { title: task.title, description: task.description, status: task.status, priority: task.priority, due_date: task.due_date }
                : { title: '', description: null, status: 'pending', priority: 'medium', due_date: null }
        );
    }, [task]);

    useEffect(() => {
        const raf = requestAnimationFrame(() => setVisible(true));
        return () => cancelAnimationFrame(raf);
    }, []);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const handleSave = async () => {
        if (!formData.title.trim()) return;
        setSaving(true);
        try {
            await onSave(
                { ...formData, title: formData.title.trim(), description: formData.description || null },
                task?.id
            );
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = () => {
        if (!task) return;
        onClose();
        onDelete(task.id);
    };

    return (
        <div
            role="dialog"
            aria-label="Task detail"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className={`bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg transition-all duration-150 ease-out ${
                    visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
                }`}
                onClick={e => e.stopPropagation()}
            >
                {/* Header: label + title input + close button */}
                <div className="flex items-start gap-3 p-5 pb-0">
                    <div className="flex-1">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Task</p>
                        <input
                            type="text"
                            value={formData.title}
                            onChange={e => setFormData(p => ({ ...p, title: e.target.value }))}
                            placeholder="Task title"
                            autoFocus
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                        />
                    </div>
                    <button
                        onClick={onClose}
                        className="mt-6 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex-shrink-0"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Description textarea */}
                <div className="px-5 pt-4">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Description</p>
                    <textarea
                        value={formData.description ?? ''}
                        onChange={e => setFormData(p => ({ ...p, description: e.target.value || null }))}
                        placeholder="Add a description (optional)"
                        rows={3}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none max-h-48 overflow-y-auto"
                    />
                </div>

                {/* Metadata: Status · Priority · Due Date */}
                <div className="px-5 pt-3 grid grid-cols-3 gap-3">
                    <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Status</p>
                        <select
                            value={formData.status}
                            onChange={e => setFormData(p => ({ ...p, status: e.target.value as PersonalTask['status'] }))}
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                        >
                            <option value="pending">To Do</option>
                            <option value="in_progress">In Progress</option>
                            <option value="done">Done</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                    </div>
                    <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Priority</p>
                        <select
                            value={formData.priority}
                            onChange={e => setFormData(p => ({ ...p, priority: e.target.value as PersonalTask['priority'] }))}
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                        >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                        </select>
                    </div>
                    <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Due Date</p>
                        <input
                            type="date"
                            value={formData.due_date ?? ''}
                            onChange={e => setFormData(p => ({ ...p, due_date: e.target.value || null }))}
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                        />
                    </div>
                </div>

                {/* Timestamps — edit mode only */}
                {!isCreate && task && (
                    <div className="px-5 pt-2 flex gap-4">
                        <span className="text-[10px] text-slate-400">
                            Created {new Date(task.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <span className="text-[10px] text-slate-400">
                            Updated {new Date(task.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                    </div>
                )}

                {/* Divider */}
                <div className="mx-5 mt-4 border-t border-slate-100 dark:border-slate-800" />

                {/* Footer */}
                <div className="px-5 py-4 flex items-center justify-between">
                    {!isCreate ? (
                        <button
                            onClick={handleDelete}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 dark:bg-rose-900/20 dark:hover:bg-rose-900/30 dark:text-rose-400 border border-rose-200 dark:border-rose-800 transition-colors"
                        >
                            Delete
                        </button>
                    ) : (
                        <div />
                    )}
                    <div className="flex gap-2">
                        <button
                            onClick={onClose}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving || !formData.title.trim()}
                            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
                        >
                            {saving ? 'Saving…' : isCreate ? 'Create' : 'Save changes'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

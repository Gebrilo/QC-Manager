'use client';

import { useState, useEffect, useCallback } from 'react';

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

interface TaskFormPayload {
    title: string;
    description: string | null;
    priority: 'low' | 'medium' | 'high';
    due_date: string | null;
}

interface TaskDetailModalProps {
    task: PersonalTask | null;
    onClose: () => void;
    onSave: (data: TaskFormPayload, id?: string) => Promise<void>;
    onDelete: (id: string) => void;
    onStatusChange: (id: string, status: string) => void;
}

const inputClass = 'w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50';
const labelClass = 'text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider';

function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function TaskDetailModal({ task, onClose, onSave, onDelete, onStatusChange }: TaskDetailModalProps) {
    const isCreate = !task;
    const [title, setTitle] = useState(task?.title ?? '');
    const [description, setDescription] = useState(task?.description ?? '');
    const [priority, setPriority] = useState<TaskFormPayload['priority']>(task?.priority ?? 'medium');
    const [dueDate, setDueDate] = useState(task?.due_date ?? '');
    const [saving, setSaving] = useState(false);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        requestAnimationFrame(() => setVisible(true));
    }, []);

    const handleClose = useCallback(() => {
        setVisible(false);
        setTimeout(onClose, 100);
    }, [onClose]);

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') handleClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [handleClose]);

    const handleSave = async () => {
        if (!title.trim() || saving) return;
        setSaving(true);
        try {
            await onSave(
                {
                    title: title.trim(),
                    description: description || null,
                    priority,
                    due_date: dueDate || null,
                },
                task?.id,
            );
            setVisible(false);
            setTimeout(onClose, 100);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = () => {
        if (!task) return;
        setVisible(false);
        setTimeout(() => onDelete(task.id), 100);
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
            onClick={handleClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className={`bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg p-6 space-y-5 transition-all duration-150 ease-out ${visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
            >
                {/* Header */}
                <div className="flex items-center justify-between">
                    <span className={labelClass}>{isCreate ? 'New Task' : 'Task'}</span>
                    <button
                        onClick={handleClose}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Title */}
                <div>
                    <label className={`${labelClass} mb-1.5 block`}>Title</label>
                    <input
                        type="text"
                        placeholder="Task title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className={inputClass}
                        autoFocus
                    />
                </div>

                {/* Description */}
                <div>
                    <label className={`${labelClass} mb-1.5 block`}>Description</label>
                    <textarea
                        placeholder="Description (optional)"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        className={`${inputClass} resize-none max-h-48`}
                    />
                </div>

                {/* Status / Priority / Due Date */}
                <div className="grid grid-cols-3 gap-3">
                    {!isCreate && (
                        <div>
                            <label className={`${labelClass} mb-1.5 block`}>Status</label>
                            <select
                                value={task!.status}
                                onChange={(e) => onStatusChange(task!.id, e.target.value)}
                                className={inputClass}
                            >
                                <option value="pending">To Do</option>
                                <option value="in_progress">In Progress</option>
                                <option value="done">Done</option>
                                <option value="cancelled">Cancelled</option>
                            </select>
                        </div>
                    )}
                    <div>
                        <label className={`${labelClass} mb-1.5 block`}>Priority</label>
                        <select
                            value={priority}
                            onChange={(e) => setPriority(e.target.value as TaskFormPayload['priority'])}
                            className={inputClass}
                        >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                        </select>
                    </div>
                    <div>
                        <label className={`${labelClass} mb-1.5 block`}>Due</label>
                        <input
                            type="date"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                            className={inputClass}
                        />
                    </div>
                </div>

                {/* Metadata */}
                {!isCreate && (
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                        Created {formatDate(task!.created_at)} · Updated {formatDate(task!.updated_at)}
                    </p>
                )}

                {/* Divider */}
                <div className="border-t border-slate-200 dark:border-slate-800" />

                {/* Footer */}
                <div className="flex items-center justify-between">
                    <div>
                        {!isCreate && (
                            <button
                                onClick={handleDelete}
                                className="px-3 py-1.5 text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                            >
                                Delete
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleClose}
                            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving || !title.trim()}
                            className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
                        >
                            {saving ? 'Saving...' : isCreate ? 'Create' : 'Save changes'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

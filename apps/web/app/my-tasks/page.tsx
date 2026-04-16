'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../src/components/providers/AuthProvider';
import { ViewToggle } from '../../src/components/tasks/ViewToggle';
import { TaskKanbanBoard } from '../../src/components/tasks/TaskKanbanBoard';
import { TaskDetailModal, type TaskFormPayload } from '../../src/components/tasks/TaskDetailModal';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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

const STATUS_CONFIG = {
    pending: { label: 'To Do', color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700' },
    in_progress: { label: 'In Progress', color: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' },
    done: { label: 'Done', color: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' },
    cancelled: { label: 'Cancelled', color: 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800' },
};

const PRIORITY_CONFIG = {
    low: { label: 'Low', color: 'text-slate-500' },
    medium: { label: 'Medium', color: 'text-amber-500' },
    high: { label: 'High', color: 'text-rose-500' },
};

export default function MyTasksPage() {
    const { token } = useAuth();
    const [tasks, setTasks] = useState<PersonalTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [viewMode, setViewMode] = useState<'table' | 'board'>('table');
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const [selectedTask, setSelectedTask] = useState<PersonalTask | null>(null);
    const [modalOpen, setModalOpen] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem('qc_my_tasks_view');
        if (stored === 'table' || stored === 'board') {
            setViewMode(stored);
        }
    }, []);

    const handleViewChange = useCallback((view: 'table' | 'board') => {
        setViewMode(view);
        localStorage.setItem('qc_my_tasks_view', view);
    }, []);

    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    const fetchTasks = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/my-tasks`, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) throw new Error('Failed to load tasks');
            setTasks(await res.json());
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        if (token) fetchTasks();
    }, [token, fetchTasks]);

    const openModal = (task: PersonalTask | null) => {
        setSelectedTask(task);
        setModalOpen(true);
    };

    const closeModal = () => {
        setModalOpen(false);
        setSelectedTask(null);
    };

    const handleModalSave = async (data: TaskFormPayload, id?: string) => {
        const url = id ? `${API_URL}/my-tasks/${id}` : `${API_URL}/my-tasks`;
        const method = id ? 'PATCH' : 'POST';
        const res = await fetch(url, { method, headers, body: JSON.stringify(data) });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error((err as { error?: string }).error || 'Failed to save task');
        }
        closeModal();
        await fetchTasks();
    };

    const handleStatusChange = async (taskId: string, status: string) => {
        const prevTasks = [...tasks];
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: status as PersonalTask['status'] } : t));

        try {
            const res = await fetch(`${API_URL}/my-tasks/${taskId}`, {
                method: 'PATCH', headers, body: JSON.stringify({ status }),
            });
            if (!res.ok) throw new Error('Failed to update status');
            await fetchTasks();
        } catch (err: any) {
            setTasks(prevTasks);
            setError(err.message);
        }
    };

    const handleDelete = (taskId: string) => {
        setDeleteTarget(taskId);
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        try {
            const res = await fetch(`${API_URL}/my-tasks/${deleteTarget}`, {
                method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('Failed to delete task');
            setDeleteTarget(null);
            await fetchTasks();
        } catch (err: any) {
            setError(err.message);
            setDeleteTarget(null);
        } finally {
            setIsDeleting(false);
        }
    };

    const activeTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled');
    const completedTasks = tasks.filter(t => t.status === 'done' || t.status === 'cancelled');

    return (
        <div className="space-y-6 px-4 sm:px-0">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My Tasks</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Your personal to-do list</p>
                </div>
                <div className="flex items-center gap-3">
                    <ViewToggle view={viewMode} onChange={handleViewChange} />
                    <button
                        onClick={() => openModal(null)}
                        className="px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition-colors"
                    >
                        + New Task
                    </button>
                </div>
            </div>

            {/* Error Banner */}
            {error && (
                <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl px-4 py-3 text-rose-600 dark:text-rose-400 text-sm">
                    {error}
                    <button onClick={() => setError('')} className="ml-2 font-medium underline">Dismiss</button>
                </div>
            )}

            {/* Content: List View or Board View */}
            {viewMode === 'board' ? (
                <TaskKanbanBoard
                    tasks={tasks}
                    isLoading={loading}
                    onStatusChange={handleStatusChange}
                    onOpen={openModal}
                    onDelete={handleDelete}
                />
            ) : (
                <>
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <svg className="animate-spin h-8 w-8 text-indigo-500" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                        </div>
                    ) : tasks.length === 0 ? (
                        <div className="text-center py-16">
                            <div className="mx-auto w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center mb-4">
                                <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                            </div>
                            <p className="text-lg font-medium text-slate-700 dark:text-slate-300">No tasks yet</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Create your first personal task to get started</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {activeTasks.length > 0 && (
                                <div className="space-y-2">
                                    <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Active ({activeTasks.length})</h3>
                                    {activeTasks.map(task => (
                                        <TaskCard key={task.id} task={task} onStatusChange={handleStatusChange} onOpen={openModal} onDelete={handleDelete} />
                                    ))}
                                </div>
                            )}
                            {completedTasks.length > 0 && (
                                <div className="space-y-2">
                                    <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Completed ({completedTasks.length})</h3>
                                    {completedTasks.map(task => (
                                        <TaskCard key={task.id} task={task} onStatusChange={handleStatusChange} onOpen={openModal} onDelete={handleDelete} />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}

            {/* Task Detail Modal */}
            {modalOpen && (
                <TaskDetailModal
                    task={selectedTask}
                    onClose={closeModal}
                    onSave={handleModalSave}
                    onDelete={handleDelete}
                />
            )}

            {/* Delete Confirmation Modal */}
            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-sm w-full p-6 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                                <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-base font-semibold text-slate-900 dark:text-white">Delete Task</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">This task will be permanently removed.</p>
                            </div>
                        </div>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setDeleteTarget(null)}
                                disabled={isDeleting}
                                className="px-4 py-2 text-sm font-medium rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDelete}
                                disabled={isDeleting}
                                className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                            >
                                {isDeleting ? 'Deleting...' : 'Delete Task'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function TaskCard({ task, onStatusChange, onOpen, onDelete }: {
    task: PersonalTask;
    onStatusChange: (id: string, status: string) => void;
    onOpen: (task: PersonalTask) => void;
    onDelete: (id: string) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const isLong = (task.description?.length ?? 0) > 120;
    const statusCfg = STATUS_CONFIG[task.status];
    const priorityCfg = PRIORITY_CONFIG[task.priority];
    const isDone = task.status === 'done' || task.status === 'cancelled';

    return (
        <div
            onClick={() => onOpen(task)}
            className={`glass-card p-4 transition-all cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md ${isDone ? 'opacity-60' : ''}`}
        >
            <div className="flex items-start gap-3">
                <button
                    onClick={(e) => { e.stopPropagation(); onStatusChange(task.id, task.status === 'done' ? 'pending' : 'done'); }}
                    className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 transition-colors ${task.status === 'done' ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 dark:border-slate-600 hover:border-indigo-400'}`}
                >
                    {task.status === 'done' && (
                        <svg className="w-full h-full text-white p-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                    )}
                </button>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-medium ${isDone ? 'line-through text-slate-400 dark:text-slate-600' : 'text-slate-900 dark:text-white'}`}>
                            {task.title}
                        </span>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusCfg.color}`}>
                            {statusCfg.label}
                        </span>
                        <span className={`text-[10px] font-medium ${priorityCfg.color}`}>
                            {priorityCfg.label}
                        </span>
                    </div>
                    {task.description && (
                        <div onClick={e => e.stopPropagation()}>
                            <p className={`text-xs text-slate-500 dark:text-slate-400 mt-1 ${isLong && !expanded ? 'line-clamp-3' : ''}`}>
                                {task.description}
                            </p>
                            {isLong && (
                                <button
                                    onClick={() => setExpanded(p => !p)}
                                    className="text-[10px] text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 mt-0.5 font-medium"
                                >
                                    {expanded ? 'Show less' : 'Show more'}
                                </button>
                            )}
                        </div>
                    )}
                    {task.due_date && (
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                            Due: {new Date(task.due_date).toLocaleDateString()}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={e => { e.stopPropagation(); onDelete(task.id); }} className="p-1.5 rounded text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
}

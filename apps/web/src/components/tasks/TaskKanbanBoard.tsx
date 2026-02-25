'use client';

import { useMemo } from 'react';
import { MyTaskKanbanCard } from './TaskKanbanCard';

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

interface TaskKanbanBoardProps {
    tasks: PersonalTask[];
    isLoading: boolean;
    onStatusChange: (taskId: string, newStatus: string) => void;
    onEdit: (task: PersonalTask) => void;
    onDelete: (taskId: string) => void;
}

const KANBAN_STATUSES: PersonalTask['status'][] = ['pending', 'in_progress', 'done', 'cancelled'];

const STATUS_LABELS: Record<string, string> = {
    pending: 'To Do',
    in_progress: 'In Progress',
    done: 'Done',
    cancelled: 'Cancelled',
};

const columnColors: Record<string, { badge: string; border: string }> = {
    pending: {
        badge: 'bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400',
        border: 'border-slate-300 dark:border-slate-600',
    },
    in_progress: {
        badge: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
        border: 'border-blue-300 dark:border-blue-600',
    },
    done: {
        badge: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
        border: 'border-emerald-300 dark:border-emerald-600',
    },
    cancelled: {
        badge: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400',
        border: 'border-rose-300 dark:border-rose-600',
    },
};

export function TaskKanbanBoard({ tasks, isLoading, onStatusChange, onEdit, onDelete }: TaskKanbanBoardProps) {
    // Group tasks by status. Unknown statuses fall into pending
    const grouped = useMemo(() => {
        const groups: Record<string, PersonalTask[]> = {};
        KANBAN_STATUSES.forEach((s) => (groups[s] = []));

        tasks.forEach((task) => {
            const column = KANBAN_STATUSES.includes(task.status) ? task.status : 'pending';
            groups[column].push(task);
        });

        return groups;
    }, [tasks]);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e: React.DragEvent, status: string) => {
        e.preventDefault();
        const taskId = e.dataTransfer.getData('taskId');
        if (taskId) {
            onStatusChange(taskId, status);
        }
    };

    // Loading skeleton
    if (isLoading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {KANBAN_STATUSES.map((status) => (
                    <div key={status} className="space-y-3">
                        <div className="glass-card px-4 py-2.5 rounded-xl">
                            <div className="h-5 w-24 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                        </div>
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="glass-card p-4 rounded-xl">
                                <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-2" />
                                <div className="h-3 w-1/2 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-3" />
                                <div className="flex justify-between">
                                    <div className="h-4 w-12 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                                    <div className="h-4 w-12 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                                </div>
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {KANBAN_STATUSES.map((status) => {
                const columnTasks = grouped[status] || [];
                const colors = columnColors[status] || columnColors.pending;

                return (
                    <div
                        key={status}
                        role="region"
                        aria-label={`${STATUS_LABELS[status]} tasks column`}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, status)}
                        className="flex flex-col min-h-[200px]"
                    >
                        {/* Column Header */}
                        <div className={`glass-card px-4 py-2.5 rounded-xl mb-3 flex items-center justify-between border-t-2 ${colors.border}`}>
                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                {STATUS_LABELS[status]}
                            </span>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors.badge}`}>
                                {columnTasks.length}
                            </span>
                        </div>

                        {/* Card List */}
                        <div className="space-y-3 overflow-y-auto max-h-[calc(100vh-280px)] pb-2 flex-1">
                            {columnTasks.length > 0 ? (
                                columnTasks.map((task) => (
                                    <MyTaskKanbanCard
                                        key={task.id}
                                        task={task}
                                        onStatusChange={onStatusChange}
                                        onEdit={onEdit}
                                        onDelete={onDelete}
                                    />
                                ))
                            ) : (
                                <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-6 text-center">
                                    <svg className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                                    </svg>
                                    <p className="text-sm text-slate-400 dark:text-slate-600">No tasks</p>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

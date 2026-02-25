'use client';

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

interface MyTaskKanbanCardProps {
    task: PersonalTask;
    onStatusChange: (taskId: string, newStatus: string) => void;
    onEdit: (task: PersonalTask) => void;
    onDelete: (taskId: string) => void;
}

const STATUSES: PersonalTask['status'][] = ['pending', 'in_progress', 'done', 'cancelled'];

const STATUS_LABELS: Record<string, string> = {
    pending: 'To Do',
    in_progress: 'In Progress',
    done: 'Done',
    cancelled: 'Cancelled',
};

const priorityStyles: Record<string, string> = {
    high: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400',
    medium: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    low: 'bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400',
};

function isOverdue(dueDate: string | null): boolean {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
}

export function MyTaskKanbanCard({ task, onStatusChange, onEdit, onDelete }: MyTaskKanbanCardProps) {
    const handleDragStart = (e: React.DragEvent) => {
        e.dataTransfer.setData('taskId', task.id);
        e.dataTransfer.effectAllowed = 'move';
    };

    const isDone = task.status === 'done' || task.status === 'cancelled';

    return (
        <div
            draggable
            onDragStart={handleDragStart}
            className={`glass-card p-4 rounded-xl cursor-grab active:cursor-grabbing hover:shadow-lg transition-all duration-200 group ${isDone ? 'opacity-60' : ''}`}
        >
            {/* Title Row */}
            <div className="flex items-start gap-2 justify-between">
                <span className={`font-medium text-sm ${isDone ? 'line-through text-slate-400 dark:text-slate-600' : 'text-slate-900 dark:text-white'} line-clamp-2`}>
                    {task.title}
                </span>
                {/* Action Buttons */}
                <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={() => onEdit(task)}
                        className="p-1 rounded text-slate-400 hover:text-indigo-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                    </button>
                    <button
                        onClick={() => onDelete(task.id)}
                        className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Description */}
            {task.description && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 line-clamp-2">{task.description}</p>
            )}

            {/* Bottom Row: Priority + Due Date */}
            <div className="flex items-center justify-between mt-3 gap-2">
                <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${priorityStyles[task.priority]}`}>
                        {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                    </span>
                </div>
                {task.due_date && (
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${isOverdue(task.due_date)
                            ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400'
                            : 'bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400'
                        }`}>
                        {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                )}
            </div>

            {/* Mobile Status Dropdown (hidden on md+) */}
            <select
                className="md:hidden w-full mt-3 px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-700 dark:text-slate-300 outline-none focus:ring-2 focus:ring-indigo-500/30"
                value={task.status}
                onChange={(e) => onStatusChange(task.id, e.target.value)}
            >
                {STATUSES.map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
            </select>
        </div>
    );
}

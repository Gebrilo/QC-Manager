'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { developmentPlansApi, IDPPlan, IDPObjective } from '../../../src/lib/api';

function showError(msg: string) { alert(msg); }
function showSuccess(msg: string) { console.log(msg); }

function fmtDate(v?: string | null) {
    if (!v) return '';
    return v.slice(0, 10);
}

export default function IDPBuilderPage() {
    const params = useParams();
    const userId = params.userId as string;

    const [plan, setPlan] = useState<IDPPlan | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [noplan, setNoPlan] = useState(false);

    const [newPlanTitle, setNewPlanTitle] = useState('');
    const [newPlanDesc, setNewPlanDesc] = useState('');
    const [creatingPlan, setCreatingPlan] = useState(false);

    const [showObjForm, setShowObjForm] = useState(false);
    const [newObjTitle, setNewObjTitle] = useState('');
    const [newObjStart, setNewObjStart] = useState('');
    const [newObjDue, setNewObjDue] = useState('');

    const [addingTaskFor, setAddingTaskFor] = useState<string | null>(null);
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [newTaskStart, setNewTaskStart] = useState('');
    const [newTaskDue, setNewTaskDue] = useState('');
    const [newTaskPriority, setNewTaskPriority] = useState<'low' | 'medium' | 'high'>('medium');

    const loadPlan = useCallback(async () => {
        try {
            const data = await developmentPlansApi.getForUser(userId);
            setPlan(data);
        } catch (err: any) {
            if (err?.status === 404 || err?.message?.includes('404') || err?.message?.includes('No active')) setNoPlan(true);
        } finally {
            setIsLoading(false);
        }
    }, [userId]);

    useEffect(() => { loadPlan(); }, [loadPlan]);

    async function handleCreatePlan() {
        if (!newPlanTitle.trim()) return;
        setCreatingPlan(true);
        try {
            await developmentPlansApi.create(userId, { title: newPlanTitle, description: newPlanDesc });
            setNoPlan(false);
            await loadPlan();
        } catch (err: any) { showError(err.message); }
        finally { setCreatingPlan(false); }
    }

    async function handleAddObjective() {
        if (!plan || !newObjTitle.trim()) return;
        try {
            await developmentPlansApi.addObjective(userId, { title: newObjTitle, due_date: newObjDue || undefined });
            setNewObjTitle('');
            setNewObjDue('');
            setShowObjForm(false);
            await loadPlan();
        } catch (err: any) { showError(err.message); }
    }

    async function handleDeleteObjective(chapterId: string) {
        if (!plan || !confirm('Delete this objective and all its tasks?')) return;
        try {
            await developmentPlansApi.deleteObjective(userId, chapterId);
            await loadPlan();
        } catch (err: any) { showError(err.message); }
    }

    async function handleAddTask(chapterId: string) {
        if (!plan || !newTaskTitle.trim()) return;
        try {
            await developmentPlansApi.addTask(userId, chapterId, {
                title: newTaskTitle,
                due_date: newTaskDue || undefined,
                priority: newTaskPriority,
            });
            setNewTaskTitle('');
            setNewTaskDue('');
            setNewTaskPriority('medium');
            setAddingTaskFor(null);
            await loadPlan();
        } catch (err: any) { showError(err.message); }
    }

    async function handleDeleteTask(taskId: string) {
        if (!plan || !confirm('Delete this task?')) return;
        try {
            await developmentPlansApi.deleteTask(userId, taskId);
            await loadPlan();
        } catch (err: any) { showError(err.message); }
    }

    async function handleCompletePlan() {
        if (!plan || !confirm('Mark this plan as complete? This action cannot be undone.')) return;
        try {
            await developmentPlansApi.completePlan(userId);
            showSuccess('Plan marked as complete!');
            await loadPlan();
        } catch (err: any) { showError(err.message); }
    }

    async function handleExportReport() {
        if (!plan) return;
        try {
            const report = await developmentPlansApi.getReport(userId);
            const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `idp-report-${userId}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err: any) { showError(err.message); }
    }

    const priorityColors: Record<string, string> = {
        low: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
        medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
        high: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    };

    const statusColors: Record<string, string> = {
        TODO: 'text-slate-400',
        IN_PROGRESS: 'text-indigo-500',
        DONE: 'text-emerald-500',
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
            </div>
        );
    }

    if (noplan) {
        return (
            <div className="max-w-xl mx-auto px-4 py-16">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Create Development Plan</h2>
                <p className="text-slate-500 dark:text-slate-400 mb-6">No active IDP plan exists for this user. Create one to get started.</p>
                <div className="space-y-3">
                    <input
                        className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="Plan title (e.g. Q2 2026 Development Plan)"
                        value={newPlanTitle}
                        onChange={e => setNewPlanTitle(e.target.value)}
                    />
                    <textarea
                        className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                        placeholder="Description (optional)"
                        rows={3}
                        value={newPlanDesc}
                        onChange={e => setNewPlanDesc(e.target.value)}
                    />
                    <button
                        onClick={handleCreatePlan}
                        disabled={creatingPlan || !newPlanTitle.trim()}
                        className="w-full py-2 px-4 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                        {creatingPlan ? 'Creating…' : 'Create Plan'}
                    </button>
                </div>
            </div>
        );
    }

    if (!plan) return null;

    const allMandatoryDone = plan.progress.mandatory_done >= plan.progress.mandatory_tasks && plan.progress.mandatory_tasks > 0;

    return (
        <div className="max-w-4xl mx-auto px-4 py-8">
            <div className="flex items-start justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{plan.title}</h1>
                    {plan.description && <p className="text-slate-500 dark:text-slate-400 mt-1">{plan.description}</p>}
                    <div className="flex items-center gap-3 mt-3">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{plan.progress.completion_pct}% complete</span>
                        {plan.progress.overdue_tasks > 0 && (
                            <span className="text-xs bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 px-2 py-0.5 rounded-full">
                                {plan.progress.overdue_tasks} overdue
                            </span>
                        )}
                    </div>
                    <div className="mt-2 w-64 bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                        <div className="bg-indigo-500 h-2 rounded-full transition-all" style={{ width: `${plan.progress.completion_pct}%` }} />
                    </div>
                </div>
                <div className="flex gap-2 shrink-0">
                    <button onClick={handleExportReport} className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                        Export Report
                    </button>
                    {plan.is_active && (
                        <button
                            onClick={handleCompletePlan}
                            disabled={!allMandatoryDone}
                            className="px-3 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors"
                            title={!allMandatoryDone ? 'Complete all mandatory tasks first' : ''}
                        >
                            Mark Complete
                        </button>
                    )}
                </div>
            </div>

            <div className="space-y-6">
                {plan.objectives.map((obj: IDPObjective) => (
                    <div key={obj.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                        <div className="flex items-start justify-between mb-3">
                            <div>
                                <h3 className="font-semibold text-slate-900 dark:text-white">{obj.title}</h3>
                                {obj.due_date && <p className="text-xs text-slate-400 mt-0.5">Due {fmtDate(obj.due_date)}</p>}
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-sm text-slate-500">{obj.progress.completion_pct}%</span>
                                <button onClick={() => handleDeleteObjective(obj.id)} className="text-xs text-red-400 hover:text-red-600 transition-colors">Delete</button>
                            </div>
                        </div>

                        <div className="space-y-2 mb-3">
                            {obj.tasks.map(task => (
                                <div key={task.id} className="flex items-center gap-3 py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                                    <span className={`text-xs font-mono ${statusColors[task.progress_status]}`}>{task.progress_status}</span>
                                    <span className="flex-1 text-sm text-slate-800 dark:text-slate-200">{task.title}</span>
                                    {task.priority && (
                                        <span className={`text-xs px-2 py-0.5 rounded-full ${priorityColors[task.priority]}`}>{task.priority}</span>
                                    )}
                                    {task.progress_status === 'DONE' && task.completed_at ? (
                                        <span className="text-xs text-emerald-500">Completed {fmtDate(task.completed_at)}</span>
                                    ) : (task.start_date || task.due_date) ? (
                                        <span className="text-xs text-slate-400">
                                            {task.start_date ? fmtDate(task.start_date) : ''}{task.start_date && task.due_date ? ' → ' : ''}{task.due_date ? fmtDate(task.due_date) : ''}
                                        </span>
                                    ) : null}
                                    <button onClick={() => handleDeleteTask(task.id)} className="text-xs text-red-400 hover:text-red-600 transition-colors">×</button>
                                </div>
                            ))}
                        </div>

                        {addingTaskFor === obj.id ? (
                            <div className="flex gap-2 flex-wrap mt-2">
                                <input
                                    className="flex-1 min-w-[180px] px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="Task title"
                                    value={newTaskTitle}
                                    onChange={e => setNewTaskTitle(e.target.value)}
                                />
                        <input
                            type="date"
                            className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none"
                            value={newTaskStart}
                            onChange={e => setNewTaskStart(e.target.value)}
                        />
                        <input
                            type="date"
                            className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none"
                            value={newTaskDue}
                            onChange={e => setNewTaskDue(e.target.value)}
                        />
                        <select
                                    className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none"
                                    value={newTaskPriority}
                                    onChange={e => setNewTaskPriority(e.target.value as 'low' | 'medium' | 'high')}
                                >
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                </select>
                                <button onClick={() => handleAddTask(obj.id)} className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">Add</button>
                                <button onClick={() => setAddingTaskFor(null)} className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">Cancel</button>
                            </div>
                        ) : (
                            <button onClick={() => setAddingTaskFor(obj.id)} className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                                + Add task
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {showObjForm ? (
                <div className="mt-6 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                    <h4 className="font-medium text-slate-900 dark:text-white mb-3">New Objective</h4>
                    <div className="flex gap-3 flex-wrap">
                        <input
                            className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="Objective title"
                            value={newObjTitle}
                            onChange={e => setNewObjTitle(e.target.value)}
                        />
                        <input
                            type="date"
                            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none"
                            value={newObjDue}
                            onChange={e => setNewObjDue(e.target.value)}
                        />
                        <button onClick={handleAddObjective} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium">Add</button>
                        <button onClick={() => setShowObjForm(false)} className="px-4 py-2 text-slate-500 hover:text-slate-700 text-sm transition-colors">Cancel</button>
                    </div>
                </div>
            ) : (
                <button
                    onClick={() => setShowObjForm(true)}
                    className="mt-6 w-full py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl text-slate-500 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors text-sm font-medium"
                >
                    + Add Objective
                </button>
            )}
        </div>
    );
}

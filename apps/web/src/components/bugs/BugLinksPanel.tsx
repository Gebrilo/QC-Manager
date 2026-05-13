'use client';

import { useState, useEffect, useCallback } from 'react';
import { bugLinksApi } from '@/lib/api';
import { RelationshipPicker } from '@/components/shared/RelationshipPicker';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import Link from 'next/link';

interface LinkedExecution {
    id: string;
    bug_id: string;
    test_execution_id: string;
    created_at: string;
    execution_status: string;
    execution_notes: string;
    executed_at: string;
    test_run_id: string;
    test_run_name: string;
}

interface LinkedTask {
    id: string;
    bug_id: string;
    task_id: string;
    relationship_type: string;
    created_at: string;
    task_display_id: string;
    task_name: string;
    task_status: string;
    project_id: string;
}

interface BugLinksPanelProps {
    bugId: string;
    triageStatus?: string;
}

const STATUS_VARIANT: Record<string, 'complete' | 'danger' | 'warning' | 'default' | 'info'> = {
    pass: 'complete',
    fail: 'danger',
    blocked: 'warning',
    not_run: 'default',
};

export function BugLinksPanel({ bugId, triageStatus }: BugLinksPanelProps) {
    const [executions, setExecutions] = useState<LinkedExecution[]>([]);
    const [tasks, setTasks] = useState<LinkedTask[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [execRes, taskRes] = await Promise.all([
                bugLinksApi.listTestExecutions(bugId),
                bugLinksApi.listTasks(bugId),
            ]);
            setExecutions(execRes.data);
            setTasks(taskRes.data);
        } catch (err: any) {
            setError(err.message || 'Failed to load bug links');
        } finally {
            setIsLoading(false);
        }
    }, [bugId]);

    useEffect(() => { load(); }, [load]);

    const handleAddExecution = async (item: any) => {
        try {
            await bugLinksApi.addTestExecution(bugId, item.id);
            await load();
        } catch (err: any) {
            alert(err.message || 'Failed to link execution');
        }
    };

    const handleRemoveExecution = async (executionId: string) => {
        if (!confirm('Remove this test execution link?')) return;
        try {
            await bugLinksApi.removeTestExecution(bugId, executionId);
            await load();
        } catch (err: any) {
            alert(err.message || 'Failed to remove link');
        }
    };

    const handleAddTask = async (item: any) => {
        try {
            await bugLinksApi.addTask(bugId, item.id);
            await load();
        } catch (err: any) {
            alert(err.message || 'Failed to link task');
        }
    };

    const handleRemoveTask = async (taskId: string) => {
        if (!confirm('Remove this task link?')) return;
        try {
            await bugLinksApi.removeTask(bugId, taskId);
            await load();
        } catch (err: any) {
            alert(err.message || 'Failed to remove link');
        }
    };

    const excludeExecIds = executions.map(e => e.test_execution_id);
    const excludeTaskIds = tasks.map(t => t.task_id);

    return (
        <div className="space-y-6">
            {triageStatus === 'untriaged' && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16.5c-.77 1.333.192 2.5 1.732 2.5z" />
                    </svg>
                    <span className="text-sm font-medium text-amber-800 dark:text-amber-300">Untriaged — link this bug to a test execution or task to mark it as triaged.</span>
                </div>
            )}

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-sm uppercase tracking-wider text-slate-400">Linked Test Executions</CardTitle>
                    <span className="text-xs text-slate-500">{executions.length} linked</span>
                </CardHeader>
                <CardContent className="space-y-3">
                    <RelationshipPicker
                        searchType="test_case"
                        searchPlaceholder="Search test cases for execution evidence..."
                        onAdd={handleAddExecution}
                        excludeIds={excludeExecIds}
                        label="Add test execution link"
                    />

                    {error && <p className="text-sm text-rose-600">{error}</p>}

                    {isLoading && executions.length === 0 ? (
                        <p className="text-sm text-slate-500 italic">Loading...</p>
                    ) : executions.length === 0 ? (
                        <p className="text-sm text-slate-500 italic">No test executions linked.</p>
                    ) : (
                        <div className="space-y-2">
                            {executions.map(exec => (
                                <div
                                    key={exec.id}
                                    className="flex items-center justify-between p-2 rounded-lg border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 group"
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                                            {exec.test_run_name || 'Test Run'}
                                        </p>
                                        <span className="text-xs text-slate-500">
                                            {exec.executed_at ? new Date(exec.executed_at).toLocaleDateString() : ''}
                                            {exec.execution_notes ? ` — ${exec.execution_notes.substring(0, 80)}` : ''}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 ml-2">
                                        <Badge variant={STATUS_VARIANT[exec.execution_status] || 'default'}>
                                            {exec.execution_status}
                                        </Badge>
                                        <button
                                            onClick={() => handleRemoveExecution(exec.test_execution_id)}
                                            className="opacity-0 group-hover:opacity-100 text-rose-500 hover:text-rose-700 text-xs font-medium transition-opacity"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-sm uppercase tracking-wider text-slate-400">Linked Tasks</CardTitle>
                    <span className="text-xs text-slate-500">{tasks.length} linked</span>
                </CardHeader>
                <CardContent className="space-y-3">
                    <RelationshipPicker
                        searchType="task"
                        searchPlaceholder="Search tasks to link..."
                        onAdd={handleAddTask}
                        excludeIds={excludeTaskIds}
                        label="Add task link"
                    />

                    {tasks.length === 0 ? (
                        <p className="text-sm text-slate-500 italic">No tasks linked.</p>
                    ) : (
                        <div className="space-y-2">
                            {tasks.map(task => (
                                <div
                                    key={task.id}
                                    className="flex items-center justify-between p-2 rounded-lg border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 group"
                                >
                                    <div className="min-w-0 flex-1">
                                        <Link
                                            href={`/tasks/${task.task_id}`}
                                            className="text-sm font-medium text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 truncate block"
                                        >
                                            {task.task_name}
                                        </Link>
                                        <span className="text-xs text-slate-500">{task.task_display_id} • {task.relationship_type}</span>
                                    </div>
                                    <div className="flex items-center gap-2 ml-2">
                                        <Badge variant={STATUS_VARIANT[task.task_status] || 'default'}>
                                            {task.task_status}
                                        </Badge>
                                        <button
                                            onClick={() => handleRemoveTask(task.task_id)}
                                            className="opacity-0 group-hover:opacity-100 text-rose-500 hover:text-rose-700 text-xs font-medium transition-opacity"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
'use client';

import { useState, useEffect, useCallback } from 'react';
import { taskTestCaseLinksApi } from '@/lib/api';
import { RelationshipPicker } from '@/components/shared/RelationshipPicker';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import Link from 'next/link';

interface LinkedTask {
    id: string;
    task_id: string;
    test_case_id: string;
    relationship_type: string;
    created_at: string;
    task_display_id: string;
    task_name: string;
    task_status: string;
    project_id: string;
}

interface LinkedTasksPanelProps {
    testCaseId: string;
}

const TASK_STATUS_VARIANT: Record<string, 'complete' | 'inprogress' | 'notasks' | 'default'> = {
    'Done': 'complete',
    'In Progress': 'inprogress',
    'Todo': 'notasks',
    'Blocked': 'default',
    'Canceled': 'default',
    'Cancelled': 'default',
};

export function LinkedTasksPanel({ testCaseId }: LinkedTasksPanelProps) {
    const [links, setLinks] = useState<LinkedTask[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await taskTestCaseLinksApi.listTasks(testCaseId);
            setLinks(res.data);
        } catch (err: any) {
            setError(err.message || 'Failed to load linked tasks');
        } finally {
            setIsLoading(false);
        }
    }, [testCaseId]);

    useEffect(() => { load(); }, [load]);

    const handleAdd = async (item: any) => {
        try {
            await taskTestCaseLinksApi.addTask(testCaseId, item.id);
            await load();
        } catch (err: any) {
            alert(err.message || 'Failed to add link');
        }
    };

    const handleRemove = async (taskId: string) => {
        if (!confirm('Remove this task link?')) return;
        try {
            await taskTestCaseLinksApi.removeTask(testCaseId, taskId);
            await load();
        } catch (err: any) {
            alert(err.message || 'Failed to remove link');
        }
    };

    const excludeIds = links.map(l => l.task_id);

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm uppercase tracking-wider text-slate-400">Linked Tasks</CardTitle>
                <span className="text-xs text-slate-500">{links.length} linked</span>
            </CardHeader>
            <CardContent className="space-y-3">
                <RelationshipPicker
                    searchType="task"
                    searchPlaceholder="Search tasks to link..."
                    onAdd={handleAdd}
                    excludeIds={excludeIds}
                />

                {error && <p className="text-sm text-rose-600">{error}</p>}

                {isLoading && links.length === 0 ? (
                    <p className="text-sm text-slate-500 italic">Loading...</p>
                ) : links.length === 0 ? (
                    <p className="text-sm text-slate-500 italic">No tasks linked yet.</p>
                ) : (
                    <div className="space-y-2">
                        {links.map(link => (
                            <div
                                key={link.id}
                                className="flex items-center justify-between p-2 rounded-lg border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 group"
                            >
                                <div className="min-w-0 flex-1">
                                    <Link
                                        href={`/work/tasks/${link.task_id}`}
                                        className="text-sm font-medium text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 truncate block"
                                    >
                                        {link.task_name}
                                    </Link>
                                    <span className="text-xs text-slate-500">{link.task_display_id}</span>
                                </div>
                                <div className="flex items-center gap-2 ml-2">
                                    <Badge variant={TASK_STATUS_VARIANT[link.task_status] || 'default'}>
                                        {link.task_status}
                                    </Badge>
                                    <button
                                        onClick={() => handleRemove(link.task_id)}
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
    );
}
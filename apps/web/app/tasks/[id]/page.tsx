'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/api';
import { Task } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Spinner } from '@/components/ui/Spinner';
import Link from 'next/link';

export default function TaskDetailPage() {
    const params = useParams();
    const id = (params?.id as string) || '';
    const router = useRouter();
    const [task, setTask] = useState<Task | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function load() {
            try {
                const data = await fetchApi<Task>(`/tasks/${id}`);
                setTask(data);
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        }
        if (id) load();
    }, [id]);

    const getStatusVariant = (status: string | undefined) => {
        switch (status) {
            case 'Done': return 'complete';
            case 'In Progress': return 'ontrack'; // using ontrack color (blue) for in progress
            case 'Backlog': return 'notasks';
            case 'Cancelled': return 'atrisk'; // or generic error
            default: return 'default';
        }
    };

    if (isLoading) return <div className="p-10 text-center"><Spinner size="lg" /></div>;
    if (!task) return <div className="p-10 text-center">Task not found</div>;

    const variant = getStatusVariant(task.status);

    return (
        <div className="max-w-4xl mx-auto py-8 px-4 space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" onClick={() => router.back()}>
                        ← Back
                    </Button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{task.task_name}</h1>
                            <Badge variant={variant === 'complete' ? 'complete' : variant === 'ontrack' ? 'inprogress' : 'default'}>
                                {task.status}
                            </Badge>
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{task.task_id} • {task.project_name || 'No Project'}</p>
                    </div>
                </div>
                <Link href={`/tasks/${task.id}/edit`}>
                    <Button variant="outline">Edit Task</Button>
                </Link>
            </div>

            {/* Content Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Main Info */}
                <div className="md:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm uppercase tracking-wider text-slate-400">Description</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                                {task.description || 'No description provided.'}
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm uppercase tracking-wider text-slate-400">Work & Time</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 gap-6">
                                <DetailItem label="Estimated Hours" value={task.total_est_hrs?.toFixed(1) || '0.0'} />
                                <DetailItem label="Actual Hours" value={task.total_actual_hrs?.toFixed(1) || '0.0'} />
                                <DetailItem label="Progress" value={`${task.overall_completion_pct || 0}%`} />
                                {/* Visual Progress */}
                                <div className="col-span-2 mt-2">
                                    <ProgressBar value={task.overall_completion_pct || 0} variant={variant === 'complete' ? 'complete' : 'ontrack'} />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm uppercase tracking-wider text-slate-400">Notes</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-slate-700 dark:text-slate-300 italic">
                                {task.notes || 'No notes added.'}
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Sidebar Info */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm uppercase tracking-wider text-slate-400">Resources</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-700 dark:text-indigo-400 font-bold text-xs">R1</div>
                                    <div>
                                        <p className="text-sm font-medium text-slate-900 dark:text-white">{task.resource1_name || 'Unassigned'}</p>
                                        <p className="text-xs text-slate-500">Primary Resource</p>
                                    </div>
                                </div>
                                {task.resource2_name && (
                                    <div className="flex items-center gap-3 border-t border-slate-100 dark:border-slate-800 pt-3">
                                        <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center text-violet-700 dark:text-violet-400 font-bold text-xs">R2</div>
                                        <div>
                                            <p className="text-sm font-medium text-slate-900 dark:text-white">{task.resource2_name}</p>
                                            <p className="text-xs text-slate-500">Secondary Resource</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm uppercase tracking-wider text-slate-400">Dates</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <DetailItem label="Deadline" value={task.deadline ? new Date(task.deadline).toLocaleDateString() : '-'} />
                                <DetailItem label="Completed Date" value={task.completed_date ? new Date(task.completed_date).toLocaleDateString() : '-'} />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

function DetailItem({ label, value }: { label: string, value: string | number }) {
    return (
        <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">{label}</span>
            <span className="text-sm font-semibold text-slate-900 dark:text-white">{value}</span>
        </div>
    );
}

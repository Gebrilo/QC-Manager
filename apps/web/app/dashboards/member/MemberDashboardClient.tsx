'use client';

import { useEffect, useState } from 'react';
import { Clock, Share2 } from 'lucide-react';
import { memberDashboardApi, type DashboardTask, type MemberDashboard } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/components/providers/AuthProvider';

function statusVariant(status: string) {
    if (status === 'Done' || status === 'Closed') return 'success';
    if (status === 'Blocked') return 'danger';
    if (status === 'In Progress' || status === 'Open') return 'warning';
    return 'secondary';
}

function Stat({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
            <div className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">{value}</div>
        </div>
    );
}

function TaskTable({ tasks }: { tasks: DashboardTask[] }) {
    if (tasks.length === 0) {
        return <div className="p-4 text-sm text-slate-500">No tasks.</div>;
    }

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full text-left">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-950">
                    <tr>
                        <th className="px-3 py-2">Task</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Project</th>
                        <th className="px-3 py-2">Due</th>
                        <th className="px-3 py-2">Hours</th>
                    </tr>
                </thead>
                <tbody>
                    {tasks.map(task => (
                        <tr key={task.id} className="border-t border-slate-200 dark:border-slate-800">
                            <td className="px-3 py-2">
                                <div className="font-medium text-slate-900 dark:text-white">{task.task_name}</div>
                                <div className="text-xs text-slate-500">{task.task_id || 'Task'}</div>
                            </td>
                            <td className="px-3 py-2"><Badge variant={statusVariant(task.status) as any}>{task.status}</Badge></td>
                            <td className="px-3 py-2 text-sm text-slate-600 dark:text-slate-300">{task.project_name || 'Unassigned'}</td>
                            <td className="px-3 py-2 text-sm text-slate-600 dark:text-slate-300">{task.deadline ? new Date(task.deadline).toLocaleDateString() : 'No date'}</td>
                            <td className="px-3 py-2 text-sm text-slate-600 dark:text-slate-300">{task.total_actual_hrs}/{task.total_est_hrs}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default function MemberDashboardClient() {
    const [data, setData] = useState<MemberDashboard | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { hasPermission } = useAuth();
    const showBugs = hasPermission('qc.bugs.view_own');

    useEffect(() => {
        memberDashboardApi.get()
            .then(setData)
            .catch((err: any) => setError(err?.message || 'Failed to load member dashboard'));
    }, []);

    if (error) return <div className="p-6 text-red-600">{error}</div>;
    if (!data) return <div className="p-6 text-slate-600">Loading...</div>;

    return (
        <div className="space-y-6 p-6">
            <header>
                <h1 className="text-2xl font-semibold text-slate-950 dark:text-white">Member Dashboard</h1>
                <p className="text-sm text-slate-500">Assigned work, due items, shared artifacts, and related stories.</p>
            </header>

            <section className="grid gap-3 md:grid-cols-4">
                <Stat label="My tasks" value={data.my_tasks.length} />
                <Stat label="Due this week" value={data.due_this_week.length} />
                <Stat label="Logged this week" value={`${data.logged_time_this_week}h`} />
                <Stat label="Shared with me" value={data.shared_with_me.length} />
            </section>

            <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-200 p-4 dark:border-slate-800">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white">My Tasks</h2>
                </div>
                <TaskTable tasks={data.my_tasks} />
            </section>

            {showBugs && (
                <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                    <div className="border-b border-slate-200 p-4 dark:border-slate-800">
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">My Bugs</h2>
                    </div>
                    {data.my_bugs.length === 0 ? (
                        <div className="p-4 text-sm text-slate-500">No assigned bugs.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-left">
                                <tbody>
                                    {data.my_bugs.map(bug => (
                                        <tr key={bug.id} className="border-t border-slate-200 dark:border-slate-800">
                                            <td className="px-3 py-2">
                                                <div className="font-medium text-slate-900 dark:text-white">{bug.title}</div>
                                                <div className="text-xs text-slate-500">{bug.bug_id || bug.project_name || 'Bug'}</div>
                                            </td>
                                            <td className="px-3 py-2"><Badge variant={statusVariant(bug.status) as any}>{bug.status}</Badge></td>
                                            <td className="px-3 py-2 text-sm text-slate-600 dark:text-slate-300">{bug.severity || 'Unrated'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            )}

            <section className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                        <Clock className="h-4 w-4 text-slate-500" /> Due This Week
                    </div>
                    <ul className="space-y-2 text-sm">
                        {data.due_this_week.map(task => <li key={task.id} className="text-slate-700 dark:text-slate-200">{task.task_name}</li>)}
                        {data.due_this_week.length === 0 && <li className="text-slate-500">No due items.</li>}
                    </ul>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Related User Stories</h2>
                    <ul className="space-y-2 text-sm">
                        {data.related_user_stories.map(story => <li key={story.id} className="text-slate-700 dark:text-slate-200">{story.title}</li>)}
                        {data.related_user_stories.length === 0 && <li className="text-slate-500">No related stories.</li>}
                    </ul>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                        <Share2 className="h-4 w-4 text-slate-500" /> Shared With Me
                    </div>
                    <ul className="space-y-2 text-sm">
                        {data.shared_with_me.map(item => (
                            <li key={`${item.artifact_type}-${item.artifact_id}`} className="text-slate-700 dark:text-slate-200">
                                <span className="font-medium">{item.title}</span>
                                <span className="ml-2 text-xs text-slate-500">{item.artifact_type} · {item.action}</span>
                            </li>
                        ))}
                        {data.shared_with_me.length === 0 && <li className="text-slate-500">No shared artifacts.</li>}
                    </ul>
                </div>
            </section>
        </div>
    );
}

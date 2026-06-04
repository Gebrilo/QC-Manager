'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, RotateCcw, UserPlus } from 'lucide-react';
import {
    teamManagerDashboardApi,
    tasksApi,
    type DashboardTask,
    type TeamManagerDashboard,
} from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

function Stat({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
            <div className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">{value}</div>
        </div>
    );
}

function statusVariant(status: string) {
    if (status === 'Done') return 'success';
    if (status === 'Blocked') return 'danger';
    if (status === 'In Progress') return 'warning';
    return 'secondary';
}

function TaskRow({
    task,
    members,
    onReassign,
}: {
    task: DashboardTask;
    members: TeamManagerDashboard['members'];
    onReassign: (taskId: string, resourceId: string) => Promise<void>;
}) {
    const [resourceId, setResourceId] = useState('');
    const [saving, setSaving] = useState(false);
    const canTakeOver = task._can?.take_over === true;

    return (
        <tr className="border-t border-slate-200 dark:border-slate-800">
            <td className="px-3 py-2">
                <div className="font-medium text-slate-900 dark:text-white">{task.task_name}</div>
                <div className="text-xs text-slate-500">{task.task_id || task.project_name || 'Task'}</div>
            </td>
            <td className="px-3 py-2"><Badge variant={statusVariant(task.status) as any}>{task.status}</Badge></td>
            <td className="px-3 py-2 text-sm text-slate-600 dark:text-slate-300">{task.deadline ? new Date(task.deadline).toLocaleDateString() : 'No date'}</td>
            <td className="px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
                {[task.resource1_name, task.resource2_name].filter(Boolean).join(', ') || 'Unassigned'}
            </td>
            <td className="px-3 py-2">
                {canTakeOver ? (
                    <div className="flex items-center gap-2">
                        <select
                            value={resourceId}
                            onChange={event => setResourceId(event.target.value)}
                            className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                            aria-label={`Assign ${task.task_name}`}
                        >
                            <option value="">Assign</option>
                            {members.filter(member => member.resource_id).map(member => (
                                <option key={member.resource_id} value={member.resource_id || ''}>{member.name}</option>
                            ))}
                        </select>
                        <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            title="Reassign task"
                            disabled={!resourceId || saving}
                            onClick={async () => {
                                setSaving(true);
                                try {
                                    await onReassign(task.id, resourceId);
                                    setResourceId('');
                                } finally {
                                    setSaving(false);
                                }
                            }}
                        >
                            <UserPlus className="h-4 w-4" />
                        </Button>
                    </div>
                ) : (
                    <span className="text-xs text-slate-400">Restricted</span>
                )}
            </td>
        </tr>
    );
}

export default function TeamManagerDashboardClient() {
    const [data, setData] = useState<TeamManagerDashboard | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = async () => {
        setError(null);
        try {
            setData(await teamManagerDashboardApi.get());
        } catch (err: any) {
            setError(err?.message || 'Failed to load team dashboard');
        }
    };

    useEffect(() => { load(); }, []);

    const groupedTasks = useMemo(() => {
        const groups = new Map<string, { label: string; tasks: DashboardTask[] }>();
        for (const task of data?.team_tasks.items || []) {
            const assignments = [
                { id: task.resource1_id || 'unassigned', label: task.resource1_name || 'Unassigned' },
                task.resource2_id ? { id: task.resource2_id, label: task.resource2_name || 'Secondary' } : null,
            ].filter(Boolean) as Array<{ id: string; label: string }>;
            for (const assignment of assignments) {
                if (!groups.has(assignment.id)) groups.set(assignment.id, { label: assignment.label, tasks: [] });
                groups.get(assignment.id)?.tasks.push(task);
            }
        }
        return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label));
    }, [data]);

    async function reassign(taskId: string, resourceId: string) {
        await tasksApi.update(taskId, { resource1_uuid: resourceId } as any);
        await load();
    }

    if (error) return <div className="p-6 text-red-600">{error}</div>;
    if (!data) return <div className="p-6 text-slate-600">Loading...</div>;

    const maxWorkload = Math.max(1, ...data.members.map(member => Math.max(member.workload_hrs, member.capacity_hrs)));

    return (
        <div className="space-y-6 p-6">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-950 dark:text-white">Team Manager Dashboard</h1>
                    <p className="text-sm text-slate-500">{data.team_name || 'Team'} · {data.team_type || 'team'}</p>
                </div>
                <a href={data.reports_link} className="text-sm font-medium text-indigo-600 dark:text-indigo-400">Reports</a>
            </header>

            <section className="grid gap-3 md:grid-cols-4">
                <Stat label="Team tasks" value={data.team_tasks.total} />
                <Stat label="Blocked" value={data.blocked_items.length} />
                <Stat label="Overdue" value={data.overdue_items.length} />
                <Stat label="Team bugs" value={data.team_bugs ? data.team_bugs.total : 'N/A'} />
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-4 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-slate-500" />
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Member Workload</h2>
                </div>
                <div className="space-y-3">
                    {data.members.map(member => (
                        <div key={member.user_id} className="grid gap-2 md:grid-cols-[180px_1fr_160px] md:items-center">
                            <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{member.name}</div>
                            <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                <div
                                    className="h-full rounded-full bg-indigo-500"
                                    style={{ width: `${Math.min(100, (member.workload_hrs / maxWorkload) * 100)}%` }}
                                />
                            </div>
                            <div className="text-xs text-slate-500">
                                {member.workload_hrs}h planned · {member.logged_hrs}h logged · {member.capacity_hrs}h cap
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {(data.blocked_items.length > 0 || data.overdue_items.length > 0) && (
                <section className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/60 dark:bg-rose-950/30">
                        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-rose-700 dark:text-rose-300">
                            <AlertTriangle className="h-4 w-4" /> Blocked
                        </div>
                        <ul className="space-y-1 text-sm text-rose-900 dark:text-rose-100">
                            {data.blocked_items.map(task => <li key={task.id}>{task.task_name}</li>)}
                        </ul>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
                        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
                            <RotateCcw className="h-4 w-4" /> Overdue
                        </div>
                        <ul className="space-y-1 text-sm text-amber-900 dark:text-amber-100">
                            {data.overdue_items.map(task => <li key={task.id}>{task.task_name}</li>)}
                        </ul>
                    </div>
                </section>
            )}

            {data.team_bugs && (
                <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Team Bugs</h2>
                    <div className="flex flex-wrap gap-2">
                        {Object.entries(data.team_bugs.by_status).map(([status, count]) => (
                            <Badge key={status} variant={statusVariant(status) as any}>{status}: {count}</Badge>
                        ))}
                    </div>
                </section>
            )}

            <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-200 p-4 dark:border-slate-800">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Team Tasks</h2>
                </div>
                {groupedTasks.map(group => (
                    <div key={group.label} className="border-b border-slate-200 last:border-b-0 dark:border-slate-800">
                        <div className="bg-slate-50 px-4 py-2 text-xs font-semibold uppercase text-slate-500 dark:bg-slate-950">{group.label}</div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-left">
                                <tbody>
                                    {group.tasks.map(task => (
                                        <TaskRow key={`${group.label}-${task.id}`} task={task} members={data.members} onReassign={reassign} />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ))}
            </section>
        </div>
    );
}

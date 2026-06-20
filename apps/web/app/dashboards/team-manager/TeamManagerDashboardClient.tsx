'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, MoreHorizontal, Search, UserPlus } from 'lucide-react';
import {
    teamManagerDashboardApi,
    tasksApi,
    type DashboardTask,
    type TaskAssignment,
    type TeamManagerDashboard,
} from '@/lib/api';
import { Badge } from '@/components/ui/Badge';

type Member = TeamManagerDashboard['members'][number];

/* ------------------------------ Helpers ------------------------------ */

// Gradient avatar palette — a person keeps the same colour everywhere on the page.
const TONES = [
    'from-indigo-500 to-violet-600',
    'from-sky-500 to-blue-600',
    'from-teal-500 to-emerald-600',
    'from-fuchsia-500 to-pink-600',
    'from-amber-500 to-orange-600',
    'from-rose-500 to-pink-600',
    'from-cyan-500 to-sky-600',
    'from-violet-500 to-purple-600',
];

function toneFor(key: string) {
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    return TONES[hash % TONES.length];
}

function initialsFor(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}

type CapState = {
    key: 'ok' | 'high' | 'over';
    bar: string;
    pill: string;
    label: string;
};

function capState(planned: number, cap: number): CapState {
    const ratio = cap > 0 ? planned / cap : planned > 0 ? Infinity : 0;
    if (ratio <= 1) {
        return { key: 'ok', bar: 'bg-emerald-500', pill: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', label: 'Healthy' };
    }
    if (ratio <= 1.5) {
        return { key: 'high', bar: 'bg-amber-500', pill: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', label: 'High load' };
    }
    return { key: 'over', bar: 'bg-rose-500', pill: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300', label: 'Over capacity' };
}

function statusBadgeVariant(status: string): 'complete' | 'inprogress' | 'danger' | 'default' {
    if (status === 'Done') return 'complete';
    if (status === 'In Progress') return 'inprogress';
    if (status === 'Blocked') return 'danger';
    return 'default';
}

function formatDue(deadline?: string | null) {
    if (!deadline) return null;
    const date = new Date(deadline);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: '2-digit' });
}

function taskAssignments(task: DashboardTask): TaskAssignment[] {
    return task.assignments?.length ? task.assignments : [];
}

function firstName(name: string) {
    return name.trim().split(/\s+/)[0] || name;
}

/* ------------------------------ Atoms ------------------------------ */

function Avatar({ name, toneKey, size = 24, ring = true }: { name: string; toneKey: string; size?: number; ring?: boolean }) {
    return (
        <div
            title={name}
            className={
                'rounded-full bg-gradient-to-br ' + toneFor(toneKey) +
                ' flex items-center justify-center text-white font-semibold flex-shrink-0' +
                (ring ? ' ring-2 ring-white dark:ring-slate-900' : '')
            }
            style={{ width: size, height: size, fontSize: size * 0.42 }}
        >
            {initialsFor(name)}
        </div>
    );
}

function AssigneeStack({ assignments }: { assignments: TaskAssignment[] }) {
    if (assignments.length === 0) {
        return <span className="text-xs italic text-slate-400 dark:text-slate-500">Unassigned</span>;
    }
    const first = assignments[0].resource_name || 'Unassigned';
    return (
        <div className="flex min-w-0 items-center gap-2">
            <div className="flex items-center">
                {assignments.map((a, i) => (
                    <div key={`${a.resource_id || 'x'}-${i}`} style={{ marginLeft: i === 0 ? 0 : -8, zIndex: assignments.length - i }}>
                        <Avatar name={a.resource_name || 'Unassigned'} toneKey={a.resource_id || a.resource_name || String(i)} size={24} />
                    </div>
                ))}
            </div>
            <span className="truncate text-[13px] text-slate-600 dark:text-slate-300">
                {first}{assignments.length > 1 ? ` +${assignments.length - 1}` : ''}
            </span>
        </div>
    );
}

function StatTile({ label, value, accent, sub, alert }: { label: string; value: string | number; accent?: string; sub?: string; alert?: boolean }) {
    return (
        <div className="glass-card flex flex-col gap-1.5 rounded-xl px-4 py-3.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
            <div className="flex items-baseline gap-2">
                <span className={'text-2xl font-bold leading-none tabular-nums ' + (accent || 'text-slate-900 dark:text-white')}>{value}</span>
                {alert && <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />}
            </div>
            {sub && <span className="text-[11px] text-slate-500 dark:text-slate-400">{sub}</span>}
        </div>
    );
}

/* --------------------------- Member workload --------------------------- */

function WorkloadRow({ member, scale }: { member: Member; scale: number }) {
    const planned = member.workload_hrs;
    const cap = member.capacity_hrs;
    const logged = member.logged_hrs;
    const st = capState(planned, cap);
    const within = Math.min(planned, cap);
    const over = Math.max(planned - cap, 0);
    const capPct = (cap / scale) * 100;
    const util = cap > 0 ? Math.round((planned / cap) * 100) : 0;

    return (
        <div className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
            {/* identity */}
            <div className="flex flex-shrink-0 items-center gap-2.5" style={{ width: 184 }}>
                <Avatar name={member.name} toneKey={member.resource_id || member.user_id} size={30} ring={false} />
                <span className="truncate text-[13px] font-medium text-slate-800 dark:text-slate-100">{member.name}</span>
            </div>

            {/* capacity bar */}
            <div className="min-w-0 flex-1">
                <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                        className={'absolute inset-y-0 left-0 ' + (st.key === 'ok' ? st.bar : 'bg-indigo-500/80')}
                        style={{ width: `${(within / scale) * 100}%` }}
                    />
                    {over > 0 && (
                        <div className={'absolute inset-y-0 ' + st.bar} style={{ left: `${capPct}%`, width: `${(over / scale) * 100}%` }} />
                    )}
                </div>
                {/* cap marker */}
                <div className="relative" style={{ height: 0 }}>
                    <div className="absolute -top-[14px] h-[14px] w-px bg-slate-400/70 dark:bg-slate-500/70" style={{ left: `${capPct}%` }} />
                    <div className="absolute top-0.5 text-[9px] font-medium text-slate-400" style={{ left: `${capPct}%`, transform: 'translateX(-50%)' }}>
                        {cap}h cap
                    </div>
                </div>
            </div>

            {/* numbers */}
            <div className="flex flex-shrink-0 items-center justify-end gap-5" style={{ width: 300 }}>
                <div className="text-right leading-tight">
                    <div className="text-[13px] font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                        {planned}h <span className="font-normal text-slate-400">planned</span>
                    </div>
                    <div className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{logged}h logged</div>
                </div>
                <div
                    className={'flex flex-shrink-0 items-center gap-1.5 rounded-full py-1 pl-2 pr-2.5 text-[11px] font-bold tabular-nums ' + st.pill}
                    title={st.label}
                >
                    <span className={'h-1.5 w-1.5 rounded-full ' + st.bar} />{util}%
                </div>
            </div>
        </div>
    );
}

function WorkloadCard({ members }: { members: Member[] }) {
    const over = members.filter(m => m.workload_hrs > m.capacity_hrs).length;
    const scale = useMemo(() => {
        const peak = Math.max(0, ...members.map(m => Math.max(m.workload_hrs, m.capacity_hrs)));
        return Math.max(1, peak * 1.05);
    }, [members]);

    return (
        <div className="glass-card overflow-hidden rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
                <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-slate-400" />
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Member Workload</h2>
                </div>
                {over > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                        <AlertTriangle className="h-3 w-3" />
                        {over} over capacity
                    </span>
                )}
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {members.length === 0 ? (
                    <div className="py-10 text-center text-sm text-slate-400">No team members.</div>
                ) : (
                    members.map(member => <WorkloadRow key={member.user_id} member={member} scale={scale} />)
                )}
            </div>
        </div>
    );
}

/* ------------------------------ Team tasks ------------------------------ */

const FILTERS = ['All', 'To Do', 'In Progress', 'Done', 'Unassigned'] as const;
type Filter = (typeof FILTERS)[number];

function FilterChip({ active, children, onClick, count }: { active: boolean; children: React.ReactNode; onClick: () => void; count: number }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={
                'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors ' +
                (active
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/30'
                    : 'border border-slate-200/60 bg-white/60 text-slate-600 hover:bg-slate-50 dark:border-slate-700/50 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-slate-800')
            }
        >
            {children}
            <span className={'text-[11px] font-semibold tabular-nums ' + (active ? 'text-indigo-100' : 'text-slate-400')}>{count}</span>
        </button>
    );
}

function AssignControl({
    task,
    members,
    onAssign,
}: {
    task: DashboardTask;
    members: Member[];
    onAssign: (taskId: string, resourceId: string) => Promise<void>;
}) {
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const unassigned = taskAssignments(task).length === 0;
    const assignable = members.filter(m => m.resource_id);

    async function pick(resourceId: string) {
        setSaving(true);
        try {
            await onAssign(task.id, resourceId);
            setOpen(false);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="relative inline-block text-left">
            {unassigned ? (
                <button
                    type="button"
                    onClick={() => setOpen(o => !o)}
                    disabled={saving}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-3 text-[12px] font-medium text-white shadow-sm shadow-indigo-500/30 transition-all hover:from-indigo-700 hover:to-violet-700 active:scale-95 disabled:opacity-50"
                >
                    <UserPlus className="h-3.5 w-3.5" />
                    Assign
                </button>
            ) : (
                <button
                    type="button"
                    onClick={() => setOpen(o => !o)}
                    disabled={saving}
                    title="Reassign"
                    className="rounded-md p-1.5 text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                    <MoreHorizontal className="h-4 w-4" />
                </button>
            )}

            {open && (
                <>
                    <button type="button" aria-hidden className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} tabIndex={-1} />
                    <div className="absolute right-0 z-20 mt-1 max-h-64 w-52 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                        <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {unassigned ? 'Assign to' : 'Reassign to'}
                        </div>
                        {assignable.length === 0 ? (
                            <div className="px-2 py-2 text-xs text-slate-400">No assignable members.</div>
                        ) : (
                            assignable.map(member => (
                                <button
                                    key={member.user_id}
                                    type="button"
                                    disabled={saving}
                                    onClick={() => pick(member.resource_id as string)}
                                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-700/60"
                                >
                                    <Avatar name={member.name} toneKey={member.resource_id || member.user_id} size={22} ring={false} />
                                    <span className="truncate">{member.name}</span>
                                </button>
                            ))
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function TaskRow({
    task,
    members,
    onAssign,
}: {
    task: DashboardTask;
    members: Member[];
    onAssign: (taskId: string, resourceId: string) => Promise<void>;
}) {
    const assignments = taskAssignments(task);
    const due = formatDue(task.deadline);
    const canTakeOver = task._can?.take_over === true;

    return (
        <tr className="group transition-colors hover:bg-violet-50/40 dark:hover:bg-violet-900/10">
            <td className="py-3 pl-5 pr-3">
                <div className="flex min-w-0 items-baseline gap-3">
                    <span className="flex-shrink-0 pt-0.5 font-mono text-[11px] font-semibold text-violet-600 dark:text-violet-300">
                        {task.task_id || task.project_name || 'Task'}
                    </span>
                    <span className="truncate text-[13px] font-medium text-slate-800 dark:text-slate-100" dir="auto" title={task.task_name}>
                        {task.task_name}
                    </span>
                </div>
            </td>
            <td className="px-3 py-3">
                <Badge variant={statusBadgeVariant(task.status)} className="!px-2.5 !py-0.5 !text-[10px]">{task.status}</Badge>
            </td>
            <td className="whitespace-nowrap px-3 py-3">
                {due
                    ? <span className="text-[13px] tabular-nums text-slate-600 dark:text-slate-300">{due}</span>
                    : <span className="text-[13px] text-slate-400 dark:text-slate-500">—</span>}
            </td>
            <td className="max-w-[260px] px-3 py-3">
                <AssigneeStack assignments={assignments} />
            </td>
            <td className="py-3 pl-3 pr-5 text-right">
                {canTakeOver
                    ? <AssignControl task={task} members={members} onAssign={onAssign} />
                    : <span className="text-[11px] text-slate-400">—</span>}
            </td>
        </tr>
    );
}

const STATUS_ORDER: Record<string, number> = { 'In Progress': 0, 'To Do': 1, Blocked: 2, Done: 3 };

function TeamTasksCard({
    tasks,
    members,
    onAssign,
}: {
    tasks: DashboardTask[];
    members: Member[];
    onAssign: (taskId: string, resourceId: string) => Promise<void>;
}) {
    const [filter, setFilter] = useState<Filter>('All');
    const [query, setQuery] = useState('');

    const counts = useMemo<Record<Filter, number>>(() => ({
        All: tasks.length,
        'To Do': tasks.filter(t => t.status === 'To Do').length,
        'In Progress': tasks.filter(t => t.status === 'In Progress').length,
        Done: tasks.filter(t => t.status === 'Done').length,
        Unassigned: tasks.filter(t => taskAssignments(t).length === 0).length,
    }), [tasks]);

    const rows = useMemo(() => {
        let result = tasks;
        if (filter === 'Unassigned') result = result.filter(t => taskAssignments(t).length === 0);
        else if (filter !== 'All') result = result.filter(t => t.status === filter);
        const q = query.trim().toLowerCase();
        if (q) {
            result = result.filter(t =>
                t.task_name.toLowerCase().includes(q) || String(t.task_id || '').toLowerCase().includes(q));
        }
        return [...result].sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));
    }, [tasks, filter, query]);

    return (
        <div className="glass-card overflow-hidden rounded-2xl">
            <div className="border-b border-slate-100 px-5 pb-3.5 pt-4 dark:border-slate-800">
                <div className="mb-3.5 flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                        Team Tasks <span className="font-normal tabular-nums text-slate-400">({rows.length})</span>
                    </h2>
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-slate-400" />
                        <input
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Search tasks…"
                            className="h-8 w-56 rounded-lg border border-slate-200/70 bg-white/70 pl-8 pr-3 text-[13px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 dark:border-slate-700/60 dark:bg-slate-800/60 dark:text-slate-200"
                        />
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {FILTERS.map(f => (
                        <FilterChip key={f} active={filter === f} onClick={() => setFilter(f)} count={counts[f]}>{f}</FilterChip>
                    ))}
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full" style={{ minWidth: 860 }}>
                    <thead>
                        <tr className="bg-slate-50/60 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:bg-slate-900/40">
                            <th className="py-2.5 pl-5 pr-3 text-left font-bold" style={{ minWidth: 360 }}>Task</th>
                            <th className="px-3 py-2.5 text-left font-bold" style={{ width: 130 }}>Status</th>
                            <th className="px-3 py-2.5 text-left font-bold" style={{ width: 110 }}>Due</th>
                            <th className="px-3 py-2.5 text-left font-bold" style={{ width: 220 }}>Assignees</th>
                            <th className="py-2.5 pl-3 pr-5 text-right font-bold" style={{ width: 110 }}> </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                        {rows.map(task => <TaskRow key={task.id} task={task} members={members} onAssign={onAssign} />)}
                    </tbody>
                </table>
                {rows.length === 0 && (
                    <div className="py-12 text-center text-sm text-slate-400">No tasks match this filter.</div>
                )}
            </div>
        </div>
    );
}

/* ------------------------------ Page ------------------------------ */

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

    async function reassign(taskId: string, resourceId: string) {
        await tasksApi.update(taskId, {
            assignments: [{ resource_id: resourceId, assignment_type: 'PRIMARY' as const, estimate_hrs: 0, actual_hrs: 0 }],
        } as any);
        await load();
    }

    const derived = useMemo(() => {
        if (!data) return null;
        const tasks = data.team_tasks.items;
        const done = tasks.filter(t => t.status === 'Done').length;
        const active = tasks.length - done;
        const overCap = data.members.filter(m => m.workload_hrs > m.capacity_hrs);
        const overNames = overCap.map(m => firstName(m.name));
        const overSub = overNames.length <= 2
            ? overNames.join(', ')
            : `${overNames.slice(0, 2).join(', ')} +${overNames.length - 2}`;
        return { tasks, done, active, overCap, overSub };
    }, [data]);

    if (error) {
        return (
            <div className="glass-card rounded-2xl p-8 text-center">
                <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-rose-500" />
                <p className="text-base font-semibold text-rose-700 dark:text-rose-300">Failed to load team dashboard</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{error}</p>
                <button onClick={load} className="mt-3 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">Try again</button>
            </div>
        );
    }
    if (!data || !derived) {
        return (
            <div className="space-y-6">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="glass-card h-24 animate-pulse rounded-xl" />
                    ))}
                </div>
                <div className="glass-card h-64 animate-pulse rounded-2xl" />
                <div className="glass-card h-80 animate-pulse rounded-2xl" />
            </div>
        );
    }

    const { tasks, done, active, overCap, overSub } = derived;
    const blocked = data.blocked_items.length;
    const overdue = data.overdue_items.length;

    return (
        <div className="space-y-6 animate-in fade-in duration-700">
            {/* Header */}
            <div className="glass-card flex items-start justify-between gap-4 rounded-2xl p-5">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Team Manager Dashboard</h1>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                        {data.team_name || 'Team'} · {data.members.length} members · {data.team_type || 'team'}
                    </p>
                </div>
                <a
                    href={data.reports_link}
                    className="glass-button-secondary inline-flex h-9 flex-shrink-0 items-center gap-1.5 rounded-lg px-4 text-sm font-medium"
                >
                    <BarChart3 className="h-[15px] w-[15px]" />
                    Reports
                </a>
            </div>

            {/* Stat tiles */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile label="Team Tasks" value={tasks.length} sub={`${done} done · ${active} active`} />
                <StatTile label="Blocked" value={blocked} sub={blocked ? `${blocked} need attention` : 'Nothing blocked'} alert={blocked > 0} accent={blocked ? 'text-rose-500 dark:text-rose-400' : undefined} />
                <StatTile label="Overdue" value={overdue} sub={overdue ? `${overdue} past due` : 'On schedule'} alert={overdue > 0} accent={overdue ? 'text-amber-500 dark:text-amber-400' : undefined} />
                <StatTile
                    label="Over Capacity"
                    value={overCap.length}
                    accent={overCap.length ? 'text-rose-500 dark:text-rose-400' : undefined}
                    alert={overCap.length > 0}
                    sub={overCap.length ? overSub : 'All within cap'}
                />
            </div>

            <WorkloadCard members={data.members} />
            <TeamTasksCard tasks={tasks} members={data.members} onAssign={reassign} />
        </div>
    );
}

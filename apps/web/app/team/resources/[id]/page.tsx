'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import Link from 'next/link';
import { usePagination } from '@/hooks/usePagination';
import { Pagination } from '@/components/ui/Pagination';
import { downloadCSV, downloadXLSX, safeFilename } from '@/lib/exportUtils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface ResourceAnalytics {
    profile: {
        id: string;
        resource_name: string;
        email?: string;
        department?: string;
        role?: string;
        is_active: boolean;
        user_id?: string;
    };
    utilization: {
        weekly_capacity_hrs: number;
        current_allocation_hrs: number;
        utilization_pct: number;
        active_tasks_count: number;
        backlog_tasks_count: number;
    };
    current_week_actual_hrs: number;
    backlog_hrs: number;
    timeline_summary: {
        on_track: number;
        at_risk: number;
        overdue: number;
        completed_early: number;
    };
    task_summary: {
        total: number;
        by_status: Record<string, number>;
        by_priority: Record<string, number>;
        by_project: Record<string, number>;
    };
    tasks: Array<{
        id: string;
        task_id: string;
        task_name: string;
        status: string;
        priority?: string;
        project_name?: string;
        estimate_hrs: number;
        actual_hrs: number;
        assignment_role: string;
        start_variance: number | null;
        completion_variance: number | null;
        execution_variance: number | null;
        health_status: 'on_track' | 'at_risk' | 'overdue' | 'completed_early' | null;
    }>;
    bugs: Array<{
        id: string;
        bug_id: string;
        title: string;
        source: 'TEST_CASE' | 'EXPLORATORY';
        status: string;
        severity: string;
        project_name?: string;
        creation_date?: string;
    }>;
}

const HEALTH_DISPLAY: Record<string, { dot: string; pill: string; label: string }> = {
    on_track: {
        dot: 'bg-emerald-500',
        pill: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
        label: 'ON TRACK',
    },
    at_risk: {
        dot: 'bg-amber-500',
        pill: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
        label: 'AT RISK',
    },
    overdue: {
        dot: 'bg-rose-500',
        pill: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
        label: 'OVERDUE',
    },
    completed_early: {
        dot: 'bg-blue-500',
        pill: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
        label: 'EARLY',
    },
};

const TIMELINE_BUCKETS: Array<{ key: keyof ResourceAnalytics['timeline_summary']; label: string; dot: string }> = [
    { key: 'on_track',       label: 'On Track', dot: 'bg-emerald-500' },
    { key: 'at_risk',        label: 'At Risk',  dot: 'bg-amber-500' },
    { key: 'overdue',        label: 'Overdue',  dot: 'bg-rose-500' },
    { key: 'completed_early', label: 'Early',   dot: 'bg-blue-500' },
];

const SEV_TONE: Record<string, string> = {
    critical: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    high:     'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    medium:   'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    low:      'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

const STATUS_TONE: Record<string, string> = {
    Done:          'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    'In Progress': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    Cancelled:     'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    Backlog:       'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    Open:          'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    Closed:        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    Resolved:      'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
};

const SOURCE_TONE: Record<string, string> = {
    TEST_CASE:   'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
    EXPLORATORY: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
};

const PRIORITY_TONE: Record<string, string> = {
    critical: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    high:     'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    medium:   'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    low:      'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

const FALLBACK_PILL = 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';

function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
    return (
        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
            {children}
        </span>
    );
}

function HealthPill({ kind }: { kind: string }) {
    const h = HEALTH_DISPLAY[kind];
    if (!h) return <span className="text-xs text-slate-400">—</span>;
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wider ${h.pill}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${h.dot}`} />
            {h.label}
        </span>
    );
}

function VarianceCell({ value }: { value: number | null }) {
    if (value === null || value === undefined) {
        return <span className="font-mono text-xs text-slate-400 dark:text-slate-500">—</span>;
    }
    if (value === 0) {
        return <span className="font-mono text-xs text-slate-500 dark:text-slate-400">0d</span>;
    }
    const cls = value > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400';
    return (
        <span className={`font-mono text-xs font-semibold ${cls}`}>
            {value > 0 ? '+' : ''}{value}d
        </span>
    );
}

function getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function tasksToRows(tasks: ResourceAnalytics['tasks']) {
    return tasks.map(t => ({
        'Task ID': t.task_id,
        'Task Name': t.task_name,
        'Project': t.project_name ?? '',
        'Status': t.status,
        'Priority': t.priority ?? '',
        'Health Status': t.health_status ?? '',
        'Start Variance (days)': t.start_variance ?? '',
        'Completion Variance (days)': t.completion_variance ?? '',
        'Execution Variance (days)': t.execution_variance ?? '',
        'Estimated Hrs': Number(t.estimate_hrs).toFixed(1),
        'Actual Hrs': Number(t.actual_hrs).toFixed(1),
    }));
}

function bugsToRows(bugs: ResourceAnalytics['bugs']) {
    return bugs.map(b => ({
        'Bug ID': b.bug_id,
        'Title': b.title,
        'Source': b.source === 'TEST_CASE' ? 'Test Case' : 'Exploratory',
        'Status': b.status,
        'Severity': b.severity,
        'Project': b.project_name ?? '',
        'Created': b.creation_date
            ? new Date(b.creation_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
            : '',
    }));
}

export default function ResourceDashboardPage() {
    const params = useParams();
    const { token, isAdmin, isManager } = useAuth();
    const [data, setData] = useState<ResourceAnalytics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const resourceId = params?.id as string;
    const tasksPagination = usePagination(data?.tasks.length ?? 0);
    const bugsPagination = usePagination(data?.bugs.length ?? 0);

    const canAccess = isAdmin || isManager;

    useEffect(() => {
        if (!canAccess) return;
        if (!token || !resourceId) return;

        async function load() {
            try {
                const res = await fetch(`${API_URL}/resources/${resourceId}/analytics`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.error || 'Failed to load analytics');
                }
                setData(await res.json());
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [token, resourceId, canAccess]);

    if (!canAccess) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="text-6xl mb-4">🔒</div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">Access Denied</h2>
                    <p className="text-slate-500 dark:text-slate-400 mb-6">Only Admins and Managers can access the Resource Dashboard.</p>
                    <Link href="/team/resources" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
                        Back to Resources
                    </Link>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-4 border-indigo-200 dark:border-indigo-800 border-t-indigo-600 rounded-full animate-spin" />
                    <span className="text-sm text-slate-500 dark:text-slate-400">Loading analytics...</span>
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="p-8">
                <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl p-6 text-center">
                    <p className="text-rose-600 dark:text-rose-400">{error || 'Failed to load data'}</p>
                    <Link href="/team/resources" className="mt-4 inline-block text-indigo-600 dark:text-indigo-400 hover:underline">
                        ← Back to Resources
                    </Link>
                </div>
            </div>
        );
    }

    const { profile, utilization, timeline_summary } = data;
    const utilizationPct = Math.min(utilization.utilization_pct, 100);
    const weekPct = utilization.weekly_capacity_hrs > 0
        ? Math.min((data.current_week_actual_hrs / utilization.weekly_capacity_hrs) * 100, 100)
        : 0;
    const weekPctDisplay = utilization.weekly_capacity_hrs > 0
        ? ((data.current_week_actual_hrs / utilization.weekly_capacity_hrs) * 100).toFixed(0)
        : '0';

    const statusCounts = data.tasks.reduce((acc, t) => {
        acc[t.status] = (acc[t.status] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    return (
        <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-5">

            {/* Header */}
            <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                    <Link
                        href="/team/resources"
                        className="mt-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                        title="Back"
                    >
                        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                            <path d="M15 18l-6-6 6-6" />
                        </svg>
                    </Link>
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                                {profile.resource_name}
                            </h1>
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${profile.is_active ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${profile.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                {profile.is_active ? 'Active' : 'Inactive'}
                            </span>
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Resource Analytics Dashboard{profile.department ? ` · ${profile.department}` : ''}{profile.role ? ` · ${profile.role}` : ''}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                        onClick={() => downloadXLSX(
                            `resource_${safeFilename(profile.resource_name)}.xlsx`,
                            tasksToRows(data.tasks)
                        )}
                        className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-medium bg-white/50 hover:bg-white/70 dark:bg-slate-800/50 dark:hover:bg-slate-700/70 backdrop-blur-md text-slate-800 dark:text-slate-100 border border-slate-200/40 dark:border-slate-600/40 shadow-sm active:scale-95 transition-all"
                    >
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                        </svg>
                        Export Excel
                    </button>
                    <Link
                        href={`/team/resources/create?edit=${resourceId}`}
                        className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-medium bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 active:scale-95 transition-all"
                    >
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M12 20h9M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                        Edit profile
                    </Link>
                </div>
            </div>

            {/* Profile card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-violet-500/30 flex-shrink-0">
                        {getInitials(profile.resource_name)}
                    </div>
                    <div>
                        <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Profile</div>
                        <div className="text-sm text-slate-700 dark:text-slate-200">Identity & department</div>
                    </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 p-6">
                    <div>
                        <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Full Name</div>
                        <div className="text-sm text-slate-800 dark:text-slate-100 font-medium truncate">{profile.resource_name}</div>
                    </div>
                    <div>
                        <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Job Title</div>
                        <div className="text-sm text-slate-800 dark:text-slate-100 font-medium truncate">{profile.role || '—'}</div>
                    </div>
                    <div>
                        <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Email</div>
                        <div className="text-sm text-slate-800 dark:text-slate-100 font-medium font-mono truncate" title={profile.email}>{profile.email || '—'}</div>
                    </div>
                    <div>
                        <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Department</div>
                        <div className="text-sm text-slate-800 dark:text-slate-100 font-medium truncate">{profile.department || '—'}</div>
                    </div>
                </div>
            </div>

            {/* KPI tiles */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Overall Utilization */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-5">
                    <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-3">Overall Utilization</div>
                    <div className="flex items-baseline gap-2 mb-2">
                        <span className="text-4xl font-bold text-emerald-500 dark:text-emerald-400 tabular-nums">
                            {utilization.utilization_pct.toFixed(0)}%
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">of capacity</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-1.5">
                        <div
                            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-1000"
                            style={{ width: `${utilizationPct}%` }}
                        />
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                        {utilization.current_allocation_hrs.toFixed(1)} / {utilization.weekly_capacity_hrs} hrs · last 30 days
                    </div>
                </div>

                {/* Current Week Actuals */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-5">
                    <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-3">Current Week Actuals</div>
                    <div className="flex items-baseline gap-2 mb-2">
                        <span className="text-4xl font-bold text-violet-500 dark:text-violet-400 tabular-nums">
                            {data.current_week_actual_hrs.toFixed(1)}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">hours logged</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-1.5">
                        <div
                            className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-1000"
                            style={{ width: `${weekPct}%` }}
                        />
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                        {weekPctDisplay}% of weekly capacity
                    </div>
                </div>

                {/* Backlog */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-5">
                    <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-3">Backlog</div>
                    <div className="flex items-baseline gap-2 mb-2">
                        <span className="text-4xl font-bold text-amber-500 dark:text-amber-400 tabular-nums">
                            {data.backlog_hrs.toFixed(1)}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">estimated hours</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 pt-3.5 border-t border-slate-100 dark:border-slate-800">
                        <span className="inline-flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            {statusCounts['In Progress'] || 0} in progress
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            {statusCounts['Backlog'] || 0} backlog
                        </span>
                    </div>
                </div>
            </div>

            {/* Timeline Health */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-3.5 border-b border-slate-100 dark:border-slate-800">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Timeline Health</h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-slate-100 dark:divide-slate-800">
                    {TIMELINE_BUCKETS.map(b => {
                        const count = timeline_summary[b.key] || 0;
                        return (
                            <div
                                key={b.key}
                                className="px-6 py-5 hover:bg-slate-50/40 dark:hover:bg-slate-800/30 transition-colors cursor-pointer"
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    <span className={`w-2 h-2 rounded-full ${b.dot}`} />
                                    <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">
                                        {b.label}
                                    </span>
                                </div>
                                <div className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums leading-none">{count}</div>
                                <div className="text-xs text-slate-400 mt-1.5">{count === 1 ? 'task' : 'tasks'}</div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Task Summary */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Task Summary</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2.5">By Status</div>
                        <div className="space-y-1.5">
                            {Object.entries(data.task_summary.by_status).map(([status, count]) => (
                                <div key={status} className="flex items-center justify-between text-sm">
                                    <Pill tone={STATUS_TONE[status] ?? FALLBACK_PILL}>{status}</Pill>
                                    <span className="font-mono font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{count}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div>
                        <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2.5">By Priority</div>
                        <div className="space-y-1.5">
                            {Object.entries(data.task_summary.by_priority).map(([priority, count]) => (
                                <div key={priority} className="flex items-center justify-between text-sm">
                                    <Pill tone={PRIORITY_TONE[priority.toLowerCase()] ?? FALLBACK_PILL}>{priority}</Pill>
                                    <span className="font-mono font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{count}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div>
                        <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2.5">By Project</div>
                        <div className="space-y-1.5 text-sm">
                            {Object.entries(data.task_summary.by_project).map(([project, count]) => (
                                <div key={project} className="flex items-center justify-between">
                                    <span className="text-slate-700 dark:text-slate-200 font-medium truncate max-w-[180px]">{project}</span>
                                    <span className="font-mono font-semibold text-slate-700 dark:text-slate-200 tabular-nums ml-2">{count}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Assigned Tasks */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                        Assigned Tasks <span className="text-slate-400 font-normal">({data.tasks.length})</span>
                    </h2>
                    {data.tasks.length > 0 && (
                        <div className="flex items-center gap-2">
                            <button
                                data-testid="tasks-export-csv"
                                onClick={() => downloadCSV(
                                    `resource_tasks_${safeFilename(profile.resource_name)}.csv`,
                                    tasksToRows(data.tasks)
                                )}
                                className="h-8 px-3 text-xs inline-flex items-center gap-1.5 rounded-lg font-medium bg-white/50 hover:bg-white/70 dark:bg-slate-800/50 dark:hover:bg-slate-700/70 backdrop-blur-md text-slate-800 dark:text-slate-100 border border-slate-200/40 dark:border-slate-600/40 shadow-sm active:scale-95 transition-all"
                            >
                                Export CSV
                            </button>
                            <button
                                data-testid="tasks-export-xlsx"
                                onClick={() => downloadXLSX(
                                    `resource_tasks_${safeFilename(profile.resource_name)}.xlsx`,
                                    tasksToRows(data.tasks)
                                )}
                                className="h-8 px-3 text-xs inline-flex items-center gap-1.5 rounded-lg font-medium bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-sm active:scale-95 transition-all"
                            >
                                Export Excel
                            </button>
                        </div>
                    )}
                </div>
                {data.tasks.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 dark:text-slate-500">
                        No tasks assigned to this resource.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table data-testid="tasks-table" className="w-full text-sm" style={{ minWidth: 1100 }}>
                            <thead>
                                <tr className="bg-slate-50/60 dark:bg-slate-900/40 text-[10px] uppercase tracking-wider font-bold text-slate-400">
                                    <th className="text-left font-bold py-3 pl-5 pr-3" style={{ minWidth: 280 }}>Task</th>
                                    <th className="text-left font-bold py-3 px-3" style={{ minWidth: 80 }}>Project</th>
                                    <th className="text-left font-bold py-3 px-3" style={{ minWidth: 90 }}>Status</th>
                                    <th className="text-left font-bold py-3 px-3" style={{ minWidth: 100 }}>Health</th>
                                    <th className="text-right font-bold py-3 px-3" style={{ minWidth: 90 }}>Start var.</th>
                                    <th className="text-right font-bold py-3 px-3" style={{ minWidth: 90 }}>Comp. var.</th>
                                    <th className="text-right font-bold py-3 px-3" style={{ minWidth: 90 }}>Exec. var.</th>
                                    <th className="text-right font-bold py-3 px-3" style={{ minWidth: 75 }}>Est hrs</th>
                                    <th className="text-right font-bold py-3 pl-3 pr-5" style={{ minWidth: 80 }}>Actual hrs</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                                {tasksPagination.slice(data.tasks).map(task => (
                                    <tr key={task.id} className="hover:bg-violet-50/40 dark:hover:bg-violet-900/10 transition-colors">
                                        <td className="py-3.5 pl-5 pr-3">
                                            <div className="flex items-center gap-3">
                                                <span className="font-mono text-[11px] font-semibold text-violet-600 dark:text-violet-300 flex-shrink-0">
                                                    {task.task_id}
                                                </span>
                                                <Link
                                                    href={`/work/tasks/${task.id}`}
                                                    className="text-slate-800 dark:text-slate-100 font-medium truncate max-w-[220px] hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                                                    title={task.task_name}
                                                >
                                                    {task.task_name}
                                                </Link>
                                            </div>
                                        </td>
                                        <td className="py-3.5 px-3 text-slate-600 dark:text-slate-300 font-medium">{task.project_name || '—'}</td>
                                        <td className="py-3.5 px-3">
                                            <Pill tone={STATUS_TONE[task.status] ?? FALLBACK_PILL}>{task.status}</Pill>
                                        </td>
                                        <td className="py-3.5 px-3">
                                            {task.health_status
                                                ? <HealthPill kind={task.health_status} />
                                                : <span className="text-xs text-slate-400">—</span>
                                            }
                                        </td>
                                        <td className="py-3.5 px-3 text-right">
                                            <VarianceCell value={task.start_variance} />
                                        </td>
                                        <td className="py-3.5 px-3 text-right">
                                            <VarianceCell value={task.completion_variance} />
                                        </td>
                                        <td className="py-3.5 px-3 text-right">
                                            <VarianceCell value={task.execution_variance} />
                                        </td>
                                        <td className="py-3.5 px-3 text-right font-mono text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                                            {Number(task.estimate_hrs).toFixed(1)}
                                        </td>
                                        <td className="py-3.5 pl-3 pr-5 text-right font-mono text-xs text-slate-700 dark:text-slate-200 font-semibold tabular-nums">
                                            {Number(task.actual_hrs).toFixed(1)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <Pagination
                            currentPage={tasksPagination.currentPage}
                            totalPages={tasksPagination.totalPages}
                            onPrev={tasksPagination.goToPrev}
                            onNext={tasksPagination.goToNext}
                            testIdPrefix="tasks"
                        />
                    </div>
                )}
            </div>

            {/* Reported Bugs */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                        Reported Bugs <span className="text-slate-400 font-normal">({data.bugs.length})</span>
                    </h2>
                    {data.bugs.length > 0 && (
                        <div className="flex items-center gap-2">
                            <button
                                data-testid="bugs-export-csv"
                                onClick={() => downloadCSV(
                                    `resource_bugs_${safeFilename(profile.resource_name)}.csv`,
                                    bugsToRows(data.bugs)
                                )}
                                className="h-8 px-3 text-xs inline-flex items-center gap-1.5 rounded-lg font-medium bg-white/50 hover:bg-white/70 dark:bg-slate-800/50 dark:hover:bg-slate-700/70 backdrop-blur-md text-slate-800 dark:text-slate-100 border border-slate-200/40 dark:border-slate-600/40 shadow-sm active:scale-95 transition-all"
                            >
                                Export CSV
                            </button>
                            <button
                                data-testid="bugs-export-xlsx"
                                onClick={() => downloadXLSX(
                                    `resource_bugs_${safeFilename(profile.resource_name)}.xlsx`,
                                    bugsToRows(data.bugs)
                                )}
                                className="h-8 px-3 text-xs inline-flex items-center gap-1.5 rounded-lg font-medium bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-sm active:scale-95 transition-all"
                            >
                                Export Excel
                            </button>
                        </div>
                    )}
                </div>
                {data.bugs.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 dark:text-slate-500">
                        No bugs associated with this resource.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table data-testid="bugs-table" className="w-full text-sm" style={{ minWidth: 1000 }}>
                            <thead>
                                <tr className="bg-slate-50/60 dark:bg-slate-900/40 text-[10px] uppercase tracking-wider font-bold text-slate-400">
                                    <th className="text-left font-bold py-3 pl-5 pr-3" style={{ minWidth: 80 }}>ID</th>
                                    <th className="text-left font-bold py-3 px-3" style={{ minWidth: 300 }}>Title</th>
                                    <th className="text-left font-bold py-3 px-3" style={{ minWidth: 110 }}>Source</th>
                                    <th className="text-left font-bold py-3 px-3" style={{ minWidth: 90 }}>Status</th>
                                    <th className="text-left font-bold py-3 px-3" style={{ minWidth: 90 }}>Severity</th>
                                    <th className="text-left font-bold py-3 px-3" style={{ minWidth: 90 }}>Project</th>
                                    <th className="text-left font-bold py-3 pl-3 pr-5" style={{ minWidth: 110 }}>Created</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                                {bugsPagination.slice(data.bugs).map(bug => (
                                    <tr key={bug.id} className="hover:bg-violet-50/40 dark:hover:bg-violet-900/10 transition-colors">
                                        <td className="py-3.5 pl-5 pr-3 font-mono text-[11px] font-semibold text-violet-600 dark:text-violet-300">
                                            {bug.bug_id}
                                        </td>
                                        <td className="py-3.5 px-3 text-slate-800 dark:text-slate-100 font-medium" dir="auto">
                                            <div className="truncate max-w-[300px]" title={bug.title}>{bug.title}</div>
                                        </td>
                                        <td className="py-3.5 px-3">
                                            <Pill tone={SOURCE_TONE[bug.source] ?? FALLBACK_PILL}>
                                                {bug.source === 'TEST_CASE' ? 'Test Case' : 'Exploratory'}
                                            </Pill>
                                        </td>
                                        <td className="py-3.5 px-3">
                                            <Pill tone={STATUS_TONE[bug.status] ?? FALLBACK_PILL}>{bug.status}</Pill>
                                        </td>
                                        <td className="py-3.5 px-3">
                                            <Pill tone={SEV_TONE[bug.severity?.toLowerCase()] ?? FALLBACK_PILL}>{bug.severity}</Pill>
                                        </td>
                                        <td className="py-3.5 px-3 text-slate-600 dark:text-slate-300 font-medium">{bug.project_name || '—'}</td>
                                        <td className="py-3.5 pl-3 pr-5 text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                                            {bug.creation_date
                                                ? new Date(bug.creation_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                                                : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <Pagination
                            currentPage={bugsPagination.currentPage}
                            totalPages={bugsPagination.totalPages}
                            onPrev={bugsPagination.goToPrev}
                            onNext={bugsPagination.goToNext}
                            testIdPrefix="bugs"
                        />
                    </div>
                )}
            </div>

            {/* Variance Legend */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-5">
                <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-3">
                    Variance Legend (Working Days, Sun–Thu)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-2 text-xs text-slate-600 dark:text-slate-300">
                    <div><span className="font-semibold">Start Var.</span> = Actual Start − Expected Start</div>
                    <div><span className="font-semibold">Comp. Var.</span> = Actual End − Deadline</div>
                    <div><span className="font-semibold">Exec. Var.</span> = Actual Duration − Estimate Days</div>
                    <div><span className="text-emerald-600 dark:text-emerald-400 font-semibold">Negative</span> = early / under</div>
                    <div><span className="text-rose-600 dark:text-rose-400 font-semibold">Positive</span> = late / over</div>
                </div>
            </div>

        </div>
    );
}

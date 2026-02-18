'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import Link from 'next/link';

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
        // Timeline fields
        start_variance: number | null;
        completion_variance: number | null;
        execution_variance: number | null;
        health_status: 'on_track' | 'at_risk' | 'overdue' | 'completed_early' | null;
    }>;
}

const HEALTH_CONFIG: Record<string, {
    label: string;
    color: string;       // hex for dot / accents
    lightBg: string;     // hex for card & badge background (light)
    lightBorder: string; // hex for card & badge border (light)
    lightText: string;   // hex for text (light)
    pulse: boolean;
}> = {
    on_track: {
        label: 'On Track',
        color: '#10b981',
        lightBg: '#ecfdf5',
        lightBorder: '#a7f3d0',
        lightText: '#065f46',
        pulse: true,
    },
    at_risk: {
        label: 'At Risk',
        color: '#f59e0b',
        lightBg: '#fffbeb',
        lightBorder: '#fde68a',
        lightText: '#92400e',
        pulse: true,
    },
    overdue: {
        label: 'Overdue',
        color: '#ef4444',
        lightBg: '#fef2f2',
        lightBorder: '#fecaca',
        lightText: '#991b1b',
        pulse: false,
    },
    completed_early: {
        label: 'Early',
        color: '#3b82f6',
        lightBg: '#eff6ff',
        lightBorder: '#bfdbfe',
        lightText: '#1e40af',
        pulse: false,
    },
};

function StatusIndicator({ config, size = 'sm' }: { config: typeof HEALTH_CONFIG[string]; size?: 'sm' | 'lg' }) {
    const dotSize = size === 'lg' ? 12 : 8;
    const pingSize = size === 'lg' ? 12 : 8;
    return (
        <span className="relative flex items-center justify-center" style={{ width: dotSize, height: dotSize }}>
            {config.pulse && (
                <span
                    className="animate-ping absolute rounded-full opacity-30"
                    style={{ width: pingSize, height: pingSize, backgroundColor: config.color }}
                />
            )}
            <span
                className="relative block rounded-full"
                style={{
                    width: dotSize,
                    height: dotSize,
                    backgroundColor: config.color,
                    boxShadow: `0 0 ${size === 'lg' ? '8px' : '4px'} ${config.color}40`,
                }}
            />
        </span>
    );
}

function formatVariance(val: number | null): string {
    if (val === null || val === undefined) return '—';
    if (val === 0) return '0d';
    return val > 0 ? `+${val}d` : `${val}d`;
}

function varianceColor(val: number | null): string {
    if (val === null || val === undefined) return 'text-slate-400 dark:text-slate-500';
    if (val > 0) return 'text-rose-600 dark:text-rose-400';
    if (val < 0) return 'text-emerald-600 dark:text-emerald-400';
    return 'text-slate-600 dark:text-slate-300';
}

export default function ResourceDashboardPage() {
    const params = useParams();
    const router = useRouter();
    const { user, token, isAdmin } = useAuth();
    const [data, setData] = useState<ResourceAnalytics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const resourceId = params?.id as string;

    const isManager = user?.role === 'manager';
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
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Access Denied</h2>
                    <p className="text-slate-500 dark:text-slate-400 mb-6">Only Admins and Managers can access the Resource Dashboard.</p>
                    <Link href="/resources" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
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
                    <Link href="/resources" className="mt-4 inline-block text-indigo-600 dark:text-indigo-400 hover:underline">
                        ← Back to Resources
                    </Link>
                </div>
            </div>
        );
    }

    const { profile, utilization, timeline_summary } = data;
    const utilizationColor = utilization.utilization_pct > 100 ? 'rose' : utilization.utilization_pct > 80 ? 'amber' : 'emerald';

    const statusCounts = data.tasks.reduce((acc, t) => {
        acc[t.status] = (acc[t.status] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    return (
        <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/resources" className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{profile.resource_name}</h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Resource Analytics Dashboard</p>
                    </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${profile.is_active
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                    }`}>
                    {profile.is_active ? 'Active' : 'Inactive'}
                </span>
            </div>

            {/* Profile Card */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-4">Profile</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div>
                        <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Full Name</p>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{profile.resource_name}</p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Job Title</p>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{profile.role || '—'}</p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Email</p>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{profile.email || '—'}</p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Department</p>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{profile.department || '—'}</p>
                    </div>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Overall Utilization */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                    <h4 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Overall Utilization</h4>
                    <div className="flex items-end gap-3">
                        <span className={`text-3xl font-bold text-${utilizationColor}-600 dark:text-${utilizationColor}-400`}>
                            {utilization.utilization_pct.toFixed(0)}%
                        </span>
                        <span className="text-sm text-slate-400 dark:text-slate-500 mb-1">
                            {utilization.current_allocation_hrs.toFixed(1)} / {utilization.weekly_capacity_hrs} hrs
                        </span>
                    </div>
                    <div className="mt-3 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                            className={`h-full bg-${utilizationColor}-500 rounded-full transition-all duration-500`}
                            style={{ width: `${Math.min(utilization.utilization_pct, 100)}%` }}
                        />
                    </div>
                </div>

                {/* Current Week Actuals */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                    <h4 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Current Week Actuals</h4>
                    <div className="flex items-end gap-3">
                        <span className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">
                            {data.current_week_actual_hrs.toFixed(1)}
                        </span>
                        <span className="text-sm text-slate-400 dark:text-slate-500 mb-1">hours logged</span>
                    </div>
                    <div className="mt-3 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min((data.current_week_actual_hrs / utilization.weekly_capacity_hrs) * 100, 100)}%` }}
                        />
                    </div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                        {((data.current_week_actual_hrs / utilization.weekly_capacity_hrs) * 100).toFixed(0)}% of weekly capacity
                    </p>
                </div>

                {/* Backlog */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                    <h4 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Backlog</h4>
                    <div className="flex items-end gap-3">
                        <span className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                            {data.backlog_hrs.toFixed(1)}
                        </span>
                        <span className="text-sm text-slate-400 dark:text-slate-500 mb-1">estimated hours</span>
                    </div>
                    <div className="flex items-center gap-4 mt-3">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-semibold text-slate-700 dark:text-slate-300">{statusCounts['In Progress'] || 0}</span> In Progress
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-semibold text-slate-700 dark:text-slate-300">{statusCounts['Backlog'] || 0}</span> Backlog
                        </span>
                    </div>
                </div>
            </div>

            {/* Timeline Health Summary */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800">
                    <h3 className="text-sm font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Timeline Health</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-slate-100 dark:divide-slate-800">
                    {Object.entries(HEALTH_CONFIG).map(([key, cfg]) => {
                        const count = timeline_summary[key as keyof typeof timeline_summary] || 0;
                        return (
                            <div
                                key={key}
                                className="relative p-5 transition-all"
                                style={{ backgroundColor: count > 0 ? `${cfg.lightBg}` : undefined }}
                            >
                                <div className="flex items-center gap-2.5 mb-3">
                                    <StatusIndicator config={cfg} size="lg" />
                                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{cfg.label}</span>
                                </div>
                                <p
                                    className="text-3xl font-bold tracking-tight"
                                    style={{ color: count > 0 ? cfg.lightText : '#94a3b8' }}
                                >
                                    {count}
                                </p>
                                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                                    {count === 1 ? 'task' : 'tasks'}
                                </p>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Assigned Tasks Table with Timeline Columns */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                    <h3 className="text-sm font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                        Assigned Tasks ({data.tasks.length})
                    </h3>
                </div>
                {data.tasks.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 dark:text-slate-500">
                        No tasks assigned to this resource.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full table-fixed">
                            <thead className="bg-slate-50 dark:bg-slate-800/50">
                                <tr>
                                    <th className="w-[26%] px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Task</th>
                                    <th className="w-[8%] px-3 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Project</th>
                                    <th className="w-[9%] px-3 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                                    <th className="w-[11%] px-3 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Health</th>
                                    <th className="w-[9%] px-3 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap" title="Start Variance (working days)">Start Var.</th>
                                    <th className="w-[9%] px-3 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap" title="Completion Variance (working days)">Comp. Var.</th>
                                    <th className="w-[9%] px-3 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap" title="Execution Variance (working days)">Exec. Var.</th>
                                    <th className="w-[9%] px-3 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">Est. Hrs</th>
                                    <th className="w-[10%] px-3 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">Actual Hrs</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {data.tasks.map(task => {
                                    const healthCfg = task.health_status ? HEALTH_CONFIG[task.health_status] : null;
                                    const statusColor =
                                        task.status === 'Done' ? 'emerald' :
                                            task.status === 'In Progress' ? 'blue' :
                                                task.status === 'Cancelled' ? 'slate' : 'amber';
                                    return (
                                        <tr key={task.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                            <td className="px-4 py-3">
                                                <Link href={`/tasks/${task.id}`} className="block text-sm font-medium text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 truncate">
                                                    <span className="text-xs text-slate-400 dark:text-slate-500 mr-1">{task.task_id}</span>
                                                    {task.task_name}
                                                </Link>
                                            </td>
                                            <td className="px-3 py-3 text-sm text-slate-600 dark:text-slate-400 truncate">{task.project_name || '—'}</td>
                                            <td className="px-3 py-3 whitespace-nowrap">
                                                <span className={`text-xs font-medium px-2 py-1 rounded-lg bg-${statusColor}-50 dark:bg-${statusColor}-900/20 text-${statusColor}-600 dark:text-${statusColor}-400`}>
                                                    {task.status}
                                                </span>
                                            </td>
                                            {/* Health Status */}
                                            <td className="px-3 py-3 text-center whitespace-nowrap">
                                                {healthCfg ? (
                                                    <span
                                                        className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase px-2.5 py-1 rounded-full whitespace-nowrap"
                                                        style={{
                                                            backgroundColor: healthCfg.lightBg,
                                                            color: healthCfg.lightText,
                                                            border: `1px solid ${healthCfg.lightBorder}`,
                                                        }}
                                                    >
                                                        <StatusIndicator config={healthCfg} size="sm" />
                                                        {healthCfg.label}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                                                )}
                                            </td>
                                            {/* Start Variance */}
                                            <td className={`px-3 py-3 text-center text-sm font-semibold tabular-nums whitespace-nowrap ${varianceColor(task.start_variance)}`}>
                                                {formatVariance(task.start_variance)}
                                            </td>
                                            {/* Completion Variance */}
                                            <td className={`px-3 py-3 text-center text-sm font-semibold tabular-nums whitespace-nowrap ${varianceColor(task.completion_variance)}`}>
                                                {formatVariance(task.completion_variance)}
                                            </td>
                                            {/* Execution Variance */}
                                            <td className={`px-3 py-3 text-center text-sm font-semibold tabular-nums whitespace-nowrap ${varianceColor(task.execution_variance)}`}>
                                                {formatVariance(task.execution_variance)}
                                            </td>
                                            <td className="px-3 py-3 text-right text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">{Number(task.estimate_hrs).toFixed(1)}</td>
                                            <td className="px-3 py-3 text-right text-sm font-medium text-slate-900 dark:text-white whitespace-nowrap">{Number(task.actual_hrs).toFixed(1)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Variance Legend */}
            <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Variance Legend (Working Days, Sun–Thu)</p>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <span><strong>Start Var.</strong> = Actual Start − Expected Start</span>
                    <span><strong>Comp. Var.</strong> = Actual End − Deadline</span>
                    <span><strong>Exec. Var.</strong> = Actual Duration − Estimate Days</span>
                    <span className="text-emerald-600 dark:text-emerald-400">Negative = early/under</span>
                    <span className="text-rose-600 dark:text-rose-400">Positive = late/over</span>
                </div>
            </div>
        </div>
    );
}

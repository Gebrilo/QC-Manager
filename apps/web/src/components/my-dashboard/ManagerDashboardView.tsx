import { DashboardMetrics, TeamApi, TeamSummaryApi, type Task } from '@/lib/api';
import { StatCard } from '@/components/ui/StatCard';
import Link from 'next/link';
import { ResourceUtilizationChart } from '@/components/dashboard/ResourceUtilizationChart';

interface Props {
    metrics: DashboardMetrics;
    team: TeamApi;
    summary: TeamSummaryApi;
    tasks: Task[];
}

const STATUS_COLORS: Record<string, string> = {
    ACTIVE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    PREPARATION: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    SUSPENDED: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
    ARCHIVED: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

export function ManagerDashboardView({ metrics, team, summary, tasks }: Props) {
    const completionPct = Number(metrics.overall_completion_rate_pct ?? 0);
    const members = team.members ?? [];
    const projects = team.projects ?? [];

    return (
        <div className="space-y-6 animate-in fade-in duration-700">
            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                    title="Team Members"
                    value={summary.member_count}
                    subtitle={summary.team_name}
                    icon={
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    }
                />
                <StatCard
                    title="Team Projects"
                    value={summary.project_count}
                    subtitle="assigned to your team"
                    icon={
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                    }
                />
                <StatCard
                    title="Team Tasks"
                    value={metrics.total_tasks}
                    subtitle={`${metrics.tasks_done} done · ${metrics.tasks_in_progress} in progress`}
                    icon={
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                        </svg>
                    }
                />
                <StatCard
                    title="Completion Rate"
                    value={`${completionPct.toFixed(1)}%`}
                    subtitle="team tasks by hours"
                    icon={
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                    }
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Team members */}
                <div className="glass-card rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-base font-semibold text-slate-900 dark:text-white">Members ({members.length})</h2>
                        <Link href="/team/journeys" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">View journeys →</Link>
                    </div>
                    {members.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-6">No members yet.</p>
                    ) : (
                        <ul className="space-y-2">
                            {members.map(m => (
                                <li key={m.id} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                                    <div>
                                        <p className="text-sm font-medium text-slate-900 dark:text-white">{m.name}</p>
                                        <p className="text-xs text-slate-400">{m.email}</p>
                                    </div>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[(m as any).status ?? 'ACTIVE'] ?? STATUS_COLORS.ACTIVE}`}>
                                        {(m as any).status ?? 'Active'}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* Team projects */}
                <div className="glass-card rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-base font-semibold text-slate-900 dark:text-white">Projects ({projects.length})</h2>
                        <Link href="/work/projects" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">View all →</Link>
                    </div>
                    {projects.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-6">No projects assigned.</p>
                    ) : (
                        <ul className="space-y-2">
                            {projects.slice(0, 8).map(p => (
                                <li key={p.id} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                                    <Link href={`/work/projects/${p.id}`} className="text-sm font-medium text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 truncate max-w-[60%]">
                                        {p.project_name}
                                    </Link>
                                    <span className="text-xs text-slate-400 capitalize">{p.status}</span>
                                </li>
                            ))}
                            {projects.length > 8 && (
                                <li className="pt-1 text-xs text-slate-400 text-center">+{projects.length - 8} more</li>
                            )}
                        </ul>
                    )}
                </div>
            </div>

            {/* Resource Utilization */}
            <ResourceUtilizationChart tasks={tasks} />

            {/* Hours summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="glass-card rounded-xl p-5">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Estimated Hours</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{Number(metrics.total_estimated_hrs).toFixed(1)}h</p>
                </div>
                <div className="glass-card rounded-xl p-5">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Actual Hours</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{Number(metrics.total_actual_hrs).toFixed(1)}h</p>
                </div>
                <div className="glass-card rounded-xl p-5">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Hours Variance</p>
                    <p className={`text-2xl font-bold ${metrics.total_hours_variance > 0 ? 'text-rose-500' : metrics.total_hours_variance < 0 ? 'text-emerald-500' : 'text-slate-900 dark:text-white'}`}>
                        {metrics.total_hours_variance > 0 ? '+' : ''}{Number(metrics.total_hours_variance).toFixed(1)}h
                    </p>
                </div>
            </div>
        </div>
    );
}

import { DashboardMetrics, TeamApi, TeamSummaryApi, type Task } from '@/lib/api';
import { StatCard } from '@/components/ui/StatCard';
import Link from 'next/link';
import { ResourceSection } from '@/components/my-dashboard/ResourceSection';
import { DashboardTaskSection } from '@/components/my-dashboard/DashboardTaskSection';

interface Props {
    metrics: DashboardMetrics;
    teams: TeamApi[];
    summary: TeamSummaryApi;
    tasks: Task[];
}

export function AdminDashboardView({ metrics, teams, summary, tasks }: Props) {
    const completionPct = Number(metrics.overall_completion_rate_pct ?? 0);

    return (
        <div className="space-y-6 animate-in fade-in duration-700">
            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                    title="Active Resources"
                    value={metrics.active_resources}
                    subtitle="across all teams"
                    icon={
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    }
                />
                <StatCard
                    title="Total Projects"
                    value={metrics.total_projects}
                    subtitle="organisation-wide"
                    icon={
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                    }
                />
                <StatCard
                    title="Total Tasks"
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
                    subtitle="tasks done by hours"
                    icon={
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                    }
                />
            </div>

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

            {/* Resource Utilization + Analytics, filterable by year / month / day */}
            <ResourceSection tasks={tasks} />

            {/* Task overview with resource + project filters */}
            <DashboardTaskSection tasks={tasks} />

            {/* Teams table */}
            <div className="glass-card rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">Teams ({teams.length})</h2>
                    <Link href="/admin/teams" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">Manage teams →</Link>
                </div>
                {teams.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-6">No teams found.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 dark:border-slate-700 text-left">
                                    <th className="pb-3 px-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Team</th>
                                    <th className="pb-3 px-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Manager</th>
                                    <th className="pb-3 px-2 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Members</th>
                                    <th className="pb-3 px-2 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Projects</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {teams.map(team => (
                                    <tr key={team.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                        <td className="py-3 px-2 font-medium text-slate-900 dark:text-white">{team.name}</td>
                                        <td className="py-3 px-2 text-slate-500 dark:text-slate-400">{team.manager_name ?? '—'}</td>
                                        <td className="py-3 px-2 text-right text-slate-700 dark:text-slate-300">{team.member_count ?? 0}</td>
                                        <td className="py-3 px-2 text-right text-slate-700 dark:text-slate-300">{team.project_count ?? 0}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

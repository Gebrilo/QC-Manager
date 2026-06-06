'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
    meDashboardApi, MeDashboard, myJourneysApi, fetchApi, type AssignedJourney,
    dashboardApi, DashboardMetrics, teamsApi, TeamApi, TeamSummaryApi, tasksApi, type Task,
} from '@/lib/api';
import { useAuth } from '@/components/providers/AuthProvider';
import { MyStatCards } from '@/components/my-dashboard/MyStatCards';
import { TaskDistributionChart } from '@/components/my-dashboard/TaskDistributionChart';
import { TasksByProjectTable } from '@/components/my-dashboard/TasksByProjectTable';
import { MyBugsTable } from '@/components/my-dashboard/MyBugsTable';
import { QuickNavCards } from '@/components/shared/QuickNavCards';
import { AdminDashboardView } from '@/components/my-dashboard/AdminDashboardView';
import { ManagerDashboardView } from '@/components/my-dashboard/ManagerDashboardView';
import { StatCard } from '@/components/ui/StatCard';
import { Mail } from 'lucide-react';

interface PersonalTask { id: string; status: 'pending' | 'in_progress' | 'done' | 'cancelled'; }

function LoadingSkeleton() {
    return (
        <div className="space-y-6 animate-pulse">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="glass-card p-6 h-24 rounded-xl bg-slate-100 dark:bg-slate-800" />
                ))}
            </div>
            <div className="glass-card h-48 rounded-xl bg-slate-100 dark:bg-slate-800" />
            <div className="glass-card h-64 rounded-xl bg-slate-100 dark:bg-slate-800" />
        </div>
    );
}

export function MyDashboardClient() {
    const { user, isAdmin, isManager } = useAuth();

    // Elevated-role state
    const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
    const [teams, setTeams] = useState<TeamApi[]>([]);
    const [myTeam, setMyTeam] = useState<TeamApi | null>(null);
    const [summary, setSummary] = useState<TeamSummaryApi | null>(null);
    const [tasks, setTasks] = useState<Task[]>([]);

    // Personal state
    const [data, setData] = useState<MeDashboard | null>(null);
    const [showQuickNav, setShowQuickNav] = useState(true);
    const [journeys, setJourneys] = useState<AssignedJourney[]>([]);
    const [pendingPersonalTasks, setPendingPersonalTasks] = useState(0);
    const [globalMetrics, setGlobalMetrics] = useState<DashboardMetrics | null>(null);

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);

            if (isAdmin) {
                const [m, teamList, sum, taskList] = await Promise.all([
                    dashboardApi.getMetrics(),
                    teamsApi.list(),
                    teamsApi.getSummary(),
                    tasksApi.list().catch(() => [] as Task[]),
                ]);
                setMetrics(m);
                setTeams(teamList);
                setSummary(sum);
                setTasks(taskList);
            } else if (isManager) {
                const [m, team, sum, taskList] = await Promise.all([
                    dashboardApi.getMetrics(),
                    teamsApi.getMine(),
                    teamsApi.getSummary(),
                    tasksApi.list().catch(() => [] as Task[]),
                ]);
                setMetrics(m);
                setMyTeam(team);
                setSummary(sum);
                setTasks(taskList);
            } else {
                const [result, meData, journeyData, personalTasksData, gMetrics] = await Promise.all([
                    meDashboardApi.get().catch((err: any) => {
                        if (err?.status === 404 || err?.message?.includes('No resource')) {
                            setError('no-resource');
                        } else {
                            setError('generic');
                        }
                        return null;
                    }),
                    fetchApi<{ user: { preferences?: { quick_nav_visible?: boolean } } }>('/auth/me').catch(() => null),
                    myJourneysApi.list().catch(() => [] as AssignedJourney[]),
                    fetchApi<PersonalTask[]>('/my-tasks').catch(() => [] as PersonalTask[]),
                    dashboardApi.getMetrics().catch(() => null),
                ]);
                if (result) setData(result);
                if (meData?.user?.preferences?.quick_nav_visible === false) setShowQuickNav(false);
                setJourneys(journeyData);
                setGlobalMetrics(gMetrics);
                setPendingPersonalTasks(
                    (personalTasksData as PersonalTask[]).filter(
                        t => t.status === 'pending' || t.status === 'in_progress'
                    ).length
                );
            }
        } catch (err: any) {
            if (err?.status === 404 || err?.message?.includes('No resource')) {
                setError('no-resource');
            } else {
                setError('generic');
            }
        } finally {
            setIsLoading(false);
        }
    }, [isAdmin, isManager]);

    useEffect(() => { load(); }, [load]);

    if (isLoading) return <LoadingSkeleton />;

    if (error === 'no-resource') {
        return (
            <div className="space-y-6">
                <div className="rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-5 flex items-start gap-4">
                    <svg className="w-8 h-8 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    <div>
                        <p className="text-amber-800 dark:text-amber-300 font-semibold">Your account is not linked to a resource yet</p>
                        <p className="text-amber-600 dark:text-amber-500 text-sm mt-1">
                            Contact your administrator to link your account so you can see your personal stats. In the meantime, here&apos;s an overview of the organisation.
                            <a
                                href="mailto:?subject=Please link my QC-Manager account"
                                className="inline-flex items-center gap-1 ml-1 text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                            >
                                <Mail className="w-3.5 h-3.5" />
                                Contact admin
                            </a>
                        </p>
                    </div>
                </div>

                {globalMetrics && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard
                            title="Total Projects"
                            value={globalMetrics.total_projects}
                            subtitle={`${globalMetrics.projects_with_tasks} with tasks`}
                            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>}
                        />
                        <StatCard
                            title="Total Tasks"
                            value={globalMetrics.total_tasks}
                            subtitle={`${globalMetrics.tasks_done} done · ${globalMetrics.tasks_in_progress} in progress`}
                            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>}
                        />
                        <StatCard
                            title="Completion Rate"
                            value={`${Math.round(globalMetrics.overall_completion_rate_pct)}%`}
                            subtitle="organisation-wide"
                            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
                        />
                        <StatCard
                            title="Active Resources"
                            value={globalMetrics.active_resources}
                            subtitle="team members"
                            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>}
                        />
                    </div>
                )}

                <div>
                    <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-3">Get Started</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <Link href="/work/projects"
                            className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-all group">
                            <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center flex-shrink-0">
                                <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">Projects</p>
                                <p className="text-xs text-slate-400">Browse all projects</p>
                            </div>
                        </Link>
                        <Link href="/work/tasks"
                            className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-all group">
                            <div className="w-10 h-10 rounded-lg bg-violet-50 dark:bg-violet-950 flex items-center justify-center flex-shrink-0">
                                <svg className="w-5 h-5 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">Tasks</p>
                                <p className="text-xs text-slate-400">View all tasks</p>
                            </div>
                        </Link>
                        <Link href="/work/stories"
                            className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-all group">
                            <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center flex-shrink-0">
                                <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">Stories</p>
                                <p className="text-xs text-slate-400">User stories</p>
                            </div>
                        </Link>
                        <Link href="/work/bugs"
                            className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-all group">
                            <div className="w-10 h-10 rounded-lg bg-rose-50 dark:bg-rose-950 flex items-center justify-center flex-shrink-0">
                                <svg className="w-5 h-5 text-rose-600 dark:text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">Bugs</p>
                                <p className="text-xs text-slate-400">Reported issues</p>
                            </div>
                        </Link>
                    </div>
                </div>

                {showQuickNav && (
                    <QuickNavCards journeys={journeys} pendingTasks={pendingPersonalTasks} />
                )}
            </div>
        );
    }

    if (error) {
        return (
            <div className="space-y-6">
                {showQuickNav && (
                    <QuickNavCards journeys={[]} pendingTasks={0} />
                )}
                <div className="rounded-2xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 p-8 text-center">
                    <svg className="w-12 h-12 text-rose-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-rose-700 dark:text-rose-400 font-semibold text-lg">Failed to load dashboard</p>
                    <button onClick={load} className="mt-3 text-sm text-indigo-600 dark:text-indigo-400 hover:underline font-medium">Try again</button>
                </div>
            </div>
        );
    }

    // Admin: org-wide view
    if (isAdmin && metrics && summary) {
        return <AdminDashboardView metrics={metrics} teams={teams} summary={summary} tasks={tasks} />;
    }

    // Manager: team view
    if (isManager && metrics && myTeam && summary) {
        return <ManagerDashboardView metrics={metrics} team={myTeam} summary={summary} tasks={tasks} />;
    }

    // User: personal view
    if (!data) {
        return (
            <div className="space-y-6">
                {showQuickNav && (
                    <QuickNavCards journeys={journeys} pendingTasks={pendingPersonalTasks} />
                )}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 p-8 text-center">
                    <p className="text-slate-600 dark:text-slate-400">No dashboard data available yet.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-700">
            {showQuickNav && (
                <QuickNavCards journeys={journeys} pendingTasks={pendingPersonalTasks} />
            )}
            <MyStatCards summary={data.summary} />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <TaskDistributionChart distribution={data.task_distribution} />
                <TasksByProjectTable tasksByProject={data.tasks_by_project} />
            </div>
            <MyBugsTable bugs={data.submitted_bugs} />
        </div>
    );
}

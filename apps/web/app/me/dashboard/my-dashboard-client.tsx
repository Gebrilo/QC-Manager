'use client';

import { useEffect, useState, useCallback } from 'react';
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
                const [result, meData, journeyData, personalTasksData] = await Promise.all([
                    meDashboardApi.get(),
                    fetchApi<{ user: { preferences?: { quick_nav_visible?: boolean } } }>('/auth/me').catch(() => null),
                    myJourneysApi.list().catch(() => [] as AssignedJourney[]),
                    fetchApi<PersonalTask[]>('/my-tasks').catch(() => [] as PersonalTask[]),
                ]);
                setData(result);
                if (meData?.user?.preferences?.quick_nav_visible === false) setShowQuickNav(false);
                setJourneys(journeyData);
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
                {showQuickNav && (
                    <QuickNavCards journeys={[]} pendingTasks={0} />
                )}
                <div className="rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-8 text-center">
                    <svg className="w-12 h-12 text-amber-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    <p className="text-amber-800 dark:text-amber-300 font-semibold text-lg">Your account is not linked to a resource yet</p>
                    <p className="text-amber-600 dark:text-amber-500 text-sm mt-2">Contact your administrator to link your account. In the meantime, you can use the quick actions above to navigate the app.</p>
                </div>
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

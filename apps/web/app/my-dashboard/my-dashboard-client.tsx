'use client';

import { useEffect, useState, useCallback } from 'react';
import { meDashboardApi, MeDashboard } from '@/lib/api';
import { useAuth } from '@/components/providers/AuthProvider';
import { MyStatCards } from '@/components/my-dashboard/MyStatCards';
import { TaskDistributionChart } from '@/components/my-dashboard/TaskDistributionChart';
import { TasksByProjectTable } from '@/components/my-dashboard/TasksByProjectTable';
import { MyBugsTable } from '@/components/my-dashboard/MyBugsTable';

export function MyDashboardClient() {
    const [data, setData] = useState<MeDashboard | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { user } = useAuth();
    const isAdminOrManager = user?.role === 'admin' || user?.role === 'manager';

    const load = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const result = await meDashboardApi.get();
            setData(result);
        } catch (err: any) {
            if (err?.status === 404 || err?.message?.includes('No resource')) {
                setError('no-resource');
            } else {
                setError('generic');
            }
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    if (isLoading) {
        return (
            <div className="space-y-6 animate-pulse">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="glass-card p-6 h-24 rounded-xl bg-slate-100 dark:bg-slate-800" />
                    ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="glass-card h-48 rounded-xl bg-slate-100 dark:bg-slate-800" />
                    <div className="md:col-span-2 glass-card h-48 rounded-xl bg-slate-100 dark:bg-slate-800" />
                </div>
                <div className="glass-card h-64 rounded-xl bg-slate-100 dark:bg-slate-800" />
            </div>
        );
    }

    if (error === 'no-resource') {
        return (
            <div className="rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-6 text-center">
                <p className="text-amber-800 dark:text-amber-300 font-medium">Your account is not linked to a resource yet.</p>
                <p className="text-amber-600 dark:text-amber-500 text-sm mt-1">Contact your administrator to link your account.</p>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-6 text-center">
                <p className="text-red-700 dark:text-red-400 font-medium">Failed to load your dashboard.</p>
                <button onClick={load} className="mt-3 text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                    Try again
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-700">
            {isAdminOrManager && (
                <div className="flex items-center gap-3 rounded-2xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/30 px-5 py-3">
                    <svg className="w-4 h-4 text-indigo-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-indigo-700 dark:text-indigo-300">
                        This is your personal view.{' '}
                        <a href="/dashboard" className="font-semibold underline hover:text-indigo-900 dark:hover:text-indigo-100">
                            Visit Dashboard
                        </a>{' '}
                        for organisation-wide analytics.
                    </p>
                </div>
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

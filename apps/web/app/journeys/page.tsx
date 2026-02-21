'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { myJourneysApi, AssignedJourney } from '../../src/lib/api';

export default function JourneysPage() {
    const [journeys, setJourneys] = useState<AssignedJourney[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        async function load() {
            try {
                const data = await myJourneysApi.list();
                setJourneys(data);
            } catch (err) {
                console.error('Failed to load journeys:', err);
            } finally {
                setIsLoading(false);
            }
        }
        load();
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
            </div>
        );
    }

    if (journeys.length === 0) {
        return (
            <div className="text-center py-20">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">No Journeys Assigned</h3>
                <p className="text-slate-500 dark:text-slate-400 mt-1">You don&apos;t have any journeys assigned yet. Your administrator will assign them when your account is activated.</p>
            </div>
        );
    }

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My Journeys</h1>
                <p className="text-slate-500 dark:text-slate-400 mt-1">Track your onboarding progress and complete assigned tasks.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {journeys.map((journey) => (
                    <button
                        key={journey.id}
                        onClick={() => router.push(`/journeys/${journey.journey_id}`)}
                        className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-all group"
                    >
                        <div className="flex items-start justify-between mb-3">
                            <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center">
                                <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                </svg>
                            </div>
                            <StatusBadge status={journey.status} />
                        </div>

                        <h3 className="font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {journey.title}
                        </h3>
                        {journey.description && (
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{journey.description}</p>
                        )}

                        <div className="mt-4">
                            <div className="flex items-center justify-between text-sm mb-1.5">
                                <span className="text-slate-500 dark:text-slate-400">Progress</span>
                                <div className="flex items-center gap-2">
                                    {(journey.total_xp || 0) > 0 && (
                                        <span className="text-xs font-medium text-violet-600 dark:text-violet-400">{journey.total_xp} XP</span>
                                    )}
                                    <span className="font-medium text-slate-700 dark:text-slate-300">
                                        {journey.progress.mandatory_completed}/{journey.progress.mandatory_tasks} tasks
                                    </span>
                                </div>
                            </div>
                            <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all ${
                                        journey.progress.completion_pct === 100
                                            ? 'bg-emerald-500'
                                            : 'bg-indigo-500'
                                    }`}
                                    style={{ width: `${journey.progress.completion_pct}%` }}
                                />
                            </div>
                            <p className="text-xs text-slate-400 mt-1">{journey.progress.completion_pct}% complete</p>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const config = {
        assigned: { label: 'Not Started', color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
        in_progress: { label: 'In Progress', color: 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400' },
        completed: { label: 'Completed', color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400' },
    }[status] || { label: status, color: 'bg-slate-100 text-slate-600' };

    return (
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${config.color}`}>
            {config.label}
        </span>
    );
}

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { myJourneysApi, AssignedJourney } from '../../src/lib/api';
import { useAuth } from '../../src/components/providers/AuthProvider';

export default function JourneysPage() {
    const [journeys, setJourneys] = useState<AssignedJourney[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();
    const { userStatus } = useAuth();
    const isActive = userStatus === 'ACTIVE';

    useEffect(() => {
        (async () => {
            try {
                const data = await myJourneysApi.list();
                setJourneys(data);
            } catch (err) {
                console.error('Failed to load journeys:', err);
            } finally {
                setIsLoading(false);
            }
        })();
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
            </div>
        );
    }

    return (
        <div>
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-1">
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My Journeys</h1>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'}`}>
                        {isActive ? 'Active' : 'In Preparation'}
                    </span>
                </div>
                <p className="text-slate-500 dark:text-slate-400">Track your onboarding progress and complete assigned tasks.</p>
            </div>

            {journeys.length === 0 ? (
                <div className="text-center py-20">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">No Journeys Assigned</h3>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">You don&apos;t have any journeys assigned yet.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {journeys.map(j => (
                        <div
                            key={j.id}
                            onClick={() => router.push(`/journeys/${j.journey_id}`)}
                            className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 cursor-pointer hover:border-indigo-400 transition-colors"
                        >
                            <p className="font-semibold text-slate-900 dark:text-white">{j.title}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

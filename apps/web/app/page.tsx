'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../src/components/providers/AuthProvider';
import { getLandingPage } from '../src/config/routes';

export default function Home() {
    const { user, permissions, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (loading) return;

        // Use the preference-aware getLandingPage for dynamic redirect
        const landing = getLandingPage(user, permissions);
        router.replace(landing);
    }, [user, permissions, loading, router]);

    // Show minimal loading state while determining redirect
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
            <div className="flex flex-col items-center gap-3">
                <svg className="animate-spin h-8 w-8 text-indigo-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-sm text-slate-500 dark:text-slate-400">Redirecting...</p>
            </div>
        </div>
    );
}

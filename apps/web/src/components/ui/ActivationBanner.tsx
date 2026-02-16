'use client';

import { useState } from 'react';
import { useAuth } from '../providers/AuthProvider';

export function ActivationBanner() {
    const { user, refreshUser } = useAuth();
    const [dismissed, setDismissed] = useState(false);
    const [checking, setChecking] = useState(false);

    if (!user || user.activated || dismissed) return null;

    const handleCheck = async () => {
        setChecking(true);
        await refreshUser();
        setChecking(false);
    };

    return (
        <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                        <svg className="w-4 h-4 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                        Your account is pending activation. You can use <strong>My Tasks</strong> while waiting. An administrator will activate your account soon.
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                        onClick={handleCheck}
                        disabled={checking}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900 transition-colors disabled:opacity-50"
                    >
                        {checking ? 'Checking...' : 'Check status'}
                    </button>
                    <button
                        onClick={() => setDismissed(true)}
                        className="p-1 rounded text-amber-400 hover:text-amber-600 dark:text-amber-600 dark:hover:text-amber-400 transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
}

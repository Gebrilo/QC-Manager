'use client';

import { useState } from 'react';

interface SyncPanelProps {
    status?: 'synced' | 'pending' | 'failed' | 'standalone';
    lastAttemptedAt?: string | null;
    error?: string | null;
    tuleapUrl?: string | null;
    artifactType?: string;
    artifactId?: string;
    syncFn?: (id: string) => Promise<unknown>;
}

function relativeTime(date: string | null | undefined): string {
    if (!date) return '';
    const diff = Date.now() - new Date(date).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

export function SyncPanel({ status, lastAttemptedAt, error, tuleapUrl, artifactId, syncFn }: SyncPanelProps) {
    const [retrying, setRetrying] = useState(false);

    if (!status || status === 'standalone') return null;

    const handleRetry = async () => {
        if (!artifactId || retrying) return;
        setRetrying(true);
        try {
            if (syncFn) {
                await syncFn(artifactId);
            }
            window.location.reload();
        } catch {
            setRetrying(false);
        }
    };

    if (status === 'synced') {
        return (
            <div className="glass-card rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">Synced to Tuleap</p>
                        {lastAttemptedAt && (
                            <p className="text-xs text-slate-400">{relativeTime(lastAttemptedAt)}</p>
                        )}
                    </div>
                </div>
                {tuleapUrl && (
                    <a href={tuleapUrl} target="_blank" rel="noopener noreferrer"
                       className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
                        View in Tuleap &rarr;
                    </a>
                )}
            </div>
        );
    }

    if (status === 'failed') {
        return (
            <div className="glass-card rounded-2xl p-5 space-y-3 border border-rose-200 dark:border-rose-900/40">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-rose-600 dark:text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">Sync failed</p>
                        {lastAttemptedAt && (
                            <p className="text-xs text-slate-400">Last attempt: {relativeTime(lastAttemptedAt)}</p>
                        )}
                    </div>
                </div>
                {error && (
                    <p className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 rounded-lg p-2.5 break-words">{error}</p>
                )}
                <button
                    onClick={handleRetry}
                    disabled={retrying}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 hover:bg-rose-200 dark:hover:bg-rose-900/50 disabled:opacity-50 transition-colors"
                >
                    {retrying ? 'Retrying\u2026' : 'Retry sync'}
                </button>
            </div>
        );
    }

    if (status === 'pending') {
        return (
            <div className="glass-card rounded-2xl p-5">
                <div className="flex items-center gap-2.5">
                    <svg className="w-4 h-4 text-slate-400 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Syncing&hellip;</p>
                </div>
            </div>
        );
    }

    return null;
}

'use client';

interface SyncBadgeProps {
    status?: 'synced' | 'pending' | 'failed' | 'standalone';
    lastAttemptedAt?: string | null;
    error?: string | null;
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

export function SyncBadge({ status, lastAttemptedAt, error }: SyncBadgeProps) {
    if (!status || status === 'standalone') return null;

    if (status === 'synced') {
        const tip = lastAttemptedAt ? `Synced \u00b7 ${relativeTime(lastAttemptedAt)}` : 'Synced';
        return (
            <span title={tip} className="inline-flex items-center ml-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </span>
        );
    }

    if (status === 'failed') {
        const tip = error ? `Sync failed: ${error.slice(0, 120)}` : 'Sync failed';
        return (
            <span title={tip} className="inline-flex items-center ml-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
            </span>
        );
    }

    if (status === 'pending') {
        return (
            <span title="Syncing\u2026" className="inline-flex items-center ml-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-400 animate-pulse" />
            </span>
        );
    }

    return null;
}

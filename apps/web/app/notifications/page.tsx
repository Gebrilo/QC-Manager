'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Bell, Check, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { notificationsApi, type AppNotification } from '@/lib/api';
import { useToastSafe } from '@/components/ui/Toast';
import { TYPE_ICONS } from '@/components/layout/NotificationBell';

const PAGE_SIZE = 20;

const ENTITY_TYPE_OPTIONS = [
    { value: '', label: 'All types' },
    { value: 'bug', label: 'Bugs' },
    { value: 'task', label: 'Tasks' },
    { value: 'project', label: 'Projects' },
    { value: 'test_case', label: 'Test cases' },
    { value: 'test_suite', label: 'Test suites' },
    { value: 'test_execution', label: 'Test runs' },
    { value: 'user_story', label: 'User stories' },
    { value: 'user', label: 'Users' },
    { value: 'resource', label: 'Resources' },
    { value: 'team', label: 'Teams' },
    { value: 'tuleap_sync', label: 'Tuleap sync' },
];

function formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHrs < 24) return `${diffHrs}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function NotificationsContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { token, user } = useAuth();
    const toast = useToastSafe();

    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(() => Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1));
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);

    const entityType = searchParams.get('entity_type') || '';
    const typeFilter = searchParams.get('type') || '';
    const unreadOnly = searchParams.get('unread_only') === 'true';

    const fetchPage = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        try {
            const res = await notificationsApi.list({
                page,
                limit: PAGE_SIZE,
                entity_type: entityType || undefined,
                type: typeFilter || undefined,
                unread_only: unreadOnly || undefined,
            });
            setNotifications(res.notifications);
            setUnreadCount(res.unread_count);
            setTotal(res.total);
            setTotalPages(res.total_pages);
        } catch (err: any) {
            toast.error(err?.message || 'Failed to load notifications.');
        } finally {
            setLoading(false);
        }
    }, [token, page, entityType, typeFilter, unreadOnly, toast]);

    useEffect(() => {
        fetchPage();
    }, [fetchPage]);

    const updateUrl = useCallback((next: Record<string, string | number | boolean | undefined>) => {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(next)) {
            if (v === undefined || v === null || v === '' || v === false) continue;
            params.set(k, String(v));
        }
        const qs = params.toString();
        router.replace(`/notifications${qs ? `?${qs}` : ''}`, { scroll: false });
    }, [router]);

    const handleFilterChange = (key: 'entity_type' | 'unread_only', value: string | boolean) => {
        setPage(1);
        const next: Record<string, string | number | boolean | undefined> = {
            entity_type: entityType,
            type: typeFilter || undefined,
            unread_only: unreadOnly || undefined,
            page: 1,
        };
        if (key === 'entity_type') {
            next.entity_type = value || undefined;
        } else if (key === 'unread_only') {
            next.unread_only = value || undefined;
        }
        updateUrl(next);
    };

    const handlePageChange = (newPage: number) => {
        if (newPage < 1 || newPage > totalPages) return;
        setPage(newPage);
        updateUrl({
            entity_type: entityType || undefined,
            type: typeFilter || undefined,
            unread_only: unreadOnly || undefined,
            page: newPage,
        });
    };

    const markAsRead = async (id: string) => {
        try {
            await notificationsApi.markRead(id);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch {
            toast.error('Failed to mark as read.');
        }
    };

    const openNotification = async (n: AppNotification) => {
        if (!n.read) markAsRead(n.id);
        if (!n.entity_type || !n.entity_id) return;
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/notifications/${n.id}/open`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                toast.error('Could not open this item.');
                return;
            }
            const data = await res.json();
            if (data.status === 'ok' && data.href) {
                router.push(data.href);
            } else if (data.status === 'forbidden') {
                toast.error('You no longer have access to this item.');
            } else if (data.status === 'gone') {
                toast.info('This item is no longer available.');
            }
        } catch {
            toast.error('Could not open this item.');
        }
    };

    const deleteNotification = async (id: string, wasUnread: boolean) => {
        try {
            await notificationsApi.delete(id);
            setNotifications(prev => prev.filter(n => n.id !== id));
            if (wasUnread) setUnreadCount(prev => Math.max(0, prev - 1));
            setTotal(prev => Math.max(0, prev - 1));
            toast.success('Notification deleted.');
        } catch {
            toast.error('Failed to delete notification.');
        }
    };

    const markAllRead = async () => {
        try {
            await notificationsApi.markAllRead();
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
            setUnreadCount(0);
            toast.success('All notifications marked as read.');
        } catch {
            toast.error('Failed to mark all as read.');
        }
    };

    return (
        <div className="space-y-6 px-4 sm:px-0">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Notifications</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                        {total === 0
                            ? 'You have no notifications yet'
                            : `${total.toLocaleString()} notification${total === 1 ? '' : 's'}${unreadCount > 0 ? ` · ${unreadCount} unread` : ''}`}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                        <button
                            onClick={markAllRead}
                            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-950/50 rounded-lg transition-colors"
                        >
                            <Check className="w-4 h-4" />
                            Mark all read
                        </button>
                    )}
                </div>
            </div>

            {/* Filter bar */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Type:
                    </label>
                    <select
                        value={entityType}
                        onChange={(e) => handleFilterChange('entity_type', e.target.value)}
                        className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    >
                        {ENTITY_TYPE_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </div>

                {typeFilter && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        Notification type: {typeFilter}
                        <button
                            onClick={() => { setPage(1); updateUrl({ entity_type: entityType || undefined, page: 1, unread_only: unreadOnly || undefined }); }}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            aria-label="Clear type filter"
                        >
                            ✕
                        </button>
                    </span>
                )}

                <div className="flex items-center gap-2 ml-auto">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 cursor-pointer flex items-center gap-2 select-none">
                        <input
                            type="checkbox"
                            checked={unreadOnly}
                            onChange={(e) => handleFilterChange('unread_only', e.target.checked)}
                            className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500/50"
                        />
                        Unread only
                    </label>
                </div>
            </div>

            {/* Notification list */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <svg className="animate-spin h-8 w-8 text-indigo-500" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                </div>
            ) : notifications.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-20 flex flex-col items-center justify-center text-center">
                    <Bell className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-3" strokeWidth={1.25} />
                    <p className="text-base font-medium text-slate-700 dark:text-slate-300">No notifications</p>
                    <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
                        {entityType || unreadOnly
                            ? 'Try clearing the filters to see all notifications.'
                            : "You're all caught up!"}
                    </p>
                    {(entityType || unreadOnly) && (
                        <button
                            onClick={() => { setPage(1); router.replace('/notifications', { scroll: false }); }}
                            className="mt-4 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                            Clear filters
                        </button>
                    )}
                </div>
            ) : (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                    {notifications.map(n => {
                        const typeInfo = TYPE_ICONS[n.type] || TYPE_ICONS.info;
                        return (
                            <div
                                key={n.id}
                                className={`flex items-start gap-4 p-4 group transition-colors ${!n.read
                                        ? 'bg-indigo-50/40 dark:bg-indigo-950/10'
                                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                                    }`}
                            >
                                {/* Icon */}
                                <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 text-base ${typeInfo.color}`}>
                                    {typeInfo.icon}
                                </div>

                                {/* Content (clickable) */}
                                <div
                                    className="flex-1 min-w-0 cursor-pointer"
                                    onClick={() => openNotification(n)}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className={`text-sm leading-snug ${!n.read ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                                                {n.title}
                                            </p>
                                            {n.message && (
                                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                                                    {n.message}
                                                </p>
                                            )}
                                            <div className="flex items-center gap-2 mt-1.5">
                                                <p className="text-xs text-slate-400 dark:text-slate-500">{formatTime(n.created_at)}</p>
                                                {n.entity_type && (
                                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                                                        {n.entity_type}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Unread indicator */}
                                        {!n.read && (
                                            <div className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0 mt-1.5" />
                                        )}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                    {!n.read && (
                                        <button
                                            onClick={() => markAsRead(n.id)}
                                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
                                            title="Mark as read"
                                        >
                                            <Check className="w-4 h-4" />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => deleteNotification(n.id, !n.read)}
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                                        title="Delete"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Pagination */}
            {!loading && total > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Page {page} of {totalPages} · showing {notifications.length} of {total.toLocaleString()}
                    </p>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => handlePageChange(page - 1)}
                            disabled={page <= 1}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            Previous
                        </button>
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                            .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                            .reduce<(number | 'ellipsis')[]>((acc, p, i, arr) => {
                                if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('ellipsis');
                                acc.push(p);
                                return acc;
                            }, [])
                            .map((p, i) => p === 'ellipsis' ? (
                                <span key={`e-${i}`} className="px-2 text-slate-400">…</span>
                            ) : (
                                <button
                                    key={p}
                                    onClick={() => handlePageChange(p as number)}
                                    className={`min-w-[2rem] px-2 py-1.5 text-sm font-medium rounded-lg transition-colors ${p === page
                                            ? 'bg-indigo-600 text-white'
                                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                                        }`}
                                >
                                    {p}
                                </button>
                            ))}
                        <button
                            onClick={() => handlePageChange(page + 1)}
                            disabled={page >= totalPages}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            Next
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            <p className="text-xs text-slate-400 dark:text-slate-500">
                <Link href="/dashboard" className="hover:underline">← Back to dashboard</Link>
            </p>
        </div>
    );
}

export default function NotificationsPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center py-20">
                <svg className="animate-spin h-8 w-8 text-indigo-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
            </div>
        }>
            <NotificationsContent />
        </Suspense>
    );
}

'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Bell, Check, Trash2, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { notificationsApi, type AppNotification } from '@/lib/api';
import { useToastSafe } from '@/components/ui/Toast';
import { NotifTypeIcon, getNotifType, TINT_PILL } from '@/components/layout/notificationTypes';

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

/** Pill / toggle switch for the "unread only" filter. */
function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
    return (
        <button onClick={onClick} className="flex items-center gap-2.5 group" type="button">
            <span
                className={`relative w-9 h-5 rounded-full transition-colors ${on ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-700'}`}
            >
                <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : ''}`}
                />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">
                {label}
            </span>
        </button>
    );
}

function NotificationsContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { token } = useAuth();
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
        <div className="max-w-4xl mx-auto space-y-5">
            {/* Header */}
            <div className="flex items-end justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Notifications</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
                        {total === 0
                            ? 'You have no notifications yet'
                            : <>
                                {total.toLocaleString()} {total === 1 ? 'notification' : 'notifications'}
                                {unreadCount > 0 && <span className="text-slate-400 dark:text-slate-500"> · {unreadCount} unread</span>}
                            </>}
                    </p>
                </div>
                {unreadCount > 0 && (
                    <button
                        onClick={markAllRead}
                        className="hidden sm:inline-flex items-center gap-1.5 h-10 px-4 rounded-lg text-[13px] font-semibold text-slate-600 dark:text-slate-300 bg-white/60 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 hover:bg-white dark:hover:bg-slate-800 backdrop-blur-md transition-colors"
                    >
                        <Check className="w-4 h-4" /> Mark all read
                    </button>
                )}
            </div>

            {/* Filter bar */}
            <div className="glass-card rounded-2xl px-5 py-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">Type</span>
                    <select
                        value={entityType}
                        onChange={(e) => handleFilterChange('entity_type', e.target.value)}
                        className="h-10 pl-3.5 pr-9 rounded-lg bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-[13px] font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
                    >
                        {ENTITY_TYPE_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>

                    {typeFilter && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {getNotifType(typeFilter).label}: {typeFilter}
                            <button
                                onClick={() => { setPage(1); updateUrl({ entity_type: entityType || undefined, page: 1, unread_only: unreadOnly || undefined }); }}
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                aria-label="Clear type filter"
                            >
                                ✕
                            </button>
                        </span>
                    )}
                </div>

                <Toggle on={unreadOnly} onClick={() => handleFilterChange('unread_only', !unreadOnly)} label="Unread only" />
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
                <div className="glass-card rounded-2xl py-20 flex flex-col items-center justify-center text-center">
                    <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800/60 flex items-center justify-center text-slate-400 mb-4">
                        <Bell className="w-6 h-6" strokeWidth={1.5} />
                    </div>
                    <p className="text-[15px] font-semibold text-slate-700 dark:text-slate-300">
                        {entityType || unreadOnly || typeFilter ? 'No matching notifications' : "You're all caught up"}
                    </p>
                    <p className="text-[13px] text-slate-400 dark:text-slate-500 mt-1">
                        {entityType || unreadOnly || typeFilter
                            ? 'Try clearing the filters to see everything.'
                            : 'New notifications will show up here.'}
                    </p>
                    {(entityType || unreadOnly || typeFilter) && (
                        <button
                            onClick={() => { setPage(1); router.replace('/notifications', { scroll: false }); }}
                            className="mt-4 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                            Clear filters
                        </button>
                    )}
                </div>
            ) : (
                <div className="glass-card rounded-2xl overflow-hidden divide-y divide-slate-200/60 dark:divide-slate-700/30">
                    {notifications.map(n => {
                        const meta = getNotifType(n.type);
                        return (
                            <div
                                key={n.id}
                                className={`group relative flex items-start gap-4 px-5 py-4 transition-colors ${!n.read
                                    ? 'bg-indigo-500/[0.06] dark:bg-indigo-500/[0.07] hover:bg-indigo-500/[0.1]'
                                    : 'hover:bg-slate-100/60 dark:hover:bg-slate-800/40'
                                    }`}
                            >
                                {/* Unread accent bar */}
                                {!n.read && <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-indigo-500" />}

                                {/* Type icon */}
                                <NotifTypeIcon type={n.type} />

                                {/* Content (clickable) */}
                                <div
                                    className="min-w-0 flex-1 py-0.5 cursor-pointer"
                                    onClick={() => openNotification(n)}
                                >
                                    <div className="flex items-center gap-2.5 flex-wrap">
                                        <h3 className={`text-[15px] leading-snug ${!n.read ? 'font-semibold text-slate-900 dark:text-white' : 'font-medium text-slate-700 dark:text-slate-300'}`}>
                                            {n.title}
                                        </h3>
                                        {!n.read && <span className="w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0" />}
                                        <span className={`text-[10px] font-bold uppercase tracking-[0.08em] px-2 py-0.5 rounded-md ${TINT_PILL[meta.tint]}`}>
                                            {meta.label}
                                        </span>
                                    </div>
                                    {n.message && (
                                        <p dir="auto" className="text-[13.5px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed line-clamp-2 max-w-3xl">
                                            {n.message}
                                        </p>
                                    )}
                                    <div className="flex items-center gap-2 mt-1.5">
                                        <span className="text-[12px] font-medium text-slate-400 dark:text-slate-500">{formatTime(n.created_at)}</span>
                                        {n.entity_type && (
                                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                                                {n.entity_type}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Row actions */}
                                <div className="self-center flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                    {!n.read && (
                                        <button
                                            onClick={() => markAsRead(n.id)}
                                            className="p-2 rounded-lg text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
                                            title="Mark as read"
                                        >
                                            <Check className="w-[18px] h-[18px]" />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => deleteNotification(n.id, !n.read)}
                                        className="p-2 rounded-lg text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                                        title="Delete"
                                    >
                                        <Trash2 className="w-[18px] h-[18px]" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Pagination */}
            {!loading && total > 0 && (
                <div className="flex items-center justify-between">
                    <p className="text-[13px] text-slate-400 dark:text-slate-500">
                        Page {page} of {totalPages} · showing {notifications.length} of {total.toLocaleString()}
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => handlePageChange(page - 1)}
                            disabled={page <= 1}
                            className="inline-flex items-center gap-1 h-9 px-3 rounded-lg text-[13px] font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronLeft className="w-[15px] h-[15px]" /> Previous
                        </button>
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                            .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                            .reduce<(number | 'ellipsis')[]>((acc, p, i, arr) => {
                                if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('ellipsis');
                                acc.push(p);
                                return acc;
                            }, [])
                            .map((p, i) => p === 'ellipsis' ? (
                                <span key={`e-${i}`} className="px-1.5 text-slate-400">…</span>
                            ) : (
                                <button
                                    key={p}
                                    onClick={() => handlePageChange(p as number)}
                                    className={`w-9 h-9 rounded-lg text-[13px] font-bold transition-colors ${p === page
                                        ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30'
                                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                                        }`}
                                >
                                    {p}
                                </button>
                            ))}
                        <button
                            onClick={() => handlePageChange(page + 1)}
                            disabled={page >= totalPages}
                            className="inline-flex items-center gap-1 h-9 px-3 rounded-lg text-[13px] font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            Next <ChevronRight className="w-[15px] h-[15px]" />
                        </button>
                    </div>
                </div>
            )}

            <div className="pt-2">
                <Link href="/dashboard" className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-400 dark:text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors">
                    <ArrowLeft className="w-[15px] h-[15px]" /> Back to dashboard
                </Link>
            </div>
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

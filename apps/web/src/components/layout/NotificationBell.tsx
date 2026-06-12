'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Bell, Check, Trash2, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../providers/AuthProvider';
import { supabase } from '@/lib/supabase';
import { useToastSafe } from '../ui/Toast';
import { NotifTypeIcon } from './notificationTypes';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Notification {
    id: string;
    type: string;
    title: string;
    message: string;
    read: boolean;
    metadata: Record<string, any>;
    created_at: string;
    entity_type?: string | null;
    entity_id?: string | null;
    action?: string | null;
}

export function NotificationBell() {
    const { token, user } = useAuth();
    const router = useRouter();
    const toast = useToastSafe();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const fetchNotifications = useCallback(async () => {
        if (!token) return;
        try {
            const res = await fetch(`${API_URL}/notifications?limit=20`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return;
            const data = await res.json();
            setNotifications(data.notifications);
            setUnreadCount(data.unread_count);
        } catch {
            // silent fail
        }
    }, [token]);

    // Poll for notifications
    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 30000);
        return () => clearInterval(interval);
    }, [fetchNotifications]);

    // Supabase Realtime: update badge instantly when new notifications arrive
    useEffect(() => {
        if (!supabase || !user?.id) return;

        const channel = supabase
            .channel(`notifications-${user.id}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notification',
                    filter: `user_id=eq.${user.id}`,
                },
                () => {
                    fetchNotifications();
                }
            )
            .subscribe();

        return () => {
            supabase!.removeChannel(channel);
        };
    }, [user?.id, fetchNotifications]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const markAsRead = async (id: string) => {
        try {
            await fetch(`${API_URL}/notifications/${id}/read`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}` },
            });
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch {
            // silent fail
        }
    };

    const openNotification = async (n: Notification) => {
        if (!n.read) markAsRead(n.id);
        if (!n.entity_type || !n.entity_id) return; // informational, non-navigable
        setIsOpen(false);
        try {
            const res = await fetch(`${API_URL}/notifications/${n.id}/open`, {
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

    const markAllRead = async () => {
        try {
            await fetch(`${API_URL}/notifications/read-all`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}` },
            });
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
            setUnreadCount(0);
        } catch {
            // silent fail
        }
    };

    const deleteNotification = async (id: string, wasUnread: boolean) => {
        try {
            await fetch(`${API_URL}/notifications/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            setNotifications(prev => prev.filter(n => n.id !== id));
            if (wasUnread) setUnreadCount(prev => Math.max(0, prev - 1));
        } catch {
            // silent fail
        }
    };

    const formatTime = (dateStr: string) => {
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
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => {
                    setIsOpen(!isOpen);
                    if (!isOpen) fetchNotifications();
                }}
                className={`relative p-2.5 rounded-lg transition-colors ${isOpen
                    ? 'bg-slate-100 dark:bg-slate-800/70 text-slate-800 dark:text-white'
                    : 'text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                aria-label="Notifications"
            >
                <Bell className="w-[18px] h-[18px]" strokeWidth={1.75} />
                {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 h-4 min-w-[16px] px-1 bg-indigo-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white ring-2 ring-white dark:ring-slate-900">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 top-full mt-2 w-96 max-h-[480px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 rounded-2xl shadow-2xl shadow-black/20 dark:shadow-black/50 z-50 overflow-hidden flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-200/70 dark:border-slate-700/50">
                        <div className="flex items-center gap-2">
                            <h3 className="text-[15px] font-bold text-slate-900 dark:text-white">Notifications</h3>
                            {unreadCount > 0 && (
                                <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-300">
                                    {unreadCount} new
                                </span>
                            )}
                        </div>
                        {unreadCount > 0 && (
                            <button
                                onClick={markAllRead}
                                className="text-[12px] font-medium text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
                            >
                                Mark all read
                            </button>
                        )}
                    </div>

                    {/* Notification List */}
                    <div className="overflow-y-auto flex-1 divide-y divide-slate-100 dark:divide-slate-800/70">
                        {notifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 px-4">
                                <Bell className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" strokeWidth={1.5} />
                                <p className="text-sm text-slate-400 dark:text-slate-500">No notifications yet</p>
                            </div>
                        ) : (
                            notifications.map(n => (
                                <div
                                    key={n.id}
                                    className={`group relative flex items-start gap-3 px-4 py-3 transition-colors ${!n.read
                                        ? 'bg-indigo-500/[0.06] dark:bg-indigo-500/[0.07] hover:bg-indigo-500/[0.1]'
                                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                                        }`}
                                >
                                    {!n.read && <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-indigo-400" />}

                                    {/* Type icon */}
                                    <NotifTypeIcon type={n.type} size="sm" />

                                    {/* Content */}
                                    <div
                                        className="flex-1 min-w-0 cursor-pointer"
                                        onClick={() => openNotification(n)}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <p className={`text-[13px] truncate ${!n.read ? 'font-semibold text-slate-900 dark:text-slate-100' : 'font-medium text-slate-700 dark:text-slate-300'}`}>
                                                {n.title}
                                            </p>
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                <span className="text-[11px] text-slate-400 dark:text-slate-500 group-hover:opacity-0 transition-opacity">
                                                    {formatTime(n.created_at)}
                                                </span>
                                                <div className="absolute right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {!n.read && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); markAsRead(n.id); }}
                                                            className="p-1 rounded text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                                            title="Mark as read"
                                                        >
                                                            <Check className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); deleteNotification(n.id, !n.read); }}
                                                        className="p-1 rounded text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                        {n.message && (
                                            <p dir="auto" className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2 leading-snug">
                                                {n.message}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Footer: View all */}
                    {notifications.length > 0 && (
                        <Link
                            href="/notifications"
                            onClick={() => setIsOpen(false)}
                            className="flex items-center justify-center gap-1.5 px-4 py-3 text-center text-[13px] font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 border-t border-slate-200/70 dark:border-slate-700/50 transition-colors"
                        >
                            View all notifications <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                    )}
                </div>
            )}
        </div>
    );
}

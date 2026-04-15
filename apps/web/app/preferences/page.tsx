'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { fetchApi, profileApi, UserPreferences } from '../../src/lib/api';
import { useTheme } from '../../src/components/providers/ThemeProvider';
import { useAuth } from '../../src/components/providers/AuthProvider';
import { getRouteConfig, getNavbarRoutes } from '../../src/config/routes';

interface UserProfile {
    id: string;
    name: string;
    display_name: string | null;
    email: string;
    role: string;
    preferences: UserPreferences;
    avatar_url: string | null;
    avatar_type: 'initials' | 'preset' | 'upload' | null;
}

const DEFAULT_PREFS: Required<UserPreferences> = {
    theme: 'light',
    quick_nav_visible: true,
    default_page: '/my-tasks',
    display_density: 'comfortable',
    timezone: 'UTC',
    language: 'en',
    show_profile_to_team: true,
    menu_order: [],
};

const inputCls = 'w-full h-9 border border-slate-200 dark:border-slate-700 rounded-lg px-3 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50';
const btnPrimary = 'px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 transition-colors disabled:opacity-50';

// All possible landing page options with their route paths and labels
const LANDING_PAGE_OPTIONS = [
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/my-tasks', label: 'My Tasks' },
    { path: '/journeys', label: 'My Journeys' },
    { path: '/tasks', label: 'Tasks' },
    { path: '/projects', label: 'Projects' },
    { path: '/resources', label: 'Resources' },
    { path: '/governance', label: 'Governance' },
    { path: '/test-executions', label: 'Test Runs' },
    { path: '/reports', label: 'Reports' },
    { path: '/task-history', label: 'Task History' },
];

export default function PreferencesPage() {
    const { setTheme } = useTheme();
    const { user: authUser, permissions, hasPermission, isAdmin, refreshUser } = useAuth();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    // Filter landing page options to only show pages the user can access
    const allowedLandingPages = useMemo(() => {
        return LANDING_PAGE_OPTIONS.filter(opt => {
            const route = getRouteConfig(opt.path);
            if (!route) return false;
            // Admins can see all pages
            if (isAdmin) return true;
            // Check admin-only restriction
            if (route.adminOnly) return false;
            // Check activation requirement
            if (route.requiresActivation && !authUser?.activated) return false;
            // Check permission
            if (route.permission && !hasPermission(route.permission)) return false;
            return true;
        });
    }, [authUser, permissions, isAdmin, hasPermission]);

    const accessibleNavRoutes = useMemo(() => {
        return getNavbarRoutes().filter(route => {
            if (route.adminOnly && !isAdmin) return false;
            if (route.requiresActivation && !authUser?.activated) return false;
            if (route.permission && !hasPermission(route.permission)) return false;
            return true;
        });
    }, [isAdmin, authUser, hasPermission]);

    const [displayName, setDisplayName] = useState('');
    const [profileSaving, setProfileSaving] = useState(false);
    const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const [prefs, setPrefs] = useState<Required<UserPreferences>>(DEFAULT_PREFS);
    const [prefSaving, setPrefSaving] = useState(false);
    const [prefMsg, setPrefMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const [menuOrder, setMenuOrder] = useState<string[]>([]);
    const [navSaving, setNavSaving] = useState(false);
    const [navMsg, setNavMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
    const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
    const [pwSending, setPwSending] = useState(false);
    const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [avatarSaving, setAvatarSaving] = useState(false);
    const [avatarMsg, setAvatarMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchApi<{ user: UserProfile }>('/auth/me')
            .then(data => {
                setProfile(data.user);
                setDisplayName(data.user.display_name || data.user.name || '');
                setPrefs({ ...DEFAULT_PREFS, ...(data.user.preferences || {}) });
                const _apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.gebrils.cloud';
                const rawUrl = data.user.avatar_url || null;
                setAvatarUrl(rawUrl?.startsWith('/uploads/') ? `${_apiUrl}${rawUrl}` : rawUrl);
                const savedOrder: string[] = data.user.preferences?.menu_order || [];
                const initialOrder = [
                    ...savedOrder.filter(p => accessibleNavRoutes.some(r => r.path === p)),
                    ...accessibleNavRoutes
                        .map(r => r.path)
                        .filter(p => !savedOrder.includes(p)),
                ];
                setMenuOrder(initialOrder);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [accessibleNavRoutes]);

    // If the saved default_page is no longer accessible, reset to /dashboard
    useEffect(() => {
        if (loading) return;
        const allowed = allowedLandingPages.map(o => o.path);
        if (prefs.default_page && !allowed.includes(prefs.default_page)) {
            setPrefs(p => ({ ...p, default_page: '/my-tasks' }));
        }
    }, [allowedLandingPages, loading]); // eslint-disable-line react-hooks/exhaustive-deps

    const saveProfile = async () => {
        setProfileSaving(true);
        setProfileMsg(null);
        try {
            await profileApi.update({ display_name: displayName });
            setProfileMsg({ type: 'success', text: 'Display name updated!' });
        } catch (err: any) {
            setProfileMsg({ type: 'error', text: err.message || 'Failed to save' });
        } finally { setProfileSaving(false); }
    };

    const savePrefs = async () => {
        setPrefSaving(true);
        setPrefMsg(null);
        try {
            await profileApi.update({ preferences: prefs });
            setPrefMsg({ type: 'success', text: 'Preferences saved!' });
        } catch (err: any) {
            setPrefMsg({ type: 'error', text: err.message || 'Failed to save' });
        } finally { setPrefSaving(false); }
    };

    const saveNavOrder = async () => {
        setNavSaving(true);
        setNavMsg(null);
        try {
            await profileApi.update({ preferences: { menu_order: menuOrder } });
            await refreshUser();
            setNavMsg({ type: 'success', text: 'Navigation order saved!' });
        } catch (err: any) {
            setNavMsg({ type: 'error', text: err.message || 'Failed to save' });
        } finally {
            setNavSaving(false);
        }
    };

    const handleDragStart = (idx: number) => setDraggingIdx(idx);

    const handleDragOver = (e: React.DragEvent, idx: number) => {
        e.preventDefault();
        setDragOverIdx(idx);
    };

    const handleDrop = (idx: number) => {
        if (draggingIdx === null || draggingIdx === idx) {
            setDraggingIdx(null);
            setDragOverIdx(null);
            return;
        }
        const next = [...menuOrder];
        const [moved] = next.splice(draggingIdx, 1);
        next.splice(idx, 0, moved);
        setMenuOrder(next);
        setDraggingIdx(null);
        setDragOverIdx(null);
    };

    const handleDragEnd = () => {
        setDraggingIdx(null);
        setDragOverIdx(null);
    };

    const sendPasswordReset = async () => {
        if (!profile?.email) {
            setPwMsg({ type: 'error', text: 'No email on file for this account.' });
            return;
        }
        setPwSending(true);
        setPwMsg(null);
        try {
            const { supabase } = await import('../../src/lib/supabase');
            const redirectTo = `${window.location.origin}/auth/reset-password`;
            const { error } = await supabase.auth.resetPasswordForEmail(profile.email, { redirectTo });
            if (error) throw error;
            setPwMsg({ type: 'success', text: `Password reset link sent to ${profile.email}` });
        } catch (err: any) {
            setPwMsg({ type: 'error', text: err.message || 'Failed to send reset email.' });
        } finally {
            setPwSending(false);
        }
    };

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
            setAvatarMsg({ type: 'error', text: 'Only JPG, PNG, GIF, or WebP images are allowed.' });
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            setAvatarMsg({ type: 'error', text: 'Image must be under 2 MB.' });
            return;
        }

        setAvatarSaving(true);
        setAvatarMsg(null);
        try {
            const { avatarApi } = await import('../../src/lib/api');
            const result = await avatarApi.upload(file);
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.gebrils.cloud';
            setAvatarUrl(`${apiUrl}${result.avatar_url}`);
            await refreshUser();
            setAvatarMsg({ type: 'success', text: 'Avatar updated!' });
        } catch (err: any) {
            setAvatarMsg({ type: 'error', text: err.message || 'Upload failed.' });
        } finally {
            setAvatarSaving(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleAvatarRemove = async () => {
        setAvatarSaving(true);
        setAvatarMsg(null);
        try {
            const { avatarApi } = await import('../../src/lib/api');
            await avatarApi.remove();
            setAvatarUrl(null);
            await refreshUser();
            setAvatarMsg({ type: 'success', text: 'Avatar removed.' });
        } catch (err: any) {
            setAvatarMsg({ type: 'error', text: err.message || 'Failed to remove avatar.' });
        } finally {
            setAvatarSaving(false);
        }
    };

    if (loading) return (
        <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
    );

    return (
        <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Preferences</h1>
                <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">Manage your profile and UI settings.</p>
            </div>

            {/* ── Profile ── */}
            <PrefSection title="Profile" icon="👤">
                <div className="space-y-4">
                    {/* Avatar initials */}
                    <div className="flex items-center gap-4 mb-2">
                        {avatarUrl ? (
                            <img
                                src={avatarUrl}
                                alt="Profile avatar"
                                className="w-14 h-14 rounded-full object-cover flex-shrink-0 border-2 border-slate-200 dark:border-slate-700"
                            />
                        ) : (
                            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
                                {(displayName || profile?.name || '?').charAt(0).toUpperCase()}
                            </div>
                        )}
                        <div className="space-y-1">
                            <p className="font-semibold text-slate-900 dark:text-white">{profile?.name}</p>
                            <p className="text-xs text-slate-400 capitalize">{profile?.role}</p>
                            <div className="flex items-center gap-2 mt-2">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/jpeg,image/png,image/gif,image/webp"
                                    className="hidden"
                                    onChange={handleAvatarUpload}
                                />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={avatarSaving}
                                    className="text-xs px-2.5 py-1 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-400 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors disabled:opacity-50"
                                >
                                    {avatarSaving ? 'Uploading…' : 'Upload Photo'}
                                </button>
                                {avatarUrl && (
                                    <button
                                        onClick={handleAvatarRemove}
                                        disabled={avatarSaving}
                                        className="text-xs px-2.5 py-1 border border-red-200 dark:border-red-900 rounded-lg text-red-500 hover:border-red-400 transition-colors disabled:opacity-50"
                                    >
                                        Remove
                                    </button>
                                )}
                            </div>
                            {avatarMsg && <Msg {...avatarMsg} />}
                        </div>
                    </div>
                    <PrefField label="Display Name">
                        <input value={displayName} onChange={e => setDisplayName(e.target.value)}
                            placeholder="Name shown in the UI" className={inputCls} />
                        <p className="text-xs text-slate-400 mt-1">Different from your account name — only affects the UI display.</p>
                    </PrefField>
                    <PrefField label="Email (read-only)">
                        <input value={profile?.email || ''} disabled className={`${inputCls} opacity-60 cursor-not-allowed`} />
                    </PrefField>
                    {profileMsg && <Msg {...profileMsg} />}
                    <button onClick={saveProfile} disabled={profileSaving} className={btnPrimary}>
                        {profileSaving ? 'Saving…' : 'Save Profile'}
                    </button>
                </div>
            </PrefSection>

            {/* ── UI Preferences ── */}
            <PrefSection title="UI Preferences" icon="🎨">
                <div className="space-y-5">
                    <PrefField label="Theme">
                        <div className="flex gap-2">
                            {(['light', 'dark'] as const).map(t => (
                                <button key={t} onClick={() => { setPrefs({ ...prefs, theme: t }); setTheme(t); }}
                                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${prefs.theme === t ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300' : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300 dark:hover:border-slate-600'}`}>
                                    {t === 'light' ? '☀️ Light' : '🌙 Dark'}
                                </button>
                            ))}
                        </div>
                    </PrefField>

                    <PrefField label="Quick Nav Cards">
                        <Toggle value={prefs.quick_nav_visible} onChange={v => setPrefs({ ...prefs, quick_nav_visible: v })}
                            label="Show journey & task cards at top of dashboard" />
                    </PrefField>

                    <PrefField label="Default Landing Page">
                        <select value={prefs.default_page} onChange={e => setPrefs({ ...prefs, default_page: e.target.value })} className={inputCls}>
                            {allowedLandingPages.map(opt => (
                                <option key={opt.path} value={opt.path}>{opt.label}</option>
                            ))}
                        </select>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                            Page you&apos;ll be redirected to after login. Only pages you have access to are shown.
                        </p>
                    </PrefField>

                    <PrefField label="Display Density">
                        <div className="flex gap-2">
                            {(['compact', 'comfortable'] as const).map(d => (
                                <button key={d} onClick={() => setPrefs({ ...prefs, display_density: d })}
                                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${prefs.display_density === d ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300' : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300 dark:hover:border-slate-600'}`}>
                                    {d === 'compact' ? '⊟ Compact' : '☰ Comfortable'}
                                </button>
                            ))}
                        </div>
                    </PrefField>

                    {prefMsg && <Msg {...prefMsg} />}
                    <button onClick={savePrefs} disabled={prefSaving} className={btnPrimary}>
                        {prefSaving ? 'Saving…' : 'Save Preferences'}
                    </button>
                </div>
            </PrefSection>

            {/* Navigation Order */}
            <PrefSection title="Navigation Order" icon="☰">
                <div className="space-y-4">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Drag items to reorder the side navigation. Changes only affect items you have access to.
                    </p>
                    <ul className="space-y-1.5">
                        {menuOrder.map((path, idx) => {
                            const route = accessibleNavRoutes.find(r => r.path === path);
                            if (!route) return null;
                            const Icon = route.icon;
                            return (
                                <li
                                    key={path}
                                    draggable
                                    onDragStart={() => handleDragStart(idx)}
                                    onDragOver={(e) => handleDragOver(e, idx)}
                                    onDrop={() => handleDrop(idx)}
                                    onDragEnd={handleDragEnd}
                                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border select-none cursor-grab active:cursor-grabbing transition-all ${
                                        draggingIdx === idx
                                            ? 'opacity-40 border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/30'
                                            : dragOverIdx === idx
                                                ? 'border-indigo-400 dark:border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20'
                                                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-600'
                                    }`}
                                >
                                    <svg className="w-4 h-4 text-slate-300 dark:text-slate-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                                    </svg>
                                    {Icon && <Icon className="w-4 h-4 text-slate-500 dark:text-slate-400 flex-shrink-0" strokeWidth={1.75} />}
                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{route.label}</span>
                                </li>
                            );
                        })}
                    </ul>
                    {navMsg && <Msg {...navMsg} />}
                    <button onClick={saveNavOrder} disabled={navSaving} className={btnPrimary}>
                        {navSaving ? 'Saving…' : 'Save Navigation Order'}
                    </button>
                </div>
            </PrefSection>

            {/* Security */}
            <PrefSection title="Security" icon="🔒">
                <div className="space-y-4">
                    <div>
                        <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">Change Password</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                            We&apos;ll send a secure link to <strong>{profile?.email}</strong> to set or update your password.
                        </p>
                    </div>
                    {pwMsg && <Msg {...pwMsg} />}
                    <button
                        onClick={sendPasswordReset}
                        disabled={pwSending}
                        className={btnPrimary}
                    >
                        {pwSending ? 'Sending…' : 'Send Password Reset Link'}
                    </button>
                </div>
            </PrefSection>
        </div>
    );
}

function PrefSection({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                <span>{icon}</span>
                <h2 className="font-semibold text-slate-900 dark:text-white text-sm">{title}</h2>
            </div>
            <div className="px-5 py-4">{children}</div>
        </div>
    );
}

function PrefField({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">{label}</label>
            {children}
        </div>
    );
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <label className="flex items-center gap-3 cursor-pointer">
            <button role="switch" aria-checked={value} onClick={() => onChange(!value)}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${value ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}`}>
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${value ? 'translate-x-4' : 'translate-x-0'}`} />
            </button>
            <span className="text-sm text-slate-600 dark:text-slate-400">{label}</span>
        </label>
    );
}

function Msg({ type, text }: { type: 'success' | 'error'; text: string }) {
    return (
        <div className={`text-sm px-3 py-2 rounded-lg ${type === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900' : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900'}`}>
            {text}
        </div>
    );
}

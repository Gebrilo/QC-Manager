'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { fetchApi, profileApi, UserPreferences } from '@/lib/api';
import { useTheme } from '@/components/providers/ThemeProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { getRouteConfig, routeAllowsStatus } from '@/config/routes';

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

const LANDING_PAGE_OPTIONS = [
    { path: '/me/dashboard', label: 'Dashboard' },
    { path: '/me/tasks', label: 'My Tasks' },
    { path: '/me/journeys', label: 'My Journeys' },
    { path: '/work/tasks', label: 'Tasks' },
    { path: '/work/projects', label: 'Projects' },
    { path: '/team/resources', label: 'Resources' },
    { path: '/quality/governance', label: 'Governance' },
    { path: '/test/runs', label: 'Test Runs' },
    { path: '/quality/reports', label: 'Reports' },
    { path: '/team/history', label: 'Task History' },
];

const SECTIONS = [
    { id: 'profile',    label: 'Profile',    sub: 'Identity & contact' },
    { id: 'appearance', label: 'Appearance', sub: 'Theme, density, layout' },
    { id: 'workspace',  label: 'Workspace',  sub: 'Landing page & shortcuts' },
    { id: 'security',   label: 'Security',   sub: 'Password & sessions' },
];

// ─── Shared atoms ─────────────────────────────────────────────────────────────

function PrefLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
    return (
        <div className="mb-2">
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">{children}</div>
            {hint && <div className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">{hint}</div>}
        </div>
    );
}

function PrefInput({
    value, onChange, placeholder, readOnly, type = 'text', suffix,
}: {
    value: string; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string; readOnly?: boolean; type?: string;
    suffix?: React.ReactNode;
}) {
    return (
        <div className="relative">
            <input
                type={type}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                readOnly={readOnly}
                className={[
                    'w-full h-11 px-4 rounded-xl bg-white/60 dark:bg-slate-900/50 backdrop-blur-md border text-sm',
                    'text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none transition-all',
                    readOnly
                        ? 'border-slate-200/50 dark:border-slate-800/60 text-slate-500 dark:text-slate-400 cursor-default'
                        : 'border-slate-200/60 dark:border-slate-700/60 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20',
                ].join(' ')}
            />
            {suffix && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">{suffix}</div>
            )}
        </div>
    );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            onClick={() => onChange(!on)}
            className={[
                'relative w-11 h-6 rounded-full transition-colors flex-shrink-0',
                on ? 'bg-gradient-to-r from-indigo-500 to-violet-600 shadow-md shadow-violet-500/30' : 'bg-slate-300 dark:bg-slate-700',
            ].join(' ')}
        >
            <span className={[
                'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all',
                on ? 'left-[22px]' : 'left-0.5',
            ].join(' ')} />
        </button>
    );
}

function Msg({ type, text }: { type: 'success' | 'error'; text: string }) {
    return (
        <div className={[
            'text-sm px-3 py-2 rounded-lg border',
            type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900'
                : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900',
        ].join(' ')}>
            {text}
        </div>
    );
}

// ─── Section nav ──────────────────────────────────────────────────────────────

const SECTION_ICONS: Record<string, string> = {
    profile:    'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    appearance: 'M12 2v2 M12 20v2 M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M2 12h2 M20 12h2 M6.34 17.66l-1.41 1.41 M19.07 4.93l-1.41 1.41 M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    workspace:  'M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z',
    security:   'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
};

function SectionNav({ active, onPick }: { active: string; onPick: (id: string) => void }) {
    return (
        <nav className="sticky top-6 space-y-1">
            <div className="px-3 py-2 text-[10px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500">
                On this page
            </div>
            {SECTIONS.map(s => {
                const on = active === s.id;
                const iconPaths = SECTION_ICONS[s.id].split(' M');
                return (
                    <button
                        key={s.id}
                        onClick={() => onPick(s.id)}
                        className={[
                            'w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group',
                            on
                                ? 'bg-gradient-to-r from-violet-500/10 to-indigo-500/10 dark:from-violet-500/15 dark:to-indigo-500/15 border border-violet-500/25'
                                : 'border border-transparent hover:bg-white/40 dark:hover:bg-slate-800/40',
                        ].join(' ')}
                    >
                        <div className={[
                            'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                            on
                                ? 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-md shadow-violet-500/30'
                                : 'bg-slate-100/70 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200',
                        ].join(' ')}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                                {iconPaths.map((p, i) => (
                                    <path key={i} d={i === 0 ? p : 'M' + p} />
                                ))}
                            </svg>
                        </div>
                        <div className="min-w-0">
                            <div className={['text-sm font-semibold truncate', on ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-200'].join(' ')}>
                                {s.label}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{s.sub}</div>
                        </div>
                        {on && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-500 shadow-[0_0_10px_rgba(139,92,246,0.8)]" />}
                    </button>
                );
            })}

            <div className="mt-6 mx-1 p-4 rounded-2xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 border border-violet-500/20">
                <div className="text-[10px] uppercase tracking-wider font-bold text-violet-600 dark:text-violet-300">Tip</div>
                <div className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                    Changes to appearance and workspace save instantly. Profile and security require an explicit save.
                </div>
            </div>
        </nav>
    );
}

// ─── Section card ─────────────────────────────────────────────────────────────

function SectionCard({
    id, eyebrow, title, description, icon, children,
}: {
    id: string; eyebrow: string; title: string; description: string;
    icon: React.ReactNode; children: React.ReactNode;
}) {
    return (
        <section id={id} className="scroll-mt-6">
            <div className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-white/60 dark:border-slate-700/50 rounded-2xl shadow-[0_4px_30px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_30px_rgba(0,0,0,0.25)] overflow-hidden">
                <div className="px-6 pt-6 pb-5 flex items-start gap-4 border-b border-slate-200/60 dark:border-slate-800/60">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-lg shadow-violet-500/30">
                        {icon}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-[10px] uppercase tracking-wider font-bold text-violet-600 dark:text-violet-300">{eyebrow}</div>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5 tracking-tight">{title}</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{description}</p>
                    </div>
                </div>
                <div className="p-6">{children}</div>
            </div>
        </section>
    );
}

// ─── Theme card ───────────────────────────────────────────────────────────────

interface Swatches { bg: string; sidebar: string; border: string; card: string; fg: string; muted: string }

function ThemeCard({ value, active, onClick, swatches, label }: {
    value: 'light' | 'dark'; active: boolean; onClick: (v: 'light' | 'dark') => void;
    swatches: Swatches; label: string;
}) {
    return (
        <button
            type="button"
            onClick={() => onClick(value)}
            className={[
                'relative text-left p-4 rounded-xl border transition-all group',
                active
                    ? 'border-violet-500 bg-gradient-to-br from-violet-500/10 to-indigo-500/10 shadow-lg shadow-violet-500/20'
                    : 'border-slate-200/60 dark:border-slate-700/60 bg-white/40 dark:bg-slate-900/40 hover:border-violet-400/60',
            ].join(' ')}
        >
            <div className="rounded-lg overflow-hidden mb-3 border shadow-sm" style={{ background: swatches.bg, borderColor: swatches.border }}>
                <div className="flex items-stretch h-20">
                    <div className="w-1/4 border-r" style={{ background: swatches.sidebar, borderColor: swatches.border }}>
                        <div className="mt-2 ml-2 w-4 h-4 rounded-md" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }} />
                        <div className="mt-2 ml-2 w-8 h-1.5 rounded-full" style={{ background: swatches.muted }} />
                        <div className="mt-1.5 ml-2 w-6 h-1.5 rounded-full" style={{ background: swatches.muted }} />
                    </div>
                    <div className="flex-1 p-2 space-y-1.5">
                        <div className="h-2 rounded-full w-1/2" style={{ background: swatches.fg }} />
                        <div className="flex gap-1.5 pt-1">
                            <div className="flex-1 h-6 rounded" style={{ background: swatches.card, border: `1px solid ${swatches.border}` }} />
                            <div className="flex-1 h-6 rounded" style={{ background: swatches.card, border: `1px solid ${swatches.border}` }} />
                        </div>
                        <div className="h-3 rounded" style={{ background: 'linear-gradient(90deg,#6366f1,#8b5cf6)' }} />
                    </div>
                </div>
            </div>
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">{label}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">{value}</div>
                </div>
                <div className={[
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors',
                    active ? 'border-violet-500 bg-violet-500' : 'border-slate-300 dark:border-slate-600',
                ].join(' ')}>
                    {active && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5">
                            <path d="M5 13l4 4L19 7" />
                        </svg>
                    )}
                </div>
            </div>
        </button>
    );
}

// ─── Density card ─────────────────────────────────────────────────────────────

function DensityCard({ value, active, label, onClick, lineCount }: {
    value: 'compact' | 'comfortable'; active: boolean; label: string;
    onClick: (v: 'compact' | 'comfortable') => void; lineCount: number;
}) {
    return (
        <button
            type="button"
            onClick={() => onClick(value)}
            className={[
                'p-4 rounded-xl border transition-all text-left',
                active
                    ? 'border-violet-500 bg-gradient-to-br from-violet-500/10 to-indigo-500/10'
                    : 'border-slate-200/60 dark:border-slate-700/60 bg-white/40 dark:bg-slate-900/40 hover:border-violet-400/60',
            ].join(' ')}
        >
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 flex flex-col justify-center items-stretch px-1.5 py-1 gap-0.5">
                    {Array.from({ length: lineCount }).map((_, i) => (
                        <div key={i} className="h-[1.5px] rounded-full bg-slate-300 dark:bg-slate-600" style={{ width: `${100 - i * 12}%` }} />
                    ))}
                </div>
                <div className="flex-1">
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">{label}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {value === 'compact' ? 'More on screen' : 'Easy on the eyes'}
                    </div>
                </div>
                <div className={[
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0',
                    active ? 'border-violet-500 bg-violet-500' : 'border-slate-300 dark:border-slate-600',
                ].join(' ')}>
                    {active && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5">
                            <path d="M5 13l4 4L19 7" />
                        </svg>
                    )}
                </div>
            </div>
        </button>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PreferencesPage() {
    const { setTheme } = useTheme();
    const { user: authUser, permissions, hasPermission, isAdmin, refreshUser } = useAuth();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState('profile');
    const [lastSaved, setLastSaved] = useState<Date | null>(null);

    const allowedLandingPages = useMemo(() => {
        return LANDING_PAGE_OPTIONS.filter(opt => {
            const route = getRouteConfig(opt.path);
            if (!route) return false;
            if (isAdmin) return true;
            if (route.adminOnly) return false;
            if (!routeAllowsStatus(route, authUser)) return false;
            if (route.permission && !hasPermission(route.permission)) return false;
            return true;
        });
    }, [authUser, permissions, isAdmin, hasPermission]);

    const [displayName, setDisplayName] = useState('');
    const [profileSaving, setProfileSaving] = useState(false);
    const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const [prefs, setPrefs] = useState<Required<UserPreferences>>(DEFAULT_PREFS);
    const [prefSaving, setPrefSaving] = useState(false);

    const [reducedMotion, setReducedMotion] = useState(false);

    const [pwSending, setPwSending] = useState(false);
    const [pwSent, setPwSent] = useState(false);
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
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.gebrils.cloud';
                const rawUrl = data.user.avatar_url || null;
                setAvatarUrl(rawUrl?.startsWith('/uploads/') ? `${apiUrl}${rawUrl}` : rawUrl);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (loading) return;
        const allowed = allowedLandingPages.map(o => o.path);
        if (prefs.default_page && !allowed.includes(prefs.default_page)) {
            setPrefs(p => ({ ...p, default_page: '/my-tasks' }));
        }
    }, [allowedLandingPages, loading]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!lastSaved) return;
        const timeout = setTimeout(() => setLastSaved(null), 3000);
        return () => clearTimeout(timeout);
    }, [lastSaved]);

    // Scroll spy
    useEffect(() => {
        const main = document.querySelector('main');
        if (!main) return;
        const onScroll = () => {
            const mainRect = main.getBoundingClientRect();
            let current = SECTIONS[0].id;
            for (const s of SECTIONS) {
                const el = document.getElementById(s.id);
                if (el && el.getBoundingClientRect().top <= mainRect.top + 120) current = s.id;
            }
            setActiveSection(current);
        };
        main.addEventListener('scroll', onScroll, { passive: true });
        return () => main.removeEventListener('scroll', onScroll);
    }, []);

    const handlePickSection = (id: string) => {
        setActiveSection(id);
        const el = document.getElementById(id);
        const main = document.querySelector('main');
        if (el && main) {
            const mainRect = main.getBoundingClientRect();
            const elRect = el.getBoundingClientRect();
            main.scrollTo({ top: main.scrollTop + elRect.top - mainRect.top - 32, behavior: 'smooth' });
        }
    };

    const saveProfile = async () => {
        setProfileSaving(true);
        setProfileMsg(null);
        try {
            await profileApi.update({ display_name: displayName });
            setProfileMsg({ type: 'success', text: 'Display name updated!' });
            setLastSaved(new Date());
        } catch (err: any) {
            setProfileMsg({ type: 'error', text: err.message || 'Failed to save' });
        } finally { setProfileSaving(false); }
    };

    const savePrefs = async (next: Required<UserPreferences>) => {
        setPrefSaving(true);
        try {
            await profileApi.update({ preferences: next });
            setLastSaved(new Date());
        } catch { /* silent */ } finally { setPrefSaving(false); }
    };

    const updatePrefs = (patch: Partial<Required<UserPreferences>>) => {
        const next = { ...prefs, ...patch };
        setPrefs(next);
        savePrefs(next);
    };

    const sendPasswordReset = async () => {
        if (!profile?.email) { setPwMsg({ type: 'error', text: 'No email on file.' }); return; }
        setPwSending(true);
        setPwMsg(null);
        try {
            const { supabase } = await import('@/lib/supabase');
            const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
                redirectTo: `${window.location.origin}/auth/reset-password`,
            });
            if (error) throw error;
            setPwSent(true);
            setPwMsg({ type: 'success', text: `Reset link sent to ${profile.email}` });
            setLastSaved(new Date());
        } catch (err: any) {
            setPwMsg({ type: 'error', text: err.message || 'Failed to send reset email.' });
        } finally { setPwSending(false); }
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
            const { avatarApi } = await import('@/lib/api');
            const result = await avatarApi.upload(file);
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.gebrils.cloud';
            setAvatarUrl(`${apiUrl}${result.avatar_url}`);
            await refreshUser();
            setAvatarMsg({ type: 'success', text: 'Avatar updated!' });
            setLastSaved(new Date());
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
            const { avatarApi } = await import('@/lib/api');
            await avatarApi.remove();
            setAvatarUrl(null);
            await refreshUser();
            setAvatarMsg({ type: 'success', text: 'Avatar removed.' });
            setLastSaved(new Date());
        } catch (err: any) {
            setAvatarMsg({ type: 'error', text: err.message || 'Failed to remove avatar.' });
        } finally { setAvatarSaving(false); }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    const initials = (displayName || profile?.name || '?').charAt(0).toUpperCase();

    return (
        <div className="max-w-6xl mx-auto">

            {/* Page header */}
            <header className="mb-8">
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-3">
                    <span>My Work</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 18l6-6-6-6" />
                    </svg>
                    <span className="text-slate-700 dark:text-slate-200 font-medium">Preferences</span>
                </div>
                <div className="flex items-end justify-between flex-wrap gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Preferences</h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 max-w-xl leading-relaxed">
                            Manage your profile, appearance, and security. Settings here apply only to your account — admins configure org-wide defaults in{' '}
                            <span className="text-violet-600 dark:text-violet-300 font-medium">Settings</span>.
                        </p>
                    </div>
                    {lastSaved && (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-100/70 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            All changes saved
                        </div>
                    )}
                </div>
            </header>

            <div className="grid grid-cols-12 gap-8">

                {/* Left nav */}
                <aside className="col-span-3">
                    <SectionNav active={activeSection} onPick={handlePickSection} />
                </aside>

                {/* Content */}
                <div className="col-span-9 space-y-6">

                    {/* ── Profile ─────────────────────────────────────────── */}
                    <SectionCard
                        id="profile"
                        eyebrow="01 — Identity"
                        title="Your profile"
                        description="Your name and email control how teammates see you in comments, audit logs, and assignments."
                        icon={
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                            </svg>
                        }
                    >
                        {/* Avatar hero row */}
                        <div className="flex items-center gap-5 p-5 rounded-xl bg-gradient-to-br from-violet-500/5 to-indigo-500/5 dark:from-violet-500/10 dark:to-indigo-500/10 border border-violet-500/15">
                            <div className="relative shrink-0">
                                <div className="absolute -inset-1 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 blur-md opacity-40" />
                                {avatarUrl ? (
                                    <img
                                        src={avatarUrl}
                                        alt="Profile avatar"
                                        className="relative w-16 h-16 rounded-full object-cover ring-4 ring-white/80 dark:ring-slate-900/80 shadow-lg"
                                    />
                                ) : (
                                    <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xl font-bold shadow-lg ring-4 ring-white/80 dark:ring-slate-900/80">
                                        {initials}
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-base font-bold text-slate-900 dark:text-white">{displayName || profile?.name}</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{profile?.email}</div>
                                <div className="mt-2">
                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold uppercase tracking-wider">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                        {profile?.role || 'Member'}
                                    </span>
                                </div>
                            </div>
                            <div className="flex flex-col gap-2 shrink-0">
                                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={handleAvatarUpload} />
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={avatarSaving}
                                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-violet-400 transition-colors disabled:opacity-50"
                                >
                                    {avatarSaving ? 'Uploading…' : 'Upload photo'}
                                </button>
                                {avatarUrl && (
                                    <button
                                        type="button"
                                        onClick={handleAvatarRemove}
                                        disabled={avatarSaving}
                                        className="px-3 py-1.5 text-xs font-semibold rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors disabled:opacity-50"
                                    >
                                        Remove
                                    </button>
                                )}
                            </div>
                        </div>

                        {avatarMsg && <div className="mt-3"><Msg {...avatarMsg} /></div>}

                        {/* Fields */}
                        <div className="grid grid-cols-2 gap-5 mt-5">
                            <div>
                                <PrefLabel hint="Different from your account name — only affects the UI display.">Display name</PrefLabel>
                                <PrefInput value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name" />
                            </div>
                            <div>
                                <PrefLabel hint="Read-only · managed by your admin.">Email</PrefLabel>
                                <PrefInput value={profile?.email || ''} readOnly suffix={
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                                        <rect x="3" y="11" width="18" height="11" rx="2" />
                                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                    </svg>
                                } />
                            </div>
                        </div>

                        {profileMsg && <div className="mt-4"><Msg {...profileMsg} /></div>}

                        <div className="mt-6 flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => { setDisplayName(profile?.display_name || profile?.name || ''); setProfileMsg(null); }}
                                className="px-4 h-10 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                                Discard
                            </button>
                            <button
                                type="button"
                                onClick={saveProfile}
                                disabled={profileSaving}
                                className="px-5 h-10 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-sm font-semibold shadow-lg shadow-violet-500/30 hover:shadow-violet-500/40 active:scale-95 transition-all inline-flex items-center gap-1.5 disabled:opacity-60"
                            >
                                {profileSaving ? (
                                    <><div className="w-3.5 h-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" />Saving…</>
                                ) : (
                                    <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 13l4 4L19 7" /></svg>Save profile</>
                                )}
                            </button>
                        </div>
                    </SectionCard>

                    {/* ── Appearance ───────────────────────────────────────── */}
                    <SectionCard
                        id="appearance"
                        eyebrow="02 — Look & feel"
                        title="Appearance"
                        description="How QC Manager looks and behaves. Settings apply only to your account."
                        icon={
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="13.5" cy="6.5" r=".5" fill="white" />
                                <circle cx="17.5" cy="10.5" r=".5" fill="white" />
                                <circle cx="8.5" cy="7.5" r=".5" fill="white" />
                                <circle cx="6.5" cy="12.5" r=".5" fill="white" />
                                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
                            </svg>
                        }
                    >
                        {/* Theme */}
                        <div className="mb-6">
                            <PrefLabel hint="Switch between light and dark mode. Affects this device only.">Theme</PrefLabel>
                            <div className="grid grid-cols-2 gap-3">
                                <ThemeCard
                                    value="light" label="Light"
                                    active={prefs.theme === 'light'}
                                    onClick={v => { updatePrefs({ theme: v }); setTheme(v); }}
                                    swatches={{ bg: '#f8fafc', sidebar: '#ffffff', border: '#e2e8f0', card: '#ffffff', fg: '#0f172a', muted: '#cbd5e1' }}
                                />
                                <ThemeCard
                                    value="dark" label="Dark"
                                    active={prefs.theme === 'dark'}
                                    onClick={v => { updatePrefs({ theme: v }); setTheme(v); }}
                                    swatches={{ bg: '#0f172a', sidebar: '#1e293b', border: '#334155', card: '#1e293b', fg: '#f1f5f9', muted: '#475569' }}
                                />
                            </div>
                        </div>

                        {/* Density */}
                        <div className="mb-6">
                            <PrefLabel hint="Compact fits more on screen; Comfortable gives content more breathing room.">Display density</PrefLabel>
                            <div className="grid grid-cols-2 gap-3">
                                <DensityCard value="compact" label="Compact" active={prefs.display_density === 'compact'} onClick={v => updatePrefs({ display_density: v })} lineCount={6} />
                                <DensityCard value="comfortable" label="Comfortable" active={prefs.display_density === 'comfortable'} onClick={v => updatePrefs({ display_density: v })} lineCount={4} />
                            </div>
                        </div>

                        {/* Toggles */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-4 p-4 rounded-xl bg-white/40 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-700/60">
                                <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                                        <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
                                    </svg>
                                </div>
                                <div className="flex-1">
                                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">Quick nav cards on dashboard</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Show journey & task shortcut cards at the top of your dashboard.</div>
                                </div>
                                <Toggle on={prefs.quick_nav_visible} onChange={v => updatePrefs({ quick_nav_visible: v })} />
                            </div>

                            <div className="flex items-center gap-4 p-4 rounded-xl bg-white/40 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-700/60">
                                <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M14 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" />
                                        <path d="M3 21v-2a4 4 0 0 1 4-4h6" />
                                        <path d="m16 19 2 2 4-4" />
                                    </svg>
                                </div>
                                <div className="flex-1">
                                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">Reduce motion</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Minimize animations and transitions across the app.</div>
                                </div>
                                <Toggle on={reducedMotion} onChange={setReducedMotion} />
                            </div>
                        </div>
                    </SectionCard>

                    {/* ── Workspace ────────────────────────────────────────── */}
                    <SectionCard
                        id="workspace"
                        eyebrow="03 — Workspace"
                        title="Workspace defaults"
                        description="Where the app drops you after login, and which features are surfaced first."
                        icon={
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                                <path d="M3 9h18 M9 21V9" />
                            </svg>
                        }
                    >
                        <div>
                            <PrefLabel hint="Page you'll be redirected to after login. Only pages you have access to are listed.">Default landing page</PrefLabel>
                            <div className="grid grid-cols-3 gap-2">
                                {allowedLandingPages.map(p => {
                                    const on = prefs.default_page === p.path;
                                    return (
                                        <button
                                            key={p.path}
                                            type="button"
                                            onClick={() => updatePrefs({ default_page: p.path })}
                                            className={[
                                                'px-3 py-3 rounded-xl text-sm font-medium text-left transition-all border',
                                                on
                                                    ? 'bg-gradient-to-br from-violet-500/15 to-indigo-500/15 border-violet-500/50 text-slate-900 dark:text-white shadow-sm'
                                                    : 'bg-white/40 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-700/60 text-slate-700 dark:text-slate-200 hover:border-violet-400/60',
                                            ].join(' ')}
                                        >
                                            <div className="flex items-center gap-2">
                                                {on && <div className="w-1.5 h-1.5 rounded-full bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.8)]" />}
                                                <span>{p.label}</span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </SectionCard>

                    {/* ── Security ─────────────────────────────────────────── */}
                    <SectionCard
                        id="security"
                        eyebrow="04 — Security"
                        title="Account & security"
                        description="Protect your account. Password resets are sent to your registered email."
                        icon={
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            </svg>
                        }
                    >
                        <div className="grid grid-cols-2 gap-3">
                            {/* Password */}
                            <div className="p-5 rounded-xl bg-white/40 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-700/60">
                                <div className="flex items-center gap-2 mb-2">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="text-violet-500">
                                        <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                    </svg>
                                    <div className="text-sm font-semibold text-slate-900 dark:text-white">Password</div>
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
                                    We&apos;ll email{' '}
                                    <span className="font-semibold text-slate-700 dark:text-slate-200">{profile?.email}</span>
                                    {' '}a secure link to set or update your password.
                                </div>
                                {pwMsg && <div className="mb-3"><Msg {...pwMsg} /></div>}
                                <button
                                    type="button"
                                    onClick={sendPasswordReset}
                                    disabled={pwSending || pwSent}
                                    className={[
                                        'w-full h-10 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-2 transition-all',
                                        pwSent
                                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 cursor-default'
                                            : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-md shadow-violet-500/30 active:scale-95 disabled:opacity-60',
                                    ].join(' ')}
                                >
                                    {pwSent ? (
                                        <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 13l4 4L19 7" /></svg>Reset link sent</>
                                    ) : pwSending ? (
                                        <><div className="w-3.5 h-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" />Sending…</>
                                    ) : (
                                        'Send password reset link'
                                    )}
                                </button>
                            </div>

                            {/* Sessions */}
                            <div className="p-5 rounded-xl bg-white/40 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-700/60">
                                <div className="flex items-center gap-2 mb-2">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="text-violet-500">
                                        <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8 M12 17v4" />
                                    </svg>
                                    <div className="text-sm font-semibold text-slate-900 dark:text-white">Active sessions</div>
                                </div>
                                <div className="space-y-2 mb-4">
                                    <div className="flex items-center gap-2 text-xs">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                        <span className="font-mono text-slate-700 dark:text-slate-200">Chrome · This device</span>
                                        <span className="text-slate-500 dark:text-slate-400 ml-auto">Active now</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs">
                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                        <span className="font-mono text-slate-700 dark:text-slate-200">Mobile browser</span>
                                        <span className="text-slate-500 dark:text-slate-400 ml-auto">2 days ago</span>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="w-full h-10 rounded-lg text-sm font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 border border-rose-200/50 dark:border-rose-900/30 transition-colors"
                                >
                                    Sign out other sessions
                                </button>
                            </div>
                        </div>

                        {/* Danger zone */}
                        <div className="mt-5 p-4 rounded-xl border border-rose-200/50 dark:border-rose-900/30 bg-rose-50/40 dark:bg-rose-950/20 flex items-center gap-4">
                            <div className="w-9 h-9 rounded-lg bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 flex items-center justify-center shrink-0">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                    <path d="M12 9v4 M12 17h.01" />
                                </svg>
                            </div>
                            <div className="flex-1">
                                <div className="text-sm font-semibold text-slate-900 dark:text-white">Deactivate account</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Removes your access. Your data stays for the admin to reassign.</div>
                            </div>
                            <button
                                type="button"
                                className="px-4 h-9 rounded-lg text-xs font-semibold text-rose-700 dark:text-rose-300 border border-rose-300/60 dark:border-rose-700/50 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors"
                            >
                                Deactivate…
                            </button>
                        </div>
                    </SectionCard>

                </div>
            </div>
        </div>
    );
}

'use client';

import { useState, useEffect, useMemo } from 'react';
import { fetchApi, profileApi, UserPreferences } from '../../src/lib/api';
import { useTheme } from '../../src/components/providers/ThemeProvider';
import { useAuth } from '../../src/components/providers/AuthProvider';
import { getRouteConfig } from '../../src/config/routes';

interface UserProfile {
    id: string;
    name: string;
    display_name: string | null;
    email: string;
    role: string;
    preferences: UserPreferences;
}

const DEFAULT_PREFS: Required<UserPreferences> = {
    theme: 'system',
    quick_nav_visible: true,
    default_page: '/my-tasks',
    notification_frequency: 'immediate',
    display_density: 'comfortable',
    timezone: 'UTC',
    language: 'en',
    show_profile_to_team: true,
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
    const { user: authUser, permissions, hasPermission, isAdmin } = useAuth();
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

    const [displayName, setDisplayName] = useState('');
    const [profileSaving, setProfileSaving] = useState(false);
    const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
    const [pwSaving, setPwSaving] = useState(false);
    const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const [prefs, setPrefs] = useState<Required<UserPreferences>>(DEFAULT_PREFS);
    const [prefSaving, setPrefSaving] = useState(false);
    const [prefMsg, setPrefMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        fetchApi<{ user: UserProfile }>('/auth/me')
            .then(data => {
                setProfile(data.user);
                setDisplayName(data.user.display_name || data.user.name || '');
                setPrefs({ ...DEFAULT_PREFS, ...(data.user.preferences || {}) });
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

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

    const savePassword = async () => {
        setPwMsg(null);
        if (!pwForm.current || !pwForm.next) { setPwMsg({ type: 'error', text: 'All fields are required' }); return; }
        if (pwForm.next !== pwForm.confirm) { setPwMsg({ type: 'error', text: 'New passwords do not match' }); return; }
        if (pwForm.next.length < 6) { setPwMsg({ type: 'error', text: 'Password must be at least 6 characters' }); return; }
        setPwSaving(true);
        try {
            await profileApi.changePassword({ current_password: pwForm.current, new_password: pwForm.next });
            setPwMsg({ type: 'success', text: 'Password changed successfully!' });
            setPwForm({ current: '', next: '', confirm: '' });
        } catch (err: any) {
            setPwMsg({ type: 'error', text: err.message || 'Failed to change password' });
        } finally { setPwSaving(false); }
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
                        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
                            {(displayName || profile?.name || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <p className="font-semibold text-slate-900 dark:text-white">{profile?.name}</p>
                            <p className="text-xs text-slate-400 capitalize">{profile?.role}</p>
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

            {/* ── Change Password ── */}
            <PrefSection title="Change Password" icon="🔒">
                <div className="space-y-3">
                    <PrefField label="Current Password">
                        <input type="password" value={pwForm.current} onChange={e => setPwForm({ ...pwForm, current: e.target.value })} className={inputCls} autoComplete="current-password" />
                    </PrefField>
                    <PrefField label="New Password">
                        <input type="password" value={pwForm.next} onChange={e => setPwForm({ ...pwForm, next: e.target.value })} className={inputCls} autoComplete="new-password" />
                    </PrefField>
                    <PrefField label="Confirm New Password">
                        <input type="password" value={pwForm.confirm} onChange={e => setPwForm({ ...pwForm, confirm: e.target.value })} className={inputCls} autoComplete="new-password" />
                    </PrefField>
                    {pwMsg && <Msg {...pwMsg} />}
                    <button onClick={savePassword} disabled={pwSaving} className={btnPrimary}>
                        {pwSaving ? 'Updating…' : 'Change Password'}
                    </button>
                </div>
            </PrefSection>

            {/* ── UI Preferences ── */}
            <PrefSection title="UI Preferences" icon="🎨">
                <div className="space-y-5">
                    <PrefField label="Theme">
                        <div className="flex gap-2">
                            {(['light', 'dark', 'system'] as const).map(t => (
                                <button key={t} onClick={() => { setPrefs({ ...prefs, theme: t }); setTheme(t); }}
                                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${prefs.theme === t ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300' : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300 dark:hover:border-slate-600'}`}>
                                    {t === 'light' ? '☀️ Light' : t === 'dark' ? '🌙 Dark' : '🖥 System'}
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

                    <PrefField label="Notification Email Frequency">
                        <select value={prefs.notification_frequency} onChange={e => setPrefs({ ...prefs, notification_frequency: e.target.value as any })} className={inputCls}>
                            <option value="immediate">Immediate</option>
                            <option value="daily">Daily Digest</option>
                            <option value="weekly">Weekly Summary</option>
                        </select>
                    </PrefField>

                    {prefMsg && <Msg {...prefMsg} />}
                    <button onClick={savePrefs} disabled={prefSaving} className={btnPrimary}>
                        {prefSaving ? 'Saving…' : 'Save Preferences'}
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

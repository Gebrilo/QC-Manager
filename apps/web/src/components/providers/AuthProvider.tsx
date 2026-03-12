'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { getLandingPage } from '../../config/routes';
import type { Session } from '@supabase/supabase-js';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface User {
    id: string;
    name: string;
    display_name?: string | null;
    email: string;
    phone?: string;
    role: 'admin' | 'manager' | 'user' | 'viewer' | 'contributor';
    activated: boolean;
    onboarding_completed?: boolean;
    preferences?: {
        theme?: string;
        display_density?: string;
        default_page?: string;
        [key: string]: any;
    };
}

interface AuthContextType {
    user: User | null;
    permissions: string[];
    token: string | null;
    loading: boolean;
    signInWithOtp: (email: string) => Promise<void>;
    logout: () => Promise<void>;
    hasPermission: (key: string) => boolean;
    isAdmin: boolean;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PUBLIC_PATHS = ['/login', '/auth/callback'];

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [permissions, setPermissions] = useState<string[]>([]);
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const pathname = usePathname();
    const syncInProgress = useRef(false);

    /**
     * Apply user preferences (theme, density) from user data
     */
    const applyPreferences = useCallback((prefs?: User['preferences']) => {
        if (prefs?.theme && prefs.theme !== 'system') {
            localStorage.setItem('theme', prefs.theme);
            if (prefs.theme === 'dark') document.documentElement.classList.add('dark');
            else document.documentElement.classList.remove('dark');
        }
        if (prefs?.display_density) {
            localStorage.setItem('density', prefs.display_density);
        }
    }, []);

    /**
     * Sync the Supabase session with the API backend.
     * Creates the app_user if it doesn't exist, or retrieves existing user data.
     */
    const syncWithBackend = useCallback(async (accessToken: string): Promise<{ user: User; permissions: string[] } | null> => {
        try {
            const res = await fetch(`${API_URL}/auth/sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                },
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Sync failed');
            }

            const data = await res.json();
            return {
                user: { ...data.user, activated: data.user.activated ?? true },
                permissions: data.permissions || [],
            };
        } catch (err) {
            console.error('[AuthProvider] Backend sync failed:', err);
            return null;
        }
    }, []);

    /**
     * Fetch current user data from the API (for refresh scenarios)
     */
    const fetchCurrentUser = useCallback(async (accessToken: string): Promise<boolean> => {
        try {
            const res = await fetch(`${API_URL}/auth/me`, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (!res.ok) throw new Error('Invalid token');
            const data = await res.json();
            applyPreferences(data.user.preferences);
            setUser({ ...data.user, activated: data.user.activated ?? true });
            setPermissions(data.permissions || []);
            return true;
        } catch {
            return false;
        }
    }, [applyPreferences]);

    /**
     * Handle session change — sync with backend and update state
     */
    const handleSession = useCallback(async (session: Session | null) => {
        if (syncInProgress.current) return;
        syncInProgress.current = true;

        try {
            if (!session) {
                setUser(null);
                setPermissions([]);
                setToken(null);
                setLoading(false);
                return;
            }

            const accessToken = session.access_token;
            setToken(accessToken);

            // Try to sync with backend
            const syncResult = await syncWithBackend(accessToken);
            if (syncResult) {
                applyPreferences(syncResult.user.preferences);
                setUser(syncResult.user);
                setPermissions(syncResult.permissions);
            } else {
                // Sync failed — try fetching current user (maybe they're already synced)
                const fetched = await fetchCurrentUser(accessToken);
                if (!fetched) {
                    // Complete failure — sign out
                    await supabase.auth.signOut();
                    setUser(null);
                    setPermissions([]);
                    setToken(null);
                }
            }
        } finally {
            syncInProgress.current = false;
            setLoading(false);
        }
    }, [syncWithBackend, fetchCurrentUser, applyPreferences]);

    /**
     * Initialize: check for existing Supabase session and listen for auth changes
     */
    useEffect(() => {
        // Check existing session
        supabase.auth.getSession().then(({ data: { session } }) => {
            handleSession(session);
        });

        // Listen for auth state changes (sign in, sign out, token refresh)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (_event, session) => {
                await handleSession(session);
            }
        );

        return () => {
            subscription.unsubscribe();
        };
    }, [handleSession]);

    /**
     * Redirect unauthenticated users to login (unless on a public path)
     */
    useEffect(() => {
        if (!loading && !user && !PUBLIC_PATHS.some(p => pathname?.startsWith(p))) {
            router.push('/login');
        }
    }, [loading, user, pathname, router]);

    const refreshUser = useCallback(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            await fetchCurrentUser(session.access_token);
        }
    }, [fetchCurrentUser]);

    /**
     * Send a magic link to the given email address via Supabase OTP.
     * The user clicks the link in their inbox, which redirects to /auth/callback
     * where the session is established automatically.
     */
    const signInWithOtp = useCallback(async (email: string) => {
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo: `${window.location.origin}/auth/callback`,
            },
        });
        if (error) throw new Error(error.message);
    }, []);

    /**
     * Sign out from Supabase and clear state
     */
    const logout = useCallback(async () => {
        await supabase.auth.signOut();
        setUser(null);
        setPermissions([]);
        setToken(null);
        localStorage.removeItem('auth_token'); // Clean up any legacy tokens
        router.push('/login');
    }, [router]);

    const hasPermission = useCallback((key: string) => {
        if (user?.role === 'admin') return true;
        return permissions.includes(key);
    }, [user, permissions]);

    const isAdmin = user?.role === 'admin';

    return (
        <AuthContext.Provider value={{
            user, permissions, token, loading,
            signInWithOtp,
            logout, hasPermission, isAdmin, refreshUser,
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

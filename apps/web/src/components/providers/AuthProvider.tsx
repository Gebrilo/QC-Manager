'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface User {
    id: string;
    name: string;
    email: string;
    phone?: string;
    role: 'admin' | 'manager' | 'user' | 'viewer';
}

interface AuthContextType {
    user: User | null;
    permissions: string[];
    token: string | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (data: { name: string; email: string; password: string; phone?: string }) => Promise<void>;
    logout: () => void;
    hasPermission: (key: string) => boolean;
    isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PUBLIC_PATHS = ['/login', '/register'];

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [permissions, setPermissions] = useState<string[]>([]);
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const pathname = usePathname();

    // Initialize from localStorage
    useEffect(() => {
        const storedToken = localStorage.getItem('auth_token');
        if (storedToken) {
            setToken(storedToken);
            // Fetch current user
            fetch(`${API_URL}/auth/me`, {
                headers: { Authorization: `Bearer ${storedToken}` },
            })
                .then(res => {
                    if (!res.ok) throw new Error('Invalid token');
                    return res.json();
                })
                .then(data => {
                    setUser(data.user);
                    setPermissions(data.permissions || []);
                    setLoading(false);
                })
                .catch(() => {
                    // Token invalid, clear it
                    localStorage.removeItem('auth_token');
                    setToken(null);
                    setUser(null);
                    setPermissions([]);
                    setLoading(false);
                });
        } else {
            setLoading(false);
        }
    }, []);

    // Redirect to login if not authenticated and on a protected route
    useEffect(() => {
        if (!loading && !user && !PUBLIC_PATHS.includes(pathname || '')) {
            router.push('/login');
        }
    }, [loading, user, pathname, router]);

    const login = useCallback(async (email: string, password: string) => {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Login failed');
        }

        const data = await res.json();
        setUser(data.user);
        setPermissions(data.permissions || []);
        setToken(data.token);
        localStorage.setItem('auth_token', data.token);
        router.push('/');
    }, [router]);

    const register = useCallback(async (data: { name: string; email: string; password: string; phone?: string }) => {
        const res = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Registration failed');
        }

        const result = await res.json();
        setUser(result.user);
        setToken(result.token);
        localStorage.setItem('auth_token', result.token);

        // Fetch permissions via /me to get the actual default permissions
        try {
            const meRes = await fetch(`${API_URL}/auth/me`, {
                headers: { Authorization: `Bearer ${result.token}` },
            });
            if (meRes.ok) {
                const meData = await meRes.json();
                setPermissions(meData.permissions || []);
            }
        } catch {
            setPermissions([]);
        }

        router.push('/');
    }, [router]);

    const logout = useCallback(() => {
        setUser(null);
        setPermissions([]);
        setToken(null);
        localStorage.removeItem('auth_token');
        router.push('/login');
    }, [router]);

    const hasPermission = useCallback((key: string) => {
        if (user?.role === 'admin') return true;
        return permissions.includes(key);
    }, [user, permissions]);

    const isAdmin = user?.role === 'admin';

    return (
        <AuthContext.Provider value={{ user, permissions, token, loading, login, register, logout, hasPermission, isAdmin }}>
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

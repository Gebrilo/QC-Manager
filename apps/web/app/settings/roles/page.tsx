'use client';

import { useEffect, useState, useCallback, useRef, memo } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Role {
    name: string;
    permissions: string[];
    is_builtin: boolean;
    is_protected: boolean;
    created_at?: string;
    created_by?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function groupPermissions(permissions: string[]) {
    const groups: Record<string, string[]> = {};
    for (const perm of permissions) {
        const parts = perm.split(':');
        const group = parts[0] === 'page' ? 'Pages' : parts[1] ? `${parts[1].charAt(0).toUpperCase() + parts[1].slice(1)} Actions` : 'Other';
        if (!groups[group]) groups[group] = [];
        groups[group].push(perm);
    }
    return groups;
}

function formatPermLabel(key: string): string {
    return key
        .replace('page:', '')
        .replace('action:', '')
        .replace(/:/g, ' → ')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

/* ------------------------------------------------------------------ */
/*  Individual permission pill – isolated state, no parent re-render  */
/* ------------------------------------------------------------------ */

const PermPill = memo(function PermPill({
    perm,
    initialGranted,
    disabled,
    onChange,
}: {
    perm: string;
    initialGranted: boolean;
    disabled: boolean;
    onChange: (perm: string, granted: boolean) => void;
}) {
    const [granted, setGranted] = useState(initialGranted);

    // Sync with parent when roles are re-fetched (e.g. after save)
    useEffect(() => {
        setGranted(initialGranted);
    }, [initialGranted]);

    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (disabled) return;
        const next = !granted;
        setGranted(next);
        onChange(perm, next);
    };

    return (
        <div
            role="checkbox"
            aria-checked={granted}
            tabIndex={disabled ? -1 : 0}
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleClick}
            onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    handleClick(e as unknown as React.MouseEvent);
                }
            }}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg transition-colors border select-none ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                } ${granted
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                }`}
        >
            <span className={`w-3 h-3 rounded-sm flex items-center justify-center shrink-0 ${granted
                ? 'bg-emerald-500 text-white'
                : 'bg-slate-200 dark:bg-slate-700'
                }`}>
                {granted && (
                    <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                )}
            </span>
            {formatPermLabel(perm)}
        </div>
    );
});

/* ------------------------------------------------------------------ */
/*  Create-role permission pill (simpler variant)                     */
/* ------------------------------------------------------------------ */

const CreatePermPill = memo(function CreatePermPill({
    perm,
    granted,
    onToggle,
}: {
    perm: string;
    granted: boolean;
    onToggle: (perm: string) => void;
}) {
    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle(perm);
    };

    return (
        <div
            role="checkbox"
            aria-checked={granted}
            tabIndex={0}
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleClick}
            onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    handleClick(e as unknown as React.MouseEvent);
                }
            }}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg cursor-pointer transition-colors border select-none ${granted
                ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                }`}
        >
            {formatPermLabel(perm)}
        </div>
    );
});

/* ------------------------------------------------------------------ */
/*  Single role card – collapsible accordion with local dirty state   */
/* ------------------------------------------------------------------ */

const RoleCard = memo(function RoleCard({
    role,
    permGroups,
    token,
    onSaved,
    onDeleted,
    onNotify,
}: {
    role: Role;
    permGroups: Record<string, string[]>;
    token: string;
    onSaved: () => void;
    onDeleted: () => void;
    onNotify: (type: 'success' | 'error', msg: string) => void;
}) {
    const permsRef = useRef<Set<string>>(new Set(role.permissions));
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [expanded, setExpanded] = useState(false);

    // Reset ref when role data changes (e.g. after save/fetch)
    useEffect(() => {
        permsRef.current = new Set(role.permissions);
        setDirty(false);
    }, [role.permissions]);

    const handlePermChange = useCallback((perm: string, granted: boolean) => {
        if (granted) {
            permsRef.current.add(perm);
        } else {
            permsRef.current.delete(perm);
        }
        const original = new Set(role.permissions);
        const current = permsRef.current;
        let isDirty = original.size !== current.size;
        if (!isDirty) {
            for (const p of Array.from(original)) {
                if (!current.has(p)) { isDirty = true; break; }
            }
        }
        setDirty(isDirty);
    }, [role.permissions]);

    const handleSave = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setSaving(true);
        try {
            const res = await fetch(`${API_URL}/roles/${role.name}`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ permissions: Array.from(permsRef.current) }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to save');
            }
            const result = await res.json();
            onNotify('success', `Role "${role.name}" updated — ${result.affected_users} user(s) affected`);
            onSaved();
        } catch (err: any) {
            onNotify('error', err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm(`Delete custom role "${role.name}"? This cannot be undone.`)) return;
        try {
            const res = await fetch(`${API_URL}/roles/${role.name}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to delete');
            }
            onNotify('success', `Role "${role.name}" deleted`);
            onDeleted();
        } catch (err: any) {
            onNotify('error', err.message);
        }
    };

    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            {/* Clickable header – toggles accordion */}
            <div
                className={`px-6 py-4 flex items-center justify-between cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${role.is_protected ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}`}
                onClick={() => setExpanded(prev => !prev)}
            >
                <div className="flex items-center gap-3 min-w-0">
                    {/* Chevron */}
                    <svg
                        className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform duration-200 shrink-0 ${expanded ? 'rotate-90' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white capitalize">{role.name}</h3>
                    {role.is_builtin && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                            Built-in
                        </span>
                    )}
                    {role.is_protected && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400">
                            Protected
                        </span>
                    )}
                    {!role.is_builtin && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400">
                            Custom
                        </span>
                    )}
                    {/* Permission count summary when collapsed */}
                    {!expanded && (
                        <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">
                            {role.permissions.length} permissions
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {!role.is_protected && dirty && (
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition-all"
                        >
                            {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                    )}
                    {!role.is_builtin && (
                        <button
                            type="button"
                            onClick={handleDelete}
                            className="px-3 py-1.5 bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded-lg text-xs font-medium transition-colors border border-rose-200 dark:border-rose-800"
                        >
                            Delete
                        </button>
                    )}
                </div>
            </div>

            {/* Collapsible permission grid */}
            {expanded && (
                <div className="px-6 py-4 space-y-3 border-t border-slate-100 dark:border-slate-800">
                    {Object.entries(permGroups).map(([group, perms]) => (
                        <div key={group}>
                            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">{group}</p>
                            <div className="flex flex-wrap gap-2">
                                {perms.map(perm => (
                                    <PermPill
                                        key={perm}
                                        perm={perm}
                                        initialGranted={role.permissions.includes(perm)}
                                        disabled={role.is_protected}
                                        onChange={handlePermChange}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
});

/* ------------------------------------------------------------------ */
/*  Main page                                                         */
/* ------------------------------------------------------------------ */

export default function RolesPage() {
    const { user, token, isAdmin } = useAuth();
    const [roles, setRoles] = useState<Role[]>([]);
    const [allPermissions, setAllPermissions] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Create role state
    const [showCreate, setShowCreate] = useState(false);
    const [newRoleName, setNewRoleName] = useState('');
    const [newRolePerms, setNewRolePerms] = useState<Set<string>>(new Set());
    const [creating, setCreating] = useState(false);

    const showNotification = useCallback((type: 'success' | 'error', message: string) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 4000);
    }, []);

    const fetchData = useCallback(async () => {
        if (!token) return;
        try {
            const [rolesRes, permsRes] = await Promise.all([
                fetch(`${API_URL}/roles`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${API_URL}/roles/permissions`, { headers: { Authorization: `Bearer ${token}` } }),
            ]);
            if (!rolesRes.ok || !permsRes.ok) throw new Error('Failed to load data');
            const rolesData = await rolesRes.json();
            const permsData = await permsRes.json();
            setRoles(rolesData);
            setAllPermissions(permsData);
        } catch (err: any) {
            showNotification('error', err.message);
        } finally {
            setLoading(false);
        }
    }, [token, showNotification]);

    useEffect(() => {
        if (isAdmin) fetchData();
    }, [isAdmin, fetchData]);

    const handleCreateToggle = useCallback((perm: string) => {
        setNewRolePerms(prev => {
            const s = new Set(prev);
            s.has(perm) ? s.delete(perm) : s.add(perm);
            return s;
        });
    }, []);

    const createRole = async () => {
        if (!token || !newRoleName.trim()) return;
        setCreating(true);
        try {
            const res = await fetch(`${API_URL}/roles`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newRoleName.trim(), permissions: Array.from(newRolePerms) }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to create');
            }
            showNotification('success', `Role "${newRoleName.trim()}" created`);
            setShowCreate(false);
            setNewRoleName('');
            setNewRolePerms(new Set());
            await fetchData();
        } catch (err: any) {
            showNotification('error', err.message);
        } finally {
            setCreating(false);
        }
    };

    const permGroups = groupPermissions(allPermissions);

    if (!isAdmin) {
        return (
            <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
                <div className="text-center">
                    <div className="text-6xl mb-4">🔒</div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Admin Only</h2>
                    <p className="text-slate-500 dark:text-slate-400 mb-6">Only administrators can manage roles and permissions.</p>
                    <Link href="/my-tasks" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
                        Back to My Tasks
                    </Link>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
                <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-4 border-indigo-200 dark:border-indigo-800 border-t-indigo-600 rounded-full animate-spin" />
                    <span className="text-sm text-slate-500 dark:text-slate-400">Loading roles...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* Notification */}
            {notification && (
                <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all duration-300 ${notification.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    : 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                    }`}>
                    {notification.message}
                </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Role Management</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage roles and their permission assignments</p>
                </div>
                <button
                    type="button"
                    onClick={() => setShowCreate(!showCreate)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-colors shadow-sm"
                >
                    {showCreate ? 'Cancel' : '+ Create Role'}
                </button>
            </div>

            {/* Create Role Panel */}
            {showCreate && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
                    <h3 className="text-sm font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Create Custom Role</h3>
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1">
                            <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Role Name</span>
                            <input
                                type="text"
                                value={newRoleName}
                                onChange={e => setNewRoleName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                                placeholder="e.g. team_lead"
                                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent outline-none"
                            />
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Lowercase, alphanumeric + underscores</p>
                        </div>
                    </div>
                    <div>
                        <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Permissions</span>
                        <div className="space-y-3">
                            {Object.entries(permGroups).map(([group, perms]) => (
                                <div key={group}>
                                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">{group}</p>
                                    <div className="flex flex-wrap gap-2">
                                        {perms.map(perm => (
                                            <CreatePermPill
                                                key={perm}
                                                perm={perm}
                                                granted={newRolePerms.has(perm)}
                                                onToggle={handleCreateToggle}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={createRole}
                            disabled={creating || !newRoleName.trim()}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white rounded-xl text-sm font-medium transition-colors"
                        >
                            {creating ? 'Creating...' : 'Create Role'}
                        </button>
                    </div>
                </div>
            )}

            {/* Role Cards – collapsed by default, click to expand */}
            <div className="space-y-4">
                {roles.map(role => (
                    <RoleCard
                        key={role.name}
                        role={role}
                        permGroups={permGroups}
                        token={token!}
                        onSaved={fetchData}
                        onDeleted={fetchData}
                        onNotify={showNotification}
                    />
                ))}
            </div>
        </div>
    );
}

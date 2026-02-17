'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../src/components/providers/AuthProvider';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface UserRecord {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    role: 'admin' | 'manager' | 'user' | 'viewer' | 'contributor';
    active: boolean;
    activated: boolean;
    created_at: string;
    last_login: string | null;
}

interface LinkedResource {
    user_id: string;
    resource_id: string;
    resource_name: string;
}

interface Permission {
    permission_key: string;
    granted: boolean;
}

const ROLE_COLORS: Record<string, string> = {
    admin: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800',
    manager: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
    contributor: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-800',
    user: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800',
    viewer: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700',
};

const ALL_PERMISSIONS = [
    { key: 'page:dashboard', label: 'Dashboard', group: 'Pages' },
    { key: 'page:tasks', label: 'Tasks', group: 'Pages' },
    { key: 'page:projects', label: 'Projects', group: 'Pages' },
    { key: 'page:resources', label: 'Resources', group: 'Pages' },
    { key: 'page:governance', label: 'Governance', group: 'Pages' },
    { key: 'page:test-executions', label: 'Test Runs', group: 'Pages' },
    { key: 'page:reports', label: 'Reports', group: 'Pages' },
    { key: 'page:users', label: 'User Management', group: 'Pages' },
    { key: 'action:tasks:create', label: 'Create Tasks', group: 'Task Actions' },
    { key: 'action:tasks:edit', label: 'Edit Tasks', group: 'Task Actions' },
    { key: 'action:tasks:delete', label: 'Delete Tasks', group: 'Task Actions' },
    { key: 'action:projects:create', label: 'Create Projects', group: 'Project Actions' },
    { key: 'action:projects:edit', label: 'Edit Projects', group: 'Project Actions' },
    { key: 'action:projects:delete', label: 'Delete Projects', group: 'Project Actions' },
    { key: 'action:resources:create', label: 'Create Resources', group: 'Resource Actions' },
    { key: 'action:resources:edit', label: 'Edit Resources', group: 'Resource Actions' },
    { key: 'action:resources:delete', label: 'Delete Resources', group: 'Resource Actions' },
    { key: 'action:reports:generate', label: 'Generate Reports', group: 'Report Actions' },
];

export default function UsersPage() {
    const { user: currentUser, token, isAdmin } = useAuth();
    const router = useRouter();
    const [users, setUsers] = useState<UserRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [expandedUser, setExpandedUser] = useState<string | null>(null);
    const [userPermissions, setUserPermissions] = useState<Record<string, string[]>>({});
    const [saving, setSaving] = useState<string | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<UserRecord | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [linkedResources, setLinkedResources] = useState<Record<string, LinkedResource>>({});
    const [convertTarget, setConvertTarget] = useState<UserRecord | null>(null);
    const [converting, setConverting] = useState(false);
    const [convertForm, setConvertForm] = useState({ weekly_capacity_hrs: 40, department: '', role: '' });

    const fetchResources = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/resources`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return;
            const data = await res.json();
            const linked: Record<string, LinkedResource> = {};
            (data.data || data).forEach((r: any) => {
                if (r.user_id) {
                    linked[r.user_id] = { user_id: r.user_id, resource_id: r.id, resource_name: r.resource_name };
                }
            });
            setLinkedResources(linked);
        } catch { /* non-critical */ }
    }, [token]);

    const fetchUsers = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/users`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('Failed to load users');
            const data = await res.json();
            setUsers(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        if (token && isAdmin) {
            fetchUsers();
            fetchResources();
        }
    }, [token, isAdmin, fetchUsers, fetchResources]);

    const fetchPermissions = async (userId: string) => {
        try {
            const res = await fetch(`${API_URL}/users/${userId}/permissions`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('Failed to load permissions');
            const data: Permission[] = await res.json();
            setUserPermissions(prev => ({
                ...prev,
                [userId]: data.filter(p => p.granted).map(p => p.permission_key),
            }));
        } catch (err: any) {
            setError(err.message);
        }
    };

    const toggleExpand = (userId: string) => {
        if (expandedUser === userId) {
            setExpandedUser(null);
        } else {
            setExpandedUser(userId);
            if (!userPermissions[userId]) {
                fetchPermissions(userId);
            }
        }
    };

    const handleRoleChange = async (userId: string, newRole: string) => {
        setSaving(userId);
        try {
            const res = await fetch(`${API_URL}/users/${userId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ role: newRole }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to update role');
            }
            // Refresh
            await fetchUsers();
            // Refresh permissions for this user
            await fetchPermissions(userId);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSaving(null);
        }
    };

    const handleToggleActive = async (userId: string, active: boolean, activate?: boolean) => {
        setSaving(userId);
        try {
            const body: Record<string, any> = { active };
            if (activate) {
                body.activated = true;
            }
            const res = await fetch(`${API_URL}/users/${userId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to update status');
            }
            await fetchUsers();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSaving(null);
        }
    };

    const handlePermissionToggle = async (userId: string, permKey: string) => {
        const current = userPermissions[userId] || [];
        const updated = current.includes(permKey)
            ? current.filter(p => p !== permKey)
            : [...current, permKey];

        // Optimistic update
        setUserPermissions(prev => ({ ...prev, [userId]: updated }));

        setSaving(userId);
        try {
            const res = await fetch(`${API_URL}/users/${userId}/permissions`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ permissions: updated }),
            });
            if (!res.ok) throw new Error('Failed to update permissions');
        } catch (err: any) {
            setError(err.message);
            // Revert
            setUserPermissions(prev => ({ ...prev, [userId]: current }));
        } finally {
            setSaving(null);
        }
    };

    const handleDeleteUser = async (userId: string) => {
        setDeleting(true);
        try {
            const res = await fetch(`${API_URL}/users/${userId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to delete user');
            }
            setDeleteConfirm(null);
            await fetchUsers();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setDeleting(false);
        }
    };

    const handleConvertToResource = async (userId: string) => {
        setConverting(true);
        try {
            const res = await fetch(`${API_URL}/users/${userId}/convert-to-resource`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    weekly_capacity_hrs: convertForm.weekly_capacity_hrs,
                    department: convertForm.department || undefined,
                    role: convertForm.role || undefined,
                }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to convert user to resource');
            }
            setConvertTarget(null);
            setConvertForm({ weekly_capacity_hrs: 40, department: '', role: '' });
            await fetchResources();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setConverting(false);
        }
    };

    const formatDate = (d: string | null) => {
        if (!d) return 'Never';
        return new Date(d).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
        });
    };

    // Group permissions by category
    const permissionGroups = ALL_PERMISSIONS.reduce<Record<string, typeof ALL_PERMISSIONS>>((acc, p) => {
        if (!acc[p.group]) acc[p.group] = [];
        acc[p.group].push(p);
        return acc;
    }, {});

    return (
        <div className="space-y-6 px-4 sm:px-0">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">User Management</h1>
                <p className="text-slate-500 dark:text-slate-400 mt-1">Manage user accounts, roles, and permissions</p>
            </div>

            {error && (
                <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl px-4 py-3 text-rose-600 dark:text-rose-400 text-sm">
                    {error}
                    <button onClick={() => setError('')} className="ml-2 font-medium underline">Dismiss</button>
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <svg className="animate-spin h-8 w-8 text-indigo-500" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                </div>
            ) : (
                <div className="space-y-3">
                    {users.map(u => (
                        <div
                            key={u.id}
                            className={`bg-white dark:bg-slate-900 border rounded-xl transition-all ${expandedUser === u.id
                                ? 'border-indigo-300 dark:border-indigo-700 shadow-lg shadow-indigo-500/5'
                                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                                }`}
                        >
                            {/* User Row */}
                            <div
                                className="flex items-center gap-4 p-4 cursor-pointer"
                                onClick={() => toggleExpand(u.id)}
                            >
                                {/* Avatar */}
                                <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm ${u.active
                                    ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600'
                                    }`}>
                                    {u.name.charAt(0).toUpperCase()}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className={`font-medium text-sm ${u.active ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-600 line-through'}`}>
                                            {u.name}
                                        </span>
                                        {u.id === currentUser?.id && (
                                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400">
                                                You
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{u.email}</p>
                                </div>

                                {/* Phone */}
                                <div className="hidden sm:block text-xs text-slate-500 dark:text-slate-400 w-32 truncate">
                                    {u.phone || '—'}
                                </div>

                                {/* Role Badge */}
                                <select
                                    value={u.role}
                                    onChange={(e) => {
                                        e.stopPropagation();
                                        handleRoleChange(u.id, e.target.value);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    disabled={u.id === currentUser?.id || saving === u.id}
                                    className={`text-xs font-medium px-3 py-1.5 rounded-lg border appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50 disabled:cursor-not-allowed ${ROLE_COLORS[u.role]}`}
                                >
                                    <option value="admin">Admin</option>
                                    <option value="manager">Manager</option>
                                    <option value="contributor">Contributor</option>
                                    <option value="user">User</option>
                                    <option value="viewer">Viewer</option>
                                </select>

                                {/* Activated Toggle */}
                                {!u.activated && u.id !== currentUser?.id && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleToggleActive(u.id, !u.active, true);
                                        }}
                                        disabled={saving === u.id}
                                        className="text-[10px] font-medium px-2 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors disabled:opacity-50"
                                    >
                                        Activate
                                    </button>
                                )}
                                {u.activated && (
                                    <span className="text-[10px] font-medium px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
                                        Activated
                                    </span>
                                )}

                                {/* Active Toggle */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleActive(u.id, !u.active);
                                    }}
                                    disabled={u.id === currentUser?.id || saving === u.id}
                                    className={`relative w-10 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50 disabled:cursor-not-allowed ${u.active ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                                        }`}
                                    title={u.active ? 'Active' : 'Inactive'}
                                >
                                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${u.active ? 'translate-x-4' : 'translate-x-0'
                                        }`} />
                                </button>

                                {/* Last login */}
                                <div className="hidden lg:block text-xs text-slate-400 dark:text-slate-500 w-36 text-right">
                                    {formatDate(u.last_login)}
                                </div>

                                {/* Convert to Resource / Resource Badge */}
                                {linkedResources[u.id] ? (
                                    <span
                                        className="text-[10px] font-medium px-2 py-1 rounded-lg bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 border border-teal-200 dark:border-teal-800 flex items-center gap-1"
                                        title={`Linked to resource: ${linkedResources[u.id].resource_name}`}
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                        Resource
                                    </span>
                                ) : u.activated && u.id !== currentUser?.id ? (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setConvertTarget(u);
                                            setConvertForm({ weekly_capacity_hrs: 40, department: '', role: '' });
                                        }}
                                        className="text-[10px] font-medium px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
                                        title="Convert this user into an assignable resource"
                                    >
                                        + Resource
                                    </button>
                                ) : null}

                                {/* Delete Button */}
                                {u.id !== currentUser?.id && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setDeleteConfirm(u);
                                        }}
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 dark:text-slate-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                                        title="Delete user permanently"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                )}

                                {/* Expand Arrow */}
                                <svg
                                    className={`w-4 h-4 text-slate-400 transition-transform ${expandedUser === u.id ? 'rotate-180' : ''}`}
                                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>

                            {/* Expanded Permissions */}
                            {expandedUser === u.id && (
                                <div className="border-t border-slate-200 dark:border-slate-800 p-4">
                                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Permissions</h3>

                                    {!userPermissions[u.id] ? (
                                        <div className="flex items-center justify-center py-4">
                                            <svg className="animate-spin h-5 w-5 text-indigo-500" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                            </svg>
                                        </div>
                                    ) : (
                                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                            {Object.entries(permissionGroups).map(([group, perms]) => (
                                                <div key={group} className="space-y-2">
                                                    <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{group}</h4>
                                                    <div className="space-y-1">
                                                        {perms.map(perm => (
                                                            <label
                                                                key={perm.key}
                                                                className="flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={userPermissions[u.id]?.includes(perm.key) || false}
                                                                    onChange={() => handlePermissionToggle(u.id, perm.key)}
                                                                    disabled={saving === u.id}
                                                                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500/50"
                                                                />
                                                                <span className="text-sm text-slate-700 dark:text-slate-300">{perm.label}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}

                    {users.length === 0 && (
                        <div className="text-center py-12 text-slate-400 dark:text-slate-500">
                            <p className="text-lg font-medium">No users found</p>
                            <p className="text-sm mt-1">Users will appear here once they register</p>
                        </div>
                    )}
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-700" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="h-10 w-10 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
                                <svg className="w-5 h-5 text-rose-600 dark:text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Delete User</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400">This action cannot be undone</p>
                            </div>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
                            Are you sure you want to permanently delete <strong>{deleteConfirm.name}</strong> ({deleteConfirm.email})? All their data and permissions will be removed.
                        </p>
                        <div className="flex items-center justify-end gap-3">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                disabled={deleting}
                                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDeleteUser(deleteConfirm.id)}
                                disabled={deleting}
                                className="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                                {deleting ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                        Deleting...
                                    </>
                                ) : 'Delete Permanently'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Convert to Resource Dialog */}
            {convertTarget && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setConvertTarget(null)}>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-700" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="h-10 w-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                                <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Convert to Resource</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400">{convertTarget.name} ({convertTarget.email})</p>
                            </div>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
                            This will create a resource record linked to this user, making them assignable to tasks.
                        </p>
                        <div className="space-y-3 mb-6">
                            <div>
                                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Weekly Capacity (hrs)</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={80}
                                    value={convertForm.weekly_capacity_hrs}
                                    onChange={(e) => setConvertForm(f => ({ ...f, weekly_capacity_hrs: parseInt(e.target.value) || 40 }))}
                                    className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Department (optional)</label>
                                <input
                                    type="text"
                                    value={convertForm.department}
                                    onChange={(e) => setConvertForm(f => ({ ...f, department: e.target.value }))}
                                    placeholder="e.g. QA, Engineering"
                                    className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Role (optional)</label>
                                <input
                                    type="text"
                                    value={convertForm.role}
                                    onChange={(e) => setConvertForm(f => ({ ...f, role: e.target.value }))}
                                    placeholder="e.g. QC Engineer, Lead"
                                    className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                />
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-3">
                            <button
                                onClick={() => setConvertTarget(null)}
                                disabled={converting}
                                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleConvertToResource(convertTarget.id)}
                                disabled={converting}
                                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                                {converting ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                        Converting...
                                    </>
                                ) : 'Convert to Resource'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Lock, Plus, RefreshCw, Save, Search, Shield, Trash2, Edit2, X } from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface ArtifactType {
    key: string;
    label: string;
}

interface PermissionKey {
    key: string;
    action: string;
    label: string;
    project_scope_warning: string | null;
}

interface MatrixRole {
    name: string;
    role_identifier: string;
    permissions: Record<string, boolean>;
    is_builtin: boolean;
    is_protected: boolean;
}

interface MatrixResponse {
    artifact_type: string;
    artifact_label: string;
    artifact_types: ArtifactType[];
    permission_keys: PermissionKey[];
    roles: MatrixRole[];
}

const ROLE_CHIP: Record<string, string> = {
    admin:        'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800',
    team_manager: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
    manager:      'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
    pm:           'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800',
    member:       'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
    tester:       'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800',
    user:         'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800',
    viewer:       'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    contributor:  'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800',
};

function roleChipClass(roleId: string) {
    return ROLE_CHIP[roleId] ?? 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800';
}

function roleLabel(roleId: string) {
    return roleId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function grantedCount(role: MatrixRole, permissions: PermissionKey[]): number {
    if (role.is_protected) return permissions.length;
    return permissions.filter(p => !!role.permissions[p.key]).length;
}

export default function PermissionsMatrixPage() {
    const { token, isAdmin } = useAuth();

    const [activeArtifact, setActiveArtifact]   = useState('task');
    const [artifactTypes, setArtifactTypes]     = useState<ArtifactType[]>([]);
    const [permissions, setPermissions]         = useState<PermissionKey[]>([]);
    const [roles, setRoles]                     = useState<MatrixRole[]>([]);
    const [loading, setLoading]                 = useState(true);
    const [savingCells, setSavingCells]         = useState<Set<string>>(new Set());
    const [message, setMessage]                 = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [search, setSearch]                   = useState('');
    const [newRoleName, setNewRoleName]         = useState('');
    const [creating, setCreating]               = useState(false);
    const [renamingRole, setRenamingRole]       = useState<string | null>(null);
    const [renameValue, setRenameValue]         = useState('');

    const showMessage = useCallback((type: 'success' | 'error', text: string) => {
        setMessage({ type, text });
        window.setTimeout(() => setMessage(null), 3500);
    }, []);

    const loadMatrix = useCallback(async (artifactType = activeArtifact) => {
        if (!token) return;
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/admin/access/matrix?artifact_type=${artifactType}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to load matrix');
            }
            const data: MatrixResponse = await res.json();
            setActiveArtifact(data.artifact_type);
            setArtifactTypes(data.artifact_types);
            setPermissions(data.permission_keys);
            setRoles(data.roles);
        } catch (err: any) {
            showMessage('error', err.message);
        } finally {
            setLoading(false);
        }
    }, [activeArtifact, token, showMessage]);

    useEffect(() => {
        if (isAdmin) loadMatrix(activeArtifact);
    }, [isAdmin, activeArtifact, loadMatrix]);

    const filteredPermissions = useMemo(() => {
        if (!search.trim()) return permissions;
        const q = search.toLowerCase();
        return permissions.filter(p => p.label.toLowerCase().includes(q) || p.action.toLowerCase().includes(q));
    }, [permissions, search]);

    const customRoles = useMemo(() => roles.filter(r => !r.is_builtin), [roles]);

    const ROLE_NAME_PATTERN = /^[a-z0-9_]+$/;
    const newRoleNameError = newRoleName && !ROLE_NAME_PATTERN.test(newRoleName)
        ? 'Lowercase letters, digits, and underscores only'
        : null;
    const renameValueError = renameValue && !ROLE_NAME_PATTERN.test(renameValue)
        ? 'Lowercase letters, digits, and underscores only'
        : null;

    const toggleCell = async (role: MatrixRole, permissionKey: string) => {
        if (!token || role.is_protected) return;
        const cellKey   = `${role.role_identifier}:${permissionKey}`;
        const previous  = !!role.permissions[permissionKey];
        const next      = !previous;

        setSavingCells(prev => new Set(prev).add(cellKey));
        setRoles(prev => prev.map(r => r.role_identifier === role.role_identifier
            ? { ...r, permissions: { ...r.permissions, [permissionKey]: next } }
            : r
        ));

        try {
            const res = await fetch(`${API_URL}/admin/access/matrix`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ role_identifier: role.role_identifier, permission_key: permissionKey, granted: next }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to update permission');
            }
        } catch (err: any) {
            setRoles(prev => prev.map(r => r.role_identifier === role.role_identifier
                ? { ...r, permissions: { ...r.permissions, [permissionKey]: previous } }
                : r
            ));
            showMessage('error', err.message);
        } finally {
            setSavingCells(prev => { const s = new Set(prev); s.delete(cellKey); return s; });
        }
    };

    const createRole = async () => {
        if (!token || !newRoleName.trim()) return;
        setCreating(true);
        try {
            const res = await fetch(`${API_URL}/admin/access/roles`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newRoleName.trim() }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to create role');
            }
            setNewRoleName('');
            showMessage('success', 'Role created');
            await loadMatrix(activeArtifact);
        } catch (err: any) {
            showMessage('error', err.message);
        } finally {
            setCreating(false);
        }
    };

    const startRename = (role: MatrixRole) => {
        setRenamingRole(role.role_identifier);
        setRenameValue(role.role_identifier);
    };

    const renameRole = async (role: MatrixRole) => {
        if (!token || !renameValue.trim()) return;
        try {
            const res = await fetch(`${API_URL}/admin/access/roles/${role.role_identifier}`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: renameValue.trim() }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to rename role');
            }
            setRenamingRole(null);
            setRenameValue('');
            showMessage('success', 'Role renamed');
            await loadMatrix(activeArtifact);
        } catch (err: any) {
            showMessage('error', err.message);
        }
    };

    const deleteRole = async (role: MatrixRole) => {
        if (!token || !confirm(`Delete role "${role.role_identifier}"? This cannot be undone.`)) return;
        try {
            const res = await fetch(`${API_URL}/admin/access/roles/${role.role_identifier}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to delete role');
            }
            showMessage('success', 'Role deleted');
            await loadMatrix(activeArtifact);
        } catch (err: any) {
            showMessage('error', err.message);
        }
    };

    if (!isAdmin) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
                        <Lock className="h-8 w-8 text-slate-400" />
                    </div>
                    <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Admin Only</h1>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                        Only administrators can manage the permissions matrix.
                    </p>
                    <Link
                        href="/me/tasks"
                        className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                    >
                        ← Back to My Tasks
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-full space-y-5">
            {/* Toast */}
            {message && (
                <div className={`fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg backdrop-blur-md transition-all ${
                    message.type === 'success'
                        ? 'border-emerald-200 bg-emerald-50/90 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/90 dark:text-emerald-300'
                        : 'border-rose-200 bg-rose-50/90 text-rose-700 dark:border-rose-800 dark:bg-rose-950/90 dark:text-rose-300'
                }`}>
                    {message.type === 'success'
                        ? <Check className="h-4 w-4 shrink-0" />
                        : <X className="h-4 w-4 shrink-0" />}
                    {message.text}
                </div>
            )}

            {/* Page header */}
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                        Permissions Matrix
                    </h1>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-medium text-slate-700 dark:text-slate-300">{roles.length} roles</span>
                        <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                        <span>{permissions.length} actions in this view</span>
                    </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => loadMatrix(activeArtifact)} disabled={loading}>
                    <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {/* Artifact tabs */}
            <div className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
                {artifactTypes.map(artifact => (
                    <button
                        key={artifact.key}
                        type="button"
                        onClick={() => { setSearch(''); setActiveArtifact(artifact.key); }}
                        className={`border-b-2 px-3 py-2.5 text-xs font-semibold transition-colors ${
                            activeArtifact === artifact.key
                                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-300'
                                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                    >
                        {artifact.label}
                    </button>
                ))}
            </div>

            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
                {/* Matrix table */}
                <div className="glass-card overflow-hidden p-0">
                    {/* Search bar */}
                    <div className="flex items-center gap-2 border-b border-slate-200/60 px-4 py-3 dark:border-slate-700/60">
                        <Search className="h-4 w-4 shrink-0 text-slate-400" />
                        <input
                            type="search"
                            placeholder="Filter permissions…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none dark:text-slate-300 dark:placeholder-slate-500"
                        />
                        {search && (
                            <button type="button" onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>

                    {loading ? (
                        <div className="flex min-h-[320px] items-center justify-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                            <RefreshCw className="h-5 w-5 animate-spin text-indigo-400" />
                            Loading matrix…
                        </div>
                    ) : filteredPermissions.length === 0 ? (
                        <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                            <Search className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                            No permissions match "<span className="font-medium">{search}</span>"
                        </div>
                    ) : (
                        <div className="overflow-auto">
                            <table className="min-w-full border-separate border-spacing-0 text-sm">
                                <thead>
                                    <tr>
                                        {/* Role column */}
                                        <th className="sticky left-0 top-0 z-20 w-48 border-b border-r border-slate-200/70 bg-slate-50/80 backdrop-blur-sm px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-400">
                                            Role
                                        </th>
                                        {filteredPermissions.map(perm => (
                                            <th
                                                key={perm.key}
                                                className="sticky top-0 z-10 min-w-[120px] border-b border-r border-slate-200/70 bg-slate-50/80 backdrop-blur-sm px-3 py-3 text-center dark:border-slate-700/70 dark:bg-slate-900/80"
                                            >
                                                <div className="flex items-center justify-center gap-1">
                                                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                                                        {perm.label}
                                                    </span>
                                                    {perm.project_scope_warning && (
                                                        <Tooltip delayDuration={100}>
                                                            <TooltipTrigger asChild>
                                                                <span className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full bg-amber-100 text-[9px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                                                    !
                                                                </span>
                                                            </TooltipTrigger>
                                                            <TooltipContent side="bottom" className="max-w-48 text-xs">
                                                                {perm.project_scope_warning}
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    )}
                                                </div>
                                                <div className="mt-0.5 font-mono text-[9px] text-slate-400 dark:text-slate-500">
                                                    {perm.action}
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {roles.map((role, idx) => {
                                        const isAdminRole   = role.role_identifier === 'admin';
                                        const count         = grantedCount(role, filteredPermissions);
                                        const chipClass     = roleChipClass(role.role_identifier);

                                        return (
                                            <tr
                                                key={role.role_identifier}
                                                className={`group ${idx % 2 === 0 ? '' : 'bg-slate-50/40 dark:bg-slate-800/20'}`}
                                            >
                                                {/* Role name cell */}
                                                <th className="sticky left-0 z-10 border-b border-r border-slate-200/60 bg-white/80 backdrop-blur-sm px-4 py-3 text-left dark:border-slate-700/60 dark:bg-slate-950/80">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${chipClass}`}>
                                                            {roleLabel(role.role_identifier)}
                                                        </span>
                                                        {role.is_protected && (
                                                            <Tooltip delayDuration={100}>
                                                                <TooltipTrigger>
                                                                    <Lock className="h-3 w-3 text-amber-500" />
                                                                </TooltipTrigger>
                                                                <TooltipContent className="text-xs">Protected role</TooltipContent>
                                                            </Tooltip>
                                                        )}
                                                    </div>
                                                    <div className="mt-1 flex items-center gap-1.5">
                                                        <span className="font-mono text-[10px] text-slate-400">
                                                            {role.role_identifier}
                                                        </span>
                                                        {role.is_builtin && (
                                                            <span className="rounded bg-slate-100 px-1 py-0.5 text-[9px] font-medium text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                                                                built-in
                                                            </span>
                                                        )}
                                                        <span className={`ml-auto text-[10px] font-medium ${
                                                            isAdminRole
                                                                ? 'text-rose-500'
                                                                : count === filteredPermissions.length
                                                                    ? 'text-emerald-600 dark:text-emerald-400'
                                                                    : count === 0
                                                                        ? 'text-slate-400'
                                                                        : 'text-indigo-500 dark:text-indigo-400'
                                                        }`}>
                                                            {isAdminRole ? 'all' : `${count}/${filteredPermissions.length}`}
                                                        </span>
                                                    </div>
                                                </th>

                                                {/* Permission cells */}
                                                {filteredPermissions.map(perm => {
                                                    const cellKey  = `${role.role_identifier}:${perm.key}`;
                                                    const saving   = savingCells.has(cellKey);
                                                    const checked  = isAdminRole || !!role.permissions[perm.key];
                                                    const disabled = role.is_protected || saving;

                                                    if (isAdminRole) {
                                                        return (
                                                            <td key={perm.key} className="border-b border-r border-slate-200/60 px-3 py-2.5 text-center dark:border-slate-700/60">
                                                                <Tooltip delayDuration={100}>
                                                                    <TooltipTrigger asChild>
                                                                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-rose-50 text-rose-500 dark:bg-rose-950/40 dark:text-rose-400">
                                                                            <Shield className="h-3.5 w-3.5" />
                                                                        </span>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent className="text-xs">Admin has all permissions</TooltipContent>
                                                                </Tooltip>
                                                            </td>
                                                        );
                                                    }

                                                    return (
                                                        <td key={perm.key} className="border-b border-r border-slate-200/60 px-3 py-2.5 text-center dark:border-slate-700/60">
                                                            <button
                                                                type="button"
                                                                aria-label={`${role.role_identifier} — ${perm.label}`}
                                                                aria-pressed={checked}
                                                                disabled={disabled}
                                                                onClick={() => toggleCell(role, perm.key)}
                                                                className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition-all duration-150 ${
                                                                    checked
                                                                        ? 'border-emerald-400 bg-emerald-50 text-emerald-600 shadow-sm shadow-emerald-100 hover:bg-emerald-100 dark:border-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300 dark:shadow-none'
                                                                        : 'border-slate-200 bg-white/60 text-transparent hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950/40 dark:hover:border-slate-600'
                                                                } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                                                            >
                                                                {saving ? (
                                                                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-400" />
                                                                ) : checked ? (
                                                                    <Check className="h-3.5 w-3.5" />
                                                                ) : null}
                                                            </button>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Sidebar — custom roles */}
                <aside className="space-y-4">
                    {/* Role summary cards */}
                    <div className="glass-card p-4">
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Role Overview</h2>
                        {!loading && (
                            <ul className="mt-3 space-y-2">
                                {roles.map(role => {
                                    const count     = grantedCount(role, permissions);
                                    const isAdmin   = role.role_identifier === 'admin';
                                    const pct       = isAdmin ? 100 : permissions.length ? Math.round((count / permissions.length) * 100) : 0;
                                    const chipClass = roleChipClass(role.role_identifier);
                                    return (
                                        <li key={role.role_identifier} className="flex items-center gap-2">
                                            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${chipClass}`}>
                                                {roleLabel(role.role_identifier)}
                                            </span>
                                            <div className="flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" style={{ height: 4 }}>
                                                <div
                                                    className={`h-full rounded-full transition-all duration-500 ${
                                                        isAdmin ? 'bg-rose-400' : pct === 100 ? 'bg-emerald-400' : 'bg-indigo-400'
                                                    }`}
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                            <span className="w-8 text-right text-[10px] text-slate-500 dark:text-slate-400">
                                                {isAdmin ? 'all' : `${pct}%`}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    {/* Create custom role */}
                    <div className="glass-card p-4">
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Custom Roles</h2>
                        <div className="mt-3 space-y-1.5">
                            <div className="flex gap-2">
                                <Input
                                    value={newRoleName}
                                    onChange={e => setNewRoleName(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !newRoleNameError && newRoleName.trim() && !creating) createRole(); }}
                                    placeholder="e.g. qa_lead"
                                    aria-invalid={!!newRoleNameError}
                                    className="h-9 text-sm"
                                />
                                <Button
                                    size="icon"
                                    variant="primary"
                                    onClick={createRole}
                                    disabled={creating || !newRoleName.trim() || !!newRoleNameError}
                                    aria-label="Create role"
                                >
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                            {newRoleNameError ? (
                                <p className="text-[11px] text-rose-600 dark:text-rose-400">{newRoleNameError}</p>
                            ) : (
                                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                                    Lowercase letters, digits, and underscores
                                </p>
                            )}
                        </div>

                        <div className="mt-4 space-y-1 divide-y divide-slate-100 dark:divide-slate-800">
                            {customRoles.length === 0 ? (
                                <p className="py-3 text-sm text-slate-400 dark:text-slate-500">No custom roles yet</p>
                            ) : (
                                customRoles.map(role => (
                                    <div key={role.role_identifier} className="flex items-center gap-2 py-2.5">
                                        {renamingRole === role.role_identifier ? (
                                            <>
                                                <div className="min-w-0 flex-1 space-y-1">
                                                    <Input
                                                        value={renameValue}
                                                        onChange={e => setRenameValue(e.target.value)}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter' && !renameValueError && renameValue.trim()) renameRole(role);
                                                            if (e.key === 'Escape') setRenamingRole(null);
                                                        }}
                                                        aria-invalid={!!renameValueError}
                                                        className="h-8 text-xs"
                                                    />
                                                    {renameValueError && (
                                                        <p className="text-[11px] text-rose-600 dark:text-rose-400">{renameValueError}</p>
                                                    )}
                                                </div>
                                                <Button size="icon" variant="ghost" onClick={() => renameRole(role)} disabled={!renameValue.trim() || !!renameValueError} aria-label="Save">
                                                    <Save className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button size="icon" variant="ghost" onClick={() => setRenamingRole(null)} aria-label="Cancel">
                                                    <X className="h-3.5 w-3.5" />
                                                </Button>
                                            </>
                                        ) : (
                                            <>
                                                <div className="min-w-0 flex-1">
                                                    <div className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">
                                                        {roleLabel(role.role_identifier)}
                                                    </div>
                                                    <div className="truncate font-mono text-[10px] text-slate-400">
                                                        {role.role_identifier}
                                                    </div>
                                                </div>
                                                <Button size="icon" variant="ghost" onClick={() => startRename(role)} aria-label="Rename">
                                                    <Edit2 className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button size="icon" variant="ghost" onClick={() => deleteRole(role)} aria-label="Delete">
                                                    <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Legend */}
                    <div className="glass-card p-4">
                        <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Legend</h2>
                        <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                            <li className="flex items-center gap-2">
                                <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-emerald-400 bg-emerald-50 text-emerald-600 dark:border-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300">
                                    <Check className="h-3 w-3" />
                                </span>
                                Permission granted
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white/60 dark:border-slate-700 dark:bg-slate-950/40" />
                                Permission denied
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-rose-50 text-rose-500 dark:bg-rose-950/40 dark:text-rose-400">
                                    <Shield className="h-3 w-3" />
                                </span>
                                Admin wildcard (always granted)
                            </li>
                            <li className="flex items-center gap-2">
                                <Lock className="h-3.5 w-3.5 text-amber-500" />
                                Protected — cannot be modified
                            </li>
                        </ul>
                    </div>
                </aside>
            </section>
        </div>
    );
}

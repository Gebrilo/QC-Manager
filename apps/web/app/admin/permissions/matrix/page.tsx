'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Edit2, Lock, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
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

function roleLabel(roleName: string) {
    return roleName.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

export default function PermissionsMatrixPage() {
    const { token, isAdmin } = useAuth();
    const [activeArtifact, setActiveArtifact] = useState('task');
    const [artifactTypes, setArtifactTypes] = useState<ArtifactType[]>([]);
    const [permissions, setPermissions] = useState<PermissionKey[]>([]);
    const [roles, setRoles] = useState<MatrixRole[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingCells, setSavingCells] = useState<Set<string>>(new Set());
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [newRoleName, setNewRoleName] = useState('');
    const [creating, setCreating] = useState(false);
    const [renamingRole, setRenamingRole] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');

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

    const customRoles = useMemo(() => roles.filter(role => !role.is_builtin), [roles]);

    const ROLE_NAME_PATTERN = /^[a-z0-9_]+$/;
    const newRoleNameError = newRoleName && !ROLE_NAME_PATTERN.test(newRoleName)
        ? 'Use lowercase letters, digits, and underscores only'
        : null;
    const renameValueError = renameValue && !ROLE_NAME_PATTERN.test(renameValue)
        ? 'Use lowercase letters, digits, and underscores only'
        : null;

    const toggleCell = async (role: MatrixRole, permissionKey: string) => {
        if (!token || role.is_protected) return;
        const cellKey = `${role.role_identifier}:${permissionKey}`;
        const previous = !!role.permissions[permissionKey];
        const next = !previous;

        setSavingCells(prev => new Set(prev).add(cellKey));
        setRoles(prev => prev.map(row => row.role_identifier === role.role_identifier
            ? { ...row, permissions: { ...row.permissions, [permissionKey]: next } }
            : row
        ));

        try {
            const res = await fetch(`${API_URL}/admin/access/matrix`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role_identifier: role.role_identifier,
                    permission_key: permissionKey,
                    granted: next,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to update permission');
            }
        } catch (err: any) {
            setRoles(prev => prev.map(row => row.role_identifier === role.role_identifier
                ? { ...row, permissions: { ...row.permissions, [permissionKey]: previous } }
                : row
            ));
            showMessage('error', err.message);
        } finally {
            setSavingCells(prev => {
                const nextSet = new Set(prev);
                nextSet.delete(cellKey);
                return nextSet;
            });
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
        if (!token || !confirm(`Delete role "${role.role_identifier}"?`)) return;
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
                    <Lock className="mx-auto mb-4 h-10 w-10 text-slate-400" />
                    <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Admin Only</h1>
                    <Link href="/me/tasks" className="mt-4 inline-flex text-sm font-medium text-indigo-600 dark:text-indigo-400">
                        Back to My Tasks
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-full space-y-5">
            {message && (
                <div className={`fixed right-4 top-4 z-50 rounded-lg border px-4 py-3 text-sm shadow-lg ${message.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                    : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200'
                    }`}>
                    {message.text}
                </div>
            )}

            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">Roles & Permissions Matrix</h1>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span>{roles.length} roles</span>
                        <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                        <span>{permissions.length} actions</span>
                    </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => loadMatrix(activeArtifact)} disabled={loading}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800">
                {artifactTypes.map(artifact => (
                    <button
                        key={artifact.key}
                        type="button"
                        onClick={() => setActiveArtifact(artifact.key)}
                        className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${activeArtifact === artifact.key
                            ? 'border-indigo-500 text-indigo-600 dark:text-indigo-300'
                            : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                            }`}
                    >
                        {artifact.label}
                    </button>
                ))}
            </div>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                    {loading ? (
                        <div className="flex min-h-[360px] items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                            Loading matrix...
                        </div>
                    ) : (
                        <div className="overflow-auto">
                            <table className="min-w-full border-separate border-spacing-0 text-sm">
                                <thead>
                                    <tr>
                                        <th className="sticky left-0 top-0 z-20 w-56 border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                                            Role
                                        </th>
                                        {permissions.map(permission => (
                                            <th
                                                key={permission.key}
                                                className="sticky top-0 z-10 min-w-28 border-b border-r border-slate-200 bg-slate-50 px-3 py-3 text-center text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                                            >
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <span>{permission.label}</span>
                                                    {permission.project_scope_warning && (
                                                        <Tooltip delayDuration={150}>
                                                            <TooltipTrigger asChild>
                                                                <span className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                                                    !
                                                                </span>
                                                            </TooltipTrigger>
                                                            <TooltipContent>{permission.project_scope_warning}</TooltipContent>
                                                        </Tooltip>
                                                    )}
                                                </div>
                                                <div className="mt-1 font-mono text-[10px] font-normal text-slate-400 dark:text-slate-500">
                                                    {permission.action}
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {roles.map(role => (
                                        <tr key={role.role_identifier} className="group">
                                            <th className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-4 py-3 text-left dark:border-slate-800 dark:bg-slate-950">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-slate-900 dark:text-white">{roleLabel(role.role_identifier)}</span>
                                                    {role.is_builtin && (
                                                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                                            Built-in
                                                        </span>
                                                    )}
                                                    {role.is_protected && <Lock className="h-3.5 w-3.5 text-amber-500" />}
                                                </div>
                                                <div className="mt-0.5 font-mono text-[11px] text-slate-400">{role.role_identifier}</div>
                                            </th>
                                            {permissions.map(permission => {
                                                const checked = !!role.permissions[permission.key];
                                                const cellKey = `${role.role_identifier}:${permission.key}`;
                                                const saving = savingCells.has(cellKey);
                                                return (
                                                    <td key={permission.key} className="border-b border-r border-slate-200 px-3 py-3 text-center dark:border-slate-800">
                                                        <button
                                                            type="button"
                                                            aria-label={`${role.role_identifier} ${permission.key}`}
                                                            aria-pressed={checked}
                                                            disabled={role.is_protected || saving}
                                                            onClick={() => toggleCell(role, permission.key)}
                                                            className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${checked
                                                                ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                                                : 'border-slate-300 bg-white text-transparent hover:border-slate-400 dark:border-slate-700 dark:bg-slate-950'
                                                                } ${role.is_protected ? 'cursor-not-allowed opacity-60' : ''}`}
                                                        >
                                                            {saving ? (
                                                                <RefreshCw className="h-4 w-4 animate-spin text-slate-400" />
                                                            ) : checked ? (
                                                                <Check className="h-4 w-4" />
                                                            ) : null}
                                                        </button>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <aside className="space-y-4">
                    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Custom Roles</h2>
                        <div className="mt-4 space-y-1">
                            <div className="flex gap-2">
                                <Input
                                    value={newRoleName}
                                    onChange={event => setNewRoleName(event.target.value)}
                                    onKeyDown={event => { if (event.key === 'Enter' && !newRoleNameError && newRoleName.trim() && !creating) createRole(); }}
                                    placeholder="e.g. qa_lead"
                                    aria-invalid={!!newRoleNameError}
                                    aria-describedby={newRoleNameError ? 'new-role-error' : 'new-role-hint'}
                                    className="h-9"
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
                                <p id="new-role-error" className="text-[11px] text-rose-600 dark:text-rose-400">{newRoleNameError}</p>
                            ) : (
                                <p id="new-role-hint" className="text-[11px] text-slate-400 dark:text-slate-500">Lowercase letters, digits, and underscores only</p>
                            )}
                        </div>

                        <div className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
                            {customRoles.length === 0 && (
                                <div className="py-4 text-sm text-slate-500 dark:text-slate-400">No custom roles</div>
                            )}
                            {customRoles.map(role => (
                                <div key={role.role_identifier} className="flex items-center gap-2 py-3">
                                    {renamingRole === role.role_identifier ? (
                                        <>
                                            <div className="min-w-0 flex-1 space-y-1">
                                                <Input
                                                    value={renameValue}
                                                    onChange={event => setRenameValue(event.target.value)}
                                                    onKeyDown={event => {
                                                        if (event.key === 'Enter' && !renameValueError && renameValue.trim()) renameRole(role);
                                                        if (event.key === 'Escape') setRenamingRole(null);
                                                    }}
                                                    aria-invalid={!!renameValueError}
                                                    className="h-8"
                                                />
                                                {renameValueError && (
                                                    <p className="text-[11px] text-rose-600 dark:text-rose-400">{renameValueError}</p>
                                                )}
                                            </div>
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                onClick={() => renameRole(role)}
                                                disabled={!renameValue.trim() || !!renameValueError}
                                                aria-label="Save role name"
                                            >
                                                <Save className="h-4 w-4" />
                                            </Button>
                                            <Button size="icon" variant="ghost" onClick={() => setRenamingRole(null)} aria-label="Cancel rename">
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </>
                                    ) : (
                                        <>
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-sm font-medium text-slate-900 dark:text-white">{roleLabel(role.role_identifier)}</div>
                                                <div className="truncate font-mono text-[11px] text-slate-400">{role.role_identifier}</div>
                                            </div>
                                            <Button size="icon" variant="ghost" onClick={() => startRename(role)} aria-label="Rename role">
                                                <Edit2 className="h-4 w-4" />
                                            </Button>
                                            <Button size="icon" variant="ghost" onClick={() => deleteRole(role)} aria-label="Delete role">
                                                <Trash2 className="h-4 w-4 text-rose-500" />
                                            </Button>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </aside>
            </section>
        </div>
    );
}

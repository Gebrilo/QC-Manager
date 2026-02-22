'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { teamsApi, TeamApi, TeamApiMember, TeamApiProject } from '../../../src/lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function getAuthToken(): string | null {
    if (typeof window !== 'undefined') return localStorage.getItem('auth_token');
    return null;
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = getAuthToken();
    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(options.headers as Record<string, string>),
        },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || `Request failed: ${res.status}`);
    }
    return res.json();
}

interface User {
    id: string;
    name: string;
    email: string;
    role: string;
    team_id?: string;
    team_name?: string;
    manager_name?: string;
}

interface Project {
    id: string;
    project_id: string;
    project_name: string;
    status: string;
    team_id?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function TeamsAdminPage() {
    const [teams, setTeams] = useState<TeamApi[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Modal state
    const [selectedTeam, setSelectedTeam] = useState<TeamApi | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showMemberModal, setShowMemberModal] = useState(false);
    const [showProjectModal, setShowProjectModal] = useState(false);

    // Form state
    const [formName, setFormName] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [formManagerId, setFormManagerId] = useState('');
    const [addMemberId, setAddMemberId] = useState('');
    const [addProjectId, setAddProjectId] = useState('');
    const [saving, setSaving] = useState(false);

    const showSuccess = (msg: string) => {
        setSuccess(msg);
        setTimeout(() => setSuccess(null), 3500);
    };

    const showError = (msg: string) => {
        setError(msg);
        setTimeout(() => setError(null), 5000);
    };

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [teamsData, usersData, projectsData] = await Promise.all([
                apiFetch<TeamApi[]>('/teams'),
                apiFetch<User[]>('/users'),
                apiFetch<Project[]>('/projects'),
            ]);
            setTeams(teamsData);
            setUsers(usersData);
            setProjects(projectsData);
        } catch (err: any) {
            showError(err.message || 'Failed to load data');
        } finally {
            setLoading(false);
        }
    }, []);

    const loadTeamDetails = async (teamId: string) => {
        try {
            const detail = await apiFetch<TeamApi>(`/teams/${teamId}`);
            setSelectedTeam(detail);
        } catch (err: any) {
            showError(err.message);
        }
    };

    useEffect(() => { loadData(); }, [loadData]);

    // ── Create team ──────────────────────────────────────────────────────────
    const handleCreate = async () => {
        if (!formName.trim()) { showError('Team name is required'); return; }
        setSaving(true);
        try {
            await apiFetch('/teams', {
                method: 'POST',
                body: JSON.stringify({ name: formName.trim(), description: formDescription || undefined, manager_id: formManagerId || undefined }),
            });
            showSuccess('Team created successfully');
            setShowCreateModal(false);
            setFormName(''); setFormDescription(''); setFormManagerId('');
            loadData();
        } catch (err: any) { showError(err.message); }
        finally { setSaving(false); }
    };

    // ── Update team ──────────────────────────────────────────────────────────
    const handleUpdate = async () => {
        if (!selectedTeam) return;
        if (!formName.trim()) { showError('Team name is required'); return; }
        setSaving(true);
        try {
            await apiFetch(`/teams/${selectedTeam.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ name: formName.trim(), description: formDescription || undefined, manager_id: formManagerId || null }),
            });
            showSuccess('Team updated successfully');
            setShowEditModal(false);
            loadData();
            loadTeamDetails(selectedTeam.id);
        } catch (err: any) { showError(err.message); }
        finally { setSaving(false); }
    };

    // ── Delete team ──────────────────────────────────────────────────────────
    const handleDelete = async (team: TeamApi) => {
        if (!confirm(`Delete team "${team.name}"? Members and projects will be unlinked.`)) return;
        try {
            await apiFetch(`/teams/${team.id}`, { method: 'DELETE' });
            showSuccess('Team deleted');
            if (selectedTeam?.id === team.id) setSelectedTeam(null);
            loadData();
        } catch (err: any) { showError(err.message); }
    };

    // ── Add member ───────────────────────────────────────────────────────────
    const handleAddMember = async () => {
        if (!selectedTeam || !addMemberId) { showError('Select a user to add'); return; }
        setSaving(true);
        try {
            await apiFetch(`/teams/${selectedTeam.id}/members`, {
                method: 'POST',
                body: JSON.stringify({ user_id: addMemberId }),
            });
            showSuccess('Member added to team');
            setShowMemberModal(false);
            setAddMemberId('');
            loadTeamDetails(selectedTeam.id);
            loadData();
        } catch (err: any) { showError(err.message); }
        finally { setSaving(false); }
    };

    // ── Remove member ────────────────────────────────────────────────────────
    const handleRemoveMember = async (userId: string, userName: string) => {
        if (!selectedTeam) return;
        if (!confirm(`Remove ${userName} from team?`)) return;
        try {
            await apiFetch(`/teams/${selectedTeam.id}/members/${userId}`, { method: 'DELETE' });
            showSuccess('Member removed from team');
            loadTeamDetails(selectedTeam.id);
            loadData();
        } catch (err: any) { showError(err.message); }
    };

    // ── Assign project ───────────────────────────────────────────────────────
    const handleAssignProject = async () => {
        if (!selectedTeam || !addProjectId) { showError('Select a project to assign'); return; }
        setSaving(true);
        try {
            await apiFetch(`/teams/${selectedTeam.id}/projects`, {
                method: 'POST',
                body: JSON.stringify({ project_id: addProjectId }),
            });
            showSuccess('Project assigned to team');
            setShowProjectModal(false);
            setAddProjectId('');
            loadTeamDetails(selectedTeam.id);
            loadData();
        } catch (err: any) { showError(err.message); }
        finally { setSaving(false); }
    };

    // ── Unassign project ─────────────────────────────────────────────────────
    const handleUnassignProject = async (projectId: string, projectName: string) => {
        if (!selectedTeam) return;
        if (!confirm(`Unassign "${projectName}" from this team?`)) return;
        try {
            await apiFetch(`/teams/${selectedTeam.id}/projects/${projectId}`, { method: 'DELETE' });
            showSuccess('Project unassigned');
            loadTeamDetails(selectedTeam.id);
            loadData();
        } catch (err: any) { showError(err.message); }
    };

    const managers = users.filter(u => ['manager', 'admin'].includes(u.role));
    const unassignedUsers = users.filter(u => !u.team_id || (selectedTeam && u.team_id === selectedTeam.id ? false : !u.team_id));
    const unassignedProjects = projects.filter(p => !p.team_id || p.team_id === selectedTeam?.id);

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-950 flex items-center justify-center">
                <div className="flex items-center gap-3 text-slate-500">
                    <svg className="animate-spin w-6 h-6" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Loading teams...
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-950 pb-12">

            {/* Header */}
            <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg border-b border-slate-200/50 dark:border-slate-700/50 sticky top-0 z-20 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex justify-between items-center">
                        <div>
                            <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                                Team Management
                            </h1>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                Create teams, assign managers, members, and projects
                            </p>
                        </div>
                        <button
                            onClick={() => { setFormName(''); setFormDescription(''); setFormManagerId(''); setShowCreateModal(true); }}
                            className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold rounded-xl shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5 transition-all"
                        >
                            + New Team
                        </button>
                    </div>
                </div>
            </div>

            {/* Toast messages */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 space-y-2">
                {success && (
                    <div className="p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-xl text-green-700 dark:text-green-300 text-sm flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {success}
                    </div>
                )}
                {error && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-sm flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {error}
                    </div>
                )}
            </div>

            {/* Main layout: team list + detail panel */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex gap-6">

                {/* Team list */}
                <div className="w-80 flex-shrink-0 space-y-3">
                    {teams.length === 0 && (
                        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center text-slate-400 text-sm">
                            No teams yet. Create one to get started.
                        </div>
                    )}
                    {teams.map(team => (
                        <div
                            key={team.id}
                            onClick={() => loadTeamDetails(team.id)}
                            className={`bg-white dark:bg-slate-800 rounded-2xl border cursor-pointer p-5 transition-all hover:shadow-md ${
                                selectedTeam?.id === team.id
                                    ? 'border-indigo-400 dark:border-indigo-500 shadow-md ring-2 ring-indigo-200 dark:ring-indigo-900'
                                    : 'border-slate-200 dark:border-slate-700'
                            }`}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <h3 className="font-semibold text-slate-900 dark:text-white truncate">{team.name}</h3>
                                    {team.manager_name && (
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Manager: {team.manager_name}</p>
                                    )}
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleDelete(team); }}
                                    className="text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 transition-colors flex-shrink-0"
                                    title="Delete team"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                            </div>
                            <div className="flex gap-3 mt-3 text-xs text-slate-500 dark:text-slate-400">
                                <span className="flex items-center gap-1">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                    {team.member_count ?? 0} members
                                </span>
                                <span className="flex items-center gap-1">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                                    {team.project_count ?? 0} projects
                                </span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Team detail panel */}
                <div className="flex-1 min-w-0">
                    {!selectedTeam ? (
                        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-12 text-center text-slate-400">
                            <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            <p className="text-sm">Select a team to view and manage its details</p>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            {/* Team header */}
                            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-900 dark:text-white">{selectedTeam.name}</h2>
                                        {selectedTeam.description && (
                                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{selectedTeam.description}</p>
                                        )}
                                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                                            Manager: <span className="font-medium text-slate-700 dark:text-slate-300">{selectedTeam.manager_name || '—'}</span>
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setFormName(selectedTeam.name);
                                            setFormDescription(selectedTeam.description || '');
                                            setFormManagerId(selectedTeam.manager_id || '');
                                            setShowEditModal(true);
                                        }}
                                        className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-xl transition-all"
                                    >
                                        Edit Team
                                    </button>
                                </div>
                            </div>

                            {/* Members */}
                            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-semibold text-slate-900 dark:text-white">
                                        Members
                                        <span className="ml-2 text-xs font-normal text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-full px-2 py-0.5">
                                            {selectedTeam.members?.length ?? 0}
                                        </span>
                                    </h3>
                                    <button
                                        onClick={() => { setAddMemberId(''); setShowMemberModal(true); }}
                                        className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 font-medium"
                                    >
                                        + Add Member
                                    </button>
                                </div>
                                {selectedTeam.members?.length === 0 && (
                                    <p className="text-sm text-slate-400 text-center py-4">No members assigned yet</p>
                                )}
                                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                                    {selectedTeam.members?.map(m => (
                                        <div key={m.id} className="flex items-center justify-between py-3">
                                            <div>
                                                <p className="text-sm font-medium text-slate-900 dark:text-white">{m.name}</p>
                                                <p className="text-xs text-slate-400">{m.email} · <span className="capitalize">{m.role}</span></p>
                                            </div>
                                            <button
                                                onClick={() => handleRemoveMember(m.id, m.name)}
                                                className="text-xs text-slate-400 hover:text-red-500 transition-colors"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Projects */}
                            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-semibold text-slate-900 dark:text-white">
                                        Projects
                                        <span className="ml-2 text-xs font-normal text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-full px-2 py-0.5">
                                            {selectedTeam.projects?.length ?? 0}
                                        </span>
                                    </h3>
                                    <button
                                        onClick={() => { setAddProjectId(''); setShowProjectModal(true); }}
                                        className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 font-medium"
                                    >
                                        + Assign Project
                                    </button>
                                </div>
                                {selectedTeam.projects?.length === 0 && (
                                    <p className="text-sm text-slate-400 text-center py-4">No projects assigned yet</p>
                                )}
                                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                                    {selectedTeam.projects?.map(p => (
                                        <div key={p.id} className="flex items-center justify-between py-3">
                                            <div>
                                                <p className="text-sm font-medium text-slate-900 dark:text-white">{p.project_name}</p>
                                                <p className="text-xs text-slate-400">{p.project_id} · <span className="capitalize">{p.status}</span></p>
                                            </div>
                                            <button
                                                onClick={() => handleUnassignProject(p.id, p.project_name)}
                                                className="text-xs text-slate-400 hover:text-red-500 transition-colors"
                                            >
                                                Unassign
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Modals ── */}

            {/* Create Team Modal */}
            {showCreateModal && (
                <Modal title="Create Team" onClose={() => setShowCreateModal(false)}>
                    <TeamForm
                        name={formName} onNameChange={setFormName}
                        description={formDescription} onDescriptionChange={setFormDescription}
                        managerId={formManagerId} onManagerIdChange={setFormManagerId}
                        managers={managers}
                        onSubmit={handleCreate}
                        onCancel={() => setShowCreateModal(false)}
                        saving={saving}
                        submitLabel="Create Team"
                    />
                </Modal>
            )}

            {/* Edit Team Modal */}
            {showEditModal && selectedTeam && (
                <Modal title="Edit Team" onClose={() => setShowEditModal(false)}>
                    <TeamForm
                        name={formName} onNameChange={setFormName}
                        description={formDescription} onDescriptionChange={setFormDescription}
                        managerId={formManagerId} onManagerIdChange={setFormManagerId}
                        managers={managers}
                        onSubmit={handleUpdate}
                        onCancel={() => setShowEditModal(false)}
                        saving={saving}
                        submitLabel="Save Changes"
                    />
                </Modal>
            )}

            {/* Add Member Modal */}
            {showMemberModal && selectedTeam && (
                <Modal title="Add Member to Team" onClose={() => setShowMemberModal(false)}>
                    <div className="space-y-4">
                        <p className="text-sm text-slate-500">Select a user to add to <strong>{selectedTeam.name}</strong>. Users already assigned to another team cannot be added.</p>
                        <select
                            value={addMemberId}
                            onChange={e => setAddMemberId(e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="">Select a user...</option>
                            {users
                                .filter(u => !u.team_id || u.team_id === selectedTeam.id)
                                .map(u => (
                                    <option key={u.id} value={u.id}>
                                        {u.name} ({u.email}) — {u.role}
                                    </option>
                                ))
                            }
                        </select>
                        <div className="flex gap-3 justify-end">
                            <button onClick={() => setShowMemberModal(false)} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all">Cancel</button>
                            <button onClick={handleAddMember} disabled={saving || !addMemberId} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium rounded-lg transition-all">
                                {saving ? 'Adding...' : 'Add Member'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Assign Project Modal */}
            {showProjectModal && selectedTeam && (
                <Modal title="Assign Project to Team" onClose={() => setShowProjectModal(false)}>
                    <div className="space-y-4">
                        <p className="text-sm text-slate-500">Select a project to assign to <strong>{selectedTeam.name}</strong>. Projects already assigned to another team cannot be reassigned here.</p>
                        <select
                            value={addProjectId}
                            onChange={e => setAddProjectId(e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="">Select a project...</option>
                            {projects
                                .filter(p => !p.team_id || p.team_id === selectedTeam.id)
                                .map(p => (
                                    <option key={p.id} value={p.id}>
                                        {p.project_name} ({p.project_id})
                                    </option>
                                ))
                            }
                        </select>
                        <div className="flex gap-3 justify-end">
                            <button onClick={() => setShowProjectModal(false)} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all">Cancel</button>
                            <button onClick={handleAssignProject} disabled={saving || !addProjectId} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium rounded-lg transition-all">
                                {saving ? 'Assigning...' : 'Assign Project'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
                    <h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div className="p-6">{children}</div>
            </div>
        </div>
    );
}

interface TeamFormProps {
    name: string; onNameChange: (v: string) => void;
    description: string; onDescriptionChange: (v: string) => void;
    managerId: string; onManagerIdChange: (v: string) => void;
    managers: User[];
    onSubmit: () => void;
    onCancel: () => void;
    saving: boolean;
    submitLabel: string;
}

function TeamForm({ name, onNameChange, description, onDescriptionChange, managerId, onManagerIdChange, managers, onSubmit, onCancel, saving, submitLabel }: TeamFormProps) {
    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Team Name *</label>
                <input
                    type="text"
                    value={name}
                    onChange={e => onNameChange(e.target.value)}
                    placeholder="e.g. QA Backend Team"
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
                <textarea
                    value={description}
                    onChange={e => onDescriptionChange(e.target.value)}
                    rows={2}
                    placeholder="Optional team description"
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Manager</label>
                <select
                    value={managerId}
                    onChange={e => onManagerIdChange(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500"
                >
                    <option value="">No manager assigned</option>
                    {managers.map(m => (
                        <option key={m.id} value={m.id}>{m.name} ({m.email}) — {m.role}</option>
                    ))}
                </select>
            </div>
            <div className="flex gap-3 justify-end pt-2">
                <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all">Cancel</button>
                <button onClick={onSubmit} disabled={saving || !name.trim()} className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:from-slate-400 disabled:to-slate-500 text-white text-sm font-medium rounded-lg transition-all">
                    {saving ? 'Saving...' : submitLabel}
                </button>
            </div>
        </div>
    );
}

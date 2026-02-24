'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { fetchApi } from '../../../src/lib/api';
import { useAuth } from '../../../src/components/providers/AuthProvider';

interface TeamMember {
    id: string;
    name: string;
    email: string;
    role: string;
    active: boolean;
    onboarding_completed: boolean;
    probation_completed: boolean;
    is_resource: boolean;
    team_id?: string;
    total_xp?: number;
}

interface JourneyProgress {
    total_tasks: number;
    mandatory_tasks: number;
    completed_tasks: number;
    mandatory_completed: number;
    completion_pct: number;
}

interface TeamJourney {
    id: string;
    journey_id: string;
    title: string;
    description?: string;
    status: 'assigned' | 'in_progress' | 'completed';
    total_xp: number;
    assigned_at: string;
    started_at?: string;
    completed_at?: string;
    progress: JourneyProgress;
}

export default function TeamJourneysPage() {
    const [team, setTeam] = useState<TeamMember[]>([]);
    const [eligibleResources, setEligibleResources] = useState<TeamMember[]>([]);
    const [selectedUser, setSelectedUser] = useState<TeamMember | null>(null);
    const [journeys, setJourneys] = useState<TeamJourney[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingJourneys, setLoadingJourneys] = useState(false);
    const [error, setError] = useState('');
    const { isAdmin } = useAuth();
    const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set(['unassigned']));

    const fetchEligibleResources = useCallback(() => {
        fetchApi<TeamMember[]>('/manager/eligible-resources')
            .then(data => setEligibleResources(data))
            .catch(() => setEligibleResources([]));
    }, []);

    useEffect(() => {
        fetchApi<TeamMember[]>('/manager/team')
            .then(data => setTeam(data))
            .catch(err => setError(err.message || 'Failed to load team'))
            .finally(() => setLoading(false));

        fetchEligibleResources();
    }, [fetchEligibleResources]);

    const handleCompleteProbation = async (userId: string) => {
        try {
            await fetchApi(`/manager/team/${userId}/probation`, {
                method: 'PATCH',
                body: JSON.stringify({ completed: true })
            });
            setTeam(prev => prev.map(m => m.id === userId ? { ...m, probation_completed: true } : m));
            if (selectedUser?.id === userId) setSelectedUser(prev => ({ ...prev!, probation_completed: true }));
            fetchEligibleResources();
        } catch (err: any) {
            alert(err.message || 'Failed to complete probation');
        }
    };

    const handleAssignResource = async (userId: string) => {
        if (!userId) return;
        try {
            await fetchApi(`/manager/team/${userId}/make-resource`, { method: 'POST' });
            setTeam(prev => prev.map(m => m.id === userId ? { ...m, is_resource: true } : m));
            if (selectedUser?.id === userId) setSelectedUser(prev => ({ ...prev!, is_resource: true }));
            fetchEligibleResources();
        } catch (err: any) {
            alert(err.message || 'Failed to assign resource');
        }
    };

    const selectUser = useCallback(async (user: TeamMember) => {
        setSelectedUser(user);
        setLoadingJourneys(true);
        try {
            const [journeyData, userData] = await Promise.all([
                fetchApi<TeamJourney[]>(`/manager/team/${user.id}/journeys`),
                fetchApi<TeamMember>(`/manager/team/${user.id}`),
            ]);
            setJourneys(journeyData);
            setSelectedUser(userData);
        } catch (err: any) {
            setError(err.message || 'Failed to load journeys');
        } finally {
            setLoadingJourneys(false);
        }
    }, []);

    const statusConfig = {
        assigned: { label: 'Not Started', classes: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
        in_progress: { label: 'In Progress', classes: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400' },
        completed: { label: 'Completed', classes: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' },
    };

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Team Journey Progress</h1>
                <p className="text-slate-500 dark:text-slate-400 mt-1">Monitor your direct reports&apos; journey completion, XP, and audit history. Read-only.</p>
            </div>

            {error && (
                <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-lg text-sm text-rose-700 dark:text-rose-400">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center h-48">
                    <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Team list */}
                    <div className="lg:col-span-1 border-slate-200 dark:border-slate-800">

                        {/* Assign Resource Dropdown */}
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden mb-6 p-4 flex gap-3 items-center">
                            <select
                                className="flex-1 bg-slate-50 dark:bg-slate-800 border-none rounded-lg text-sm px-3 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                onChange={(e) => {
                                    handleAssignResource(e.target.value);
                                    e.target.value = '';
                                }}
                            >
                                <option value="">Assign eligible user as resource...</option>
                                {eligibleResources.map(r => (
                                    <option key={r.id} value={r.id}>{r.name} ({r.email})</option>
                                ))}
                            </select>
                        </div>

                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                            <div className="p-4 border-b border-slate-200 dark:border-slate-800">
                                <h2 className="font-semibold text-slate-900 dark:text-white text-sm">
                                    {isAdmin ? 'All Teams' : 'Direct Reports'} ({team.length})
                                </h2>
                            </div>
                            {team.length === 0 ? (
                                <div className="p-8 text-center text-slate-400 text-sm">No team members found. Ask an admin to assign users to your team.</div>
                            ) : isAdmin ? (
                                <div className="divide-y divide-slate-100 dark:divide-slate-800 pb-2">
                                    {Object.entries(
                                        team.reduce((acc, member) => {
                                            const teamId = member.team_id || 'unassigned';
                                            if (!acc[teamId]) acc[teamId] = [];
                                            acc[teamId].push(member);
                                            return acc;
                                        }, {} as Record<string, TeamMember[]>)
                                    ).map(([teamId, members]) => (
                                        <div key={teamId} className="pt-2">
                                            <button
                                                onClick={() => setExpandedTeams(prev => {
                                                    const next = new Set(prev);
                                                    if (next.has(teamId)) next.delete(teamId);
                                                    else next.add(teamId);
                                                    return next;
                                                })}
                                                className="w-full flex items-center justify-between px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                            >
                                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                                    {teamId === 'unassigned' ? 'Unassigned / Global' : `Team ${teamId.split('-')[0]}`} ({members.length})
                                                </span>
                                                <svg className={`w-4 h-4 text-slate-400 transition-transform ${expandedTeams.has(teamId) ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </button>
                                            {expandedTeams.has(teamId) && (
                                                <ul className="mt-1">
                                                    {members.map(member => (
                                                        <li key={member.id}>
                                                            <button
                                                                onClick={() => selectUser(member)}
                                                                className={`w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${selectedUser?.id === member.id ? 'bg-indigo-50 dark:bg-indigo-950/30' : ''}`}
                                                            >
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center flex-shrink-0">
                                                                        <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                                                                            {member.name?.charAt(0)?.toUpperCase() || '?'}
                                                                        </span>
                                                                    </div>
                                                                    <div className="min-w-0 flex-1">
                                                                        <div className="flex items-center gap-2">
                                                                            <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{member.name}</p>
                                                                            {member.is_resource ? (
                                                                                <span className="text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 px-1.5 py-0.5 rounded">Resource</span>
                                                                            ) : (
                                                                                <span className="text-[10px] bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 px-1.5 py-0.5 rounded">Normal User</span>
                                                                            )}
                                                                        </div>
                                                                        <div className="flex items-center justify-between mt-0.5">
                                                                            <p className="text-xs text-slate-400 truncate">{member.email}</p>
                                                                            {!member.probation_completed && (
                                                                                <span className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800 flex-shrink-0">Probation</span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </button>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {team.map(member => (
                                        <li key={member.id}>
                                            <button
                                                onClick={() => selectUser(member)}
                                                className={`w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${selectedUser?.id === member.id ? 'bg-indigo-50 dark:bg-indigo-950/30' : ''}`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center flex-shrink-0">
                                                        <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                                                            {member.name?.charAt(0)?.toUpperCase() || '?'}
                                                        </span>
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{member.name}</p>
                                                            {member.is_resource ? (
                                                                <span className="text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 px-1.5 py-0.5 rounded">Resource</span>
                                                            ) : (
                                                                <span className="text-[10px] bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 px-1.5 py-0.5 rounded">Normal User</span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center justify-between mt-0.5">
                                                            <p className="text-xs text-slate-400 truncate">{member.email}</p>
                                                            {!member.probation_completed && (
                                                                <span className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800 flex-shrink-0">Probation</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>

                    {/* Journey details panel */}
                    <div className="lg:col-span-2">
                        {!selectedUser ? (
                            <div className="flex items-center justify-center h-full min-h-[300px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
                                <div className="text-center text-slate-400">
                                    <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                    <p className="text-sm">Select a team member to view their journey progress</p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* User header */}
                                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
                                            <span className="text-lg font-bold text-indigo-700 dark:text-indigo-300">
                                                {selectedUser.name?.charAt(0)?.toUpperCase() || '?'}
                                            </span>
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3">
                                                <h2 className="font-bold text-slate-900 dark:text-white">{selectedUser.name}</h2>
                                                {selectedUser.is_resource ? (
                                                    <span className="text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 px-2 py-0.5 rounded">Resource</span>
                                                ) : (
                                                    <span className="text-xs bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 px-2 py-0.5 rounded">Normal User</span>
                                                )}
                                            </div>
                                            <p className="text-sm text-slate-400 mt-1">{selectedUser.email} · {selectedUser.role}</p>

                                            {!selectedUser.probation_completed && (
                                                <button
                                                    onClick={() => handleCompleteProbation(selectedUser.id)}
                                                    className="mt-3 text-xs font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/50 dark:hover:bg-amber-900/70 dark:text-amber-300 px-3 py-1.5 rounded transition-colors"
                                                >
                                                    Mark Probation Complete
                                                </button>
                                            )}
                                        </div>
                                        {(selectedUser as any).total_xp !== undefined && (
                                            <div className="text-right">
                                                <p className="text-2xl font-bold text-violet-600 dark:text-violet-400">{(selectedUser as any).total_xp}</p>
                                                <p className="text-xs text-slate-400">Total XP</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Journey list */}
                                {loadingJourneys ? (
                                    <div className="flex items-center justify-center h-32">
                                        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                                    </div>
                                ) : journeys.length === 0 ? (
                                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-slate-400 text-sm">
                                        No journeys assigned to this user.
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {journeys.map(journey => {
                                            const statusCfg = statusConfig[journey.status] || statusConfig.assigned;
                                            return (
                                                <Link key={journey.id} href={`/settings/team-journeys/${selectedUser?.id}/${journey.journey_id}`} className="block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors">
                                                    <div className="flex items-start justify-between mb-3">
                                                        <div>
                                                            <h3 className="font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{journey.title}</h3>
                                                            {journey.description && <p className="text-sm text-slate-400 mt-0.5 line-clamp-1">{journey.description}</p>}
                                                        </div>
                                                        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                                                            {journey.total_xp > 0 && (
                                                                <span className="text-xs font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/50 px-2 py-0.5 rounded-full">
                                                                    {journey.total_xp} XP
                                                                </span>
                                                            )}
                                                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusCfg.classes}`}>
                                                                {statusCfg.label}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Progress bar */}
                                                    <div className="mb-2">
                                                        <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                                                            <span>{journey.progress.mandatory_completed}/{journey.progress.mandatory_tasks} mandatory tasks</span>
                                                            <span className="font-medium">{journey.progress.completion_pct}%</span>
                                                        </div>
                                                        <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full rounded-full ${journey.status === 'completed' ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                                                style={{ width: `${journey.progress.completion_pct}%` }}
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Audit timestamps */}
                                                    <div className="flex items-center gap-4 text-xs text-slate-400 mt-2">
                                                        <span>Assigned: {new Date(journey.assigned_at).toLocaleDateString()}</span>
                                                        {journey.started_at && <span>Started: {new Date(journey.started_at).toLocaleDateString()}</span>}
                                                        {journey.completed_at && (
                                                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                                                ✓ Completed: {new Date(journey.completed_at).toLocaleDateString()}
                                                            </span>
                                                        )}
                                                    </div>
                                                </Link>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

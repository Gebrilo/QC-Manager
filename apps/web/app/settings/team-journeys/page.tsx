'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchApi } from '../../../src/lib/api';

interface TeamMember {
    id: string;
    name: string;
    email: string;
    role: string;
    active: boolean;
    onboarding_completed: boolean;
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
    const [selectedUser, setSelectedUser] = useState<TeamMember | null>(null);
    const [journeys, setJourneys] = useState<TeamJourney[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingJourneys, setLoadingJourneys] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchApi<TeamMember[]>('/manager/team')
            .then(data => setTeam(data))
            .catch(err => setError(err.message || 'Failed to load team'))
            .finally(() => setLoading(false));
    }, []);

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
                    <div className="lg:col-span-1">
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                            <div className="p-4 border-b border-slate-200 dark:border-slate-800">
                                <h2 className="font-semibold text-slate-900 dark:text-white text-sm">Direct Reports ({team.length})</h2>
                            </div>
                            {team.length === 0 ? (
                                <div className="p-8 text-center text-slate-400 text-sm">No team members found. Ask an admin to assign users to your team.</div>
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
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{member.name}</p>
                                                        <p className="text-xs text-slate-400 truncate">{member.email}</p>
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
                                            <h2 className="font-bold text-slate-900 dark:text-white">{selectedUser.name}</h2>
                                            <p className="text-sm text-slate-400">{selectedUser.email} · {selectedUser.role}</p>
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
                                                <div key={journey.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                                                    <div className="flex items-start justify-between mb-3">
                                                        <div>
                                                            <h3 className="font-semibold text-slate-900 dark:text-white">{journey.title}</h3>
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
                                                </div>
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

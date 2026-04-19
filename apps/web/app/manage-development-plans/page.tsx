'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { developmentPlansApi, IDPPlan, fetchApi } from '../../src/lib/api';

interface TeamMember {
    id: string;
    name: string;
    email: string;
    status: string;
}

interface MemberWithPlan extends TeamMember {
    plan: IDPPlan | null;
    planLoading: boolean;
}

export default function ManageDevelopmentPlansPage() {
    const [members, setMembers] = useState<MemberWithPlan[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        async function load() {
            try {
                const team = await fetchApi<TeamMember[]>('/api/manager/team?status=ACTIVE');
                const withPlans: MemberWithPlan[] = team.map(m => ({ ...m, plan: null, planLoading: true }));
                setMembers(withPlans);
                setIsLoading(false);

                const planResults = await Promise.allSettled(
                    team.map(m => developmentPlansApi.getForUser(m.id))
                );
                setMembers(team.map((m, i) => ({
                    ...m,
                    plan: planResults[i].status === 'fulfilled'
                        ? (Array.isArray(planResults[i].value) ? (planResults[i].value as IDPPlan[]).find(p => p.is_active) || (planResults[i].value as IDPPlan[])[0] || null : planResults[i].value as IDPPlan)
                        : null,
                    planLoading: false,
                })));
            } catch {
                setIsLoading(false);
            }
        }
        load();
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto px-4 py-8">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Development Plans</h1>
            <p className="text-slate-500 dark:text-slate-400 mb-8">Manage individual development plans for your active team members.</p>

            {members.length === 0 ? (
                <div className="text-center py-16 text-slate-500 dark:text-slate-400">
                    No active team members found.
                </div>
            ) : (
                <div className="space-y-3">
                    {members.map(member => (
                        <div key={member.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold text-slate-900 dark:text-white truncate">{member.name}</p>
                                <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{member.email}</p>
                            </div>

                            <div className="flex-1 min-w-0">
                                {member.planLoading ? (
                                    <div className="h-2 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                                ) : member.plan ? (
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                                {member.plan.progress.completion_pct}%
                                            </span>
                                            {member.plan.progress.overdue_tasks > 0 && (
                                                <span className="text-xs bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 px-2 py-0.5 rounded-full">
                                                    {member.plan.progress.overdue_tasks} overdue
                                                </span>
                                            )}
                                        </div>
                                        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
                                            <div
                                                className="bg-indigo-500 h-1.5 rounded-full transition-all"
                                                style={{ width: `${member.plan.progress.completion_pct}%` }}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <span className="text-sm text-slate-400 dark:text-slate-500">No plan yet</span>
                                )}
                            </div>

                            <button
                                onClick={() => router.push(`/manage-development-plans/${member.id}`)}
                                className="shrink-0 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                            >
                                {member.plan ? 'View Plan' : 'Create Plan'}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

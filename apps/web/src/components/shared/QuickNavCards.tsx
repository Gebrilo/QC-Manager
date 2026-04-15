'use client';

import type { AssignedJourney } from '@/lib/api';

export function QuickNavCards({ journeys, pendingTasks }: {
    journeys: AssignedJourney[];
    pendingTasks: number;
}) {
    if (journeys.length === 0 && pendingTasks === 0) return null;

    const statusConfig: Record<string, { label: string; classes: string }> = {
        assigned: { label: 'Not Started', classes: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
        in_progress: { label: 'In Progress', classes: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400' },
        completed: { label: 'Completed', classes: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' },
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Quick Access</h2>
                <a href="/preferences" className="text-xs text-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Manage in Preferences →</a>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {/* Tasks summary card */}
                <a href="/my-tasks"
                    className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-all group">
                    <div className="w-10 h-10 rounded-lg bg-violet-50 dark:bg-violet-950 flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                        </svg>
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">My Tasks</p>
                        <p className="text-xs text-slate-400">{pendingTasks} pending</p>
                    </div>
                </a>

                {/* Journey cards */}
                {journeys.slice(0, 6).map(j => {
                    const isLocked = j.is_locked;
                    const cfg = statusConfig[j.status] || statusConfig.assigned;
                    return (
                        <a
                            key={j.id}
                            href={isLocked ? undefined : `/journeys/${j.journey_id}`}
                            onClick={isLocked ? (e) => e.preventDefault() : undefined}
                            className={`bg-white dark:bg-slate-900 border rounded-xl p-4 transition-all group relative ${isLocked ? 'border-slate-200 dark:border-slate-800 opacity-60 cursor-not-allowed' : 'border-slate-200 dark:border-slate-800 hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 cursor-pointer'}`}
                        >
                            {isLocked && (
                                <div className="absolute top-3 right-3 flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-full">
                                    <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                </div>
                            )}
                            <div className="flex items-center gap-2 mb-2">
                                <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${isLocked ? 'bg-slate-100 dark:bg-slate-800' : 'bg-indigo-50 dark:bg-indigo-950'}`}>
                                    <svg className={`w-3.5 h-3.5 ${isLocked ? 'text-slate-400' : 'text-indigo-600 dark:text-indigo-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                    </svg>
                                </div>
                                {!isLocked && (
                                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${cfg.classes}`}>{cfg.label}</span>
                                )}
                            </div>
                            <p className={`text-sm font-semibold truncate transition-colors ${isLocked ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400'}`}>
                                {j.title}
                            </p>
                            {!isLocked && (
                                <>
                                    <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-2">
                                        <div
                                            className={`h-full rounded-full ${j.status === 'completed' ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                            style={{ width: `${j.progress?.completion_pct ?? 0}%` }}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between mt-1">
                                        <span className="text-xs text-slate-400">{j.progress?.completion_pct ?? 0}%</span>
                                        {(j.total_xp || 0) > 0 && (
                                            <span className="text-xs font-medium text-violet-500">{j.total_xp} XP</span>
                                        )}
                                    </div>
                                </>
                            )}
                            {isLocked && j.lock_reason && (
                                <p className="text-xs text-amber-500 mt-1.5">{j.lock_reason}</p>
                            )}
                        </a>
                    );
                })}
            </div>
        </div>
    );
}

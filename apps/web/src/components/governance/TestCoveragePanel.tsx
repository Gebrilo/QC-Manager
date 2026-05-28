'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/Badge';
import { getTestCoverage, getProjectReadiness } from '@/services/governanceApi';

interface TestCoveragePanelProps {
    projectId?: string;
}

export function TestCoveragePanel({ projectId }: TestCoveragePanelProps) {
    const [taskCoverage, setTaskCoverage] = useState<any[]>([]);
    const [storyCoverage, setStoryCoverage] = useState<any[]>([]);
    const [readiness, setReadiness] = useState<any | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function load() {
            setIsLoading(true);
            try {
                const [cov, ready] = await Promise.all([
                    getTestCoverage(projectId),
                    projectId ? getProjectReadiness(projectId) : Promise.resolve(null),
                ]);
                setTaskCoverage(cov.task_coverage);
                setStoryCoverage(cov.story_coverage);
                setReadiness(ready);
            } catch (err) {
                console.error('Failed to load test coverage', err);
            } finally {
                setIsLoading(false);
            }
        }
        load();
    }, [projectId]);

    if (isLoading) {
        return (
            <div className="animate-pulse space-y-3 py-4">
                <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full w-full" />
                <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full w-5/6" />
                <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full w-4/6" />
            </div>
        );
    }

    const readinessColor = readiness?.readiness_status === 'ready' ? 'text-emerald-600' :
        readiness?.readiness_status === 'blocked' ? 'text-rose-600' :
        readiness?.readiness_status === 'warning' ? 'text-amber-600' : 'text-slate-500';

    return (
        <div className="space-y-6">
            {readiness && (
                <div>
                    <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 mb-3">Project Readiness</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                        <div className="text-center">
                            <p className={`text-2xl font-bold ${readinessColor}`}>
                                {readiness.readiness_status?.toUpperCase() || 'UNKNOWN'}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">Status</p>
                        </div>
                        <div className="text-center">
                            <p className="text-2xl font-bold text-slate-900 dark:text-white">
                                {readiness.task_test_coverage_pct ?? 0}%
                            </p>
                            <p className="text-xs text-slate-500 mt-1">Task Coverage</p>
                        </div>
                        <div className="text-center">
                            <p className="text-2xl font-bold text-slate-900 dark:text-white">
                                {readiness.story_test_coverage_pct ?? 0}%
                            </p>
                            <p className="text-xs text-slate-500 mt-1">Story Coverage</p>
                        </div>
                        <div className="text-center">
                            <p className="text-2xl font-bold text-slate-900 dark:text-white">
                                {readiness.required_suites_with_completed_run ?? 0}/{readiness.required_suites_total ?? 0}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">Required Suites</p>
                        </div>
                    </div>
                    {readiness.risk_reasons?.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                            {readiness.risk_reasons.map((reason: string) => (
                                <Badge key={reason} variant="danger">{reason.replace(/_/g, ' ')}</Badge>
                            ))}
                        </div>
                    )}
                    {readiness.untriaged_bugs > 0 && (
                        <p className="text-sm text-amber-600">
                            {readiness.untriaged_bugs} untriaged bug{readiness.untriaged_bugs !== 1 ? 's' : ''} need attention
                        </p>
                    )}
                </div>
            )}

            <div className="grid grid-cols-2 gap-8">
                <div>
                    <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 mb-3">Task Test Coverage</div>
                    {taskCoverage.length === 0 ? (
                        <p className="text-sm text-slate-500 italic">No coverage data available.</p>
                    ) : (
                        <div className="space-y-2.5">
                            {taskCoverage.map(row => {
                                const pct = Math.min(100, parseFloat(row.task_test_coverage_pct) || 0);
                                return (
                                    <div key={row.project_id} className="flex items-center gap-3">
                                        <div className="w-8 text-[11px] font-bold text-slate-600 dark:text-slate-300 flex-shrink-0 truncate">{row.project_name?.slice(0,3)}</div>
                                        <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                            <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                                        </div>
                                        <div className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400 w-36 text-right flex-shrink-0">
                                            {row.tasks_with_active_test_cases}/{row.total_tasks} tasks <span className="font-semibold text-slate-700 dark:text-slate-200">{pct.toFixed(1)}%</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {storyCoverage.length > 0 && (
                    <div>
                        <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 mb-3">Story Test Coverage</div>
                        <div className="space-y-2.5">
                            {storyCoverage.map(row => {
                                const pct = Math.min(100, parseFloat(row.story_test_coverage_pct) || 0);
                                return (
                                    <div key={row.project_id} className="flex items-center gap-3">
                                        <div className="w-8 text-[11px] font-bold text-slate-600 dark:text-slate-300 flex-shrink-0 truncate">{row.project_name?.slice(0,3)}</div>
                                        <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                            <div className="h-full rounded-full bg-violet-500" style={{ width: `${pct}%` }} />
                                        </div>
                                        <div className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400 w-36 text-right flex-shrink-0">
                                            {row.user_stories_with_active_test_cases}/{row.total_user_stories} stories <span className="font-semibold text-slate-700 dark:text-slate-200">{pct.toFixed(1)}%</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

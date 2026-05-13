'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
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
            <Card>
                <CardContent>
                    <div className="flex items-center justify-center py-8">
                        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    const readinessColor = readiness?.readiness_status === 'ready' ? 'text-emerald-600' :
        readiness?.readiness_status === 'blocked' ? 'text-rose-600' :
        readiness?.readiness_status === 'warning' ? 'text-amber-600' : 'text-slate-500';

    return (
        <div className="space-y-6">
            {readiness && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm uppercase tracking-wider text-slate-400">Project Readiness</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                            <div className="mt-4 flex flex-wrap gap-2">
                                {readiness.risk_reasons.map((reason: string) => (
                                    <Badge key={reason} variant="danger">{reason.replace(/_/g, ' ')}</Badge>
                                ))}
                            </div>
                        )}
                        {readiness.untriaged_bugs > 0 && (
                            <p className="mt-3 text-sm text-amber-600">
                                {readiness.untriaged_bugs} untriaged bug{readiness.untriaged_bugs !== 1 ? 's' : ''} need attention
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="text-sm uppercase tracking-wider text-slate-400">Task Test Coverage</CardTitle>
                </CardHeader>
                <CardContent>
                    {taskCoverage.length === 0 ? (
                        <p className="text-sm text-slate-500 italic">No coverage data available.</p>
                    ) : (
                        <div className="space-y-3">
                            {taskCoverage.map(row => (
                                <div key={row.project_id} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                                    <span className="text-sm font-medium text-slate-900 dark:text-white">{row.project_name}</span>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-slate-500">{row.tasks_with_active_test_cases}/{row.total_tasks} tasks</span>
                                        <div className="w-24 bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                                            <div
                                                className="h-2 rounded-full bg-indigo-500"
                                                style={{ width: `${Math.min(100, parseFloat(row.task_test_coverage_pct) || 0)}%` }}
                                            />
                                        </div>
                                        <span className="text-sm font-semibold text-slate-900 dark:text-white w-12 text-right">{parseFloat(row.task_test_coverage_pct).toFixed(1)}%</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {storyCoverage.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm uppercase tracking-wider text-slate-400">Story Test Coverage</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {storyCoverage.map(row => (
                                <div key={row.project_id} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                                    <span className="text-sm font-medium text-slate-900 dark:text-white">{row.project_name}</span>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-slate-500">{row.user_stories_with_active_test_cases}/{row.total_user_stories} stories</span>
                                        <div className="w-24 bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                                            <div
                                                className="h-2 rounded-full bg-violet-500"
                                                style={{ width: `${Math.min(100, parseFloat(row.story_test_coverage_pct) || 0)}%` }}
                                            />
                                        </div>
                                        <span className="text-sm font-semibold text-slate-900 dark:text-white w-12 text-right">{parseFloat(row.story_test_coverage_pct).toFixed(1)}%</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
'use client';

import React, { useEffect, useState } from 'react';
import { DonutChart } from '../dashboard/ChartComponents';
import { fetchApi } from '@/lib/api';

interface TestExecutionSummary {
    total_test_runs: number;
    total_executions: number;
    total_passed: number;
    total_failed: number;
    total_not_run: number;
    total_blocked: number;
    total_skipped: number;
    overall_pass_rate: number;
    last_execution_date: string | null;
}

interface RecentRun {
    id: string;
    run_id: string;
    name: string;
    status: string;
    started_at: string;
    project_name: string;
    total_cases: number;
    passed: number;
    failed: number;
    pass_rate: number;
}

interface TestExecutionSummaryData {
    summary: TestExecutionSummary;
    recent_runs: RecentRun[];
}

export function TestExecutionSummaryWidget() {
    const [data, setData] = useState<TestExecutionSummaryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadData() {
            try {
                setLoading(true);
                const result = await fetchApi<TestExecutionSummaryData>('/test-executions/summary');
                setData(result);
            } catch (err: any) {
                console.error('Error loading test execution summary:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, []);

    if (loading) {
        return (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                <div className="animate-pulse space-y-4">
                    <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-1/3"></div>
                    <div className="grid grid-cols-4 gap-4">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="h-20 bg-slate-200 dark:bg-slate-700 rounded"></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                <p className="text-rose-500">Error loading test execution data: {error}</p>
            </div>
        );
    }

    const summary = data?.summary;
    const recentRuns = data?.recent_runs || [];

    // Prepare donut chart data
    const donutData = summary ? [
        { label: 'Passed', value: summary.total_passed, color: '#22c55e' },
        { label: 'Failed', value: summary.total_failed, color: '#ef4444' },
        { label: 'Not Run', value: summary.total_not_run, color: '#94a3b8' },
        { label: 'Blocked', value: summary.total_blocked, color: '#f59e0b' },
        { label: 'Skipped', value: summary.total_skipped, color: '#8b5cf6' },
    ].filter(d => d.value > 0) : [];

    const hasExecutions = summary && summary.total_executions > 0;

    return (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
            {/* Header */}
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Test Execution Overview</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    {summary?.last_execution_date
                        ? `Last execution: ${new Date(summary.last_execution_date).toLocaleDateString()}`
                        : 'No test executions yet'}
                </p>
            </div>

            {/* Summary Cards */}
            <div className="p-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <StatCard
                        label="Total Runs"
                        value={summary?.total_test_runs || 0}
                        color="indigo"
                    />
                    <StatCard
                        label="Pass Rate"
                        value={`${summary?.overall_pass_rate || 0}%`}
                        color={summary && summary.overall_pass_rate >= 80 ? 'green' : summary && summary.overall_pass_rate >= 60 ? 'yellow' : 'red'}
                    />
                    <StatCard
                        label="Failed Tests"
                        value={summary?.total_failed || 0}
                        color="red"
                    />
                    <StatCard
                        label="Blocked"
                        value={summary?.total_blocked || 0}
                        color="amber"
                    />
                </div>

                {/* Chart and Recent Runs */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Donut Chart */}
                    <div>
                        <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4">Execution Results Distribution</h4>
                        {hasExecutions ? (
                            <div className="h-56">
                                <DonutChart
                                    data={donutData}
                                    size={200}
                                />
                            </div>
                        ) : (
                            <div className="h-56 flex items-center justify-center text-slate-400">
                                No test execution data available
                            </div>
                        )}
                    </div>

                    {/* Recent Runs */}
                    <div>
                        <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4">Recent Test Runs</h4>
                        {recentRuns.length > 0 ? (
                            <div className="space-y-2 max-h-56 overflow-y-auto">
                                {recentRuns.slice(0, 5).map(run => (
                                    <div
                                        key={run.id}
                                        className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-sm text-slate-900 dark:text-white truncate">
                                                {run.name}
                                            </div>
                                            <div className="text-xs text-slate-500">
                                                {run.project_name || 'Unknown Project'} • {run.total_cases} tests
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 ml-4">
                                            <span className={`text-sm font-bold ${run.pass_rate >= 80 ? 'text-emerald-600' :
                                                run.pass_rate >= 60 ? 'text-amber-600' : 'text-rose-600'
                                                }`}>
                                                {run.pass_rate}%
                                            </span>
                                            <span className={`text-xs px-2 py-0.5 rounded-full ${run.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                                                run.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                                                    'bg-slate-100 text-slate-800'
                                                }`}>
                                                {run.status}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="h-56 flex items-center justify-center text-slate-400">
                                No test runs yet
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
    const colorClasses: Record<string, string> = {
        indigo: 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800',
        green: 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800',
        red: 'bg-rose-50 dark:bg-rose-900/30 border-rose-200 dark:border-rose-800',
        yellow: 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800',
        amber: 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800',
    };

    const textColors: Record<string, string> = {
        indigo: 'text-indigo-700 dark:text-indigo-300',
        green: 'text-emerald-700 dark:text-emerald-300',
        red: 'text-rose-700 dark:text-rose-300',
        yellow: 'text-amber-700 dark:text-amber-300',
        amber: 'text-amber-700 dark:text-amber-300',
    };

    return (
        <div className={`rounded-lg p-4 border ${colorClasses[color] || colorClasses.indigo}`}>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${textColors[color] || textColors.indigo}`}>{value}</p>
        </div>
    );
}

export default TestExecutionSummaryWidget;

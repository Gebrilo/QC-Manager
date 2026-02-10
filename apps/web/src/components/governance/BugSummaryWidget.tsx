'use client';

import React, { useEffect, useState } from 'react';
import { DonutChart } from '../dashboard/ChartComponents';
import type {
    BugSummaryData,
    Bug,
    BugSeverity
} from '../../types/governance';
import {
    BUG_SEVERITY_COLORS,
    BUG_SEVERITY_BADGE_COLORS,
    BUG_STATUS_COLORS
} from '../../types/governance';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface BugSummaryWidgetProps {
    projectId?: string;
}

export function BugSummaryWidget({ projectId }: BugSummaryWidgetProps) {
    const [data, setData] = useState<BugSummaryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadData() {
            try {
                setLoading(true);
                const params = projectId ? `?project_id=${projectId}` : '';
                const response = await fetch(`${API_BASE}/bugs/summary${params}`);
                if (!response.ok) throw new Error('Failed to fetch bug summary');
                const result = await response.json();
                setData(result.data);
            } catch (err: any) {
                console.error('Error loading bug summary:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, [projectId]);

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
                <p className="text-red-500">Error loading bug data: {error}</p>
            </div>
        );
    }

    const totals = data?.totals;
    const severity = data?.by_severity;
    const recentBugs = data?.recent_bugs || [];

    // Prepare donut chart data for severity breakdown
    const severityDonutData = severity ? [
        { label: 'Critical', value: severity.critical, color: '#dc2626' },
        { label: 'High', value: severity.high, color: '#f97316' },
        { label: 'Medium', value: severity.medium, color: '#eab308' },
        { label: 'Low', value: severity.low, color: '#94a3b8' },
    ].filter(d => d.value > 0) : [];

    // Prepare donut chart for bugs from testing vs standalone
    const sourceDonutData = totals ? [
        { label: 'From Testing', value: totals.bugs_from_testing, color: '#3b82f6' },
        { label: 'Standalone', value: totals.standalone_bugs, color: '#8b5cf6' },
    ].filter(d => d.value > 0) : [];

    const hasBugs = totals && totals.total_bugs > 0;

    return (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
            {/* Header */}
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <BugIcon className="w-5 h-5 text-red-500" />
                            Bug Summary
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Defects synced from Tuleap
                        </p>
                    </div>
                    {totals && totals.open_bugs > 0 && (
                        <div className="flex items-center gap-2">
                            <span className="text-2xl font-bold text-red-600">{totals.open_bugs}</span>
                            <span className="text-sm text-slate-500">Open</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Summary Cards */}
            <div className="p-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <StatCard
                        label="Total Bugs"
                        value={totals?.total_bugs || 0}
                        color="slate"
                    />
                    <StatCard
                        label="From Testing"
                        value={totals?.bugs_from_testing || 0}
                        subLabel="Found via test cases"
                        color="blue"
                    />
                    <StatCard
                        label="Standalone"
                        value={totals?.standalone_bugs || 0}
                        subLabel="Exploratory / External"
                        color="purple"
                    />
                    <StatCard
                        label="Critical"
                        value={severity?.critical || 0}
                        color="red"
                    />
                </div>

                {/* Charts and Recent Bugs */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Severity Breakdown Donut */}
                    <div>
                        <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4">
                            By Severity
                        </h4>
                        {hasBugs && severityDonutData.length > 0 ? (
                            <div className="h-48 flex items-center justify-center">
                                <DonutChart
                                    data={severityDonutData}
                                    size={160}
                                />
                            </div>
                        ) : (
                            <div className="h-48 flex items-center justify-center text-slate-400">
                                No bugs recorded
                            </div>
                        )}
                    </div>

                    {/* Source Breakdown Donut */}
                    <div>
                        <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4">
                            By Source
                        </h4>
                        {hasBugs && sourceDonutData.length > 0 ? (
                            <div className="h-48 flex items-center justify-center">
                                <DonutChart
                                    data={sourceDonutData}
                                    size={160}
                                />
                            </div>
                        ) : (
                            <div className="h-48 flex items-center justify-center text-slate-400">
                                No bugs recorded
                            </div>
                        )}
                    </div>

                    {/* Recent Bugs */}
                    <div>
                        <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4">
                            Recent Bugs
                        </h4>
                        {recentBugs.length > 0 ? (
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                {recentBugs.slice(0, 5).map(bug => (
                                    <BugRow key={bug.id} bug={bug} />
                                ))}
                            </div>
                        ) : (
                            <div className="h-48 flex items-center justify-center text-slate-400">
                                No recent bugs
                            </div>
                        )}
                    </div>
                </div>

                {/* Severity Legend */}
                {hasBugs && (
                    <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
                        <div className="flex flex-wrap gap-4 justify-center">
                            <SeverityBadge severity="critical" count={severity?.critical || 0} />
                            <SeverityBadge severity="high" count={severity?.high || 0} />
                            <SeverityBadge severity="medium" count={severity?.medium || 0} />
                            <SeverityBadge severity="low" count={severity?.low || 0} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function StatCard({
    label,
    value,
    subLabel,
    color
}: {
    label: string;
    value: string | number;
    subLabel?: string;
    color: string;
}) {
    const colorClasses: Record<string, string> = {
        slate: 'bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600',
        blue: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800',
        purple: 'bg-purple-50 dark:bg-purple-900/30 border-purple-200 dark:border-purple-800',
        red: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800',
        green: 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800',
    };

    const textColors: Record<string, string> = {
        slate: 'text-slate-700 dark:text-slate-300',
        blue: 'text-blue-700 dark:text-blue-300',
        purple: 'text-purple-700 dark:text-purple-300',
        red: 'text-red-700 dark:text-red-300',
        green: 'text-green-700 dark:text-green-300',
    };

    return (
        <div className={`rounded-lg p-4 border ${colorClasses[color] || colorClasses.slate}`}>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {label}
            </p>
            <p className={`text-2xl font-bold mt-1 ${textColors[color] || textColors.slate}`}>
                {value}
            </p>
            {subLabel && (
                <p className="text-xs text-slate-400 mt-1">{subLabel}</p>
            )}
        </div>
    );
}

function BugRow({ bug }: { bug: Bug }) {
    const severityColor = BUG_SEVERITY_COLORS[bug.severity as BugSeverity] || 'bg-gray-400 text-white';
    const statusColor = BUG_STATUS_COLORS[bug.status] || 'bg-gray-100 text-gray-800';

    return (
        <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${severityColor}`}>
                        {bug.severity?.toUpperCase().charAt(0)}
                    </span>
                    <span className="font-medium text-sm text-slate-900 dark:text-white truncate">
                        {bug.title}
                    </span>
                </div>
                <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                    <span>{bug.bug_id}</span>
                    {bug.project_name && <span>• {bug.project_name}</span>}
                    {bug.has_test_link && (
                        <span className="text-blue-500" title="Linked to test execution">
                            <TestLinkIcon className="w-3 h-3" />
                        </span>
                    )}
                </div>
            </div>
            <div className="ml-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor}`}>
                    {bug.status}
                </span>
            </div>
        </div>
    );
}

function SeverityBadge({ severity, count }: { severity: BugSeverity; count: number }) {
    const colors = BUG_SEVERITY_BADGE_COLORS[severity];
    const labels: Record<BugSeverity, string> = {
        critical: 'Critical',
        high: 'High',
        medium: 'Medium',
        low: 'Low'
    };

    return (
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${colors}`}>
            <span className="font-medium text-sm">{labels[severity]}</span>
            <span className="text-sm font-bold">{count}</span>
        </div>
    );
}

function BugIcon({ className }: { className?: string }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
    );
}

function TestLinkIcon({ className }: { className?: string }) {
    return (
        <svg className={className} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd"
                d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z"
                clipRule="evenodd" />
        </svg>
    );
}

export default BugSummaryWidget;

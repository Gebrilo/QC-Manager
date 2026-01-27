/**
 * Release Readiness Widget
 * Phase 2: Shows project release readiness status with blocking issues
 */

'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { getProjectReleaseReadiness } from '../../services/governanceApi';
import type { ReleaseReadiness } from '../../types/governance';
import {
    READINESS_COLORS,
    READINESS_BADGE_COLORS,
    getReadinessStatusIcon,
    formatDate,
    formatDaysAgo,
    formatPassRate
} from '../../types/governance';

interface ReleaseReadinessWidgetProps {
    projectId: string;
    showDetails?: boolean;
    onStatusClick?: () => void;
}

export default function ReleaseReadinessWidget({
    projectId,
    showDetails = true,
    onStatusClick
}: ReleaseReadinessWidgetProps) {
    const [data, setData] = useState<ReleaseReadiness | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, [projectId]);

    const loadData = async () => {
        try {
            setLoading(true);
            setError(null);
            const result = await getProjectReleaseReadiness(projectId);
            setData(result);
        } catch (err) {
            console.error('Error loading release readiness:', err);
            setError('Failed to load release readiness data');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <Card>
                <div className="animate-pulse">
                    <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mb-4"></div>
                    <div className="h-20 bg-slate-200 dark:bg-slate-700 rounded mb-4"></div>
                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full"></div>
                </div>
            </Card>
        );
    }

    if (error || !data) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Release Readiness</CardTitle>
                </CardHeader>
                <div className="text-red-600 dark:text-red-400">
                    {error || 'No data available'}
                </div>
            </Card>
        );
    }

    const badgeColor = READINESS_BADGE_COLORS[data.readiness_status] || 'bg-gray-500 text-white';
    const readinessColorClass = READINESS_COLORS[data.readiness_status] || 'border-gray-300';
    const borderColor = readinessColorClass.split(' ').find(c => c.startsWith('border-')) || 'border-gray-300';
    const icon = getReadinessStatusIcon(data.readiness_status);

    return (
        <div className={`bg-white rounded-lg shadow border-l-4 ${borderColor || 'border-gray-300'}`}>
            {/* Header */}
            <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">
                        Release Readiness
                    </h3>
                    <button
                        onClick={onStatusClick}
                        className={`px-4 py-2 rounded-full font-bold text-sm ${badgeColor} hover:opacity-80 transition-opacity`}
                    >
                        {icon} {data.readiness_status}
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="p-6">
                {/* Key Metrics */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="text-center">
                        <div className="text-2xl font-bold text-gray-900">
                            {formatPassRate(data.latest_pass_rate_pct)}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">Pass Rate</div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-bold text-gray-900">
                            {data.total_test_cases}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">Total Tests</div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-bold text-gray-900">
                            {data.latest_failed_count}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">Failed</div>
                    </div>
                </div>

                {/* Recommendation */}
                <div className="mb-6">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div className="flex items-start">
                            <svg
                                className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0"
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                            <div>
                                <p className="text-sm text-blue-900 font-medium mb-1">
                                    Recommendation
                                </p>
                                <p className="text-sm text-blue-800">
                                    {data.recommendation}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Blocking Issues */}
                {data.blocking_issues && data.blocking_issues.length > 0 && (
                    <div className="mb-6">
                        <h4 className="text-sm font-semibold text-gray-700 mb-3">
                            Blocking Issues ({data.blocking_issue_count})
                        </h4>
                        <ul className="space-y-2">
                            {data.blocking_issues.map((issue, index) => (
                                <li key={index} className="flex items-start">
                                    <span className="inline-block w-2 h-2 bg-red-500 rounded-full mt-1.5 mr-3 flex-shrink-0"></span>
                                    <span className="text-sm text-gray-700">{issue}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Last Execution */}
                <div className="pt-4 border-t border-gray-200">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Last Execution:</span>
                        <span className="text-gray-900 font-medium">
                            {formatDate(data.latest_execution_date)}
                            <span className="text-gray-500 ml-2">
                                ({formatDaysAgo(data.days_since_latest_execution)})
                            </span>
                        </span>
                    </div>
                </div>

                {/* Details Link (optional) */}
                {showDetails && (
                    <div className="mt-4">
                        <button
                            onClick={onStatusClick}
                            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                        >
                            View Detailed Metrics →
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

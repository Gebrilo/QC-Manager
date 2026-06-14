'use client';

import { useEffect, useState } from 'react';
import { TestResult, ExecutionStatus, Project } from '@/types';
import { fetchApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';

const RESULT_HEADERS = ['Test Case ID', 'Title', 'Project', 'Status', 'Executed', 'Tester', 'Notes'];

function getStatusBadgeVariant(status: ExecutionStatus): 'success' | 'danger' | 'default' | 'warning' {
    const variants: Record<ExecutionStatus, 'success' | 'danger' | 'default' | 'warning'> = {
        passed: 'success',
        failed: 'danger',
        not_run: 'default',
        blocked: 'warning',
        rejected: 'danger',
    };
    return variants[status];
}

function AllResultsSkeleton() {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                        <tr>
                            {RESULT_HEADERS.map(header => (
                                <th key={header} className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    {header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {Array.from({ length: 6 }).map((_, rowIndex) => (
                            <tr key={rowIndex}>
                                {RESULT_HEADERS.map(header => (
                                    <td key={header} className="px-6 py-4"><Skeleton className="h-5 w-24" /></td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

/**
 * Flat, cross-run list of individual test-case results. Lives as the "All
 * Results" tab on /test/runs. `initialProjectId` pre-selects the project
 * filter (used by the Quality Metrics dashboard deep-link).
 */
export function AllResultsPanel({ initialProjectId }: { initialProjectId?: string }) {
    const [testResults, setTestResults] = useState<TestResult[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
    const [projectFilter, setProjectFilter] = useState(initialProjectId || 'all');
    const [statusFilter, setStatusFilter] = useState<ExecutionStatus | 'all'>('all');
    const [latestOnly, setLatestOnly] = useState(true);

    useEffect(() => {
        loadProjects();
    }, []);

    useEffect(() => {
        const timeout = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery.trim());
        }, 350);

        return () => clearTimeout(timeout);
    }, [searchQuery]);

    useEffect(() => {
        loadTestResults();
    }, [projectFilter, statusFilter, latestOnly, debouncedSearchQuery]);

    const loadProjects = async () => {
        try {
            const response = await fetchApi<Project[]>('/projects');
            setProjects(response || []);
        } catch (error) {
            console.error('Failed to load projects:', error);
        }
    };

    const loadTestResults = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();

            if (projectFilter !== 'all') {
                params.append('project_id', projectFilter);
            }

            if (statusFilter !== 'all') {
                params.append('status', statusFilter);
            }

            if (debouncedSearchQuery) {
                params.append('test_case_id', debouncedSearchQuery);
            }

            params.append('latest_only', latestOnly.toString());
            params.append('limit', '200');

            const response = await fetchApi<{ data: TestResult[] } | TestResult[]>(`/test-results?${params.toString()}`);
            const data = Array.isArray(response) ? response : (response as any).data || [];
            setTestResults(data);
            setLoadError(null);
        } catch (error: any) {
            console.error('Failed to load test results:', error);
            setLoadError(error.message || 'Failed to load test results');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex gap-2">
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by test case ID..."
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>

            <div className="flex gap-4 items-center flex-wrap">
                <div className="flex gap-2 items-center">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Project:</label>
                    <select
                        value={projectFilter}
                        onChange={(e) => setProjectFilter(e.target.value)}
                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-slate-900 dark:text-white"
                    >
                        <option value="all">All Projects</option>
                        {projects.map(project => (
                            <option key={project.id} value={project.id}>{project.project_name}</option>
                        ))}
                    </select>
                </div>

                <div className="flex gap-2 items-center">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Status:</label>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as ExecutionStatus | 'all')}
                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-slate-900 dark:text-white"
                    >
                        <option value="all">All Statuses</option>
                        <option value="passed">Passed</option>
                        <option value="failed">Failed</option>
                        <option value="not_run">Not Run</option>
                        <option value="blocked">Blocked</option>
                        <option value="rejected">Rejected</option>
                    </select>
                </div>

                <div className="flex gap-2 items-center">
                    <label className="flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={latestOnly}
                            onChange={(e) => setLatestOnly(e.target.checked)}
                            className="mr-2 rounded"
                        />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Latest results only</span>
                    </label>
                </div>

                <div className="ml-auto text-sm text-gray-600 dark:text-gray-400">
                    {testResults.length} result{testResults.length !== 1 ? 's' : ''}
                </div>
            </div>

            {loading ? (
                <AllResultsSkeleton />
            ) : loadError ? (
                <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg p-6 text-center">
                    <svg className="w-8 h-8 text-rose-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-rose-800 dark:text-rose-300 font-medium mb-1">Failed to load test results</p>
                    <p className="text-sm text-rose-600 dark:text-rose-400 mb-3">{loadError}</p>
                    <Button onClick={() => { setLoadError(null); loadTestResults(); }}>Retry</Button>
                </div>
            ) : testResults.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
                    <p className="text-lg font-medium text-slate-700 dark:text-slate-300">No test results found</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Import a run from the Upload tab to populate results.
                    </p>
                </div>
            ) : (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                <tr>
                                    {RESULT_HEADERS.map(header => (
                                        <th key={header} className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                            {header}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {testResults.map((result) => (
                                    <tr key={result.id} className="hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="text-sm font-mono font-medium text-slate-900 dark:text-white">
                                                {result.test_case_id}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm text-slate-900 dark:text-white">
                                                {result.test_case_title || '-'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-600 dark:text-gray-400">
                                                {result.project_name}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <Badge variant={getStatusBadgeVariant(result.status)}>
                                                {result.status.toUpperCase().replace('_', ' ')}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                                            {new Date(result.executed_at).toLocaleDateString()}
                                            {result.days_since_execution !== undefined && result.days_since_execution > 30 && (
                                                <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                                                    {result.days_since_execution} days ago
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                                            {result.tester_name || '-'}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                                                {result.notes || '-'}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

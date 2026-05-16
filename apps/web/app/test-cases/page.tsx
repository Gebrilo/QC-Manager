'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { TestCase, TestCaseListResponse } from '@/types';
import { fetchApi, projectsApi, testCasesApi, type Project } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { ActivityFilters, type ActivityFilterOption, type ActivityFiltersConfig, type ActivityFiltersValue } from '@/components/ui/ActivityFilters';
import { parseActivityFilters, writeActivityFiltersToParams } from '@/lib/activityFilters';
import { formatDistanceToNow } from 'date-fns';

const PRIORITY_OPTIONS = [
    { value: '', label: 'All Priorities' },
    { value: 'critical', label: 'Critical' },
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
];

const STATUS_OPTIONS = [
    { value: '', label: 'All Statuses' },
    { value: 'draft', label: 'Draft' },
    { value: 'active', label: 'Active' },
    { value: 'deprecated', label: 'Deprecated' },
    { value: 'archived', label: 'Archived' },
];

const CASE_FILTER_CONFIG: ActivityFiltersConfig = {
    slots: ['search', 'project', 'status', 'priority', 'source', 'date', 'relatedArtifact'],
    statusOptions: STATUS_OPTIONS.filter(option => option.value).map(option => ({ value: option.value, label: option.label })),
    priorityOptions: PRIORITY_OPTIONS.filter(option => option.value).map(option => ({ value: option.value, label: option.label })),
    relatedArtifactTypes: [
        { value: 'user_story', label: 'User Story', searchTypes: ['user_story'] },
        { value: 'task', label: 'Task', searchTypes: ['task'] },
        { value: 'bug', label: 'Bug', searchTypes: ['bug'] },
        { value: 'suite', label: 'Suite' },
    ],
};

const TYPE_OPTIONS = [
    { value: '', label: 'All Types' },
    { value: 'functional', label: 'Functional' },
    { value: 'regression', label: 'Regression' },
    { value: 'smoke', label: 'Smoke' },
    { value: 'integration', label: 'Integration' },
    { value: 'performance', label: 'Performance' },
    { value: 'security', label: 'Security' },
    { value: 'usability', label: 'Usability' },
    { value: 'exploratory', label: 'Exploratory' },
    { value: 'automated', label: 'Automated' },
];

const AUTOMATION_OPTIONS = [
    { value: '', label: 'All' },
    { value: 'manual', label: 'Manual' },
    { value: 'automated', label: 'Automated' },
    { value: 'partial', label: 'Partial' },
    { value: 'to_automate', label: 'To Automate' },
];

const SYNC_OPTIONS = [
    { value: '', label: 'All' },
    { value: 'synced', label: 'Synced' },
    { value: 'pending', label: 'Pending' },
    { value: 'conflict', label: 'Conflict' },
    { value: 'error', label: 'Error' },
    { value: 'not_synced', label: 'Not Synced' },
];

function getPriorityBadgeVariant(priority: string): 'danger' | 'warning' | 'default' | 'success' {
    const map: Record<string, 'danger' | 'warning' | 'default' | 'success'> = {
        critical: 'danger', high: 'warning', medium: 'default', low: 'success',
    };
    return map[priority] || 'default';
}

function getStatusBadgeVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
    const map: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
        active: 'success', draft: 'warning', deprecated: 'danger', archived: 'default',
    };
    return map[status] || 'default';
}

function getSyncBadgeVariant(sync: string): 'success' | 'warning' | 'danger' | 'default' | 'info' {
    const map: Record<string, 'success' | 'warning' | 'danger' | 'default' | 'info'> = {
        synced: 'success', pending: 'warning', conflict: 'danger', error: 'danger', not_synced: 'default',
    };
    return map[sync] || 'default';
}

export default function TestCasesPage() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const searchParamString = searchParams.toString();
    const [testCases, setTestCases] = useState<TestCase[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [relatedArtifacts, setRelatedArtifacts] = useState<ActivityFilterOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, total_pages: 0 });
    const filters = useMemo(() => parseActivityFilters(new URLSearchParams(searchParamString)), [searchParamString]);
    const [sortBy] = useState('created_at');
    const [sortOrder] = useState<'asc' | 'desc'>('desc');

    const loadTestCases = useCallback(async (page = 1) => {
        try {
            setLoading(true);
            const response = await testCasesApi.list({
                page,
                limit: 25,
                search: filters.search || undefined,
                project_ids: filters.projectIds.join(',') || undefined,
                statuses: filters.statuses.join(',') || undefined,
                priorities: filters.priorities.join(',') || undefined,
                source: filters.source || undefined,
                created_from: filters.createdFrom || undefined,
                created_to: filters.createdTo || undefined,
                updated_from: filters.updatedFrom || undefined,
                updated_to: filters.updatedTo || undefined,
                related_type: filters.relatedType || undefined,
                related_id: filters.relatedId || undefined,
                sort_by: sortBy,
                sort_order: sortOrder,
            });
            if (response && typeof response === 'object' && 'data' in response) {
                setTestCases((response as TestCaseListResponse).data);
                setPagination((response as TestCaseListResponse).pagination);
            }
        } catch (error) {
            console.error('Failed to load test cases:', error);
        } finally {
            setLoading(false);
        }
    }, [filters, sortBy, sortOrder]);

    useEffect(() => {
        loadTestCases(1);
    }, [loadTestCases]);

    useEffect(() => {
        projectsApi.list().then(data => setProjects(Array.isArray(data) ? data : [])).catch(() => setProjects([]));
    }, []);

    const updateFilters = (nextFilters: ActivityFiltersValue) => {
        const params = new URLSearchParams(searchParamString);
        writeActivityFiltersToParams(params, nextFilters);
        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    };

    const handleRelatedArtifactSearch = async (query: string, relatedType: string) => {
        if (relatedType === 'suite') {
            const trimmed = query.trim();
            setRelatedArtifacts(trimmed ? [{ value: trimmed, label: trimmed }] : []);
            return;
        }
        if (query.trim().length < 2 || !relatedType) {
            setRelatedArtifacts(filters.relatedId ? [{ value: filters.relatedId, label: filters.relatedId }] : []);
            return;
        }
        try {
            const response = await fetchApi<{ data: Array<{ id: string; display_id: string; title: string }> }>(
                `/search?q=${encodeURIComponent(query.trim())}&type=${encodeURIComponent(relatedType)}&limit=20`
            );
            setRelatedArtifacts(response.data.map(item => ({ value: item.id, label: `${item.display_id} - ${item.title}` })));
        } catch (error) {
            console.error(error);
            setRelatedArtifacts([]);
        }
    };

    const projectOptions = useMemo(() => projects.map(project => ({ value: project.id, label: project.project_name })), [projects]);

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Test Cases</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Manage your test case registry</p>
                </div>
                <Link href="/test/cases/create">
                    <Button>+ New Test Case</Button>
                </Link>
            </div>

            <div className="mb-6">
                <ActivityFilters
                    value={filters}
                    config={CASE_FILTER_CONFIG}
                    projects={projectOptions}
                    relatedArtifacts={relatedArtifacts}
                    relatedArtifactPlaceholder="Search related item"
                    resultSummary={`${pagination.total} test case${pagination.total !== 1 ? 's' : ''}`}
                    onChange={updateFilters}
                    onRelatedArtifactSearch={handleRelatedArtifactSearch}
                />
            </div>

            {loading && testCases.length === 0 ? (
                <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>
            ) : testCases.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
                    <p className="text-gray-600 dark:text-gray-400 mb-4">No test cases found. Create your first test case to get started.</p>
                    <Link href="/test/cases/create"><Button>Create Test Case</Button></Link>
                </div>
            ) : (
                <>
                    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">ID</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Title</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Type</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Priority</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Automation</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Last Result</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Sync</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Last Run</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {testCases.map((tc) => (
                                        <tr key={tc.id} className="hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <Link href={`/test/cases/${tc.id}`} className="text-blue-600 dark:text-blue-400 hover:underline font-mono text-sm">
                                                    {tc.test_case_id}
                                                </Link>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="text-sm font-medium text-slate-900 dark:text-white max-w-xs truncate">{tc.title}</div>
                                                {tc.project_name && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{tc.project_name}</div>}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700 dark:text-slate-300 capitalize">{tc.test_type || '\u2014'}</td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <Badge variant={getPriorityBadgeVariant(tc.priority)}>{tc.priority}</Badge>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <Badge variant={getStatusBadgeVariant(tc.status)}>{tc.status}</Badge>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700 dark:text-slate-300 capitalize">{tc.automation_status?.replace('_', ' ') || 'manual'}</td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                {tc.latest_execution_status ? (
                                                    <Badge variant={tc.latest_execution_status === 'passed' ? 'success' : tc.latest_execution_status === 'failed' ? 'danger' : 'default'}>
                                                        {tc.latest_execution_status}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-xs text-gray-400">Never Run</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                {tc.sync_status && tc.sync_status !== 'not_synced' ? (
                                                    <Badge variant={getSyncBadgeVariant(tc.sync_status)}>{tc.sync_status}</Badge>
                                                ) : (
                                                    <span className="text-xs text-gray-400">{'\u2014'}</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
                                                {tc.latest_execution_date ? formatDistanceToNow(new Date(tc.latest_execution_date), { addSuffix: true }) : 'Never'}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm">
                                                <Link href={`/test/cases/${tc.id}/edit`} className="text-blue-600 dark:text-blue-400 hover:underline mr-3">Edit</Link>
                                                <Link href={`/test/cases/${tc.id}`} className="text-gray-600 dark:text-gray-400 hover:underline">View</Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {pagination.total_pages > 1 && (
                        <div className="flex items-center justify-between mt-4">
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                                Showing {((pagination.page - 1) * pagination.limit) + 1}{'\u2013'}{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                            </span>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => loadTestCases(pagination.page - 1)}>Previous</Button>
                                <Button variant="outline" size="sm" disabled={pagination.page >= pagination.total_pages} onClick={() => loadTestCases(pagination.page + 1)}>Next</Button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

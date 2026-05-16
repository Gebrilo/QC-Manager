'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { TestSuite, TestSuiteListResponse } from '@/types';
import { fetchApi, projectsApi, testSuitesApi, type Project } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { ActivityFilters, type ActivityFilterOption, type ActivityFiltersConfig, type ActivityFiltersValue } from '@/components/ui/ActivityFilters';
import { parseActivityFilters, writeActivityFiltersToParams } from '@/lib/activityFilters';
import { formatDistanceToNow } from 'date-fns';

const STATUS_OPTIONS = [
    { value: '', label: 'All Statuses' },
    { value: 'draft', label: 'Draft' },
    { value: 'active', label: 'Active' },
    { value: 'archived', label: 'Archived' },
];

const SUITE_FILTER_CONFIG: ActivityFiltersConfig = {
    slots: ['search', 'project', 'suiteType', 'readinessScope', 'date', 'relatedArtifact'],
    suiteTypeOptions: ['smoke', 'regression', 'acceptance', 'security', 'performance', 'other'].map(value => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) })),
    readinessScopeOptions: [
        { value: 'required', label: 'Required' },
        { value: 'optional', label: 'Optional' },
    ],
    relatedArtifactTypes: [
        { value: 'test_case', label: 'Test Case', searchTypes: ['test_case'] },
    ],
};

function getSuiteStatusVariant(status: string): 'success' | 'warning' | 'default' {
    const map: Record<string, 'success' | 'warning' | 'default'> = {
        active: 'success', draft: 'warning', archived: 'default',
    };
    return map[status] || 'default';
}

export default function TestSuitesPage() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const searchParamString = searchParams.toString();
    const [suites, setSuites] = useState<TestSuite[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [relatedArtifacts, setRelatedArtifacts] = useState<ActivityFilterOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, total_pages: 0 });
    const filters = useMemo(() => parseActivityFilters(new URLSearchParams(searchParamString)), [searchParamString]);
    const [sortBy] = useState('created_at');
    const [sortOrder] = useState<'asc' | 'desc'>('desc');

    const loadSuites = useCallback(async (page = 1) => {
        try {
            setLoading(true);
            const response = await testSuitesApi.list({
                page,
                limit: 25,
                search: filters.search || undefined,
                project_ids: filters.projectIds.join(',') || undefined,
                suite_types: filters.suiteTypes.join(',') || undefined,
                readiness_scopes: filters.readinessScopes.join(',') || undefined,
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
                setSuites((response as TestSuiteListResponse).data);
                setPagination((response as TestSuiteListResponse).pagination);
            }
        } catch (error) {
            console.error('Failed to load test suites:', error);
        } finally {
            setLoading(false);
        }
    }, [filters, sortBy, sortOrder]);

    useEffect(() => {
        loadSuites(1);
    }, [loadSuites]);

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
        if (query.trim().length < 2 || relatedType !== 'test_case') {
            setRelatedArtifacts(filters.relatedId ? [{ value: filters.relatedId, label: filters.relatedId }] : []);
            return;
        }
        try {
            const response = await fetchApi<{ data: Array<{ id: string; display_id: string; title: string }> }>(
                `/search?q=${encodeURIComponent(query.trim())}&type=test_case&limit=20`
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
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Test Suites</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Organize test cases into runnable suites</p>
                </div>
                <Link href="/test/suites/create">
                    <Button>+ New Suite</Button>
                </Link>
            </div>

            <div className="mb-6">
                <ActivityFilters
                    value={filters}
                    config={SUITE_FILTER_CONFIG}
                    projects={projectOptions}
                    relatedArtifacts={relatedArtifacts}
                    relatedArtifactPlaceholder="Search test case"
                    resultSummary={`${pagination.total} suite${pagination.total !== 1 ? 's' : ''}`}
                    onChange={updateFilters}
                    onRelatedArtifactSearch={handleRelatedArtifactSearch}
                />
            </div>

            {loading && suites.length === 0 ? (
                <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>
            ) : suites.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
                    <p className="text-gray-600 dark:text-gray-400 mb-4">No test suites found. Create your first suite to organize test cases.</p>
                    <Link href="/test/suites/create"><Button>Create Suite</Button></Link>
                </div>
            ) : (
                <>
                    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">ID</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Project</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Cases</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Last Run</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Created</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {suites.map((suite) => (
                                        <tr key={suite.id} className="hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <Link href={`/test/suites/${suite.id}`} className="text-blue-600 dark:text-blue-400 hover:underline font-mono text-sm">
                                                    {suite.suite_id}
                                                </Link>
                                            </td>
                                            <td className="px-4 py-3">
                                                <Link href={`/test/suites/${suite.id}`} className="text-sm font-medium text-slate-900 dark:text-white hover:underline">
                                                    {suite.name}
                                                </Link>
                                                {suite.description && (
                                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-xs">{suite.description}</div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700 dark:text-slate-300">
                                                {suite.project_name || '\u2014'}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <Badge variant={getSuiteStatusVariant(suite.status)}>{suite.status}</Badge>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700 dark:text-slate-300">
                                                {suite.test_case_count ?? 0}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700 dark:text-slate-300">
                                                {suite.last_run_date ? formatDistanceToNow(new Date(suite.last_run_date), { addSuffix: true }) : 'Never'}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
                                                {formatDistanceToNow(new Date(suite.created_at), { addSuffix: true })}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm">
                                                <Link href={`/test/suites/${suite.id}/edit`} className="text-blue-600 dark:text-blue-400 hover:underline mr-3">Edit</Link>
                                                <Link href={`/test/suites/${suite.id}`} className="text-gray-600 dark:text-gray-400 hover:underline">View</Link>
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
                                <Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => loadSuites(pagination.page - 1)}>Previous</Button>
                                <Button variant="outline" size="sm" disabled={pagination.page >= pagination.total_pages} onClick={() => loadSuites(pagination.page + 1)}>Next</Button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

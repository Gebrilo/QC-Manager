'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { TestSuite, TestSuiteListResponse } from '@/types';
import { testSuitesApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { formatDistanceToNow } from 'date-fns';

const STATUS_OPTIONS = [
    { value: '', label: 'All Statuses' },
    { value: 'draft', label: 'Draft' },
    { value: 'active', label: 'Active' },
    { value: 'archived', label: 'Archived' },
];

function getSuiteStatusVariant(status: string): 'success' | 'warning' | 'default' {
    const map: Record<string, 'success' | 'warning' | 'default'> = {
        active: 'success', draft: 'warning', archived: 'default',
    };
    return map[status] || 'default';
}

export default function TestSuitesPage() {
    const [suites, setSuites] = useState<TestSuite[]>([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, total_pages: 0 });

    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const [sortBy] = useState('created_at');
    const [sortOrder] = useState<'asc' | 'desc'>('desc');

    const loadSuites = useCallback(async (page = 1) => {
        try {
            setLoading(true);
            const response = await testSuitesApi.list({
                page,
                limit: 25,
                search: search || undefined,
                status: status || undefined,
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
    }, [search, status, sortBy, sortOrder]);

    useEffect(() => {
        loadSuites(1);
    }, [loadSuites]);

    const clearFilters = () => {
        setSearch('');
        setStatus('');
    };

    const hasActiveFilters = status || search;

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

            <div className="mb-6 space-y-4">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && loadSuites(1)}
                        placeholder="Search by name, description, or ID..."
                        className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <Button onClick={() => loadSuites(1)}>Search</Button>
                </div>

                <div className="flex flex-wrap gap-3 items-center">
                    <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-slate-900 dark:text-white text-sm">
                        {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {hasActiveFilters && (
                        <Button variant="ghost" size="sm" onClick={clearFilters}>Clear All</Button>
                    )}
                    <span className="ml-auto text-sm text-gray-600 dark:text-gray-400">
                        {pagination.total} suite{pagination.total !== 1 ? 's' : ''}
                    </span>
                </div>
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
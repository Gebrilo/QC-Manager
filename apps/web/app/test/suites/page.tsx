'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { TestSuite, TestSuiteListResponse } from '@/types';
import { testSuitesApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
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

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
                    <div>
                        <h2 className="font-semibold text-slate-900 dark:text-white">All Test Suites</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{suites.length} rows</p>
                    </div>
                    <div className="hidden md:flex items-center gap-2 text-xs text-slate-400">
                        <span>Scroll to see all columns</span>
                    </div>
                </div>
                <div className="overflow-x-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent' }}>
                    <style jsx>{`
                        .bugs-table-scroll::-webkit-scrollbar {
                            height: 8px;
                        }
                        .bugs-table-scroll::-webkit-scrollbar-track {
                            background: transparent;
                        }
                        .bugs-table-scroll::-webkit-scrollbar-thumb {
                            background-color: #cbd5e1;
                            border-radius: 999px;
                        }
                        .dark .bugs-table-scroll::-webkit-scrollbar-thumb {
                            background-color: #475569;
                        }
                    `}</style>
                    <table className="w-full text-sm bugs-table-scroll" style={{ minWidth: 1050 }}>
                        <thead>
                            <tr className="bg-slate-50/60 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800">
                                <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider font-bold text-slate-400 sticky left-0 z-10 bg-slate-50 dark:bg-slate-900">ID</th>
                                <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider font-bold text-slate-400">Name</th>
                                <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider font-bold text-slate-400">Project</th>
                                <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider font-bold text-slate-400">Status</th>
                                <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider font-bold text-slate-400">Cases</th>
                                <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider font-bold text-slate-400">Last Run</th>
                                <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider font-bold text-slate-400">Created</th>
                                <th className="text-right px-5 py-3 text-[10px] uppercase tracking-wider font-bold text-slate-400">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                            {loading && suites.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-5 py-12 text-center text-slate-400">
                                        Loading test suites...
                                    </td>
                                </tr>
                            ) : suites.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-5 py-12 text-center text-slate-400">
                                        No test suites found.
                                    </td>
                                </tr>
                            ) : suites.map((suite) => (
                                <tr key={suite.id} className="group hover:bg-violet-50/40 dark:hover:bg-violet-950/10 transition-colors">
                                    <td className="px-5 py-3.5 whitespace-nowrap sticky left-0 z-10 bg-white dark:bg-slate-900 group-hover:bg-violet-50 dark:group-hover:bg-slate-900">
                                        <Link href={`/test/suites/${suite.id}`} className="text-blue-600 dark:text-blue-400 hover:underline font-mono text-sm">
                                            {suite.suite_id}
                                        </Link>
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <Link href={`/test/suites/${suite.id}`} className="text-sm font-medium text-slate-900 dark:text-white hover:underline">
                                            {suite.name}
                                        </Link>
                                        {suite.description && (
                                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-xs">{suite.description}</div>
                                        )}
                                    </td>
                                    <td className="px-5 py-3.5 whitespace-nowrap text-sm text-slate-700 dark:text-slate-300">
                                        {suite.project_name || '-'}
                                    </td>
                                    <td className="px-5 py-3.5 whitespace-nowrap">
                                        <Badge variant={getSuiteStatusVariant(suite.status)}>{suite.status}</Badge>
                                    </td>
                                    <td className="px-5 py-3.5 whitespace-nowrap text-sm text-slate-700 dark:text-slate-300">
                                        {suite.test_case_count ?? 0}
                                    </td>
                                    <td className="px-5 py-3.5 whitespace-nowrap text-sm text-slate-700 dark:text-slate-300">
                                        {suite.last_run_date ? formatDistanceToNow(new Date(suite.last_run_date), { addSuffix: true }) : 'Never'}
                                    </td>
                                    <td className="px-5 py-3.5 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
                                        {formatDistanceToNow(new Date(suite.created_at), { addSuffix: true })}
                                    </td>
                                    <td className="px-5 py-3.5 whitespace-nowrap text-sm text-right">
                                        <Link href={`/test/suites/${suite.id}/edit`} className="text-blue-600 dark:text-blue-400 hover:underline mr-3">Edit</Link>
                                        <Link href={`/test/suites/${suite.id}`} className="text-gray-600 dark:text-gray-400 hover:underline">View</Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
                    <span>
                        Showing <span className="font-medium text-slate-700 dark:text-slate-300">{suites.length}</span> of {pagination.total}
                    </span>
                    {pagination.total_pages > 1 && (
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => loadSuites(pagination.page - 1)}>Prev</Button>
                            <span className="text-slate-400">Page {pagination.page} of {pagination.total_pages}</span>
                            <Button variant="outline" size="sm" disabled={pagination.page >= pagination.total_pages} onClick={() => loadSuites(pagination.page + 1)}>Next</Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

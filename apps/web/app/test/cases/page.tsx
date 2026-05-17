'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { TestCase, TestCaseListResponse } from '@/types';
import { testCasesApi, projectsApi, type Project } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { SimpleTooltip } from '@/components/ui/Tooltip';
import { stripHtml } from '@/lib/stripHtml';
import { formatDistanceToNow } from 'date-fns';
import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    flexRender,
    createColumnHelper,
    SortingState,
    VisibilityState,
} from '@tanstack/react-table';

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

const columnHelper = createColumnHelper<TestCase>();

function buildTestCaseTooltip(tc: TestCase): string {
    const parts: string[] = [tc.title];
    const desc = stripHtml(tc.description || '');
    if (desc) parts.push(desc.slice(0, 150));
    if (tc.test_type) parts.push(`Type: ${tc.test_type}`);
    if (tc.priority) parts.push(`Priority: ${tc.priority}`);
    return parts.join(' | ');
}

export default function TestCasesPage() {
    const [testCases, setTestCases] = useState<TestCase[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, total_pages: 0 });

    const [search, setSearch] = useState('');
    const [projectFilter, setProjectFilter] = useState('');
    const [status, setStatus] = useState('');
    const [priority, setPriority] = useState('');
    const [testType, setTestType] = useState('');
    const [automationStatus, setAutomationStatus] = useState('');
    const [syncStatus, setSyncStatus] = useState('');
    const [sortBy] = useState('created_at');
    const [sortOrder] = useState<'asc' | 'desc'>('desc');
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
        sync_status: false,
    });

    useEffect(() => {
        projectsApi.list().then(setProjects).catch(() => {});
    }, []);

    const loadTestCases = useCallback(async (page = 1) => {
        try {
            setLoading(true);
            const response = await testCasesApi.list({
                page,
                limit: 25,
                search: search || undefined,
                project_id: projectFilter || undefined,
                status: status || undefined,
                priority: priority || undefined,
                test_type: testType || undefined,
                automation_status: automationStatus || undefined,
                sync_status: syncStatus || undefined,
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
    }, [search, projectFilter, status, priority, testType, automationStatus, syncStatus, sortBy, sortOrder]);

    useEffect(() => {
        loadTestCases(1);
    }, [loadTestCases]);

    const clearFilters = () => {
        setSearch('');
        setProjectFilter('');
        setStatus('');
        setPriority('');
        setTestType('');
        setAutomationStatus('');
        setSyncStatus('');
    };

    const hasActiveFilters = search || projectFilter || status || priority || testType || automationStatus || syncStatus;

    const columns = useMemo(() => [
        columnHelper.accessor('test_case_id', {
            id: 'test_case_id',
            header: 'ID',
            cell: (info) => (
                <Link
                    href={`/test/cases/${info.row.original.id}`}
                    className="text-blue-600 dark:text-blue-400 hover:underline font-mono text-sm"
                >
                    {info.getValue()}
                </Link>
            ),
        }),
        columnHelper.accessor('title', {
            id: 'title',
            header: 'Title',
            size: 400,
            enableHiding: false,
            meta: { className: 'whitespace-normal' } as Record<string, string>,
            cell: (info) => (
                <SimpleTooltip content={buildTestCaseTooltip(info.row.original)} position="top">
                    <div className="min-w-[280px]">
                        <div className="text-sm font-medium text-slate-900 dark:text-white line-clamp-2">
                            {info.getValue()}
                        </div>
                        {info.row.original.project_name && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                {info.row.original.project_name}
                            </div>
                        )}
                    </div>
                </SimpleTooltip>
            ),
        }),
        columnHelper.accessor('test_type', {
            id: 'test_type',
            header: 'Type',
            cell: (info) => (
                <span className="text-sm text-slate-700 dark:text-slate-300 capitalize">
                    {info.getValue() || '-'}
                </span>
            ),
        }),
        columnHelper.accessor('priority', {
            id: 'priority',
            header: 'Priority',
            cell: (info) => (
                <Badge variant={getPriorityBadgeVariant(info.getValue())}>{info.getValue()}</Badge>
            ),
        }),
        columnHelper.accessor('status', {
            id: 'status',
            header: 'Status',
            cell: (info) => (
                <Badge variant={getStatusBadgeVariant(info.getValue())}>{info.getValue()}</Badge>
            ),
        }),
        columnHelper.accessor('automation_status', {
            id: 'automation_status',
            header: 'Automation',
            cell: (info) => (
                <span className="text-sm text-slate-700 dark:text-slate-300 capitalize">
                    {info.getValue()?.replace('_', ' ') || 'manual'}
                </span>
            ),
        }),
        columnHelper.accessor('latest_execution_status', {
            id: 'latest_execution_status',
            header: 'Last Result',
            cell: (info) => {
                const v = info.getValue();
                return v ? (
                    <Badge variant={v === 'passed' ? 'success' : v === 'failed' ? 'danger' : 'default'}>
                        {v}
                    </Badge>
                ) : (
                    <span className="text-xs text-gray-400">Never Run</span>
                );
            },
        }),
        columnHelper.accessor('sync_status', {
            id: 'sync_status',
            header: 'Sync',
            cell: (info) => {
                const v = info.getValue();
                return v && v !== 'not_synced' ? (
                    <Badge variant={getSyncBadgeVariant(v)}>{v}</Badge>
                ) : (
                    <span className="text-xs text-gray-400">-</span>
                );
            },
        }),
        columnHelper.accessor('latest_execution_date', {
            id: 'latest_execution_date',
            header: 'Last Run',
            cell: (info) => (
                <span className="text-xs text-gray-600 dark:text-gray-400">
                    {info.getValue()
                        ? formatDistanceToNow(new Date(info.getValue()!), { addSuffix: true })
                        : 'Never'}
                </span>
            ),
        }),
        columnHelper.display({
            id: 'actions',
            header: '',
            enableHiding: false,
            cell: (info) => (
                <div className="flex gap-3 text-sm">
                    <Link
                        href={`/test/cases/${info.row.original.id}/edit`}
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                        Edit
                    </Link>
                    <Link
                        href={`/test/cases/${info.row.original.id}`}
                        className="text-gray-600 dark:text-gray-400 hover:underline"
                    >
                        View
                    </Link>
                </div>
            ),
        }),
    ], []);

    const table = useReactTable({
        data: testCases,
        columns,
        state: { sorting, columnVisibility },
        onSortingChange: setSorting,
        onColumnVisibilityChange: setColumnVisibility,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

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

            <div className="mb-6 space-y-4">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && loadTestCases(1)}
                        placeholder="Search by ID, title, or description..."
                        className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <Button onClick={() => loadTestCases(1)}>Search</Button>
                </div>

                <div className="flex flex-wrap gap-3 items-center">
                    <select
                        value={projectFilter}
                        onChange={(e) => setProjectFilter(e.target.value)}
                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-slate-900 dark:text-white text-sm"
                    >
                        <option value="">All Projects</option>
                        {projects.map(p => (
                            <option key={p.id} value={p.id}>{p.project_name}</option>
                        ))}
                    </select>
                    <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-slate-900 dark:text-white text-sm">
                        {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <select value={priority} onChange={(e) => setPriority(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-slate-900 dark:text-white text-sm">
                        {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <select value={testType} onChange={(e) => setTestType(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-slate-900 dark:text-white text-sm">
                        {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <select value={automationStatus} onChange={(e) => setAutomationStatus(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-slate-900 dark:text-white text-sm">
                        {AUTOMATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <select value={syncStatus} onChange={(e) => setSyncStatus(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-slate-900 dark:text-white text-sm">
                        {SYNC_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {hasActiveFilters && (
                        <Button variant="ghost" size="sm" onClick={clearFilters}>Clear All</Button>
                    )}
                    <span className="ml-auto text-sm text-gray-600 dark:text-gray-400">
                        {pagination.total} test case{pagination.total !== 1 ? 's' : ''}
                    </span>
                </div>
            </div>

            {loading && testCases.length === 0 ? (
                <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>
            ) : testCases.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                        No test cases found. Create your first test case to get started.
                    </p>
                    <Link href="/test/cases/create"><Button>Create Test Case</Button></Link>
                </div>
            ) : (
                <>
                    <div className="space-y-2">
                        <div className="flex justify-end">
                            <div className="relative group">
                                <button className="p-2 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                </button>
                                <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-30 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 p-2">
                                    <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                                        Toggle Columns
                                    </div>
                                    {table.getAllLeafColumns().map(column => {
                                        if (!column.getCanHide()) return null;
                                        return (
                                            <label
                                                key={column.id}
                                                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg cursor-pointer"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={column.getIsVisible()}
                                                    onChange={column.getToggleVisibilityHandler()}
                                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                />
                                                <span>{column.columnDef.header as string || column.id}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                        {table.getHeaderGroups().map(headerGroup => (
                                            <tr key={headerGroup.id}>
                                                {headerGroup.headers.map(header => (
                                                    <th
                                                        key={header.id}
                                                        className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"
                                                    >
                                                        {header.isPlaceholder ? null : (
                                                            <div
                                                                className={`flex items-center gap-1 ${header.column.getCanSort() ? 'cursor-pointer select-none hover:text-slate-900 dark:hover:text-white' : ''}`}
                                                                onClick={header.column.getToggleSortingHandler()}
                                                            >
                                                                {flexRender(header.column.columnDef.header, header.getContext())}
                                                                {{ asc: ' ↑', desc: ' ↓' }[header.column.getIsSorted() as string] ?? null}
                                                            </div>
                                                        )}
                                                    </th>
                                                ))}
                                            </tr>
                                        ))}
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                        {table.getRowModel().rows.map(row => (
                                            <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                                                {row.getVisibleCells().map(cell => (
                                                    <td
                                                        key={cell.id}
                                                        className={`px-4 py-3 text-sm ${
                                                            (cell.column.columnDef.meta as { className?: string })?.className ?? 'whitespace-nowrap'
                                                        }`}
                                                    >
                                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {pagination.total_pages > 1 && (
                        <div className="flex items-center justify-between mt-4">
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                                Showing {((pagination.page - 1) * pagination.limit) + 1}-{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                            </span>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={pagination.page <= 1}
                                    onClick={() => loadTestCases(pagination.page - 1)}
                                >
                                    Previous
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={pagination.page >= pagination.total_pages}
                                    onClick={() => loadTestCases(pagination.page + 1)}
                                >
                                    Next
                                </Button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

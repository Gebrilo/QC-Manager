'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { TestSuite, TestSuiteListResponse } from '@/types';
import { testSuitesApi, projectsApi, type Project } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    flexRender,
    createColumnHelper,
    SortingState,
} from '@tanstack/react-table';

// ── Pill colour maps ────────────────────────────────────────────────────────
const STATUS_PILL: Record<string, string> = {
    active:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    draft:    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    archived: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
    return (
        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
            {children}
        </span>
    );
}

function GlassSelect({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
    return (
        <div className="relative">
            <select
                value={value}
                onChange={e => onChange(e.target.value)}
                className="appearance-none h-10 pl-3.5 pr-8 rounded-lg bg-white/70 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/50 dark:border-slate-700/50 text-sm text-slate-600 dark:text-slate-300 hover:border-violet-400/60 transition-colors focus:outline-none focus:border-violet-500 cursor-pointer"
            >
                {children}
            </select>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <path d="M6 9l6 6 6-6" />
            </svg>
        </div>
    );
}

const columnHelper = createColumnHelper<TestSuite>();

export default function TestSuitesPage() {
    const [suites, setSuites] = useState<TestSuite[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, total_pages: 0 });

    const [search, setSearch] = useState('');
    const [projectFilter, setProjectFilter] = useState('');
    const [status, setStatus] = useState('');
    const [sortBy] = useState('created_at');
    const [sortOrder] = useState<'asc' | 'desc'>('desc');
    const [sorting, setSorting] = useState<SortingState>([]);

    useEffect(() => {
        projectsApi.list().then(setProjects).catch(() => {});
    }, []);

    const loadSuites = useCallback(async (page = 1) => {
        try {
            setLoading(true);
            const response = await testSuitesApi.list({
                page,
                limit: 25,
                search: search || undefined,
                project_id: projectFilter || undefined,
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
    }, [search, projectFilter, status, sortBy, sortOrder]);

    useEffect(() => {
        loadSuites(1);
    }, [loadSuites]);

    const stats = useMemo(() => ({
        total:      pagination.total,
        active:     suites.filter(s => s.status === 'active').length,
        totalCases: suites.reduce((sum, s) => sum + (s.test_case_count ?? 0), 0),
        archived:   suites.filter(s => s.status === 'archived').length,
    }), [suites, pagination.total]);

    const hasAnyFilter = !!(search || projectFilter || status);

    const columns = useMemo(() => [
        columnHelper.accessor('suite_id', {
            id: 'suite_id',
            header: 'ID',
            enableHiding: false,
            cell: (info) => (
                <Link
                    href={`/test/suites/${info.row.original.id}`}
                    className="font-mono text-xs font-semibold text-violet-600 dark:text-violet-300 hover:text-violet-800 dark:hover:text-violet-100 transition-colors"
                >
                    {info.getValue()}
                </Link>
            ),
        }),
        columnHelper.accessor('name', {
            id: 'name',
            header: 'Name',
            enableHiding: false,
            cell: (info) => (
                <div style={{ minWidth: 240, maxWidth: 360 }}>
                    <Link
                        href={`/test/suites/${info.row.original.id}`}
                        className="font-medium text-slate-800 dark:text-slate-100 hover:text-violet-700 dark:hover:text-violet-300 transition-colors truncate block"
                    >
                        {info.getValue()}
                    </Link>
                    {info.row.original.description && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate">{info.row.original.description}</p>
                    )}
                </div>
            ),
        }),
        columnHelper.accessor('project_name', {
            id: 'project_name',
            header: 'Project',
            cell: (info) => (
                <span className="text-slate-600 dark:text-slate-300 font-medium text-sm">{info.getValue() || '—'}</span>
            ),
        }),
        columnHelper.accessor('status', {
            id: 'status',
            header: 'Status',
            cell: (info) => {
                const v = info.getValue();
                return <Pill tone={STATUS_PILL[v] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}>{v}</Pill>;
            },
        }),
        columnHelper.accessor('test_case_count', {
            id: 'test_case_count',
            header: 'Cases',
            cell: (info) => (
                <span className="text-slate-600 dark:text-slate-300 text-sm tabular-nums">{info.getValue() ?? 0}</span>
            ),
        }),
        columnHelper.accessor('last_run_date', {
            id: 'last_run_date',
            header: 'Last Run',
            cell: (info) => (
                <span className="text-slate-500 dark:text-slate-400 text-sm tabular-nums whitespace-nowrap">
                    {info.getValue()
                        ? formatDistanceToNow(new Date(info.getValue()!), { addSuffix: true })
                        : '—'}
                </span>
            ),
        }),
        columnHelper.accessor('created_at', {
            id: 'created_at',
            header: 'Created',
            cell: (info) => (
                <span className="text-slate-500 dark:text-slate-400 text-sm tabular-nums whitespace-nowrap">
                    {formatDistanceToNow(new Date(info.getValue()), { addSuffix: true })}
                </span>
            ),
        }),
        columnHelper.display({
            id: 'actions',
            header: '',
            enableHiding: false,
            cell: (info) => (
                <div className="flex justify-end gap-3 text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                    <Link href={`/test/suites/${info.row.original.id}/edit`} className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 font-medium">Edit</Link>
                    <Link href={`/test/suites/${info.row.original.id}`} className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">View</Link>
                </div>
            ),
        }),
    ], []);

    const table = useReactTable({
        data: suites,
        columns,
        state: { sorting },
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    return (
        <div className="max-w-[1600px] mx-auto px-6 py-6 space-y-5">

            {/* ── Header ─────────────────────────────────────────────── */}
            <div className="flex items-end justify-between">
                <div>
                    <h1 className="text-4xl font-bold text-slate-900 dark:text-white tracking-tight">Test Suites</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
                        Organize test cases into runnable suites · Total{' '}
                        <span className="font-semibold text-slate-700 dark:text-slate-200">{pagination.total}</span>
                    </p>
                </div>
                <Link
                    href="/test/suites/create"
                    className="inline-flex items-center gap-2 h-10 px-4 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 active:scale-95 transition-all"
                >
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M12 5v14M5 12h14" />
                    </svg>
                    New Suite
                </Link>
            </div>

            {/* ── Stat strip ─────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                    { label: 'Total',       value: loading ? '—' : stats.total,      dot: 'bg-slate-400' },
                    { label: 'Active',      value: loading ? '—' : stats.active,     dot: 'bg-emerald-500' },
                    { label: 'Total Cases', value: loading ? '—' : stats.totalCases, dot: 'bg-violet-500' },
                    { label: 'Archived',    value: loading ? '—' : stats.archived,   dot: 'bg-amber-500' },
                ].map(s => (
                    <div key={s.label} className="glass-card rounded-xl px-4 py-3 flex items-center justify-between">
                        <div>
                            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{s.label}</div>
                            <div className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">{s.value}</div>
                        </div>
                        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${s.dot}`} />
                    </div>
                ))}
            </div>

            {/* ── Filter bar ─────────────────────────────────────────── */}
            <div className="glass-card rounded-2xl p-3 flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[240px]">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                        <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                    </svg>
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search name, description, ID…"
                        className="w-full h-10 pl-10 pr-4 rounded-lg bg-white/70 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/50 dark:border-slate-700/50 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-violet-500 transition-colors"
                    />
                </div>
                <GlassSelect value={projectFilter} onChange={setProjectFilter}>
                    <option value="">All Projects</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
                </GlassSelect>
                <GlassSelect value={status} onChange={setStatus}>
                    <option value="">All Statuses</option>
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                </GlassSelect>
                {hasAnyFilter && (
                    <button
                        onClick={() => { setSearch(''); setProjectFilter(''); setStatus(''); }}
                        className="h-10 px-3 rounded-lg text-sm text-slate-500 hover:text-rose-500 dark:text-slate-400 dark:hover:text-rose-400 flex items-center gap-1.5 transition-colors"
                    >
                        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                        Clear
                    </button>
                )}
            </div>

            {/* ── Table ──────────────────────────────────────────────── */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">All Test Suites</h2>
                        <span className="text-xs text-slate-400 tabular-nums">{suites.length} rows</span>
                    </div>
                    <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-400">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M5 12h14M13 5l7 7-7 7" />
                        </svg>
                        Scroll to see all columns
                    </div>
                </div>
                <div
                    className="overflow-x-auto"
                    style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(124,58,237,0.25) transparent' }}
                >
                    <style>{`
                        .ts-table-scroll::-webkit-scrollbar { height: 10px; }
                        .ts-table-scroll::-webkit-scrollbar-track { background: transparent; }
                        .ts-table-scroll::-webkit-scrollbar-thumb { background: rgba(124,58,237,0.25); border-radius: 5px; }
                        .ts-table-scroll::-webkit-scrollbar-thumb:hover { background: rgba(124,58,237,0.5); }
                    `}</style>
                    <table className="w-full text-sm ts-table-scroll" style={{ minWidth: 1050 }}>
                        <thead>
                            <tr className="bg-slate-50/60 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800">
                                {table.getHeaderGroups()[0].headers.map((header, i) => (
                                    <th
                                        key={header.id}
                                        className={[
                                            'text-left py-3 text-[10px] uppercase tracking-wider font-bold text-slate-400',
                                            i === 0
                                                ? 'pl-5 pr-3 sticky left-0 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-sm'
                                                : i === table.getHeaderGroups()[0].headers.length - 1
                                                    ? 'pl-3 pr-5'
                                                    : 'px-3',
                                            header.column.getCanSort() ? 'cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200' : '',
                                        ].join(' ')}
                                        style={i === 0 ? { minWidth: 90 } : {}}
                                        onClick={header.column.getToggleSortingHandler()}
                                    >
                                        {header.isPlaceholder ? null : (
                                            <span className="flex items-center gap-1">
                                                {flexRender(header.column.columnDef.header, header.getContext())}
                                                {{ asc: ' ↑', desc: ' ↓' }[header.column.getIsSorted() as string] ?? null}
                                            </span>
                                        )}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                            {loading ? (
                                <tr>
                                    <td colSpan={table.getVisibleLeafColumns().length} className="px-5 py-12 text-center text-slate-400">
                                        Loading…
                                    </td>
                                </tr>
                            ) : table.getRowModel().rows.length === 0 ? (
                                <tr>
                                    <td colSpan={table.getVisibleLeafColumns().length} className="px-5 py-12 text-center text-slate-400">
                                        No test suites found.
                                    </td>
                                </tr>
                            ) : (
                                table.getRowModel().rows.map(row => (
                                    <tr key={row.id} className="hover:bg-violet-50/40 dark:hover:bg-violet-900/10 transition-colors group">
                                        {row.getVisibleCells().map((cell, ci) => (
                                            <td
                                                key={cell.id}
                                                className={[
                                                    'py-3.5',
                                                    ci === 0
                                                        ? 'pl-5 pr-3 sticky left-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm group-hover:bg-violet-50/95 dark:group-hover:bg-violet-900/20'
                                                        : ci === row.getVisibleCells().length - 1
                                                            ? 'pl-3 pr-5 text-right'
                                                            : 'px-3 whitespace-nowrap',
                                                ].join(' ')}
                                            >
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                    <span>
                        Showing{' '}
                        <span className="font-semibold text-slate-700 dark:text-slate-200">{suites.length}</span>{' '}
                        of {pagination.total}
                    </span>
                    {pagination.total_pages > 1 && (
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => loadSuites(pagination.page - 1)}
                                disabled={pagination.page <= 1}
                                className="px-2.5 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
                            >
                                ‹ Prev
                            </button>
                            <span className="px-2.5 tabular-nums">
                                Page {pagination.page} of {pagination.total_pages}
                            </span>
                            <button
                                onClick={() => loadSuites(pagination.page + 1)}
                                disabled={pagination.page >= pagination.total_pages}
                                className="px-2.5 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
                            >
                                Next ›
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

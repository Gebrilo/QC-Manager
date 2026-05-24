'use client';

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { bugsApi, type Bug } from '@/lib/api';
import { projectsApi, type Project } from '@/lib/api';
import { useAuth } from '@/components/providers/AuthProvider';
import { SimpleTooltip } from '@/components/ui/Tooltip';
import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    flexRender,
    createColumnHelper,
    SortingState,
    VisibilityState,
} from '@tanstack/react-table';

// ── Pill colour maps ────────────────────────────────────────────────────────
const SEV_PILL: Record<string, string> = {
    'Critical Impact': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    'Major impact':    'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    'Minor Impact':    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    'Cosmetic impact': 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    'None':            'bg-slate-50 text-slate-400 dark:bg-slate-800/50 dark:text-slate-500',
};

const STATUS_PILL: Record<string, string> = {
    New:         'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
    'In Progress':'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    Assigned:    'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
    Reopened:    'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    Blocked:     'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    Fixed:       'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
    Verified:    'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
    Duplicate:   'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    Closed:      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
};

const SOURCE_PILL: Record<string, string> = {
    TEST_CASE:   'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
    EXPLORATORY: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
};

function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
    return (
        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
            {children}
        </span>
    );
}

function GlassSelect({
    value,
    onChange,
    children,
}: {
    value: string;
    onChange: (v: string) => void;
    children: React.ReactNode;
}) {
    return (
        <div className="relative">
            <select
                value={value}
                onChange={e => onChange(e.target.value)}
                className="appearance-none h-10 pl-3.5 pr-8 rounded-lg bg-white/70 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/50 dark:border-slate-700/50 text-sm text-slate-600 dark:text-slate-300 hover:border-violet-400/60 transition-colors focus:outline-none focus:border-violet-500 cursor-pointer"
            >
                {children}
            </select>
            <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            >
                <path d="M6 9l6 6 6-6" />
            </svg>
        </div>
    );
}

const columnHelper = createColumnHelper<Bug>();

export default function BugsPage() {
    return (
        <Suspense fallback={<div className="py-12 text-center text-slate-400">Loading…</div>}>
            <BugsContent />
        </Suspense>
    );
}

function BugsContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { hasPermission } = useAuth();
    const canDelete = hasPermission('qc.bugs.delete');

    const [bugs, setBugs] = useState<Bug[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [filter, setFilter] = useState('');
    const [projectFilter, setProjectFilter] = useState(searchParams.get('project_id') || '');
    const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
    const [severityFilter, setSeverityFilter] = useState(searchParams.get('severity') || '');
    const [sourceFilter, setSourceFilter] = useState(searchParams.get('source') || '');
    const [page, setPage] = useState(() => {
        const p = searchParams.get('page');
        return p ? Math.max(0, parseInt(p) - 1) : 0;
    });
    const [deleteTarget, setDeleteTarget] = useState<Bug | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
        submitted_by_resource_name: false,
        updated_by: false,
    });
    const [summary, setSummary] = useState<{
        open: number;
        closed: number;
        fromTests: number;
        critical: number;
    } | null>(null);
    const [summaryLoading, setSummaryLoading] = useState(true);
    const PAGE_SIZE = 50;

    const updateUrlParams = useCallback(() => {
        const params = new URLSearchParams();
        if (projectFilter) params.set('project_id', projectFilter);
        if (statusFilter) params.set('status', statusFilter);
        if (severityFilter) params.set('severity', severityFilter);
        if (sourceFilter) params.set('source', sourceFilter);
        if (page > 0) params.set('page', String(page + 1));
        const qs = params.toString();
        router.replace(`/work/bugs${qs ? `?${qs}` : ''}`, { scroll: false });
    }, [projectFilter, statusFilter, severityFilter, sourceFilter, page, router]);

    useEffect(() => {
        updateUrlParams();
    }, [updateUrlParams]);

    const loadBugs = async () => {
        try {
            setIsLoading(true);
            const res = await bugsApi.list({
                project_id: projectFilter || undefined,
                status:     statusFilter   || undefined,
                severity:   severityFilter || undefined,
                source:     sourceFilter   || undefined,
                limit:  PAGE_SIZE,
                offset: page * PAGE_SIZE,
            });
            setBugs(res.data);
            setTotal(res.total);
        } catch (err) {
            console.error('Failed to load bugs:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        projectsApi.list().then(setProjects).catch(() => {});
    }, []);

    useEffect(() => {
        setSummaryLoading(true);
        bugsApi.summary(projectFilter || undefined).then(res => {
            setSummary({
                open:      res.data.totals.open_bugs,
                closed:    res.data.totals.closed_bugs,
                fromTests: res.data.totals.bugs_from_testing,
                critical:  res.data.by_severity.critical,
            });
        }).catch((err) => {
            console.error('Failed to load bug summary:', err);
        }).finally(() => {
            setSummaryLoading(false);
        });
    }, [projectFilter]);

    useEffect(() => {
        setPage(0);
    }, [projectFilter, statusFilter, severityFilter, sourceFilter]);

    useEffect(() => {
        loadBugs();
    }, [projectFilter, statusFilter, severityFilter, sourceFilter, page]);

    const filtered = useMemo(() => {
        if (!filter) return bugs;
        const q = filter.toLowerCase();
        return bugs.filter(b =>
            b.title.toLowerCase().includes(q) ||
            b.bug_id.toLowerCase().includes(q) ||
            b.assigned_to?.toLowerCase().includes(q) ||
            b.reported_by?.toLowerCase().includes(q) ||
            b.component?.toLowerCase().includes(q)
        );
    }, [bugs, filter]);

    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 4000);
        return () => clearTimeout(t);
    }, [toast]);

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        try {
            await bugsApi.delete(deleteTarget.id);
            setBugs(prev => prev.filter(b => b.id !== deleteTarget.id));
            setTotal(prev => prev - 1);
            setToast({ type: 'success', message: `Bug "${deleteTarget.bug_id}" deleted` });
            setDeleteTarget(null);
        } catch (err: any) {
            setToast({ type: 'error', message: err.message || 'Failed to delete bug' });
        } finally {
            setIsDeleting(false);
        }
    };

    const columns = useMemo(() => [
        columnHelper.accessor('bug_id', {
            id: 'bug_id',
            header: 'ID',
            enableHiding: false,
            cell: (info) => (
                <Link
                    href={`/work/bugs/${info.row.original.id}`}
                    className="font-mono text-xs font-semibold text-violet-600 dark:text-violet-300 hover:text-violet-800 dark:hover:text-violet-100 transition-colors"
                >
                    {info.row.original.tuleap_artifact_id
                        ? `TLP-${info.row.original.tuleap_artifact_id}`
                        : info.getValue()}
                </Link>
            ),
        }),
        columnHelper.accessor('title', {
            id: 'title',
            header: 'Title',
            enableHiding: false,
            cell: (info) => (
                <SimpleTooltip content={`${info.getValue()}${info.row.original.component ? ` · ${info.row.original.component}` : ''}`} position="top">
                    <div style={{ minWidth: 280, maxWidth: 360 }}>
                        <p className="font-medium text-slate-800 dark:text-slate-100 truncate">
                            {info.getValue()}
                        </p>
                        {info.row.original.component && (
                            <p className="text-xs text-slate-400 mt-0.5 truncate">{info.row.original.component}</p>
                        )}
                    </div>
                </SimpleTooltip>
            ),
        }),
        columnHelper.accessor('source', {
            id: 'source',
            header: 'Source',
            cell: (info) => {
                const v = info.getValue() || 'EXPLORATORY';
                const label = v === 'TEST_CASE' ? 'Test Cases' : 'Exploratory';
                return <Pill tone={SOURCE_PILL[v] || SOURCE_PILL.EXPLORATORY}>{label}</Pill>;
            },
        }),
        columnHelper.accessor('severity', {
            id: 'severity',
            header: 'Severity',
            cell: (info) => {
                const v = info.getValue();
                return <Pill tone={SEV_PILL[v] || SEV_PILL['None']}>{v || 'None'}</Pill>;
            },
        }),
        columnHelper.accessor('status', {
            id: 'status',
            header: 'Status',
            cell: (info) => {
                const v = info.getValue();
                return <Pill tone={STATUS_PILL[v] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}>{v}</Pill>;
            },
        }),
        columnHelper.accessor('project_name', {
            id: 'project_name',
            header: 'Project',
            cell: (info) => (
                <span className="text-slate-600 dark:text-slate-300 font-medium text-sm">
                    {info.getValue() || '—'}
                </span>
            ),
        }),
        columnHelper.accessor('submitted_by_resource_name', {
            id: 'submitted_by_resource_name',
            header: 'Submitted By',
            cell: (info) => (
                <span className="text-slate-600 dark:text-slate-300 text-sm">{info.getValue() || '—'}</span>
            ),
        }),
        columnHelper.accessor('updated_by', {
            id: 'updated_by',
            header: 'Updated By',
            cell: (info) => (
                <span className="text-slate-600 dark:text-slate-300 text-sm">
                    {info.getValue() || info.row.original.reported_by || '—'}
                </span>
            ),
        }),
        columnHelper.accessor('assigned_to', {
            id: 'assigned_to',
            header: 'Assigned To',
            cell: (info) => (
                <span className="text-slate-600 dark:text-slate-300 text-sm">{info.getValue() || '—'}</span>
            ),
        }),
        columnHelper.accessor('reported_date', {
            id: 'reported_date',
            header: 'Reported',
            cell: (info) => (
                <span className="text-slate-500 dark:text-slate-400 text-sm tabular-nums whitespace-nowrap">
                    {info.getValue() ? new Date(info.getValue()!).toLocaleDateString() : '—'}
                </span>
            ),
        }),
        ...(canDelete ? [columnHelper.display({
            id: 'delete',
            header: '',
            enableHiding: false,
            cell: (info) => (
                <button
                    onClick={() => setDeleteTarget(info.row.original)}
                    className="p-1.5 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                    title="Delete bug"
                >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a2 2 0 012-2h2a2 2 0 012 2v2" />
                    </svg>
                </button>
            ),
        })] : []),
    ], [canDelete]);

    const table = useReactTable({
        data: filtered,
        columns,
        state: { sorting, columnVisibility },
        onSortingChange: setSorting,
        onColumnVisibilityChange: setColumnVisibility,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    const statCards = [
        {
            label: 'Open',
            value: summary?.open ?? '—',
            dot: 'bg-blue-500',
        },
        {
            label: 'Closed',
            value: summary?.closed ?? '—',
            dot: 'bg-emerald-500',
        },
        {
            label: 'From Tests',
            value: summary?.fromTests ?? '—',
            dot: 'bg-violet-500',
        },
        {
            label: 'Critical',
            value: summary?.critical ?? '—',
            dot: 'bg-rose-500',
        },
    ];

    const hasAnyFilter = !!(projectFilter || statusFilter || severityFilter || sourceFilter || filter);

    return (
        <div className="max-w-[1600px] mx-auto px-6 py-6 space-y-5">

            {/* ── Header ─────────────────────────────────────────────── */}
            <div className="flex items-end justify-between">
                <div>
                    <h1 className="text-4xl font-bold text-slate-900 dark:text-white tracking-tight">Bugs</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
                        Defects synced from Tuleap · Total{' '}
                        <span className="font-semibold text-slate-700 dark:text-slate-200">{total}</span>
                    </p>
                </div>
                <Link
                    href="/work/bugs/create"
                    className="inline-flex items-center gap-2 h-10 px-4 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 active:scale-95 transition-all"
                >
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M12 5v14M5 12h14" />
                    </svg>
                    Create Bug
                </Link>
            </div>

            {/* ── Stat strip ─────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {statCards.map(s => (
                    <div
                        key={s.label}
                        className="glass-card rounded-xl px-4 py-3 flex items-center justify-between"
                    >
                        <div>
                            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                                {s.label}
                            </div>
                            {summaryLoading ? (
                                <div className="h-8 w-12 mt-0.5 rounded-md bg-slate-200 dark:bg-slate-700 animate-pulse" />
                            ) : (
                                <div className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                                    {s.value}
                                </div>
                            )}
                        </div>
                        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${s.dot}`} />
                    </div>
                ))}
            </div>

            {/* ── Filter bar ─────────────────────────────────────────── */}
            <div className="glass-card rounded-2xl p-3 flex items-center gap-2 flex-wrap">
                {/* Search */}
                <div className="relative flex-1 min-w-[240px]">
                    <svg
                        width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2"
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    >
                        <circle cx="11" cy="11" r="8" />
                        <path d="M21 21l-4.35-4.35" />
                    </svg>
                    <input
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        placeholder="Search title, ID, component…"
                        className="w-full h-10 pl-10 pr-4 rounded-lg bg-white/70 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/50 dark:border-slate-700/50 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-violet-500 transition-colors"
                    />
                </div>

                {/* Project */}
                <GlassSelect value={projectFilter} onChange={v => setProjectFilter(v)}>
                    <option value="">All Projects</option>
                    {projects.map(p => (
                        <option key={p.id} value={p.id}>{p.project_name}</option>
                    ))}
                </GlassSelect>

                {/* Status */}
                <GlassSelect value={statusFilter} onChange={v => setStatusFilter(v)}>
                    <option value="">All Statuses</option>
                    {['New', 'In Progress', 'Assigned', 'Reopened', 'Blocked', 'Fixed', 'Verified', 'Duplicate', 'Closed'].map(s => (
                        <option key={s} value={s}>{s}</option>
                    ))}
                </GlassSelect>

                {/* Severity */}
                <GlassSelect value={severityFilter} onChange={v => setSeverityFilter(v)}>
                    <option value="">All Severities</option>
                    {['Critical Impact', 'Major impact', 'Minor Impact', 'Cosmetic impact', 'None'].map(s => (
                        <option key={s} value={s}>{s}</option>
                    ))}
                </GlassSelect>

                {/* Source */}
                <GlassSelect value={sourceFilter} onChange={v => setSourceFilter(v)}>
                    <option value="">All Sources</option>
                    <option value="TEST_CASE">Test Cases</option>
                    <option value="EXPLORATORY">Exploratory</option>
                </GlassSelect>

                {/* Clear */}
                {hasAnyFilter && (
                    <button
                        onClick={() => {
                            setProjectFilter('');
                            setStatusFilter('');
                            setSeverityFilter('');
                            setSourceFilter('');
                            setFilter('');
                        }}
                        className="h-10 px-3 rounded-lg text-sm text-slate-500 hover:text-rose-500 dark:text-slate-400 dark:hover:text-rose-400 flex items-center gap-1.5 transition-colors"
                    >
                        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                        Clear
                    </button>
                )}

                {/* Column visibility toggle */}
                <div className="relative group ml-auto">
                    <button className="h-10 w-10 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-800/60 transition-colors">
                        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                            <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </button>
                    <div className="absolute right-0 top-full mt-2 w-52 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 z-30 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 p-2">
                        <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Columns
                        </div>
                        {table.getAllLeafColumns().map(column => {
                            if (!column.getCanHide()) return null;
                            return (
                                <label
                                    key={column.id}
                                    className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg cursor-pointer"
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

            {/* ── Table ──────────────────────────────────────────────── */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">

                {/* Table header bar */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">All Bugs</h2>
                        <span className="text-xs text-slate-400 tabular-nums">{filtered.length} rows</span>
                    </div>
                    <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-400">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M5 12h14M13 5l7 7-7 7" />
                        </svg>
                        Scroll to see all columns
                    </div>
                </div>

                {/* Scrollable table */}
                <div
                    className="overflow-x-auto"
                    style={{
                        scrollbarWidth: 'thin',
                        scrollbarColor: 'rgba(124,58,237,0.25) transparent',
                    }}
                >
                    <style>{`
                        .bugs-table-scroll::-webkit-scrollbar { height: 10px; }
                        .bugs-table-scroll::-webkit-scrollbar-track { background: transparent; }
                        .bugs-table-scroll::-webkit-scrollbar-thumb { background: rgba(124,58,237,0.25); border-radius: 5px; }
                        .bugs-table-scroll::-webkit-scrollbar-thumb:hover { background: rgba(124,58,237,0.5); }
                    `}</style>
                    <table className="w-full text-sm bugs-table-scroll" style={{ minWidth: 1200 }}>
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
                            {isLoading ? (
                                <tr>
                                    <td
                                        colSpan={table.getVisibleLeafColumns().length}
                                        className="px-5 py-12 text-center text-slate-400"
                                    >
                                        Loading…
                                    </td>
                                </tr>
                            ) : table.getRowModel().rows.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={table.getVisibleLeafColumns().length}
                                        className="px-5 py-12 text-center text-slate-400"
                                    >
                                        No bugs found.
                                    </td>
                                </tr>
                            ) : (
                                table.getRowModel().rows.map(row => (
                                    <tr
                                        key={row.id}
                                        className="hover:bg-violet-50/40 dark:hover:bg-violet-900/10 transition-colors group"
                                    >
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

                {/* Pagination footer */}
                <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                    <span>
                        Showing{' '}
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                            {filtered.length}
                        </span>{' '}
                        of {total}
                    </span>
                    {total > PAGE_SIZE && (
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setPage(p => Math.max(0, p - 1))}
                                disabled={page === 0}
                                className="px-2.5 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
                            >
                                ‹ Prev
                            </button>
                            <span className="px-2.5 tabular-nums">
                                Page {page + 1} of {Math.ceil(total / PAGE_SIZE)}
                            </span>
                            <button
                                onClick={() => setPage(p => p + 1)}
                                disabled={(page + 1) * PAGE_SIZE >= total}
                                className="px-2.5 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
                            >
                                Next ›
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Delete confirmation modal ───────────────────────────── */}
            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 max-w-md w-full mx-4 p-6 space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center flex-shrink-0">
                                <svg className="w-5 h-5 text-rose-600 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="font-semibold text-slate-900 dark:text-white">Delete Bug</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                    Delete{' '}
                                    <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                                        {deleteTarget.bug_id}
                                    </span>
                                    : {deleteTarget.title}?
                                </p>
                                <p className="text-xs text-slate-400 mt-2">
                                    This removes the bug from QC-Manager only. It will not be deleted in Tuleap.
                                </p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                onClick={() => setDeleteTarget(null)}
                                disabled={isDeleting}
                                className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className="px-4 py-2 text-sm rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 transition-colors"
                            >
                                {isDeleting ? 'Deleting…' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Toast ──────────────────────────────────────────────── */}
            {toast && (
                <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
                    toast.type === 'success'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-rose-600 text-white'
                }`}>
                    {toast.message}
                </div>
            )}
        </div>
    );
}

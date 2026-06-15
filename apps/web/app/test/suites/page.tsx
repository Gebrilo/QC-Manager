'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { SuiteStatus, TestSuite, TestSuiteListResponse } from '@/types';
import { testSuitesApi, projectsApi, type Project } from '@/lib/api';
import { SimpleTooltip } from '@/components/ui/Tooltip';
import { StatusControl } from '@/components/shared/StatusControl';
import { BulkStatusActionBar } from '@/components/shared/BulkStatusActionBar';
import { useToast } from '@/components/ui/Toast';
import { formatDistanceToNow } from 'date-fns';
import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    flexRender,
    createColumnHelper,
    SortingState,
} from '@tanstack/react-table';
import { useAuth } from '@/components/providers/AuthProvider';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { canEditStatus, testSuiteStatusRegistry } from '@/lib/statusRegistry';

const BULK_SELECTION_LIMIT = 50;
const BULK_STATUS_CONCURRENCY = 5;

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

function getBulkErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'unknown error';
}

async function runWithConcurrency<T, R>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<R>
) {
    const results: R[] = new Array(items.length);
    let nextIndex = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            results[currentIndex] = await worker(items[currentIndex]);
        }
    });
    await Promise.all(workers);
    return results;
}

function SelectAllCheckbox({
    checked,
    indeterminate,
    disabled,
    onChange,
}: {
    checked: boolean;
    indeterminate: boolean;
    disabled: boolean;
    onChange: (checked: boolean) => void;
}) {
    const ref = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (ref.current) ref.current.indeterminate = indeterminate;
    }, [indeterminate]);

    return (
        <input
            ref={ref}
            type="checkbox"
            aria-label="Select all filtered test suites"
            checked={checked}
            disabled={disabled}
            onClick={event => event.stopPropagation()}
            onChange={event => onChange(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        />
    );
}

const columnHelper = createColumnHelper<TestSuite>();

export default function TestSuitesPage() {
    const { hasPermission } = useAuth();
    const confirmAction = useConfirm();
    const toast = useToast();
    const hasSuiteStatusEditPermission = hasPermission(testSuiteStatusRegistry.editPermission);
    const [suites, setSuites] = useState<TestSuite[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, total_pages: 0 });
    const [listStats, setListStats] = useState({ active: 0, archived: 0, total_cases: 0 });

    const [search, setSearch] = useState('');
    const [projectFilter, setProjectFilter] = useState('');
    const [status, setStatus] = useState('');
    const [sortBy] = useState('created_at');
    const [sortOrder] = useState<'asc' | 'desc'>('desc');
    const [sorting, setSorting] = useState<SortingState>([]);
    const [selectedSuiteIds, setSelectedSuiteIds] = useState<Set<string>>(new Set());
    const [isApplyingBulkStatus, setIsApplyingBulkStatus] = useState(false);

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
                const r = response as TestSuiteListResponse;
                setSuites(r.data);
                setPagination(r.pagination);
                if (r.stats) setListStats(r.stats);
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
        active:     listStats.active,
        totalCases: listStats.total_cases,
        archived:   listStats.archived,
    }), [pagination.total, listStats]);

    const hasAnyFilter = !!(search || projectFilter || status);
    const canCreateSuite = hasPermission('qc.testsuites.create') || hasPermission('qc.testsuites.view');

    useEffect(() => {
        const visibleIds = new Set(suites.map(suite => suite.id));
        setSelectedSuiteIds(prev => {
            let changed = false;
            const next = new Set<string>();
            prev.forEach(id => {
                if (visibleIds.has(id)) {
                    next.add(id);
                } else {
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, [suites]);

    const patchSuite = useCallback((suiteId: string, patch: Partial<TestSuite>) => {
        setSuites(prev => prev.map(suite => suite.id === suiteId ? { ...suite, ...patch } : suite));
    }, []);

    const handleStatusCommitted = useCallback((suiteId: string, _nextStatus: string, updated: unknown) => {
        if (!updated || typeof updated !== 'object') return;
        const next = updated as Partial<TestSuite>;
        setSuites(prev => prev.map(suite => (
            suite.id === suiteId ? { ...suite, ...next, _can: next._can ?? suite._can } : suite
        )));
    }, []);

    const suiteById = useMemo(() => new Map(suites.map(suite => [suite.id, suite])), [suites]);
    const selectedSuites = useMemo(
        () => Array.from(selectedSuiteIds)
            .map(id => suiteById.get(id))
            .filter((suite): suite is TestSuite => Boolean(suite)),
        [selectedSuiteIds, suiteById]
    );

    const isSuiteSelectable = useCallback(
        (suite: TestSuite) => canEditStatus(suite._can?.edit, hasSuiteStatusEditPermission),
        [hasSuiteStatusEditPermission]
    );

    const handleToggleSuiteSelection = useCallback((suiteId: string, selected: boolean) => {
        const suite = suiteById.get(suiteId);
        if (!suite) return;
        if (selected && !isSuiteSelectable(suite)) {
            toast.warning("You don't have permission to select this test suite");
            return;
        }
        if (selected && !selectedSuiteIds.has(suiteId) && selectedSuiteIds.size >= BULK_SELECTION_LIMIT) {
            toast.warning(`Selection is limited to ${BULK_SELECTION_LIMIT} test suites`);
            return;
        }
        setSelectedSuiteIds(prev => {
            const next = new Set(prev);
            if (selected) {
                next.add(suiteId);
            } else {
                next.delete(suiteId);
            }
            return next;
        });
    }, [isSuiteSelectable, selectedSuiteIds, suiteById, toast]);

    const handleToggleAllSelection = useCallback((selected: boolean) => {
        if (!selected) {
            setSelectedSuiteIds(new Set());
            return;
        }

        const selectableIds = suites
            .filter(suite => isSuiteSelectable(suite))
            .map(suite => suite.id);
        const cappedIds = selectableIds.slice(0, BULK_SELECTION_LIMIT);
        setSelectedSuiteIds(new Set(cappedIds));
        if (selectableIds.length > BULK_SELECTION_LIMIT) {
            toast.warning(`Selected the first ${BULK_SELECTION_LIMIT} editable test suites. Refine filters to update more.`);
        }
    }, [isSuiteSelectable, suites, toast]);

    const handleBulkStatusApply = useCallback(async (nextStatus: string) => {
        if (selectedSuites.length === 0 || isApplyingBulkStatus) return;

        const normalizedStatus = testSuiteStatusRegistry.normalize(nextStatus) as SuiteStatus;
        const candidates = selectedSuites.slice(0, BULK_SELECTION_LIMIT);
        const previousStatuses = new Map(candidates.map(suite => [suite.id, testSuiteStatusRegistry.normalize(suite.status || '') as SuiteStatus]));
        const editableSuites: TestSuite[] = [];
        const failureReasons: string[] = [];

        candidates.forEach(suite => {
            if (isSuiteSelectable(suite)) {
                editableSuites.push(suite);
            } else {
                failureReasons.push('no permission');
            }
        });

        editableSuites.forEach(suite => {
            patchSuite(suite.id, { status: normalizedStatus });
        });

        setIsApplyingBulkStatus(true);
        try {
            const results = await runWithConcurrency(editableSuites, BULK_STATUS_CONCURRENCY, async (suite) => {
                const previousStatus = previousStatuses.get(suite.id) || testSuiteStatusRegistry.normalize(suite.status || '');
                const payload = testSuiteStatusRegistry.defaultFills?.(normalizedStatus, { previousStatus }) || {};
                try {
                    const updated = await testSuiteStatusRegistry.update(suite.id, normalizedStatus, payload);
                    return { suite, ok: true as const, updated };
                } catch (error) {
                    return { suite, ok: false as const, error };
                }
            });

            let updatedCount = 0;
            let failedCount = failureReasons.length;

            results.forEach(result => {
                if (result.ok) {
                    updatedCount += 1;
                    handleStatusCommitted(result.suite.id, normalizedStatus, result.updated);
                    return;
                }
                failedCount += 1;
                failureReasons.push(getBulkErrorMessage(result.error));
                const previousStatus = previousStatuses.get(result.suite.id) || testSuiteStatusRegistry.normalize(result.suite.status || '');
                patchSuite(result.suite.id, { status: previousStatus as SuiteStatus });
            });

            const distinctReasons = Array.from(new Set(failureReasons.filter(Boolean)));
            const reasonSuffix = distinctReasons.length > 0 ? ` (${distinctReasons.slice(0, 2).join(', ')})` : '';
            if (failedCount === 0) {
                toast.success(`${updatedCount} updated`);
            } else if (updatedCount > 0) {
                toast.warning(`${updatedCount} updated, ${failedCount} failed${reasonSuffix}`);
            } else {
                toast.error(`0 updated, ${failedCount} failed${reasonSuffix}`);
            }
            setSelectedSuiteIds(new Set());
        } finally {
            setIsApplyingBulkStatus(false);
        }
    }, [
        handleStatusCommitted,
        isApplyingBulkStatus,
        isSuiteSelectable,
        patchSuite,
        selectedSuites,
        toast,
    ]);

    const selectableSuiteIds = useMemo(
        () => suites
            .filter(suite => canEditStatus(suite._can?.edit, hasSuiteStatusEditPermission))
            .map(suite => suite.id),
        [suites, hasSuiteStatusEditPermission]
    );
    const cappedSelectableSuiteIds = useMemo(
        () => selectableSuiteIds.slice(0, BULK_SELECTION_LIMIT),
        [selectableSuiteIds]
    );
    const selectedVisibleCount = cappedSelectableSuiteIds.filter(id => selectedSuiteIds.has(id)).length;
    const allVisibleSelected = cappedSelectableSuiteIds.length > 0 && selectedVisibleCount === cappedSelectableSuiteIds.length;
    const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;
    const selectionAtLimit = selectedSuiteIds.size >= BULK_SELECTION_LIMIT;

    const handleDeleteSuite = useCallback(async (suite: TestSuite) => {
        if (suite._can?.delete === false) return;
        const confirmed = await confirmAction({
            title: 'Delete test suite',
            message: `Delete test suite "${suite.name}"?`,
            confirmLabel: 'Delete',
            variant: 'danger',
        });
        if (!confirmed) return;
        try {
            await testSuitesApi.delete(suite.id);
            setSuites(prev => prev.filter(item => item.id !== suite.id));
            setPagination(prev => ({ ...prev, total: Math.max(0, prev.total - 1) }));
        } catch (error) {
            console.error('Failed to delete test suite:', error);
        }
    }, [confirmAction]);

    const columns = useMemo(() => [
        columnHelper.display({
            id: 'select',
            header: () => (
                <SelectAllCheckbox
                    checked={allVisibleSelected}
                    indeterminate={someVisibleSelected}
                    disabled={cappedSelectableSuiteIds.length === 0}
                    onChange={handleToggleAllSelection}
                />
            ),
            enableHiding: false,
            enableSorting: false,
            cell: (info) => {
                const suite = info.row.original;
                const checked = selectedSuiteIds.has(suite.id);
                const selectable = canEditStatus(suite._can?.edit, hasSuiteStatusEditPermission);
                const disabledReason = !selectable
                    ? "You don't have permission to select this test suite"
                    : !checked && selectionAtLimit
                        ? `Selection is limited to ${BULK_SELECTION_LIMIT} test suites`
                        : '';
                const checkbox = (
                    <input
                        type="checkbox"
                        data-testid={`select-test-suite-${suite.id}`}
                        aria-label={`Select test suite ${suite.suite_id}`}
                        checked={checked}
                        disabled={Boolean(disabledReason)}
                        onChange={event => handleToggleSuiteSelection(suite.id, event.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                );

                if (!disabledReason) return checkbox;
                return (
                    <SimpleTooltip content={disabledReason} position="top">
                        <span className="inline-flex cursor-not-allowed">{checkbox}</span>
                    </SimpleTooltip>
                );
            },
        }),
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
                const suite = info.row.original;
                return (
                    <StatusControl
                        artifactType="test_suite"
                        artifactId={suite.id}
                        value={info.getValue() || 'draft'}
                        canEdit={suite._can?.edit}
                        hasFallbackPermission={hasSuiteStatusEditPermission}
                        onOptimisticChange={(next) => patchSuite(suite.id, { status: next as SuiteStatus })}
                        onChangeCommitted={(next, updated) => handleStatusCommitted(suite.id, next, updated)}
                        onChangeRolledBack={(previous) => patchSuite(suite.id, { status: previous as SuiteStatus })}
                    />
                );
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
            cell: (info) => {
                const suite = info.row.original;
                const canEdit = suite._can?.edit !== false;
                const canDelete = suite._can?.delete !== false;
                return (
                <div className="flex justify-end gap-3 text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                    {canEdit ? (
                        <Link href={`/test/suites/${suite.id}/edit`} className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 font-medium">Edit</Link>
                    ) : (
                        <span className="text-slate-300 dark:text-slate-600 font-medium cursor-not-allowed" title="You do not have permission to edit this suite">Edit</span>
                    )}
                    <Link href={`/test/suites/${suite.id}`} className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">View</Link>
                    <button
                        type="button"
                        onClick={() => handleDeleteSuite(suite)}
                        disabled={!canDelete}
                        className="text-rose-500 hover:text-rose-700 disabled:text-slate-300 disabled:cursor-not-allowed"
                        title={canDelete ? 'Delete suite' : 'You do not have permission to delete this suite'}
                    >
                        Delete
                    </button>
                </div>
                );
            },
        }),
    ], [
        allVisibleSelected,
        cappedSelectableSuiteIds.length,
        handleDeleteSuite,
        handleStatusCommitted,
        handleToggleAllSelection,
        handleToggleSuiteSelection,
        hasSuiteStatusEditPermission,
        patchSuite,
        selectedSuiteIds,
        selectionAtLimit,
        someVisibleSelected,
    ]);

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
                {canCreateSuite && (
                    <Link
                        href="/test/suites/create"
                        className="inline-flex items-center gap-2 h-10 px-4 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 active:scale-95 transition-all"
                    >
                        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M12 5v14M5 12h14" />
                        </svg>
                        New Suite
                    </Link>
                )}
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
                    {testSuiteStatusRegistry.statuses.map(s => {
                        const option = testSuiteStatusRegistry.getOption(s);
                        return <option key={s} value={s}>{option.label}</option>;
                    })}
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
            <BulkStatusActionBar
                artifactType="test_suite"
                selectedCount={selectedSuiteIds.size}
                isApplying={isApplyingBulkStatus}
                onApplyStatus={handleBulkStatusApply}
                onClear={() => setSelectedSuiteIds(new Set())}
            />
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
                    <table className="w-full text-sm ts-table-scroll" style={{ minWidth: 1100 }}>
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
                                        style={i === 0 ? { minWidth: 48 } : {}}
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
                                    <tr key={row.id} data-testid={`test-suite-row-${row.original.id}`} className="hover:bg-violet-50/40 dark:hover:bg-violet-900/10 transition-colors group">
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

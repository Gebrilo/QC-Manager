'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { artifactPath } from '@/lib/artifactPath';
import { TestCase, TestCaseListResponse } from '@/types';
import { testCasesApi, projectsApi, type Project } from '@/lib/api';
import { SimpleTooltip } from '@/components/ui/Tooltip';
import { SyncBadge } from '@/components/shared/SyncBadge';
import { StatusControl } from '@/components/shared/StatusControl';
import { BulkStatusActionBar } from '@/components/shared/BulkStatusActionBar';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/components/providers/AuthProvider';
import { canEditStatus, testCaseStatusRegistry } from '@/lib/statusRegistry';
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

// ── Pill colour maps ────────────────────────────────────────────────────────
const PRIORITY_PILL: Record<string, string> = {
    critical: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    high:     'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    medium:   'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    low:      'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

const BULK_SELECTION_LIMIT = 50;
const BULK_STATUS_CONCURRENCY = 5;

const RESULT_PILL: Record<string, string> = {
    passed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    failed: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    blocked: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
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
            aria-label="Select all filtered test cases"
            checked={checked}
            disabled={disabled}
            onClick={event => event.stopPropagation()}
            onChange={event => onChange(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        />
    );
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
    const { hasPermission } = useAuth();
    const toast = useToast();
    const hasTestCaseStatusEditPermission = hasPermission(testCaseStatusRegistry.editPermission);
    const [testCases, setTestCases] = useState<TestCase[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, total_pages: 0 });
    const [listStats, setListStats] = useState({ active: 0, critical: 0, automated: 0 });

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
    const [selectedTestCaseIds, setSelectedTestCaseIds] = useState<Set<string>>(new Set());
    const [isApplyingBulkStatus, setIsApplyingBulkStatus] = useState(false);
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({ sync_status: false });

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
                const r = response as TestCaseListResponse;
                setTestCases(r.data);
                setPagination(r.pagination);
                if (r.stats) setListStats(r.stats);
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

    const stats = useMemo(() => ({
        total:     pagination.total,
        active:    listStats.active,
        critical:  listStats.critical,
        automated: listStats.automated,
    }), [pagination.total, listStats]);

    const hasAnyFilter = !!(search || projectFilter || status || priority || testType || automationStatus || syncStatus);

    useEffect(() => {
        const visibleIds = new Set(testCases.map(testCase => testCase.id));
        setSelectedTestCaseIds(prev => {
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
    }, [testCases]);

    const patchTestCase = (testCaseId: string, patch: Partial<TestCase>) => {
        setTestCases(prev => prev.map(testCase => testCase.id === testCaseId ? { ...testCase, ...patch } : testCase));
    };

    const handleStatusCommitted = (testCaseId: string, _nextStatus: string, updated: unknown) => {
        if (!updated || typeof updated !== 'object') return;
        const next = updated as Partial<TestCase>;
        setTestCases(prev => prev.map(testCase => (
            testCase.id === testCaseId ? { ...testCase, ...next, _can: next._can ?? testCase._can } : testCase
        )));
    };

    const testCaseById = useMemo(() => new Map(testCases.map(testCase => [testCase.id, testCase])), [testCases]);
    const selectedTestCases = useMemo(
        () => Array.from(selectedTestCaseIds)
            .map(id => testCaseById.get(id))
            .filter((testCase): testCase is TestCase => Boolean(testCase)),
        [selectedTestCaseIds, testCaseById]
    );

    const isTestCaseSelectable = (testCase: TestCase) => canEditStatus(testCase._can?.edit, hasTestCaseStatusEditPermission);

    const handleToggleTestCaseSelection = (testCaseId: string, selected: boolean) => {
        const testCase = testCaseById.get(testCaseId);
        if (!testCase) return;
        if (selected && !isTestCaseSelectable(testCase)) {
            toast.warning("You don't have permission to select this test case");
            return;
        }
        if (selected && !selectedTestCaseIds.has(testCaseId) && selectedTestCaseIds.size >= BULK_SELECTION_LIMIT) {
            toast.warning(`Selection is limited to ${BULK_SELECTION_LIMIT} test cases`);
            return;
        }
        setSelectedTestCaseIds(prev => {
            const next = new Set(prev);
            if (selected) {
                next.add(testCaseId);
            } else {
                next.delete(testCaseId);
            }
            return next;
        });
    };

    const handleToggleAllSelection = (selected: boolean) => {
        if (!selected) {
            setSelectedTestCaseIds(new Set());
            return;
        }

        const selectableIds = testCases
            .filter(testCase => isTestCaseSelectable(testCase))
            .map(testCase => testCase.id);
        const cappedIds = selectableIds.slice(0, BULK_SELECTION_LIMIT);
        setSelectedTestCaseIds(new Set(cappedIds));
        if (selectableIds.length > BULK_SELECTION_LIMIT) {
            toast.warning(`Selected the first ${BULK_SELECTION_LIMIT} editable test cases. Refine filters to update more.`);
        }
    };

    const handleBulkStatusApply = async (nextStatus: string) => {
        if (selectedTestCases.length === 0 || isApplyingBulkStatus) return;

        const normalizedStatus = testCaseStatusRegistry.normalize(nextStatus) as TestCase['status'];
        const candidates = selectedTestCases.slice(0, BULK_SELECTION_LIMIT);
        const previousStatuses = new Map(candidates.map(testCase => [testCase.id, testCaseStatusRegistry.normalize(testCase.status || '') as TestCase['status']]));
        const editableTestCases: TestCase[] = [];
        const failureReasons: string[] = [];

        candidates.forEach(testCase => {
            if (isTestCaseSelectable(testCase)) {
                editableTestCases.push(testCase);
            } else {
                failureReasons.push('no permission');
            }
        });

        editableTestCases.forEach(testCase => {
            patchTestCase(testCase.id, { status: normalizedStatus });
        });

        setIsApplyingBulkStatus(true);
        try {
            const results = await runWithConcurrency(editableTestCases, BULK_STATUS_CONCURRENCY, async (testCase) => {
                const previousStatus = previousStatuses.get(testCase.id) || testCaseStatusRegistry.normalize(testCase.status || '');
                const payload = testCaseStatusRegistry.defaultFills?.(normalizedStatus, { previousStatus }) || {};
                try {
                    const updated = await testCaseStatusRegistry.update(testCase.id, normalizedStatus, payload);
                    return { testCase, ok: true as const, updated };
                } catch (error) {
                    return { testCase, ok: false as const, error };
                }
            });

            let updatedCount = 0;
            let failedCount = failureReasons.length;

            results.forEach(result => {
                if (result.ok) {
                    updatedCount += 1;
                    handleStatusCommitted(result.testCase.id, normalizedStatus, result.updated);
                    return;
                }
                failedCount += 1;
                failureReasons.push(getBulkErrorMessage(result.error));
                const previousStatus = previousStatuses.get(result.testCase.id) || testCaseStatusRegistry.normalize(result.testCase.status || '');
                patchTestCase(result.testCase.id, { status: previousStatus as TestCase['status'] });
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
            setSelectedTestCaseIds(new Set());
        } finally {
            setIsApplyingBulkStatus(false);
        }
    };

    const selectableTestCaseIds = useMemo(
        () => testCases
            .filter(testCase => canEditStatus(testCase._can?.edit, hasTestCaseStatusEditPermission))
            .map(testCase => testCase.id),
        [testCases, hasTestCaseStatusEditPermission]
    );
    const cappedSelectableTestCaseIds = useMemo(
        () => selectableTestCaseIds.slice(0, BULK_SELECTION_LIMIT),
        [selectableTestCaseIds]
    );
    const selectedVisibleCount = cappedSelectableTestCaseIds.filter(id => selectedTestCaseIds.has(id)).length;
    const allVisibleSelected = cappedSelectableTestCaseIds.length > 0 && selectedVisibleCount === cappedSelectableTestCaseIds.length;
    const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;
    const selectionAtLimit = selectedTestCaseIds.size >= BULK_SELECTION_LIMIT;

    const columns = useMemo(() => [
        columnHelper.display({
            id: 'select',
            header: () => (
                <SelectAllCheckbox
                    checked={allVisibleSelected}
                    indeterminate={someVisibleSelected}
                    disabled={cappedSelectableTestCaseIds.length === 0}
                    onChange={handleToggleAllSelection}
                />
            ),
            enableHiding: false,
            enableSorting: false,
            cell: (info) => {
                const testCase = info.row.original;
                const checked = selectedTestCaseIds.has(testCase.id);
                const selectable = canEditStatus(testCase._can?.edit, hasTestCaseStatusEditPermission);
                const disabledReason = !selectable
                    ? "You don't have permission to select this test case"
                    : !checked && selectionAtLimit
                        ? `Selection is limited to ${BULK_SELECTION_LIMIT} test cases`
                        : '';
                const checkbox = (
                    <input
                        type="checkbox"
                        data-testid={`select-test-case-${testCase.id}`}
                        aria-label={`Select test case ${testCase.test_case_id}`}
                        checked={checked}
                        disabled={Boolean(disabledReason)}
                        onChange={event => handleToggleTestCaseSelection(testCase.id, event.target.checked)}
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
        columnHelper.accessor('test_case_id', {
            id: 'test_case_id',
            header: 'ID',
            enableHiding: false,
            cell: (info) => (
                <Link
                    href={artifactPath('test_case', info.row.original)}
                    className="font-mono text-xs font-semibold text-violet-600 dark:text-violet-300 hover:text-violet-800 dark:hover:text-violet-100 transition-colors"
                >
                    {info.getValue()}
                </Link>
            ),
        }),
        columnHelper.accessor('title', {
            id: 'title',
            header: 'Title',
            enableHiding: false,
            cell: (info) => (
                <SimpleTooltip content={buildTestCaseTooltip(info.row.original)} position="top">
                    <div style={{ minWidth: 280, maxWidth: 360 }}>
                        <Link
                            href={artifactPath('test_case', info.row.original)}
                            className="font-medium text-slate-800 dark:text-slate-100 hover:text-violet-700 dark:hover:text-violet-300 transition-colors truncate block"
                        >
                            {info.getValue()}
                        </Link>
                        {info.row.original.project_name && (
                            <p className="text-xs text-slate-400 mt-0.5 truncate">{info.row.original.project_name}</p>
                        )}
                    </div>
                </SimpleTooltip>
            ),
        }),
        columnHelper.accessor('test_type', {
            id: 'test_type',
            header: 'Type',
            cell: (info) => (
                <span className="text-sm text-slate-600 dark:text-slate-300 capitalize">{info.getValue() || '—'}</span>
            ),
        }),
        columnHelper.accessor('priority', {
            id: 'priority',
            header: 'Priority',
            cell: (info) => {
                const v = info.getValue();
                return <Pill tone={PRIORITY_PILL[v] || PRIORITY_PILL.low}>{v.charAt(0).toUpperCase() + v.slice(1)}</Pill>;
            },
        }),
        columnHelper.accessor('status', {
            id: 'status',
            header: 'Status',
            cell: (info) => {
                const testCase = info.row.original;
                return (
                    <StatusControl
                        artifactType="test_case"
                        artifactId={testCase.id}
                        value={info.getValue() || 'None'}
                        canEdit={testCase._can?.edit}
                        hasFallbackPermission={hasTestCaseStatusEditPermission}
                        onOptimisticChange={(next) => patchTestCase(testCase.id, { status: next as TestCase['status'] })}
                        onChangeCommitted={(next, updated) => handleStatusCommitted(testCase.id, next, updated)}
                        onChangeRolledBack={(previous) => patchTestCase(testCase.id, { status: previous as TestCase['status'] })}
                    />
                );
            },
        }),
        columnHelper.accessor('automation_status', {
            id: 'automation_status',
            header: 'Automation',
            cell: (info) => (
                <span className="text-sm text-slate-600 dark:text-slate-300 capitalize">
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
                    <Pill tone={RESULT_PILL[v] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}>{v}</Pill>
                ) : (
                    <span className="text-xs text-slate-400">Never run</span>
                );
            },
        }),
        columnHelper.accessor('sync_status', {
            id: 'sync_status',
            header: 'Sync',
            cell: (info) => (
                <SyncBadge
                    status={info.row.original.sync_status as any}
                    lastAttemptedAt={info.row.original.last_sync_attempted_at}
                    error={info.row.original.last_sync_error}
                />
            ),
        }),
        columnHelper.accessor('latest_execution_date', {
            id: 'latest_execution_date',
            header: 'Last Run',
            cell: (info) => (
                <span className="text-slate-500 dark:text-slate-400 text-sm tabular-nums whitespace-nowrap">
                    {info.getValue()
                        ? formatDistanceToNow(new Date(info.getValue()!), { addSuffix: true })
                        : '—'}
                </span>
            ),
        }),
        columnHelper.display({
            id: 'actions',
            header: '',
            enableHiding: false,
            cell: (info) => (
                <div className="flex justify-end gap-3 text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                    <Link href={`${artifactPath('test_case', info.row.original)}/edit`} className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 font-medium">Edit</Link>
                    <Link href={artifactPath('test_case', info.row.original)} className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">View</Link>
                </div>
            ),
        }),
    ], [
        allVisibleSelected,
        cappedSelectableTestCaseIds.length,
        handleStatusCommitted,
        handleToggleAllSelection,
        handleToggleTestCaseSelection,
        hasTestCaseStatusEditPermission,
        patchTestCase,
        selectedTestCaseIds,
        selectionAtLimit,
        someVisibleSelected,
    ]);

    const table = useReactTable({
        data: testCases,
        columns,
        state: { sorting, columnVisibility },
        onSortingChange: setSorting,
        onColumnVisibilityChange: setColumnVisibility,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });
    const pageStart = pagination.total === 0
        ? 0
        : Math.min((pagination.page - 1) * pagination.limit + 1, pagination.total);
    const pageEnd = Math.min(pagination.page * pagination.limit, pagination.total);

    return (
        <div className="max-w-[1600px] mx-auto px-6 py-6 space-y-5">

            {/* ── Header ─────────────────────────────────────────────── */}
            <div className="flex items-end justify-between">
                <div>
                    <h1 className="text-4xl font-bold text-slate-900 dark:text-white tracking-tight">Test Cases</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
                        Manage your test case registry · Showing{' '}
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                            {pageStart}{pagination.total > 0 ? `-${pageEnd}` : ''}
                        </span>{' '}
                        of <span className="font-semibold text-slate-700 dark:text-slate-200">{pagination.total}</span>
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Link
                        href="/test/cases/bulk-upload"
                        className="inline-flex items-center gap-2 h-10 px-4 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 bg-white/70 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/60 dark:border-slate-700/60 hover:border-violet-400/60 hover:text-violet-700 dark:hover:text-violet-300 active:scale-95 transition-all"
                    >
                        <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <path d="M17 8l-5-5-5 5"/>
                            <path d="M12 3v12"/>
                        </svg>
                        Bulk upload
                    </Link>
                    <Link
                        href="/test/cases/create"
                        className="inline-flex items-center gap-2 h-10 px-4 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 active:scale-95 transition-all"
                    >
                        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M12 5v14M5 12h14" />
                        </svg>
                        New Test Case
                    </Link>
                </div>
            </div>

            {/* ── Stat strip ─────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                    { label: 'Total',     value: loading ? '—' : stats.total,     dot: 'bg-slate-400' },
                    { label: 'Active',    value: loading ? '—' : stats.active,    dot: 'bg-emerald-500' },
                    { label: 'Critical',  value: loading ? '—' : stats.critical,  dot: 'bg-rose-500' },
                    { label: 'Automated', value: loading ? '—' : stats.automated, dot: 'bg-violet-500' },
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
                        placeholder="Search ID, title, description…"
                        className="w-full h-10 pl-10 pr-4 rounded-lg bg-white/70 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/50 dark:border-slate-700/50 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-violet-500 transition-colors"
                    />
                </div>
                <GlassSelect value={projectFilter} onChange={setProjectFilter}>
                    <option value="">All Projects</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
                </GlassSelect>
                <GlassSelect value={status} onChange={setStatus}>
                    <option value="">All Statuses</option>
                    {testCaseStatusRegistry.statuses.map(s => {
                        const option = testCaseStatusRegistry.getOption(s);
                        return <option key={s} value={s}>{option.label}</option>;
                    })}
                </GlassSelect>
                <GlassSelect value={priority} onChange={setPriority}>
                    <option value="">All Priorities</option>
                    {['critical', 'high', 'medium', 'low'].map(s => (
                        <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                </GlassSelect>
                <GlassSelect value={testType} onChange={setTestType}>
                    <option value="">All Types</option>
                    {['functional', 'regression', 'smoke', 'integration', 'performance', 'security', 'usability', 'exploratory', 'automated'].map(t => (
                        <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                    ))}
                </GlassSelect>
                <GlassSelect value={automationStatus} onChange={setAutomationStatus}>
                    <option value="">All Automation</option>
                    <option value="manual">Manual</option>
                    <option value="automated">Automated</option>
                    <option value="partial">Partial</option>
                    <option value="to_automate">To Automate</option>
                </GlassSelect>
                {hasAnyFilter && (
                    <button
                        onClick={() => { setSearch(''); setProjectFilter(''); setStatus(''); setPriority(''); setTestType(''); setAutomationStatus(''); setSyncStatus(''); }}
                        className="h-10 px-3 rounded-lg text-sm text-slate-500 hover:text-rose-500 dark:text-slate-400 dark:hover:text-rose-400 flex items-center gap-1.5 transition-colors"
                    >
                        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                        Clear
                    </button>
                )}
                {/* Column visibility */}
                <div className="relative group ml-auto">
                    <button className="h-10 w-10 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-800/60 transition-colors">
                        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                            <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </button>
                    <div className="absolute right-0 top-full mt-2 w-52 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 z-30 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 p-2">
                        <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Columns</div>
                        {table.getAllLeafColumns().map(column => {
                            if (!column.getCanHide()) return null;
                            return (
                                <label key={column.id} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg cursor-pointer">
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
            <BulkStatusActionBar
                artifactType="test_case"
                selectedCount={selectedTestCaseIds.size}
                isApplying={isApplyingBulkStatus}
                onApplyStatus={handleBulkStatusApply}
                onClear={() => setSelectedTestCaseIds(new Set())}
            />
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">All Test Cases</h2>
                        <span className="text-xs text-slate-400 tabular-nums">{testCases.length} rows</span>
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
                        .tc-table-scroll::-webkit-scrollbar { height: 10px; }
                        .tc-table-scroll::-webkit-scrollbar-track { background: transparent; }
                        .tc-table-scroll::-webkit-scrollbar-thumb { background: rgba(124,58,237,0.25); border-radius: 5px; }
                        .tc-table-scroll::-webkit-scrollbar-thumb:hover { background: rgba(124,58,237,0.5); }
                    `}</style>
                    <table className="w-full text-sm tc-table-scroll" style={{ minWidth: 1240 }}>
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
                                        No test cases found.
                                    </td>
                                </tr>
                            ) : (
	                                table.getRowModel().rows.map(row => (
	                                    <tr key={row.id} data-testid={`test-case-row-${row.original.id}`} className="hover:bg-violet-50/40 dark:hover:bg-violet-900/10 transition-colors group">
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
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                            {pageStart}{pagination.total > 0 ? `-${pageEnd}` : ''}
                        </span>{' '}
                        of {pagination.total}
                    </span>
                    {pagination.total_pages > 1 && (
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => loadTestCases(pagination.page - 1)}
                                disabled={pagination.page <= 1}
                                className="px-2.5 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
                            >
                                ‹ Prev
                            </button>
                            <span className="px-2.5 tabular-nums">
                                Page {pagination.page} of {pagination.total_pages}
                            </span>
                            <button
                                onClick={() => loadTestCases(pagination.page + 1)}
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

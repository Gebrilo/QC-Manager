# Table Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project filter to Test Cases, column-visibility toggle + wide title + hover tooltip to Test Cases and Bugs, and widen title + add tooltip to Tasks.

**Architecture:** Migrate Test Cases and Bugs from plain HTML tables to `@tanstack/react-table` v8 (same library already used by `TaskTable.tsx`). Column definitions live in `useMemo`; gear-icon dropdown toggles `VisibilityState`. `SimpleTooltip` from Radix UI wraps title cells. Tasks only needs a title-width + tooltip patch.

**Tech Stack:** Next.js 14 (App Router), `@tanstack/react-table` ^8.21.3, `@radix-ui/react-tooltip` (via `SimpleTooltip`), Tailwind CSS.

---

## File Map

| File | Change |
|---|---|
| `apps/web/src/components/tasks/TaskTable.tsx` | Add `SimpleTooltip` on title; widen title column; fix TD className for per-column whitespace |
| `apps/web/app/test/cases/page.tsx` | Add project filter + full TanStack Table conversion |
| `apps/web/app/work/bugs/page.tsx` | Full TanStack Table conversion (project filter already present) |

---

## Task 1: Widen Title + Add Tooltip — `TaskTable.tsx`

**Files:**
- Modify: `apps/web/src/components/tasks/TaskTable.tsx`

- [ ] **Step 1: Add `SimpleTooltip` import**

In the imports block (after `import Link from 'next/link';`), add:

```tsx
import { SimpleTooltip } from '@/components/ui/Tooltip';
```

- [ ] **Step 2: Add `buildTaskTooltip` helper above the component**

Insert this function before the `const columnHelper = createColumnHelper<Task>();` line:

```tsx
function buildTaskTooltip(task: Task): string {
    const parts: string[] = [task.task_name];
    if (task.project_name) parts.push(`Project: ${task.project_name}`);
    if (task.priority) parts.push(`Priority: ${task.priority}`);
    if (task.resource1_name) parts.push(`Assignee: ${task.resource1_name}`);
    return parts.join(' | ');
}
```

- [ ] **Step 3: Replace the `task_name` column definition**

Find and replace the entire `task_name` accessor block (lines 58–71 in the original):

Old:
```tsx
columnHelper.accessor('task_name', {
    id: 'task_name',
    header: 'Task Name',
    cell: (info) => (
        <div className="flex flex-col">
            <Link href={`/work/tasks/${info.row.original.id}`} className="font-medium text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                {info.getValue()}
            </Link>
            {info.row.original.project_name && (
                <span className="text-xs text-slate-500 dark:text-slate-500">{info.row.original.project_name}</span>
            )}
        </div>
    ),
}),
```

New:
```tsx
columnHelper.accessor('task_name', {
    id: 'task_name',
    header: 'Task Name',
    size: 400,
    meta: { className: 'whitespace-normal' } as Record<string, string>,
    cell: (info) => (
        <SimpleTooltip content={buildTaskTooltip(info.row.original)} position="top">
            <div className="flex flex-col min-w-[280px]">
                <Link
                    href={`/work/tasks/${info.row.original.id}`}
                    className="font-medium text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors line-clamp-2"
                >
                    {info.getValue()}
                </Link>
                {info.row.original.project_name && (
                    <span className="text-xs text-slate-500 dark:text-slate-500">{info.row.original.project_name}</span>
                )}
            </div>
        </SimpleTooltip>
    ),
}),
```

- [ ] **Step 4: Update the `<td>` className to respect per-column whitespace**

In the `<tbody>` section, find the `<td>` element (around line 270):

Old:
```tsx
<td key={cell.id} className={`whitespace-nowrap px-6 ${rowPadding} text-sm first:pl-8 last:pr-8 transition-[padding] duration-200`}>
```

New:
```tsx
<td
    key={cell.id}
    className={`px-6 ${rowPadding} text-sm first:pl-8 last:pr-8 transition-[padding] duration-200 ${
        (cell.column.columnDef.meta as { className?: string })?.className ?? 'whitespace-nowrap'
    }`}
>
```

- [ ] **Step 5: Verify visually**

```bash
cd apps/web && npm run dev
```

Open `/work/tasks` in a browser. Confirm:
- Task Name column is noticeably wider than other columns
- Hovering over a task name shows a tooltip: `Task name | Project: X | Priority: Y | Assignee: Z`
- Long task names wrap to 2 lines instead of being cut off

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/tasks/TaskTable.tsx
git commit -m "feat(tasks): widen title column and add hover tooltip"
```

---

## Task 2: Test Cases — Project Filter + TanStack Table

**Files:**
- Modify: `apps/web/app/test/cases/page.tsx`

Replace the entire file with the following. The structure mirrors `TaskTable.tsx` and the Bugs page pattern exactly.

- [ ] **Step 1: Replace the full file content**

```tsx
'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { TestCase, TestCaseListResponse } from '@/types';
import type { Project } from '@/types';
import { testCasesApi, projectsApi } from '@/lib/api';
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
    const desc = stripHtml(tc.description);
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
                    {info.getValue() || '—'}
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
                    <span className="text-xs text-gray-400">—</span>
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

            {/* Filters */}
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
                        {/* Column toggle gear icon */}
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

                        {/* Table */}
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
                                Showing {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
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
```

- [ ] **Step 2: Verify visually**

```bash
cd apps/web && npm run dev
```

Open `/test/cases`. Confirm:
- "All Projects" dropdown appears before the Status filter
- Selecting a project re-fetches and filters results
- Title column is wide (~3× other columns); long titles wrap to 2 lines
- Hovering a title shows tooltip: `Title | description preview | Type: X | Priority: Y`
- Gear icon (⚙) appears top-right of the table; hovering it shows checkboxes for all toggleable columns
- Unchecking "Sync" (default hidden) is not in the dropdown; checking/unchecking others adds/removes columns
- Clicking a column header sorts the table

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/test/cases/page.tsx
git commit -m "feat(test-cases): add project filter and TanStack Table with column toggle and title tooltip"
```

---

## Task 3: Bugs — TanStack Table Conversion

**Files:**
- Modify: `apps/web/app/work/bugs/page.tsx`

The project filter already exists. This task adds column visibility, wide title, and hover tooltip.

- [ ] **Step 1: Add TanStack and Tooltip imports**

In `apps/web/app/work/bugs/page.tsx`, find the existing imports block and add:

```tsx
import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    flexRender,
    createColumnHelper,
    SortingState,
    VisibilityState,
} from '@tanstack/react-table';
import { SimpleTooltip } from '@/components/ui/Tooltip';
```

- [ ] **Step 2: Add `columnHelper` and `buildBugTooltip` outside `BugsContent`**

Insert these two declarations between the `STATUS_COLORS` constant and `export default function BugsPage()`:

```tsx
const columnHelper = createColumnHelper<Bug>();

function buildBugTooltip(bug: Bug): string {
    const parts: string[] = [bug.title];
    if (bug.component) parts.push(`Component: ${bug.component}`);
    parts.push(`Severity: ${bug.severity}`);
    parts.push(`Status: ${bug.status}`);
    return parts.join(' | ');
}
```

- [ ] **Step 3: Add `sorting` and `columnVisibility` state inside `BugsContent`**

Inside `BugsContent`, add after the existing `const [toast, ...]` line:

```tsx
const [sorting, setSorting] = useState<SortingState>([]);
const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    submitted_by_resource_name: false,
    updated_by: false,
});
```

- [ ] **Step 4: Add `columns` useMemo inside `BugsContent`**

Insert this `useMemo` after the `handleDelete` function and before the `return` statement:

```tsx
const columns = useMemo(() => [
    columnHelper.accessor('bug_id', {
        id: 'bug_id',
        header: 'ID',
        cell: (info) => (
            <Link
                href={`/work/bugs/${info.row.original.id}`}
                className="text-indigo-600 dark:text-indigo-400 hover:underline font-mono text-xs"
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
        size: 400,
        enableHiding: false,
        meta: { className: 'whitespace-normal' } as Record<string, string>,
        cell: (info) => (
            <SimpleTooltip content={buildBugTooltip(info.row.original)} position="top">
                <div className="min-w-[280px]">
                    <p className="font-medium text-slate-900 dark:text-white line-clamp-2">
                        {info.getValue()}
                    </p>
                    {info.row.original.component && (
                        <p className="text-xs text-slate-400 mt-0.5">{info.row.original.component}</p>
                    )}
                </div>
            </SimpleTooltip>
        ),
    }),
    columnHelper.accessor('source', {
        id: 'source',
        header: 'Source',
        cell: (info) => (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                info.getValue() === 'TEST_CASE'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400'
                    : 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400'
            }`}>
                {info.getValue() === 'TEST_CASE' ? 'Test Cases' : 'Standalone'}
            </span>
        ),
    }),
    columnHelper.accessor('severity', {
        id: 'severity',
        header: 'Severity',
        cell: (info) => (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${SEVERITY_COLORS[info.getValue()] || SEVERITY_COLORS.low}`}>
                {info.getValue()}
            </span>
        ),
    }),
    columnHelper.accessor('status', {
        id: 'status',
        header: 'Status',
        cell: (info) => (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[info.getValue()] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                {info.getValue()}
            </span>
        ),
    }),
    columnHelper.accessor('project_name', {
        id: 'project_name',
        header: 'Project',
        cell: (info) => (
            <span className="text-slate-500 dark:text-slate-400 text-xs truncate max-w-[140px] block">
                {info.getValue() || '—'}
            </span>
        ),
    }),
    columnHelper.accessor('submitted_by_resource_name', {
        id: 'submitted_by_resource_name',
        header: 'Submitted By',
        cell: (info) => (
            <span className="text-slate-500 dark:text-slate-400 text-xs">{info.getValue() || '—'}</span>
        ),
    }),
    columnHelper.accessor('updated_by', {
        id: 'updated_by',
        header: 'Updated By',
        cell: (info) => (
            <span className="text-slate-500 dark:text-slate-400 text-xs truncate max-w-[140px] block">
                {info.getValue() || info.row.original.reported_by || '—'}
            </span>
        ),
    }),
    columnHelper.accessor('assigned_to', {
        id: 'assigned_to',
        header: 'Assigned To',
        cell: (info) => (
            <span className="text-slate-500 dark:text-slate-400 text-xs">{info.getValue() || '—'}</span>
        ),
    }),
    columnHelper.accessor('reported_date', {
        id: 'reported_date',
        header: 'Reported',
        cell: (info) => (
            <span className="text-slate-400 text-xs">
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
                className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                title="Delete bug"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
            </button>
        ),
    })] : []),
], [canDelete, setDeleteTarget]);

const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
});
```

- [ ] **Step 5: Replace the `<table>` block inside the `glass-card` div**

Find the section that begins with `{/* Table */}` and contains the `<table className="w-full text-sm">` block. Replace everything from the opening `<div className="glass-card rounded-2xl overflow-hidden">` through its closing `</div>` (including pagination) with:

```tsx
{/* Table */}
<div className="glass-card rounded-2xl overflow-hidden">
    {/* Column toggle gear icon */}
    <div className="flex justify-end px-4 pt-3">
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

    <div className="overflow-x-auto">
        <table className="w-full text-sm">
            <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    {table.getHeaderGroups()[0].headers.map(header => (
                        <th
                            key={header.id}
                            className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400"
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
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {isLoading ? (
                    <tr>
                        <td colSpan={table.getVisibleLeafColumns().length} className="px-4 py-12 text-center text-slate-400">
                            Loading…
                        </td>
                    </tr>
                ) : table.getRowModel().rows.length === 0 ? (
                    <tr>
                        <td colSpan={table.getVisibleLeafColumns().length} className="px-4 py-12 text-center text-slate-400">
                            No bugs found.
                        </td>
                    </tr>
                ) : table.getRowModel().rows.map(row => (
                    <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        {row.getVisibleCells().map(cell => (
                            <td
                                key={cell.id}
                                className={`px-4 py-3 ${
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

    {/* Pagination */}
    {total > PAGE_SIZE && (
        <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-sm text-slate-500">
            <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</span>
            <div className="flex gap-2">
                <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                    Previous
                </button>
                <button
                    onClick={() => setPage(p => p + 1)}
                    disabled={(page + 1) * PAGE_SIZE >= total}
                    className="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                    Next
                </button>
            </div>
        </div>
    )}
</div>
```

- [ ] **Step 6: Verify visually**

```bash
cd apps/web && npm run dev
```

Open `/work/bugs`. Confirm:
- Title column is wide; long titles wrap to 2 lines
- Hovering a title shows tooltip: `Title | Component: X | Severity: Y | Status: Z`
- Gear icon appears; "Submitted By" and "Updated By" are unchecked by default
- Toggling a column checkbox immediately shows/hides that column
- Project filter still works (already existed, should be unaffected)
- Delete button (if you have the permission) still works; modal and toast still appear

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/work/bugs/page.tsx
git commit -m "feat(bugs): add TanStack Table with column toggle and title tooltip"
```

---

## Self-Review Checklist

- [x] All 4 spec requirements covered: project filter (TC), column toggle (TC + Bugs), wide title (all 3), hover tooltip (all 3)
- [x] No TBD, TODO, or placeholder steps
- [x] `buildTaskTooltip`, `buildTestCaseTooltip`, `buildBugTooltip` use consistent naming
- [x] `meta: { className: 'whitespace-normal' }` applied identically on title column in all 3 tasks
- [x] `enableHiding: false` on `title` and `actions`/`delete` columns — these are non-toggleable
- [x] `columnHelper` defined outside component (module scope) in all 3 tasks
- [x] `filtered` (not `bugs`) is passed as TanStack `data` in Task 3 — preserves existing local search
- [x] `canDelete` conditional spreads `[columnHelper.display(...)]` — avoids TypeScript union issues
- [x] `stripHtml` used on `tc.description` before slicing — handles Tuleap HTML

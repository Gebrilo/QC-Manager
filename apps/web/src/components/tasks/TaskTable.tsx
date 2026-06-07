'use client';

import { useMemo, useState } from 'react';
import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    flexRender,
    createColumnHelper,
    SortingState,
    VisibilityState,
} from '@tanstack/react-table';
import { Task } from '@/types';
import { TaskStatusBadge } from './TaskStatusBadge';
import Link from 'next/link';
import { SimpleTooltip } from '@/components/ui/Tooltip';
import { SyncBadge } from '@/components/shared/SyncBadge';

export const HIDEABLE_TASK_COLUMNS: { id: string; header: string }[] = [
    { id: 'project_name',       header: 'Project' },
    { id: 'expected_start_date', header: 'Expected Start' },
    { id: 'actual_start_date',  header: 'Actual Start' },
    { id: 'resource1_name',     header: 'Assignee' },
    { id: 'total_est_hrs',      header: 'Est. Hours' },
];

interface TaskTableProps {
    tasks: Task[];
    isLoading: boolean;
    columnVisibility?: VisibilityState;
    onColumnVisibilityChange?: (v: VisibilityState) => void;
    pagination?: {
        total: number;
        limit: number;
        offset: number;
    };
    onPageChange?: (offset: number) => void;
}

function buildTaskTooltip(task: Task): string {
    const parts: string[] = [task.task_name];
    if (task.project_name) parts.push(`Project: ${task.project_name}`);
    if (task.priority) parts.push(`Priority: ${task.priority}`);
    if (task.resource1_name) parts.push(`Assignee: ${task.resource1_name}`);
    return parts.join(' | ');
}

const columnHelper = createColumnHelper<Task>();

export function TaskTable({
    tasks,
    isLoading,
    columnVisibility: controlledVisibility,
    onColumnVisibilityChange,
    pagination,
    onPageChange,
}: TaskTableProps) {
    const [sorting, setSorting] = useState<SortingState>([]);
    const [internalVisibility, setInternalVisibility] = useState<VisibilityState>({
        expected_start_date: false,
        actual_start_date: false,
    });
    const columnVisibility = controlledVisibility ?? internalVisibility;
    const setColumnVisibility = onColumnVisibilityChange ?? setInternalVisibility;

    const columns = useMemo(() => [
        columnHelper.accessor('task_id', {
            id: 'task_id',
            header: 'ID',
            enableHiding: false,
            cell: (info) => (
                <Link
                    href={`/work/tasks/${info.row.original.id}`}
                    className="font-mono text-xs font-semibold text-violet-600 dark:text-violet-300 hover:text-violet-800 dark:hover:text-violet-100 transition-colors"
                >
                    {info.getValue()}
                </Link>
            ),
        }),
        columnHelper.accessor('task_name', {
            id: 'task_name',
            header: 'Task Name',
            enableHiding: false,
            cell: (info) => (
                <SimpleTooltip content={buildTaskTooltip(info.row.original)} position="top">
                    <div style={{ minWidth: 280, maxWidth: 360 }}>
                        <Link
                            href={`/work/tasks/${info.row.original.id}`}
                            className="font-medium text-slate-800 dark:text-slate-100 hover:text-violet-700 dark:hover:text-violet-300 transition-colors truncate block"
                        >
                            {info.getValue()}
                        </Link>
                        <div className="flex items-center">
                            {info.row.original.project_name && (
                                <p className="text-xs text-slate-400 mt-0.5 truncate">{info.row.original.project_name}</p>
                            )}
                            <SyncBadge
                                status={info.row.original.sync_status}
                                lastAttemptedAt={info.row.original.last_sync_attempted_at}
                                error={info.row.original.last_sync_error}
                            />
                        </div>
                    </div>
                </SimpleTooltip>
            ),
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
        columnHelper.accessor('status', {
            id: 'status',
            header: 'Status',
            cell: (info) => <TaskStatusBadge status={info.getValue()} />,
        }),
        columnHelper.accessor('expected_start_date', {
            id: 'expected_start_date',
            header: 'Expected Start',
            cell: (info) => (
                <span className="text-slate-500 dark:text-slate-400 text-sm tabular-nums whitespace-nowrap">
                    {info.getValue() ? new Date(info.getValue()!).toLocaleDateString() : '—'}
                </span>
            ),
        }),
        columnHelper.accessor('actual_start_date', {
            id: 'actual_start_date',
            header: 'Actual Start',
            cell: (info) => (
                <span className="text-slate-500 dark:text-slate-400 text-sm tabular-nums whitespace-nowrap">
                    {info.getValue() ? new Date(info.getValue()!).toLocaleDateString() : '—'}
                </span>
            ),
        }),
        columnHelper.accessor('resource1_name', {
            id: 'resource1_name',
            header: 'Assignee',
            cell: (info) => (
                <span className="text-slate-600 dark:text-slate-300 text-sm">{info.getValue() || '—'}</span>
            ),
        }),
        columnHelper.accessor('total_est_hrs', {
            id: 'total_est_hrs',
            header: 'Est. Hours',
            cell: (info) => {
                const val = Number(info.getValue());
                return (
                    <span className="text-slate-600 dark:text-slate-300 font-mono text-xs">
                        {!isNaN(val) ? val.toFixed(1) : '0.0'}
                    </span>
                );
            },
        }),
        columnHelper.display({
            id: 'edit',
            header: '',
            enableHiding: false,
            cell: (info) => (
                <Link
                    href={`/work/tasks/${info.row.original.id}/edit`}
                    className="p-1.5 rounded-md text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors opacity-0 group-hover:opacity-100"
                    title="Edit task"
                >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                </Link>
            ),
        }),
    ], []);

    const table = useReactTable({
        data: tasks,
        columns,
        state: { sorting, columnVisibility },
        onSortingChange: setSorting,
        onColumnVisibilityChange: setColumnVisibility,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    const totalRows = pagination?.total ?? tasks.length;
    const currentPage = pagination ? Math.floor(pagination.offset / pagination.limit) + 1 : 1;
    const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.limit)) : 1;

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">

            {/* Table header bar */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white">All Tasks</h2>
                    <span className="text-xs text-slate-400 tabular-nums">{tasks.length} rows</span>
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
                    .tasks-table-scroll::-webkit-scrollbar { height: 10px; }
                    .tasks-table-scroll::-webkit-scrollbar-track { background: transparent; }
                    .tasks-table-scroll::-webkit-scrollbar-thumb { background: rgba(124,58,237,0.25); border-radius: 5px; }
                    .tasks-table-scroll::-webkit-scrollbar-thumb:hover { background: rgba(124,58,237,0.5); }
                `}</style>
                <table className="w-full text-sm tasks-table-scroll" style={{ minWidth: 1100 }}>
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
                                     className="px-5 py-12 text-center"
                                 >
                                     <div className="flex flex-col items-center gap-3">
                                         <p className="text-slate-400">No tasks found.</p>
                                         {tasks.length === 0 && (
                                             <p className="text-xs text-slate-500 dark:text-slate-500 max-w-md">
                                                 Tasks you can view may be limited by your permissions. Check your My Dashboard to see tasks assigned to you.
                                             </p>
                                         )}
                                     </div>
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
                        {tasks.length}
                    </span>{' '}
                    of {totalRows}
                </span>
                {pagination && onPageChange && totalPages > 1 && (
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => onPageChange(Math.max(0, pagination.offset - pagination.limit))}
                            disabled={pagination.offset <= 0}
                            className="px-2.5 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
                        >
                            ‹ Prev
                        </button>
                        <span className="px-2.5 tabular-nums">
                            Page {currentPage} of {totalPages}
                        </span>
                        <button
                            onClick={() => onPageChange(pagination.offset + pagination.limit)}
                            disabled={pagination.offset + pagination.limit >= pagination.total}
                            className="px-2.5 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
                        >
                            Next ›
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

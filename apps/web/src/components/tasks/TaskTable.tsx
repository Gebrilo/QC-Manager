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
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import { SimpleTooltip } from '@/components/ui/Tooltip';

interface TaskTableProps {
    tasks: Task[];
    isLoading: boolean;
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
    pagination,
    onPageChange,
}: TaskTableProps) {
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
        expected_start_date: false,
        actual_start_date: false,
    });

    const columns = useMemo(
        () => [
            columnHelper.accessor('task_id', {
                id: 'task_id',
                header: 'ID',
                cell: (info) => (
                    <span className="font-mono text-xs font-medium text-slate-500 dark:text-slate-400">
                        {info.getValue()}
                    </span>
                ),
            }),
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
            columnHelper.accessor('project_name', {
                id: 'project_name',
                header: 'Project',
                cell: (info) => (
                    <span className="text-slate-600 dark:text-slate-400">{info.getValue() || '-'}</span>
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
                    <span className="text-slate-600 dark:text-slate-400 text-xs">
                        {info.getValue() ? new Date(info.getValue()!).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric'
                        }) : '-'}
                    </span>
                ),
            }),
            columnHelper.accessor('actual_start_date', {
                id: 'actual_start_date',
                header: 'Actual Start',
                cell: (info) => (
                    <span className="text-slate-600 dark:text-slate-400 text-xs font-medium">
                        {info.getValue() ? new Date(info.getValue()!).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric'
                        }) : '-'}
                    </span>
                ),
            }),
            columnHelper.accessor('resource1_name', {
                id: 'resource1_name',
                header: 'Assignee',
                cell: (info) => (
                    <div className="flex items-center gap-2">
                        {info.getValue() ? (
                            <div className="h-6 w-6 rounded-full bg-indigo-100 dark:bg-indigo-900 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-xs font-medium text-indigo-700 dark:text-indigo-300">
                                {info.getValue()?.charAt(0)}
                            </div>
                        ) : null}
                        <span className="text-slate-600 dark:text-slate-400">{info.getValue() || '-'}</span>
                    </div>
                ),
            }),
            columnHelper.accessor('total_est_hrs', {
                id: 'total_est_hrs',
                header: 'Est. Hours',
                cell: (info) => {
                    const val = Number(info.getValue());
                    return (
                        <span className="block text-right text-slate-600 dark:text-slate-400 font-mono text-xs">
                            {!isNaN(val) ? val.toFixed(1) : '0.0'}
                        </span>
                    );
                },
            }),

            columnHelper.display({
                id: 'actions',
                header: '',
                cell: (info) => {
                    return (
                        <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            <Link href={`/work/tasks/${info.row.original.id}/edit`}>
                                <Button size="sm" variant="ghost" className="h-8 text-xs hover:bg-white dark:hover:bg-slate-700">Edit</Button>
                            </Link>
                        </div>
                    );
                },
            }),
        ],
        []
    );

    const table = useReactTable({
        data: tasks,
        columns,
        state: {
            sorting,
            columnVisibility,
        },
        onSortingChange: setSorting,
        onColumnVisibilityChange: setColumnVisibility,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    const visibleColumnCount = table.getVisibleLeafColumns().length;
    const totalRows = pagination?.total ?? tasks.length;
    const currentPage = pagination ? Math.floor(pagination.offset / pagination.limit) + 1 : 1;
    const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.limit)) : 1;

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <div className="relative group">
                    <button className="p-2 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </button>
                    <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-30 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 p-2">
                        <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Toggle Columns</div>
                        {table.getAllLeafColumns().map(column => {
                            if (column.id === 'actions') return null;
                            return (
                                <label key={column.id} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg cursor-pointer">
                                    <input
                                        {...{
                                            type: 'checkbox',
                                            checked: column.getIsVisible(),
                                            onChange: column.getToggleVisibilityHandler(),
                                            className: "rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        }}
                                    />
                                    <span>
                                        {column.columnDef.header as string || column.id}
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
                    <div>
                        <h2 className="font-semibold text-slate-900 dark:text-white">All Tasks</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{tasks.length} rows</p>
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
                    <table className="w-full text-sm bugs-table-scroll" style={{ minWidth: 1100 }}>
                        <thead>
                            {table.getHeaderGroups().map((headerGroup) => (
                                <tr key={headerGroup.id} className="bg-slate-50/60 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800">
                                    {headerGroup.headers.map((header) => (
                                        <th
                                            key={header.id}
                                            className="text-left px-5 py-3 text-[10px] uppercase tracking-wider font-bold text-slate-400 first:sticky first:left-0 first:z-10 first:bg-slate-50 dark:first:bg-slate-900 last:text-right"
                                        >
                                            {header.isPlaceholder ? null : (
                                                <div
                                                    className={`flex items-center gap-1 ${header.column.getCanSort()
                                                        ? 'cursor-pointer select-none hover:text-slate-900 dark:hover:text-white transition-colors'
                                                        : ''
                                                        }`}
                                                    onClick={header.column.getToggleSortingHandler()}
                                                >
                                                    {flexRender(
                                                        header.column.columnDef.header,
                                                        header.getContext()
                                                    )}
                                                    {{
                                                        asc: ' ↑',
                                                        desc: ' ↓',
                                                    }[header.column.getIsSorted() as string] ?? null}
                                                </div>
                                            )}
                                        </th>
                                    ))}
                                </tr>
                            ))}
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={visibleColumnCount} className="px-5 py-12 text-center text-slate-400">
                                        Loading tasks...
                                    </td>
                                </tr>
                            ) : table.getRowModel().rows.length === 0 ? (
                                <tr>
                                    <td colSpan={visibleColumnCount} className="px-5 py-12 text-center text-slate-400">
                                        No tasks found.
                                    </td>
                                </tr>
                            ) : table.getRowModel().rows.map((row) => (
                                <tr
                                    key={row.id}
                                    className="group hover:bg-violet-50/40 dark:hover:bg-violet-950/10 transition-colors"
                                >
                                    {row.getVisibleCells().map((cell, index) => {
                                        const metaClass = (cell.column.columnDef.meta as { className?: string })?.className ?? 'whitespace-nowrap';
                                        return (
                                            <td
                                                key={cell.id}
                                                className={`px-5 py-3.5 text-sm ${metaClass} ${
                                                    index === 0
                                                        ? 'sticky left-0 z-10 bg-white dark:bg-slate-900 group-hover:bg-violet-50 dark:group-hover:bg-slate-900'
                                                        : ''
                                                } ${index === row.getVisibleCells().length - 1 ? 'text-right' : ''}`}
                                            >
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
                    <span>
                        Showing <span className="font-medium text-slate-700 dark:text-slate-300">{tasks.length}</span> of {totalRows}
                    </span>
                    {pagination && onPageChange && totalPages > 1 && (
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={pagination.offset <= 0}
                                onClick={() => onPageChange(Math.max(0, pagination.offset - pagination.limit))}
                            >
                                Prev
                            </Button>
                            <span className="text-slate-400">Page {currentPage} of {totalPages}</span>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={pagination.offset + pagination.limit >= pagination.total}
                                onClick={() => onPageChange(pagination.offset + pagination.limit)}
                            >
                                Next
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

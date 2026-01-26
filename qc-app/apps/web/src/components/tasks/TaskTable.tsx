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
import { Spinner } from '@/components/ui/Spinner';
import { ProgressBar } from '@/components/ui/ProgressBar';
import Link from 'next/link';
import { useTheme } from '@/components/providers/ThemeProvider';

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

const columnHelper = createColumnHelper<Task>();

export function TaskTable({
    tasks,
    isLoading,
    pagination,
    onPageChange,
}: TaskTableProps) {
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
    const { density } = useTheme();

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
                cell: (info) => (
                    <div className="flex flex-col">
                        <Link href={`/tasks/${info.row.original.id}`} className="font-medium text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                            {info.getValue()}
                        </Link>
                        {info.row.original.project_name && (
                            <span className="text-xs text-slate-500 dark:text-slate-500">{info.row.original.project_name}</span>
                        )}
                    </div>
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
                            <Link href={`/tasks/${info.row.original.id}/edit`}>
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

    if (isLoading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Spinner size="lg" />
            </div>
        );
    }

    if (tasks.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 px-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm text-center">
                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-full mb-4">
                    <svg className="h-8 w-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">No tasks found</h3>
                <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-sm">
                    Get started by creating your first task to track progress and resources.
                </p>
                <Link href="/tasks/create">
                    <Button variant="default">Create Task</Button>
                </Link>
            </div>
        );
    }

    const rowPadding = density === 'comfortable' ? 'py-4' : 'py-2';

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <div className="relative group">
                    <button className="p-2 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
                        {/* Sitting/Settings Icon */}
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </button>
                    {/* Dropdown Content */}
                    <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-30 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 p-2">
                        <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Toggle Columns</div>
                        {table.getAllLeafColumns().map(column => {
                            if (column.id === 'actions') return null; // Don't toggle actions column
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
            <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm transition-colors duration-300">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                        <thead className="bg-slate-50/50 dark:bg-slate-800/50">
                            {table.getHeaderGroups().map((headerGroup) => (
                                <tr key={headerGroup.id}>
                                    {headerGroup.headers.map((header) => (
                                        <th
                                            key={header.id}
                                            className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 first:pl-8 last:pr-8"
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
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
                            {table.getRowModel().rows.map((row) => (
                                <tr
                                    key={row.id}
                                    className="group hover:bg-slate-50/80 dark:hover:bg-slate-800/50 even:bg-slate-50/[0.3] dark:even:bg-slate-800/[0.2] transition-colors"
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <td key={cell.id} className={`whitespace-nowrap px-6 ${rowPadding} text-sm first:pl-8 last:pr-8 transition-[padding] duration-200`}>
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
    );
}

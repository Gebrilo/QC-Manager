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
import { Resource } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/components/providers/AuthProvider';
import { useTheme } from '@/components/providers/ThemeProvider';
import Link from 'next/link';

interface ResourceTableProps {
    resources: Resource[];
    isLoading: boolean;
    onEdit?: (resource: Resource) => void;
    onDelete?: (resource: Resource) => void;
    preparationCount?: number;
}

const columnHelper = createColumnHelper<Resource>();

export function ResourceTable({
    resources,
    isLoading,
    onEdit,
    onDelete,
    preparationCount,
}: ResourceTableProps) {
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
    const { user } = useAuth();
    const { density } = useTheme();
    const canViewDashboard = user?.role === 'admin' || user?.role === 'manager';

    const columns = useMemo(
        () => [
            columnHelper.accessor('resource_name', {
                id: 'resource_name',
                header: 'Name',
                cell: (info) => (
                    <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-indigo-100 dark:bg-indigo-900 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-xs font-medium text-indigo-700 dark:text-indigo-300">
                            {info.getValue()?.charAt(0)}
                        </div>
                        <div className="flex flex-col">
                            <span className="font-medium text-slate-900 dark:text-white">
                                {info.getValue()}
                            </span>
                            {!info.row.original.is_active && (
                                <Badge variant="secondary">Inactive</Badge>
                            )}
                        </div>
                        {info.row.original.user_id && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 border border-teal-200 dark:border-teal-800">
                                Linked
                            </span>
                        )}
                    </div>
                ),
            }),
            columnHelper.accessor('role', {
                id: 'role',
                header: 'Role',
                cell: (info) => (
                    <span className="text-slate-600 dark:text-slate-400">{info.getValue() || '-'}</span>
                ),
            }),
            columnHelper.accessor('department', {
                id: 'department',
                header: 'Department',
                cell: (info) => (
                    <span className="text-slate-600 dark:text-slate-400">{info.getValue() || '-'}</span>
                ),
            }),
            columnHelper.accessor('weekly_capacity_hrs', {
                id: 'weekly_capacity_hrs',
                header: 'Capacity',
                cell: (info) => (
                    <span className="text-right block font-mono text-xs text-slate-600 dark:text-slate-400">
                        {info.getValue()} hrs/week
                    </span>
                ),
            }),
            columnHelper.accessor('current_allocation_hrs', {
                id: 'current_allocation_hrs',
                header: 'Allocated',
                cell: (info) => {
                    const allocated = Number(info.getValue() || 0);
                    const capacity = Number(info.row.original.weekly_capacity_hrs || 0);
                    return (
                        <div className="flex flex-col gap-1">
                            <span className="text-sm text-slate-900 dark:text-white">{allocated.toFixed(1)} hrs</span>
                            <span className="text-xs text-slate-500">of {capacity} hrs</span>
                        </div>
                    );
                },
            }),
            columnHelper.accessor('utilization_pct', {
                id: 'utilization_pct',
                header: 'Utilization',
                cell: (info) => {
                    const utilization = Number(info.getValue() || 0);
                    let color = 'bg-emerald-500';
                    if (utilization > 100) color = 'bg-rose-500';
                    else if (utilization > 80) color = 'bg-amber-500';

                    return (
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                                <ProgressBar value={Math.min(utilization, 100)} max={100} color={color} />
                                <span className={`text-sm font-medium ${utilization > 100 ? 'text-rose-600 dark:text-rose-400' :
                                    utilization > 80 ? 'text-amber-600 dark:text-amber-400' :
                                        'text-emerald-600 dark:text-emerald-400'
                                    }`}>
                                    {utilization.toFixed(0)}%
                                </span>
                            </div>
                        </div>
                    );
                },
            }),
            columnHelper.accessor('active_tasks_count', {
                id: 'active_tasks_count',
                header: 'Tasks',
                cell: (info) => {
                    const active = info.getValue() || 0;
                    const backlog = info.row.original.backlog_tasks_count || 0;
                    return (
                        <div className="flex flex-col">
                            <span className="text-sm text-slate-900 dark:text-white">{active} active</span>
                            <span className="text-xs text-slate-500">{backlog} backlog</span>
                        </div>
                    );
                },
            }),
            columnHelper.display({
                id: 'actions',
                header: '',
                cell: (info) => (
                    <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        {canViewDashboard && (
                            <Link
                                href={`/resources/${info.row.original.id}`}
                                className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors border border-indigo-200 dark:border-indigo-800"
                            >
                                Dashboard
                            </Link>
                        )}
                        {onEdit && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs hover:bg-white dark:hover:bg-slate-700 ml-2"
                                onClick={() => onEdit(info.row.original)}
                            >
                                Edit
                            </Button>
                        )}
                        {onDelete && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs hover:bg-white dark:hover:bg-slate-700 text-rose-600 dark:text-rose-400 ml-2"
                                onClick={() => onDelete(info.row.original)}
                            >
                                Delete
                            </Button>
                        )}
                    </div>
                ),
            }),
        ],
        [onEdit, onDelete, canViewDashboard]
    );

    const table = useReactTable({
        data: resources,
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

    if (resources.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 px-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm text-center">
                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-full mb-4">
                    <svg className="h-8 w-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                </div>
                {(preparationCount ?? 0) > 0 ? (
                    <>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">No Active Resources Yet</h3>
                        <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-sm">
                            You have {preparationCount} user{preparationCount !== 1 ? 's' : ''} currently in preparation.
                            Once they are activated, they will appear here.
                        </p>
                    </>
                ) : (
                    <>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">No Resources</h3>
                        <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-sm">
                            Get started by adding your first resource to track capacity and allocation.
                        </p>
                    </>
                )}
            </div>
        );
    }

    const rowPadding = density === 'comfortable' ? 'py-4' : 'py-2';

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
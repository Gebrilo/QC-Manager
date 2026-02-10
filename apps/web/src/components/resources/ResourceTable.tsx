'use client';

import { useMemo, useState } from 'react';
import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    flexRender,
    createColumnHelper,
    SortingState,
} from '@tanstack/react-table';
import { Resource } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Badge } from '@/components/ui/Badge';

interface ResourceTableProps {
    resources: Resource[];
    isLoading: boolean;
    onEdit?: (resource: Resource) => void;
    onDelete?: (resource: Resource) => void;
}

const columnHelper = createColumnHelper<Resource>();

export function ResourceTable({
    resources,
    isLoading,
    onEdit,
    onDelete,
}: ResourceTableProps) {
    const [sorting, setSorting] = useState<SortingState>([]);

    const columns = useMemo(
        () => [
            columnHelper.accessor('resource_name', {
                id: 'resource_name',
                header: 'Name',
                cell: (info) => (
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900 dark:text-white">
                            {info.getValue()}
                        </span>
                        {!info.row.original.is_active && (
                            <Badge variant="secondary">Inactive</Badge>
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
                    <span className="text-slate-900 dark:text-white">{info.getValue()} hrs/week</span>
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
                    let color = 'bg-green-500';
                    if (utilization > 100) color = 'bg-red-500';
                    else if (utilization > 80) color = 'bg-yellow-500';

                    return (
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                                <ProgressBar value={Math.min(utilization, 100)} max={100} color={color} />
                                <span className={`text-sm font-medium ${utilization > 100 ? 'text-red-600 dark:text-red-400' :
                                        utilization > 80 ? 'text-yellow-600 dark:text-yellow-400' :
                                            'text-green-600 dark:text-green-400'
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
                header: 'Actions',
                cell: (info) => (
                    <div className="flex gap-2">
                        {onEdit && (
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => onEdit(info.row.original)}
                            >
                                Edit
                            </Button>
                        )}
                        {onDelete && (
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => onDelete(info.row.original)}
                            >
                                Delete
                            </Button>
                        )}
                    </div>
                ),
            }),
        ],
        [onEdit, onDelete]
    );

    const table = useReactTable({
        data: resources,
        columns,
        state: {
            sorting,
        },
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    if (isLoading) {
        return (
            <div className="flex justify-center items-center py-12">
                <Spinner />
            </div>
        );
    }

    if (resources.length === 0) {
        return (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                No resources found. Click "Add Resource" to create one.
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-800">
                    {table.getHeaderGroups().map((headerGroup) => (
                        <tr key={headerGroup.id}>
                            {headerGroup.headers.map((header) => (
                                <th
                                    key={header.id}
                                    className="px-4 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wider cursor-pointer select-none"
                                    onClick={header.column.getToggleSortingHandler()}
                                >
                                    <div className="flex items-center gap-2">
                                        {flexRender(
                                            header.column.columnDef.header,
                                            header.getContext()
                                        )}
                                        {header.column.getIsSorted() && (
                                            <span className="text-indigo-600 dark:text-indigo-400">
                                                {header.column.getIsSorted() === 'asc' ? '↑' : '↓'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    ))}
                </thead>
                <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-700">
                    {table.getRowModel().rows.map((row) => (
                        <tr
                            key={row.id}
                            className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                            {row.getVisibleCells().map((cell) => (
                                <td
                                    key={cell.id}
                                    className="px-4 py-3 text-sm text-slate-900 dark:text-white"
                                >
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

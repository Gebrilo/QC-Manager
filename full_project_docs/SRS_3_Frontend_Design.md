# QC Application — Frontend Design Document

**Version:** 1.0
**Date:** 2026-01-15
**Stack:** Next.js 14 + React + Tailwind CSS + React Hook Form + TanStack Table + Zod
**Audience:** Solo developer with limited frontend experience

---

## Table of Contents

1. [Component Map and Responsibilities](#1-component-map-and-responsibilities)
2. [Page Specifications with API Mappings](#2-page-specifications-with-api-mappings)
3. [Component-Level Design](#3-component-level-design)
4. [Starter Code](#4-starter-code)
5. [Status Transition UX Guidelines](#5-status-transition-ux-guidelines)
6. [Development Tips for Solo Developers](#6-development-tips-for-solo-developers)
7. [Tailwind CSS Guidelines](#7-tailwind-css-guidelines)
8. [Acceptance Criteria](#8-acceptance-criteria)

---

## 1. Component Map and Responsibilities

### Directory Structure

```
src/
├── app/
│   ├── layout.tsx              # Root layout with providers
│   ├── page.tsx                # Redirects to /dashboard
│   ├── dashboard/
│   │   └── page.tsx            # Dashboard with task table
│   ├── tasks/
│   │   ├── create/
│   │   │   └── page.tsx        # Create task form
│   │   └── [id]/
│   │       └── edit/
│   │           └── page.tsx    # Edit task (or modal)
│   └── reports/
│       └── page.tsx            # Report generation and list
├── components/
│   ├── ui/                     # Reusable UI primitives
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Select.tsx
│   │   ├── Modal.tsx
│   │   ├── Spinner.tsx
│   │   └── Badge.tsx
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   └── PageWrapper.tsx
│   ├── tasks/
│   │   ├── TaskTable.tsx       # TanStack Table implementation
│   │   ├── TaskFilters.tsx     # Filter controls
│   │   ├── TaskForm.tsx        # Shared create/edit form
│   │   ├── TaskStatusBadge.tsx # Status with color coding
│   │   └── TaskActions.tsx     # Row action buttons
│   └── reports/
│       ├── ReportGenerator.tsx # Report request form
│       ├── ReportList.tsx      # List of generated reports
│       └── ReportStatusBadge.tsx
├── hooks/
│   ├── useTasks.ts             # Task CRUD operations
│   ├── useProjects.ts          # Project data fetching
│   ├── useResources.ts         # Resource data fetching
│   ├── useReportGeneration.ts  # Report job polling
│   └── useDebounce.ts          # Utility hook
├── lib/
│   ├── api.ts                  # Fetch wrapper with auth
│   ├── supabase.ts             # Supabase client
│   └── utils.ts                # Utility functions
├── schemas/
│   └── task.ts                 # Zod schemas (shared with backend)
└── types/
    └── index.ts                # TypeScript interfaces
```

### Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| `TaskTable` | Fetch, display, paginate, and sort tasks using TanStack Table |
| `TaskFilters` | Provide filter controls (status, project, resource, date range) |
| `TaskForm` | Shared form for create and edit with validation |
| `TaskStatusBadge` | Display status with appropriate color coding |
| `TaskActions` | Row-level actions (edit, delete, status change) |
| `ReportGenerator` | Form to configure and request report generation |
| `ReportList` | Display list of generated reports with download links |
| `Modal` | Reusable modal for edit task and confirmations |

---

## 2. Page Specifications with API Mappings

### 2.1 Dashboard Page (`/dashboard`)

**Purpose:** Display all tasks with filtering, sorting, and pagination.

**API Calls:**

| Action | Method | Endpoint | Payload | Response |
|--------|--------|----------|---------|----------|
| Load tasks | GET | `/api/tasks` | Query: `?status=&project_id=&limit=&offset=` | `{success, data: Task[], pagination}` |
| Load projects (for filter) | GET | `/api/projects` | None | `{success, data: Project[]}` |
| Load resources (for filter) | GET | `/api/resources` | None | `{success, data: Resource[]}` |
| Delete task | DELETE | `/api/tasks/:id` | None | `{success, data: Task}` |
| Quick status update | PATCH | `/api/tasks/:id` | `{status: string}` | `{success, data: Task}` |

**State:**

```typescript
interface DashboardState {
  tasks: Task[];
  isLoading: boolean;
  error: string | null;
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
  filters: {
    status: string | null;
    project_id: string | null;
    resource_name: string | null;
    search: string;
  };
  sorting: {
    column: string;
    direction: 'asc' | 'desc';
  };
}
```

---

### 2.2 Create Task Page (`/tasks/create`)

**Purpose:** Form to create a new task.

**API Calls:**

| Action | Method | Endpoint | Payload | Response |
|--------|--------|----------|---------|----------|
| Load projects | GET | `/api/projects` | None | `{success, data: Project[]}` |
| Load resources | GET | `/api/resources` | None | `{success, data: Resource[]}` |
| Create task | POST | `/api/tasks` | `CreateTaskInput` | `{success, data: Task, warnings}` |

**Payload (CreateTaskInput):**

```typescript
{
  task_id: string;          // "TSK-007"
  project_id: string;       // "PRJ-001"
  task_name: string;
  status: 'Backlog' | 'In Progress' | 'Done' | 'Cancelled';
  estimate_days?: number;
  resource1_name: string;
  r1_estimate_hrs: number;
  r1_actual_hrs: number;
  resource2_name?: string;
  r2_estimate_hrs?: number;
  r2_actual_hrs?: number;
  deadline?: string;        // ISO date
  completed_date?: string;  // ISO date (required if Done)
  tags?: string[];
  notes?: string;
}
```

---

### 2.3 Edit Task Page/Modal (`/tasks/[id]/edit`)

**Purpose:** Edit an existing task.

**API Calls:**

| Action | Method | Endpoint | Payload | Response |
|--------|--------|----------|---------|----------|
| Load task | GET | `/api/tasks/:id` | None | `{success, data: Task}` |
| Load projects | GET | `/api/projects` | None | `{success, data: Project[]}` |
| Load resources | GET | `/api/resources` | None | `{success, data: Resource[]}` |
| Update task | PATCH | `/api/tasks/:id` | `UpdateTaskInput` | `{success, data: Task, changes}` |

**Payload (UpdateTaskInput):**

```typescript
{
  status?: 'Backlog' | 'In Progress' | 'Done' | 'Cancelled';
  r1_actual_hrs?: number;
  r2_actual_hrs?: number;
  completed_date?: string;
  deadline?: string;
  notes?: string;
  tags?: string[];
}
```

---

### 2.4 Reports Page (`/reports`)

**Purpose:** Generate new reports and view/download existing ones.

**API Calls:**

| Action | Method | Endpoint | Payload | Response |
|--------|--------|----------|---------|----------|
| Generate report | POST | `/api/reports` | `GenerateReportInput` | `{success, data: {job_id, status_url}}` |
| Poll status | GET | `/api/reports/:job_id` | None | `{success, data: {status, download_url}}` |
| List reports | GET | `/api/reports` | Query: `?limit=&offset=` | `{success, data: ReportJob[]}` |

**Payload (GenerateReportInput):**

```typescript
{
  report_type: 'project_status' | 'resource_utilization' | 'task_export' | 'dashboard';
  format: 'xlsx' | 'pdf' | 'csv';
  filters?: {
    project_ids?: string[];
    date_range?: { start: string; end: string };
  };
  delivery: 'download' | 'email';
  recipient_email?: string;
}
```

---

## 3. Component-Level Design

### 3.1 TaskTable Component

**Props:**

```typescript
interface TaskTableProps {
  tasks: Task[];
  isLoading: boolean;
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
  onPageChange: (offset: number) => void;
  onSort: (column: string, direction: 'asc' | 'desc') => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onStatusChange: (taskId: string, newStatus: string) => void;
}
```

**Internal State:**

```typescript
interface TaskTableState {
  rowSelection: Record<string, boolean>;
  columnVisibility: Record<string, boolean>;
  sorting: SortingState;
}
```

---

### 3.2 TaskForm Component

**Props:**

```typescript
interface TaskFormProps {
  mode: 'create' | 'edit';
  initialData?: Partial<Task>;
  projects: Project[];
  resources: Resource[];
  onSubmit: (data: CreateTaskInput | UpdateTaskInput) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}
```

**Internal State (via React Hook Form):**

```typescript
// Managed by useForm hook
interface TaskFormState {
  task_id: string;
  project_id: string;
  task_name: string;
  status: string;
  estimate_days: number | null;
  resource1_name: string;
  r1_estimate_hrs: number;
  r1_actual_hrs: number;
  resource2_name: string;
  r2_estimate_hrs: number;
  r2_actual_hrs: number;
  deadline: string;
  completed_date: string;
  tags: string[];
  notes: string;
}
```

---

### 3.3 ReportGenerator Component

**Props:**

```typescript
interface ReportGeneratorProps {
  projects: Project[];
  onGenerate: (input: GenerateReportInput) => void;
  isGenerating: boolean;
}
```

**Internal State:**

```typescript
interface ReportGeneratorState {
  reportType: string;
  format: string;
  selectedProjects: string[];
  dateRange: { start: string; end: string } | null;
  delivery: 'download' | 'email';
  recipientEmail: string;
}
```

---

### 3.4 Modal Component

**Props:**

```typescript
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}
```

---

## 4. Starter Code

### 4.1 Data Table Component (TaskTable.tsx)

```tsx
// src/components/tasks/TaskTable.tsx
'use client';

import { useMemo, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
  SortingState,
} from '@tanstack/react-table';
import { Task } from '@/types';
import { TaskStatusBadge } from './TaskStatusBadge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

interface TaskTableProps {
  tasks: Task[];
  isLoading: boolean;
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
  onPageChange: (offset: number) => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onStatusChange: (taskId: string, newStatus: string) => void;
}

const columnHelper = createColumnHelper<Task>();

export function TaskTable({
  tasks,
  isLoading,
  pagination,
  onPageChange,
  onEdit,
  onDelete,
  onStatusChange,
}: TaskTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo(
    () => [
      columnHelper.accessor('task_id', {
        header: 'ID',
        cell: (info) => (
          <span className="font-mono text-sm text-gray-600">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor('task_name', {
        header: 'Task Name',
        cell: (info) => (
          <span className="font-medium text-gray-900">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor('project_name', {
        header: 'Project',
        cell: (info) => (
          <span className="text-gray-600">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (info) => <TaskStatusBadge status={info.getValue()} />,
      }),
      columnHelper.accessor('resource1_name', {
        header: 'Assignee',
        cell: (info) => (
          <span className="text-gray-600">{info.getValue() || '-'}</span>
        ),
      }),
      columnHelper.accessor('total_estimate_hrs', {
        header: 'Est. Hours',
        cell: (info) => (
          <span className="text-right text-gray-600">
            {info.getValue()?.toFixed(1) || '-'}
          </span>
        ),
      }),
      columnHelper.accessor('total_actual_hrs', {
        header: 'Actual Hours',
        cell: (info) => (
          <span className="text-right text-gray-600">
            {info.getValue()?.toFixed(1) || '-'}
          </span>
        ),
      }),
      columnHelper.accessor('overall_completion_pct', {
        header: 'Progress',
        cell: (info) => {
          const value = info.getValue() || 0;
          return (
            <div className="flex items-center gap-2">
              <div className="h-2 w-16 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: `${Math.min(value, 100)}%` }}
                />
              </div>
              <span className="text-sm text-gray-600">{value.toFixed(0)}%</span>
            </div>
          );
        },
      }),
      columnHelper.accessor('deadline', {
        header: 'Deadline',
        cell: (info) => {
          const value = info.getValue();
          if (!value) return <span className="text-gray-400">-</span>;
          const isOverdue = new Date(value) < new Date();
          return (
            <span className={isOverdue ? 'text-red-600 font-medium' : 'text-gray-600'}>
              {new Date(value).toLocaleDateString()}
            </span>
          );
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: (info) => {
          const task = info.row.original;
          return (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onEdit(task)}
                aria-label={`Edit ${task.task_name}`}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600 hover:text-red-700"
                onClick={() => onDelete(task.id)}
                disabled={task.status === 'Cancelled'}
                aria-label={`Delete ${task.task_name}`}
              >
                Delete
              </Button>
            </div>
          );
        },
      }),
    ],
    [onEdit, onDelete]
  );

  const table = useReactTable({
    data: tasks,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    pageCount: Math.ceil(pagination.total / pagination.limit),
  });

  const currentPage = Math.floor(pagination.offset / pagination.limit);
  const totalPages = Math.ceil(pagination.total / pagination.limit);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-gray-500">
        <svg
          className="mb-4 h-12 w-12"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
        <p className="text-lg font-medium">No tasks found</p>
        <p className="text-sm">Try adjusting your filters or create a new task.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                  >
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        className={`flex items-center gap-1 ${
                          header.column.getCanSort()
                            ? 'cursor-pointer select-none hover:text-gray-700'
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
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="transition-colors hover:bg-gray-50"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="whitespace-nowrap px-4 py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3">
        <div className="text-sm text-gray-600">
          Showing {pagination.offset + 1} to{' '}
          {Math.min(pagination.offset + pagination.limit, pagination.total)} of{' '}
          {pagination.total} tasks
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onPageChange(0)}
            disabled={currentPage === 0}
          >
            First
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onPageChange(pagination.offset - pagination.limit)}
            disabled={currentPage === 0}
          >
            Previous
          </Button>
          <span className="px-2 text-sm text-gray-600">
            Page {currentPage + 1} of {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onPageChange(pagination.offset + pagination.limit)}
            disabled={currentPage >= totalPages - 1}
          >
            Next
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onPageChange((totalPages - 1) * pagination.limit)}
            disabled={currentPage >= totalPages - 1}
          >
            Last
          </Button>
        </div>
      </div>
    </div>
  );
}
```

---

### 4.2 Create Task Form (TaskForm.tsx)

```tsx
// src/components/tasks/TaskForm.tsx
'use client';

import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Project, Resource, Task } from '@/types';

// Zod schema (matches backend Phase-3 schema)
const CreateTaskSchema = z
  .object({
    task_id: z
      .string()
      .min(1, 'Task ID is required')
      .regex(/^TSK-[0-9]{3}$/, 'Must be format TSK-XXX'),
    project_id: z.string().min(1, 'Project is required'),
    task_name: z
      .string()
      .min(1, 'Task name is required')
      .max(200, 'Task name must be 200 characters or less'),
    status: z.enum(['Backlog', 'In Progress', 'Done', 'Cancelled']),
    estimate_days: z.coerce.number().positive().optional().or(z.literal('')),
    resource1_name: z.string().min(1, 'Primary resource is required'),
    r1_estimate_hrs: z.coerce.number().min(0).default(0),
    r1_actual_hrs: z.coerce.number().min(0).default(0),
    resource2_name: z.string().optional().or(z.literal('')),
    r2_estimate_hrs: z.coerce.number().min(0).default(0),
    r2_actual_hrs: z.coerce.number().min(0).default(0),
    deadline: z.string().optional().or(z.literal('')),
    completed_date: z.string().optional().or(z.literal('')),
    tags: z.string().optional(), // Comma-separated, transformed later
    notes: z.string().max(5000).optional(),
  })
  .refine(
    (data) => {
      if (data.status === 'Done' && !data.completed_date) {
        return false;
      }
      return true;
    },
    {
      message: 'Completed date is required when status is Done',
      path: ['completed_date'],
    }
  )
  .refine(
    (data) => {
      if (
        !data.resource2_name &&
        (Number(data.r2_estimate_hrs) > 0 || Number(data.r2_actual_hrs) > 0)
      ) {
        return false;
      }
      return true;
    },
    {
      message: 'Cannot have R2 hours without Resource 2 assigned',
      path: ['resource2_name'],
    }
  );

type CreateTaskFormData = z.infer<typeof CreateTaskSchema>;

interface TaskFormProps {
  mode: 'create' | 'edit';
  initialData?: Partial<Task>;
  projects: Project[];
  resources: Resource[];
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function TaskForm({
  mode,
  initialData,
  projects,
  resources,
  onSubmit,
  onCancel,
  isSubmitting,
}: TaskFormProps) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateTaskFormData>({
    resolver: zodResolver(CreateTaskSchema),
    defaultValues: {
      task_id: initialData?.task_id || '',
      project_id: initialData?.project_id || '',
      task_name: initialData?.task_name || '',
      status: initialData?.status || 'Backlog',
      estimate_days: initialData?.estimate_days || '',
      resource1_name: initialData?.resource1_name || '',
      r1_estimate_hrs: initialData?.r1_estimate_hrs || 0,
      r1_actual_hrs: initialData?.r1_actual_hrs || 0,
      resource2_name: initialData?.resource2_name || '',
      r2_estimate_hrs: initialData?.r2_estimate_hrs || 0,
      r2_actual_hrs: initialData?.r2_actual_hrs || 0,
      deadline: initialData?.deadline?.split('T')[0] || '',
      completed_date: initialData?.completed_date?.split('T')[0] || '',
      tags: initialData?.tags?.join(', ') || '',
      notes: initialData?.notes || '',
    },
  });

  const watchStatus = watch('status');
  const watchResource2 = watch('resource2_name');

  // Auto-set completed_date when status changes to Done
  useEffect(() => {
    if (watchStatus === 'Done' && !watch('completed_date')) {
      setValue('completed_date', new Date().toISOString().split('T')[0]);
    }
  }, [watchStatus, setValue, watch]);

  const onFormSubmit = async (data: CreateTaskFormData) => {
    // Transform data before submission
    const payload = {
      ...data,
      estimate_days: data.estimate_days ? Number(data.estimate_days) : undefined,
      tags: data.tags
        ? data.tags.split(',').map((t) => t.trim()).filter(Boolean)
        : [],
      resource2_name: data.resource2_name || undefined,
      deadline: data.deadline || undefined,
      completed_date: data.completed_date || undefined,
    };

    await onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
      {/* Task Identification */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-lg font-medium text-gray-900">
          Task Information
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="task_id"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Task ID <span className="text-red-500">*</span>
            </label>
            <Input
              id="task_id"
              {...register('task_id')}
              placeholder="TSK-001"
              disabled={mode === 'edit'}
              className={mode === 'edit' ? 'bg-gray-100' : ''}
            />
            {errors.task_id && (
              <p className="mt-1 text-sm text-red-600">{errors.task_id.message}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="project_id"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Project <span className="text-red-500">*</span>
            </label>
            <Controller
              name="project_id"
              control={control}
              render={({ field }) => (
                <Select {...field} disabled={mode === 'edit'}>
                  <option value="">Select a project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.project_id}>
                      {project.project_id} - {project.project_name}
                    </option>
                  ))}
                </Select>
              )}
            />
            {errors.project_id && (
              <p className="mt-1 text-sm text-red-600">
                {errors.project_id.message}
              </p>
            )}
          </div>

          <div className="md:col-span-2">
            <label
              htmlFor="task_name"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Task Name <span className="text-red-500">*</span>
            </label>
            <Input
              id="task_name"
              {...register('task_name')}
              placeholder="Enter task name"
            />
            {errors.task_name && (
              <p className="mt-1 text-sm text-red-600">
                {errors.task_name.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="status"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Status <span className="text-red-500">*</span>
            </label>
            <Controller
              name="status"
              control={control}
              render={({ field }) => (
                <Select {...field}>
                  <option value="Backlog">Backlog</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Done">Done</option>
                  <option value="Cancelled">Cancelled</option>
                </Select>
              )}
            />
            {errors.status && (
              <p className="mt-1 text-sm text-red-600">{errors.status.message}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="estimate_days"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Estimate (Days)
            </label>
            <Input
              id="estimate_days"
              type="number"
              step="0.5"
              min="0"
              {...register('estimate_days')}
              placeholder="0.0"
            />
            {errors.estimate_days && (
              <p className="mt-1 text-sm text-red-600">
                {errors.estimate_days.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Resource Assignment */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-lg font-medium text-gray-900">
          Resource Assignment
        </h3>

        {/* Primary Resource */}
        <div className="mb-6">
          <h4 className="mb-3 text-sm font-medium text-gray-700">
            Primary Resource <span className="text-red-500">*</span>
          </h4>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label
                htmlFor="resource1_name"
                className="mb-1 block text-sm text-gray-600"
              >
                Resource
              </label>
              <Controller
                name="resource1_name"
                control={control}
                render={({ field }) => (
                  <Select {...field}>
                    <option value="">Select resource</option>
                    {resources.map((resource) => (
                      <option key={resource.id} value={resource.resource_name}>
                        {resource.resource_name}
                      </option>
                    ))}
                  </Select>
                )}
              />
              {errors.resource1_name && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.resource1_name.message}
                </p>
              )}
            </div>
            <div>
              <label
                htmlFor="r1_estimate_hrs"
                className="mb-1 block text-sm text-gray-600"
              >
                Estimated Hours
              </label>
              <Input
                id="r1_estimate_hrs"
                type="number"
                step="0.5"
                min="0"
                {...register('r1_estimate_hrs')}
              />
            </div>
            <div>
              <label
                htmlFor="r1_actual_hrs"
                className="mb-1 block text-sm text-gray-600"
              >
                Actual Hours
              </label>
              <Input
                id="r1_actual_hrs"
                type="number"
                step="0.5"
                min="0"
                {...register('r1_actual_hrs')}
              />
            </div>
          </div>
        </div>

        {/* Secondary Resource */}
        <div>
          <h4 className="mb-3 text-sm font-medium text-gray-700">
            Secondary Resource (Optional)
          </h4>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label
                htmlFor="resource2_name"
                className="mb-1 block text-sm text-gray-600"
              >
                Resource
              </label>
              <Controller
                name="resource2_name"
                control={control}
                render={({ field }) => (
                  <Select {...field}>
                    <option value="">None</option>
                    {resources.map((resource) => (
                      <option key={resource.id} value={resource.resource_name}>
                        {resource.resource_name}
                      </option>
                    ))}
                  </Select>
                )}
              />
              {errors.resource2_name && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.resource2_name.message}
                </p>
              )}
            </div>
            <div>
              <label
                htmlFor="r2_estimate_hrs"
                className="mb-1 block text-sm text-gray-600"
              >
                Estimated Hours
              </label>
              <Input
                id="r2_estimate_hrs"
                type="number"
                step="0.5"
                min="0"
                disabled={!watchResource2}
                {...register('r2_estimate_hrs')}
                className={!watchResource2 ? 'bg-gray-100' : ''}
              />
            </div>
            <div>
              <label
                htmlFor="r2_actual_hrs"
                className="mb-1 block text-sm text-gray-600"
              >
                Actual Hours
              </label>
              <Input
                id="r2_actual_hrs"
                type="number"
                step="0.5"
                min="0"
                disabled={!watchResource2}
                {...register('r2_actual_hrs')}
                className={!watchResource2 ? 'bg-gray-100' : ''}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Dates */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-lg font-medium text-gray-900">Dates</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="deadline"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Deadline
            </label>
            <Input id="deadline" type="date" {...register('deadline')} />
          </div>
          <div>
            <label
              htmlFor="completed_date"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Completed Date
              {watchStatus === 'Done' && (
                <span className="text-red-500"> *</span>
              )}
            </label>
            <Input
              id="completed_date"
              type="date"
              {...register('completed_date')}
            />
            {errors.completed_date && (
              <p className="mt-1 text-sm text-red-600">
                {errors.completed_date.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Additional Info */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-lg font-medium text-gray-900">
          Additional Information
        </h3>
        <div className="space-y-4">
          <div>
            <label
              htmlFor="tags"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Tags
            </label>
            <Input
              id="tags"
              {...register('tags')}
              placeholder="backend, security, urgent (comma-separated)"
            />
            <p className="mt-1 text-xs text-gray-500">
              Separate tags with commas
            </p>
          </div>
          <div>
            <label
              htmlFor="notes"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Notes
            </label>
            <textarea
              id="notes"
              {...register('notes')}
              rows={4}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Additional notes or context..."
            />
            {errors.notes && (
              <p className="mt-1 text-sm text-red-600">{errors.notes.message}</p>
            )}
          </div>
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex items-center justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <span className="mr-2">Saving...</span>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            </>
          ) : mode === 'create' ? (
            'Create Task'
          ) : (
            'Update Task'
          )}
        </Button>
      </div>
    </form>
  );
}
```

---

### 4.3 Report Generator Button (ReportGeneratorButton.tsx)

```tsx
// src/components/reports/ReportGeneratorButton.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { Project } from '@/types';

interface ReportGeneratorButtonProps {
  projects: Project[];
}

type ReportStatus = 'idle' | 'processing' | 'completed' | 'failed';

interface ReportJob {
  jobId: string;
  status: ReportStatus;
  downloadUrl: string | null;
  filename: string | null;
  error: string | null;
  progress: number;
}

export function ReportGeneratorButton({ projects }: ReportGeneratorButtonProps) {
  const [reportType, setReportType] = useState('project_status');
  const [format, setFormat] = useState('xlsx');
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [job, setJob] = useState<ReportJob | null>(null);

  const getAccessToken = useCallback(() => {
    // In real app, get from auth context or cookie
    return localStorage.getItem('access_token') || '';
  }, []);

  // Poll for job status
  useEffect(() => {
    if (!job || job.status !== 'processing') return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/reports/${job.jobId}`, {
          headers: {
            Authorization: `Bearer ${getAccessToken()}`,
          },
        });

        const result = await response.json();

        if (!result.success) {
          setJob((prev) =>
            prev
              ? { ...prev, status: 'failed', error: result.error.message }
              : null
          );
          return;
        }

        const { status, download_url, filename, error_message, progress } =
          result.data;

        setJob((prev) =>
          prev
            ? {
                ...prev,
                status,
                downloadUrl: download_url,
                filename,
                error: error_message,
                progress: progress || 0,
              }
            : null
        );

        if (status === 'completed' || status === 'failed') {
          clearInterval(pollInterval);
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 2000); // Poll every 2 seconds

    // Timeout after 5 minutes
    const timeout = setTimeout(() => {
      clearInterval(pollInterval);
      if (job.status === 'processing') {
        setJob((prev) =>
          prev
            ? { ...prev, status: 'failed', error: 'Report generation timed out' }
            : null
        );
      }
    }, 5 * 60 * 1000);

    return () => {
      clearInterval(pollInterval);
      clearTimeout(timeout);
    };
  }, [job?.jobId, job?.status, getAccessToken]);

  const handleGenerate = async () => {
    try {
      setJob({
        jobId: '',
        status: 'processing',
        downloadUrl: null,
        filename: null,
        error: null,
        progress: 0,
      });

      const payload = {
        report_type: reportType,
        format,
        filters: {
          project_ids: selectedProjects.length > 0 ? selectedProjects : undefined,
        },
        delivery: 'download',
      };

      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!result.success) {
        setJob({
          jobId: '',
          status: 'failed',
          downloadUrl: null,
          filename: null,
          error: result.error.message,
          progress: 0,
        });
        return;
      }

      setJob({
        jobId: result.data.job_id,
        status: 'processing',
        downloadUrl: null,
        filename: null,
        error: null,
        progress: 0,
      });
    } catch (err: any) {
      setJob({
        jobId: '',
        status: 'failed',
        downloadUrl: null,
        filename: null,
        error: err.message || 'Failed to start report generation',
        progress: 0,
      });
    }
  };

  const handleReset = () => {
    setJob(null);
  };

  const handleProjectSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const options = e.target.options;
    const selected: string[] = [];
    for (let i = 0; i < options.length; i++) {
      if (options[i].selected) {
        selected.push(options[i].value);
      }
    }
    setSelectedProjects(selected);
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="mb-4 text-lg font-medium text-gray-900">Generate Report</h3>

      {/* Configuration */}
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div>
          <label
            htmlFor="reportType"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Report Type
          </label>
          <Select
            id="reportType"
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            disabled={job?.status === 'processing'}
          >
            <option value="project_status">Project Status</option>
            <option value="resource_utilization">Resource Utilization</option>
            <option value="task_export">Task Export</option>
            <option value="dashboard">Dashboard Summary</option>
          </Select>
        </div>

        <div>
          <label
            htmlFor="format"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Format
          </label>
          <Select
            id="format"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            disabled={job?.status === 'processing'}
          >
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="pdf">PDF (.pdf)</option>
            <option value="csv">CSV (.csv)</option>
          </Select>
        </div>

        <div>
          <label
            htmlFor="projects"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Filter by Projects
          </label>
          <select
            id="projects"
            multiple
            value={selectedProjects}
            onChange={handleProjectSelect}
            disabled={job?.status === 'processing'}
            className="h-20 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
          >
            {projects.map((project) => (
              <option key={project.id} value={project.project_id}>
                {project.project_id} - {project.project_name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Hold Ctrl/Cmd to select multiple. Leave empty for all.
          </p>
        </div>
      </div>

      {/* Status Display */}
      {job && (
        <div className="mb-6">
          {job.status === 'processing' && (
            <div className="flex items-center gap-3 rounded-md bg-blue-50 p-4">
              <Spinner size="sm" />
              <div className="flex-1">
                <p className="font-medium text-blue-700">Generating report...</p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-blue-200">
                  <div
                    className="h-full bg-blue-600 transition-all duration-300"
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
                <p className="mt-1 text-sm text-blue-600">
                  {job.progress > 0 ? `${job.progress}% complete` : 'Starting...'}
                </p>
              </div>
            </div>
          )}

          {job.status === 'completed' && job.downloadUrl && (
            <div className="rounded-md bg-green-50 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg
                    className="h-6 w-6 text-green-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <div>
                    <p className="font-medium text-green-700">
                      Report generated successfully
                    </p>
                    <p className="text-sm text-green-600">{job.filename}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={job.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    Download
                  </a>
                  <Button variant="outline" size="sm" onClick={handleReset}>
                    Generate Another
                  </Button>
                </div>
              </div>
            </div>
          )}

          {job.status === 'failed' && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg
                    className="h-6 w-6 text-red-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                  <div>
                    <p className="font-medium text-red-700">
                      Report generation failed
                    </p>
                    <p className="text-sm text-red-600">{job.error}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={handleReset}>
                  Try Again
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Generate Button */}
      {(!job || job.status === 'idle') && (
        <Button onClick={handleGenerate} className="w-full md:w-auto">
          <svg
            className="mr-2 h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          Generate Report
        </Button>
      )}
    </div>
  );
}
```

---

## 5. Status Transition UX Guidelines

### 5.1 Valid Status Transitions

```
┌─────────────────────────────────────────────────────────────────┐
│                    STATUS TRANSITION MATRIX                     │
└─────────────────────────────────────────────────────────────────┘

  From \ To       │ Backlog │ In Progress │  Done  │ Cancelled
  ────────────────┼─────────┼─────────────┼────────┼───────────
  Backlog         │    -    │     YES     │   NO   │    YES
  In Progress     │   YES   │      -      │  YES   │    YES
  Done            │   NO    │     NO      │   -    │    NO
  Cancelled       │   YES   │     NO      │   NO   │     -
```

### 5.2 UI Implementation

```tsx
// src/components/tasks/TaskStatusDropdown.tsx
'use client';

import { Select } from '@/components/ui/Select';

interface TaskStatusDropdownProps {
  currentStatus: string;
  onStatusChange: (newStatus: string) => void;
  disabled?: boolean;
}

// Define allowed transitions
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  'Backlog': ['In Progress', 'Cancelled'],
  'In Progress': ['Backlog', 'Done', 'Cancelled'],
  'Done': [], // No transitions allowed from Done
  'Cancelled': ['Backlog'],
};

export function TaskStatusDropdown({
  currentStatus,
  onStatusChange,
  disabled,
}: TaskStatusDropdownProps) {
  const allowedStatuses = ALLOWED_TRANSITIONS[currentStatus] || [];
  const allStatuses = ['Backlog', 'In Progress', 'Done', 'Cancelled'];

  return (
    <Select
      value={currentStatus}
      onChange={(e) => onStatusChange(e.target.value)}
      disabled={disabled || allowedStatuses.length === 0}
      className={allowedStatuses.length === 0 ? 'cursor-not-allowed opacity-60' : ''}
    >
      {allStatuses.map((status) => {
        const isDisabled =
          status !== currentStatus && !allowedStatuses.includes(status);
        return (
          <option key={status} value={status} disabled={isDisabled}>
            {status}
            {isDisabled && status !== currentStatus ? ' (not allowed)' : ''}
          </option>
        );
      })}
    </Select>
  );
}
```

### 5.3 Visual Feedback for Disabled Actions

```tsx
// src/components/tasks/TaskActions.tsx
'use client';

import { Button } from '@/components/ui/Button';
import { Task } from '@/types';

interface TaskActionsProps {
  task: Task;
  onEdit: () => void;
  onDelete: () => void;
  onRestore: () => void;
}

export function TaskActions({ task, onEdit, onDelete, onRestore }: TaskActionsProps) {
  const isDone = task.status === 'Done';
  const isCancelled = task.status === 'Cancelled';

  return (
    <div className="flex items-center gap-2">
      {/* Edit - disabled for Done tasks */}
      <Button
        size="sm"
        variant="ghost"
        onClick={onEdit}
        disabled={isDone}
        title={isDone ? 'Cannot edit completed tasks' : 'Edit task'}
      >
        Edit
      </Button>

      {/* Delete - disabled for Done/Cancelled */}
      {!isCancelled ? (
        <Button
          size="sm"
          variant="ghost"
          className="text-red-600 hover:text-red-700"
          onClick={onDelete}
          disabled={isDone}
          title={isDone ? 'Cannot delete completed tasks' : 'Delete task'}
        >
          Delete
        </Button>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="text-green-600 hover:text-green-700"
          onClick={onRestore}
          title="Restore cancelled task"
        >
          Restore
        </Button>
      )}
    </div>
  );
}
```

### 5.4 Status Badge Colors

```tsx
// src/components/tasks/TaskStatusBadge.tsx
'use client';

interface TaskStatusBadgeProps {
  status: string;
}

const STATUS_STYLES: Record<string, string> = {
  'Backlog': 'bg-gray-100 text-gray-700 border-gray-300',
  'In Progress': 'bg-blue-100 text-blue-700 border-blue-300',
  'Done': 'bg-green-100 text-green-700 border-green-300',
  'Cancelled': 'bg-red-100 text-red-700 border-red-300',
};

export function TaskStatusBadge({ status }: TaskStatusBadgeProps) {
  const styles = STATUS_STYLES[status] || STATUS_STYLES['Backlog'];

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles}`}
    >
      {status}
    </span>
  );
}
```

---

## 6. Development Tips for Solo Developers

### 6.1 Hot-Reload Configuration

```javascript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable React Strict Mode (catches bugs early)
  reactStrictMode: true,

  // Fast Refresh is enabled by default in Next.js 14

  // Useful for debugging
  logging: {
    fetches: {
      fullUrl: true,
    },
  },

  // Environment variables (for dev)
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  },
};

module.exports = nextConfig;
```

### 6.2 Development Seed Data Script

```typescript
// scripts/seed-dev-data.ts
// Run with: npx ts-node scripts/seed-dev-data.ts

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function seedDevData() {
  console.log('Seeding development data...');

  // 1. Seed Projects
  const projects = [
    {
      project_id: 'PRJ-001',
      project_name: 'Website Redesign',
      total_weight: 4,
      priority: 'High',
      status: 'At Risk',
    },
    {
      project_id: 'PRJ-002',
      project_name: 'Mobile App v2',
      total_weight: 3,
      priority: 'Medium',
      status: 'On Track',
    },
    {
      project_id: 'PRJ-003',
      project_name: 'API Migration',
      total_weight: 5,
      priority: 'High',
      status: 'No Tasks',
    },
  ];

  const { error: projectError } = await supabase
    .from('projects')
    .upsert(projects, { onConflict: 'project_id' });

  if (projectError) {
    console.error('Failed to seed projects:', projectError);
  } else {
    console.log('Seeded', projects.length, 'projects');
  }

  // 2. Seed Resources
  const resources = [
    { resource_name: 'Alice', weekly_capacity_hrs: 40, is_active: true },
    { resource_name: 'Bob', weekly_capacity_hrs: 40, is_active: true },
    { resource_name: 'Charlie', weekly_capacity_hrs: 32, is_active: true },
  ];

  const { error: resourceError } = await supabase
    .from('resources')
    .upsert(resources, { onConflict: 'resource_name' });

  if (resourceError) {
    console.error('Failed to seed resources:', resourceError);
  } else {
    console.log('Seeded', resources.length, 'resources');
  }

  // 3. Seed Tasks (requires project and resource UUIDs)
  // Get UUIDs first
  const { data: projectData } = await supabase
    .from('projects')
    .select('id, project_id');
  const { data: resourceData } = await supabase
    .from('resources')
    .select('id, resource_name');

  const projectMap = new Map(projectData?.map((p) => [p.project_id, p.id]) || []);
  const resourceMap = new Map(resourceData?.map((r) => [r.resource_name, r.id]) || []);

  const tasks = [
    {
      task_id: 'TSK-001',
      project_id: projectMap.get('PRJ-001'),
      task_name: 'Design homepage mockups',
      status: 'Done',
      resource1_id: resourceMap.get('Alice'),
      r1_estimate_hrs: 16,
      r1_actual_hrs: 18,
      completed_date: '2026-01-10',
    },
    {
      task_id: 'TSK-002',
      project_id: projectMap.get('PRJ-001'),
      task_name: 'Implement responsive header',
      status: 'In Progress',
      resource1_id: resourceMap.get('Bob'),
      r1_estimate_hrs: 8,
      r1_actual_hrs: 4,
      deadline: '2026-01-20',
    },
    {
      task_id: 'TSK-003',
      project_id: projectMap.get('PRJ-002'),
      task_name: 'Set up React Native project',
      status: 'Backlog',
      resource1_id: resourceMap.get('Charlie'),
      r1_estimate_hrs: 4,
      r1_actual_hrs: 0,
    },
    {
      task_id: 'TSK-004',
      project_id: projectMap.get('PRJ-001'),
      task_name: 'Write unit tests for header',
      status: 'Backlog',
      resource1_id: resourceMap.get('Bob'),
      r1_estimate_hrs: 6,
      r1_actual_hrs: 0,
    },
    {
      task_id: 'TSK-005',
      project_id: projectMap.get('PRJ-002'),
      task_name: 'Design app navigation',
      status: 'In Progress',
      resource1_id: resourceMap.get('Alice'),
      r1_estimate_hrs: 12,
      r1_actual_hrs: 6,
      deadline: '2026-01-25',
    },
  ];

  const { error: taskError } = await supabase
    .from('tasks')
    .upsert(tasks, { onConflict: 'task_id' });

  if (taskError) {
    console.error('Failed to seed tasks:', taskError);
  } else {
    console.log('Seeded', tasks.length, 'tasks');
  }

  console.log('Seeding complete!');
}

seedDevData().catch(console.error);
```

### 6.3 Testing Approach

```typescript
// __tests__/components/TaskForm.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskForm } from '@/components/tasks/TaskForm';

// Mock data
const mockProjects = [
  { id: '1', project_id: 'PRJ-001', project_name: 'Test Project' },
];
const mockResources = [
  { id: '1', resource_name: 'Alice' },
  { id: '2', resource_name: 'Bob' },
];

describe('TaskForm', () => {
  const mockOnSubmit = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders create form with empty fields', () => {
    render(
      <TaskForm
        mode="create"
        projects={mockProjects}
        resources={mockResources}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        isSubmitting={false}
      />
    );

    expect(screen.getByLabelText(/task id/i)).toHaveValue('');
    expect(screen.getByLabelText(/task name/i)).toHaveValue('');
    expect(screen.getByRole('button', { name: /create task/i })).toBeInTheDocument();
  });

  it('validates required fields', async () => {
    render(
      <TaskForm
        mode="create"
        projects={mockProjects}
        resources={mockResources}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        isSubmitting={false}
      />
    );

    // Submit empty form
    fireEvent.click(screen.getByRole('button', { name: /create task/i }));

    // Check for validation errors
    await waitFor(() => {
      expect(screen.getByText(/task id is required/i)).toBeInTheDocument();
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('validates task ID format', async () => {
    render(
      <TaskForm
        mode="create"
        projects={mockProjects}
        resources={mockResources}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        isSubmitting={false}
      />
    );

    // Enter invalid task ID
    await userEvent.type(screen.getByLabelText(/task id/i), 'INVALID');
    fireEvent.click(screen.getByRole('button', { name: /create task/i }));

    await waitFor(() => {
      expect(screen.getByText(/must be format tsk-xxx/i)).toBeInTheDocument();
    });
  });

  it('requires completed_date when status is Done', async () => {
    render(
      <TaskForm
        mode="create"
        projects={mockProjects}
        resources={mockResources}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        isSubmitting={false}
      />
    );

    // Fill required fields
    await userEvent.type(screen.getByLabelText(/task id/i), 'TSK-001');
    await userEvent.selectOptions(screen.getByLabelText(/project/i), 'PRJ-001');
    await userEvent.type(screen.getByLabelText(/task name/i), 'Test Task');
    await userEvent.selectOptions(screen.getByLabelText(/primary resource/i), 'Alice');
    await userEvent.selectOptions(screen.getByLabelText(/status/i), 'Done');

    // Submit without completed_date
    fireEvent.click(screen.getByRole('button', { name: /create task/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/completed date is required when status is done/i)
      ).toBeInTheDocument();
    });
  });

  it('submits valid form data', async () => {
    mockOnSubmit.mockResolvedValue(undefined);

    render(
      <TaskForm
        mode="create"
        projects={mockProjects}
        resources={mockResources}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        isSubmitting={false}
      />
    );

    // Fill all required fields
    await userEvent.type(screen.getByLabelText(/task id/i), 'TSK-001');
    await userEvent.selectOptions(screen.getByLabelText(/project/i), 'PRJ-001');
    await userEvent.type(screen.getByLabelText(/task name/i), 'Test Task');
    await userEvent.selectOptions(screen.getByLabelText(/primary resource/i), 'Alice');

    // Submit form
    fireEvent.click(screen.getByRole('button', { name: /create task/i }));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          task_id: 'TSK-001',
          project_id: 'PRJ-001',
          task_name: 'Test Task',
          resource1_name: 'Alice',
          status: 'Backlog',
        })
      );
    });
  });

  it('disables task_id and project_id in edit mode', () => {
    render(
      <TaskForm
        mode="edit"
        initialData={{
          task_id: 'TSK-001',
          project_id: 'PRJ-001',
          task_name: 'Existing Task',
        }}
        projects={mockProjects}
        resources={mockResources}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        isSubmitting={false}
      />
    );

    expect(screen.getByLabelText(/task id/i)).toBeDisabled();
    expect(screen.getByLabelText(/project/i)).toBeDisabled();
  });

  it('calls onCancel when cancel button clicked', async () => {
    render(
      <TaskForm
        mode="create"
        projects={mockProjects}
        resources={mockResources}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        isSubmitting={false}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('disables submit button when isSubmitting is true', () => {
    render(
      <TaskForm
        mode="create"
        projects={mockProjects}
        resources={mockResources}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        isSubmitting={true}
      />
    );

    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
  });
});
```

### 6.4 Useful npm Scripts

```json
// package.json
{
  "scripts": {
    "dev": "next dev",
    "dev:turbo": "next dev --turbo",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "lint:fix": "next lint --fix",
    "type-check": "tsc --noEmit",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "seed:dev": "ts-node scripts/seed-dev-data.ts",
    "db:reset": "ts-node scripts/reset-dev-db.ts",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

### 6.5 VS Code Settings for Better DX

```json
// .vscode/settings.json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "tailwindCSS.includeLanguages": {
    "typescript": "javascript",
    "typescriptreact": "javascript"
  },
  "tailwindCSS.experimental.classRegex": [
    ["cva\\(([^)]*)\\)", "[\"'`]([^\"'`]*).*?[\"'`]"]
  ]
}
```

---

## 7. Tailwind CSS Guidelines

### 7.1 Color Palette

```css
/* Use semantic color classes */

/* Status colors */
.status-backlog    { @apply bg-gray-100 text-gray-700 border-gray-300; }
.status-inprogress { @apply bg-blue-100 text-blue-700 border-blue-300; }
.status-done       { @apply bg-green-100 text-green-700 border-green-300; }
.status-cancelled  { @apply bg-red-100 text-red-700 border-red-300; }

/* Priority colors */
.priority-high   { @apply text-red-600; }
.priority-medium { @apply text-yellow-600; }
.priority-low    { @apply text-green-600; }

/* Interactive states */
.btn-primary   { @apply bg-blue-600 hover:bg-blue-700 text-white; }
.btn-secondary { @apply bg-gray-100 hover:bg-gray-200 text-gray-700; }
.btn-danger    { @apply bg-red-600 hover:bg-red-700 text-white; }
.btn-ghost     { @apply bg-transparent hover:bg-gray-100 text-gray-600; }
```

### 7.2 Common Patterns

```tsx
// Card pattern
<div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
  {/* content */}
</div>

// Form input pattern
<input className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed" />

// Button pattern
<button className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed">
  Button Text
</button>

// Table row hover
<tr className="transition-colors hover:bg-gray-50">
  {/* cells */}
</tr>

// Progress bar
<div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
  <div className="h-full bg-blue-500 transition-all" style={{ width: '50%' }} />
</div>

// Badge/Chip
<span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium">
  Label
</span>

// Empty state
<div className="flex h-64 flex-col items-center justify-center text-gray-500">
  <svg className="mb-4 h-12 w-12" />
  <p className="text-lg font-medium">No data</p>
  <p className="text-sm">Description text</p>
</div>
```

### 7.3 Responsive Breakpoints

```tsx
// Mobile-first responsive design
<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
  {/* Cards */}
</div>

// Hide on mobile, show on desktop
<div className="hidden md:block">Desktop only</div>

// Show on mobile, hide on desktop
<div className="md:hidden">Mobile only</div>

// Responsive text
<h1 className="text-xl md:text-2xl lg:text-3xl">Heading</h1>

// Responsive padding
<div className="p-4 md:p-6 lg:p-8">Content</div>
```

---

## 8. Acceptance Criteria

### 8.1 Dashboard Page (`/dashboard`)

- [ ] Displays task table with all columns (ID, Name, Project, Status, Assignee, Hours, Progress, Deadline, Actions)
- [ ] Supports sorting by clicking column headers
- [ ] Supports pagination with First/Previous/Next/Last buttons
- [ ] Shows correct pagination info ("Showing X to Y of Z tasks")
- [ ] Filter controls work (status, project, resource)
- [ ] Search by task name works
- [ ] Empty state shows when no tasks match filters
- [ ] Loading spinner shows during data fetch
- [ ] Edit button opens edit modal/page
- [ ] Delete button soft-deletes task (confirmation required)
- [ ] Status badge shows correct color per status
- [ ] Overdue deadlines show in red

### 8.2 Create Task Page (`/tasks/create`)

- [ ] All form fields render correctly
- [ ] Task ID validates format (TSK-XXX)
- [ ] Project dropdown populated from API
- [ ] Resource dropdowns populated from API
- [ ] Required field validation works
- [ ] Completed date required when status is Done
- [ ] Cannot add R2 hours without R2 resource selected
- [ ] Tags input accepts comma-separated values
- [ ] Cancel button navigates back
- [ ] Submit button shows loading state
- [ ] Success redirects to dashboard with toast
- [ ] Error displays inline error message
- [ ] Warnings (resource overallocation) display after success

### 8.3 Edit Task Modal/Page (`/tasks/[id]/edit`)

- [ ] Pre-populates form with existing task data
- [ ] Task ID and Project are disabled (read-only)
- [ ] Status dropdown disables invalid transitions
- [ ] Only editable fields can be modified
- [ ] Cancel closes modal without saving
- [ ] Submit updates task via PATCH
- [ ] Success closes modal and refreshes table
- [ ] Error displays inline error message

### 8.4 Reports Page (`/reports`)

- [ ] Report type dropdown works
- [ ] Format dropdown works
- [ ] Project filter (multi-select) works
- [ ] Generate button starts report generation
- [ ] Progress indicator shows during generation
- [ ] Polling updates progress percentage
- [ ] Success shows download button
- [ ] Download link opens in new tab
- [ ] Error state shows with retry button
- [ ] Timeout shows appropriate message (5 min)
- [ ] "Generate Another" resets form

### 8.5 Status Transition UX

- [ ] Status dropdown disables invalid options
- [ ] Done tasks cannot be edited
- [ ] Done tasks cannot be deleted
- [ ] Cancelled tasks show Restore button
- [ ] Status badge colors are consistent

### 8.6 General

- [ ] All pages are responsive (mobile, tablet, desktop)
- [ ] Loading states show for all async operations
- [ ] Error states show with clear messages
- [ ] Forms preserve input on validation errors
- [ ] Navigation between pages works
- [ ] Authentication redirects work (if not logged in)
- [ ] No console errors in browser

---

## Summary

This frontend design document provides:

1. **Component Map:** Clear directory structure with responsibility assignments
2. **Page Specifications:** API mappings for all four main pages
3. **Component Design:** Props and state interfaces for key components
4. **Starter Code:** Three production-ready components (TaskTable, TaskForm, ReportGenerator)
5. **Status UX:** Transition matrix and disabled action guidelines
6. **Dev Tips:** Hot-reload config, seed data script, testing approach, VS Code settings
7. **Tailwind Guidelines:** Consistent styling patterns
8. **Acceptance Criteria:** Checklist for feature completeness

The code is designed for a solo developer with limited frontend experience, using well-established patterns from React Hook Form, TanStack Table, and Zod.

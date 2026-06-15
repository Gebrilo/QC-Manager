import { tasksApi } from '@/lib/api';

export type StatusArtifactType = 'task';

export interface StatusOption {
    value: string;
    label: string;
    dotClass: string;
    pillClass: string;
    borderClass?: string;
    progressGradient?: string;
    progressTextClass?: string;
}

export interface StatusUpdateContext {
    previousStatus: string;
}

export interface StatusRegistryEntry {
    artifactType: StatusArtifactType;
    label: string;
    statuses: readonly string[];
    editPermission: string;
    normalize: (status: string) => string;
    getOption: (status: string) => StatusOption;
    defaultFills?: (status: string, context: StatusUpdateContext) => Record<string, unknown>;
    update: (id: string, status: string, payload: Record<string, unknown>) => Promise<unknown>;
}

function todayISO() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
}

const taskStatusOrder = ['Todo', 'In Progress', 'Blocked', 'Done', 'Canceled'] as const;

const taskStatusAliases: Record<string, string> = {
    Backlog: 'Todo',
    'To Do': 'Todo',
    Cancelled: 'Canceled',
};

function normalizeTaskStatus(status: string) {
    if (!status) return 'Todo';
    return taskStatusAliases[status] || status;
}

const taskStatusOptions: Record<string, StatusOption> = {
    Todo: {
        value: 'Todo',
        label: 'Todo',
        dotClass: 'bg-slate-400',
        pillClass: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
        borderClass: 'border-slate-300 dark:border-slate-600',
        progressGradient: 'from-slate-400 to-slate-300',
        progressTextClass: 'text-slate-500 dark:text-slate-400',
    },
    'In Progress': {
        value: 'In Progress',
        label: 'In Progress',
        dotClass: 'bg-blue-500',
        pillClass: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800',
        borderClass: 'border-blue-300 dark:border-blue-600',
        progressGradient: 'from-blue-500 to-blue-400',
        progressTextClass: 'text-blue-500 dark:text-blue-400',
    },
    Blocked: {
        value: 'Blocked',
        label: 'Blocked',
        dotClass: 'bg-rose-500',
        pillClass: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800',
        borderClass: 'border-rose-300 dark:border-rose-600',
        progressGradient: 'from-rose-500 to-rose-400',
        progressTextClass: 'text-rose-500 dark:text-rose-400',
    },
    Done: {
        value: 'Done',
        label: 'Done',
        dotClass: 'bg-emerald-500',
        pillClass: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800',
        borderClass: 'border-emerald-300 dark:border-emerald-600',
        progressGradient: 'from-emerald-500 to-emerald-400',
        progressTextClass: 'text-emerald-500 dark:text-emerald-400',
    },
    Canceled: {
        value: 'Canceled',
        label: 'Canceled',
        dotClass: 'bg-slate-400',
        pillClass: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
        borderClass: 'border-slate-300 dark:border-slate-600',
        progressGradient: 'from-slate-400 to-slate-300',
        progressTextClass: 'text-slate-500 dark:text-slate-400',
    },
};

export const taskStatusRegistry: StatusRegistryEntry = {
    artifactType: 'task',
    label: 'Task',
    statuses: taskStatusOrder,
    editPermission: 'qc.tasks.edit',
    normalize: normalizeTaskStatus,
    getOption: (status: string) => {
        const normalized = normalizeTaskStatus(status);
        return taskStatusOptions[normalized] || taskStatusOptions.Todo;
    },
    defaultFills: (status: string) => {
        if (normalizeTaskStatus(status) !== 'Done') return {};
        return {
            completed_date: todayISO(),
            completion_status: 'Completed',
        };
    },
    update: (id, status, payload) => tasksApi.update(id, { ...payload, status } as any),
};

export const statusRegistry: Record<StatusArtifactType, StatusRegistryEntry> = {
    task: taskStatusRegistry,
};

export function canEditStatus(rowCanEdit: boolean | undefined, hasFallbackPermission: boolean) {
    if (rowCanEdit === false) return false;
    if (rowCanEdit === true) return true;
    return hasFallbackPermission;
}

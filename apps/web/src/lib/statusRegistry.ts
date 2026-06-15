import { bugsApi, tasksApi, testCasesApi, testSuitesApi, userStoriesApi } from '@/lib/api';

export type StatusArtifactType = 'task' | 'user_story' | 'bug' | 'test_case' | 'test_suite';

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

const storyStatusOrder = ['Draft', 'Changes', 'Review', 'Approved'] as const;

function normalizeStoryStatus(status: string) {
    if (!status) return 'Draft';
    return storyStatusOrder.includes(status as typeof storyStatusOrder[number]) ? status : 'Draft';
}

const storyStatusOptions: Record<string, StatusOption> = {
    Draft: {
        value: 'Draft',
        label: 'Draft',
        dotClass: 'bg-sky-500',
        pillClass: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800',
        borderClass: 'border-sky-300 dark:border-sky-700',
    },
    Changes: {
        value: 'Changes',
        label: 'Changes',
        dotClass: 'bg-amber-500',
        pillClass: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800',
        borderClass: 'border-amber-300 dark:border-amber-600',
    },
    Review: {
        value: 'Review',
        label: 'Review',
        dotClass: 'bg-slate-500',
        pillClass: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
        borderClass: 'border-slate-300 dark:border-slate-600',
    },
    Approved: {
        value: 'Approved',
        label: 'Approved',
        dotClass: 'bg-emerald-500',
        pillClass: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800',
        borderClass: 'border-emerald-300 dark:border-emerald-600',
    },
};

const bugStatusOrder = ['New', 'In Progress', 'Assigned', 'Reopened', 'Blocked', 'Fixed', 'Verified', 'Duplicate', 'Closed'] as const;

const bugStatusAliases: Record<string, string> = {
    Open: 'New',
    open: 'New',
    Backlog: 'New',
    backlog: 'New',
    Resolved: 'Fixed',
    resolved: 'Fixed',
};

function normalizeBugStatus(status: string) {
    if (!status) return 'New';
    const trimmed = status.trim();
    if (bugStatusAliases[trimmed]) return bugStatusAliases[trimmed];
    const canonical = bugStatusOrder.find(option => option.toLowerCase() === trimmed.toLowerCase());
    return canonical || 'New';
}

const bugStatusOptions: Record<string, StatusOption> = {
    New: {
        value: 'New',
        label: 'New',
        dotClass: 'bg-sky-500',
        pillClass: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800',
        borderClass: 'border-sky-300 dark:border-sky-700',
    },
    'In Progress': {
        value: 'In Progress',
        label: 'In Progress',
        dotClass: 'bg-blue-500',
        pillClass: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800',
        borderClass: 'border-blue-300 dark:border-blue-600',
    },
    Assigned: {
        value: 'Assigned',
        label: 'Assigned',
        dotClass: 'bg-indigo-500',
        pillClass: 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-800',
        borderClass: 'border-indigo-300 dark:border-indigo-700',
    },
    Reopened: {
        value: 'Reopened',
        label: 'Reopened',
        dotClass: 'bg-orange-500',
        pillClass: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800',
        borderClass: 'border-orange-300 dark:border-orange-700',
    },
    Blocked: {
        value: 'Blocked',
        label: 'Blocked',
        dotClass: 'bg-red-500',
        pillClass: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800',
        borderClass: 'border-red-300 dark:border-red-700',
    },
    Fixed: {
        value: 'Fixed',
        label: 'Fixed',
        dotClass: 'bg-violet-500',
        pillClass: 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-800',
        borderClass: 'border-violet-300 dark:border-violet-700',
    },
    Verified: {
        value: 'Verified',
        label: 'Verified',
        dotClass: 'bg-teal-500',
        pillClass: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-800',
        borderClass: 'border-teal-300 dark:border-teal-700',
    },
    Duplicate: {
        value: 'Duplicate',
        label: 'Duplicate',
        dotClass: 'bg-slate-500',
        pillClass: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
        borderClass: 'border-slate-300 dark:border-slate-600',
    },
    Closed: {
        value: 'Closed',
        label: 'Closed',
        dotClass: 'bg-emerald-500',
        pillClass: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800',
        borderClass: 'border-emerald-300 dark:border-emerald-700',
    },
};

const testCaseStatusOrder = ['None', 'Not Run', 'Review', 'Pass', 'Fail', 'Blocked'] as const;

function normalizeTestCaseStatus(status: string) {
    if (!status) return 'None';
    const trimmed = status.trim();
    const canonical = testCaseStatusOrder.find(option => option.toLowerCase() === trimmed.toLowerCase());
    return canonical || 'None';
}

const testCaseStatusOptions: Record<string, StatusOption> = {
    None: {
        value: 'None',
        label: 'None',
        dotClass: 'bg-slate-400',
        pillClass: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
        borderClass: 'border-slate-300 dark:border-slate-600',
    },
    'Not Run': {
        value: 'Not Run',
        label: 'Not Run',
        dotClass: 'bg-slate-500',
        pillClass: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
        borderClass: 'border-slate-300 dark:border-slate-600',
    },
    Review: {
        value: 'Review',
        label: 'Review',
        dotClass: 'bg-amber-500',
        pillClass: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800',
        borderClass: 'border-amber-300 dark:border-amber-600',
    },
    Pass: {
        value: 'Pass',
        label: 'Pass',
        dotClass: 'bg-emerald-500',
        pillClass: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800',
        borderClass: 'border-emerald-300 dark:border-emerald-700',
    },
    Fail: {
        value: 'Fail',
        label: 'Fail',
        dotClass: 'bg-rose-500',
        pillClass: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800',
        borderClass: 'border-rose-300 dark:border-rose-700',
    },
    Blocked: {
        value: 'Blocked',
        label: 'Blocked',
        dotClass: 'bg-red-500',
        pillClass: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800',
        borderClass: 'border-red-300 dark:border-red-700',
    },
};

const testSuiteStatusOrder = ['draft', 'active', 'archived'] as const;

function normalizeTestSuiteStatus(status: string) {
    if (!status) return 'draft';
    const trimmed = status.trim().toLowerCase();
    return testSuiteStatusOrder.includes(trimmed as typeof testSuiteStatusOrder[number]) ? trimmed : 'draft';
}

const testSuiteStatusOptions: Record<string, StatusOption> = {
    draft: {
        value: 'draft',
        label: 'Draft',
        dotClass: 'bg-amber-500',
        pillClass: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800',
        borderClass: 'border-amber-300 dark:border-amber-600',
    },
    active: {
        value: 'active',
        label: 'Active',
        dotClass: 'bg-emerald-500',
        pillClass: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800',
        borderClass: 'border-emerald-300 dark:border-emerald-700',
    },
    archived: {
        value: 'archived',
        label: 'Archived',
        dotClass: 'bg-slate-500',
        pillClass: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
        borderClass: 'border-slate-300 dark:border-slate-600',
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

export const storyStatusRegistry: StatusRegistryEntry = {
    artifactType: 'user_story',
    label: 'User Story',
    statuses: storyStatusOrder,
    editPermission: 'qc.projects.edit',
    normalize: normalizeStoryStatus,
    getOption: (status: string) => {
        const normalized = normalizeStoryStatus(status);
        return storyStatusOptions[normalized] || storyStatusOptions.Draft;
    },
    update: async (id, status, payload) => {
        const response = await userStoriesApi.update(id, { ...payload, status });
        return response.data ?? response;
    },
};

export const bugStatusRegistry: StatusRegistryEntry = {
    artifactType: 'bug',
    label: 'Bug',
    statuses: bugStatusOrder,
    editPermission: 'qc.bugs.edit',
    normalize: normalizeBugStatus,
    getOption: (status: string) => {
        const normalized = normalizeBugStatus(status);
        return bugStatusOptions[normalized] || bugStatusOptions.New;
    },
    update: async (id, status, payload) => {
        const response = await bugsApi.update(id, { ...payload, status });
        return response.data ?? response;
    },
};

export const testCaseStatusRegistry: StatusRegistryEntry = {
    artifactType: 'test_case',
    label: 'Test Case',
    statuses: testCaseStatusOrder,
    editPermission: 'qc.testcases.edit',
    normalize: normalizeTestCaseStatus,
    getOption: (status: string) => {
        const normalized = normalizeTestCaseStatus(status);
        return testCaseStatusOptions[normalized] || testCaseStatusOptions.None;
    },
    update: (id, status, payload) => testCasesApi.update(id, { ...payload, status } as any),
};

export const testSuiteStatusRegistry: StatusRegistryEntry = {
    artifactType: 'test_suite',
    label: 'Test Suite',
    statuses: testSuiteStatusOrder,
    editPermission: 'qc.testsuites.edit',
    normalize: normalizeTestSuiteStatus,
    getOption: (status: string) => {
        const normalized = normalizeTestSuiteStatus(status);
        return testSuiteStatusOptions[normalized] || testSuiteStatusOptions.draft;
    },
    update: (id, status, payload) => testSuitesApi.update(id, { ...payload, status } as any),
};

export const statusRegistry: Record<StatusArtifactType, StatusRegistryEntry> = {
    task: taskStatusRegistry,
    user_story: storyStatusRegistry,
    bug: bugStatusRegistry,
    test_case: testCaseStatusRegistry,
    test_suite: testSuiteStatusRegistry,
};

export function canEditStatus(rowCanEdit: boolean | undefined, hasFallbackPermission: boolean) {
    if (rowCanEdit === false) return false;
    if (rowCanEdit === true) return true;
    return hasFallbackPermission;
}

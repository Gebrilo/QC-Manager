export const TASK_HOURS_PER_DAY = 8;

export type TaskAssignmentType = 'PRIMARY' | 'SECONDARY';

export interface TaskAssignmentInput {
    resource_id: string;
    assignment_type: TaskAssignmentType;
    estimate_hrs: number;
    actual_hrs: number;
    initial_estimate?: number | null;
    final_estimate?: number | null;
    planned_working_days?: number | null;
    completion_status?: 'Pending' | 'Completed';
    completed_at?: string | null;
}

export interface TaskAssignmentFormRow {
    resource_id: string;
    estimate_days?: number;
    actual_days?: number;
}

interface AssignmentSource {
    resource_id?: string | null;
    assignment_type?: TaskAssignmentType | string | null;
    estimate_hrs?: number | string | null;
    actual_hrs?: number | string | null;
    initial_estimate?: number | string | null;
    final_estimate?: number | string | null;
}

interface LegacyTaskSource {
    assignments?: AssignmentSource[];
    resource1_uuid?: string | null;
    resource2_uuid?: string | null;
    resource1_id?: string | null;
    resource2_id?: string | null;
    estimate_days?: number | string | null;
    r1_estimate_hrs?: number | string | null;
    r1_actual_hrs?: number | string | null;
    r2_estimate_hrs?: number | string | null;
    r2_actual_hrs?: number | string | null;
    initial_estimate?: number | string | null;
    final_estimate?: number | string | null;
}

function numberOrUndefined(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
}

function numberOrNull(value: unknown): number | null {
    return numberOrUndefined(value) ?? null;
}

export function hoursToDays(value: unknown): number | undefined {
    const hours = numberOrUndefined(value);
    if (hours === undefined) return undefined;
    return Number((hours / TASK_HOURS_PER_DAY).toFixed(4));
}

export function daysToHours(value: unknown): number {
    const days = numberOrUndefined(value);
    if (days === undefined) return 0;
    return Number((days * TASK_HOURS_PER_DAY).toFixed(4));
}

export function getTaskAssignmentDefaults(task: LegacyTaskSource) {
    const assignments = Array.isArray(task.assignments) ? task.assignments : [];
    const primary = assignments.find(a => a.assignment_type === 'PRIMARY');
    const secondaries = assignments.filter(a => a.assignment_type === 'SECONDARY' && a.resource_id);

    const primaryResourceId = primary?.resource_id || task.resource1_uuid || task.resource1_id || '';
    const primaryEstimateDays =
        hoursToDays(primary?.estimate_hrs)
        ?? hoursToDays(task.r1_estimate_hrs)
        ?? numberOrUndefined(task.estimate_days);
    const primaryActualDays =
        hoursToDays(primary?.actual_hrs)
        ?? hoursToDays(task.r1_actual_hrs)
        ?? 0;

    const secondaryRows = secondaries.length > 0
        ? secondaries.map(a => ({
            resource_id: a.resource_id || '',
            estimate_days: hoursToDays(a.estimate_hrs),
            actual_days: hoursToDays(a.actual_hrs) ?? 0,
        }))
        : (task.resource2_uuid || task.resource2_id)
            ? [{
                resource_id: task.resource2_uuid || task.resource2_id || '',
                estimate_days: hoursToDays(task.r2_estimate_hrs),
                actual_days: hoursToDays(task.r2_actual_hrs) ?? 0,
            }]
            : [];

    return {
        primaryResourceId,
        primaryEstimateDays,
        primaryActualDays,
        primaryInitialEstimate: numberOrNull(primary?.initial_estimate ?? task.initial_estimate),
        primaryFinalEstimate: numberOrNull(primary?.final_estimate ?? task.final_estimate),
        secondaries: secondaryRows,
    };
}

export function buildTaskAssignmentsPayload({
    primaryResourceId,
    primaryEstimateDays,
    primaryActualDays,
    primaryInitialEstimate,
    primaryFinalEstimate,
    secondaryAssignments,
}: {
    primaryResourceId: string;
    primaryEstimateDays?: number | null;
    primaryActualDays?: number | null;
    primaryInitialEstimate?: number | null;
    primaryFinalEstimate?: number | null;
    secondaryAssignments: TaskAssignmentFormRow[];
}) {
    const primaryEstimateHrs = daysToHours(primaryEstimateDays);
    const primaryActualHrs = daysToHours(primaryActualDays);
    const assignments: TaskAssignmentInput[] = [];

    if (primaryResourceId) {
        assignments.push({
            resource_id: primaryResourceId,
            assignment_type: 'PRIMARY',
            estimate_hrs: primaryEstimateHrs,
            actual_hrs: primaryActualHrs,
            initial_estimate: numberOrNull(primaryInitialEstimate),
            final_estimate: numberOrNull(primaryFinalEstimate),
            planned_working_days: numberOrNull(primaryEstimateDays),
        });
    }

    for (const row of secondaryAssignments) {
        if (!row.resource_id) continue;
        assignments.push({
            resource_id: row.resource_id,
            assignment_type: 'SECONDARY',
            estimate_hrs: daysToHours(row.estimate_days),
            actual_hrs: daysToHours(row.actual_days),
            planned_working_days: numberOrNull(row.estimate_days),
        });
    }

    const firstSecondary = assignments.find(a => a.assignment_type === 'SECONDARY');
    const totalActualHrs = assignments.reduce((sum, a) => sum + a.actual_hrs, 0);
    const taskEstimateDays = numberOrUndefined(primaryEstimateDays);

    return {
        assignments,
        legacy: {
            resource1_uuid: primaryResourceId || undefined,
            resource2_uuid: firstSecondary?.resource_id || undefined,
            estimate_days: taskEstimateDays && taskEstimateDays > 0 ? taskEstimateDays : undefined,
            r1_estimate_hrs: primaryEstimateHrs,
            r1_actual_hrs: primaryActualHrs,
            r2_estimate_hrs: firstSecondary?.estimate_hrs ?? 0,
            r2_actual_hrs: firstSecondary?.actual_hrs ?? 0,
            actual_effort: totalActualHrs,
        },
    };
}

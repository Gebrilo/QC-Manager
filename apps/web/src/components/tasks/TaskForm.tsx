'use client';

import { useState } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { FormSection } from '@/components/ui/FormSection';
import { UserStoryPicker } from '@/components/shared/UserStoryPicker';
import { Project, Resource, Task } from '@/types';
import { useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import type { TaskAssignmentInput } from '@/lib/taskAssignments';

const optionalNumber = (schema: z.ZodNumber) =>
    z.preprocess((value) => {
        if (value === undefined || value === null) return undefined;
        if (typeof value === 'string' && value.trim() === '') return undefined;
        return Number(value);
    }, schema.optional());

const taskSchema = z.object({
    task_id: z.string().regex(/^TSK-[0-9]{3}$/, 'Format: TSK-XXX'),
    project_id: z.string().uuid(),
    task_name: z.string().min(1, 'Required'),
    status: z.enum(['Todo', 'In Progress', 'Blocked', 'Done', 'Canceled']),
    priority: z.enum(['High', 'Medium', 'Low']).optional(),
    description: z.string().optional().default(''),
    team: z.string().optional().default(''),
    blocked_reason: z.string().optional().default(''),
    resource1_uuid: z.string().uuid(),
    resource2_uuid: z.string().optional().or(z.literal('')),
    initial_estimate: optionalNumber(z.number()),
    final_estimate: optionalNumber(z.number()),
    actual_effort: optionalNumber(z.number()),
    estimate_days: optionalNumber(z.number().positive()),
    r1_estimate_hrs: optionalNumber(z.number().min(0)),
    r1_actual_hrs: optionalNumber(z.number().min(0)),
    r2_estimate_hrs: optionalNumber(z.number().min(0)),
    r2_actual_hrs: optionalNumber(z.number().min(0)),
    expected_start_date: z.string().optional().or(z.literal('')),
    actual_start_date: z.string().optional().or(z.literal('')),
    deadline: z.string().optional().or(z.literal('')),
    completed_date: z.string().optional().or(z.literal('')),
    parent_user_story_id: z.string().uuid().optional().or(z.literal('')),
});

type FormData = z.infer<typeof taskSchema>;
type FormField = keyof FormData;

const FIELD_LABELS: Partial<Record<FormField, string>> = {
    task_id: 'Task ID',
    project_id: 'Project',
    task_name: 'Task Name',
    status: 'Status',
    priority: 'Priority',
    description: 'Description',
    team: 'Team',
    blocked_reason: 'Blocked Reason',
    resource1_uuid: 'Primary Resource',
    resource2_uuid: 'Secondary Resource',
    initial_estimate: 'Initial Estimate',
    final_estimate: 'Final Estimate',
    actual_effort: 'Actual Effort',
    estimate_days: 'Estimate Days',
    r1_estimate_hrs: 'R1 Estimate Hours',
    r1_actual_hrs: 'R1 Actual Hours',
    r2_estimate_hrs: 'R2 Estimate Hours',
    r2_actual_hrs: 'R2 Actual Hours',
    expected_start_date: 'Expected Start Date',
    actual_start_date: 'Actual Start Date',
    deadline: 'Deadline',
    completed_date: 'Completed Date',
    parent_user_story_id: 'Parent User Story',
};

function errorLabels(errors: FieldErrors<FormData>) {
    return (Object.keys(errors) as FormField[])
        .map(field => FIELD_LABELS[field] ?? field.replace(/_/g, ' '))
        .join(', ');
}

interface TaskFormProps {
    initialData?: Task;
    projects: Project[];
    resources: Resource[];
    isEdit?: boolean;
}

function normalizePriority(priority?: string): 'High' | 'Medium' | 'Low' {
    if (!priority) return 'Medium';
    const lower = priority.toLowerCase();
    if (lower === 'high') return 'High';
    if (lower === 'low') return 'Low';
    return 'Medium';
}

export function TaskForm({ initialData, projects, resources, isEdit }: TaskFormProps) {
    const router = useRouter();
    const toast = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { register, handleSubmit, formState: { errors }, watch, setValue } = useForm<FormData>({
        resolver: zodResolver(taskSchema) as any,
        mode: 'onChange',
        defaultValues: {
            task_id: initialData?.task_id || `TSK-${Math.floor(Math.random() * 900) + 100}`,
            project_id: initialData?.project_id || '',
            task_name: initialData?.task_name || '',
            status: (initialData?.status as any) || 'Todo',
            priority: normalizePriority(initialData?.priority),
            description: initialData?.notes || (initialData as any)?.description || '',
            team: (initialData as any)?.team || '',
            blocked_reason: (initialData as any)?.blocked_reason || '',
            resource1_uuid: initialData?.resource1_uuid || initialData?.resource1_id || '',
            resource2_uuid: initialData?.resource2_uuid || initialData?.resource2_id || '',
            initial_estimate: (initialData as any)?.initial_estimate != null ? Number((initialData as any).initial_estimate) : undefined,
            final_estimate: (initialData as any)?.final_estimate != null ? Number((initialData as any).final_estimate) : undefined,
            actual_effort: (initialData as any)?.actual_effort != null ? Number((initialData as any).actual_effort) : undefined,
            estimate_days: initialData?.estimate_days ? Number(initialData.estimate_days) : undefined,
            r1_estimate_hrs: initialData?.r1_estimate_hrs ? Number(initialData.r1_estimate_hrs) : (initialData?.estimate_days ? Number(initialData.estimate_days) * 8 : undefined),
            r1_actual_hrs: initialData?.r1_actual_hrs ? Number(initialData.r1_actual_hrs) : 0,
            r2_estimate_hrs: initialData?.r2_estimate_hrs ? Number(initialData.r2_estimate_hrs) : 0,
            r2_actual_hrs: initialData?.r2_actual_hrs ? Number(initialData.r2_actual_hrs) : 0,
            expected_start_date: initialData?.expected_start_date ? initialData.expected_start_date.split('T')[0] : '',
            actual_start_date: initialData?.actual_start_date ? initialData.actual_start_date.split('T')[0] : '',
            deadline: initialData?.deadline ? initialData.deadline.split('T')[0] : '',
            completed_date: initialData?.completed_date ? initialData.completed_date.split('T')[0] : '',
            parent_user_story_id: (initialData as any)?.parent_user_story_id || '',
        },
    });

    const taskNameValue = watch('task_name');
    const projectIdValue = watch('project_id');
    const resource1Value = watch('resource1_uuid');
    const resource2Value = watch('resource2_uuid');
    const missingRequiredFields = [
        !taskNameValue?.trim() ? 'Task Name' : null,
        !projectIdValue ? 'Project' : null,
        !resource1Value ? 'Primary Resource' : null,
    ].filter(Boolean) as string[];

    const onSubmit = async (data: FormData) => {
        setIsSubmitting(true);
        setError(null);
        try {
            const assignments: TaskAssignmentInput[] = [];
            if (data.resource1_uuid) {
                assignments.push({
                    resource_id: data.resource1_uuid,
                    assignment_type: 'PRIMARY' as const,
                    estimate_hrs: data.r1_estimate_hrs ? Number(data.r1_estimate_hrs) : (data.estimate_days ? Number(data.estimate_days) * 8 : 0),
                    actual_hrs: data.r1_actual_hrs ? Number(data.r1_actual_hrs) : 0,
                    initial_estimate: data.initial_estimate ?? null,
                    final_estimate: data.final_estimate ?? null,
                });
            }
            if (data.resource2_uuid) {
                assignments.push({
                    resource_id: data.resource2_uuid,
                    assignment_type: 'SECONDARY' as const,
                    estimate_hrs: data.r2_estimate_hrs ? Number(data.r2_estimate_hrs) : 0,
                    actual_hrs: data.r2_actual_hrs ? Number(data.r2_actual_hrs) : 0,
                });
            }
            const payload = {
                task_id: data.task_id,
                project_id: data.project_id,
                task_name: data.task_name,
                status: data.status,
                priority: data.priority,
                description: data.description || undefined,
                estimate_days: data.estimate_days ? Number(data.estimate_days) : undefined,
                assignments,
                expected_start_date: data.expected_start_date || undefined,
                actual_start_date: data.actual_start_date || undefined,
                deadline: data.deadline || undefined,
                completed_date: data.completed_date || undefined,
                parent_user_story_id: isEdit ? (data.parent_user_story_id || null) : (data.parent_user_story_id || undefined),
            };

            if (isEdit && initialData) {
                await fetchApi(`/tasks/${initialData.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify(payload),
                });
            } else {
                await fetchApi('/tasks', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                });
            }
            router.push('/');
            router.refresh();
        } catch (err: any) {
            setError(err.message || 'Failed to save task');
        } finally {
            setIsSubmitting(false);
        }
    };

    const onInvalid = (formErrors: FieldErrors<FormData>) => {
        const firstField = Object.keys(formErrors)[0] as FormField | undefined;
        const firstInput = firstField ? document.querySelector(`[name="${firstField}"]`) : null;

        if (firstInput instanceof HTMLElement) {
            firstInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        toast.error(`Fix required fields: ${errorLabels(formErrors) || 'highlighted fields'}`);
    };

    const projectOptions = projects.map(p => ({ value: p.id, label: `${p.project_id} - ${p.project_name || 'Unnamed'}` }));
    const activeResources = resources.filter(r => r.is_active !== false);
    const resourceOptions = activeResources.map(r => {
        const util = r.utilization_pct != null ? ` (${Number(r.utilization_pct).toFixed(0)}% utilized)` : '';
        return { value: r.id, label: `${r.resource_name || r.name || 'Unnamed'}${util}` };
    });
    const resource2Options = [
        { value: '', label: '-- None --' },
        ...activeResources.filter(r => r.id !== resource1Value).map(r => {
            const util = r.utilization_pct != null ? ` (${Number(r.utilization_pct).toFixed(0)}% utilized)` : '';
            return { value: r.id, label: `${r.resource_name || r.name || 'Unnamed'}${util}` };
        }),
    ];

    return (
        <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-6 max-w-3xl mx-auto">
            <ErrorBanner message={error} />

            <FormSection title="Task Details">
                <Input
                    label="Task ID"
                    {...register('task_id')}
                    error={errors.task_id?.message}
                    placeholder="TSK-001"
                    disabled
                    className="bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 cursor-not-allowed"
                />
                <Select
                    label="Status"
                    options={[
                        { value: 'Todo', label: 'Todo' },
                        { value: 'In Progress', label: 'In Progress' },
                        { value: 'Blocked', label: 'Blocked' },
                        { value: 'Done', label: 'Done' },
                        { value: 'Canceled', label: 'Canceled' },
                    ]}
                    {...register('status')}
                    error={errors.status?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <div className="md:col-span-2">
                    <Input
                        label="Task Name"
                        {...register('task_name')}
                        error={errors.task_name?.message}
                        placeholder="e.g. Implement Authorization Logic"
                        className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                    />
                </div>
                <Select
                    label="Priority"
                    options={[
                        { value: 'High', label: 'High' },
                        { value: 'Medium', label: 'Medium' },
                        { value: 'Low', label: 'Low' },
                    ]}
                    {...register('priority')}
                    error={errors.priority?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
            </FormSection>

            <FormSection title="Description">
                <div className="md:col-span-2">
                    <Textarea
                        label="Description / Notes"
                        {...register('description')}
                        placeholder="Add detailed notes about this task..."
                    />
                </div>
                <Input
                    label="Team"
                    {...register('team')}
                    placeholder="e.g. QA-Team"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <div className="md:col-span-2">
                    <Textarea
                        label="Blocked Reason"
                        {...register('blocked_reason')}
                        placeholder="Reason this task is blocked (if applicable)..."
                    />
                </div>
            </FormSection>

            <FormSection title="Assignment & Planning">
                <Select
                    label="Project"
                    options={projectOptions}
                    {...register('project_id')}
                    error={errors.project_id?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Estimate (Days)"
                    type="number"
                    step="0.5"
                    {...register('estimate_days')}
                    error={errors.estimate_days?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Select
                    label="Primary Resource"
                    options={resourceOptions}
                    {...register('resource1_uuid')}
                    error={errors.resource1_uuid?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Select
                    label="Secondary Resource (Optional)"
                    options={resource2Options}
                    {...register('resource2_uuid')}
                    error={errors.resource2_uuid?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Initial Estimate (hrs)"
                    type="number"
                    step="0.5"
                    {...register('initial_estimate')}
                    error={errors.initial_estimate?.message}
                    placeholder="0"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Final Estimate (hrs)"
                    type="number"
                    step="0.5"
                    {...register('final_estimate')}
                    error={errors.final_estimate?.message}
                    placeholder="0"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Est. Hours (R1)"
                    type="number"
                    step="0.5"
                    placeholder="8 hours per day"
                    {...register('r1_estimate_hrs')}
                    error={errors.r1_estimate_hrs?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Actual Hours (R1)"
                    type="number"
                    step="0.5"
                    placeholder="Hours worked"
                    {...register('r1_actual_hrs')}
                    error={errors.r1_actual_hrs?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                {resource2Value && (
                    <>
                        <Input
                            label="Est. Hours (R2)"
                            type="number"
                            step="0.5"
                            placeholder="Hours for R2"
                            {...register('r2_estimate_hrs')}
                            error={errors.r2_estimate_hrs?.message}
                            className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                        />
                        <Input
                            label="Actual Hours (R2)"
                            type="number"
                            step="0.5"
                            placeholder="Hours worked by R2"
                            {...register('r2_actual_hrs')}
                            error={errors.r2_actual_hrs?.message}
                            className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                        />
                    </>
                )}
                <Input
                    label="Actual Effort (hrs)"
                    type="number"
                    step="0.5"
                    {...register('actual_effort')}
                    error={errors.actual_effort?.message}
                    placeholder="0"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Expected Start Date"
                    type="date"
                    {...register('expected_start_date')}
                    error={errors.expected_start_date?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Actual Start Date"
                    type="date"
                    {...register('actual_start_date')}
                    error={errors.actual_start_date?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Deadline"
                    type="date"
                    {...register('deadline')}
                    error={errors.deadline?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Completed Date"
                    type="date"
                    {...register('completed_date')}
                    error={errors.completed_date?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
            </FormSection>

            <FormSection title="Links">
                <UserStoryPicker
                    label="Parent User Story"
                    projectId={projectIdValue}
                    value={watch('parent_user_story_id')}
                    initialValueId={(initialData as any)?.parent_user_story_id}
                    onChange={(id) => setValue('parent_user_story_id', id ?? '', { shouldValidate: true })}
                />
            </FormSection>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <Button type="button" variant="outline" onClick={() => router.back()} className="w-24 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300">Cancel</Button>
                <Button type="submit" disabled={isSubmitting || missingRequiredFields.length > 0} className="w-36 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white shadow-lg shadow-indigo-500/30 border-none">
                    {isSubmitting ? <span className="animate-spin mr-2">⏳</span> : null}
                    {isEdit ? 'Save Changes' : 'Create Task'}
                </Button>
            </div>
        </form>
    );
}

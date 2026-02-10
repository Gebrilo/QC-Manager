'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Project, Resource, Task } from '@/types';
import { useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/api';

// Matches backend schema but adapted for Form UI (strings for numbers sometimes)
const taskSchema = z.object({
    task_id: z.string().regex(/^TSK-[0-9]{3}$/, 'Format: TSK-XXX'),
    project_id: z.string().uuid(),
    task_name: z.string().min(1, 'Required'),
    status: z.enum(['Backlog', 'In Progress', 'Done', 'Cancelled']),
    priority: z.enum(['High', 'Medium', 'Low']).optional(),
    resource1_uuid: z.string().uuid(),
    resource2_uuid: z.string().optional().or(z.literal('')),

    estimate_days: z.coerce.number().positive().optional(),
    r1_estimate_hrs: z.coerce.number().min(0).optional(),
    r1_actual_hrs: z.coerce.number().min(0).optional(),
    r2_estimate_hrs: z.coerce.number().min(0).optional(),
    r2_actual_hrs: z.coerce.number().min(0).optional(),
    expected_start_date: z.string().optional().or(z.literal('')),
    actual_start_date: z.string().optional().or(z.literal('')),
    deadline: z.string().optional().or(z.literal('')),
    completed_date: z.string().optional().or(z.literal('')),

    notes: z.string().optional()
});

type FormData = z.infer<typeof taskSchema>;

interface TaskFormProps {
    initialData?: Task;
    projects: Project[];
    resources: Resource[];
    isEdit?: boolean;
}

// Helper to normalize priority case (API may return 'medium', form expects 'Medium')
function normalizePriority(priority?: string): 'High' | 'Medium' | 'Low' {
    if (!priority) return 'Medium';
    const lower = priority.toLowerCase();
    if (lower === 'high') return 'High';
    if (lower === 'low') return 'Low';
    return 'Medium';
}

export function TaskForm({ initialData, projects, resources, isEdit }: TaskFormProps) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        formState: { errors },
        setValue,
        watch
    } = useForm<FormData>({
        resolver: zodResolver(taskSchema) as any,
        defaultValues: {
            task_id: initialData?.task_id || `TSK-${Math.floor(Math.random() * 900) + 100}`,
            project_id: initialData?.project_id || '',
            task_name: initialData?.task_name || '',
            status: (initialData?.status as any) || 'Backlog',
            priority: normalizePriority(initialData?.priority),
            resource1_uuid: initialData?.resource1_uuid || initialData?.resource1_id || '',
            resource2_uuid: initialData?.resource2_uuid || initialData?.resource2_id || '',
            estimate_days: initialData?.estimate_days ? Number(initialData.estimate_days) : undefined,
            r1_estimate_hrs: initialData?.r1_estimate_hrs ? Number(initialData.r1_estimate_hrs) : (initialData?.estimate_days ? Number(initialData.estimate_days) * 8 : undefined),
            r1_actual_hrs: initialData?.r1_actual_hrs ? Number(initialData.r1_actual_hrs) : 0,
            r2_estimate_hrs: initialData?.r2_estimate_hrs ? Number(initialData.r2_estimate_hrs) : 0,
            r2_actual_hrs: initialData?.r2_actual_hrs ? Number(initialData.r2_actual_hrs) : 0,
            expected_start_date: initialData?.expected_start_date ? initialData.expected_start_date.split('T')[0] : '',
            actual_start_date: initialData?.actual_start_date ? initialData.actual_start_date.split('T')[0] : '',
            deadline: initialData?.deadline ? initialData.deadline.split('T')[0] : '',
            completed_date: initialData?.completed_date ? initialData.completed_date.split('T')[0] : '',
            notes: initialData?.notes || ''
        }
    });

    // Watch resource selections for conditional rendering
    const resource1Value = watch('resource1_uuid');
    const resource2Value = watch('resource2_uuid');

    const onSubmit = async (data: FormData) => {
        setIsSubmitting(true);
        setError(null);
        try {
            const payload = {
                ...data,
                // Clean up empty strings to avoid Zod validation errors (e.g. invalid UUID/Date)
                resource1_uuid: data.resource1_uuid || undefined,
                resource2_uuid: data.resource2_uuid || undefined,
                expected_start_date: data.expected_start_date || undefined,
                actual_start_date: data.actual_start_date || undefined,
                deadline: data.deadline || undefined,
                completed_date: data.completed_date || undefined,
                // Ensure numbers are numbers
                estimate_days: data.estimate_days ? Number(data.estimate_days) : undefined,
                // Auto-calculate r1_estimate_hrs from estimate_days if not explicitly set
                r1_estimate_hrs: data.r1_estimate_hrs ? Number(data.r1_estimate_hrs) : (data.estimate_days ? Number(data.estimate_days) * 8 : 0),
                r1_actual_hrs: data.r1_actual_hrs ? Number(data.r1_actual_hrs) : 0,
                r2_estimate_hrs: data.resource2_uuid && data.r2_estimate_hrs ? Number(data.r2_estimate_hrs) : 0,
                r2_actual_hrs: data.resource2_uuid && data.r2_actual_hrs ? Number(data.r2_actual_hrs) : 0
            };

            if (isEdit && initialData) {
                await fetchApi(`/tasks/${initialData.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify(payload)
                });
            } else {
                await fetchApi('/tasks', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
            }

            router.push('/'); // Redirect to dashboard
            router.refresh();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const projectOptions = projects.map(p => ({ value: p.id, label: `${p.project_id} - ${p.project_name || 'Unnamed'}` }));
    const resourceOptions = resources.map(r => ({ value: r.id, label: r.resource_name || r.name || 'Unnamed' }));

    // Filter out resource 1 from resource 2 options
    const resource2Options = [
        { value: '', label: '-- None --' },
        ...resources
            .filter(r => r.id !== resource1Value)
            .map(r => ({ value: r.id, label: r.resource_name || r.name || 'Unnamed' }))
    ];

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 max-w-3xl mx-auto">

            {/* Header / Meta Info */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">Task Details</h3>

                {error && (
                    <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 p-4 rounded-xl text-sm mb-6 flex items-center gap-2">
                        <svg className="w-5 h-5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                            { value: 'Backlog', label: 'Backlog' },
                            { value: 'In Progress', label: 'In Progress' },
                            { value: 'Done', label: 'Done' },
                            { value: 'Cancelled', label: 'Cancelled' }
                        ]}
                        {...register('status')}
                        error={errors.status?.message}
                        className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                    />
                    <div className="md:col-span-1">
                        <Select
                            label="Priority"
                            options={[
                                { value: 'High', label: 'High' },
                                { value: 'Medium', label: 'Medium' },
                                { value: 'Low', label: 'Low' }
                            ]}
                            {...register('priority')}
                            error={errors.priority?.message}
                            className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                        />
                    </div>
                    <div className="md:col-span-1" /> {/* Spacer */}

                    <div className="md:col-span-2">
                        <Input
                            label="Task Name"
                            {...register('task_name')}
                            error={errors.task_name?.message}
                            placeholder="e.g. Implement Authorization Logic"
                            className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Description / Notes</label>
                        <textarea
                            {...register('notes')}
                            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none min-h-[120px] transition-all resize-y"
                            placeholder="Add detailed notes about this task..."
                        />
                    </div>
                </div>
            </div>

            {/* Assignment & Estimation */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">Assignment & Planning</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

                    {/* R2 Hours - Only show when Resource 2 is selected */}
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
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <Button type="button" variant="outline" onClick={() => router.back()} className="w-24 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300">Cancel</Button>
                <Button type="submit" disabled={isSubmitting} className="w-36 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white shadow-lg shadow-indigo-500/30 border-none">
                    {isSubmitting ? <span className="animate-spin mr-2">⏳</span> : null}
                    {isEdit ? 'Save Changes' : 'Create Task'}
                </Button>
            </div>
        </form>
    );
}

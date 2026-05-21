'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm, UseFormRegister, UseFormWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { fetchApi } from '@/lib/api';
import { Task, Project, Resource } from '@/types';
import { useAuth } from '@/components/providers/AuthProvider';
import { Spinner } from '@/components/ui/Spinner';
import Link from 'next/link';

// ── Schema ─────────────────────────────────────────────────────────────────

const schema = z.object({
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
    initial_estimate: z.coerce.number().nullable().optional(),
    final_estimate: z.coerce.number().nullable().optional(),
    actual_effort: z.coerce.number().nullable().optional(),
    estimate_days: z.coerce.number().positive().optional(),
    r1_estimate_hrs: z.coerce.number().min(0).optional(),
    r1_actual_hrs: z.coerce.number().min(0).optional(),
    r2_estimate_hrs: z.coerce.number().min(0).optional(),
    r2_actual_hrs: z.coerce.number().min(0).optional(),
    expected_start_date: z.string().optional().or(z.literal('')),
    actual_start_date: z.string().optional().or(z.literal('')),
    deadline: z.string().optional().or(z.literal('')),
    completed_date: z.string().optional().or(z.literal('')),
    parent_user_story_id: z.string().uuid().optional().or(z.literal('')),
});

type FormData = z.infer<typeof schema>;

function normalizePriority(priority?: string): 'High' | 'Medium' | 'Low' {
    if (!priority) return 'Medium';
    const lower = priority.toLowerCase();
    if (lower === 'high') return 'High';
    if (lower === 'low') return 'Low';
    return 'Medium';
}

// ── Design primitives ──────────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm ${className}`}>
            {children}
        </div>
    );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-4">
            {children}
        </div>
    );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
    return (
        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 tracking-wide uppercase">
            {children}
            {required && <span className="text-rose-400 ml-0.5">*</span>}
        </label>
    );
}

function FieldError({ message }: { message?: string }) {
    if (!message) return null;
    return <p className="text-xs text-rose-500 mt-1.5">{message}</p>;
}

const fieldCls = "w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-400 dark:focus:border-violet-500 transition-all";
const disabledFieldCls = "w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-400 dark:text-slate-500 cursor-not-allowed";

// ── Page ───────────────────────────────────────────────────────────────────

export default function EditTaskPage() {
    const params = useParams();
    const id = (params?.id as string) || '';
    const router = useRouter();
    const { hasPermission, loading: authLoading } = useAuth();
    const [pageData, setPageData] = useState<{ task: Task; projects: Project[]; resources: Resource[] } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!authLoading && !hasPermission('qc.tasks.edit')) {
            router.replace(`/work/tasks/${id}`);
        }
    }, [authLoading, hasPermission, router, id]);

    useEffect(() => {
        async function load() {
            try {
                const [task, projects, resources] = await Promise.all([
                    fetchApi<Task>(`/tasks/${id}`),
                    fetchApi<Project[]>('/projects'),
                    fetchApi<Resource[]>('/resources'),
                ]);
                setPageData({ task, projects, resources });
            } catch (err) {
                console.error('Failed to load task data:', err);
            } finally {
                setIsLoading(false);
            }
        }
        if (id) load();
    }, [id]);

    if (authLoading || !hasPermission('qc.tasks.edit')) return null;
    if (isLoading) return <div className="p-10 flex justify-center"><Spinner size="lg" /></div>;
    if (!pageData) return <div className="p-10 text-center text-slate-500">Task not found</div>;

    return (
        <EditForm
            task={pageData.task}
            projects={pageData.projects}
            resources={pageData.resources}
            taskId={id}
            router={router}
            isSubmitting={isSubmitting}
            setIsSubmitting={setIsSubmitting}
            error={error}
            setError={setError}
        />
    );
}

// ── Form component (separated so hooks are called after data is loaded) ────

function EditForm({
    task,
    projects,
    resources,
    taskId,
    router,
    isSubmitting,
    setIsSubmitting,
    error,
    setError,
}: {
    task: Task;
    projects: Project[];
    resources: Resource[];
    taskId: string;
    router: ReturnType<typeof useRouter>;
    isSubmitting: boolean;
    setIsSubmitting: (v: boolean) => void;
    error: string | null;
    setError: (v: string | null) => void;
}) {
    const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema) as any,
        defaultValues: {
            task_id: task.task_id || '',
            project_id: task.project_id || '',
            task_name: task.task_name || '',
            status: (task.status as any) || 'Todo',
            priority: normalizePriority(task.priority),
            description: task.notes || (task as any).description || '',
            team: (task as any).team || '',
            blocked_reason: (task as any).blocked_reason || '',
            resource1_uuid: task.resource1_uuid || task.resource1_id || '',
            resource2_uuid: task.resource2_uuid || task.resource2_id || '',
            initial_estimate: (task as any).initial_estimate != null ? Number((task as any).initial_estimate) : null,
            final_estimate: (task as any).final_estimate != null ? Number((task as any).final_estimate) : null,
            actual_effort: (task as any).actual_effort != null ? Number((task as any).actual_effort) : null,
            estimate_days: task.estimate_days ? Number(task.estimate_days) : undefined,
            r1_estimate_hrs: task.r1_estimate_hrs ? Number(task.r1_estimate_hrs) : (task.estimate_days ? Number(task.estimate_days) * 8 : undefined),
            r1_actual_hrs: task.r1_actual_hrs ? Number(task.r1_actual_hrs) : 0,
            r2_estimate_hrs: task.r2_estimate_hrs ? Number(task.r2_estimate_hrs) : 0,
            r2_actual_hrs: task.r2_actual_hrs ? Number(task.r2_actual_hrs) : 0,
            expected_start_date: task.expected_start_date ? task.expected_start_date.split('T')[0] : '',
            actual_start_date: task.actual_start_date ? task.actual_start_date.split('T')[0] : '',
            deadline: task.deadline ? task.deadline.split('T')[0] : '',
            completed_date: task.completed_date ? task.completed_date.split('T')[0] : '',
            parent_user_story_id: task.parent_user_story_id || '',
        },
    });

    const resource2Value = watch('resource2_uuid');
    const statusValue = watch('status');

    const onSubmit = async (data: FormData) => {
        setIsSubmitting(true);
        setError(null);
        try {
            const payload = {
                ...data,
                resource1_uuid: data.resource1_uuid || undefined,
                resource2_uuid: data.resource2_uuid || undefined,
                expected_start_date: data.expected_start_date || undefined,
                actual_start_date: data.actual_start_date || undefined,
                deadline: data.deadline || undefined,
                completed_date: data.completed_date || undefined,
                estimate_days: data.estimate_days ? Number(data.estimate_days) : undefined,
                r1_estimate_hrs: data.r1_estimate_hrs ? Number(data.r1_estimate_hrs) : (data.estimate_days ? Number(data.estimate_days) * 8 : 0),
                r1_actual_hrs: data.r1_actual_hrs ? Number(data.r1_actual_hrs) : 0,
                r2_estimate_hrs: data.resource2_uuid && data.r2_estimate_hrs ? Number(data.r2_estimate_hrs) : 0,
                r2_actual_hrs: data.resource2_uuid && data.r2_actual_hrs ? Number(data.r2_actual_hrs) : 0,
                initial_estimate: data.initial_estimate ?? undefined,
                final_estimate: data.final_estimate ?? undefined,
                actual_effort: data.actual_effort ?? undefined,
                parent_user_story_id: data.parent_user_story_id || undefined,
            };
            await fetchApi(`/tasks/${task.id}`, {
                method: 'PATCH',
                body: JSON.stringify(payload),
            });
            router.push(`/work/tasks/${task.id}`);
            router.refresh();
        } catch (err: any) {
            setError(err.message || 'Failed to save task');
        } finally {
            setIsSubmitting(false);
        }
    };

    const activeResources = resources.filter(r => r.is_active !== false);
    const resource1Options = activeResources.map(r => ({
        value: r.id,
        label: `${r.resource_name || r.name || 'Unnamed'}${r.utilization_pct != null ? ` · ${Number(r.utilization_pct).toFixed(0)}% util` : ''}`,
    }));
    const resource2Options = [
        { value: '', label: '— None —' },
        ...activeResources.map(r => ({
            value: r.id,
            label: `${r.resource_name || r.name || 'Unnamed'}${r.utilization_pct != null ? ` · ${Number(r.utilization_pct).toFixed(0)}% util` : ''}`,
        })),
    ];

    const STATUS_OPTIONS: { value: FormData['status']; dot: string }[] = [
        { value: 'Todo',        dot: 'bg-slate-400' },
        { value: 'In Progress', dot: 'bg-blue-500' },
        { value: 'Blocked',     dot: 'bg-rose-500' },
        { value: 'Done',        dot: 'bg-emerald-500' },
        { value: 'Canceled',    dot: 'bg-slate-300' },
    ];

    const PRIORITY_OPTIONS: { value: NonNullable<FormData['priority']>; color: string; active: string }[] = [
        { value: 'High',   color: 'text-rose-600 border-rose-200 dark:border-rose-800',   active: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700' },
        { value: 'Medium', color: 'text-amber-600 border-amber-200 dark:border-amber-800', active: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700' },
        { value: 'Low',    color: 'text-slate-500 border-slate-200 dark:border-slate-700',  active: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600' },
    ];

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="max-w-[1280px] mx-auto px-6 py-6 space-y-5">

            {/* ── Header ──────────────────────────────────────────────── */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="text-sm font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors flex-shrink-0"
                    >
                        ← Back
                    </button>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white truncate">
                                Edit Task
                            </h1>
                            <span className="font-mono text-sm font-semibold text-violet-600 dark:text-violet-400 flex-shrink-0">
                                {task.task_id}
                            </span>
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {task.task_name}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    <Link
                        href={`/work/tasks/${taskId}`}
                        className="h-9 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center"
                    >
                        Cancel
                    </Link>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="h-9 px-5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold shadow-md shadow-violet-500/25 transition-all flex items-center gap-2"
                    >
                        {isSubmitting && (
                            <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                        )}
                        Save Changes
                    </button>
                </div>
            </div>

            {/* Error banner */}
            {error && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-sm text-rose-700 dark:text-rose-300">
                    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="flex-shrink-0">
                        <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
                    </svg>
                    {error}
                </div>
            )}

            {/* ── Two-column layout ────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-5">

                {/* ── Left column (2/3) ─────────────────────────────── */}
                <div className="col-span-2 space-y-5">

                    {/* Task Details */}
                    <Card>
                        <SectionLabel>Task Details</SectionLabel>
                        <div className="space-y-5">

                            {/* Task ID — readonly */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <FieldLabel>Task ID</FieldLabel>
                                    <input {...register('task_id')} disabled className={disabledFieldCls} />
                                    <FieldError message={errors.task_id?.message} />
                                </div>
                                <div>
                                    <FieldLabel>Team</FieldLabel>
                                    <input
                                        {...register('team')}
                                        placeholder="e.g. QA-Team"
                                        className={fieldCls}
                                    />
                                </div>
                            </div>

                            {/* Task Name */}
                            <div>
                                <FieldLabel required>Task Name</FieldLabel>
                                <input
                                    {...register('task_name')}
                                    placeholder="e.g. Implement Authorization Logic"
                                    className={fieldCls}
                                />
                                <FieldError message={errors.task_name?.message} />
                            </div>

                            {/* Status chips */}
                            <div>
                                <FieldLabel>Status</FieldLabel>
                                <div className="flex flex-wrap gap-2">
                                    {STATUS_OPTIONS.map(opt => (
                                        <label key={opt.value} className="cursor-pointer">
                                            <input type="radio" value={opt.value} {...register('status')} className="sr-only" />
                                            <span className={`
                                                inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all
                                                ${statusValue === opt.value
                                                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent shadow-sm'
                                                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                                                }
                                            `}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${opt.dot}`} />
                                                {opt.value}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                                <FieldError message={errors.status?.message} />
                            </div>

                            {/* Priority chips */}
                            <div>
                                <FieldLabel>Priority</FieldLabel>
                                <PriorityChips register={register} watch={watch} options={PRIORITY_OPTIONS} />
                            </div>

                        </div>
                    </Card>

                    {/* Description & Notes */}
                    <Card>
                        <SectionLabel>Description & Notes</SectionLabel>
                        <div className="space-y-4">
                            <div>
                                <FieldLabel>Description</FieldLabel>
                                <textarea
                                    {...register('description')}
                                    rows={4}
                                    placeholder="Add detailed notes about this task..."
                                    className={`${fieldCls} h-auto py-2.5 resize-none`}
                                />
                            </div>
                            <div>
                                <FieldLabel>Blocked Reason</FieldLabel>
                                <textarea
                                    {...register('blocked_reason')}
                                    rows={2}
                                    placeholder="Reason this task is blocked (if applicable)..."
                                    className={`${fieldCls} h-auto py-2.5 resize-none`}
                                />
                            </div>
                        </div>
                    </Card>

                    {/* Work & Time */}
                    <Card>
                        <SectionLabel>Work & Time</SectionLabel>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <FieldLabel>Estimate (Days)</FieldLabel>
                                <input type="number" step="0.5" {...register('estimate_days')} className={fieldCls} />
                                <FieldError message={errors.estimate_days?.message} />
                            </div>
                            <div>
                                <FieldLabel>Initial Est. (hrs)</FieldLabel>
                                <input type="number" step="0.5" {...register('initial_estimate')} placeholder="0" className={fieldCls} />
                            </div>
                            <div>
                                <FieldLabel>Final Est. (hrs)</FieldLabel>
                                <input type="number" step="0.5" {...register('final_estimate')} placeholder="0" className={fieldCls} />
                            </div>
                            <div>
                                <FieldLabel>R1 Est. (hrs)</FieldLabel>
                                <input type="number" step="0.5" {...register('r1_estimate_hrs')} placeholder="8 hrs/day" className={fieldCls} />
                                <FieldError message={errors.r1_estimate_hrs?.message} />
                            </div>
                            <div>
                                <FieldLabel>R1 Actual (hrs)</FieldLabel>
                                <input type="number" step="0.5" {...register('r1_actual_hrs')} placeholder="0" className={fieldCls} />
                                <FieldError message={errors.r1_actual_hrs?.message} />
                            </div>
                            <div>
                                <FieldLabel>Actual Effort (hrs)</FieldLabel>
                                <input type="number" step="0.5" {...register('actual_effort')} placeholder="0" className={fieldCls} />
                            </div>
                            {resource2Value && (
                                <>
                                    <div>
                                        <FieldLabel>R2 Est. (hrs)</FieldLabel>
                                        <input type="number" step="0.5" {...register('r2_estimate_hrs')} placeholder="0" className={fieldCls} />
                                        <FieldError message={errors.r2_estimate_hrs?.message} />
                                    </div>
                                    <div>
                                        <FieldLabel>R2 Actual (hrs)</FieldLabel>
                                        <input type="number" step="0.5" {...register('r2_actual_hrs')} placeholder="0" className={fieldCls} />
                                        <FieldError message={errors.r2_actual_hrs?.message} />
                                    </div>
                                </>
                            )}
                        </div>
                    </Card>

                </div>

                {/* ── Right column (1/3) ────────────────────────────── */}
                <div className="space-y-5">

                    {/* Assignment */}
                    <Card>
                        <SectionLabel>Assignment</SectionLabel>
                        <div className="space-y-4">
                            <div>
                                <FieldLabel required>Project</FieldLabel>
                                <div className="relative">
                                    <select {...register('project_id')} className={`${fieldCls} appearance-none pr-8`}>
                                        {projects.map(p => (
                                            <option key={p.id} value={p.id}>
                                                {p.project_id} — {p.project_name || 'Unnamed'}
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronIcon />
                                </div>
                                <FieldError message={errors.project_id?.message} />
                            </div>
                            <div>
                                <FieldLabel required>Primary Resource</FieldLabel>
                                <div className="relative">
                                    <select {...register('resource1_uuid')} className={`${fieldCls} appearance-none pr-8`}>
                                        {resource1Options.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                    <ChevronIcon />
                                </div>
                                <FieldError message={errors.resource1_uuid?.message} />
                            </div>
                            <div>
                                <FieldLabel>Secondary Resource</FieldLabel>
                                <div className="relative">
                                    <select {...register('resource2_uuid')} className={`${fieldCls} appearance-none pr-8`}>
                                        {resource2Options.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                    <ChevronIcon />
                                </div>
                            </div>
                        </div>
                    </Card>

                    {/* Dates */}
                    <Card>
                        <SectionLabel>Dates</SectionLabel>
                        <div className="space-y-4">
                            {([
                                { field: 'expected_start_date', label: 'Expected Start', error: errors.expected_start_date?.message },
                                { field: 'actual_start_date',   label: 'Actual Start',   error: errors.actual_start_date?.message },
                                { field: 'deadline',            label: 'Deadline',        error: errors.deadline?.message },
                                { field: 'completed_date',      label: 'Completed',       error: errors.completed_date?.message },
                            ] as const).map(({ field, label, error }) => (
                                <div key={field}>
                                    <FieldLabel>{label}</FieldLabel>
                                    <input
                                        type="date"
                                        {...register(field)}
                                        className={`${fieldCls} [color-scheme:light] dark:[color-scheme:dark]`}
                                    />
                                    <FieldError message={error} />
                                </div>
                            ))}
                        </div>
                    </Card>

                    {/* Links */}
                    <Card>
                        <SectionLabel>Links</SectionLabel>
                        <div>
                            <FieldLabel>Parent User Story</FieldLabel>
                            <input
                                {...register('parent_user_story_id')}
                                placeholder="User story UUID"
                                className={fieldCls}
                            />
                            <FieldError message={errors.parent_user_story_id?.message} />
                        </div>
                    </Card>

                </div>
            </div>

            {/* ── Footer actions ───────────────────────────────────────── */}
            <div className="flex items-center justify-between pt-2 pb-6">
                <Link
                    href={`/work/tasks/${taskId}`}
                    className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                >
                    ← Back to task
                </Link>
                <div className="flex items-center gap-2">
                    <Link
                        href={`/work/tasks/${taskId}`}
                        className="h-9 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center"
                    >
                        Cancel
                    </Link>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="h-9 px-5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold shadow-md shadow-violet-500/25 transition-all flex items-center gap-2"
                    >
                        {isSubmitting && (
                            <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                        )}
                        Save Changes
                    </button>
                </div>
            </div>

        </form>
    );
}

// ── Helper components ──────────────────────────────────────────────────────

function ChevronIcon() {
    return (
        <svg
            width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        >
            <path d="M6 9l6 6 6-6" />
        </svg>
    );
}

function PriorityChips({
    register,
    watch,
    options,
}: {
    register: UseFormRegister<FormData>;
    watch: UseFormWatch<FormData>;
    options: { value: 'High' | 'Medium' | 'Low'; color: string; active: string }[];
}) {
    const priorityValue = watch('priority');
    return (
        <div className="flex flex-wrap gap-2">
            {options.map(opt => (
                <label key={opt.value} className="cursor-pointer">
                    <input type="radio" value={opt.value} {...register('priority')} className="sr-only" />
                    <span className={`
                        inline-flex items-center px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all
                        ${priorityValue === opt.value ? opt.active : `bg-white dark:bg-slate-800 ${opt.color} hover:opacity-80`}
                    `}>
                        {opt.value}
                    </span>
                </label>
            ))}
        </div>
    );
}

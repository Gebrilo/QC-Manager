'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2 } from 'lucide-react';
import { fetchApi } from '@/lib/api';
import { Task, Project, Resource } from '@/types';
import { AttachmentSection } from '@/components/shared/AttachmentSection';
import { useAuth } from '@/components/providers/AuthProvider';
import { Spinner } from '@/components/ui/Spinner';
import {
    buildTaskAssignmentsPayload,
    getTaskAssignmentDefaults,
    type TaskAssignmentFormRow,
} from '@/lib/taskAssignments';
import Link from 'next/link';

// ── Schema ─────────────────────────────────────────────────────────────────

const optionalNumber = (schema: z.ZodNumber) =>
    z.preprocess((value) => {
        if (value === undefined || value === null) return undefined;
        if (typeof value === 'string' && value.trim() === '') return undefined;
        return Number(value);
    }, schema.optional());

const secondaryAssignmentSchema = z.object({
    resource_id: z.string().uuid('Select a resource'),
    estimate_days: optionalNumber(z.number().min(0)),
    actual_days: optionalNumber(z.number().min(0)),
});

const schema = z.object({
    task_id: z.string().optional().default(''),
    project_id: z.string().uuid(),
    task_name: z.string().min(1, 'Required'),
    status: z.enum(['Todo', 'In Progress', 'Blocked', 'Done', 'Canceled']),
    priority: z.enum(['High', 'Medium', 'Low']).optional(),
    description: z.string().optional().default(''),
    team: z.string().optional().default(''),
    blocked_reason: z.string().optional().default(''),
    resource1_uuid: z.string().uuid(),
    initial_estimate: optionalNumber(z.number()),
    final_estimate: optionalNumber(z.number()),
    estimate_days: optionalNumber(z.number().min(0)),
    primary_actual_days: optionalNumber(z.number().min(0)),
    secondary_assignments: z.array(secondaryAssignmentSchema).default([]),
    expected_start_date: z.string().optional().or(z.literal('')),
    actual_start_date: z.string().optional().or(z.literal('')),
    deadline: z.string().optional().or(z.literal('')),
    completed_date: z.string().optional().or(z.literal('')),
    parent_user_story_id: z.string().uuid().optional().or(z.literal('')),
}).superRefine((data, ctx) => {
    const seen = new Set<string>();
    data.secondary_assignments.forEach((assignment, index) => {
        if (!assignment.resource_id) return;
        if (assignment.resource_id === data.resource1_uuid) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Secondary cannot match Primary',
                path: ['secondary_assignments', index, 'resource_id'],
            });
        }
        if (seen.has(assignment.resource_id)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Resource already added',
                path: ['secondary_assignments', index, 'resource_id'],
            });
        }
        seen.add(assignment.resource_id);
    });
});

type FormData = z.infer<typeof schema>;

function normalizePriority(priority?: string): 'High' | 'Medium' | 'Low' {
    if (!priority) return 'Medium';
    const lower = priority.toLowerCase();
    if (lower === 'high') return 'High';
    if (lower === 'low') return 'Low';
    return 'Medium';
}

function getTaskDisplayId(task: Task): string {
    if (task.task_id && !task.task_id.includes('NaN')) return task.task_id;
    if ((task as any).tuleap_artifact_id) return `TSK-${(task as any).tuleap_artifact_id}`;
    return '-';
}

// ── Design primitives ──────────────────────────────────────────────────────

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
    return (
        <label className="block text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 mb-1.5">
            {children}{required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
    );
}

function FieldHint({ children }: { children: React.ReactNode }) {
    return <p className="text-[11px] text-slate-400 mt-1">{children}</p>;
}

function FieldError({ message }: { message?: string }) {
    if (!message) return null;
    return <p className="text-[11px] text-rose-500 mt-1">{message}</p>;
}

const fieldCls =
    'w-full h-10 px-3.5 rounded-lg bg-white/60 dark:bg-slate-900/50 backdrop-blur-md border border-slate-200/60 dark:border-slate-700/60 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all';

const readonlyCls =
    'w-full h-10 px-3.5 rounded-lg bg-slate-50/60 dark:bg-slate-800/40 border border-slate-200/40 dark:border-slate-700/40 text-sm text-slate-500 dark:text-slate-400 cursor-not-allowed';

const textareaCls =
    'w-full px-3.5 py-3 rounded-lg bg-white/60 dark:bg-slate-900/50 backdrop-blur-md border border-slate-200/60 dark:border-slate-700/60 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all resize-y leading-relaxed';

const SelectField = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }>(
    ({ children, ...props }, ref) => (
        <div className="relative">
            <select ref={ref} className={`${fieldCls} appearance-none pr-9`} {...props}>
                {children}
            </select>
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <path d="M6 9l6 6 6-6" />
            </svg>
        </div>
    )
);

// ── Section card ────────────────────────────────────────────────────────────

const ACCENT_MAP: Record<string, string> = {
    violet:  'from-violet-500 to-indigo-600 shadow-violet-500/30',
    indigo:  'from-indigo-500 to-violet-600 shadow-indigo-500/30',
    blue:    'from-blue-500 to-cyan-600 shadow-blue-500/30',
    amber:   'from-amber-500 to-orange-600 shadow-amber-500/30',
    rose:    'from-rose-500 to-pink-600 shadow-rose-500/30',
    emerald: 'from-emerald-500 to-teal-600 shadow-emerald-500/30',
};

function SectionCard({
    id, icon, accent, title, description, columns = 2, children,
}: {
    id: string;
    icon: React.ReactNode;
    accent: string;
    title: string;
    description?: string;
    columns?: 1 | 2;
    children: React.ReactNode;
}) {
    return (
        <section id={id} className="scroll-mt-24">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg bg-gradient-to-br flex items-center justify-center shadow-lg flex-shrink-0 ${ACCENT_MAP[accent] || ACCENT_MAP.violet}`}>
                        <span className="text-white">{icon}</span>
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
                        {description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>}
                    </div>
                </div>
                <div className={`p-6 grid gap-4 ${columns === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    {children}
                </div>
            </div>
        </section>
    );
}

// ── Meta panel ────────────────────────────────────────────────────────────

function MetaCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800">
                <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{title}</div>
            </div>
            <div className="p-5 space-y-3">{children}</div>
        </div>
    );
}

function MetaRow({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
    if (!value) return null;
    return (
        <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
            <span className={`text-xs font-semibold text-slate-700 dark:text-slate-200 truncate ${mono ? 'font-mono' : ''}`}>{value}</span>
        </div>
    );
}

// ── Section nav ─────────────────────────────────────────────────────────────

const SECTIONS = [
    { id: 'task-general',      title: 'General' },
    { id: 'task-description',  title: 'Description' },
    { id: 'task-assignment',   title: 'Assignment' },
    { id: 'task-planning',     title: 'Planning' },
    { id: 'task-dates',        title: 'Dates' },
    { id: 'task-links',        title: 'Links' },
    { id: 'task-attachments',  title: 'Attachments' },
];

function SectionNav({ activeId }: { activeId: string }) {
    const scrollTo = (id: string) => (e: React.MouseEvent) => {
        e.preventDefault();
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    return (
        <nav className="sticky top-4 space-y-1">
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-3 px-3">Form sections</div>
            {SECTIONS.map((s, i) => (
                <a
                    key={s.id}
                    href={`#${s.id}`}
                    onClick={scrollTo(s.id)}
                    className={
                        'block px-3 py-2 rounded-lg text-sm transition-all border-l-2 ' +
                        (activeId === s.id
                            ? 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border-violet-500 font-semibold'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40 border-transparent')
                    }
                >
                    <span className="inline-block w-5 text-[11px] tabular-nums text-slate-400 mr-1">
                        {String(i + 1).padStart(2, '0')}
                    </span>
                    {s.title}
                </a>
            ))}
        </nav>
    );
}

// ── Status / Priority chips ─────────────────────────────────────────────────

const STATUS_OPTIONS: { value: FormData['status']; dot: string }[] = [
    { value: 'Todo',        dot: 'bg-slate-400' },
    { value: 'In Progress', dot: 'bg-blue-500' },
    { value: 'Blocked',     dot: 'bg-rose-500' },
    { value: 'Done',        dot: 'bg-emerald-500' },
    { value: 'Canceled',    dot: 'bg-slate-300' },
];

const PRIORITY_OPTIONS: { value: NonNullable<FormData['priority']>; idle: string; active: string }[] = [
    { value: 'High',   idle: 'text-rose-600 border-rose-200 dark:border-rose-800',   active: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700' },
    { value: 'Medium', idle: 'text-amber-600 border-amber-200 dark:border-amber-800', active: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700' },
    { value: 'Low',    idle: 'text-slate-500 border-slate-200 dark:border-slate-700', active: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600' },
];

const STATUS_TONE: Record<string, string> = {
    'Todo':        'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    'In Progress': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    'Blocked':     'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    'Done':        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    'Canceled':    'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

// ── Icons ───────────────────────────────────────────────────────────────────

const TaskIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
);
const DescriptionIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
);
const AssignmentIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
);
const PlanningIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
    </svg>
);
const CalendarIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
);
const LinkIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
);
const CheckIcon = () => (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <path d="M5 13l4 4L19 7" />
    </svg>
);

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
    const canChangePriority = hasPermission('qc.tasks.change_priority');

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
            canChangePriority={canChangePriority}
        />
    );
}

// ── Edit form ───────────────────────────────────────────────────────────────

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
    canChangePriority,
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
    canChangePriority: boolean;
}) {
    const [activeSection, setActiveSection] = useState('task-general');
    const assignmentDefaults = getTaskAssignmentDefaults(task);

    const { register, handleSubmit, watch, control, formState: { errors, isDirty } } = useForm<FormData>({
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
            resource1_uuid: assignmentDefaults.primaryResourceId,
            initial_estimate: assignmentDefaults.primaryInitialEstimate ?? undefined,
            final_estimate: assignmentDefaults.primaryFinalEstimate ?? undefined,
            estimate_days: assignmentDefaults.primaryEstimateDays,
            primary_actual_days: assignmentDefaults.primaryActualDays,
            secondary_assignments: assignmentDefaults.secondaries,
            expected_start_date: task.expected_start_date ? task.expected_start_date.split('T')[0] : '',
            actual_start_date: task.actual_start_date ? task.actual_start_date.split('T')[0] : '',
            deadline: task.deadline ? task.deadline.split('T')[0] : '',
            completed_date: task.completed_date ? task.completed_date.split('T')[0] : '',
            parent_user_story_id: task.parent_user_story_id || '',
        },
    });
    const { fields: secondaryFields, append: appendSecondary, remove: removeSecondary } = useFieldArray({
        control,
        name: 'secondary_assignments',
    });

    useEffect(() => {
        const container = document.querySelector('main');
        if (!container) return;
        const handler = () => {
            let current = SECTIONS[0].id;
            for (const s of SECTIONS) {
                const el = document.getElementById(s.id);
                if (el && el.getBoundingClientRect().top < 120) current = s.id;
            }
            setActiveSection(current);
        };
        container.addEventListener('scroll', handler, { passive: true });
        handler();
        return () => container.removeEventListener('scroll', handler);
    }, []);

    const statusValue = watch('status');
    const priorityValue = watch('priority');
    const resource1Value = watch('resource1_uuid');
    const secondaryValues = watch('secondary_assignments') || [];

    const onSubmit = async (data: FormData) => {
        setIsSubmitting(true);
        setError(null);
        try {
            const { assignments, legacy } = buildTaskAssignmentsPayload({
                primaryResourceId: data.resource1_uuid,
                primaryEstimateDays: data.estimate_days,
                primaryActualDays: data.primary_actual_days,
                primaryInitialEstimate: data.initial_estimate,
                primaryFinalEstimate: data.final_estimate,
                secondaryAssignments: data.secondary_assignments as TaskAssignmentFormRow[],
            });
            const payload = {
                project_id: data.project_id,
                task_name: data.task_name,
                status: data.status,
                priority: data.priority,
                description: data.description,
                team: data.team,
                blocked_reason: data.blocked_reason,
                resource1_uuid: legacy.resource1_uuid,
                resource2_uuid: legacy.resource2_uuid,
                expected_start_date: data.expected_start_date || undefined,
                actual_start_date: data.actual_start_date || undefined,
                deadline: data.deadline || undefined,
                completed_date: data.completed_date || undefined,
                estimate_days: legacy.estimate_days,
                r1_estimate_hrs: legacy.r1_estimate_hrs,
                r1_actual_hrs: legacy.r1_actual_hrs,
                r2_estimate_hrs: legacy.r2_estimate_hrs,
                r2_actual_hrs: legacy.r2_actual_hrs,
                initial_estimate: data.initial_estimate ?? undefined,
                final_estimate: data.final_estimate ?? undefined,
                actual_effort: legacy.actual_effort,
                assignments,
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
    const resourceLabel = (resourceId: string) => {
        const resource = activeResources.find(r => r.id === resourceId);
        return resource?.resource_name || resource?.name || 'Selected resource';
    };
    const secondaryOptionsFor = (currentValue?: string) => {
        const selected = new Set(
            secondaryValues
                .map(row => row?.resource_id)
                .filter((resourceId): resourceId is string => Boolean(resourceId))
        );
        if (currentValue) selected.delete(currentValue);

        return activeResources
            .filter(r => r.id !== resource1Value && !selected.has(r.id))
            .map(r => ({
                value: r.id,
                label: `${r.resource_name || r.name || 'Unnamed'}${r.utilization_pct != null ? ` · ${Number(r.utilization_pct).toFixed(0)}% util` : ''}`,
            }));
    };

    const projectName = projects.find(p => p.id === task.project_id)?.project_name;
    const r1Name = activeResources.find(r => r.id === resource1Value)?.resource_name;
    const taskDisplayId = getTaskDisplayId(task);
    const deadlineDisplay = task.deadline ? new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined;
    const createdAt = (task as any).created_at ? new Date((task as any).created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined;
    const updatedAt = (task as any).updated_at ? new Date((task as any).updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined;

    const SaveButton = ({ size }: { size?: 'sm' }) => (
        <button
            type="submit"
            disabled={isSubmitting}
            className={`rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold shadow-md shadow-violet-500/25 transition-all flex items-center gap-2 ${size === 'sm' ? 'h-9 px-4 text-sm' : 'h-9 px-5 text-sm'}`}
        >
            {isSubmitting ? (
                <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
            ) : <CheckIcon />}
            {isSubmitting ? 'Saving…' : 'Save Changes'}
        </button>
    );

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="max-w-[1400px] mx-auto px-6 py-6">

            {/* ── Header ──────────────────────────────────────────────── */}
            <div className="flex items-start justify-between mb-6 gap-6">
                <div className="flex items-start gap-3 min-w-0">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="mt-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors flex-shrink-0"
                        title="Back"
                    >
                        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                            <path d="M15 18l-6-6 6-6" />
                        </svg>
                    </button>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                            <Link href="/work/tasks" className="hover:text-violet-600 transition-colors">Tasks</Link>
                            <span className="text-slate-300 dark:text-slate-600">/</span>
                            <span className="font-mono font-semibold text-violet-600 dark:text-violet-300">{taskDisplayId}</span>
                            <span className="text-slate-300 dark:text-slate-600">/</span>
                            <span className="text-slate-500 dark:text-slate-300 font-medium">Edit</span>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight truncate max-w-[680px]" dir="auto">
                                {task.task_name}
                            </h1>
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase ${STATUS_TONE[statusValue] || STATUS_TONE['Todo']}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_OPTIONS.find(s => s.value === statusValue)?.dot || 'bg-slate-400'}`} />
                                {statusValue}
                            </span>
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
                            Update fields and click Save to persist changes.
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
                    <SaveButton />
                </div>
            </div>

            {/* Error banner */}
            {error && (
                <div className="flex items-center gap-3 px-4 py-3 mb-5 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-sm text-rose-700 dark:text-rose-300">
                    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="flex-shrink-0">
                        <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
                    </svg>
                    {error}
                </div>
            )}

            {/* ── 3-column grid: nav | form | meta ────────────────────── */}
            <div className="grid grid-cols-12 gap-6 items-start">

                {/* Section nav */}
                <aside className="col-span-2 hidden lg:block">
                    <SectionNav activeId={activeSection} />
                </aside>

                {/* Main form */}
                <div className="col-span-12 lg:col-span-7 space-y-5">

                    {/* General */}
                    <SectionCard
                        id="task-general"
                        icon={<TaskIcon />}
                        accent="violet"
                        title="General"
                        description="Task identity, status, and priority."
                    >
                        <div className="col-span-2">
                            <FieldLabel required>Task Name</FieldLabel>
                            <input
                                {...register('task_name')}
                                placeholder="e.g. Implement Authorization Logic"
                                className={fieldCls}
                            />
                            <FieldError message={errors.task_name?.message} />
                        </div>

                        <div>
                            <FieldLabel>Task ID</FieldLabel>
                            <input value={taskDisplayId} readOnly disabled className={readonlyCls} />
                            <FieldHint>Read-only identifier.</FieldHint>
                        </div>

                        <div>
                            <FieldLabel>Team</FieldLabel>
                            <input {...register('team')} placeholder="e.g. QA-Team" className={fieldCls} />
                        </div>

                        <div className="col-span-2">
                            <FieldLabel>Status</FieldLabel>
                            <div className="flex flex-wrap gap-2 mt-0.5">
                                {STATUS_OPTIONS.map(opt => (
                                    <label key={opt.value} className="cursor-pointer">
                                        <input type="radio" value={opt.value} {...register('status')} className="sr-only" />
                                        <span className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${statusValue === opt.value
                                            ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent shadow-sm'
                                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                                        }`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${opt.dot}`} />
                                            {opt.value}
                                        </span>
                                    </label>
                                ))}
                            </div>
                            <FieldError message={errors.status?.message} />
                        </div>

                        <div className="col-span-2">
                            <FieldLabel>Priority</FieldLabel>
                            <div className="flex flex-wrap gap-2 mt-0.5">
                                {PRIORITY_OPTIONS.map(opt => (
                                    canChangePriority ? (
                                        <label key={opt.value} className="cursor-pointer">
                                            <input type="radio" value={opt.value} {...register('priority')} className="sr-only" />
                                            <span className={`inline-flex items-center px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${priorityValue === opt.value
                                                ? opt.active
                                                : `bg-white dark:bg-slate-800 ${opt.idle} hover:opacity-80`
                                            }`}>
                                                {opt.value}
                                            </span>
                                        </label>
                                    ) : (
                                        <span key={opt.value} className={`inline-flex items-center px-3.5 py-1.5 rounded-full text-xs font-semibold border ${priorityValue === opt.value
                                            ? opt.active
                                            : `bg-white dark:bg-slate-800 ${opt.idle} opacity-50`
                                        }`}>
                                            {opt.value}
                                        </span>
                                    )
                                ))}
                            </div>
                        </div>
                    </SectionCard>

                    {/* Description */}
                    <SectionCard
                        id="task-description"
                        icon={<DescriptionIcon />}
                        accent="indigo"
                        title="Description"
                        description="Detailed notes and blocked reason."
                        columns={1}
                    >
                        <div>
                            <FieldLabel>Description</FieldLabel>
                            <textarea
                                {...register('description')}
                                rows={5}
                                placeholder="Add detailed notes about this task..."
                                className={textareaCls}
                            />
                        </div>
                        <div>
                            <FieldLabel>Blocked Reason</FieldLabel>
                            <textarea
                                {...register('blocked_reason')}
                                rows={3}
                                placeholder="Reason this task is blocked (if applicable)..."
                                className={textareaCls}
                            />
                        </div>
                    </SectionCard>

                    {/* Assignment */}
                    <SectionCard
                        id="task-assignment"
                        icon={<AssignmentIcon />}
                        accent="blue"
                        title="Assignment"
                        description="Project and resource allocation."
                    >
                        <div className="col-span-2">
                            <FieldLabel required>Project</FieldLabel>
                            <SelectField {...register('project_id')}>
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>
                                        {p.project_id} — {p.project_name || 'Unnamed'}
                                    </option>
                                ))}
                            </SelectField>
                            <FieldError message={errors.project_id?.message} />
                        </div>

                        <div>
                            <FieldLabel required>Primary Resource</FieldLabel>
                            <SelectField {...register('resource1_uuid')}>
                                {resource1Options.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </SelectField>
                            <FieldError message={errors.resource1_uuid?.message} />
                        </div>

                        <div className="col-span-2 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                                <FieldLabel>Secondary Resources</FieldLabel>
                                <button
                                    type="button"
                                    onClick={() => appendSecondary({ resource_id: '', estimate_days: undefined, actual_days: 0 })}
                                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                    Add Secondary
                                </button>
                            </div>
                            {secondaryFields.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                                    No secondary resources
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {secondaryFields.map((field, index) => {
                                        const currentValue = secondaryValues[index]?.resource_id || '';
                                        const currentIsPrimary = currentValue !== '' && currentValue === resource1Value;
                                        return (
                                            <div key={field.id} className="grid grid-cols-12 gap-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                                                <div className="col-span-12 md:col-span-6">
                                                    <FieldLabel>Resource</FieldLabel>
                                                    <SelectField {...register(`secondary_assignments.${index}.resource_id`)}>
                                                        <option value="">— Select resource —</option>
                                                        {currentIsPrimary && (
                                                            <option value={currentValue}>{resourceLabel(currentValue)} — already Primary</option>
                                                        )}
                                                        {secondaryOptionsFor(currentValue).map(opt => (
                                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                        ))}
                                                    </SelectField>
                                                    <FieldError message={errors.secondary_assignments?.[index]?.resource_id?.message} />
                                                </div>
                                                <div className="col-span-6 md:col-span-2">
                                                    <FieldLabel>Est. Days</FieldLabel>
                                                    <input
                                                        type="number"
                                                        step="0.25"
                                                        min="0"
                                                        {...register(`secondary_assignments.${index}.estimate_days`)}
                                                        className={fieldCls}
                                                    />
                                                    <FieldError message={errors.secondary_assignments?.[index]?.estimate_days?.message} />
                                                </div>
                                                <div className="col-span-6 md:col-span-2">
                                                    <FieldLabel>Actual Days</FieldLabel>
                                                    <input
                                                        type="number"
                                                        step="0.25"
                                                        min="0"
                                                        {...register(`secondary_assignments.${index}.actual_days`)}
                                                        className={fieldCls}
                                                    />
                                                    <FieldError message={errors.secondary_assignments?.[index]?.actual_days?.message} />
                                                </div>
                                                <div className="col-span-12 md:col-span-2 flex items-end justify-end">
                                                    <button
                                                        type="button"
                                                        onClick={() => removeSecondary(index)}
                                                        aria-label="Remove secondary resource"
                                                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-rose-900/20"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </SectionCard>

                    {/* Planning */}
                    <SectionCard
                        id="task-planning"
                        icon={<PlanningIcon />}
                        accent="amber"
                        title="Planning"
                        description="Estimates and actual effort tracking."
                    >
                        <div>
                            <FieldLabel>Primary Est. Days</FieldLabel>
                            <input type="number" step="0.25" min="0" {...register('estimate_days')} className={fieldCls} />
                            <FieldError message={errors.estimate_days?.message} />
                        </div>
                        <div>
                            <FieldLabel>Primary Actual Days</FieldLabel>
                            <input type="number" step="0.25" min="0" {...register('primary_actual_days')} placeholder="0" className={fieldCls} />
                            <FieldError message={errors.primary_actual_days?.message} />
                        </div>
                        <div>
                            <FieldLabel>Primary Initial Estimate</FieldLabel>
                            <input type="number" step="0.5" {...register('initial_estimate')} placeholder="0" className={fieldCls} />
                            <FieldError message={errors.initial_estimate?.message} />
                        </div>
                        <div>
                            <FieldLabel>Primary Final Estimate</FieldLabel>
                            <input type="number" step="0.5" {...register('final_estimate')} placeholder="0" className={fieldCls} />
                            <FieldError message={errors.final_estimate?.message} />
                        </div>
                    </SectionCard>

                    {/* Dates */}
                    <SectionCard
                        id="task-dates"
                        icon={<CalendarIcon />}
                        accent="rose"
                        title="Dates"
                        description="Schedule and completion tracking."
                    >
                        <div>
                            <FieldLabel>Expected Start</FieldLabel>
                            <input type="date" {...register('expected_start_date')} className={`${fieldCls} [color-scheme:light] dark:[color-scheme:dark]`} />
                            <FieldError message={errors.expected_start_date?.message} />
                        </div>
                        <div>
                            <FieldLabel>Actual Start</FieldLabel>
                            <input type="date" {...register('actual_start_date')} className={`${fieldCls} [color-scheme:light] dark:[color-scheme:dark]`} />
                            <FieldError message={errors.actual_start_date?.message} />
                        </div>
                        <div>
                            <FieldLabel>Deadline</FieldLabel>
                            <input type="date" {...register('deadline')} className={`${fieldCls} [color-scheme:light] dark:[color-scheme:dark]`} />
                            <FieldError message={errors.deadline?.message} />
                        </div>
                        <div>
                            <FieldLabel>Completed Date</FieldLabel>
                            <input type="date" {...register('completed_date')} className={`${fieldCls} [color-scheme:light] dark:[color-scheme:dark]`} />
                            <FieldError message={errors.completed_date?.message} />
                        </div>
                    </SectionCard>

                    {/* Links */}
                    <SectionCard
                        id="task-links"
                        icon={<LinkIcon />}
                        accent="emerald"
                        title="Links"
                        description="Parent user story relationship."
                        columns={1}
                    >
                        <div>
                            <FieldLabel>Parent User Story</FieldLabel>
                            <input
                                {...register('parent_user_story_id')}
                                placeholder="User story UUID"
                                className={fieldCls}
                            />
                            <FieldError message={errors.parent_user_story_id?.message} />
                        </div>
                    </SectionCard>

                    <AttachmentSection
                        id="task-attachments"
                        artifactType="task"
                        artifactId={taskId}
                        tempId={null}
                    />

                </div>

                {/* Meta sidebar */}
                <aside className="col-span-12 lg:col-span-3">
                    <div className="lg:sticky lg:top-4 space-y-5">
                        <MetaCard title="At a glance">
                            <MetaRow label="Task ID" value={taskDisplayId} mono />
                            <MetaRow label="Project" value={projectName} />
                            <MetaRow label="Primary Resource" value={r1Name} />
                            <MetaRow label="Deadline" value={deadlineDisplay} />
                            <MetaRow label="Created" value={createdAt} />
                            <MetaRow label="Updated" value={updatedAt} />
                        </MetaCard>
                    </div>
                </aside>

            </div>

            {/* ── Sticky action bar ────────────────────────────────────── */}
            <div className="sticky bottom-4 mt-6 z-10">
                <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl px-4 py-3 flex items-center justify-between shadow-xl border border-slate-200/60 dark:border-slate-700/60">
                    <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
                        </svg>
                        <span>{isDirty ? 'You have unsaved changes' : 'No unsaved changes'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link
                            href={`/work/tasks/${taskId}`}
                            className="h-9 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center"
                        >
                            Cancel
                        </Link>
                        <SaveButton size="sm" />
                    </div>
                </div>
            </div>

        </form>
    );
}

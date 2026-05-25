'use client';

import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { tuleapApi, bugsApi, projectsApi, type Project } from '@/lib/api';
import { stripHtml } from '@/lib/stripHtml';
import { useTuleapResources } from '@/hooks/useTuleapResources';
import { AttachmentSection } from '@/components/shared/AttachmentSection';
import type { Bug } from '@/lib/api';

const bugSchema = z.object({
    title: z.string().min(1, 'Bug title is required'),
    description: z.string().optional().default(''),
    steps_to_reproduce: z.string().optional().default(''),
    status: z.enum(['New', 'In Progress', 'Assigned', 'Verified', 'Reopened', 'Fixed', 'Blocked', 'Duplicate', 'Closed']).optional().default('New'),
    assigned_to: z.string().optional().default(''),
    severity: z.enum(['None', 'Cosmetic impact', 'Minor Impact', 'Major impact', 'Critical Impact']).optional().default('None'),
    close_date: z.string().optional().default(''),
    service_name: z.string().optional().default(''),
    environment: z.enum(['DEV', 'TEST', 'PROD', 'STAGING']).optional().default('DEV'),
    cc: z.string().optional().default(''),
    dev_fix_description: z.string().optional().default(''),
    qc_verification_notes: z.string().optional().default(''),
    initial_effort: z.coerce.number().nullable().optional(),
    remaining_effort: z.coerce.number().nullable().optional(),
    linked_test_case_ids: z.string().optional().default(''),
});

type FormData = z.infer<typeof bugSchema>;

interface BugFormProps {
    initialData?: Record<string, unknown>;
    bug?: Bug;
    isEdit?: boolean;
    artifactId?: string;
    bugUUID?: string;
    projectId?: string;
}

// ── Section scroll tracker ──────────────────────────────────────────────────

function useSectionNav(sectionIds: string[]) {
    const [activeId, setActiveId] = useState(sectionIds[0]);

    useEffect(() => {
        const main = document.querySelector('main');
        if (!main) return;
        const handler = () => {
            let current = sectionIds[0];
            for (const id of sectionIds) {
                const el = document.getElementById(id);
                if (el && el.getBoundingClientRect().top < 120) current = id;
            }
            setActiveId(current);
        };
        main.addEventListener('scroll', handler, { passive: true });
        handler();
        return () => main.removeEventListener('scroll', handler);
    }, [sectionIds]);

    const scrollTo = (id: string) => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return { activeId, scrollTo };
}

// ── Field primitives ─────────────────────────────────────────────────────────

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

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    prefix?: string;
    fieldRef?: React.Ref<HTMLInputElement>;
}

function EFInput({ prefix, fieldRef, className, ...props }: InputProps) {
    return (
        <div className="relative">
            {prefix && (
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-mono pointer-events-none">{prefix}</div>
            )}
            <input
                ref={fieldRef}
                className={[
                    'w-full h-10 rounded-lg bg-white/60 dark:bg-slate-900/50 backdrop-blur-md border text-sm',
                    'text-slate-800 dark:text-slate-100 placeholder:text-slate-400',
                    'focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all',
                    props.readOnly
                        ? 'border-slate-200/40 dark:border-slate-700/40 text-slate-500 dark:text-slate-400 bg-slate-50/60 dark:bg-slate-900/30 cursor-not-allowed'
                        : 'border-slate-200/60 dark:border-slate-700/60',
                    prefix ? 'pl-9' : 'pl-3.5',
                    'pr-3.5',
                    className || '',
                ].join(' ')}
                {...props}
            />
        </div>
    );
}

function EFSelect({ children, className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <div className="relative">
            <select
                className={[
                    'w-full h-10 pl-3.5 pr-9 rounded-lg bg-white/60 dark:bg-slate-900/50 backdrop-blur-md',
                    'border border-slate-200/60 dark:border-slate-700/60 text-sm text-slate-800 dark:text-slate-100',
                    'focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all',
                    'appearance-none cursor-pointer',
                    className || '',
                ].join(' ')}
                {...props}
            >
                {children}
            </select>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <path d="M6 9l6 6 6-6" />
            </svg>
        </div>
    );
}

function EFTextarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return (
        <textarea
            className={[
                'w-full px-3.5 py-3 rounded-lg bg-white/60 dark:bg-slate-900/50 backdrop-blur-md',
                'border border-slate-200/60 dark:border-slate-700/60 text-sm text-slate-800 dark:text-slate-100',
                'placeholder:text-slate-400 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20',
                'transition-all resize-y leading-relaxed',
                className || '',
            ].join(' ')}
            {...props}
        />
    );
}

// ── Section card ─────────────────────────────────────────────────────────────

const ACCENT_GRADIENT: Record<string, string> = {
    rose: 'from-rose-500 to-pink-600 shadow-rose-500/30',
    indigo: 'from-indigo-500 to-violet-600 shadow-indigo-500/30',
    amber: 'from-amber-500 to-orange-600 shadow-amber-500/30',
    blue: 'from-blue-500 to-cyan-600 shadow-blue-500/30',
    violet: 'from-violet-500 to-indigo-600 shadow-violet-500/30',
};

function SectionCard({
    id,
    icon,
    title,
    description,
    accent,
    columns = 2,
    children,
}: {
    id: string;
    icon: React.ReactNode;
    title: string;
    description?: string;
    accent: string;
    columns?: 1 | 2;
    children: React.ReactNode;
}) {
    const gradient = ACCENT_GRADIENT[accent] || ACCENT_GRADIENT.violet;
    return (
        <section id={id} className="scroll-mt-24">
            <div className="glass-card rounded-2xl p-0 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg flex-shrink-0`}>
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

function Field({
    label,
    required,
    full,
    hint,
    error,
    children,
}: {
    label: string;
    required?: boolean;
    full?: boolean;
    hint?: string;
    error?: string;
    children: React.ReactNode;
}) {
    return (
        <div className={full ? 'col-span-2' : ''}>
            <FieldLabel required={required}>{label}</FieldLabel>
            {children}
            {hint && <FieldHint>{hint}</FieldHint>}
            {error && <FieldError message={error} />}
        </div>
    );
}

// ── Meta panel ────────────────────────────────────────────────────────────────

function MetaCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="glass-card rounded-2xl p-0 overflow-hidden">
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

// ── Status pill ───────────────────────────────────────────────────────────────

const STATUS_TONE: Record<string, string> = {
    New: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    'In Progress': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    Assigned: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
    Verified: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    Reopened: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    Fixed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    Blocked: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    Duplicate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    Closed: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

const STATUS_DOT: Record<string, string> = {
    New: 'bg-blue-500',
    'In Progress': 'bg-amber-500',
    Assigned: 'bg-violet-500',
    Verified: 'bg-emerald-500',
    Fixed: 'bg-emerald-500',
    Blocked: 'bg-rose-500',
    Reopened: 'bg-amber-500',
    Duplicate: 'bg-slate-400',
    Closed: 'bg-slate-400',
};

// ── Icons ────────────────────────────────────────────────────────────────────

const BugIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="8" y="6" width="8" height="14" rx="4" />
        <path d="M8 10H4M20 10h-4M8 14H4M20 14h-4M8 18H5M19 18h-3M12 2v4M10 4l2-2 2 2" />
    </svg>
);

const DescribeIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
);

const ProgressIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 12a9 9 0 1 0 9-9M3 12a9 9 0 0 1 9-9M3 12h9M12 3v9" />
    </svg>
);

const LinkIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
);

const BackIcon = () => (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
        <path d="M15 18l-6-6 6-6" />
    </svg>
);

const CheckIcon = () => (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <path d="M5 13l4 4L19 7" />
    </svg>
);

const InfoIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4M12 16h.01" />
    </svg>
);

// ── Section nav ───────────────────────────────────────────────────────────────

const SECTIONS = [
    { id: 'bug-general',      title: 'General' },
    { id: 'bug-description',  title: 'Description' },
    { id: 'bug-progress',     title: 'Progress' },
    { id: 'bug-references',   title: 'References' },
    { id: 'bug-attachments',  title: 'Attachments' },
];

function SectionNav({ activeId, onScrollTo }: { activeId: string; onScrollTo: (id: string) => void }) {
    return (
        <nav className="sticky top-4 space-y-1">
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-3 px-3">Form sections</div>
            {SECTIONS.map((s, i) => (
                <button
                    key={s.id}
                    type="button"
                    onClick={() => onScrollTo(s.id)}
                    className={[
                        'w-full text-left px-3 py-2 rounded-lg text-sm transition-all border-l-2',
                        activeId === s.id
                            ? 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border-violet-500 font-semibold'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40 border-transparent',
                    ].join(' ')}
                >
                    <span className="inline-block w-5 text-[11px] tabular-nums text-slate-400 mr-1">
                        {String(i + 1).padStart(2, '0')}
                    </span>
                    {s.title}
                </button>
            ))}
        </nav>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export function BugForm({ initialData, bug, isEdit, artifactId, bugUUID, projectId: initialProjectId }: BugFormProps) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<string>(initialProjectId || '');
    const { resources: tuleapResources, loaded: tuleapLoaded } = useTuleapResources();
    const { activeId, scrollTo } = useSectionNav(SECTIONS.map(s => s.id));
    const [tempId] = useState(() => (typeof crypto !== 'undefined' ? crypto.randomUUID() : `tmp-${Date.now()}`));

    useEffect(() => {
        projectsApi.list().then(setProjects).catch(() => {});
    }, []);

    const { register, handleSubmit, watch, formState: { errors, isDirty } } = useForm<FormData>({
        resolver: zodResolver(bugSchema) as any,
        defaultValues: {
            title: stripHtml((initialData?.title as string) || (initialData?.bugTitle as string)),
            description: stripHtml(initialData?.description as string),
            steps_to_reproduce: stripHtml((initialData?.steps_to_reproduce as string) || (initialData?.stepsToReproduce as string)),
            status: (initialData?.status as any) || 'New',
            assigned_to: (initialData?.assigned_to as string) || '',
            severity: (initialData?.severity as any) || 'None',
            close_date: (initialData?.close_date as string) || '',
            service_name: (initialData?.service_name as string) || (initialData?.serviceName as string) || '',
            environment: (initialData?.environment as any) || 'DEV',
            cc: Array.isArray(initialData?.cc) ? (initialData.cc as string[]).join(', ') : ((initialData?.cc as string) || ''),
            dev_fix_description: stripHtml(initialData?.dev_fix_description as string),
            qc_verification_notes: stripHtml(initialData?.qc_verification_notes as string),
            initial_effort: initialData?.initial_effort != null ? Number(initialData.initial_effort) : null,
            remaining_effort: initialData?.remaining_effort != null ? Number(initialData.remaining_effort) : null,
            linked_test_case_ids: Array.isArray(initialData?.linked_test_case_ids)
                ? (initialData.linked_test_case_ids as string[]).join(', ')
                : ((initialData?.linked_test_case_ids as string) || ''),
        },
    });

    const currentStatus = watch('status') || (initialData?.status as string) || 'New';

    const [showSyncToast, setShowSyncToast] = useState<string | null>(null);

    const onSubmit = async (data: FormData) => {
        setIsSubmitting(true);
        setError(null);
        try {
            if (!selectedProjectId) {
                setError('Please select a project before saving.');
                setIsSubmitting(false);
                return;
            }
            const payload = {
                title: data.title,
                description: data.description || undefined,
                status: data.status,
                severity: data.severity,
                priority: data.severity,
                assigned_to: data.assigned_to || null,
                project_id: selectedProjectId,
                environment: data.environment,
                service_name: data.service_name || undefined,
                steps_to_reproduce: data.steps_to_reproduce || undefined,
                dev_fix_description: data.dev_fix_description || undefined,
                qc_verification_notes: data.qc_verification_notes || undefined,
                close_date: data.close_date || null,
                cc: data.cc ? data.cc.split(',').map(s => s.trim()).filter(Boolean) : undefined,
                linked_test_case_ids: data.linked_test_case_ids
                    ? data.linked_test_case_ids.split(',').map(s => s.trim()).filter(Boolean)
                    : [],
                initial_effort: data.initial_effort ?? null,
                remaining_effort: data.remaining_effort ?? null,
                temp_id: tempId,
            };

            if (isEdit && artifactId) {
                await tuleapApi.updateUnified(artifactId, {
                    artifact_type: 'bug' as const,
                    project_id: selectedProjectId,
                    common: { title: data.title, description: data.description, status: data.status, assigned_to: data.assigned_to || null, priority: data.severity },
                    fields: { severity: data.severity, environment: data.environment, service_name: data.service_name, steps_to_reproduce: data.steps_to_reproduce, dev_fix_description: data.dev_fix_description, qc_verification_notes: data.qc_verification_notes, close_date: data.close_date || null, cc: data.cc ? data.cc.split(',').map(s => s.trim()).filter(Boolean) : undefined, linked_test_case_ids: data.linked_test_case_ids ? data.linked_test_case_ids.split(',').map(s => s.trim()).filter(Boolean) : undefined, initial_effort: data.initial_effort ?? null, remaining_effort: data.remaining_effort ?? null },
                });
                router.push(`/work/bugs/${bugUUID || artifactId}`);
            } else {
                const result = await bugsApi.create(payload);
                const bugData = result.data;
                if (bugData?.sync_status === 'failed') {
                    setShowSyncToast(bugData.last_sync_error || 'Tuleap sync failed. You can retry from the artifact detail page.');
                }
                const targetId = bugData?.id;
                if (showSyncToast) {
                    setTimeout(() => router.push(targetId ? `/work/bugs/${targetId}` : '/work/bugs'), 3000);
                } else {
                    router.push(targetId ? `/work/bugs/${targetId}` : '/work/bugs');
                }
            }
            router.refresh();
        } catch (err: any) {
            setError(err.message || 'Failed to save bug');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCancel = () => {
        if (isEdit && bugUUID) {
            router.push(`/work/bugs/${bugUUID}`);
        } else {
            router.push('/work/bugs');
        }
    };

    const displayId = bug?.bug_id || (bugUUID ? `#${bugUUID.slice(0, 8)}` : 'New');
    const displayTitle = bug?.title || (initialData?.title as string) || 'New Bug';
    const projectName = bug?.project_name || projects.find(p => p.id === selectedProjectId)?.project_name;
    const reporter = bug?.reported_by;
    const createdAt = bug?.created_at ? new Date(bug.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined;
    const updatedAt = bug?.updated_at ? new Date(bug.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined;

    const SaveButton = ({ size }: { size?: 'sm' | 'default' }) => (
        <Button
            type="submit"
            variant="primary"
            size={size}
            disabled={isSubmitting}
            className="gap-1.5"
        >
            {isSubmitting ? (
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
            ) : <CheckIcon />}
            {isSubmitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Bug'}
        </Button>
    );

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="max-w-[1400px] mx-auto px-6 py-6">
            {showSyncToast && (
                <div className="mb-4 flex items-start gap-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 p-4">
                    <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <div>
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Saved locally. Tuleap sync failed.</p>
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">{showSyncToast}</p>
                    </div>
                </div>
            )}
            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="flex items-start justify-between mb-6 gap-6">
                <div className="flex items-start gap-3 min-w-0">
                    <button
                        type="button"
                        onClick={handleCancel}
                        className="mt-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors flex-shrink-0"
                        title="Back"
                    >
                        <BackIcon />
                    </button>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                            <span>Bugs</span>
                            <span className="text-slate-300 dark:text-slate-600">/</span>
                            <span className="font-mono font-semibold text-violet-600 dark:text-violet-300">{displayId}</span>
                            {isEdit && (
                                <>
                                    <span className="text-slate-300 dark:text-slate-600">/</span>
                                    <span className="text-slate-500 dark:text-slate-300 font-medium">Edit</span>
                                </>
                            )}
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1
                                className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight truncate max-w-[680px]"
                                dir="auto"
                            >
                                {displayTitle}
                            </h1>
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase ${STATUS_TONE[currentStatus] || STATUS_TONE.New}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[currentStatus] || 'bg-blue-500'}`} />
                                {currentStatus}
                            </span>
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
                            {isEdit ? 'Update fields and click Save to persist changes.' : 'Fill in the fields below to create a new bug.'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <Button type="button" variant="secondary" onClick={handleCancel}>Cancel</Button>
                    <SaveButton />
                </div>
            </div>

            <ErrorBanner message={error} />

            {/* ── 3-column grid ──────────────────────────────────────────── */}
            <div className="grid grid-cols-12 gap-6 items-start">
                {/* Left: section nav */}
                <aside className="col-span-2 hidden lg:block">
                    <SectionNav activeId={activeId} onScrollTo={scrollTo} />
                </aside>

                {/* Center: form sections */}
                <div className="col-span-12 lg:col-span-7 space-y-5">

                    {/* ── General ─────────────────────────────────────────── */}
                    <SectionCard
                        id="bug-general"
                        icon={<BugIcon />}
                        accent="rose"
                        title="General"
                        description="Project, ownership, and severity routing."
                    >
                        <Field label="Project" required error={!selectedProjectId && error ? 'Required' : undefined}>
                            <EFSelect
                                value={selectedProjectId}
                                onChange={e => setSelectedProjectId(e.target.value)}
                                disabled={isEdit}
                            >
                                <option value="">Select a project…</option>
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>
                                        {p.project_name} ({p.project_id})
                                    </option>
                                ))}
                            </EFSelect>
                        </Field>

                        <Field label="Assigned to">
                            <EFSelect {...register('assigned_to')}>
                                <option value="">— Unassigned —</option>
                                {tuleapResources.map(r => (
                                    <option key={r.id} value={r.tuleap_username}>
                                        {r.resource_name} ({r.tuleap_username})
                                    </option>
                                ))}
                            </EFSelect>
                            {tuleapLoaded && tuleapResources.length === 0 && (
                                <FieldHint>
                                    No Tuleap-mapped resources.{' '}
                                    <a href="/team/resources" className="text-violet-600 dark:text-violet-400 underline font-medium">
                                        Add resources →
                                    </a>
                                </FieldHint>
                            )}
                        </Field>

                        <Field label="Status" error={errors.status?.message}>
                            <EFSelect {...register('status')}>
                                <option>New</option>
                                <option>In Progress</option>
                                <option>Assigned</option>
                                <option>Verified</option>
                                <option>Reopened</option>
                                <option>Fixed</option>
                                <option>Blocked</option>
                                <option>Duplicate</option>
                                <option>Closed</option>
                            </EFSelect>
                        </Field>

                        <Field label="Severity" error={errors.severity?.message}>
                            <EFSelect {...register('severity')}>
                                <option>None</option>
                                <option>Cosmetic impact</option>
                                <option>Minor Impact</option>
                                <option>Major impact</option>
                                <option>Critical Impact</option>
                            </EFSelect>
                        </Field>

                        <Field label="Close date">
                            <EFInput type="date" {...register('close_date')} />
                        </Field>

                        <Field label="Service name">
                            <EFInput {...register('service_name')} placeholder="e.g. Auth Service" />
                        </Field>
                    </SectionCard>

                    {/* ── Description ─────────────────────────────────────── */}
                    <SectionCard
                        id="bug-description"
                        icon={<DescribeIcon />}
                        accent="indigo"
                        title="Description"
                        description="What's broken, how to reproduce it, and any fixes."
                        columns={1}
                    >
                        <Field label="Bug title" required error={errors.title?.message}>
                            <EFInput {...register('title')} dir="auto" placeholder="e.g. Login page crashes on mobile" />
                        </Field>

                        <Field
                            label="Description + steps to reproduce"
                            hint="Numbered steps recommended"
                        >
                            <EFTextarea
                                {...register('steps_to_reproduce')}
                                rows={7}
                                placeholder="1. Navigate to...&#10;2. Click on...&#10;3. Observe that..."
                            />
                        </Field>

                        <div className="grid grid-cols-2 gap-4">
                            <Field label="Environment" error={errors.environment?.message}>
                                <EFSelect {...register('environment')}>
                                    <option>DEV</option>
                                    <option>TEST</option>
                                    <option>STAGING</option>
                                    <option>PROD</option>
                                </EFSelect>
                            </Field>
                            <Field label="CC (comma-separated emails)">
                                <EFInput {...register('cc')} placeholder="user@example.com, …" />
                            </Field>
                        </div>

                        <Field label="Dev fix description">
                            <EFTextarea
                                {...register('dev_fix_description')}
                                rows={3}
                                placeholder="Developer notes on the fix…"
                            />
                        </Field>

                        <Field label="QC verification notes">
                            <EFTextarea
                                {...register('qc_verification_notes')}
                                rows={3}
                                placeholder="QC verification steps and results…"
                            />
                        </Field>
                    </SectionCard>

                    {/* ── Progress ─────────────────────────────────────────── */}
                    <SectionCard
                        id="bug-progress"
                        icon={<ProgressIcon />}
                        accent="amber"
                        title="Progress"
                        description="Effort tracking from initial estimate to remaining work."
                    >
                        <Field label="Initial effort (hours)">
                            <EFInput type="number" step="0.5" min="0" {...register('initial_effort')} placeholder="0" />
                        </Field>
                        <Field label="Remaining effort (hours)">
                            <EFInput type="number" step="0.5" min="0" {...register('remaining_effort')} placeholder="0" />
                        </Field>
                    </SectionCard>

                    {/* ── References ───────────────────────────────────────── */}
                    <SectionCard
                        id="bug-references"
                        icon={<LinkIcon />}
                        accent="blue"
                        title="References"
                        description="Test cases and other work this bug surfaced from."
                        columns={1}
                    >
                        <Field
                            label="Linked test case IDs"
                            hint="Comma-separated test case IDs"
                        >
                            <EFInput {...register('linked_test_case_ids')} placeholder="T-123, T-456" />
                        </Field>
                    </SectionCard>

                    <AttachmentSection
                        id="bug-attachments"
                        artifactType="bug"
                        artifactId={isEdit ? bugUUID || null : null}
                        tempId={isEdit ? null : tempId}
                    />
                </div>

                {/* Right: meta panel */}
                <aside className="col-span-12 lg:col-span-3 space-y-5">
                    <div className="lg:sticky lg:top-4 space-y-5">
                        <MetaCard title="At a glance">
                            <MetaRow label="Bug ID" value={displayId} mono />
                            <MetaRow label="Project" value={projectName} />
                            <MetaRow label="Severity" value={bug?.severity} />
                            <MetaRow label="Source" value={bug?.source === 'TEST_CASE' ? 'Test Case' : bug?.source === 'EXPLORATORY' ? 'Exploratory' : undefined} />
                            <MetaRow label="Reporter" value={reporter} />
                            <MetaRow label="Created" value={createdAt} />
                            <MetaRow label="Updated" value={updatedAt} />
                            {bug?.tuleap_artifact_id && (
                                <MetaRow label="Tuleap ID" value={`#${bug.tuleap_artifact_id}`} mono />
                            )}
                        </MetaCard>
                    </div>
                </aside>
            </div>

            {/* ── Sticky action bar ─────────────────────────────────────────── */}
            <div className="sticky bottom-4 mt-6 z-10">
                <div className="glass-card rounded-2xl px-4 py-3 flex items-center justify-between shadow-xl">
                    <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                        <InfoIcon />
                        <span>{isDirty ? 'You have unsaved changes' : 'No unsaved changes'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button type="button" variant="secondary" size="sm" onClick={handleCancel}>Cancel</Button>
                        <SaveButton size="sm" />
                    </div>
                </div>
            </div>
        </form>
    );
}

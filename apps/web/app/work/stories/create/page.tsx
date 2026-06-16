'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { tuleapApi, projectsApi, userStoriesApi, type Project } from '@/lib/api';
import { useTuleapResources } from '@/hooks/useTuleapResources';
import { AttachmentSection } from '@/components/shared/AttachmentSection';
import Link from 'next/link';

// ── Schema ─────────────────────────────────────────────────────────────────

const schema = z.object({
    title: z.string().min(1, 'Summary is required'),
    description: z.string().optional().default(''),
    acceptance_criteria: z.string().optional().default(''),
    change_reason: z.string().optional().default(''),
    status: z.enum(['Draft', 'Changes', 'Review', 'Approved']).optional().default('Draft'),
    priority: z.enum(['None', 'P1-Critical', 'P2-High', 'P3-Medium', 'P4-Low']).optional().default('None'),
    requirement_version: z.string().optional().default('1'),
    ba_author: z.string().optional().default(''),
    initial_effort: z.coerce.number().nullable().optional(),
    remaining_effort: z.coerce.number().nullable().optional(),
    assigned_to: z.string().optional().default(''),
});

type FormData = z.infer<typeof schema>;

// ── Design primitives ──────────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden ${className}`}>
            {children}
        </div>
    );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
    return (
        <label className="block text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 mb-1.5">
            {children}
            {required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
    );
}

function FieldHint({ children }: { children: React.ReactNode }) {
    return <div className="text-[11px] text-slate-400 mt-1">{children}</div>;
}

function FieldError({ message }: { message?: string }) {
    if (!message) return null;
    return <p className="text-xs text-rose-500 mt-1.5">{message}</p>;
}

const fieldCls =
    'w-full h-10 px-3.5 rounded-lg bg-white/60 dark:bg-slate-900/50 backdrop-blur-md border border-slate-200/60 dark:border-slate-700/60 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all';

const textareaCls =
    'w-full px-3.5 py-3 rounded-lg bg-white/60 dark:bg-slate-900/50 backdrop-blur-md border border-slate-200/60 dark:border-slate-700/60 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all resize-y leading-relaxed';

const SelectField = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }>(
    function SelectField({ children, ...props }, ref) {
        return (
            <div className="relative">
                <select ref={ref} className={`${fieldCls} appearance-none pr-9`} {...props}>
                    {children}
                </select>
                <svg
                    width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                >
                    <path d="M6 9l6 6 6-6" />
                </svg>
            </div>
        );
    }
);

// ── Section card ────────────────────────────────────────────────────────────

const ACCENT_MAP: Record<string, string> = {
    violet:  'from-violet-500 to-indigo-600 shadow-violet-500/30',
    indigo:  'from-indigo-500 to-violet-600 shadow-indigo-500/30',
    emerald: 'from-emerald-500 to-teal-600 shadow-emerald-500/30',
    blue:    'from-blue-500 to-cyan-600 shadow-blue-500/30',
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
            <Card>
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg bg-gradient-to-br flex items-center justify-center shadow-lg flex-shrink-0 ${ACCENT_MAP[accent]}`}>
                        {icon}
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
                        {description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>}
                    </div>
                </div>
                <div className={`p-6 grid gap-4 ${columns === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    {children}
                </div>
            </Card>
        </section>
    );
}

// ── Section navigation ──────────────────────────────────────────────────────

const SECTIONS = [
    { id: 'story-general',      title: 'General' },
    { id: 'story-description',  title: 'Description' },
    { id: 'story-progress',     title: 'Progress' },
    { id: 'story-references',   title: 'References' },
    { id: 'story-attachments',  title: 'Attachments' },
];

function SectionNav({ activeId }: { activeId: string }) {
    const scrollTo = (id: string) => (e: React.MouseEvent) => {
        e.preventDefault();
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    return (
        <nav className="sticky top-4 space-y-1">
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-3 px-3">
                Form sections
            </div>
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

const STATUS_OPTIONS: { value: FormData['status']; dot: string; label: string }[] = [
    { value: 'Draft',    dot: 'bg-slate-400',    label: 'Draft' },
    { value: 'Changes',  dot: 'bg-amber-500',    label: 'Changes' },
    { value: 'Review',   dot: 'bg-blue-500',     label: 'In Review' },
    { value: 'Approved', dot: 'bg-emerald-500',  label: 'Approved' },
];

const PRIORITY_OPTIONS: {
    value: FormData['priority'];
    label: string;
    active: string;
    idle: string;
}[] = [
    { value: 'None',        label: 'None',     active: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300',          idle: 'text-slate-500 border-slate-200 dark:border-slate-700' },
    { value: 'P4-Low',      label: 'Low',      active: 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 border-sky-300',                 idle: 'text-sky-600 border-sky-200 dark:border-sky-800' },
    { value: 'P3-Medium',   label: 'Medium',   active: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-300',       idle: 'text-amber-600 border-amber-200 dark:border-amber-800' },
    { value: 'P2-High',     label: 'High',     active: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-300',  idle: 'text-orange-600 border-orange-200 dark:border-orange-800' },
    { value: 'P1-Critical', label: 'Critical', active: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-300',            idle: 'text-rose-600 border-rose-200 dark:border-rose-800' },
];

// ── Inner page (needs useSearchParams so wrapped in Suspense) ───────────────

function CreateUserStoryContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialProjectId = searchParams.get('projectId') || '';

    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<string>(initialProjectId);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [syncWarning, setSyncWarning] = useState<string | null>(null);
    const [activeSection, setActiveSection] = useState('story-general');
    const [tempId] = useState(() => (typeof crypto !== 'undefined' ? crypto.randomUUID() : `tmp-${Date.now()}`));

    const { resources: tuleapResources } = useTuleapResources(selectedProjectId, 'user_story');

    useEffect(() => {
        projectsApi.list().then(setProjects).catch(() => {}).finally(() => setIsLoading(false));
    }, []);

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

    const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema) as any,
        defaultValues: {
            title: '',
            description: '',
            acceptance_criteria: '',
            change_reason: '',
            status: 'Draft',
            priority: 'None',
            requirement_version: '1',
            ba_author: '',
            initial_effort: null,
            remaining_effort: null,
            assigned_to: '',
        },
    });

    const statusValue = watch('status');
    const priorityValue = watch('priority');

    const onSubmit = async (data: FormData) => {
        setIsSubmitting(true);
        setSubmitError(null);
        setSyncWarning(null);
        if (!selectedProjectId) {
            setSubmitError('Please select a project before creating a user story.');
            setIsSubmitting(false);
            return;
        }
        try {
            const payload = {
                title: data.title,
                project_id: selectedProjectId,
                description: data.description || '',
                acceptance_criteria: data.acceptance_criteria || '',
                status: data.status,
                priority: data.priority,
                assigned_to: data.assigned_to || null,
                requirement_version: data.requirement_version || '1',
                change_reason: data.change_reason || '',
                ba_author: data.ba_author || '',
                initial_effort: data.initial_effort ?? null,
                remaining_effort: data.remaining_effort ?? null,
                temp_id: tempId,
            };
            const result = await userStoriesApi.create(payload);

            if (result.data?.sync_status === 'failed') {
                setSyncWarning(result.data.last_sync_error || 'Sync to Tuleap failed. Your story was saved locally.');
            }

            router.push(`/work/stories/${result.data.id}`);
            router.refresh();
        } catch (err: any) {
            setSubmitError(err.message || 'Failed to create user story');
        } finally {
            setIsSubmitting(false);
        }
    };

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
                            <Link href="/work/stories" className="hover:text-violet-600 transition-colors">User Stories</Link>
                            <span className="text-slate-300 dark:text-slate-600">/</span>
                            <span className="text-slate-500 dark:text-slate-300 font-medium">New</span>
                        </div>
                        <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                            New User Story
                        </h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
                            Fill in the fields below to create a new user story in Tuleap.
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="h-9 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="h-9 px-5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold shadow-md shadow-indigo-500/30 transition-all flex items-center gap-2"
                    >
                        {isSubmitting ? (
                            <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                        ) : (
                            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                <path d="M5 13l4 4L19 7" />
                            </svg>
                        )}
                        Create Story
                    </button>
                </div>
            </div>

            {/* Error banner */}
            {submitError && (
                <div className="flex items-center gap-3 px-4 py-3 mb-5 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-sm text-rose-700 dark:text-rose-300">
                    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="flex-shrink-0">
                        <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
                    </svg>
                    {submitError}
                </div>
            )}

            {/* Sync warning toast */}
            {syncWarning && (
                <div className="flex items-center gap-3 px-4 py-3 mb-5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-300">
                    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="flex-shrink-0">
                        <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                    {syncWarning}
                </div>
            )}

            {/* ── 2-column grid: nav | form ──────────────────────────────── */}
            <div className="grid grid-cols-12 gap-6 items-start">

                {/* Section nav */}
                <aside className="col-span-2 hidden lg:block">
                    <SectionNav activeId={activeSection} />
                </aside>

                {/* Main form area */}
                <div className="col-span-12 lg:col-span-10 space-y-5">

                    {/* General */}
                    <SectionCard
                        id="story-general"
                        accent="violet"
                        title="General"
                        description="Project routing, ownership, and story status."
                        icon={
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                            </svg>
                        }
                    >
                        <div className="col-span-2">
                            <FieldLabel required>Project</FieldLabel>
                            <SelectField
                                value={selectedProjectId}
                                onChange={e => setSelectedProjectId(e.target.value)}
                                disabled={isLoading}
                            >
                                <option value="">— Select a project —</option>
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>
                                        {p.project_name} ({p.project_id})
                                    </option>
                                ))}
                            </SelectField>
                        </div>

                        <div className="col-span-2">
                            <FieldLabel required>Summary</FieldLabel>
                            <input
                                {...register('title')}
                                dir="auto"
                                placeholder="User story summary"
                                className={fieldCls}
                            />
                            <FieldError message={errors.title?.message} />
                        </div>

                        <div>
                            <FieldLabel>Status</FieldLabel>
                            <div className="flex flex-wrap gap-2 mt-0.5">
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
                                            {opt.label}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div>
                            <FieldLabel>Priority</FieldLabel>
                            <div className="flex flex-wrap gap-2 mt-0.5">
                                {PRIORITY_OPTIONS.map(opt => (
                                    <label key={opt.value} className="cursor-pointer">
                                        <input type="radio" value={opt.value} {...register('priority')} className="sr-only" />
                                        <span className={`
                                            inline-flex items-center px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all
                                            ${priorityValue === opt.value
                                                ? opt.active
                                                : `bg-white dark:bg-slate-800 ${opt.idle} hover:opacity-80`
                                            }
                                        `}>
                                            {opt.label}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="col-span-2">
                            <FieldLabel>Assigned To</FieldLabel>
                            <SelectField {...register('assigned_to')}>
                                <option value="">— Unassigned —</option>
                                {tuleapResources.map(r => (
                                    <option key={r.tuleap_username} value={r.tuleap_username}>
                                        {r.resource_name} ({r.tuleap_username})
                                    </option>
                                ))}
                            </SelectField>
                        </div>
                    </SectionCard>

                    {/* Description */}
                    <SectionCard
                        id="story-description"
                        accent="indigo"
                        title="Description"
                        description="Story body, acceptance criteria, and reason for change."
                        columns={1}
                        icon={
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
                            </svg>
                        }
                    >
                        <div>
                            <FieldLabel>Description</FieldLabel>
                            <textarea {...register('description')} rows={5} placeholder='Describe the user story...' className={textareaCls} />
                            <FieldHint>Format: &ldquo;As a &lt;role&gt;, I want &lt;capability&gt;, so that &lt;outcome&gt;.&rdquo;</FieldHint>
                        </div>
                        <div>
                            <FieldLabel>Acceptance Criteria</FieldLabel>
                            <textarea {...register('acceptance_criteria')} rows={5} placeholder="List acceptance criteria..." className={textareaCls} />
                            <FieldHint>Bullet or numbered list of pass/fail conditions.</FieldHint>
                        </div>
                        <div>
                            <FieldLabel>Change Reason</FieldLabel>
                            <textarea {...register('change_reason')} rows={3} placeholder="Reason for this change..." className={textareaCls} />
                        </div>
                    </SectionCard>

                    {/* Progress */}
                    <SectionCard
                        id="story-progress"
                        accent="emerald"
                        title="Progress"
                        description="Effort tracking against the requirement."
                        icon={
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                <path d="M3 12a9 9 0 1 0 9-9M3 12a9 9 0 0 1 9-9M3 12h9M12 3v9" />
                            </svg>
                        }
                    >
                        <div>
                            <FieldLabel>Initial Effort (hours)</FieldLabel>
                            <input type="number" step="0.5" {...register('initial_effort')} placeholder="0" className={fieldCls} />
                        </div>
                        <div>
                            <FieldLabel>Remaining Effort (hours)</FieldLabel>
                            <input type="number" step="0.5" {...register('remaining_effort')} placeholder="0" className={fieldCls} />
                        </div>
                        <div>
                            <FieldLabel>Requirement Version</FieldLabel>
                            <input {...register('requirement_version')} placeholder="e.g. 1.0" className={fieldCls} />
                        </div>
                    </SectionCard>

                    {/* References */}
                    <SectionCard
                        id="story-references"
                        accent="blue"
                        title="References"
                        description="People and source documents."
                        columns={1}
                        icon={
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                            </svg>
                        }
                    >
                        <div>
                            <FieldLabel>BA Author</FieldLabel>
                            <input {...register('ba_author')} placeholder="Business analyst name" className={fieldCls} />
                        </div>
                    </SectionCard>

                    <AttachmentSection
                        id="story-attachments"
                        artifactType="user_story"
                        artifactId={null}
                        tempId={tempId}
                    />

                </div>
            </div>

            {/* ── Sticky action bar ────────────────────────────────────── */}
            <div className="sticky bottom-4 mt-6 z-10">
                <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl px-4 py-3 flex items-center justify-between shadow-xl border border-slate-200/60 dark:border-slate-700/60">
                    <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
                        </svg>
                        <span>Select a project and fill in a summary to create the story</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => router.back()}
                            className="h-9 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="h-9 px-5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold shadow-md shadow-indigo-500/30 transition-all flex items-center gap-2"
                        >
                            {isSubmitting ? (
                                <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                            ) : (
                                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path d="M5 13l4 4L19 7" />
                                </svg>
                            )}
                            Create Story
                        </button>
                    </div>
                </div>
            </div>

        </form>
    );
}

export default function CreateUserStoryPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center h-64 text-slate-400">Loading...</div>}>
            <CreateUserStoryContent />
        </Suspense>
    );
}

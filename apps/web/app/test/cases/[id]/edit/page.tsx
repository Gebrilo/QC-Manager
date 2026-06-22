'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { projectsApi, testCasesApi, type Project } from '@/lib/api';
import { artifactPath } from '@/lib/artifactPath';
import { useTuleapResources } from '@/hooks/useTuleapResources';
import { TestCase } from '@/types';
import { stripHtml } from '@/lib/stripHtml';
import { shouldRestoreAsyncSelectValue } from '@/lib/forms/asyncSelect';
import { Spinner } from '@/components/ui/Spinner';
import { ArtifactLinkField } from '@/components/shared/ArtifactLinkField';
import { format } from 'date-fns';

// ── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
    title: z.string().min(3, 'Title must be at least 3 characters').max(500),
    description: z.string().max(5000).optional().default(''),
    preconditions: z.string().max(3000).optional().default(''),
    test_steps: z.string().max(10000).optional().default(''),
    expected_result: z.string().max(5000).optional().default(''),
    priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
    severity: z.enum(['critical', 'major', 'normal', 'minor', 'trivial']).default('normal').optional(),
    test_type: z.enum(['functional', 'regression', 'smoke', 'integration', 'performance', 'security', 'usability', 'exploratory', 'automated']).default('functional'),
    category: z.string().max(50).optional().default(''),
    component: z.string().max(100).optional().default(''),
    suite_title: z.string().max(255).optional().default(''),
    automation_status: z.enum(['manual', 'automated', 'partial', 'to_automate']).default('manual'),
    status: z.enum(['None', 'Not Run', 'Review', 'Pass', 'Fail', 'Blocked']).default('Not Run'),
    estimated_duration_minutes: z.coerce.number().int().min(0).max(480).optional().nullable(),
    tags: z.string().optional().default(''),
    project_id: z.string().uuid('Valid project is required'),
    assigned_to: z.string().optional().default(''),
    linked_requirement_id: z.string().max(100).optional().default(''),
});

type FormData = z.infer<typeof schema>;

// ── Design primitives ────────────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden ${className}`}>
            {children}
        </div>
    );
}

function SectionCard({
    id,
    icon,
    accent,
    title,
    description,
    children,
    columns = 2,
}: {
    id: string;
    icon: React.ReactNode;
    accent: 'violet' | 'indigo' | 'emerald' | 'blue';
    title: string;
    description?: string;
    children: React.ReactNode;
    columns?: 1 | 2;
}) {
    const accentGradient: Record<string, string> = {
        violet: 'from-violet-500 to-indigo-600 shadow-violet-500/30',
        indigo: 'from-indigo-500 to-violet-600 shadow-indigo-500/30',
        emerald: 'from-emerald-500 to-teal-600 shadow-emerald-500/30',
        blue: 'from-blue-500 to-cyan-600 shadow-blue-500/30',
    };
    return (
        <section id={id} className="scroll-mt-24">
            <Card>
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg bg-gradient-to-br flex items-center justify-center shadow-lg flex-shrink-0 ${accentGradient[accent]}`}>
                        <span className="text-white">{icon}</span>
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
                        {description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>}
                    </div>
                </div>
                <div className={`p-6 grid gap-4 ${columns === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
                    {children}
                </div>
            </Card>
        </section>
    );
}

function FieldWrap({ full, children }: { full?: boolean; children: React.ReactNode }) {
    return <div className={full ? 'col-span-full' : ''}>{children}</div>;
}

function FLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
    return (
        <label className="block text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 mb-1.5">
            {children}{required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
    );
}

function FHint({ children }: { children: React.ReactNode }) {
    return <div className="text-[11px] text-slate-400 mt-1">{children}</div>;
}

function FError({ message }: { message?: string }) {
    if (!message) return null;
    return <p className="text-xs text-rose-500 mt-1">{message}</p>;
}

const inputCls =
    'w-full h-10 px-3.5 rounded-lg bg-white/60 dark:bg-slate-900/50 backdrop-blur-md border border-slate-200/60 dark:border-slate-700/60 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all';

const selectCls =
    'w-full h-10 pl-3.5 pr-9 rounded-lg bg-white/60 dark:bg-slate-900/50 backdrop-blur-md border border-slate-200/60 dark:border-slate-700/60 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all appearance-none cursor-pointer';

const textareaCls =
    'w-full px-3.5 py-3 rounded-lg bg-white/60 dark:bg-slate-900/50 backdrop-blur-md border border-slate-200/60 dark:border-slate-700/60 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all resize-y leading-relaxed';

function SelectWrapper({ children }: { children: React.ReactNode }) {
    return (
        <div className="relative">
            {children}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <path d="M6 9l6 6 6-6" />
            </svg>
        </div>
    );
}

function MetaCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <Card>
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800">
                <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{title}</div>
            </div>
            <div className="p-5 space-y-3">{children}</div>
        </Card>
    );
}

function MetaRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
            <span className={`text-xs font-semibold text-slate-700 dark:text-slate-200 truncate text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
        </div>
    );
}

// ── Status / priority pill helpers ───────────────────────────────────────────

function statusTone(s: string) {
    const map: Record<string, string> = {
        'Pass': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
        'Fail': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
        'Blocked': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
        'Review': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
        'Not Run': 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
        'None': 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    };
    return map[s] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
}

function statusDot(s: string) {
    const map: Record<string, string> = {
        'Pass': 'bg-emerald-500', 'Fail': 'bg-rose-500', 'Blocked': 'bg-amber-500',
        'Review': 'bg-blue-500', 'Not Run': 'bg-slate-400', 'None': 'bg-slate-400',
    };
    return map[s] || 'bg-slate-400';
}

// ── Section nav ──────────────────────────────────────────────────────────────

const SECTIONS = [
    { id: 'case-general',     title: 'General' },
    { id: 'case-description', title: 'Description & details' },
    { id: 'case-definition',  title: 'Test definition' },
    { id: 'case-references',  title: 'References' },
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

// ── Icons ────────────────────────────────────────────────────────────────────

const IconCase = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10 2v7.5L4 18a2 2 0 0 0 1.7 3h12.6A2 2 0 0 0 20 18l-6-8.5V2M8 2h8" />
    </svg>
);
const IconDescribe = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
);
const IconSteps = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
);
const IconLink = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
);

// ── Main page ────────────────────────────────────────────────────────────────

export default function EditTestCasePage() {
    const params = useParams();
    const id = params.id as string;
    const [testCase, setTestCase] = useState<TestCase | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        testCasesApi.get(id)
            .then((data) => setTestCase(data as any))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, [id]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Spinner size="lg" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="max-w-3xl mx-auto py-8 px-4">
                <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 p-6 rounded-2xl">
                    <h2 className="text-lg font-semibold mb-2">Error Loading Test Case</h2>
                    <p>{error}</p>
                    <Link href="/test/cases">
                        <button className="mt-4 px-4 py-2 rounded-lg border border-rose-300 dark:border-rose-800 text-sm font-medium hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors">
                            Back to Test Cases
                        </button>
                    </Link>
                </div>
            </div>
        );
    }

    if (!testCase) {
        return (
            <div className="max-w-3xl mx-auto py-8 px-4">
                <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl text-center border border-slate-200 dark:border-slate-800">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Test Case Not Found</h2>
                    <Link href="/test/cases">
                        <button className="mt-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                            Back to Test Cases
                        </button>
                    </Link>
                </div>
            </div>
        );
    }

    return <EditForm testCase={testCase} testCaseId={id} />;
}

// ── Form (separated so hooks are called after data is loaded) ────────────────

function EditForm({ testCase, testCaseId }: { testCase: TestCase; testCaseId: string }) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [activeSection, setActiveSection] = useState(SECTIONS[0].id);
    const [projects, setProjects] = useState<Project[]>([]);
    const [projectsError, setProjectsError] = useState<string | null>(null);
    const { resources: tuleapResources, loaded: tuleapLoaded } = useTuleapResources(testCase.project_id, 'test_case');
    const defaultProjectId = testCase.project_id || '';
    const defaultAssignedTo = testCase.assigned_to || '';

    useEffect(() => {
        projectsApi.list()
            .then((data) => setProjects(data as Project[]))
            .catch((err) => setProjectsError(err.message || 'Failed to load projects'));
    }, []);

    const { register, handleSubmit, watch, setValue, getFieldState, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema) as any,
        defaultValues: {
            title: stripHtml(testCase.title),
            description: stripHtml(testCase.description as string),
            preconditions: stripHtml(testCase.preconditions as string),
            test_steps: stripHtml(testCase.test_steps as string),
            expected_result: stripHtml(testCase.expected_result as string),
            priority: (testCase.priority || 'medium') as FormData['priority'],
            severity: (testCase.severity || 'normal') as FormData['severity'],
            test_type: (testCase.test_type || 'functional') as FormData['test_type'],
            category: testCase.category || '',
            component: testCase.component || '',
            suite_title: testCase.suite_title || '',
            automation_status: (testCase.automation_status || 'manual') as FormData['automation_status'],
            status: (testCase.status || 'Not Run') as FormData['status'],
            estimated_duration_minutes: testCase.estimated_duration_minutes != null ? Number(testCase.estimated_duration_minutes) : null,
            tags: Array.isArray(testCase.tags) ? (testCase.tags as string[]).join(', ') : ((testCase.tags as unknown) as string) || '',
            project_id: testCase.project_id || '',
            assigned_to: testCase.assigned_to || '',
            linked_requirement_id: testCase.linked_requirement_id || '',
        },
    });

    const statusValue = watch('status');

    useEffect(() => {
        if (shouldRestoreAsyncSelectValue(
            defaultProjectId,
            projects.map(project => project.id),
            getFieldState('project_id').isDirty
        )) {
            setValue('project_id', defaultProjectId, {
                shouldDirty: false,
                shouldTouch: false,
                shouldValidate: false,
            });
        }
    }, [defaultProjectId, getFieldState, projects, setValue]);

    useEffect(() => {
        if (tuleapLoaded && shouldRestoreAsyncSelectValue(
            defaultAssignedTo,
            tuleapResources.map(resource => resource.user_id || resource.id),
            getFieldState('assigned_to').isDirty
        )) {
            setValue('assigned_to', defaultAssignedTo, {
                shouldDirty: false,
                shouldTouch: false,
                shouldValidate: false,
            });
        }
    }, [defaultAssignedTo, getFieldState, setValue, tuleapLoaded, tuleapResources]);

    // ── Scroll-spy for section nav ─────────────────────────────────────────
    useEffect(() => {
        const handler = () => {
            let current = SECTIONS[0].id;
            for (const s of SECTIONS) {
                const el = document.getElementById(s.id);
                if (el && el.getBoundingClientRect().top < 120) current = s.id;
            }
            setActiveSection(current);
        };
        window.addEventListener('scroll', handler, { passive: true });
        handler();
        return () => window.removeEventListener('scroll', handler);
    }, []);

    const onSubmit = async (data: FormData) => {
        setIsSubmitting(true);
        setSubmitError(null);
        try {
            const payload: Record<string, unknown> = {
                title: data.title,
                description: data.description || undefined,
                preconditions: data.preconditions || undefined,
                test_steps: data.test_steps || undefined,
                expected_result: data.expected_result || undefined,
                priority: data.priority,
                severity: data.severity,
                test_type: data.test_type,
                category: data.category || 'other',
                component: data.component || undefined,
                suite_title: data.suite_title || undefined,
                automation_status: data.automation_status,
                status: data.status,
                estimated_duration_minutes: data.estimated_duration_minutes || undefined,
                tags: data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
                project_id: data.project_id,
                assigned_to: data.assigned_to || undefined,
                linked_requirement_id: data.linked_requirement_id || undefined,
            };
            await testCasesApi.update(testCaseId, payload as any);
            router.push(artifactPath('test_case', { id: testCaseId }));
            router.refresh();
        } catch (err: any) {
            setSubmitError(err.message || 'Failed to save test case');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCancel = () => router.push(artifactPath('test_case', { id: testCaseId }));

    return (
        <form onSubmit={handleSubmit(onSubmit) as any} className="max-w-[1400px] mx-auto px-6 py-6">

            {/* ── Header ──────────────────────────────────────────────── */}
            <div className="flex items-start justify-between mb-6 gap-6">
                <div className="flex items-start gap-3 min-w-0">
                    <button
                        type="button"
                        onClick={handleCancel}
                        className="mt-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors flex-shrink-0"
                        title="Back"
                    >
                        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                            <path d="M15 18l-6-6 6-6" />
                        </svg>
                    </button>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                            <span>Test Case</span>
                            <span className="text-slate-300 dark:text-slate-600">/</span>
                            <span className="font-mono font-semibold text-violet-600 dark:text-violet-300">{testCase.test_case_id}</span>
                            <span className="text-slate-300 dark:text-slate-600">/</span>
                            <span className="text-slate-500 dark:text-slate-300 font-medium">Edit</span>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight truncate max-w-[640px]">
                                {testCase.title}
                            </h1>
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase ${statusTone(testCase.status)}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${statusDot(testCase.status)}`} />
                                {testCase.status}
                            </span>
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
                            Update fields and click Save to persist changes.
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                        type="button"
                        onClick={handleCancel}
                        className="h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="h-9 px-4 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-60 text-white text-sm font-semibold shadow-lg shadow-indigo-500/30 transition-all flex items-center gap-2"
                    >
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path d="M5 13l4 4L19 7" />
                        </svg>
                        Save Changes
                    </button>
                </div>
            </div>

            {/* ── Error banner ─────────────────────────────────────────── */}
            {submitError && (
                <div className="mb-5 px-4 py-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-sm">
                    {submitError}
                </div>
            )}

            {/* ── 3-column grid ────────────────────────────────────────── */}
            <div className="grid grid-cols-12 gap-6 items-start">

                {/* Left: sticky section nav */}
                <aside className="col-span-2 hidden lg:block">
                    <SectionNav activeId={activeSection} />
                </aside>

                {/* Center: form sections */}
                <div className="col-span-12 lg:col-span-7 space-y-5">

                    {/* General */}
                    <SectionCard
                        id="case-general"
                        icon={<IconCase />}
                        accent="violet"
                        title="General"
                        description="Identifying info, classification, and routing."
                    >
                        <FieldWrap full>
                            <FLabel required>Title</FLabel>
                            <input
                                {...register('title')}
                                placeholder="Enter test case title"
                                className={inputCls}
                            />
                            <FError message={errors.title?.message} />
                        </FieldWrap>

                        <FieldWrap full>
                            <FLabel required>Project</FLabel>
                            <SelectWrapper>
                                <select {...register('project_id')} className={selectCls}>
                                    <option value="">Select project</option>
                                    {projects.map((project) => (
                                        <option key={project.id} value={project.id}>
                                            {project.project_name} ({project.project_id})
                                        </option>
                                    ))}
                                </select>
                            </SelectWrapper>
                            <FError message={errors.project_id?.message || projectsError || undefined} />
                        </FieldWrap>

                        <div>
                            <FLabel>Status</FLabel>
                            <SelectWrapper>
                                <select {...register('status')} className={selectCls}>
                                    <option value="None">None</option>
                                    <option value="Not Run">Not Run</option>
                                    <option value="Review">Review</option>
                                    <option value="Pass">Pass</option>
                                    <option value="Fail">Fail</option>
                                    <option value="Blocked">Blocked</option>
                                </select>
                            </SelectWrapper>
                            <FError message={errors.status?.message} />
                        </div>

                        <div>
                            <FLabel>Priority</FLabel>
                            <SelectWrapper>
                                <select {...register('priority')} className={selectCls}>
                                    <option value="critical">Critical</option>
                                    <option value="high">High</option>
                                    <option value="medium">Medium</option>
                                    <option value="low">Low</option>
                                </select>
                            </SelectWrapper>
                            <FError message={errors.priority?.message} />
                        </div>

                        <div>
                            <FLabel>Severity</FLabel>
                            <SelectWrapper>
                                <select {...register('severity')} className={selectCls}>
                                    <option value="critical">Critical</option>
                                    <option value="major">Major</option>
                                    <option value="normal">Normal</option>
                                    <option value="minor">Minor</option>
                                    <option value="trivial">Trivial</option>
                                </select>
                            </SelectWrapper>
                            <FError message={errors.severity?.message} />
                        </div>

                        <div>
                            <FLabel>Test Type</FLabel>
                            <SelectWrapper>
                                <select {...register('test_type')} className={selectCls}>
                                    <option value="functional">Functional</option>
                                    <option value="regression">Regression</option>
                                    <option value="smoke">Smoke</option>
                                    <option value="integration">Integration</option>
                                    <option value="performance">Performance</option>
                                    <option value="security">Security</option>
                                    <option value="usability">Usability</option>
                                    <option value="exploratory">Exploratory</option>
                                    <option value="automated">Automated</option>
                                </select>
                            </SelectWrapper>
                            <FError message={errors.test_type?.message} />
                        </div>

                        <div>
                            <FLabel>Automation Status</FLabel>
                            <SelectWrapper>
                                <select {...register('automation_status')} className={selectCls}>
                                    <option value="manual">Manual</option>
                                    <option value="to_automate">To Automate</option>
                                    <option value="automated">Automated</option>
                                    <option value="partial">Partial</option>
                                </select>
                            </SelectWrapper>
                            <FError message={errors.automation_status?.message} />
                        </div>

                        <div>
                            <FLabel>Category</FLabel>
                            <input
                                {...register('category')}
                                placeholder="e.g. Authentication"
                                className={inputCls}
                            />
                        </div>

                        <div>
                            <FLabel>Component</FLabel>
                            <input
                                {...register('component')}
                                placeholder="e.g. Login Module"
                                className={inputCls}
                            />
                        </div>

                        <div>
                            <FLabel>Suite Title</FLabel>
                            <ArtifactLinkField
                                types={[{ value: 'test_suite', label: 'Test Suite' }]}
                                valueKey="title"
                                projectId={watch('project_id') || undefined}
                                placeholder="Search test suites…"
                                value={watch('suite_title') || ''}
                                onChange={value => setValue('suite_title', value as string, { shouldDirty: true })}
                            />
                            <FHint>Select a test suite to group this case under (matched by normalized title).</FHint>
                            <FError message={errors.suite_title?.message} />
                        </div>

                        <div>
                            <FLabel>Assigned To</FLabel>
                            <SelectWrapper>
                                <select {...register('assigned_to')} className={selectCls}>
                                    <option value="">— Unassigned —</option>
                                    {tuleapResources.map(r => (
                                        <option key={r.id} value={r.user_id || r.id}>
                                            {r.resource_name} ({r.tuleap_username})
                                        </option>
                                    ))}
                                </select>
                            </SelectWrapper>
                            {tuleapLoaded && tuleapResources.length === 0 && (
                                <FHint>
                                    No Tuleap-mapped resources found.{' '}
                                    <a href="/team/resources" className="underline font-medium text-violet-600 dark:text-violet-400">
                                        Add one in Team → Resources
                                    </a>
                                </FHint>
                            )}
                        </div>

                        <div>
                            <FLabel>Est. Duration (minutes)</FLabel>
                            <input
                                type="number"
                                {...register('estimated_duration_minutes')}
                                placeholder="5"
                                className={inputCls}
                            />
                            <FError message={errors.estimated_duration_minutes?.message} />
                        </div>

                        <FieldWrap full>
                            <FLabel>Tags (comma-separated)</FLabel>
                            <input
                                {...register('tags')}
                                placeholder="smoke, login, p1"
                                className={inputCls}
                            />
                            <FHint>Used for filtering and grouping in runs</FHint>
                        </FieldWrap>
                    </SectionCard>

                    {/* Description & Details */}
                    <SectionCard
                        id="case-description"
                        icon={<IconDescribe />}
                        accent="indigo"
                        title="Description & details"
                        description="What this test verifies and what state is required before running it."
                        columns={1}
                    >
                        <div>
                            <FLabel>Description</FLabel>
                            <textarea
                                {...register('description')}
                                rows={4}
                                placeholder="Describe the test case purpose..."
                                className={textareaCls}
                            />
                        </div>
                        <div>
                            <FLabel>Preconditions</FLabel>
                            <textarea
                                {...register('preconditions')}
                                rows={3}
                                placeholder="Prerequisites for this test..."
                                className={textareaCls}
                            />
                        </div>
                    </SectionCard>

                    {/* Test Definition */}
                    <SectionCard
                        id="case-definition"
                        icon={<IconSteps />}
                        accent="emerald"
                        title="Test definition"
                        description="Steps the tester executes, plus the expected outcome."
                        columns={1}
                    >
                        <div>
                            <FLabel>Test Steps</FLabel>
                            <textarea
                                {...register('test_steps')}
                                rows={6}
                                placeholder="1. Navigate to login page&#10;2. Enter valid email&#10;3. Click Login"
                                className={textareaCls}
                            />
                            <FHint>One step per line, numbered</FHint>
                        </div>
                        <div>
                            <FLabel>Expected Result</FLabel>
                            <textarea
                                {...register('expected_result')}
                                rows={3}
                                placeholder="User is redirected to dashboard"
                                className={textareaCls}
                            />
                        </div>
                    </SectionCard>

                    {/* References */}
                    <SectionCard
                        id="case-references"
                        icon={<IconLink />}
                        accent="blue"
                        title="References"
                        description="Linked requirement and other associated artifacts."
                        columns={1}
                    >
                        <div>
                            <FLabel>Linked Requirement</FLabel>
                            <ArtifactLinkField
                                types={[
                                    { value: 'task', label: 'Task' },
                                    { value: 'user_story', label: 'User Story' },
                                ]}
                                valueKey="display_id"
                                projectId={watch('project_id') || undefined}
                                placeholder="Search tasks or user stories…"
                                value={watch('linked_requirement_id') || ''}
                                onChange={value => setValue('linked_requirement_id', value as string, { shouldDirty: true })}
                            />
                            <FHint>The task or user story this test case verifies.</FHint>
                        </div>
                    </SectionCard>

                </div>

                {/* Right: meta panel */}
                <aside className="col-span-12 lg:col-span-3 space-y-5">
                    <div className="lg:sticky lg:top-4 space-y-5">

                        <MetaCard title="Case info">
                            <MetaRow label="Case ID" value={testCase.test_case_id} mono />
                            <MetaRow label="Test type" value={testCase.test_type || '—'} />
                            <MetaRow label="Automation" value={testCase.automation_status || '—'} />
                            <MetaRow
                                label="Last run"
                                value={testCase.latest_execution_date
                                    ? format(new Date(testCase.latest_execution_date), 'dd MMM, yyyy')
                                    : 'Never'}
                            />
                            <MetaRow
                                label="Last status"
                                value={
                                    testCase.latest_execution_status ? (
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusTone(testCase.latest_execution_status)}`}>
                                            {testCase.latest_execution_status}
                                        </span>
                                    ) : '—'}
                            />
                            <MetaRow label="Runs" value={testCase.execution_count ?? '—'} />
                            <MetaRow
                                label="Created by"
                                value={testCase.created_by_name || testCase.created_by || '—'}
                            />
                        </MetaCard>

                        {testCase.linked_requirement_id && (
                            <MetaCard title="Related">
                                <div className="flex items-start gap-2.5">
                                    <span className="mt-0.5 w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                                    <div className="min-w-0">
                                        <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate font-mono">
                                            {testCase.linked_requirement_id}
                                        </div>
                                        <div className="text-[11px] text-slate-400 mt-0.5">Linked requirement</div>
                                    </div>
                                </div>
                            </MetaCard>
                        )}

                        {testCase.activity && testCase.activity.length > 0 && (
                            <MetaCard title="Activity">
                                <div className="space-y-3">
                                    {testCase.activity.slice(0, 5).map((entry, i) => (
                                        <div key={i} className="flex gap-3">
                                            <div className="flex flex-col items-center flex-shrink-0">
                                                <div className="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center text-[10px] font-bold text-violet-700 dark:text-violet-300">
                                                    {(entry.performed_by_email || '?')[0].toUpperCase()}
                                                </div>
                                                {i < Math.min(4, testCase.activity!.length - 1) && (
                                                    <div className="w-px flex-1 bg-slate-200 dark:bg-slate-700 mt-1" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0 pb-1">
                                                <div className="text-xs text-slate-700 dark:text-slate-200">
                                                    <span className="font-semibold">{entry.action}</span>
                                                    {entry.change_summary && (
                                                        <span className="text-slate-500 dark:text-slate-400"> — {entry.change_summary}</span>
                                                    )}
                                                </div>
                                                <div className="text-[11px] text-slate-400 mt-0.5">
                                                    {format(new Date(entry.performed_at), 'dd MMM, yyyy')}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </MetaCard>
                        )}

                        <MetaCard title="Timestamps">
                            <MetaRow
                                label="Created"
                                value={testCase.created_at ? format(new Date(testCase.created_at), 'dd MMM yyyy') : '—'}
                            />
                            <MetaRow
                                label="Updated"
                                value={testCase.updated_at ? format(new Date(testCase.updated_at), 'dd MMM yyyy') : '—'}
                            />
                        </MetaCard>

                    </div>
                </aside>

            </div>

            {/* ── Sticky footer action bar ─────────────────────────────── */}
            <div className="sticky bottom-4 mt-6 z-10">
                <div className="rounded-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between shadow-xl">
                    <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M12 8v4M12 16h.01" />
                        </svg>
                        <span>Unsaved changes will be lost on cancel</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleCancel}
                            className="h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="h-9 px-4 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-60 text-white text-sm font-semibold shadow-lg shadow-indigo-500/30 transition-all flex items-center gap-2"
                        >
                            {isSubmitting && (
                                <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                            )}
                            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                <path d="M5 13l4 4L19 7" />
                            </svg>
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>

        </form>
    );
}

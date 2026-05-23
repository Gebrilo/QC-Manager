'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { testSuitesApi, fetchApi } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import Link from 'next/link';

interface ProjectOption {
    id: string;
    project_name: string;
    project_id: string;
}

// ── Design primitives ────────────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden ${className}`}>
            {children}
        </div>
    );
}

function SectionCard({
    icon,
    accent,
    title,
    description,
    children,
}: {
    icon: React.ReactNode;
    accent: string;
    title: string;
    description?: string;
    children: React.ReactNode;
}) {
    const accentMap: Record<string, string> = {
        violet: 'from-violet-500 to-indigo-600 shadow-violet-500/30',
        indigo: 'from-indigo-500 to-violet-600 shadow-indigo-500/30',
        emerald: 'from-emerald-500 to-teal-600 shadow-emerald-500/30',
    };
    return (
        <Card>
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg bg-gradient-to-br flex items-center justify-center shadow-lg flex-shrink-0 ${accentMap[accent] || accentMap.violet}`}>
                    <span className="text-white">{icon}</span>
                </div>
                <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
                    {description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>}
                </div>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {children}
            </div>
        </Card>
    );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
    return (
        <label className="block text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 mb-1.5">
            {children}{required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
    );
}

function FieldError({ message }: { message?: string }) {
    if (!message) return null;
    return <p className="text-xs text-rose-500 mt-1">{message}</p>;
}

const inputCls =
    'w-full h-10 px-3.5 rounded-lg bg-white/60 dark:bg-slate-900/50 backdrop-blur-md border border-slate-200/60 dark:border-slate-700/60 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all';

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

const selectCls =
    'w-full h-10 pl-3.5 pr-9 rounded-lg bg-white/60 dark:bg-slate-900/50 backdrop-blur-md border border-slate-200/60 dark:border-slate-700/60 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all appearance-none cursor-pointer';

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CreateTestSuitePage() {
    const router = useRouter();
    const [projects, setProjects] = useState<ProjectOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [projectId, setProjectId] = useState('');
    const [status, setStatus] = useState('draft');

    const [nameError, setNameError] = useState('');
    const [projectError, setProjectError] = useState('');

    useEffect(() => {
        fetchApi('/projects?status=active&limit=100')
            .then((res: any) => {
                const data = Array.isArray(res) ? res : res?.data || [];
                setProjects(data.map((p: any) => ({ id: p.id, project_name: p.project_name || p.name, project_id: p.project_id || '' })));
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setNameError('');
        setProjectError('');

        let valid = true;
        if (!name.trim()) { setNameError('Name is required'); valid = false; }
        if (!projectId) { setProjectError('Project is required'); valid = false; }
        if (!valid) return;

        setSubmitting(true);
        setError(null);
        try {
            await testSuitesApi.create({
                name: name.trim(),
                description: description.trim() || undefined,
                project_id: projectId,
                status: status as 'draft' | 'active' | 'archived',
            });
            router.push('/test/suites');
            router.refresh();
        } catch (err: any) {
            setError(err.message || 'Failed to create test suite');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;
    }

    const STATUS_OPTIONS = [
        { value: 'draft',    dot: 'bg-slate-400',   label: 'Draft' },
        { value: 'active',   dot: 'bg-emerald-500', label: 'Active' },
        { value: 'archived', dot: 'bg-slate-300',   label: 'Archived' },
    ];

    return (
        <form onSubmit={handleSubmit} className="max-w-[1400px] mx-auto px-6 py-6 space-y-5">

            {/* ── Header ──────────────────────────────────────────────── */}
            <div className="flex items-start justify-between gap-6">
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
                            <Link href="/test/suites" className="hover:text-violet-600 transition-colors">Test Suites</Link>
                            <span className="text-slate-300 dark:text-slate-600">/</span>
                            <span className="text-slate-500 dark:text-slate-300 font-medium">New</span>
                        </div>
                        <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                            New Test Suite
                        </h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
                            Organize test cases into a reusable suite.
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={submitting}
                        className="h-9 px-4 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-60 text-white text-sm font-semibold shadow-lg shadow-indigo-500/30 transition-all flex items-center gap-2"
                    >
                        {submitting && (
                            <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                        )}
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path d="M5 13l4 4L19 7" />
                        </svg>
                        Create Suite
                    </button>
                </div>
            </div>

            {/* Error banner */}
            {error && (
                <div className="px-4 py-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-sm">
                    {error}
                </div>
            )}

            {/* ── Form sections ────────────────────────────────────────── */}
            <SectionCard
                icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                    </svg>
                }
                accent="violet"
                title="General"
                description="Suite name, project, and status."
            >
                <div>
                    <FieldLabel required>Name</FieldLabel>
                    <input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="e.g. Login Regression Suite"
                        className={inputCls}
                    />
                    <FieldError message={nameError} />
                </div>

                <div>
                    <FieldLabel required>Project</FieldLabel>
                    <SelectWrapper>
                        <select value={projectId} onChange={e => setProjectId(e.target.value)} className={selectCls}>
                            <option value="">— Select a project —</option>
                            {projects.map(p => (
                                <option key={p.id} value={p.id}>
                                    {p.project_name}{p.project_id ? ` (${p.project_id})` : ''}
                                </option>
                            ))}
                        </select>
                    </SelectWrapper>
                    <FieldError message={projectError} />
                </div>

                <div>
                    <FieldLabel>Status</FieldLabel>
                    <div className="flex flex-wrap gap-2 mt-0.5">
                        {STATUS_OPTIONS.map(opt => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => setStatus(opt.value)}
                                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all
                                    ${status === opt.value
                                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent shadow-sm'
                                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                                    }`}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full ${opt.dot}`} />
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
            </SectionCard>

            <SectionCard
                icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
                    </svg>
                }
                accent="indigo"
                title="Details"
                description="Describe the purpose and scope of this test suite."
            >
                <div className="col-span-full">
                    <FieldLabel>Description</FieldLabel>
                    <textarea
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="Describe the purpose and scope of this test suite..."
                        rows={4}
                        className={textareaCls}
                    />
                </div>
            </SectionCard>

            {/* ── Footer ───────────────────────────────────────────────── */}
            <div className="flex items-center justify-between pt-2 pb-6">
                <Link
                    href="/test/suites"
                    className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                >
                    ← Back to suites
                </Link>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={submitting}
                        className="h-9 px-4 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-60 text-white text-sm font-semibold shadow-lg shadow-indigo-500/30 transition-all flex items-center gap-2"
                    >
                        {submitting && (
                            <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                        )}
                        Create Suite
                    </button>
                </div>
            </div>

        </form>
    );
}

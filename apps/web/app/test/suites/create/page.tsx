'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { testSuitesApi, testCasesApi, fetchApi } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import Link from 'next/link';

interface ProjectOption {
    id: string;
    project_name: string;
    project_id: string;
}

interface CaseRow {
    id: string;
    test_case_id: string;
    title: string;
    priority?: string;
    status?: string;
    suite_title?: string;
    category?: string;
    tags?: string[];
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

function PriorityBadge({ priority }: { priority?: string }) {
    if (!priority) return null;
    const cls: Record<string, string> = {
        critical: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
        high:     'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
        medium:   'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
        low:      'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    };
    return (
        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase ${cls[priority.toLowerCase()] ?? 'bg-slate-100 text-slate-600'}`}>
            {priority}
        </span>
    );
}

// ── Picker panel (Suggested / All / Search) ─────────────────────────────────

type PickerTab = 'suggested' | 'all' | 'search';

function TestCasePicker({
    projectId,
    suiteName,
    selectedIds,
    setSelectedIds,
}: {
    projectId: string;
    suiteName: string;
    selectedIds: Set<string>;
    setSelectedIds: (next: Set<string>) => void;
}) {
    const toast = useToast();
    const [tab, setTab] = useState<PickerTab>('suggested');
    const [rows, setRows] = useState<CaseRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchFilters, setSearchFilters] = useState({
        suite_title: '',
        title: '',
        priority: '',
        status: '',
        category: '',
        created_by: '',
        tags: '',
    });

    const load = useCallback(async (mode: PickerTab) => {
        if (!projectId) { setRows([]); return; }
        setLoading(true);
        try {
            let params: any = { project_id: projectId, limit: 200 };
            if (mode === 'suggested') {
                params = { ...params, match_suite_title: true, suite_name: suiteName };
            } else if (mode === 'search') {
                const trimmed: Record<string, string> = {};
                Object.entries(searchFilters).forEach(([k, v]) => {
                    if (v && String(v).trim() !== '') trimmed[k] = String(v).trim();
                });
                params = { ...params, ...trimmed };
            }
            const res = await testCasesApi.list(params) as any;
            setRows(Array.isArray(res.data) ? res.data : []);
        } catch (err: any) {
            toast.error(err.message || 'Failed to load test cases');
        } finally {
            setLoading(false);
        }
    }, [projectId, suiteName, searchFilters, toast]);

    useEffect(() => {
        load(tab);
        // load is included in deps; we re-run when tab changes via the effect below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab]);

    // Auto-refresh Suggested when name+project are both set.
    useEffect(() => {
        if (tab === 'suggested' && projectId && suiteName.trim()) {
            load('suggested');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [suiteName, projectId]);

    const toggle = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedIds(next);
    };

    const toggleAll = () => {
        if (selectedIds.size === rows.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(rows.map(r => r.id)));
        }
    };

    return (
        <div className="rounded-xl border border-violet-200/60 dark:border-violet-700/40 bg-violet-50/40 dark:bg-violet-900/10 p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    Add test cases{selectedIds.size > 0 ? ` (${selectedIds.size} selected)` : ''}
                </h3>
            </div>

            {!projectId && (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-3 text-center">
                    Select a project first to browse test cases.
                </p>
            )}

            {projectId && (
                <>
                    <div className="flex items-center gap-1 mb-3 border-b border-violet-200/40 dark:border-violet-800/40">
                        {(['suggested', 'all', 'search'] as const).map(t => {
                            const label = t === 'suggested' ? 'Suggested' : t === 'all' ? 'All' : 'Search';
                            const isActive = tab === t;
                            return (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => setTab(t)}
                                    className={
                                        'h-8 px-3 text-xs font-semibold uppercase tracking-wider transition-all border-b-2 -mb-px ' +
                                        (isActive
                                            ? 'border-violet-500 text-violet-700 dark:text-violet-300'
                                            : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200')
                                    }
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>

                    {tab === 'suggested' && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                            Test cases whose <span className="font-mono">suite_title</span> matches the typed suite name
                            (normalised: lower, trimmed, internal whitespace collapsed).
                            {!suiteName.trim() && <span className="italic"> Type a suite name above to see matches.</span>}
                        </p>
                    )}

                    {tab === 'search' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                            {(['suite_title', 'title', 'priority', 'status', 'category', 'created_by', 'tags'] as const).map(f => {
                                if (f === 'priority' || f === 'status') {
                                    return (
                                        <div key={f}>
                                            <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 mb-1">{f === 'priority' ? 'Priority' : 'Status'}</label>
                                            <select
                                                value={searchFilters[f]}
                                                onChange={e => setSearchFilters(s => ({ ...s, [f]: e.target.value }))}
                                                className="w-full h-8 px-2.5 rounded-lg text-xs bg-white/60 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-700/60 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-violet-500 transition-all"
                                            >
                                                <option value="">Any</option>
                                                {f === 'priority' ? (
                                                    <>
                                                        <option value="critical">Critical</option>
                                                        <option value="high">High</option>
                                                        <option value="medium">Medium</option>
                                                        <option value="low">Low</option>
                                                    </>
                                                ) : (
                                                    <>
                                                        <option value="None">None</option>
                                                        <option value="Not Run">Not Run</option>
                                                        <option value="Review">Review</option>
                                                        <option value="Pass">Pass</option>
                                                        <option value="Fail">Fail</option>
                                                        <option value="Blocked">Blocked</option>
                                                    </>
                                                )}
                                            </select>
                                        </div>
                                    );
                                }
                                return (
                                    <div key={f}>
                                        <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 mb-1">
                                            {f === 'suite_title' ? 'Suite Title' :
                                             f === 'title' ? 'Title contains' :
                                             f === 'category' ? 'Category' :
                                             f === 'created_by' ? 'Created by (UUID)' :
                                             'Tags (comma-separated, any match)'}
                                        </label>
                                        <input
                                            type="text"
                                            value={searchFilters[f]}
                                            onChange={e => setSearchFilters(s => ({ ...s, [f]: e.target.value }))}
                                            placeholder={f === 'tags' ? 'login, smoke' : ''}
                                            className="w-full h-8 px-2.5 rounded-lg text-xs bg-white/60 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-700/60 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all"
                                        />
                                    </div>
                                );
                            })}
                            <div className="sm:col-span-2 flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => load('search')}
                                    disabled={loading}
                                    className="h-7 px-3 text-xs rounded-lg bg-violet-600 text-white font-semibold shadow-sm hover:bg-violet-700 disabled:opacity-50"
                                >
                                    {loading ? 'Searching…' : 'Apply filters'}
                                </button>
                            </div>
                        </div>
                    )}

                    {loading ? (
                        <div className="flex items-center justify-center py-6"><Spinner size="sm" /></div>
                    ) : rows.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-4">
                            {tab === 'suggested'
                                ? 'No test cases with a matching suite_title in this project.'
                                : tab === 'search'
                                    ? 'No test cases match your filters.'
                                    : 'No test cases available in this project.'}
                        </p>
                    ) : (
                        <>
                            <div className="mb-2 px-1">
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.size === rows.length && rows.length > 0}
                                        ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < rows.length; }}
                                        onChange={toggleAll}
                                        className="h-3.5 w-3.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                                    />
                                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                        Select all ({rows.length})
                                    </span>
                                </label>
                            </div>
                            <div className="max-h-56 overflow-y-auto space-y-0.5 rounded-lg border border-slate-200/50 dark:border-slate-700/50 bg-white/60 dark:bg-slate-900/40 divide-y divide-slate-100 dark:divide-slate-800">
                                {rows.map(row => (
                                    <label key={row.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-violet-50/60 dark:hover:bg-violet-900/10 transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(row.id)}
                                            onChange={() => toggle(row.id)}
                                            className="h-3.5 w-3.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500 flex-shrink-0"
                                        />
                                        <span className="font-mono text-[11px] font-semibold text-violet-600 dark:text-violet-300 flex-shrink-0 w-20">{row.test_case_id}</span>
                                        <span className="text-xs text-slate-700 dark:text-slate-200 flex-1 truncate">
                                            {row.title}
                                            {row.suite_title && (
                                                <span className="ml-2 text-[10px] text-slate-400 font-mono">⟶ {row.suite_title}</span>
                                            )}
                                        </span>
                                        <PriorityBadge priority={row.priority} />
                                    </label>
                                ))}
                            </div>
                        </>
                    )}
                </>
            )}
        </div>
    );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CreateTestSuitePage() {
    const router = useRouter();
    const toast = useToast();
    const [projects, setProjects] = useState<ProjectOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [projectId, setProjectId] = useState('');
    const [status, setStatus] = useState('draft');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const [nameError, setNameError] = useState('');
    const [projectError, setProjectError] = useState('');

    // Use a ref to avoid lint warnings about stale closures inside the
    // picker (the picker reads the latest value of selectedIds).
    const selectedIdsRef = useRef(selectedIds);
    selectedIdsRef.current = selectedIds;

    useEffect(() => {
        fetchApi('/projects?status=active&limit=100')
            .then((res: any) => {
                const data = Array.isArray(res) ? res : res?.data || [];
                setProjects(data.map((p: any) => ({ id: p.id, project_name: p.project_name || p.name, project_id: p.project_id || '' })));
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    // When the project changes, drop the prior selection (those cases may be
    // in a different project; the create endpoint will reject them anyway).
    useEffect(() => {
        setSelectedIds(new Set());
    }, [projectId]);

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
                test_case_ids: Array.from(selectedIds),
            } as any);
            router.push('/test/suites');
            router.refresh();
        } catch (err: any) {
            const msg = err.message || 'Failed to create test suite';
            setError(msg);
            toast.error(msg);
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
                        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
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

            <SectionCard
                icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10 2v7.5L4 18a2 2 0 0 0 1.7 3h12.6A2 2 0 0 0 20 18l-6-8.5V2M8 2h8" />
                    </svg>
                }
                accent="emerald"
                title="Test cases"
                description="Pick cases to link to this suite. Selected cases are added on create."
            >
                <div className="col-span-full">
                    <TestCasePicker
                        projectId={projectId}
                        suiteName={name}
                        selectedIds={selectedIds}
                        setSelectedIds={setSelectedIds}
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

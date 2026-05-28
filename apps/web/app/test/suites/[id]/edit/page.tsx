'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { TestSuite, SuiteTestCase, SuiteType, ReadinessScope } from '@/types';
import { testSuitesApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { formatDistanceToNow, format } from 'date-fns';

// ── Inline SVG icons ──────────────────────────────────────────────────────────

const ICON_SUITE    = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`;
const ICON_DESCRIBE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>`;
const ICON_CASE     = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 2v7.5L4 18a2 2 0 0 0 1.7 3h12.6A2 2 0 0 0 20 18l-6-8.5V2M8 2h8"/></svg>`;
const ICON_TRASH    = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6"/></svg>`;
const ICON_DRAG     = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/></svg>`;
const ICON_PLUS     = `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>`;
const ICON_SAVE     = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>`;
const ICON_INFO     = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>`;

// ── Primitives ────────────────────────────────────────────────────────────────

function EFLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
    return (
        <label className="block text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 mb-1.5">
            {children}{required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
    );
}

function EFInput({
    value, onChange, placeholder, type = 'text', readOnly = false,
}: {
    value: string; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string; type?: string; readOnly?: boolean;
}) {
    return (
        <input
            type={type}
            value={value ?? ''}
            onChange={onChange}
            placeholder={placeholder}
            readOnly={readOnly}
            className={
                'w-full h-10 px-3.5 rounded-lg text-sm transition-all focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 ' +
                (readOnly
                    ? 'bg-slate-50/60 dark:bg-slate-900/30 border border-slate-200/40 dark:border-slate-700/40 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                    : 'bg-white/60 dark:bg-slate-900/50 backdrop-blur-md border border-slate-200/60 dark:border-slate-700/60 text-slate-800 dark:text-slate-100 placeholder:text-slate-400')
            }
        />
    );
}

function EFSelect({
    value, onChange, children, disabled = false,
}: {
    value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    children: React.ReactNode; disabled?: boolean;
}) {
    return (
        <div className="relative">
            <select
                value={value}
                onChange={onChange}
                disabled={disabled}
                className="w-full h-10 pl-3.5 pr-9 rounded-lg bg-white/60 dark:bg-slate-900/50 backdrop-blur-md border border-slate-200/60 dark:border-slate-700/60 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
                {children}
            </select>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <path d="M6 9l6 6 6-6" />
            </svg>
        </div>
    );
}

function EFTextarea({
    value, onChange, placeholder, rows = 4,
}: {
    value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    placeholder?: string; rows?: number;
}) {
    return (
        <textarea
            value={value ?? ''}
            onChange={onChange}
            placeholder={placeholder}
            rows={rows}
            className="w-full px-3.5 py-3 rounded-lg bg-white/60 dark:bg-slate-900/50 backdrop-blur-md border border-slate-200/60 dark:border-slate-700/60 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all resize-y leading-relaxed"
        />
    );
}

function EFField({
    label, required, full, hint, children,
}: {
    label: string; required?: boolean; full?: boolean; hint?: string; children: React.ReactNode;
}) {
    return (
        <div className={full ? 'col-span-2' : ''}>
            <EFLabel required={required}>{label}</EFLabel>
            {children}
            {hint && <div className="text-[11px] text-slate-400 mt-1">{hint}</div>}
        </div>
    );
}

// ── Section card ──────────────────────────────────────────────────────────────

const ACCENT_GRADIENTS: Record<string, string> = {
    violet:  'from-violet-500 to-indigo-600 shadow-violet-500/30',
    indigo:  'from-indigo-500 to-violet-600 shadow-indigo-500/30',
    emerald: 'from-emerald-500 to-teal-600 shadow-emerald-500/30',
};

function EFSection({
    id, icon, title, description, accent, columns = 2, children,
}: {
    id: string; icon: string; title: string; description?: string;
    accent: string; columns?: number; children: React.ReactNode;
}) {
    return (
        <section id={id} className="scroll-mt-24">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg bg-gradient-to-br flex items-center justify-center shadow-lg flex-shrink-0 ${ACCENT_GRADIENTS[accent]}`}>
                        <span className="text-white" dangerouslySetInnerHTML={{ __html: icon }} />
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

// ── Section nav ───────────────────────────────────────────────────────────────

const SECTIONS = [
    { id: 'suite-general',     title: 'General' },
    { id: 'suite-description', title: 'Description' },
    { id: 'suite-cases',       title: 'Test cases' },
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
                    <span className="inline-block w-5 text-[11px] tabular-nums text-slate-400 mr-1">{String(i + 1).padStart(2, '0')}</span>
                    {s.title}
                </a>
            ))}
        </nav>
    );
}

// ── Meta panel ────────────────────────────────────────────────────────────────

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

function MetaRow({ label, value, mono = false }: { label: string; value?: string | number | null; mono?: boolean }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
            <span className={`text-xs font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[140px] ${mono ? 'font-mono' : ''}`}>
                {value != null ? String(value) : '—'}
            </span>
        </div>
    );
}

// ── Status pill ───────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
    const cls: Record<string, string> = {
        active:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
        draft:    'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
        archived: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    };
    const dot: Record<string, string> = {
        active: 'bg-emerald-500', draft: 'bg-slate-400', archived: 'bg-amber-500',
    };
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase ${cls[status] ?? cls.draft}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${dot[status] ?? 'bg-slate-400'}`} />
            {status}
        </span>
    );
}

// ── Test case status badge ────────────────────────────────────────────────────

function CaseBadge({ status }: { status?: string }) {
    if (!status) return null;
    const cls: Record<string, string> = {
        passed:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
        failed:  'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
        blocked: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    };
    return (
        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase ${cls[status.toLowerCase()] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
            {status}
        </span>
    );
}

// ── Priority badge ────────────────────────────────────────────────────────────

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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EditTestSuitePage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const [suite, setSuite]         = useState<TestSuite | null>(null);
    const [loading, setLoading]     = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError]         = useState<string | null>(null);
    const [activeSection, setActiveSection] = useState(SECTIONS[0].id);

    // Form fields
    const [name, setName]                     = useState('');
    const [status, setStatus]                 = useState('draft');
    const [suiteType, setSuiteType]           = useState<SuiteType>('other');
    const [readinessScope, setReadinessScope] = useState<ReadinessScope>('required');
    const [description, setDescription]       = useState('');

    // Test cases
    const [testCases, setTestCases]           = useState<SuiteTestCase[]>([]);
    const [removingId, setRemovingId]         = useState<string | null>(null);
    const [showAddPanel, setShowAddPanel]     = useState(false);
    const [availableCases, setAvailableCases] = useState<any[]>([]);
    const [loadingAvail, setLoadingAvail]     = useState(false);
    const [selectedIds, setSelectedIds]       = useState<Set<string>>(new Set());
    const [addingCases, setAddingCases]       = useState(false);
    const [caseSearch, setCaseSearch]         = useState('');

    // Scroll-tracking for section nav
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

    const loadSuite = useCallback(async () => {
        try {
            setLoading(true);
            const data = await testSuitesApi.get(id) as any;
            setSuite(data);
            setName(data.name || '');
            setDescription(data.description || '');
            setStatus(data.status || 'draft');
            setSuiteType(data.suite_type || 'other');
            setReadinessScope(data.readiness_scope || 'required');
            setTestCases(data.test_cases || []);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { loadSuite(); }, [loadSuite]);

    const handleSave = async () => {
        if (!name.trim()) { setError('Suite title is required'); return; }
        setSubmitting(true);
        setError(null);
        try {
            await testSuitesApi.update(id, {
                name: name.trim(),
                description: description.trim() || undefined,
                status: status as any,
                suite_type: suiteType,
                readiness_scope: readinessScope,
            });
            router.push(`/test/suites/${id}`);
            router.refresh();
        } catch (err: any) {
            setError(err.message || 'Failed to update test suite');
            setSubmitting(false);
        }
    };

    const handleCancel = () => router.push(`/test/suites/${id}`);

    const handleRemoveCase = async (caseId: string) => {
        setRemovingId(caseId);
        try {
            await testSuitesApi.removeTestCases(id, { test_case_ids: [caseId] });
            setTestCases(prev => prev.filter(tc => tc.test_case_id !== caseId));
        } catch (err: any) {
            alert(err.message || 'Failed to remove test case');
        } finally {
            setRemovingId(null);
        }
    };

    const handleOpenAddPanel = async () => {
        if (showAddPanel) { setShowAddPanel(false); return; }
        setShowAddPanel(true);
        if (availableCases.length > 0) return;
        setLoadingAvail(true);
        try {
            const res = await testSuitesApi.availableTestCases(id, { limit: 200 }) as any;
            setAvailableCases(Array.isArray(res.data) ? res.data : []);
        } catch { /* ignore */ }
        finally { setLoadingAvail(false); }
    };

    const handleAddCases = async () => {
        if (selectedIds.size === 0) return;
        setAddingCases(true);
        try {
            await testSuitesApi.addTestCases(id, { test_case_ids: Array.from(selectedIds), position: 'end' });
            setSelectedIds(new Set());
            setAvailableCases([]);
            setShowAddPanel(false);
            setCaseSearch('');
            await loadSuite();
        } catch (err: any) {
            alert(err.message || 'Failed to add test cases');
        } finally {
            setAddingCases(false);
        }
    };

    const toggleSelect = (cid: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(cid) ? next.delete(cid) : next.add(cid);
            return next;
        });
    };

    // ── Loading / error states ──────────────────────────────────────────────

    if (loading) {
        return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;
    }

    if (error && !suite) {
        return (
            <div className="max-w-3xl mx-auto py-8 px-4">
                <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 p-6 rounded-2xl">
                    <h2 className="text-lg font-semibold mb-2">Error loading test suite</h2>
                    <p>{error}</p>
                    <Link href="/test/suites"><Button variant="outline" className="mt-4">Back to Test Suites</Button></Link>
                </div>
            </div>
        );
    }

    const passRate = suite?.last_run_pass_rate != null ? `${Math.round(suite.last_run_pass_rate * 100)}%` : null;
    const lastRun  = suite?.last_run_date ? format(new Date(suite.last_run_date), 'dd MMM, yyyy') : null;
    const filteredAvailable = availableCases.filter(tc =>
        !caseSearch || tc.title?.toLowerCase().includes(caseSearch.toLowerCase()) || tc.test_case_id?.toLowerCase().includes(caseSearch.toLowerCase())
    );

    return (
        <div className="max-w-[1400px] mx-auto px-6 py-6">

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="flex items-start justify-between mb-6 gap-6">
                <div className="flex items-start gap-3 min-w-0">
                    <button
                        onClick={handleCancel}
                        className="mt-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors flex-shrink-0"
                        title="Cancel"
                    >
                        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
                    </button>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                            <Link href="/test/suites" className="hover:text-slate-600 dark:hover:text-slate-200">Test Suite</Link>
                            <span className="text-slate-300 dark:text-slate-600">/</span>
                            <span className="font-mono font-semibold text-violet-600 dark:text-violet-300">{suite?.suite_id}</span>
                            <span className="text-slate-300 dark:text-slate-600">/</span>
                            <span className="text-slate-500 dark:text-slate-300 font-medium">Edit</span>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight truncate max-w-[680px]">
                                {name || suite?.name}
                            </h1>
                            <StatusPill status={status} />
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">Update fields and click Save to persist changes.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 pt-1">
                    <Button variant="secondary" onClick={handleCancel}>Cancel</Button>
                    <Button variant="primary" onClick={handleSave} disabled={submitting}>
                        <span dangerouslySetInnerHTML={{ __html: ICON_SAVE }} />
                        {submitting ? 'Saving…' : 'Save Changes'}
                    </Button>
                </div>
            </div>

            {/* ── Error banner ─────────────────────────────────────────────── */}
            {error && (
                <div className="mb-5 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 px-4 py-3 rounded-xl text-sm">
                    {error}
                </div>
            )}

            {/* ── 3-column grid ────────────────────────────────────────────── */}
            <div className="grid grid-cols-12 gap-6 items-start">

                {/* Left: section nav */}
                <aside className="col-span-2 hidden lg:block">
                    <SectionNav activeId={activeSection} />
                </aside>

                {/* Centre: form sections */}
                <div className="col-span-12 lg:col-span-7 space-y-5">

                    {/* ─ 1. General ─ */}
                    <EFSection id="suite-general" icon={ICON_SUITE} accent="violet" title="General" description="Identity, classification, and ownership.">
                        <EFField label="Suite title" full required>
                            <EFInput value={name} onChange={e => setName(e.target.value)} placeholder="Enter suite name…" />
                        </EFField>
                        <EFField label="Status">
                            <EFSelect value={status} onChange={e => setStatus(e.target.value)}>
                                <option value="draft">Draft</option>
                                <option value="active">Active</option>
                                <option value="archived">Archived</option>
                            </EFSelect>
                        </EFField>
                        <EFField label="Type">
                            <EFSelect value={suiteType} onChange={e => setSuiteType(e.target.value as SuiteType)}>
                                <option value="smoke">Smoke</option>
                                <option value="regression">Regression</option>
                                <option value="acceptance">Acceptance</option>
                                <option value="performance">Performance</option>
                                <option value="security">Security</option>
                                <option value="other">Other</option>
                            </EFSelect>
                        </EFField>
                        <EFField label="Project" hint="Project cannot be changed after creation">
                            <EFInput value={suite?.project_name || suite?.project_id || ''} readOnly />
                        </EFField>
                        <EFField label="Readiness scope">
                            <EFSelect value={readinessScope} onChange={e => setReadinessScope(e.target.value as ReadinessScope)}>
                                <option value="required">Required</option>
                                <option value="optional">Optional</option>
                            </EFSelect>
                        </EFField>
                        <EFField label="Owner" hint="Set via user management">
                            <EFInput value={suite?.created_by_name || ''} readOnly />
                        </EFField>
                    </EFSection>

                    {/* ─ 2. Description ─ */}
                    <EFSection id="suite-description" icon={ICON_DESCRIBE} accent="indigo" title="Description" description="What this suite covers and why it exists." columns={1}>
                        <EFField label="Description">
                            <EFTextarea
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="End-to-end coverage of the feature, including edge cases and recovery paths…"
                                rows={5}
                            />
                        </EFField>
                    </EFSection>

                    {/* ─ 3. Test cases ─ */}
                    <EFSection
                        id="suite-cases"
                        icon={ICON_CASE}
                        accent="emerald"
                        title="Test cases"
                        description={`${testCases.length} case${testCases.length !== 1 ? 's' : ''} linked to this suite.`}
                        columns={1}
                    >
                        {/* Actions row */}
                        <div className="col-span-2 -m-2">
                            <div className="flex items-center justify-between mb-3 px-2">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleOpenAddPanel}
                                        className="inline-flex items-center gap-1.5 h-8 px-3 text-xs rounded-lg bg-white/50 hover:bg-white/70 dark:bg-slate-800/50 dark:hover:bg-slate-700/70 backdrop-blur-md text-slate-800 dark:text-slate-100 border border-slate-200/40 dark:border-slate-600/40 shadow-sm transition-all font-medium"
                                    >
                                        <span dangerouslySetInnerHTML={{ __html: ICON_PLUS }} />
                                        {showAddPanel ? 'Close panel' : 'Add cases'}
                                    </button>
                                </div>
                                <div className="text-xs text-slate-400">{testCases.length} case{testCases.length !== 1 ? 's' : ''}</div>
                            </div>

                            {/* Add cases panel */}
                            {showAddPanel && (
                                <div className="mb-4 rounded-xl border border-violet-200/60 dark:border-violet-700/40 bg-violet-50/40 dark:bg-violet-900/10 p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Add test cases</h3>
                                        {selectedIds.size > 0 && (
                                            <button
                                                onClick={handleAddCases}
                                                disabled={addingCases}
                                                className="inline-flex items-center gap-1.5 h-7 px-3 text-xs rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold shadow-lg shadow-indigo-500/30 disabled:opacity-50 transition-all"
                                            >
                                                {addingCases ? 'Adding…' : `Add ${selectedIds.size} case${selectedIds.size !== 1 ? 's' : ''}`}
                                            </button>
                                        )}
                                    </div>

                                    {/* Search */}
                                    <div className="relative mb-3">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                                            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                                        </svg>
                                        <input
                                            type="text"
                                            placeholder="Search by ID or title…"
                                            value={caseSearch}
                                            onChange={e => setCaseSearch(e.target.value)}
                                            className="w-full h-8 pl-8 pr-3 rounded-lg text-xs bg-white/60 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-700/60 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all"
                                        />
                                    </div>

                                    {loadingAvail ? (
                                        <div className="flex items-center justify-center py-6"><Spinner size="sm" /></div>
                                    ) : filteredAvailable.length === 0 ? (
                                        <p className="text-xs text-slate-400 text-center py-4">
                                            {caseSearch ? 'No matching test cases.' : 'No additional test cases available to add.'}
                                        </p>
                                    ) : (
                                        <>
                                            <div className="mb-2 px-1">
                                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedIds.size === filteredAvailable.length && filteredAvailable.length > 0}
                                                        ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filteredAvailable.length; }}
                                                        onChange={() => {
                                                            if (selectedIds.size === filteredAvailable.length) {
                                                                setSelectedIds(new Set());
                                                            } else {
                                                                setSelectedIds(new Set(filteredAvailable.map((tc: any) => tc.id)));
                                                            }
                                                        }}
                                                        className="h-3.5 w-3.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                                                    />
                                                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                                        Select all ({filteredAvailable.length})
                                                    </span>
                                                </label>
                                            </div>
                                            <div className="max-h-56 overflow-y-auto space-y-0.5 rounded-lg border border-slate-200/50 dark:border-slate-700/50 bg-white/60 dark:bg-slate-900/40 divide-y divide-slate-100 dark:divide-slate-800">
                                                {filteredAvailable.map((tc: any) => (
                                                    <label key={tc.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-violet-50/60 dark:hover:bg-violet-900/10 transition-colors">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedIds.has(tc.id)}
                                                            onChange={() => toggleSelect(tc.id)}
                                                            className="h-3.5 w-3.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500 flex-shrink-0"
                                                        />
                                                        <span className="font-mono text-[11px] font-semibold text-violet-600 dark:text-violet-300 flex-shrink-0 w-20">{tc.test_case_id}</span>
                                                        <span className="text-xs text-slate-700 dark:text-slate-200 flex-1 truncate">{tc.title}</span>
                                                        {tc.priority && <PriorityBadge priority={tc.priority} />}
                                                    </label>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Test cases list */}
                            {testCases.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 py-10 text-center">
                                    <p className="text-sm text-slate-400">No test cases yet. Click &ldquo;Add cases&rdquo; to get started.</p>
                                </div>
                            ) : (
                                <div className="rounded-xl border border-slate-200/60 dark:border-slate-700/60 divide-y divide-slate-100 dark:divide-slate-800 bg-white/40 dark:bg-slate-900/30 backdrop-blur-md">
                                    {testCases.map((tc, i) => (
                                        <div
                                            key={tc.junction_id || tc.id}
                                            className="flex items-center gap-3 px-3 py-2.5 hover:bg-violet-50/40 dark:hover:bg-violet-900/10 transition-colors group"
                                        >
                                            <span className="text-slate-300 dark:text-slate-600 cursor-grab flex-shrink-0" dangerouslySetInnerHTML={{ __html: ICON_DRAG }} />
                                            <span className="text-[11px] tabular-nums text-slate-400 w-6 flex-shrink-0">{String(i + 1).padStart(2, '0')}</span>
                                            <Link
                                                href={`/test/cases/${tc.test_case_id}`}
                                                className="font-mono text-xs font-semibold text-violet-600 dark:text-violet-300 w-20 flex-shrink-0 hover:underline"
                                            >
                                                {tc.test_case_id_display || tc.test_case_id}
                                            </Link>
                                            <Link
                                                href={`/test/cases/${tc.test_case_id}`}
                                                className="text-sm text-slate-800 dark:text-slate-100 font-medium flex-1 truncate hover:underline"
                                            >
                                                {tc.title}
                                            </Link>
                                            <PriorityBadge priority={tc.priority} />
                                            <CaseBadge status={tc.latest_execution_status || tc.status} />
                                            <button
                                                onClick={() => handleRemoveCase(tc.test_case_id)}
                                                disabled={removingId === tc.test_case_id}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-rose-500 disabled:opacity-40 flex-shrink-0"
                                                title="Remove from suite"
                                            >
                                                {removingId === tc.test_case_id
                                                    ? <Spinner size="sm" />
                                                    : <span dangerouslySetInnerHTML={{ __html: ICON_TRASH }} />}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </EFSection>
                </div>

                {/* Right: meta panel */}
                <aside className="col-span-12 lg:col-span-3 space-y-5">
                    <div className="lg:sticky lg:top-4 space-y-5">
                        <MetaCard title="At a glance">
                            <MetaRow label="Suite ID"   value={suite?.suite_id} mono />
                            <MetaRow label="Project"    value={suite?.project_name || suite?.project_id} />
                            <MetaRow label="Owner"      value={suite?.created_by_name} />
                            <MetaRow label="Cases"      value={testCases.length} />
                            <MetaRow label="Last run"   value={lastRun ?? 'Never'} />
                            <MetaRow label="Pass rate"  value={passRate ?? '—'} />
                        </MetaCard>

                        <MetaCard title="Metadata">
                            <MetaRow
                                label="Created"
                                value={suite?.created_at ? formatDistanceToNow(new Date(suite.created_at), { addSuffix: true }) : undefined}
                            />
                            <MetaRow
                                label="Updated"
                                value={suite?.updated_at ? formatDistanceToNow(new Date(suite.updated_at), { addSuffix: true }) : undefined}
                            />
                            <MetaRow label="Updated by" value={suite?.updated_by_name} />
                        </MetaCard>
                    </div>
                </aside>
            </div>

            {/* ── Sticky action bar ─────────────────────────────────────────── */}
            <div className="sticky bottom-4 mt-6 z-10">
                <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-white/40 dark:border-slate-700/40 rounded-2xl px-4 py-3 flex items-center justify-between shadow-xl shadow-black/10">
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span dangerouslySetInnerHTML={{ __html: ICON_INFO }} />
                        <span>Unsaved changes will be lost on cancel</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="secondary" onClick={handleCancel} disabled={submitting}>Cancel</Button>
                        <Button variant="primary" onClick={handleSave} disabled={submitting}>
                            <span dangerouslySetInnerHTML={{ __html: ICON_SAVE }} />
                            {submitting ? 'Saving…' : 'Save Changes'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

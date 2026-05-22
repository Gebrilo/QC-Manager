'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { testCasesApi, projectsApi, type Project } from '@/lib/api';
import * as XLSX from 'xlsx';

// ── Schema definition (13 columns) ─────────────────────────────────────────

const SCHEMA = [
    { col: 'title',         type: 'text',      required: true,  example: 'Verify login with valid credentials',           desc: 'Short, action-first summary' },
    { col: 'type',          type: 'enum',      required: true,  example: 'Functional',                                    desc: 'Functional · Smoke · Regression · Performance · Security' },
    { col: 'priority',      type: 'enum',      required: true,  example: 'Medium',                                        desc: 'Critical · High · Medium · Low' },
    { col: 'automation',    type: 'enum',      required: false, example: 'Manual',                                        desc: 'Manual · Automated · Ready' },
    { col: 'preconditions', type: 'long_text', required: false, example: 'User account exists; on /login page',           desc: 'Setup state before steps run' },
    { col: 'steps',         type: 'long_text', required: true,  example: '1. Enter email\n2. Enter password\n3. Click Sign in', desc: 'Numbered list; one step per line' },
    { col: 'expected',      type: 'long_text', required: true,  example: 'User lands on dashboard with welcome toast',    desc: 'Outcome to assert' },
    { col: 'suite',         type: 'text',      required: false, example: 'Authentication / Login',                        desc: 'Optional grouping — maps to category' },
    { col: 'tags',          type: 'csv',       required: false, example: 'login,smoke,p1',                                desc: 'Comma-separated; lowercase, no spaces' },
    { col: 'labels',        type: 'csv',       required: false, example: 'iOS,Web',                                       desc: 'Platform labels — appended to tags' },
    { col: 'component',     type: 'text',      required: false, example: 'Auth Service',                                  desc: 'System component under test' },
    { col: 'owner_email',   type: 'email',     required: false, example: 'ali@windis.com',                                desc: 'Informational — not imported to API' },
    { col: 'linked_story',  type: 'ref',       required: false, example: 'US-00045',                                      desc: 'User Story reference (linked_requirement_id)' },
] as const;

const TYPE_TONE: Record<string, string> = {
    text:      'text-slate-500 dark:text-slate-400',
    long_text: 'text-violet-600 dark:text-violet-300',
    enum:      'text-blue-600 dark:text-blue-300',
    email:     'text-emerald-600 dark:text-emerald-300',
    csv:       'text-amber-600 dark:text-amber-300',
    ref:       'text-indigo-600 dark:text-indigo-300',
};

// ── CSV/XLSX column → API field mapping ────────────────────────────────────

const TYPE_MAP: Record<string, string> = {
    functional: 'functional', smoke: 'smoke', regression: 'regression',
    performance: 'performance', security: 'security', integration: 'integration',
    usability: 'usability', exploratory: 'exploratory', automated: 'automated',
};

const PRIORITY_MAP: Record<string, string> = {
    critical: 'critical', high: 'high', medium: 'medium', low: 'low',
};

const AUTOMATION_MAP: Record<string, string> = {
    manual: 'manual', automated: 'automated', ready: 'to_automate',
    partial: 'partial', 'to automate': 'to_automate', to_automate: 'to_automate',
};

// ── Row type ───────────────────────────────────────────────────────────────

interface ParsedRow {
    rowNum: number;
    raw: Record<string, string>;
    title: string;
    type: string;
    priority: string;
    automation: string;
    suite: string;
    errors: { col: string; msg: string }[];
}

// ── Parse spreadsheet ──────────────────────────────────────────────────────

function parseSpreadsheet(file: File): Promise<{ rows: ParsedRow[]; totalRows: number }> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target!.result as ArrayBuffer);
                const wb = XLSX.read(data, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const jsonRows: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' });

                const parsed: ParsedRow[] = jsonRows.slice(0, 500).map((raw, idx) => {
                    const errors: { col: string; msg: string }[] = [];
                    const title = (raw.title || '').trim();
                    const typeRaw = (raw.type || '').trim().toLowerCase();
                    const priorityRaw = (raw.priority || '').trim().toLowerCase();
                    const automationRaw = (raw.automation || '').trim().toLowerCase();

                    if (!title) errors.push({ col: 'title', msg: 'Missing required value' });
                    if (!typeRaw) {
                        errors.push({ col: 'type', msg: 'Missing required value' });
                    } else if (!TYPE_MAP[typeRaw]) {
                        errors.push({ col: 'type', msg: `Invalid value '${raw.type}' — must be Functional, Smoke, Regression, Performance, Security, Integration, Usability, Exploratory, or Automated` });
                    }
                    if (!priorityRaw) {
                        errors.push({ col: 'priority', msg: 'Missing required value' });
                    } else if (!PRIORITY_MAP[priorityRaw]) {
                        errors.push({ col: 'priority', msg: `Invalid value '${raw.priority}' — must be Critical, High, Medium, or Low` });
                    }
                    if (automationRaw && !AUTOMATION_MAP[automationRaw]) {
                        errors.push({ col: 'automation', msg: `Invalid value '${raw.automation}' — must be Manual, Automated, or Ready` });
                    }

                    return {
                        rowNum: idx + 2,
                        raw,
                        title,
                        type: TYPE_MAP[typeRaw] || typeRaw || '—',
                        priority: priorityRaw || '—',
                        automation: AUTOMATION_MAP[automationRaw] || automationRaw || 'manual',
                        suite: (raw.suite || '').trim(),
                        errors,
                    };
                });

                resolve({ rows: parsed, totalRows: jsonRows.length });
            } catch {
                reject(new Error('Could not parse file. Make sure it is a valid CSV or Excel file.'));
            }
        };
        reader.onerror = () => reject(new Error('Failed to read file.'));
        reader.readAsArrayBuffer(file);
    });
}

// ── Convert row to API payload ─────────────────────────────────────────────

function rowToApiPayload(row: ParsedRow) {
    const raw = row.raw;
    const tags: string[] = [];
    if (raw.tags) tags.push(...raw.tags.split(',').map(t => t.trim()).filter(Boolean));
    if (raw.labels) tags.push(...raw.labels.split(',').map(t => t.trim()).filter(Boolean));

    return {
        title: row.title,
        test_type: TYPE_MAP[row.raw.type?.trim().toLowerCase()] || 'functional',
        priority: PRIORITY_MAP[row.raw.priority?.trim().toLowerCase()] || 'medium',
        automation_status: AUTOMATION_MAP[row.raw.automation?.trim().toLowerCase()] || 'manual',
        preconditions: raw.preconditions || undefined,
        test_steps: raw.steps || undefined,
        expected_result: raw.expected || undefined,
        category: raw.suite || 'other',
        component: raw.component || undefined,
        tags: tags.length ? tags : [],
        linked_requirement_id: raw.linked_story || undefined,
        status: 'Not Run' as const,
    };
}

// ── Template download ──────────────────────────────────────────────────────

function downloadCSVTemplate() {
    const headers = SCHEMA.map(s => s.col).join(',');
    const example = SCHEMA.map(s => `"${s.example.replace(/"/g, '""').replace(/\n/g, ' ')}"`).join(',');
    const blob = new Blob([headers + '\n' + example + '\n'], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'test-cases-template.csv';
    a.click();
    URL.revokeObjectURL(url);
}

function downloadXLSXTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
        SCHEMA.map(s => s.col),
        SCHEMA.map(s => s.example.replace(/\n/g, ' ')),
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Test Cases');
    XLSX.writeFile(wb, 'test-cases-template.xlsx');
}

// ── SVG icons ─────────────────────────────────────────────────────────────

function Icon({ d, size = 16, sw = 1.75, fill = 'none' }: { d: React.ReactNode; size?: number; sw?: number; fill?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
            {d}
        </svg>
    );
}

const ICONS = {
    back:     <><path d="M15 18l-6-6 6-6"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></>,
    upload:   <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></>,
    file:     <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></>,
    check:    <path d="M5 13l4 4L19 7" strokeWidth={2.25}/>,
    x:        <><path d="M18 6L6 18"/><path d="M6 6l12 12"/></>,
    warn:     <><path d="M10.3 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></>,
    eye:      <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
    trash:    <><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></>,
    chevDown: <path d="M6 9l6 6 6-6" strokeWidth={2}/>,
    csv:      <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h8M8 9h2"/></>,
    xlsx:     <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13l6 6M15 13l-6 6"/></>,
};

// ── Step header ────────────────────────────────────────────────────────────

function StepHeader({ n, title, subtitle, done }: { n: number; title: string; subtitle: string; done?: boolean }) {
    return (
        <div className="flex items-start gap-3 mb-3 px-1">
            <div className={[
                'w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold transition-all',
                done
                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                    : 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-md shadow-violet-500/30',
            ].join(' ')}>
                {done ? <Icon d={ICONS.check} size={14} sw={2.5} /> : n}
            </div>
            <div className="flex-1">
                <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">{title}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
            </div>
        </div>
    );
}

// ── Glass select ───────────────────────────────────────────────────────────

function GlassSelect({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
    return (
        <div className="relative">
            <select
                value={value}
                onChange={e => onChange(e.target.value)}
                className="w-full appearance-none h-10 pl-3.5 pr-8 rounded-lg bg-white/60 dark:bg-slate-900/50 backdrop-blur-md border border-slate-200/60 dark:border-slate-700/60 text-sm text-slate-700 dark:text-slate-200 hover:border-violet-400/60 focus:outline-none focus:border-violet-500 transition-all cursor-pointer"
            >
                {children}
            </select>
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <Icon d={ICONS.chevDown} size={14} sw={2} />
            </span>
        </div>
    );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function BulkUploadTestCasesPage() {
    const router = useRouter();

    // Projects
    const [projects, setProjects] = useState<Project[]>([]);
    const [defaultProjectId, setDefaultProjectId] = useState('');

    // File state
    const [file, setFile] = useState<File | null>(null);
    const [fileInfo, setFileInfo] = useState<{ name: string; size: string; rows: number } | null>(null);
    const [dragging, setDragging] = useState(false);
    const [parsing, setParsing] = useState(false);
    const [parseError, setParseError] = useState('');
    const [rows, setRows] = useState<ParsedRow[]>([]);
    const [totalRows, setTotalRows] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    // Options
    const [onDuplicate, setOnDuplicate] = useState('skip');
    const [onError, setOnError] = useState('skip');

    // Schema panel
    const [showSchema, setShowSchema] = useState(true);

    // Template downloads
    const [downloaded, setDownloaded] = useState({ csv: false, xlsx: false });

    // Preview
    const [showOnlyErrors, setShowOnlyErrors] = useState(false);

    // Import
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<{ summary: { total: number; imported: number; duplicates: number; errors: number }; details: any } | null>(null);
    const [importError, setImportError] = useState('');

    useEffect(() => {
        projectsApi.list().then(setProjects).catch(() => {});
    }, []);

    // ── File handling ──────────────────────────────────────────────────────

    const processFile = useCallback(async (f: File) => {
        if (!f.name.match(/\.(csv|xlsx)$/i)) {
            setParseError('Please upload a .csv or .xlsx file.');
            return;
        }
        if (f.size > 5 * 1024 * 1024) {
            setParseError('File exceeds 5 MB limit.');
            return;
        }
        setParsing(true);
        setParseError('');
        setImportResult(null);
        setImportError('');
        try {
            const { rows: parsed, totalRows: total } = await parseSpreadsheet(f);
            setRows(parsed);
            setTotalRows(total);
            setFile(f);
            setFileInfo({ name: f.name, size: `${(f.size / 1024).toFixed(0)} KB`, rows: total });
        } catch (err: any) {
            setParseError(err.message || 'Failed to parse file.');
        } finally {
            setParsing(false);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) processFile(f);
    }, [processFile]);

    const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (f) processFile(f);
    }, [processFile]);

    const removeFile = () => {
        setFile(null);
        setFileInfo(null);
        setRows([]);
        setTotalRows(0);
        setParseError('');
        setImportResult(null);
        setImportError('');
        if (inputRef.current) inputRef.current.value = '';
    };

    // ── Import ─────────────────────────────────────────────────────────────

    const handleImport = async () => {
        if (!defaultProjectId) { setImportError('Please select a default project.'); return; }
        const validRows = rows.filter(r => r.errors.length === 0);
        if (validRows.length === 0) { setImportError('No valid rows to import.'); return; }
        setImporting(true);
        setImportError('');
        try {
            const payload = validRows.map(r => rowToApiPayload(r));
            const result = await testCasesApi.bulkImport({ test_cases: payload, project_id: defaultProjectId }) as any;
            setImportResult(result);
        } catch (err: any) {
            setImportError(err.message || 'Import failed. Please try again.');
        } finally {
            setImporting(false);
        }
    };

    // ── Derived ────────────────────────────────────────────────────────────

    const validCount   = rows.filter(r => r.errors.length === 0).length;
    const errorCount   = rows.filter(r => r.errors.length > 0).length;
    const previewRows  = showOnlyErrors ? rows.filter(r => r.errors.length > 0) : rows;
    const canImport    = !!file && !!defaultProjectId && validCount > 0 && !importing && !importResult;

    // ── Success screen ─────────────────────────────────────────────────────

    if (importResult) {
        const s = importResult.summary;
        return (
            <div className="max-w-3xl mx-auto px-6 py-16 flex flex-col items-center text-center gap-6">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white shadow-xl shadow-emerald-500/30">
                    <Icon d={ICONS.check} size={36} sw={2.5} />
                </div>
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Import complete</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1.5">{s.imported} test case{s.imported !== 1 ? 's' : ''} were added to your project.</p>
                </div>
                <div className="flex items-center gap-4 w-full max-w-md">
                    {[
                        { label: 'Imported',   value: s.imported,   tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
                        { label: 'Duplicates', value: s.duplicates, tone: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
                        { label: 'Errors',     value: s.errors,     tone: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' },
                    ].map(item => (
                        <div key={item.label} className={`flex-1 rounded-xl p-4 ${item.tone} text-center`}>
                            <div className="text-2xl font-bold tabular-nums">{item.value}</div>
                            <div className="text-xs font-semibold mt-0.5 uppercase tracking-wider">{item.label}</div>
                        </div>
                    ))}
                </div>
                <div className="flex items-center gap-3">
                    <Link href="/test/cases" className="inline-flex items-center gap-2 px-5 h-10 rounded-lg text-sm font-semibold bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-md shadow-violet-500/30 hover:from-violet-600 hover:to-indigo-700 active:scale-95 transition-all">
                        View Test Cases
                    </Link>
                    <button onClick={() => { setImportResult(null); removeFile(); }} className="px-5 h-10 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        Upload Another
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-32 space-y-8">

            {/* ── Header ─────────────────────────────────────────────── */}
            <div>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-2">
                    <span>Quality</span>
                    <span className="text-slate-300 dark:text-slate-600">/</span>
                    <Link href="/test/cases" className="hover:text-violet-600 dark:hover:text-violet-300 transition-colors">Cases</Link>
                    <span className="text-slate-300 dark:text-slate-600">/</span>
                    <span className="text-slate-700 dark:text-slate-200 font-semibold">Bulk upload</span>
                </div>
                <div className="flex items-center gap-3">
                    <Link href="/test/cases" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" title="Back to Cases">
                        <Icon d={ICONS.back} />
                    </Link>
                    <h1 className="text-[28px] font-bold text-slate-900 dark:text-white tracking-tight leading-none">Bulk Upload Test Cases</h1>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 ml-8">
                    Import many test cases from a single spreadsheet — download the template, fill it in, then upload it back.
                </p>
            </div>

            {/* ── Step 1: Download template ──────────────────────────── */}
            <div className="space-y-4">
                <StepHeader n={1} title="Download the template" subtitle="Use one of these spreadsheets so your columns match what QC expects." />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 ml-10">
                    {/* XLSX card */}
                    <div className="relative bg-white/70 dark:bg-slate-900/50 backdrop-blur-md border border-white/40 dark:border-slate-700/40 rounded-2xl p-5 shadow-[0_4px_30px_rgba(0,0,0,0.05)] flex items-center gap-4 hover:border-violet-400/60 transition-all">
                        <span className="absolute -top-2.5 left-5 px-2 py-0.5 rounded-full bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-[9px] uppercase tracking-wider font-bold shadow-md shadow-violet-500/30">Recommended</span>
                        <div className="w-14 h-14 shrink-0 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
                            <Icon d={ICONS.xlsx} size={24} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Excel template</h3>
                                <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 font-mono">xlsx</span>
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">13 columns · sample row included</p>
                        </div>
                        <button
                            onClick={() => { downloadXLSXTemplate(); setDownloaded(p => ({ ...p, xlsx: true })); }}
                            className={[
                                'inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg text-xs font-semibold transition-all shrink-0',
                                downloaded.xlsx
                                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-md shadow-violet-500/30 hover:from-violet-600 hover:to-indigo-700 active:scale-95',
                            ].join(' ')}
                        >
                            {downloaded.xlsx ? <Icon d={ICONS.check} size={14} sw={2.25} /> : <Icon d={ICONS.download} size={14} />}
                            {downloaded.xlsx ? 'Downloaded' : 'Download'}
                        </button>
                    </div>

                    {/* CSV card */}
                    <div className="bg-white/70 dark:bg-slate-900/50 backdrop-blur-md border border-white/40 dark:border-slate-700/40 rounded-2xl p-5 shadow-[0_4px_30px_rgba(0,0,0,0.05)] flex items-center gap-4 hover:border-violet-400/60 transition-all">
                        <div className="w-14 h-14 shrink-0 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/30">
                            <Icon d={ICONS.csv} size={24} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-bold text-slate-900 dark:text-white">CSV template</h3>
                                <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 font-mono">csv</span>
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">13 columns · sample row included</p>
                        </div>
                        <button
                            onClick={() => { downloadCSVTemplate(); setDownloaded(p => ({ ...p, csv: true })); }}
                            className={[
                                'inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg text-xs font-semibold transition-all shrink-0',
                                downloaded.csv
                                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-md shadow-violet-500/30 hover:from-violet-600 hover:to-indigo-700 active:scale-95',
                            ].join(' ')}
                        >
                            {downloaded.csv ? <Icon d={ICONS.check} size={14} sw={2.25} /> : <Icon d={ICONS.download} size={14} />}
                            {downloaded.csv ? 'Downloaded' : 'Download'}
                        </button>
                    </div>
                </div>

                {/* Schema reference */}
                <div className="ml-10">
                    <div className="bg-white/60 dark:bg-slate-900/50 backdrop-blur-md border border-white/40 dark:border-slate-700/40 rounded-2xl shadow-[0_4px_30px_rgba(0,0,0,0.05)] overflow-hidden">
                        <button
                            onClick={() => setShowSchema(v => !v)}
                            className="w-full px-5 py-3.5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-indigo-500/20 dark:from-violet-500/30 dark:to-indigo-500/30 flex items-center justify-center text-violet-700 dark:text-violet-300 border border-violet-200/50 dark:border-violet-500/20">
                                    <Icon d={ICONS.file} size={14} />
                                </div>
                                <div className="text-left">
                                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Schema reference · 13 columns</h3>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                        <span className="font-semibold text-rose-500">5 required</span> · 8 optional · header row is mandatory and column order does not matter
                                    </p>
                                </div>
                            </div>
                            <span className={`text-slate-400 transition-transform ${showSchema ? 'rotate-180' : ''}`}>
                                <Icon d={ICONS.chevDown} size={16} sw={2} />
                            </span>
                        </button>

                        {showSchema && (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-50/60 dark:bg-slate-900/30 text-[10px] uppercase tracking-wider font-bold text-slate-400">
                                            <th className="text-left font-bold py-2.5 pl-5 pr-3 w-[160px]">Column</th>
                                            <th className="text-left font-bold py-2.5 px-3 w-[90px]">Type</th>
                                            <th className="text-left font-bold py-2.5 px-3">Description</th>
                                            <th className="text-left font-bold py-2.5 px-3 pr-5">Example</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                                        {SCHEMA.map(s => (
                                            <tr key={s.col} className="hover:bg-violet-50/30 dark:hover:bg-violet-900/10 transition-colors">
                                                <td className="py-2.5 pl-5 pr-3 font-mono text-xs font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                                                    <span className="inline-flex items-center gap-2">
                                                        {s.col}
                                                        {s.required && <span className="text-[9px] uppercase tracking-wider font-bold text-rose-500 bg-rose-50 dark:bg-rose-900/20 px-1.5 py-0.5 rounded">req</span>}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    <span className={`text-[10px] uppercase tracking-wider font-bold font-mono ${TYPE_TONE[s.type]}`}>{s.type}</span>
                                                </td>
                                                <td className="py-2.5 px-3 text-xs text-slate-500 dark:text-slate-400">{s.desc}</td>
                                                <td className="py-2.5 px-3 pr-5 font-mono text-[11px] text-violet-700 dark:text-violet-300 max-w-[240px] truncate" title={s.example}>
                                                    {s.example.replace(/\n/g, ' ↵ ')}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Step 2: Upload ─────────────────────────────────────── */}
            <div className="space-y-4">
                <StepHeader n={2} title="Upload your filled spreadsheet" subtitle="Drag a file or click to browse. We'll validate it before importing." done={!!file} />

                <div className="ml-10 space-y-4">
                    {!file ? (
                        <div
                            onDragOver={e => { e.preventDefault(); setDragging(true); }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={handleDrop}
                            onClick={() => inputRef.current?.click()}
                            className={[
                                'relative rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-all',
                                dragging
                                    ? 'border-violet-500 bg-violet-50/50 dark:bg-violet-900/20 scale-[1.01]'
                                    : 'border-slate-300/70 dark:border-slate-700/70 bg-white/30 dark:bg-slate-900/30 backdrop-blur-md hover:border-violet-400 dark:hover:border-violet-500/60 hover:bg-violet-50/30 dark:hover:bg-violet-900/10',
                                parsing ? 'opacity-60 pointer-events-none' : '',
                            ].join(' ')}
                        >
                            <div className="flex flex-col items-center gap-3">
                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 dark:from-violet-500/20 dark:to-indigo-500/20 border border-violet-200/50 dark:border-violet-500/20 flex items-center justify-center text-violet-500">
                                    {parsing
                                        ? <div className="w-7 h-7 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
                                        : <Icon d={ICONS.upload} size={28} sw={1.75} />}
                                </div>
                                <div>
                                    <div className="text-base font-semibold text-slate-800 dark:text-slate-100">
                                        {parsing ? 'Parsing file…' : dragging ? 'Drop your spreadsheet here' : 'Drop your spreadsheet here, or click to browse'}
                                    </div>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Accepts .xlsx · .csv · max 5 MB · up to 500 rows previewed</p>
                                </div>
                            </div>
                            <input ref={inputRef} type="file" className="hidden" accept=".csv,.xlsx" onChange={handleFileInput} />
                        </div>
                    ) : (
                        <div className="bg-white/70 dark:bg-slate-900/50 backdrop-blur-md border border-emerald-300/60 dark:border-emerald-500/30 rounded-2xl p-5 shadow-[0_4px_30px_rgba(16,185,129,0.1)] flex items-center gap-4">
                            <div className="w-12 h-12 shrink-0 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/30">
                                <Icon d={ICONS.file} size={20} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">{fileInfo!.name}</span>
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-[10px] uppercase tracking-wider font-bold">
                                        <Icon d={ICONS.check} size={10} sw={2.5} /> Parsed
                                    </span>
                                </div>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                    {fileInfo!.size} · {fileInfo!.rows} rows detected · 13 columns matched
                                </p>
                            </div>
                            <button onClick={removeFile} className="inline-flex items-center gap-1 px-3 h-8 rounded-md text-xs font-medium text-slate-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors">
                                <Icon d={ICONS.trash} size={13} /> Remove
                            </button>
                        </div>
                    )}

                    {parseError && (
                        <div className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-900/20 p-4 flex items-center gap-3 text-sm text-rose-700 dark:text-rose-300">
                            <Icon d={ICONS.warn} size={16} />
                            {parseError}
                        </div>
                    )}

                    {/* Options */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                            <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 mb-1.5">Default project</label>
                            <GlassSelect value={defaultProjectId} onChange={setDefaultProjectId}>
                                <option value="">Select project…</option>
                                {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
                            </GlassSelect>
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 mb-1.5">On duplicate title</label>
                            <GlassSelect value={onDuplicate} onChange={setOnDuplicate}>
                                <option value="skip">Skip and keep original</option>
                                <option value="overwrite">Overwrite existing</option>
                            </GlassSelect>
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 mb-1.5">On error rows</label>
                            <GlassSelect value={onError} onChange={setOnError}>
                                <option value="skip">Skip and continue</option>
                                <option value="abort">Abort entire import</option>
                            </GlassSelect>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Step 3: Preview & validate ─────────────────────────── */}
            {file && rows.length > 0 ? (
                <div className="space-y-4">
                    <StepHeader n={3} title="Preview & validate" subtitle="We've parsed your file. Fix or skip rows with errors before importing." />

                    <div className="ml-10 space-y-4">
                        {/* Stat pills + actions */}
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                                {[
                                    { label: 'Total',  value: rows.length,  tone: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200/60 dark:border-slate-700/60' },
                                    { label: 'Valid',  value: validCount,   tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-500/30' },
                                    { label: 'Errors', value: errorCount,   tone: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border-rose-200/60 dark:border-rose-500/30' },
                                ].map(pill => (
                                    <div key={pill.label} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${pill.tone}`}>
                                        <span className="text-[10px] uppercase tracking-wider font-bold">{pill.label}</span>
                                        <span className="text-sm font-bold tabular-nums">{pill.value}</span>
                                    </div>
                                ))}
                                {totalRows > rows.length && (
                                    <span className="text-xs text-slate-400 dark:text-slate-500">(previewing first {rows.length} of {totalRows})</span>
                                )}
                            </div>
                            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={showOnlyErrors}
                                    onChange={() => setShowOnlyErrors(v => !v)}
                                    className="w-3.5 h-3.5 accent-violet-600"
                                />
                                Show only errors
                            </label>
                        </div>

                        {/* Preview table */}
                        <div className="bg-white/60 dark:bg-slate-900/50 backdrop-blur-md border border-white/40 dark:border-slate-700/40 rounded-2xl shadow-[0_4px_30px_rgba(0,0,0,0.05)] overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-50/60 dark:bg-slate-900/30 text-[10px] uppercase tracking-wider font-bold text-slate-400">
                                            <th className="text-left font-bold py-2.5 pl-5 pr-3 w-16">Row</th>
                                            <th className="text-left font-bold py-2.5 px-3 w-8">·</th>
                                            <th className="text-left font-bold py-2.5 px-3">Title</th>
                                            <th className="text-left font-bold py-2.5 px-3 w-28">Type</th>
                                            <th className="text-left font-bold py-2.5 px-3 w-24">Priority</th>
                                            <th className="text-left font-bold py-2.5 px-3 pr-5 w-28">Automation</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                                        {previewRows.map(r => {
                                            const hasError = r.errors.length > 0;
                                            const errCols  = new Set(r.errors.map(e => e.col));
                                            return (
                                                <>
                                                    <tr
                                                        key={`row-${r.rowNum}`}
                                                        className={`transition-colors ${hasError ? 'bg-rose-50/30 dark:bg-rose-900/10 hover:bg-rose-50/50 dark:hover:bg-rose-900/20' : 'hover:bg-violet-50/30 dark:hover:bg-violet-900/10'}`}
                                                    >
                                                        <td className="py-2.5 pl-5 pr-3 font-mono text-xs text-slate-500 dark:text-slate-400">#{r.rowNum}</td>
                                                        <td className="py-2.5 px-3">
                                                            {hasError ? (
                                                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300">
                                                                    <Icon d={ICONS.warn} size={12} />
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300">
                                                                    <Icon d={ICONS.check} size={12} sw={2.5} />
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className={`py-2.5 px-3 max-w-[360px] truncate ${errCols.has('title') ? 'text-rose-600 dark:text-rose-300 font-semibold italic' : 'text-slate-800 dark:text-slate-100'}`}>
                                                            {r.title || '— missing —'}
                                                        </td>
                                                        <td className={`py-2.5 px-3 ${errCols.has('type') ? 'text-rose-600 dark:text-rose-300 font-semibold' : 'text-slate-700 dark:text-slate-200'} capitalize`}>
                                                            {r.type}
                                                        </td>
                                                        <td className={`py-2.5 px-3 ${errCols.has('priority') ? 'text-rose-600 dark:text-rose-300 font-semibold' : 'text-slate-700 dark:text-slate-200'} capitalize`}>
                                                            {r.priority}
                                                        </td>
                                                        <td className="py-2.5 px-3 pr-5 text-slate-700 dark:text-slate-200 capitalize">
                                                            {r.automation.replace('_', ' ')}
                                                        </td>
                                                    </tr>
                                                    {hasError && r.errors.map((e, i) => (
                                                        <tr key={`err-${r.rowNum}-${i}`} className="bg-rose-50/40 dark:bg-rose-900/15">
                                                            <td colSpan={6} className="py-1.5 pl-5 pr-5">
                                                                <div className="flex items-center gap-2 text-[11px] text-rose-700 dark:text-rose-300 ml-8">
                                                                    <span className="text-rose-400">↳</span>
                                                                    <span className="font-mono font-semibold">{e.col}:</span>
                                                                    <span>{e.msg}</span>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-900/30 text-[11px] text-slate-500 dark:text-slate-400">
                                Showing {previewRows.length} of {rows.length} previewed rows · {totalRows} total in file
                            </div>
                        </div>
                    </div>
                </div>
            ) : !file && (
                <div className="ml-10 rounded-xl border border-slate-200/60 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-900/40 p-4 flex items-center gap-3">
                    <span className="text-slate-400"><Icon d={ICONS.eye} size={16} /></span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">Once you upload a file, we'll show a preview with row-by-row validation here.</span>
                </div>
            )}

            {/* ── Sticky footer ──────────────────────────────────────── */}
            <div className="fixed bottom-0 left-60 right-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-t border-slate-200/60 dark:border-slate-700/60 shadow-[0_-4px_30px_rgba(0,0,0,0.08)]">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs">
                        {importError && (
                            <span className="text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1.5">
                                <Icon d={ICONS.warn} size={13} /> {importError}
                            </span>
                        )}
                        {!importError && !file && (
                            <span className="text-slate-500 dark:text-slate-400">Upload a file to enable import.</span>
                        )}
                        {!importError && file && (
                            <>
                                <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                                    <Icon d={ICONS.check} size={13} sw={2.25} /> {validCount} valid
                                </span>
                                {errorCount > 0 && (
                                    <>
                                        <span className="text-slate-300 dark:text-slate-600">·</span>
                                        <span className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-semibold">
                                            <Icon d={ICONS.warn} size={13} /> {errorCount} error{errorCount !== 1 ? 's' : ''}
                                        </span>
                                    </>
                                )}
                                <span className="text-slate-300 dark:text-slate-600">·</span>
                                <span className="text-slate-500 dark:text-slate-400">{fileInfo!.rows} rows total</span>
                            </>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <Link href="/test/cases" className="text-sm px-4 h-10 inline-flex items-center rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors font-medium">
                            Cancel
                        </Link>
                        <button
                            disabled={!canImport}
                            onClick={handleImport}
                            className={[
                                'inline-flex items-center gap-1.5 text-sm font-semibold px-5 h-10 rounded-lg transition-all',
                                canImport
                                    ? 'bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-500/30 hover:from-violet-600 hover:to-indigo-700 active:scale-95'
                                    : 'bg-slate-200 dark:bg-slate-800/50 text-slate-400 cursor-not-allowed',
                            ].join(' ')}
                        >
                            {importing
                                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Importing…</>
                                : <><Icon d={ICONS.upload} size={15} /> {canImport ? `Import ${validCount} valid test case${validCount !== 1 ? 's' : ''}` : 'Import'}</>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

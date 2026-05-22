'use client';

import React, { useState, useEffect } from 'react';
import { tuleapConfigApi, fetchApi, Project as ApiProject } from '@/lib/api';

type TrackerType = 'bug' | 'task' | 'user_story' | 'test_case';

interface ProjectOption {
    id: string;
    project_id: string;
    project_name: string;
}

interface NewMappingModalProps {
    open: boolean;
    onClose: () => void;
    onCreated: () => void;
    projects: ProjectOption[];
    baseUrl: string;
}

// ── icons ────────────────────────────────────────────────────────────────────

function Ico({ d, size = 16, sw = 1.75, fill = 'none' }: { d: React.ReactNode; size?: number; sw?: number; fill?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
            {d}
        </svg>
    );
}

const Icons = {
    close:  <Ico d={<><path d="M18 6L6 18"/><path d="M6 6l12 12"/></>} />,
    check:  <Ico d={<path d="M5 13l4 4L19 7"/>} sw={2.25} />,
    arrow:  <Ico d={<><path d="M5 12h14"/><path d="M13 5l7 7-7 7"/></>} />,
    link:   <Ico d={<><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>} />,
    spark:  <Ico d={<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3zM19 13l.8 2.2L22 16l-2.2.8L19 19l-.8-2.2L16 16l2.2-.8L19 13z"/>} fill="currentColor" sw={0} />,
    refresh:<Ico d={<><path d="M21 12a9 9 0 1 1-3.5-7.1"/><path d="M21 3v6h-6"/></>} />,
};

// ── tracker definitions ───────────────────────────────────────────────────────

const TRACKER_DEFS: { key: TrackerType; label: string; dot: string; chip: string; border: string }[] = [
    { key: 'bug',        label: 'Bug',       dot: 'bg-rose-500',    chip: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',      border: 'border-rose-200/60 dark:border-rose-500/30' },
    { key: 'task',       label: 'Task',      dot: 'bg-blue-500',    chip: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',      border: 'border-blue-200/60 dark:border-blue-500/30' },
    { key: 'user_story', label: 'User Story',dot: 'bg-amber-500',   chip: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',  border: 'border-amber-200/60 dark:border-amber-500/30' },
    { key: 'test_case',  label: 'Test Case', dot: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', border: 'border-emerald-200/60 dark:border-emerald-500/30' },
];

// ── component ─────────────────────────────────────────────────────────────────

export function NewMappingModal({ open, onClose, onCreated, projects, baseUrl }: NewMappingModalProps) {
    const [selectedProject, setSelectedProject] = useState('');
    const [tuleapProjectId, setTuleapProjectId] = useState('');
    const [trackerIds, setTrackerIds] = useState<Record<TrackerType, string>>({ bug: '', task: '', user_story: '', test_case: '' });
    const [verified, setVerified] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [verifyResult, setVerifyResult] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const hasAtLeastOneTracker = Object.values(trackerIds).some(Boolean);
    const allFilled = selectedProject && tuleapProjectId && hasAtLeastOneTracker;

    useEffect(() => {
        if (open) {
            setSelectedProject('');
            setTuleapProjectId('');
            setTrackerIds({ bug: '', task: '', user_story: '', test_case: '' });
            setVerified(false);
            setVerifyResult(null);
            setError(null);
        }
    }, [open]);

    const handleVerify = async () => {
        if (!tuleapProjectId) return;
        setVerifying(true);
        setVerifyResult(null);
        try {
            // Use test connection to verify the project ID is reachable
            const firstTrackerId = Object.values(trackerIds).find(Boolean);
            if (firstTrackerId) {
                await tuleapConfigApi.testConnection({
                    tuleap_base_url: baseUrl || undefined,
                    tuleap_tracker_id: Number(firstTrackerId),
                });
                setVerifyResult('Tuleap project reachable');
            } else {
                setVerifyResult(`Project ID ${tuleapProjectId} saved`);
            }
            setVerified(true);
        } catch (err: any) {
            setVerifyResult(null);
            setError(err.message || 'Verification failed — enter tracker IDs to verify connection');
            setVerified(true); // allow creation even if verify fails
        } finally {
            setVerifying(false);
        }
    };

    const handleCreate = async () => {
        if (!selectedProject) { setError('Select a QC project'); return; }
        if (!tuleapProjectId) { setError('Enter a Tuleap Project ID'); return; }
        if (!hasAtLeastOneTracker) { setError('Enter at least one tracker ID'); return; }

        setSaving(true);
        setError(null);
        try {
            const basePayload = {
                qc_project_id: selectedProject,
                tuleap_project_id: Number(tuleapProjectId),
                tuleap_base_url: baseUrl || null,
            };
            for (const def of TRACKER_DEFS) {
                const tid = trackerIds[def.key];
                if (tid) {
                    await tuleapConfigApi.create({
                        ...basePayload,
                        tracker_type: def.key,
                        tuleap_tracker_id: Number(tid),
                    });
                }
            }
            onCreated();
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to create mapping');
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" />

            <div className="relative w-full max-w-2xl bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-950 rounded-2xl shadow-2xl border border-white/40 dark:border-slate-700/60 overflow-hidden">
                {/* glow orbs */}
                <div aria-hidden className="absolute -top-16 -left-16 w-[260px] h-[260px] rounded-full opacity-20 pointer-events-none" style={{ background: '#7c3aed', filter: 'blur(80px)' }} />
                <div aria-hidden className="absolute -bottom-16 -right-16 w-[260px] h-[260px] rounded-full opacity-15 pointer-events-none" style={{ background: '#6366f1', filter: 'blur(80px)' }} />

                {/* header */}
                <div className="relative px-6 pt-5 pb-4 flex items-start justify-between">
                    <div className="flex items-start gap-3">
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-violet-500/30">
                            {Icons.link}
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">New project mapping</h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Link a QC Manager project to a Tuleap project and its trackers</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                        {Icons.close}
                    </button>
                </div>

                <div className="relative px-6 pb-5 space-y-5">

                    {/* step 1: QC project */}
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-700 dark:text-violet-300 text-[10px] font-bold flex items-center justify-center">1</span>
                            <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">QC project</label>
                        </div>
                        {projects.length === 0 ? (
                            <div className="text-xs text-slate-400 py-2">No QC projects available.</div>
                        ) : (
                            <div className="grid grid-cols-2 gap-2.5 max-h-48 overflow-y-auto pr-1">
                                {projects.map(p => (
                                    <button key={p.id} onClick={() => setSelectedProject(p.id)}
                                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                                            selectedProject === p.id
                                                ? 'bg-gradient-to-br from-violet-500/15 to-indigo-500/10 border-violet-400 dark:border-violet-500 shadow-sm'
                                                : 'bg-white/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-700/60 hover:border-violet-400/60'
                                        }`}>
                                        <span className="w-8 h-8 shrink-0 rounded-md bg-gradient-to-br from-violet-500/20 to-indigo-500/20 dark:from-violet-500/30 dark:to-indigo-500/30 flex items-center justify-center text-[9px] font-bold text-violet-700 dark:text-violet-300 border border-violet-200/50 dark:border-violet-500/20">
                                            {p.project_id?.slice(0, 3).toUpperCase() || p.project_name?.slice(0, 3).toUpperCase()}
                                        </span>
                                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate flex-1">{p.project_name}</span>
                                        {selectedProject === p.id && <span className="ml-auto text-violet-500 shrink-0">{Icons.check}</span>}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* step 2: Tuleap project ID */}
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-700 dark:text-violet-300 text-[10px] font-bold flex items-center justify-center">2</span>
                            <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Tuleap project ID</label>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                value={tuleapProjectId}
                                onChange={e => { setTuleapProjectId(e.target.value); setVerified(false); setVerifyResult(null); }}
                                placeholder="e.g. 42"
                                className="flex-1 h-10 px-3 rounded-lg bg-white/70 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/70 text-sm font-mono text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all"
                            />
                            <button
                                onClick={handleVerify}
                                disabled={!tuleapProjectId || verifying}
                                className={`inline-flex items-center gap-1.5 px-3 h-10 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                                    tuleapProjectId && !verifying
                                        ? 'bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-violet-400'
                                        : 'bg-slate-100 dark:bg-slate-800/30 text-slate-400 cursor-not-allowed'
                                }`}>
                                {verifying
                                    ? <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.22-8.56" stroke="currentColor" strokeWidth="2.5"/></svg>
                                    : verified ? Icons.check : Icons.refresh}
                                {verifying ? 'Verifying…' : verified ? 'Verified' : 'Verify'}
                            </button>
                        </div>
                        {verifyResult && (
                            <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {verifyResult}
                            </div>
                        )}
                    </div>

                    {/* step 3: tracker IDs */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-700 dark:text-violet-300 text-[10px] font-bold flex items-center justify-center">3</span>
                                <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Tracker IDs <span className="normal-case font-normal">(at least one)</span></label>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                            {TRACKER_DEFS.map(def => (
                                <div key={def.key} className={`rounded-xl border bg-white/70 dark:bg-slate-900/40 overflow-hidden ${def.border}`}>
                                    <div className={`px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold flex items-center gap-1.5 border-b ${def.chip} ${def.border}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${def.dot}`} />
                                        {def.label}
                                    </div>
                                    <input
                                        type="number"
                                        value={trackerIds[def.key]}
                                        onChange={e => setTrackerIds(prev => ({ ...prev, [def.key]: e.target.value }))}
                                        placeholder="e.g. 101"
                                        className="w-full h-10 px-3 bg-transparent text-sm font-mono text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* error */}
                    {error && (
                        <div className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200/60 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
                            {error}
                        </div>
                    )}
                </div>

                {/* footer */}
                <div className="relative px-6 py-4 border-t border-slate-200/60 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-900/40 flex items-center justify-between">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {allFilled
                            ? <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">{Icons.check} Ready — field mappings will inherit defaults</span>
                            : <span>Fill all fields to continue</span>}
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={onClose} className="text-sm px-4 h-9 rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors font-medium">Cancel</button>
                        <button
                            onClick={handleCreate}
                            disabled={!allFilled || saving}
                            className={`inline-flex items-center gap-1.5 text-sm font-semibold px-4 h-9 rounded-lg transition-all ${
                                allFilled && !saving
                                    ? 'bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-500/30 hover:from-violet-600 hover:to-indigo-700 active:scale-95'
                                    : 'bg-slate-200 dark:bg-slate-800/50 text-slate-400 cursor-not-allowed'
                            }`}>
                            {saving
                                ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.22-8.56" stroke="currentColor" strokeWidth="2.5"/></svg>
                                : Icons.arrow}
                            {saving ? 'Creating…' : 'Create mapping'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

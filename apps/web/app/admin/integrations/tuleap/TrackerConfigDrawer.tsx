'use client';

import React, { useState, useEffect } from 'react';
import { tuleapConfigApi, TuleapSyncConfig } from '@/lib/api';

type TrackerType = 'bug' | 'task' | 'user_story' | 'test_case';
type Section = 'fields' | 'status' | 'values';

export interface GroupedMapping {
    qc_project_id: string;
    project_name: string;
    configs: TuleapSyncConfig[];
}

interface TrackerConfigDrawerProps {
    open: boolean;
    project: GroupedMapping | null;
    onClose: () => void;
    onSaved: () => void;
}

type SchemaField = { field_id: number; name: string; label: string; type: string; values: { id: number; label: string }[] };

// ── constants ────────────────────────────────────────────────────────────────

const TRACKER_DEFS: { key: TrackerType; label: string; dot: string; active: string; inactive: string }[] = [
    { key: 'bug',        label: 'Bug',       dot: 'bg-rose-500',    active: 'from-rose-500 to-rose-600 shadow-rose-500/30',     inactive: 'bg-white/60 dark:bg-slate-900/40 text-slate-700 dark:text-slate-200' },
    { key: 'task',       label: 'Task',      dot: 'bg-blue-500',    active: 'from-blue-500 to-blue-600 shadow-blue-500/30',     inactive: 'bg-white/60 dark:bg-slate-900/40 text-slate-700 dark:text-slate-200' },
    { key: 'user_story', label: 'User Story',dot: 'bg-amber-500',   active: 'from-amber-500 to-orange-500 shadow-amber-500/30', inactive: 'bg-white/60 dark:bg-slate-900/40 text-slate-700 dark:text-slate-200' },
    { key: 'test_case',  label: 'Test Case', dot: 'bg-emerald-500', active: 'from-emerald-500 to-teal-500 shadow-emerald-500/30',inactive: 'bg-white/60 dark:bg-slate-900/40 text-slate-700 dark:text-slate-200' },
];

const QC_STATUSES: Record<TrackerType, string[]> = {
    bug:        ['open', 'in_progress', 'resolved', 'closed'],
    task:       ['Backlog', 'In Progress', 'Done', 'Cancelled'],
    user_story: ['Backlog', 'In Progress', 'Done', 'Cancelled'],
    test_case:  ['draft', 'active', 'deprecated', 'archived'],
};

const STATUS_TONE: Record<string, string> = {
    slate:   'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200/60',
    blue:    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200/60',
    amber:   'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200/60',
    violet:  'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border-violet-200/60',
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200/60',
    rose:    'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border-rose-200/60',
};

const DEFAULT_STATUS_TONES: Record<TrackerType, string[]> = {
    bug:        ['slate','blue','amber','violet','emerald','slate','rose'],
    task:       ['slate','amber','rose','emerald'],
    user_story: ['slate','amber','violet','emerald'],
    test_case:  ['slate','emerald','rose'],
};

// ── icon primitives ──────────────────────────────────────────────────────────

function Ico({ d, size = 16, sw = 1.75, fill = 'none' }: { d: React.ReactNode; size?: number; sw?: number; fill?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
            {d}
        </svg>
    );
}

const Icons = {
    close:   <Ico d={<><path d="M18 6L6 18"/><path d="M6 6l12 12"/></>} />,
    search:  <Ico d={<><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>} />,
    plus:    <Ico d={<><path d="M12 5v14"/><path d="M5 12h14"/></>} sw={2} />,
    trash:   <Ico d={<><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>} />,
    arrow:   <Ico d={<><path d="M5 12h14"/><path d="M13 5l7 7-7 7"/></>} />,
    cog:     <Ico d={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>} />,
    refresh: <Ico d={<><path d="M21 12a9 9 0 1 1-3.5-7.1"/><path d="M21 3v6h-6"/></>} />,
    check:   <Ico d={<path d="M5 13l4 4L19 7"/>} sw={2.25} />,
    warn:    <Ico d={<><path d="M10.3 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></>} />,
    drag:    <Ico d={<><circle cx="9" cy="6" r="0.6" fill="currentColor"/><circle cx="9" cy="12" r="0.6" fill="currentColor"/><circle cx="9" cy="18" r="0.6" fill="currentColor"/><circle cx="15" cy="6" r="0.6" fill="currentColor"/><circle cx="15" cy="12" r="0.6" fill="currentColor"/><circle cx="15" cy="18" r="0.6" fill="currentColor"/></>} sw={0} />,
    spark:   <Ico d={<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3zM19 13l.8 2.2L22 16l-2.2.8L19 19l-.8-2.2L16 16l2.2-.8L19 13zM5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14z"/>} fill="currentColor" sw={0} />,
};

// ── sub-components ───────────────────────────────────────────────────────────

function FieldInput({ value, onChange, placeholder, mono = true }: { value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
    return (
        <input
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className={`w-full h-9 px-3 rounded-lg bg-white/70 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/70 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all ${mono ? 'font-mono' : ''}`}
        />
    );
}

// ── Field Mappings section ───────────────────────────────────────────────────

function FieldMappingsSection({
    fieldMapEdits, setFieldMapEdits, schema, fetchingSchema, onDiscover, onSave, saving,
}: {
    fieldMapEdits: Record<string, string>;
    setFieldMapEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    schema: SchemaField[];
    fetchingSchema: boolean;
    onDiscover: () => void;
    onSave: () => void;
    saving: boolean;
}) {
    const [filter, setFilter] = useState('');
    const entries = Object.entries(fieldMapEdits);
    const filtered = filter
        ? entries.filter(([k, v]) => k.includes(filter.toLowerCase()) || v.toLowerCase().includes(filter.toLowerCase()))
        : entries;
    const mapped = entries.filter(([, v]) => v).length;
    const unmapped = entries.length - mapped;

    const addRow = () => {
        const key = `field_${entries.length + 1}`;
        setFieldMapEdits(prev => ({ ...prev, [key]: '' }));
    };

    const removeRow = (key: string) => {
        setFieldMapEdits(prev => { const n = { ...prev }; delete n[key]; return n; });
    };

    const updateKey = (oldKey: string, newKey: string) => {
        setFieldMapEdits(prev => Object.fromEntries(Object.entries(prev).map(([k, v]) => k === oldKey ? [newKey, v] : [k, v])));
    };

    const updateValue = (key: string, value: string) => {
        setFieldMapEdits(prev => ({ ...prev, [key]: value }));
    };

    // Duplicate check
    const valueCounts: Record<string, string[]> = {};
    entries.forEach(([k, v]) => { if (v) { if (!valueCounts[v]) valueCounts[v] = []; valueCounts[v].push(k); } });
    const dupes = Object.entries(valueCounts).filter(([, ks]) => ks.length > 1);

    return (
        <div className="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/60 dark:bg-slate-900/40 backdrop-blur-md overflow-hidden">
            {/* header */}
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-3">
                <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        Field mappings
                        <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{mapped}/{entries.length} mapped</span>
                        {unmapped > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-amber-600 dark:text-amber-400">
                                {Icons.warn} {unmapped} unmapped
                            </span>
                        )}
                    </h3>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{Icons.search}</div>
                        <input
                            value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter…"
                            className="h-8 pl-9 pr-3 rounded-lg bg-white/70 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-700/60 text-xs text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 w-32"
                        />
                    </div>
                    <button onClick={onDiscover} disabled={fetchingSchema}
                        className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-semibold text-violet-600 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors disabled:opacity-50">
                        {fetchingSchema
                            ? <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.22-8.56" stroke="currentColor" strokeWidth="2.5"/></svg>
                            : Icons.spark}
                        Auto-detect
                    </button>
                    <button onClick={addRow}
                        className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-semibold bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-500/30 hover:from-violet-600 hover:to-indigo-700 transition-all">
                        {Icons.plus} Add field
                    </button>
                </div>
            </div>

            {/* column headers */}
            <div className="grid grid-cols-12 gap-3 px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider font-bold text-slate-400">
                <div className="col-span-1" />
                <div className="col-span-4">QC field</div>
                <div className="col-span-1" />
                <div className="col-span-5">Tuleap field</div>
                <div className="col-span-1" />
            </div>

            <div className="px-1 pb-2 max-h-80 overflow-y-auto">
                {filtered.length === 0 && (
                    <div className="px-4 py-6 text-center text-[11px] text-slate-400">
                        {entries.length === 0 ? 'No field mappings yet. Click "Add field" or "Auto-detect".' : 'No results for that filter.'}
                    </div>
                )}
                {filtered.map(([key, value]) => (
                    <div key={key} className="group grid grid-cols-12 items-center gap-3 px-4 py-2 rounded-lg hover:bg-violet-50/40 dark:hover:bg-violet-900/10 transition-colors">
                        <div className="col-span-1 flex items-center justify-center text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab">{Icons.drag}</div>
                        <div className="col-span-4">
                            <FieldInput value={key} onChange={v => updateKey(key, v)} placeholder="qc_field_name" />
                        </div>
                        <div className="col-span-1 flex items-center justify-center">
                            <span className={value ? 'text-violet-500' : 'text-slate-300 dark:text-slate-700'}>{Icons.arrow}</span>
                        </div>
                        <div className="col-span-5">
                            {schema.length > 0 ? (
                                <select value={value} onChange={e => updateValue(key, e.target.value)}
                                    className="w-full h-9 px-3 rounded-lg bg-white/70 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/70 text-sm text-slate-800 dark:text-slate-100 font-mono focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all">
                                    <option value="">Select Tuleap field…</option>
                                    {schema.map(f => <option key={f.name} value={f.name}>{f.label} ({f.name})</option>)}
                                </select>
                            ) : (
                                <FieldInput value={value} onChange={v => updateValue(key, v)} placeholder="tuleap_field" />
                            )}
                        </div>
                        <div className="col-span-1 flex justify-end">
                            <button onClick={() => removeRow(key)} className="p-1 text-slate-300 hover:text-rose-500 dark:text-slate-600 dark:hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all rounded">
                                {Icons.trash}
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {dupes.length > 0 && (
                <div className="mx-4 mb-3 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-500/30 rounded-lg text-xs text-amber-700 dark:text-amber-300">
                    <strong>Duplicate targets:</strong> {dupes.map(([v, ks]) => `"${v}" ← ${ks.join(', ')}`).join('; ')} — only the last key takes effect.
                </div>
            )}

            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between bg-slate-50/40 dark:bg-slate-900/20">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Unmapped fields are skipped during sync.</span>
                <button onClick={onSave} disabled={saving}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 h-8 rounded-lg bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-500/30 hover:from-violet-600 hover:to-indigo-700 transition-all disabled:opacity-60">
                    {saving
                        ? <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.22-8.56" stroke="currentColor" strokeWidth="2.5"/></svg>
                        : Icons.check}
                    {saving ? 'Saving…' : 'Save mappings'}
                </button>
            </div>
        </div>
    );
}

// ── Status Map section ───────────────────────────────────────────────────────

function StatusMapSection({
    trackerType, statusMapEdits, setStatusMapEdits, schema, onSave, saving,
}: {
    trackerType: TrackerType;
    statusMapEdits: Record<string, string>;
    setStatusMapEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    schema: SchemaField[];
    onSave: () => void;
    saving: boolean;
}) {
    const entries = Object.entries(statusMapEdits);
    const statusField = schema.find(f => f.name === 'status' || f.label?.toLowerCase() === 'status');
    const toneList = DEFAULT_STATUS_TONES[trackerType] ?? [];

    const addRow = () => {
        setStatusMapEdits(prev => ({ ...prev, [`status_${Object.keys(prev).length + 1}`]: '' }));
    };

    const updateKey = (oldKey: string, newKey: string) => {
        setStatusMapEdits(prev => Object.fromEntries(Object.entries(prev).map(([k, v]) => k === oldKey ? [newKey, v] : [k, v])));
    };

    const updateValue = (key: string, value: string) => {
        setStatusMapEdits(prev => ({ ...prev, [key]: value }));
    };

    const removeRow = (key: string) => {
        setStatusMapEdits(prev => { const n = { ...prev }; delete n[key]; return n; });
    };

    return (
        <div className="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/60 dark:bg-slate-900/40 backdrop-blur-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Status map</h3>
                <button onClick={addRow}
                    className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-semibold bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-500/30 hover:from-violet-600 hover:to-indigo-700 transition-all">
                    {Icons.plus} Add row
                </button>
            </div>

            <div className="p-4 space-y-2">
                {entries.length === 0 && (
                    <div className="py-6 text-center text-[11px] text-slate-400">No status mappings. Click "Add row" to get started.</div>
                )}
                <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 text-[10px] uppercase tracking-wider font-bold text-slate-400 px-1 mb-1">
                    <span>Tuleap status</span><span/><span>QC status</span><span/>
                </div>
                {entries.map(([key, value], idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
                        {(statusField?.values?.length ?? 0) > 0 ? (
                            <select value={key} onChange={e => { if (e.target.value !== key) updateKey(key, e.target.value); }}
                                className={`h-9 px-3 rounded-lg bg-white/70 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/70 text-sm font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all`}>
                                <option value={key}>{key || 'Select Tuleap status…'}</option>
                                {statusField!.values.map(v => <option key={v.id} value={v.label}>{v.label}</option>)}
                            </select>
                        ) : (
                            <span className={`inline-flex items-center h-9 px-3 rounded-lg border text-xs font-mono ${STATUS_TONE[toneList[idx]] || STATUS_TONE['slate']}`}>
                                {key || <input value={key} onChange={e => updateKey(key, e.target.value)} placeholder="Tuleap status" className="bg-transparent text-current w-full focus:outline-none font-mono text-xs"/>}
                            </span>
                        )}
                        {(statusField?.values?.length ?? 0) === 0 && (
                            <input value={key} onChange={e => updateKey(key, e.target.value)} placeholder="Tuleap status"
                                className="h-9 px-3 rounded-lg bg-white/70 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/70 text-sm font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all hidden"/>
                        )}
                        <span className="text-slate-300 dark:text-slate-600 flex justify-center">{Icons.arrow}</span>
                        <select value={value} onChange={e => updateValue(key, e.target.value)}
                            className="h-9 px-3 rounded-lg bg-white/70 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/70 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all">
                            <option value="">Select status…</option>
                            {QC_STATUSES[trackerType].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <button onClick={() => removeRow(key)} className="p-1.5 text-slate-300 hover:text-rose-500 dark:text-slate-600 dark:hover:text-rose-400 transition-colors rounded">
                            {Icons.trash}
                        </button>
                    </div>
                ))}
                {(statusField?.values?.length ?? 0) === 0 && entries.length > 0 && (
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 pt-1">
                        Tip: use "Auto-detect" in Field mappings first to load Tuleap status values for dropdowns.
                    </p>
                )}
            </div>

            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800/80 flex justify-end bg-slate-50/40 dark:bg-slate-900/20">
                <button onClick={onSave} disabled={saving}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 h-8 rounded-lg bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-500/30 hover:from-violet-600 hover:to-indigo-700 transition-all disabled:opacity-60">
                    {saving
                        ? <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.22-8.56" stroke="currentColor" strokeWidth="2.5"/></svg>
                        : Icons.check}
                    {saving ? 'Saving…' : 'Save status map'}
                </button>
            </div>
        </div>
    );
}

// ── Value Maps section ───────────────────────────────────────────────────────

function ValueMapsSection({
    valueMapsEdits, setValueMapsEdits, schema, onSave, saving,
}: {
    valueMapsEdits: Record<string, Record<string, string>>;
    setValueMapsEdits: React.Dispatch<React.SetStateAction<Record<string, Record<string, string>>>>;
    schema: SchemaField[];
    onSave: () => void;
    saving: boolean;
}) {
    const addField = () => {
        const key = `field_${Object.keys(valueMapsEdits).length + 1}`;
        setValueMapsEdits(prev => ({ ...prev, [key]: {} }));
    };

    const removeField = (field: string) => {
        setValueMapsEdits(prev => { const n = { ...prev }; delete n[field]; return n; });
    };

    const renameField = (oldField: string, newField: string) => {
        setValueMapsEdits(prev => {
            const entries = Object.entries(prev);
            return Object.fromEntries(entries.map(([k, v]) => k === oldField ? [newField, v] : [k, v]));
        });
    };

    const addEntry = (field: string) => {
        setValueMapsEdits(prev => ({ ...prev, [field]: { ...prev[field], [`qc_${Object.keys(prev[field] || {}).length + 1}`]: '' } }));
    };

    const removeEntry = (field: string, qcKey: string) => {
        setValueMapsEdits(prev => { const m = { ...prev[field] }; delete m[qcKey]; return { ...prev, [field]: m }; });
    };

    const updateEntry = (field: string, oldKey: string, newKey: string, value: string) => {
        setValueMapsEdits(prev => {
            const entries = Object.entries(prev[field] || {}).map(([k, v]) => k === oldKey ? [newKey, value] : [k, v]);
            return { ...prev, [field]: Object.fromEntries(entries) };
        });
    };

    return (
        <div className="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/60 dark:bg-slate-900/40 backdrop-blur-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Value maps</h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Translate QC enum values to Tuleap labels per field</p>
                </div>
                <button onClick={addField}
                    className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-semibold bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-500/30 hover:from-violet-600 hover:to-indigo-700 transition-all">
                    {Icons.plus} Add field
                </button>
            </div>

            <div className="p-4 space-y-3 max-h-[28rem] overflow-y-auto">
                {Object.keys(valueMapsEdits).length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-300/70 dark:border-slate-700/70 px-4 py-8 text-center">
                        <div className="text-sm font-semibold text-slate-600 dark:text-slate-300">No value maps yet</div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Add one to translate severity, priority, or environment values.</p>
                    </div>
                )}
                {Object.entries(valueMapsEdits).map(([field, mapping]) => {
                    const fieldDef = schema.find(f => f.name === field);
                    return (
                        <div key={field} className="rounded-xl border border-slate-200/60 dark:border-slate-700/60 overflow-hidden">
                            <div className="px-4 py-2.5 border-b border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between bg-white/40 dark:bg-slate-900/30">
                                <input value={field} onChange={e => renameField(field, e.target.value)}
                                    className="text-xs font-bold font-mono text-violet-700 dark:text-violet-300 bg-transparent focus:outline-none w-40" />
                                <div className="flex gap-1">
                                    <button onClick={() => addEntry(field)} className="text-[10px] uppercase tracking-wider font-bold text-violet-600 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 px-2 py-0.5 rounded transition-colors">+ Entry</button>
                                    <button onClick={() => removeField(field)} className="p-1 text-slate-300 hover:text-rose-500 dark:text-slate-600 dark:hover:text-rose-400 transition-colors rounded">{Icons.trash}</button>
                                </div>
                            </div>
                            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                                {Object.keys(mapping).length === 0 && (
                                    <div className="px-4 py-4 text-center text-[11px] text-slate-400">No entries yet — click "+ Entry".</div>
                                )}
                                {Object.entries(mapping).map(([qcVal, tuleapVal], idx) => (
                                    <div key={idx} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2 px-4 py-2 hover:bg-violet-50/30 dark:hover:bg-violet-900/10 transition-colors">
                                        <input value={qcVal} onChange={e => updateEntry(field, qcVal, e.target.value, tuleapVal)}
                                            className="h-8 px-2.5 rounded-lg bg-white/70 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/70 text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all"
                                            placeholder="QC value" />
                                        <span className="text-slate-300 dark:text-slate-600 flex justify-center">{Icons.arrow}</span>
                                        {(fieldDef?.values?.length ?? 0) > 0 ? (
                                            <select value={tuleapVal} onChange={e => updateEntry(field, qcVal, qcVal, e.target.value)}
                                                className="h-8 px-2.5 rounded-lg bg-white/70 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/70 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all">
                                                <option value={tuleapVal}>{tuleapVal || 'Select label…'}</option>
                                                {fieldDef!.values.map(v => <option key={v.id} value={v.label}>{v.label}</option>)}
                                            </select>
                                        ) : (
                                            <input value={tuleapVal} onChange={e => updateEntry(field, qcVal, qcVal, e.target.value)}
                                                className="h-8 px-2.5 rounded-lg bg-white/70 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/70 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all"
                                                placeholder="Tuleap label" />
                                        )}
                                        <button onClick={() => removeEntry(field, qcVal)} className="p-1 text-slate-300 hover:text-rose-500 dark:text-slate-600 dark:hover:text-rose-400 transition-colors rounded">{Icons.trash}</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800/80 flex justify-end bg-slate-50/40 dark:bg-slate-900/20">
                <button onClick={onSave} disabled={saving}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 h-8 rounded-lg bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-500/30 hover:from-violet-600 hover:to-indigo-700 transition-all disabled:opacity-60">
                    {saving
                        ? <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.22-8.56" stroke="currentColor" strokeWidth="2.5"/></svg>
                        : Icons.check}
                    {saving ? 'Saving…' : 'Save value maps'}
                </button>
            </div>
        </div>
    );
}

// ── Main drawer ──────────────────────────────────────────────────────────────

export function TrackerConfigDrawer({ open, project, onClose, onSaved }: TrackerConfigDrawerProps) {
    const [activeTab, setActiveTab] = useState<TrackerType>('bug');
    const [activeSection, setActiveSection] = useState<Section>('fields');
    const [fieldMapEdits, setFieldMapEdits] = useState<Record<string, string>>({});
    const [statusMapEdits, setStatusMapEdits] = useState<Record<string, string>>({});
    const [valueMapsEdits, setValueMapsEdits] = useState<Record<string, Record<string, string>>>({});
    const [schema, setSchema] = useState<SchemaField[]>([]);
    const [fetchingSchema, setFetchingSchema] = useState(false);
    const [savingFields, setSavingFields] = useState(false);
    const [savingStatus, setSavingStatus] = useState(false);
    const [savingValues, setSavingValues] = useState(false);
    const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

    const showToast = (kind: 'ok' | 'err', msg: string) => {
        setToast({ kind, msg });
        setTimeout(() => setToast(null), 3500);
    };

    // Reset when drawer opens
    useEffect(() => {
        if (open) { setActiveTab('bug'); setActiveSection('fields'); }
    }, [open]);

    // Load config when tab or project changes
    const activeConfig: TuleapSyncConfig | undefined = project?.configs.find(c => c.tracker_type === activeTab);

    useEffect(() => {
        if (!activeConfig) {
            setFieldMapEdits({});
            setStatusMapEdits({});
            setValueMapsEdits({});
            setSchema([]);
            return;
        }
        setFieldMapEdits({ ...(activeConfig.artifact_fields || {}) });
        setStatusMapEdits({ ...(activeConfig.status_value_map || {}) });
        const vm = activeConfig.value_maps || {};
        const flattened: Record<string, Record<string, string>> = {};
        for (const [field, mapping] of Object.entries(vm)) {
            if (typeof mapping === 'object' && mapping !== null) {
                flattened[field] = { ...(mapping as Record<string, string>) };
            }
        }
        setValueMapsEdits(flattened);
        setSchema([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, activeConfig?.id]);

    const handleDiscover = async () => {
        if (!activeConfig) return;
        setFetchingSchema(true);
        try {
            const res = await tuleapConfigApi.discover(activeConfig.tuleap_tracker_id);
            if (res.suggested_mappings && Object.keys(res.suggested_mappings).length > 0) {
                setFieldMapEdits(prev => ({ ...prev, ...res.suggested_mappings }));
                showToast('ok', `Discovered ${Object.keys(res.suggested_mappings).length} field suggestions`);
            } else {
                showToast('ok', 'Schema fetched — no auto-suggestions found');
            }
            if (res.fields?.length > 0) setSchema(res.fields);
        } catch (err: any) {
            showToast('err', err.message || 'Failed to fetch schema');
        } finally {
            setFetchingSchema(false);
        }
    };

    const saveFields = async () => {
        if (!activeConfig) return;
        setSavingFields(true);
        try {
            await tuleapConfigApi.update(activeConfig.id, { artifact_fields: fieldMapEdits });
            showToast('ok', 'Field mappings saved');
            onSaved();
        } catch (err: any) {
            showToast('err', err.message || 'Save failed');
        } finally {
            setSavingFields(false);
        }
    };

    const saveStatus = async () => {
        if (!activeConfig) return;
        setSavingStatus(true);
        try {
            await tuleapConfigApi.update(activeConfig.id, { status_value_map: statusMapEdits });
            showToast('ok', 'Status map saved');
            onSaved();
        } catch (err: any) {
            showToast('err', err.message || 'Save failed');
        } finally {
            setSavingStatus(false);
        }
    };

    const saveValues = async () => {
        if (!activeConfig) return;
        setSavingValues(true);
        try {
            await tuleapConfigApi.update(activeConfig.id, { value_maps: valueMapsEdits });
            showToast('ok', 'Value maps saved');
            onSaved();
        } catch (err: any) {
            showToast('err', err.message || 'Save failed');
        } finally {
            setSavingValues(false);
        }
    };

    if (!open || !project) return null;

    const sections: { id: Section; label: string; count: number }[] = [
        { id: 'fields', label: 'Field mappings',  count: Object.keys(fieldMapEdits).length },
        { id: 'status', label: 'Status map',       count: Object.keys(statusMapEdits).length },
        { id: 'values', label: 'Value maps',       count: Object.keys(valueMapsEdits).length },
    ];

    return (
        <div className="fixed inset-0 z-50 flex" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
            {/* backdrop */}
            <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" />

            {/* drawer */}
            <div className="ml-auto relative w-full max-w-[1100px] h-full bg-gradient-to-br from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 shadow-2xl flex flex-col">
                {/* decorative orb */}
                <div aria-hidden className="absolute -top-24 -right-24 w-[300px] h-[300px] rounded-full opacity-15 dark:opacity-20 pointer-events-none" style={{ background: '#7c3aed', filter: 'blur(100px)' }} />

                {/* header */}
                <div className="relative px-6 pt-5 pb-4 border-b border-slate-200/60 dark:border-slate-800/80 flex items-start justify-between">
                    <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-violet-500/30">
                            {Icons.cog}
                        </div>
                        <div>
                            <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Tracker configuration</div>
                            <div className="flex items-center gap-2.5 mt-0.5">
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">{project.project_name}</h2>
                                <span className="text-sm text-slate-400">·</span>
                                <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                                    Tuleap #{project.configs[0]?.tuleap_project_id}
                                </span>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                        {Icons.close}
                    </button>
                </div>

                {/* tracker tabs */}
                <div className="relative px-6 py-3 border-b border-slate-200/60 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/30">
                    <div className="flex items-center gap-2 overflow-x-auto">
                        {TRACKER_DEFS.map(def => {
                            const config = project.configs.find(c => c.tracker_type === def.key);
                            const isActive = activeTab === def.key;
                            return (
                                <button key={def.key} onClick={() => setActiveTab(def.key)}
                                    className={`group relative inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all whitespace-nowrap ${
                                        isActive
                                            ? `bg-gradient-to-br ${def.active} border-transparent text-white shadow-lg`
                                            : `${def.inactive} border-slate-200/60 dark:border-slate-700/60 hover:bg-white dark:hover:bg-slate-800/60`
                                    }`}>
                                    <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-white/80' : def.dot}`} />
                                    <span>{def.label}</span>
                                    {config && (
                                        <span className={`text-[10px] font-mono ${isActive ? 'text-white/70' : 'text-slate-400'}`}>
                                            #{config.tuleap_tracker_id}
                                        </span>
                                    )}
                                    {!config && (
                                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                                            not set
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* section tabs */}
                <div className="relative px-6 pt-4 flex items-center gap-1 border-b border-slate-200/60 dark:border-slate-800/80">
                    {sections.map(s => (
                        <button key={s.id} onClick={() => setActiveSection(s.id)}
                            className={`relative px-3.5 pb-3 -mb-px text-sm font-semibold transition-colors flex items-center gap-1.5 ${
                                activeSection === s.id
                                    ? 'text-violet-600 dark:text-violet-300'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                            }`}>
                            {s.label}
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                activeSection === s.id
                                    ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300'
                                    : 'bg-slate-100 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400'
                            }`}>{s.count}</span>
                            {activeSection === s.id && (
                                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full" />
                            )}
                        </button>
                    ))}
                </div>

                {/* body */}
                <div className="relative flex-1 overflow-y-auto px-6 py-5 space-y-5">
                    {!activeConfig ? (
                        <div className="rounded-2xl border border-dashed border-slate-300/70 dark:border-slate-700/70 px-6 py-12 text-center">
                            <div className="text-sm font-semibold text-slate-600 dark:text-slate-300">No config for this tracker type</div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Add this tracker when creating or editing the project mapping.</p>
                        </div>
                    ) : (
                        <>
                            {activeSection === 'fields' && (
                                <FieldMappingsSection
                                    fieldMapEdits={fieldMapEdits}
                                    setFieldMapEdits={setFieldMapEdits}
                                    schema={schema}
                                    fetchingSchema={fetchingSchema}
                                    onDiscover={handleDiscover}
                                    onSave={saveFields}
                                    saving={savingFields}
                                />
                            )}
                            {activeSection === 'status' && (
                                <StatusMapSection
                                    trackerType={activeTab}
                                    statusMapEdits={statusMapEdits}
                                    setStatusMapEdits={setStatusMapEdits}
                                    schema={schema}
                                    onSave={saveStatus}
                                    saving={savingStatus}
                                />
                            )}
                            {activeSection === 'values' && (
                                <ValueMapsSection
                                    valueMapsEdits={valueMapsEdits}
                                    setValueMapsEdits={setValueMapsEdits}
                                    schema={schema}
                                    onSave={saveValues}
                                    saving={savingValues}
                                />
                            )}
                        </>
                    )}
                </div>

                {/* toast */}
                {toast && (
                    <div className={`absolute bottom-6 right-6 z-10 inline-flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium shadow-lg backdrop-blur-md border ${
                        toast.kind === 'ok'
                            ? 'bg-emerald-50/90 dark:bg-emerald-900/40 border-emerald-200/60 dark:border-emerald-700/50 text-emerald-800 dark:text-emerald-200'
                            : 'bg-rose-50/90 dark:bg-rose-900/40 border-rose-200/60 dark:border-rose-700/50 text-rose-800 dark:text-rose-200'
                    }`}>
                        {toast.kind === 'ok' ? Icons.check : Icons.warn}
                        {toast.msg}
                    </div>
                )}
            </div>
        </div>
    );
}

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { tuleapConfigApi, TuleapStatus, TuleapSyncConfig, TuleapSyncHistoryItem, fetchApi, Project as ApiProject } from '@/lib/api';
import { TrackerConfigDrawer, GroupedMapping } from './TrackerConfigDrawer';
import { NewMappingModal } from './NewMappingModal';

// ── types ─────────────────────────────────────────────────────────────────────

interface ProjectOption {
    id: string;
    project_id: string;
    project_name: string;
}

type TrackerType = 'bug' | 'task' | 'user_story' | 'test_case';
type ConnectionState = 'untested' | 'ok' | 'fail';

const TRACKER_TYPES: TrackerType[] = ['bug', 'task', 'user_story', 'test_case'];

const TRACKER_META: Record<TrackerType, { label: string; dot: string; chip: string }> = {
    bug:        { label: 'Bug',       dot: 'bg-rose-500',    chip: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' },
    task:       { label: 'Task',      dot: 'bg-blue-500',    chip: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
    user_story: { label: 'User Story',dot: 'bg-amber-500',   chip: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
    test_case:  { label: 'Test Case', dot: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
};

function timeAgo(iso: string) {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '—';

    const diffMs = Date.now() - then;
    const future = diffMs < 0;
    const absMs = Math.abs(diffMs);
    const minutes = Math.floor(absMs / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    let value = 'just now';
    if (days > 0) value = `${days}d`;
    else if (hours > 0) value = `${hours}h`;
    else if (minutes > 0) value = `${minutes}m`;

    return value === 'just now' ? value : future ? `in ${value}` : `${value} ago`;
}

function formatLatency(createdAt: string, processedAt: string | null) {
    if (!processedAt) return '—';
    const created = new Date(createdAt).getTime();
    const processed = new Date(processedAt).getTime();
    if (Number.isNaN(created) || Number.isNaN(processed)) return '—';
    return `${Math.max(0, Math.round(processed - created))} ms`;
}

// ── icon primitives ───────────────────────────────────────────────────────────

function Ico({ d, size = 16, sw = 1.75, fill = 'none' }: { d: React.ReactNode; size?: number; sw?: number; fill?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
            {d}
        </svg>
    );
}

const I = {
    back:    <Ico d={<path d="M15 18l-6-6 6-6"/>} />,
    link:    <Ico d={<><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>} />,
    eye:     <Ico d={<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>} />,
    eyeOff:  <Ico d={<><path d="M17.94 17.94A10 10 0 0 1 12 20c-7 0-11-8-11-8a18 18 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9 9 0 0 1 12 4c7 0 11 8 11 8a18 18 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></>} />,
    copy:    <Ico d={<><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>} />,
    check:   <Ico d={<path d="M5 13l4 4L19 7"/>} sw={2.25} />,
    refresh: <Ico d={<><path d="M21 12a9 9 0 1 1-3.5-7.1"/><path d="M21 3v6h-6"/></>} />,
    plus:    <Ico d={<><path d="M12 5v14"/><path d="M5 12h14"/></>} sw={2} />,
    bolt:    <Ico d={<path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/>} />,
    folder:  <Ico d={<path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z"/>} />,
    cog:     <Ico d={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>} />,
    trash:   <Ico d={<><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>} />,
    clock:   <Ico d={<><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></>} />,
    filter:  <Ico d={<path d="M22 3H2l8 9.5V19l4 2v-8.5L22 3"/>} />,
    shield:  <Ico d={<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>} />,
    sparkle: <Ico d={<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z"/>} fill="currentColor" sw={0} />,
    warn:    <Ico d={<><path d="M10.3 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></>} />,
};

// ── sparkline chart ───────────────────────────────────────────────────────────

function PingChart({ data }: { data: number[] }) {
    const w = 220, h = 56;
    if (data.length < 2) {
        return (
            <div className="h-14 rounded-lg border border-dashed border-slate-200/70 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-800/20 flex items-center justify-center text-[11px] text-slate-400">
                No recent webhook latency
            </div>
        );
    }

    const max = Math.max(...data) * 1.1;
    const min = Math.min(...data) * 0.9;
    const range = Math.max(max - min, 1);
    const norm = (v: number) => h - ((v - min) / range) * h;
    const step = w / (data.length - 1);
    const pts = data.map((v, i) => [i * step, norm(v)] as [number, number]);
    const linePath = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
    const areaPath = linePath + ` L${w},${h} L0,${h} Z`;
    const [lastX, lastY] = pts[pts.length - 1];
    return (
        <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block">
            <defs>
                <linearGradient id="ping-fill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#ping-fill)" />
            <path d={linePath} fill="none" stroke="#8b5cf6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={lastX} cy={lastY} r="6" fill="#8b5cf6" opacity="0.2" />
            <circle cx={lastX} cy={lastY} r="3" fill="#8b5cf6" />
        </svg>
    );
}

// ── KPI tile ──────────────────────────────────────────────────────────────────

function KpiTile({ label, value, sub, accent = 'violet', icon }: { label: string; value: string | number; sub?: string; accent?: string; icon: React.ReactNode }) {
    const accents: Record<string, string> = {
        violet:  'from-violet-500/15 to-indigo-500/10 ring-violet-500/20 text-violet-600 dark:text-violet-300',
        emerald: 'from-emerald-500/15 to-teal-500/10 ring-emerald-500/20 text-emerald-600 dark:text-emerald-300',
        blue:    'from-blue-500/15 to-sky-500/10 ring-blue-500/20 text-blue-600 dark:text-blue-300',
        amber:   'from-amber-500/15 to-orange-500/10 ring-amber-500/20 text-amber-600 dark:text-amber-300',
        rose:    'from-rose-500/15 to-pink-500/10 ring-rose-500/20 text-rose-600 dark:text-rose-300',
    };
    const cls = accents[accent] ?? accents.violet;
    return (
        <div className="relative bg-white/60 dark:bg-slate-900/50 backdrop-blur-md border border-white/40 dark:border-slate-700/40 rounded-xl p-4 shadow-[0_4px_30px_rgba(0,0,0,0.05)] overflow-hidden">
            <div className={`absolute -top-6 -right-6 w-20 h-20 rounded-full bg-gradient-to-br ring-1 ${cls}`} />
            <div className="relative">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">{label}</span>
                    <span className={cls.split(' ').slice(-2).join(' ')}>{icon}</span>
                </div>
                <div className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{value}</div>
                {sub && <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{sub}</div>}
            </div>
        </div>
    );
}

// ── diagnostics panel ─────────────────────────────────────────────────────────

function DiagnosticsPanel({
    testResult,
    pingHistory,
    avgLatencyMs,
}: {
    testResult: { ok: boolean; msg: string } | null;
    pingHistory: number[];
    avgLatencyMs: number | null;
}) {
    const ok = testResult?.ok;
    const statusTone = testResult
        ? ok ? 'emerald' : 'rose'
        : 'slate';
    return (
        <div className="h-full rounded-xl border border-slate-200/60 dark:border-slate-700/60 bg-gradient-to-br from-slate-50/80 to-white/40 dark:from-slate-900/80 dark:to-slate-900/40 p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between">
                <div>
                    <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 mb-1">Live diagnostics</div>
                    <div className="flex items-center gap-2">
                        <span className="relative flex w-2 h-2">
                            {ok && <span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping bg-emerald-400" />}
                            <span className={`relative inline-flex w-2 h-2 rounded-full ${
                                statusTone === 'emerald' ? 'bg-emerald-500' : statusTone === 'rose' ? 'bg-rose-500' : 'bg-slate-400'
                            }`} />
                        </span>
                        <span className={`text-sm font-semibold ${
                            statusTone === 'emerald'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : statusTone === 'rose'
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-slate-500 dark:text-slate-400'
                        }`}>
                            {testResult ? (ok ? 'Operational' : 'Connection failed') : 'Not tested'}
                        </span>
                    </div>
                </div>
            </div>

            <div>
                <div className="flex items-baseline justify-between mb-1">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Latency · last 24 pings</span>
                    <span className="text-xs font-mono text-slate-600 dark:text-slate-300">
                        {avgLatencyMs != null ? (
                            <>{avgLatencyMs}<span className="text-slate-400 ml-0.5">ms</span></>
                        ) : '—'}
                    </span>
                </div>
                <PingChart data={pingHistory} />
            </div>

            {testResult && (
                <div className={`text-xs px-3 py-2 rounded-lg border ${
                    ok
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200/60 dark:border-emerald-700/50 text-emerald-700 dark:text-emerald-300'
                        : 'bg-rose-50 dark:bg-rose-900/20 border-rose-200/60 dark:border-rose-700/50 text-rose-700 dark:text-rose-300'
                }`}>
                    {testResult.msg}
                </div>
            )}

            {!testResult && (
                <div className="grid grid-cols-2 gap-3 mt-auto pt-3 border-t border-slate-200/60 dark:border-slate-700/60">
                    <div>
                        <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Status</div>
                        <div className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Run test to verify</div>
                    </div>
                    <div>
                        <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Protocol</div>
                        <div className="text-sm font-mono text-slate-700 dark:text-slate-200 mt-0.5">OAuth2 REST</div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── connection card ───────────────────────────────────────────────────────────

function ConnectionCard({
    baseUrl, setBaseUrl, accessKey, setAccessKey, showKey, setShowKey,
    trackerId, setTrackerId, testingConn, testResult, pingHistory, avgLatencyMs, onTest,
}: {
    baseUrl: string; setBaseUrl: (v: string) => void;
    accessKey: string; setAccessKey: (v: string) => void;
    showKey: boolean; setShowKey: (v: boolean) => void;
    trackerId: string; setTrackerId: (v: string) => void;
    testingConn: boolean; testResult: { ok: boolean; msg: string } | null;
    pingHistory: number[]; avgLatencyMs: number | null;
    onTest: () => void;
}) {
    return (
        <div className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-md border border-white/40 dark:border-slate-700/40 rounded-2xl shadow-[0_4px_30px_rgba(0,0,0,0.05)] overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30 text-white">{I.link}</div>
                    <div>
                        <h2 className="text-base font-semibold text-slate-900 dark:text-white">Connection settings</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Base URL, access key, and test tracker ID</p>
                    </div>
                </div>
                <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 text-[10px] uppercase tracking-wider font-bold">
                    {I.shield} <span>OAuth2 · Read/Write</span>
                </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-0">
                {/* form */}
                <div className="lg:col-span-3 p-6 space-y-5 border-b lg:border-b-0 lg:border-r border-slate-100 dark:border-slate-800/80">
                    <div>
                        <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 mb-1.5">Base URL</label>
                        <div className="relative group">
                            <input
                                type="text" value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
                                placeholder="Enter your Tuleap base URL"
                                className="w-full h-11 px-3.5 pr-10 rounded-lg bg-white/70 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/70 dark:border-slate-700/70 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all"
                            />
                            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-violet-500 transition-colors" title="Copy"
                                onClick={() => baseUrl && navigator.clipboard.writeText(baseUrl)}>
                                {I.copy}
                            </button>
                        </div>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">e.g. https://tuleap.example.com, no trailing slash</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="sm:col-span-2">
                            <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 mb-1.5">Access key</label>
                            <div className="relative">
                                <input
                                    type={showKey ? 'text' : 'password'} value={accessKey} onChange={e => setAccessKey(e.target.value)}
                                    placeholder="Enter your Tuleap access key"
                                    className="w-full h-11 px-3.5 pr-10 rounded-lg bg-white/70 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/70 dark:border-slate-700/70 text-sm font-mono text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all"
                                />
                                <button onClick={() => setShowKey(!showKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-violet-500 transition-colors">
                                    {showKey ? I.eyeOff : I.eye}
                                </button>
                            </div>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Personal access key from Tuleap account keys</p>
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 mb-1.5">Test tracker ID</label>
                            <input
                                type="number" value={trackerId} onChange={e => setTrackerId(e.target.value)}
                                placeholder="Tracker ID (e.g. 104)"
                                className="w-full h-11 px-3.5 rounded-lg bg-white/70 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/70 dark:border-slate-700/70 text-sm font-mono text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap pt-1">
                        <button
                            onClick={onTest}
                            disabled={testingConn || !trackerId || !baseUrl || !accessKey}
                            title={!baseUrl ? 'Enter the Tuleap base URL' : !accessKey ? 'Enter an access key' : !trackerId ? 'Enter a tracker ID' : undefined}
                            className="inline-flex items-center gap-2 px-4 h-9 rounded-lg text-sm font-semibold bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-500/30 hover:from-violet-600 hover:to-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all active:scale-95">
                            {testingConn
                                ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.22-8.56" stroke="currentColor" strokeWidth="2.5"/></svg>
                                : I.check}
                            {testingConn ? 'Testing…' : 'Test connection'}
                        </button>
                        {testResult?.ok && (
                            <span className="text-xs inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                Connected successfully
                            </span>
                        )}
                        {(!baseUrl || !accessKey || !trackerId) && !testingConn && (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                Fill in Base URL, access key, and tracker ID to enable
                            </span>
                        )}
                    </div>
                </div>

                {/* diagnostics */}
                <div className="lg:col-span-2 p-6">
                    <DiagnosticsPanel testResult={testResult} pingHistory={pingHistory} avgLatencyMs={avgLatencyMs} />
                </div>
            </div>
        </div>
    );
}

// ── mapping card ──────────────────────────────────────────────────────────────

function MappingCard({ group, onConfigure, onDelete }: { group: GroupedMapping; onConfigure: () => void; onDelete: () => void }) {
    const healthy = group.configs.every(c => c.is_active);
    return (
        <div className="group relative bg-white/70 dark:bg-slate-900/60 backdrop-blur-md border border-white/40 dark:border-slate-700/40 rounded-2xl p-5 shadow-[0_4px_30px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_40px_rgba(124,58,237,0.15)] hover:border-violet-300/60 dark:hover:border-violet-500/30 transition-all">
            {/* header */}
            <div className="flex items-start gap-3 mb-4">
                <div className="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 dark:from-violet-500/30 dark:to-indigo-500/30 flex items-center justify-center text-violet-700 dark:text-violet-300 text-[11px] font-bold tracking-tight border border-violet-200/50 dark:border-violet-500/20">
                    {group.project_name.slice(0, 3).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">{group.project_name}</h3>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="font-mono">Tuleap #{group.configs[0]?.tuleap_project_id}</span>
                        <span className="opacity-50">·</span>
                        <span className="inline-flex items-center gap-1">
                            <span className={`w-1.5 h-1.5 rounded-full ${healthy ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                            {healthy ? 'Active' : 'Partial'}
                        </span>
                    </div>
                </div>
            </div>

            {/* tracker grid */}
            <div className="grid grid-cols-2 gap-2 mb-4">
                {TRACKER_TYPES.map(t => {
                    const cfg = group.configs.find(c => c.tracker_type === t);
                    const meta = TRACKER_META[t];
                    return (
                        <div key={t} className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border transition-colors ${
                            cfg
                                ? 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-700/40'
                                : 'bg-slate-50/30 dark:bg-slate-800/20 border-dashed border-slate-200/60 dark:border-slate-700/40 opacity-50'
                        }`}>
                            <div className="flex items-center gap-2 min-w-0">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
                                <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 truncate">{meta.label}</span>
                                {cfg && <span className="text-[10px] font-mono text-slate-400">#{cfg.tuleap_tracker_id}</span>}
                            </div>
                            {cfg && (
                                <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${
                                    cfg.is_active
                                        ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20'
                                        : 'text-slate-400 bg-slate-100 dark:bg-slate-800'
                                }`}>
                                    {cfg.is_active ? 'on' : 'off'}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* footer */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800/80">
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                    {group.configs.length} tracker{group.configs.length !== 1 ? 's' : ''} configured
                </span>
                <div className="flex items-center gap-1">
                    <button onClick={onConfigure} className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-violet-600 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors">
                        Configure
                    </button>
                    <button onClick={onDelete} className="px-2 py-1 rounded-md text-rose-500/80 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors" title="Delete">
                        {I.trash}
                    </button>
                </div>
            </div>
        </div>
    );
}

function AddMappingCard({ onAdd }: { onAdd: () => void }) {
    return (
        <button onClick={onAdd}
            className="group relative rounded-2xl border-2 border-dashed border-slate-300/70 dark:border-slate-700/70 hover:border-violet-400 dark:hover:border-violet-500/60 bg-white/30 dark:bg-slate-900/30 backdrop-blur-md p-5 flex flex-col items-center justify-center min-h-[260px] transition-all hover:bg-violet-50/40 dark:hover:bg-violet-900/10">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 group-hover:from-violet-500 group-hover:to-indigo-600 flex items-center justify-center text-violet-500 group-hover:text-white transition-all mb-3 shadow-sm group-hover:shadow-lg group-hover:shadow-violet-500/30">
                {I.plus}
            </div>
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Add project mapping</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 text-center max-w-[200px]">Link a QC project to a Tuleap project and tracker set</div>
        </button>
    );
}

// ── field mapping + schedule panels ──────────────────────────────────────────

function FieldMappingPreviewCard() {
    const FIELD_RULES = [
        { qc: 'title',       tuleap: 'summary',     type: 'text',   required: true  },
        { qc: 'description', tuleap: 'details',      type: 'html',   required: false },
        { qc: 'severity',    tuleap: 'severity',     type: 'select', required: true  },
        { qc: 'status',      tuleap: 'status',       type: 'select', required: true  },
        { qc: 'assignee',    tuleap: 'assigned_to',  type: 'user',   required: false },
        { qc: 'labels',      tuleap: 'category',     type: 'multi',  required: false },
    ];
    const typeTone: Record<string, string> = {
        text: 'text-slate-500', html: 'text-violet-600 dark:text-violet-300',
        select: 'text-blue-600 dark:text-blue-300', user: 'text-emerald-600 dark:text-emerald-300',
        multi: 'text-violet-600 dark:text-violet-300',
    };
    return (
        <div className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-md border border-white/40 dark:border-slate-700/40 rounded-2xl shadow-[0_4px_30px_rgba(0,0,0,0.05)] overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">{I.filter}</div>
                    <div>
                        <h2 className="text-base font-semibold text-slate-900 dark:text-white">Field mapping</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Default mapping · customizable in project mappings</p>
                    </div>
                </div>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {FIELD_RULES.map(r => (
                    <div key={r.qc} className="grid grid-cols-12 items-center gap-3 px-5 py-2.5 text-sm hover:bg-violet-50/30 dark:hover:bg-violet-900/10 transition-colors">
                        <div className="col-span-4 font-mono text-xs text-slate-700 dark:text-slate-200">{r.qc}</div>
                        <div className="col-span-1 text-slate-300 dark:text-slate-600 flex justify-center">
                            <Ico d={<><path d="M5 12h14"/><path d="M13 5l7 7-7 7"/></>} />
                        </div>
                        <div className="col-span-4 font-mono text-xs text-violet-700 dark:text-violet-300">{r.tuleap}</div>
                        <div className="col-span-3 flex items-center justify-end gap-1.5">
                            <span className={`text-[10px] uppercase tracking-wider font-semibold ${typeTone[r.type] || 'text-slate-400'}`}>{r.type}</span>
                            {r.required && <span className="text-[9px] uppercase tracking-wider font-bold text-rose-500/80 px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-900/20">req</span>}
                        </div>
                    </div>
                ))}
                <div className="px-5 py-3 bg-slate-50/60 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">These are the defaults. Customize mappings per project.</span>
                    <a href="#project-mappings" className="text-[11px] font-semibold text-violet-600 dark:text-violet-300 hover:underline">Jump to project mappings</a>
                </div>
            </div>
        </div>
    );
}

function SyncHistoryCard({ items }: { items: TuleapSyncHistoryItem[] }) {
    const statusTone: Record<TuleapSyncHistoryItem['processing_status'], string> = {
        processed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300',
        failed: 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300',
        duplicate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
        rejected: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300',
        received: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300',
    };

    return (
        <div className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-md border border-white/40 dark:border-slate-700/40 rounded-2xl shadow-[0_4px_30px_rgba(0,0,0,0.05)] overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/30">{I.clock}</div>
                    <div>
                        <h2 className="text-base font-semibold text-slate-900 dark:text-white">Sync history</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Recent Tuleap webhook ingestions</p>
                    </div>
                </div>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">{items.length} recent</span>
            </div>

            {items.length === 0 ? (
                <div className="px-6 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                    No Tuleap webhook activity has been recorded yet.
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 dark:border-slate-800/80">
                                <th className="text-left py-3 px-5 text-[10px] uppercase tracking-wider font-bold text-slate-400">Time</th>
                                <th className="text-left py-3 px-5 text-[10px] uppercase tracking-wider font-bold text-slate-400">Tracker</th>
                                <th className="text-left py-3 px-5 text-[10px] uppercase tracking-wider font-bold text-slate-400">Artifact</th>
                                <th className="text-left py-3 px-5 text-[10px] uppercase tracking-wider font-bold text-slate-400">Type</th>
                                <th className="text-left py-3 px-5 text-[10px] uppercase tracking-wider font-bold text-slate-400">Status</th>
                                <th className="text-right py-3 px-5 text-[10px] uppercase tracking-wider font-bold text-slate-400">Latency</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map(item => (
                                <tr
                                    key={item.id}
                                    title={item.error_message || undefined}
                                    className={`border-b border-slate-100 dark:border-slate-800/80 transition-colors ${
                                        item.processing_status === 'failed'
                                            ? 'bg-rose-50/40 dark:bg-rose-900/10 hover:bg-rose-50/70 dark:hover:bg-rose-900/20'
                                            : 'hover:bg-violet-50/30 dark:hover:bg-violet-900/10'
                                    }`}
                                >
                                    <td className="py-3 px-5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{timeAgo(item.created_at)}</td>
                                    <td className="py-3 px-5">
                                        <div className="font-mono text-slate-700 dark:text-slate-200">#{item.tuleap_tracker_id || '—'}</div>
                                        <div className="text-[11px] text-slate-400 truncate max-w-[180px]">{item.qc_project_name || item.configured_tracker_type || 'Unmapped'}</div>
                                    </td>
                                    <td className="py-3 px-5 font-mono text-slate-700 dark:text-slate-200">#{item.tuleap_artifact_id}</td>
                                    <td className="py-3 px-5 text-slate-600 dark:text-slate-300">{item.artifact_type || item.configured_tracker_type || '—'}</td>
                                    <td className="py-3 px-5">
                                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold ${statusTone[item.processing_status] || statusTone.received}`}>
                                            {item.processing_status}
                                        </span>
                                    </td>
                                    <td className="py-3 px-5 text-right font-mono text-slate-500 dark:text-slate-400">{formatLatency(item.created_at, item.processed_at)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function TuleapSettingsPage() {
    const [configs, setConfigs] = useState<TuleapSyncConfig[]>([]);
    const [projects, setProjects] = useState<ProjectOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [success, setSuccess] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Connection settings
    const [baseUrl, setBaseUrl] = useState('');
    const [accessKey, setAccessKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [testTrackerId, setTestTrackerId] = useState('');
    const [testingConn, setTestingConn] = useState(false);
    const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

    // Drawer / modal
    const [configProject, setConfigProject] = useState<GroupedMapping | null>(null);
    const [addingMapping, setAddingMapping] = useState(false);

    // Delete confirmation
    const [deletingProject, setDeletingProject] = useState<string | null>(null);

    // Unconfigured trackers
    const [unconfigured, setUnconfigured] = useState<{ tuleap_tracker_id: number; latest_artifact_id: number | null; latest_attempt: string; attempt_count: number }[]>([]);
    const [status, setStatus] = useState<TuleapStatus | null>(null);
    const [syncHistory, setSyncHistory] = useState<TuleapSyncHistoryItem[]>([]);

    const showSuccessMsg = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(null), 3500); };
    const showErrorMsg   = (msg: string) => { setError(msg);   setTimeout(() => setError(null), 5000); };

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [configRes, projData, unconfRes, statusRes, historyRes] = await Promise.all([
                tuleapConfigApi.list(),
                fetchApi<ApiProject[]>('/projects'),
                fetchApi<{ data: { tuleap_tracker_id: number; latest_artifact_id: number | null; latest_attempt: string; attempt_count: number }[] }>('/tuleap-webhook/config/unconfigured').catch(() => ({ data: [] as any })),
                tuleapConfigApi.status().catch(() => null),
                tuleapConfigApi.syncHistory(20).catch(() => null),
            ]);
            const configList = configRes.data ?? (configRes as any);
            setConfigs(Array.isArray(configList) ? configList : []);
            setProjects(projData.map((p: ApiProject) => ({ id: p.id, project_id: p.project_id, project_name: p.project_name })));
            setUnconfigured(Array.isArray(unconfRes.data) ? unconfRes.data : []);
            setStatus(statusRes?.data ?? null);
            setSyncHistory(Array.isArray(historyRes?.data) ? historyRes.data : []);
        } catch (err: any) {
            showErrorMsg(err.message || 'Failed to load data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    // Group configs by project
    const groupedMappings: GroupedMapping[] = React.useMemo(() => {
        const map: Record<string, TuleapSyncConfig[]> = {};
        for (const c of configs) {
            if (!map[c.qc_project_id]) map[c.qc_project_id] = [];
            map[c.qc_project_id].push(c);
        }
        return Object.keys(map).map(qcId => {
            const proj = projects.find(p => p.id === qcId || p.project_id === qcId);
            return { qc_project_id: qcId, project_name: proj?.project_name || qcId, configs: map[qcId] };
        });
    }, [configs, projects]);

    // Test connection
    const handleTestConnection = async () => {
        if (!baseUrl || !accessKey || !testTrackerId) { showErrorMsg('Enter Base URL, access key, and Tracker ID to test'); return; }
        setTestingConn(true);
        setTestResult(null);
        try {
            const res = await tuleapConfigApi.testConnection({
                tuleap_base_url: baseUrl,
                tuleap_tracker_id: Number(testTrackerId),
                access_key: accessKey,
            });
            const tracker = res.tracker;
            setTestResult({ ok: true, msg: `Connected to "${tracker.name}" (${tracker.item_name}) — ${tracker.fields.length} fields detected` });
        } catch (err: any) {
            setTestResult({ ok: false, msg: err.message || 'Connection failed' });
        } finally {
            setTestingConn(false);
        }
    };

    // Delete project mapping
    const confirmDeleteProject = async () => {
        if (!deletingProject) return;
        const group = groupedMappings.find(g => g.qc_project_id === deletingProject);
        if (!group) return;
        try {
            await Promise.all(group.configs.map(c => tuleapConfigApi.delete(c.id)));
            showSuccessMsg('Mapping deleted');
            setDeletingProject(null);
            if (configProject?.qc_project_id === deletingProject) setConfigProject(null);
            loadData();
        } catch (err: any) {
            showErrorMsg(err.message);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Loading Tuleap configuration…
                </div>
            </div>
        );
    }

    const connectedCount  = groupedMappings.length;
    const totalTrackers   = configs.length;
    const healthyCount    = groupedMappings.filter(g => g.configs.every(c => c.is_active)).length;
    const degradedCount   = groupedMappings.length - healthyCount;
    const connectionState: ConnectionState = testResult === null ? 'untested' : testResult.ok ? 'ok' : 'fail';
    const connectionBadge = {
        untested: {
            wrap: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
            dot: 'bg-slate-400',
            ping: false,
            label: 'Not tested',
        },
        ok: {
            wrap: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
            dot: 'bg-emerald-500',
            ping: true,
            label: 'Connected',
        },
        fail: {
            wrap: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300',
            dot: 'bg-rose-500',
            ping: false,
            label: 'Connection failed',
        },
    }[connectionState];

    return (
        <div className="min-h-screen relative">
            {/* decorative orbs */}
            <div aria-hidden className="fixed top-0 right-1/4 w-[600px] h-[600px] rounded-full opacity-[0.03] dark:opacity-[0.06] pointer-events-none -z-10" style={{ background: '#7c3aed', filter: 'blur(120px)' }} />
            <div aria-hidden className="fixed bottom-1/4 left-0 w-[400px] h-[400px] rounded-full opacity-[0.03] dark:opacity-[0.05] pointer-events-none -z-10" style={{ background: '#6366f1', filter: 'blur(100px)' }} />

            {/* toast messages */}
            {(success || error) && (
                <div className="fixed top-4 right-4 z-[100] space-y-2">
                    {success && (
                        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50/90 dark:bg-emerald-900/40 border border-emerald-200/60 dark:border-emerald-700/50 rounded-xl text-emerald-800 dark:text-emerald-200 text-sm font-medium shadow-lg backdrop-blur-md">
                            {I.check} {success}
                        </div>
                    )}
                    {error && (
                        <div className="flex items-center gap-2 px-4 py-3 bg-rose-50/90 dark:bg-rose-900/40 border border-rose-200/60 dark:border-rose-700/50 rounded-xl text-rose-800 dark:text-rose-200 text-sm font-medium shadow-lg backdrop-blur-md">
                            {I.warn} {error}
                        </div>
                    )}
                </div>
            )}

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

                {/* ── Header ── */}
                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-2">
                            <Link href="/admin" className="hover:text-slate-700 dark:hover:text-slate-200 transition-colors">Admin</Link>
                            <span className="text-slate-300 dark:text-slate-600">/</span>
                            <span>Integrations</span>
                            <span className="text-slate-300 dark:text-slate-600">/</span>
                            <span className="text-slate-700 dark:text-slate-200 font-semibold">Tuleap</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <Link href="/admin" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" title="Back">
                                {I.back}
                            </Link>
                            <h1 className="text-[28px] font-bold text-slate-900 dark:text-white tracking-tight leading-none">Tuleap Integration</h1>
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider font-bold ${connectionBadge.wrap}`}>
                                <span className="relative flex w-1.5 h-1.5">
                                    {connectionBadge.ping && <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />}
                                    <span className={`relative inline-flex w-1.5 h-1.5 rounded-full ${connectionBadge.dot}`} />
                                </span>
                                {connectionBadge.label}
                            </span>
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 ml-8 mt-1">
                            Manage Tuleap connection, project mappings, and field rules for syncing bugs, tasks, stories, and test cases.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 ml-8 lg:ml-0">
                        <button onClick={loadData}
                            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl text-sm font-semibold bg-white/70 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-700/60 text-slate-700 dark:text-slate-200 hover:border-violet-400/60 transition-all">
                            {I.refresh} Refresh
                        </button>
                    </div>
                </div>

                {/* ── KPI strip ── */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    <KpiTile label="Mapped projects"  value={connectedCount}  sub={`of ${projects.length} QC projects`} accent="violet"  icon={I.folder} />
                    <KpiTile label="Trackers synced"  value={totalTrackers}   sub="bugs · tasks · stories · cases"      accent="blue"    icon={I.link} />
                    <KpiTile label="Healthy mappings" value={healthyCount}    sub={`${degradedCount} degraded`}          accent="emerald" icon={I.sparkle} />
                    <KpiTile
                        label="Last sync"
                        value={status?.last_success_at ? timeAgo(status.last_success_at) : '—'}
                        sub={status?.last_success_at ? new Date(status.last_success_at).toLocaleString() : 'no sync recorded'}
                        accent="emerald"
                        icon={I.clock}
                    />
                    <KpiTile
                        label="Avg latency"
                        value={status?.avg_latency_ms != null ? `${status.avg_latency_ms} ms` : '—'}
                        sub={status?.p95_latency_ms != null ? `p95 · ${status.p95_latency_ms} ms` : 'no recent data'}
                        accent="amber"
                        icon={I.bolt}
                    />
                    <KpiTile
                        label="Sync mode"
                        value={status?.sync_mode === 'webhook' || status?.sync_mode_label ? 'Webhook' : '—'}
                        sub={status?.sync_mode_label || 'no status data'}
                        accent="rose"
                        icon={I.clock}
                    />
                </div>

                {/* ── Connection settings + diagnostics ── */}
                <ConnectionCard
                    baseUrl={baseUrl} setBaseUrl={setBaseUrl}
                    accessKey={accessKey} setAccessKey={setAccessKey}
                    showKey={showKey} setShowKey={setShowKey}
                    trackerId={testTrackerId} setTrackerId={setTestTrackerId}
                    testingConn={testingConn} testResult={testResult}
                    pingHistory={status?.ping_history ?? []}
                    avgLatencyMs={status?.avg_latency_ms ?? null}
                    onTest={handleTestConnection}
                />

                {/* ── Project mappings ── */}
                <section id="project-mappings" className="scroll-mt-6">
                    <div className="flex items-end justify-between mb-3 px-1">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Project mappings</h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Map QC Manager projects to Tuleap project IDs and trackers</p>
                        </div>
                        <div className="flex items-center gap-3">
                            {groupedMappings.length > 0 && (
                                <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {healthyCount} active
                                    {degradedCount > 0 && (
                                        <>
                                            <span className="opacity-50 mx-1">·</span>
                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> {degradedCount} partial
                                        </>
                                    )}
                                </span>
                            )}
                            <button onClick={() => setAddingMapping(true)}
                                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-500/30 hover:from-violet-600 hover:to-indigo-700 transition-all active:scale-95">
                                {I.plus} Add mapping
                            </button>
                        </div>
                    </div>

                    {groupedMappings.length === 0 ? (
                        <div className="rounded-2xl border-2 border-dashed border-slate-200/60 dark:border-slate-700/60 py-16 flex flex-col items-center justify-center gap-3">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 flex items-center justify-center text-violet-400">
                                <Ico d={<><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>} size={28} />
                            </div>
                            <div className="text-sm font-semibold text-slate-600 dark:text-slate-300">No project mappings yet</div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Click "Add mapping" to link your first QC project to Tuleap.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                            {groupedMappings.map(g => (
                                <MappingCard
                                    key={g.qc_project_id}
                                    group={g}
                                    onConfigure={() => setConfigProject(g)}
                                    onDelete={() => setDeletingProject(g.qc_project_id)}
                                />
                            ))}
                            <AddMappingCard onAdd={() => setAddingMapping(true)} />
                        </div>
                    )}
                </section>

                {/* ── Field mapping preview ── */}
                <FieldMappingPreviewCard />

                {/* ── Sync history ── */}
                <SyncHistoryCard items={syncHistory} />

                {/* ── Unconfigured trackers ── */}
                {unconfigured.length > 0 && (
                    <div className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-md border border-amber-200/60 dark:border-amber-700/40 rounded-2xl shadow-[0_4px_30px_rgba(0,0,0,0.05)] overflow-hidden">
                        <div className="px-6 py-4 border-b border-amber-100 dark:border-amber-800/40 flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/30">{I.warn}</div>
                            <div>
                                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Unconfigured trackers</h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    {unconfigured.length} tracker{unconfigured.length !== 1 ? 's' : ''} sent webhooks without a matching config
                                </p>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-100 dark:border-slate-800/80">
                                        <th className="text-left py-3 px-5 text-[10px] uppercase tracking-wider font-bold text-slate-400">Tracker ID</th>
                                        <th className="text-left py-3 px-5 text-[10px] uppercase tracking-wider font-bold text-slate-400">Latest Artifact</th>
                                        <th className="text-left py-3 px-5 text-[10px] uppercase tracking-wider font-bold text-slate-400">Attempts</th>
                                        <th className="text-left py-3 px-5 text-[10px] uppercase tracking-wider font-bold text-slate-400">Last Attempt</th>
                                        <th className="text-right py-3 px-5 text-[10px] uppercase tracking-wider font-bold text-slate-400">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {unconfigured.map(u => (
                                        <tr key={u.tuleap_tracker_id} className="border-b border-slate-100 dark:border-slate-800/80 hover:bg-violet-50/30 dark:hover:bg-violet-900/10 transition-colors">
                                            <td className="py-3 px-5 font-mono text-amber-600 dark:text-amber-400 font-semibold">#{u.tuleap_tracker_id}</td>
                                            <td className="py-3 px-5 text-slate-600 dark:text-slate-300">{u.latest_artifact_id || '—'}</td>
                                            <td className="py-3 px-5 text-slate-600 dark:text-slate-300">{u.attempt_count}</td>
                                            <td className="py-3 px-5 text-slate-400 text-xs">{u.latest_attempt ? new Date(u.latest_attempt).toLocaleString() : '—'}</td>
                                            <td className="py-3 px-5 text-right">
                                                <button
                                                    onClick={() => setAddingMapping(true)}
                                                    className="text-xs font-semibold text-violet-600 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 px-2.5 py-1 rounded-md transition-colors">
                                                    Map this tracker
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ── Footer ── */}
                <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 pt-2 pb-4">
                    <span>OAuth2 token rotates every 90 days · managed by Tuleap</span>
                    <span>Sync powered by n8n webhook pipeline</span>
                </div>
            </div>

            {/* ── Tracker config drawer ── */}
            <TrackerConfigDrawer
                open={!!configProject}
                project={configProject}
                onClose={() => setConfigProject(null)}
                onSaved={() => { loadData(); showSuccessMsg('Changes saved'); }}
            />

            {/* ── New mapping modal ── */}
            <NewMappingModal
                open={addingMapping}
                onClose={() => setAddingMapping(false)}
                onCreated={() => { loadData(); showSuccessMsg('Mapping created successfully'); }}
                projects={projects}
                baseUrl={baseUrl}
            />

            {/* ── Delete confirmation ── */}
            {deletingProject && (() => {
                const group = groupedMappings.find(g => g.qc_project_id === deletingProject);
                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
                        <div className="glass-modal w-full max-w-md p-6 space-y-4">
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center shrink-0 text-rose-500">
                                    {I.warn}
                                </div>
                                <div>
                                    <h3 className="font-semibold text-slate-900 dark:text-white">Delete mapping</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                        Delete all Tuleap mappings for{' '}
                                        <span className="font-medium text-slate-700 dark:text-slate-200">"{group?.project_name || deletingProject}"</span>?
                                        This will remove {group?.configs.length || 0} tracker configuration{(group?.configs.length || 0) !== 1 ? 's' : ''}.
                                    </p>
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <button onClick={() => setDeletingProject(null)}
                                    className="text-sm px-4 h-9 rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors font-medium">
                                    Cancel
                                </button>
                                <button onClick={confirmDeleteProject}
                                    className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 h-9 rounded-lg bg-rose-500 hover:bg-rose-600 text-white transition-colors active:scale-95">
                                    {I.trash} Delete mapping
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}

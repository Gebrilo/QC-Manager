'use client';

/**
 * Resource Utilization + Resource Analytics, redesigned per the "My Dashboard"
 * design (claude.ai/design · New QC Design / My Dashboard.html).
 *
 * Unlike the design mock — which ships a hard-coded historical dataset and a
 * fabricated per-member "budget" — this is wired entirely to the real tasks the
 * admin dashboard already loads. The Year / Month / Day selector is a genuine
 * client-side period filter over each task's representative date, and the bars
 * compare actual (logged) vs estimated (planned) hours, matching the app's
 * existing "over budget = actual > estimate" semantics.
 */

import { useEffect, useMemo, useState } from 'react';
import { Task } from '@/types';

/* ─────────────────────── TYPES ─────────────────────── */

type Granularity = 'year' | 'month' | 'day';

interface DateFilterState {
    granularity: Granularity;
    year: number;
    month: number | null; // 1-12
    day: number | null; // 1-31
}

interface MemberStat {
    key: string;
    name: string;
    initials: string;
    tone: string;
    tasks: number;
    planned: number; // estimated hrs
    logged: number; // actual hrs
}

interface PeriodAnalytics {
    finished: number;
    efficiency: number; // est / actual
    est: number;
    actual: number;
    variance: number; // actual - est
    completionPct: number;
    done: number;
    total: number;
}

/* ─────────────────────── CONSTANTS ─────────────────────── */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Avatar gradients, assigned deterministically per resource name.
const TONES = [
    'from-teal-500 to-emerald-600',
    'from-fuchsia-500 to-pink-600',
    'from-sky-500 to-blue-600',
    'from-indigo-500 to-violet-600',
    'from-amber-500 to-orange-600',
    'from-rose-500 to-red-600',
    'from-cyan-500 to-teal-600',
    'from-violet-500 to-purple-600',
];

function hashStr(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
}

function toneFor(name: string): string {
    return TONES[hashStr(name) % TONES.length];
}

function initialsFor(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ─────────────────────── DATE HELPERS ─────────────────────── */

// The date we file a task under for period filtering: completion first, then
// deadline, then created — mirroring the existing dashboard widgets.
function representativeDate(t: Task): Date | null {
    const raw = t.completed_date || t.deadline || t.created_at;
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
}

function matchesPeriod(d: Date | null, f: DateFilterState): boolean {
    if (!d) return false;
    if (d.getFullYear() !== f.year) return false;
    if (f.granularity === 'year') return true;
    if (d.getMonth() + 1 !== f.month) return false;
    if (f.granularity === 'month') return true;
    return d.getDate() === f.day;
}

/**
 * Period analytics, optionally scoped to a single resource. When `resource` is
 * null the figures aggregate every assignee in the period; otherwise only that
 * resource's contribution counts (R1 and/or R2 share of each task they're on).
 */
function computeAnalytics(tasks: Task[], resource: string | null): PeriodAnalytics {
    let est = 0;
    let actual = 0;
    let done = 0;
    let total = 0;

    if (!resource) {
        tasks.forEach(t => {
            est += Number(t.r1_estimate_hrs || 0) + Number(t.r2_estimate_hrs || 0);
            actual += Number(t.r1_actual_hrs || 0) + Number(t.r2_actual_hrs || 0);
            if (t.status === 'Done') done += 1;
        });
        total = tasks.length;
    } else {
        tasks.forEach(t => {
            const isR1 = t.resource1_name === resource;
            const isR2 = t.resource2_name === resource;
            if (!isR1 && !isR2) return;
            if (isR1) {
                est += Number(t.r1_estimate_hrs || 0);
                actual += Number(t.r1_actual_hrs || 0);
            }
            if (isR2) {
                est += Number(t.r2_estimate_hrs || 0);
                actual += Number(t.r2_actual_hrs || 0);
            }
            total += 1;
            if (t.status === 'Done') done += 1;
        });
    }

    return {
        finished: done,
        efficiency: actual > 0 ? est / actual : 0,
        est,
        actual,
        variance: actual - est,
        completionPct: total > 0 ? (done / total) * 100 : 0,
        done,
        total,
    };
}

/* ─────────────────────── SMALL UI HELPERS ─────────────────────── */

function MdAvatar({ initials, tone, size = 28 }: { initials: string; tone: string; size?: number }) {
    return (
        <div
            className={'rounded-full bg-gradient-to-br ' + tone + ' flex items-center justify-center text-white font-semibold flex-shrink-0'}
            style={{ width: size, height: size, fontSize: size * 0.38 }}
        >
            {initials}
        </div>
    );
}

function MdSelect({
    value,
    onChange,
    children,
    className = '',
}: {
    value: string | number;
    onChange: (v: string) => void;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <select
            value={value}
            onChange={e => onChange(e.target.value)}
            className={
                'sel-arrow h-7 px-2 rounded-md text-[11px] font-medium ' +
                'bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 ' +
                'text-slate-700 dark:text-slate-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ' +
                className
            }
        >
            {children}
        </select>
    );
}

/* ─────────────────────── DATE FILTER ─────────────────────── */

function DateFilter({
    filter,
    setFilter,
    years,
}: {
    filter: DateFilterState;
    setFilter: React.Dispatch<React.SetStateAction<DateFilterState>>;
    years: number[];
}) {
    const { granularity, year, month, day } = filter;

    function setGrain(g: Granularity) {
        setFilter(f => ({
            ...f,
            granularity: g,
            month: g === 'year' ? null : f.month || 1,
            day: g === 'day' ? f.day || 1 : null,
        }));
    }

    const daysInMonth = month ? new Date(year, month, 0).getDate() : 31;
    const grains: Granularity[] = ['year', 'month', 'day'];

    const periodLabel =
        granularity === 'year'
            ? `Full year ${year}`
            : granularity === 'month'
            ? `${MONTHS[(month || 1) - 1]} ${year}`
            : `${MONTHS[(month || 1) - 1]} ${day}, ${year}`;

    return (
        <div className="flex items-center flex-wrap gap-2">
            {/* Granularity pill tabs */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 rounded-lg p-0.5 gap-px">
                {grains.map(g => (
                    <button
                        key={g}
                        onClick={() => setGrain(g)}
                        className={
                            'h-6 px-3 rounded-md text-[11px] font-semibold transition-all capitalize ' +
                            (granularity === g
                                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200')
                        }
                    >
                        {g}
                    </button>
                ))}
            </div>

            {/* Year */}
            <MdSelect value={year} onChange={v => setFilter(f => ({ ...f, year: parseInt(v) }))}>
                {years.map(y => (
                    <option key={y} value={y}>
                        {y}
                    </option>
                ))}
            </MdSelect>

            {/* Month */}
            {(granularity === 'month' || granularity === 'day') && (
                <MdSelect value={month || 1} onChange={v => setFilter(f => ({ ...f, month: parseInt(v) }))}>
                    {MONTHS.map((mn, i) => (
                        <option key={i + 1} value={i + 1}>
                            {mn}
                        </option>
                    ))}
                </MdSelect>
            )}

            {/* Day */}
            {granularity === 'day' && (
                <MdSelect value={day || 1} onChange={v => setFilter(f => ({ ...f, day: parseInt(v) }))}>
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
                        <option key={d} value={d}>
                            {d}
                        </option>
                    ))}
                </MdSelect>
            )}

            <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{periodLabel}</span>
        </div>
    );
}

/* ─────────────────────── UTILIZATION ROW ─────────────────────── */

function UtilRow({ m, scale, selected, onSelect }: { m: MemberStat; scale: number; selected: boolean; onSelect: () => void }) {
    const within = Math.min(m.logged, m.planned);
    const over = Math.max(m.logged - m.planned, 0);
    const ratio = m.logged / Math.max(m.planned, 1);
    const pct = Math.round(ratio * 100);
    const plannedPct = (m.planned / scale) * 100;

    const state = m.planned === 0 ? 'ok' : ratio <= 1 ? 'ok' : ratio <= 1.3 ? 'high' : 'over';
    const barColor = state === 'ok' ? 'bg-emerald-500' : state === 'high' ? 'bg-amber-500' : 'bg-rose-500';
    const pillCls =
        state === 'ok'
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
            : state === 'high'
            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
            : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';

    const clampedPlannedPct = Math.min(plannedPct, 95);

    return (
        <button
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            title={selected ? `Showing ${m.name} — click to clear` : `Show ${m.name}'s analytics`}
            className={
                'w-full text-left flex items-center gap-3 px-4 py-2.5 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500/40 ' +
                (selected
                    ? 'bg-indigo-50/70 dark:bg-indigo-900/20 ring-1 ring-inset ring-indigo-300/60 dark:ring-indigo-700/50'
                    : 'hover:bg-slate-50/40 dark:hover:bg-slate-800/25')
            }
        >
            {/* avatar + name */}
            <div className="flex items-center gap-2 flex-shrink-0" style={{ width: 172 }}>
                <MdAvatar initials={m.initials} tone={m.tone} size={28} />
                <div className="min-w-0">
                    <div className="text-[12px] font-medium text-slate-800 dark:text-slate-100 truncate" title={m.name}>
                        {m.name}
                    </div>
                    <div className="text-[10px] text-slate-400">{m.tasks} tasks</div>
                </div>
            </div>

            {/* bar */}
            <div className="flex-1 min-w-0">
                <div className="relative h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="absolute inset-y-0 left-0 bg-indigo-500/70" style={{ width: `${(within / scale) * 100}%` }} />
                    {over > 0 && (
                        <div
                            className={'absolute inset-y-0 ' + barColor}
                            style={{ left: `${(within / scale) * 100}%`, width: `${(over / scale) * 100}%` }}
                        />
                    )}
                </div>
                {/* estimate marker */}
                <div className="relative" style={{ height: 0 }}>
                    <div
                        className="absolute w-px bg-slate-400/60 dark:bg-slate-500/60"
                        style={{ left: `${clampedPlannedPct}%`, top: -10, height: 10 }}
                    />
                </div>
            </div>

            {/* numbers */}
            <div className="flex items-center gap-3 flex-shrink-0">
                <div className="text-right leading-tight">
                    <div className="text-[12px] font-semibold text-slate-800 dark:text-slate-100 tabnum">
                        {m.logged.toFixed(0)}h <span className="font-normal text-slate-400 text-[10px]">/ {m.planned.toFixed(0)}h</span>
                    </div>
                    <div className="text-[10px] text-slate-400 tabnum">estimated</div>
                </div>
                <div className={'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold tabnum ' + pillCls}>
                    <span className={'w-1.5 h-1.5 rounded-full ' + barColor} />
                    {pct}%
                </div>
            </div>
        </button>
    );
}

/* ─────────────────────── UTILIZATION PANEL ─────────────────────── */

function ResourceUtilizationPanel({
    members,
    filterControl,
    selectedResource,
    onSelect,
}: {
    members: MemberStat[];
    filterControl: React.ReactNode;
    selectedResource: string | null;
    onSelect: (name: string) => void;
}) {
    const scale = Math.max(...members.map(m => Math.max(m.planned, m.logged)), 1);

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm flex flex-col">
            {/* header */}
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-2">
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" className="text-slate-400 flex-shrink-0">
                            <line x1="12" y1="20" x2="12" y2="10" />
                            <line x1="18" y1="20" x2="18" y2="4" />
                            <line x1="6" y1="20" x2="6" y2="16" />
                        </svg>
                        <span className="text-[13px] font-semibold text-slate-900 dark:text-white">Resource Utilization</span>
                        <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-0.5 font-medium">
                            {members.length} members
                        </span>
                    </div>
                </div>
                {filterControl}
            </div>

            {/* rows */}
            {members.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-400">No resource activity in this period.</div>
            ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {members.map(m => (
                        <UtilRow key={m.key} m={m} scale={scale} selected={m.name === selectedResource} onSelect={() => onSelect(m.name)} />
                    ))}
                </div>
            )}

            {/* legend */}
            <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center gap-4 flex-wrap mt-auto">
                <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
                    <span className="w-2.5 h-1.5 rounded-sm bg-indigo-500/70" />
                    Logged
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
                    <span className="w-2.5 h-1.5 rounded-sm bg-rose-500" />
                    Over estimate
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
                    <span className="w-px h-3 bg-slate-400/60" />
                    Estimated hrs
                </span>
            </div>
        </div>
    );
}

/* ─────────────────────── ANALYTICS PANEL ─────────────────────── */

function ResourceAnalyticsPanel({
    analytics,
    filter,
    selectedMember,
    onClear,
}: {
    analytics: PeriodAnalytics;
    filter: DateFilterState;
    selectedMember: MemberStat | null;
    onClear: () => void;
}) {
    const { est, actual, variance, finished, efficiency, completionPct, done, total } = analytics;
    // Consistent with the existing Resource Analytics widget: est/actual >= 1 is good.
    const effOk = efficiency >= 1.0;

    const periodLabel =
        filter.granularity === 'year'
            ? filter.year
            : filter.granularity === 'month'
            ? `${MONTHS[(filter.month || 1) - 1]} '${String(filter.year).slice(2)}`
            : `${filter.day} ${MONTHS[(filter.month || 1) - 1]}`;

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm flex flex-col">
            {/* header */}
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" className="text-slate-400">
                            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                        </svg>
                        <span className="text-[13px] font-semibold text-slate-900 dark:text-white">Resource Analytics</span>
                    </div>
                    <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-0.5">
                        {periodLabel}
                    </span>
                </div>

                {/* Scope: all resources, or a single drilled-in member */}
                {selectedMember ? (
                    <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-inset ring-indigo-200/70 dark:ring-indigo-800/50 px-2 py-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <MdAvatar initials={selectedMember.initials} tone={selectedMember.tone} size={20} />
                            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 truncate" title={selectedMember.name}>
                                {selectedMember.name}
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={onClear}
                            className="flex items-center gap-1 text-[10px] font-semibold text-indigo-600 dark:text-indigo-300 hover:text-indigo-800 dark:hover:text-indigo-100 flex-shrink-0"
                        >
                            <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                            Reset
                        </button>
                    </div>
                ) : (
                    <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">All resources · tap a member to drill in</p>
                )}
            </div>

            <div className="flex-1 flex flex-col gap-0 divide-y divide-slate-100 dark:divide-slate-800/60">
                {/* Finished tasks */}
                <div className="px-4 py-4 text-center">
                    <div className="text-4xl font-bold text-indigo-500 dark:text-indigo-400 tabnum leading-none mb-1">{finished}</div>
                    <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Finished Tasks</div>
                </div>

                {/* Efficiency */}
                <div className="px-4 py-4 text-center">
                    <div className={'text-4xl font-bold tabnum leading-none mb-1 ' + (effOk ? 'text-emerald-500 dark:text-emerald-400' : 'text-amber-500 dark:text-amber-400')}>
                        {efficiency.toFixed(2)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Efficiency Score</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Est / Actual</div>
                </div>

                {/* Hours */}
                <div className="px-4 py-4 text-center">
                    <div className="text-2xl font-bold text-slate-900 dark:text-white tabnum leading-none mb-1">
                        {actual.toFixed(1)}h<span className="text-base font-normal text-slate-400"> / {est.toFixed(1)}h</span>
                    </div>
                    <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Actual / Estimated</div>
                    <div className={'text-[11px] font-semibold mt-1 tabnum ' + (variance < 0 ? 'text-emerald-500' : variance > 0 ? 'text-rose-500' : 'text-slate-400')}>
                        {variance < 0 ? '−' : variance > 0 ? '+' : ''}
                        {Math.abs(variance).toFixed(1)}h variance
                    </div>
                </div>

                {/* Completion rate */}
                <div className="px-4 py-4 mt-auto">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Completion Rate</span>
                        <span className="text-[13px] font-bold text-slate-900 dark:text-white tabnum">{completionPct.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, completionPct)}%` }}
                        />
                    </div>
                    <div className="flex justify-between mt-1.5">
                        <span className="text-[10px] text-slate-400">{done} done</span>
                        <span className="text-[10px] text-slate-400">{total} total</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ─────────────────────── SECTION ROOT ─────────────────────── */

export function ResourceSection({ tasks }: { tasks: Task[] }) {
    const years = useMemo(() => {
        const set = new Set<number>();
        tasks.forEach(t => {
            const d = representativeDate(t);
            if (d) set.add(d.getFullYear());
        });
        set.add(new Date().getFullYear());
        return Array.from(set).sort((a, b) => a - b);
    }, [tasks]);

    const [filter, setFilter] = useState<DateFilterState>(() => ({
        granularity: 'year',
        year: new Date().getFullYear(),
        month: null,
        day: null,
    }));

    const [selectedResource, setSelectedResource] = useState<string | null>(null);

    const filteredTasks = useMemo(() => tasks.filter(t => matchesPeriod(representativeDate(t), filter)), [tasks, filter]);

    const members = useMemo<MemberStat[]>(() => {
        const stats: Record<string, { planned: number; logged: number; tasks: number }> = {};
        const add = (name: string | undefined, est: number, actual: number) => {
            if (!name || name === 'Unassigned') return;
            if (!stats[name]) stats[name] = { planned: 0, logged: 0, tasks: 0 };
            stats[name].planned += est;
            stats[name].logged += actual;
            stats[name].tasks += 1;
        };
        filteredTasks.forEach(t => {
            add(t.resource1_name, Number(t.r1_estimate_hrs || 0), Number(t.r1_actual_hrs || 0));
            add(t.resource2_name, Number(t.r2_estimate_hrs || 0), Number(t.r2_actual_hrs || 0));
        });
        return Object.entries(stats)
            .map(([name, s]) => ({ key: name, name, initials: initialsFor(name), tone: toneFor(name), ...s }))
            .sort((a, b) => b.planned - a.planned);
    }, [filteredTasks]);

    // Drop the drill-in if the selected resource has no activity in the new period.
    useEffect(() => {
        if (selectedResource && !members.some(m => m.name === selectedResource)) {
            setSelectedResource(null);
        }
    }, [members, selectedResource]);

    const analytics = useMemo<PeriodAnalytics>(() => computeAnalytics(filteredTasks, selectedResource), [filteredTasks, selectedResource]);

    const selectedMember = useMemo(
        () => (selectedResource ? members.find(m => m.name === selectedResource) ?? null : null),
        [members, selectedResource]
    );

    const toggleResource = (name: string) => setSelectedResource(prev => (prev === name ? null : name));

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-3">
            <ResourceUtilizationPanel
                members={members}
                filterControl={<DateFilter filter={filter} setFilter={setFilter} years={years} />}
                selectedResource={selectedResource}
                onSelect={toggleResource}
            />
            <ResourceAnalyticsPanel analytics={analytics} filter={filter} selectedMember={selectedMember} onClear={() => setSelectedResource(null)} />
        </div>
    );
}

'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    WorkloadBalanceWidget,
    TrendAnalysisWidget,
    TestExecutionSummaryWidget,
    BugSummaryWidget,
    QualityMetricsWidget,
    BlockedTestsWidget,
    GrossNetProgressWidget,
} from '@/components/governance';
import { getDashboardSummary, getQualityRisks, getExecutionTrend, getQualityMetrics, getBlockedAnalysis, getExecutionProgress } from '@/services/governanceApi';
import type { DashboardSummary, QualityRisk, TrendData, QualityMetrics, BlockedModuleAnalysis, ExecutionProgress } from '@/types/governance';
import { TestCoveragePanel } from '@/components/governance/TestCoveragePanel';
import ProjectHealthHeatmap from '@/components/governance/ProjectHealthHeatmap';
import { Badge } from '@/components/ui/Badge';

// ─── Icons ────────────────────────────────────────────────────────────────────
const ICON = {
    trend:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    metrics:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 20V10M18 20V4M6 20v-4"/></svg>,
    bug:      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="8" y="6" width="8" height="14" rx="4"/><path d="M8 10H4M20 10h-4M8 14H4M20 14h-4M8 18H5M19 18h-3M12 2v4M10 4l2-2 2 2"/></svg>,
    test:     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 2v7.5L4 18a2 2 0 001.7 3h12.6A2 2 0 0020 18l-6-8.5V2M8 2h8"/></svg>,
    coverage: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    heatmap:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>,
    risk:     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01"/></svg>,
    workload: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
    blocked:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M4.93 4.93l14.14 14.14"/></svg>,
    progress: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 4-4"/></svg>,
    refresh:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.08-8.02"/></svg>,
    download: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>,
    chevron:  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>,
};

// ─── Accent gradient map ───────────────────────────────────────────────────────
const GRAD: Record<string, string> = {
    violet:  'from-violet-500 to-indigo-600',
    rose:    'from-rose-500 to-pink-600',
    emerald: 'from-emerald-500 to-teal-500',
    amber:   'from-amber-500 to-orange-500',
    blue:    'from-blue-500 to-cyan-600',
    indigo:  'from-indigo-500 to-violet-600',
};
const GRAD_SHADOW: Record<string, string> = {
    violet: 'shadow-violet-500/25', rose: 'shadow-rose-500/25',
    emerald: 'shadow-emerald-500/25', amber: 'shadow-amber-500/25',
    blue: 'shadow-blue-500/25', indigo: 'shadow-indigo-500/25',
};

// ─── GovCard ──────────────────────────────────────────────────────────────────
interface GovCardProps {
    title?: string;
    subtitle?: string;
    accent?: string;
    icon?: React.ReactNode;
    action?: React.ReactNode;
    children: React.ReactNode;
    noPad?: boolean;
    className?: string;
}

function GovCard({ title, subtitle, accent = 'violet', icon, action, children, noPad, className = '' }: GovCardProps) {
    return (
        <div className={`bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-white/60 dark:border-slate-700/50 rounded-2xl shadow-[0_2px_20px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_20px_rgba(0,0,0,0.3)] overflow-hidden ${className}`}>
            {title && (
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        {icon && (
                            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${GRAD[accent]} ${GRAD_SHADOW[accent]} shadow-lg flex items-center justify-center flex-shrink-0`}>
                                <span className="text-white">{icon}</span>
                            </div>
                        )}
                        <div className="min-w-0">
                            <div className="text-sm font-bold text-slate-900 dark:text-white">{title}</div>
                            {subtitle && <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</div>}
                        </div>
                    </div>
                    {action && <div className="flex-shrink-0">{action}</div>}
                </div>
            )}
            <div className={noPad ? '' : 'p-5'}>{children}</div>
        </div>
    );
}

// ─── StatTile ─────────────────────────────────────────────────────────────────
interface StatTileProps {
    label: string;
    value: string | number;
    sub?: string;
    tone?: 'default' | 'rose' | 'emerald' | 'amber' | 'violet';
}

function StatTile({ label, value, sub, tone = 'default' }: StatTileProps) {
    const bg: Record<string, string> = {
        default: 'bg-white/60 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-700/50',
        rose:    'bg-rose-50/60 dark:bg-rose-950/30 border-rose-200/50 dark:border-rose-800/40',
        emerald: 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200/50 dark:border-emerald-800/40',
        amber:   'bg-amber-50/60 dark:bg-amber-950/30 border-amber-200/50 dark:border-amber-800/40',
        violet:  'bg-violet-50/60 dark:bg-violet-950/30 border-violet-200/50 dark:border-violet-800/40',
    };
    const val: Record<string, string> = {
        default: 'text-slate-900 dark:text-white',
        rose:    'text-rose-700 dark:text-rose-300',
        emerald: 'text-emerald-700 dark:text-emerald-300',
        amber:   'text-amber-700 dark:text-amber-300',
        violet:  'text-violet-700 dark:text-violet-300',
    };
    return (
        <div className={`rounded-xl border p-4 backdrop-blur-md ${bg[tone]}`}>
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 mb-1.5">{label}</div>
            <div className={`text-3xl font-extrabold tracking-tight ${val[tone]}`}>{value}</div>
            {sub && <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">{sub}</div>}
        </div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function GovernanceDashboardPage() {
    const router = useRouter();
    const [summary, setSummary] = useState<DashboardSummary | null>(null);
    const [topRisks, setTopRisks] = useState<QualityRisk[]>([]);
    const [trendData, setTrendData] = useState<TrendData[]>([]);
    const [qualityMetrics, setQualityMetrics] = useState<QualityMetrics[]>([]);
    const [blockedAnalysis, setBlockedAnalysis] = useState<BlockedModuleAnalysis[]>([]);
    const [execProgress, setExecProgress] = useState<ExecutionProgress[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [summaryData, risksData, trendDataResult, qualityMetricsData, blockedAnalysisData, execProgressData] = await Promise.all([
                getDashboardSummary(),
                getQualityRisks('CRITICAL'),
                getExecutionTrend(),
                getQualityMetrics(),
                getBlockedAnalysis(),
                getExecutionProgress(),
            ]);
            setSummary(summaryData);
            setTopRisks(risksData.slice(0, 5));
            setTrendData(trendDataResult);
            setQualityMetrics(qualityMetricsData);
            setBlockedAnalysis(blockedAnalysisData);
            setExecProgress(execProgressData);
        } catch (error) {
            console.error('Error loading dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleProjectClick = (projectId: string) => {
        router.push(`/work/projects/${projectId}/quality`);
    };

    const readyCount  = summary?.ready_for_release ?? 0;
    const critCount   = summary?.critical_risk_count ?? 0;
    const warnCount   = summary?.warning_risk_count ?? 0;
    const totalProjects = summary?.total_projects ?? 0;

    return (
        <div className="max-w-[1440px] mx-auto px-6 py-7 space-y-6 pb-12">

            {/* ── Page header ─────────────────────────────────── */}
            <div className="flex items-start justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Governance</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Quality health monitoring and release readiness</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 mt-1">
                    <button
                        onClick={loadData}
                        className="inline-flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-medium border border-slate-200/60 dark:border-slate-700/60 bg-white/50 dark:bg-slate-800/50 backdrop-blur-md text-slate-700 dark:text-slate-200 hover:bg-white/80 dark:hover:bg-slate-800/80 transition-all"
                    >
                        {ICON.refresh}
                        Refresh
                    </button>
                    <button
                        onClick={() => router.push('/quality/reports')}
                        className="inline-flex items-center gap-2 h-9 px-5 rounded-xl text-sm font-bold bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-500/30 active:scale-95 transition-all"
                    >
                        {ICON.download}
                        Export Report
                    </button>
                </div>
            </div>

            {/* ── KPI bar ─────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatTile label="Total Projects"    value={totalProjects}  sub="Active projects tracked" />
                <StatTile label="Ready for Release" value={readyCount}     sub="Passing all gates"         tone="emerald" />
                <StatTile label="Critical Risks"    value={critCount}      sub="Require immediate action"  tone="rose" />
                <StatTile label="Warning Signs"     value={warnCount}      sub="Needs monitoring"          tone="amber" />
            </div>

            {/* ── Global Quality Trend ─────────────────────── */}
            <GovCard
                icon={ICON.trend} accent="violet"
                title="Global Quality Trend (30 Days)"
                subtitle="Pass rate over time"
                action={
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100/70 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Live data
                    </span>
                }
            >
                <div className="h-[260px] w-full">
                    <TrendAnalysisWidget data={trendData} />
                </div>
            </GovCard>

            {/* ── Quality Metrics ───────────────────────────── */}
            <GovCard icon={ICON.metrics} accent="indigo" title="Quality Metrics" subtitle="Coverage, effectiveness, and effort estimation">
                <QualityMetricsWidget data={qualityMetrics} />
            </GovCard>

            {/* ── Blocked + Progress (7/5) ──────────────────── */}
            <div className="grid grid-cols-12 gap-5">
                <div className="col-span-12 lg:col-span-7">
                    <GovCard icon={ICON.blocked} accent="rose" title="Blocked Test Analysis" subtitle="Tests blocked or at-risk per project">
                        <BlockedTestsWidget data={blockedAnalysis} />
                    </GovCard>
                </div>
                <div className="col-span-12 lg:col-span-5">
                    <GovCard icon={ICON.progress} accent="emerald" title="Progress Overview" subtitle="Gross and net test progress per project">
                        <GrossNetProgressWidget data={execProgress} />
                    </GovCard>
                </div>
            </div>

            {/* ── Bug Summary ───────────────────────────────── */}
            <GovCard icon={ICON.bug} accent="rose" title="Bug Summary" subtitle="Defects synced from Tuleap">
                <BugSummaryWidget />
            </GovCard>

            {/* ── Test Execution Summary ────────────────────── */}
            <GovCard
                icon={ICON.test} accent="blue"
                title="Test Execution Summary"
                subtitle="Overview of all test runs"
                action={
                    <button
                        onClick={() => router.push('/quality/reports?tab=executions')}
                        className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
                    >
                        View All {ICON.chevron}
                    </button>
                }
            >
                <TestExecutionSummaryWidget />
            </GovCard>

            {/* ── Test Coverage & Readiness ─────────────────── */}
            <GovCard icon={ICON.coverage} accent="violet" title="Test Coverage & Readiness" subtitle="Task and story coverage per project">
                <TestCoveragePanel />
            </GovCard>

            {/* ── Heatmap + Risks (8/4) ─────────────────────── */}
            <div className="grid grid-cols-12 gap-5">
                <div className="col-span-12 lg:col-span-8">
                    <GovCard icon={ICON.heatmap} accent="violet" title="Project Health Heatmap" subtitle="Overall project quality health status">
                        <ProjectHealthHeatmap onProjectClick={handleProjectClick} />
                    </GovCard>
                </div>

                <div className="col-span-12 lg:col-span-4">
                    <GovCard icon={ICON.risk} accent="rose" title="Top Critical Risks" subtitle="Risks requiring immediate attention">
                        {loading ? (
                            <div className="space-y-3">
                                {[1,2,3].map(i => <div key={i} className="h-20 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />)}
                            </div>
                        ) : topRisks.length > 0 ? (
                            <div className="space-y-3">
                                {topRisks.map(risk => (
                                    <div key={risk.project_id} className="rounded-xl border border-rose-200/50 dark:border-rose-900/40 bg-rose-50/40 dark:bg-rose-950/20 p-3.5">
                                        <div className="flex items-center justify-between mb-2">
                                            <button
                                                className="text-xs font-extrabold text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-left"
                                                onClick={() => handleProjectClick(risk.project_id)}
                                            >
                                                {risk.project_name}
                                            </button>
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                                                Critical
                                            </span>
                                        </div>
                                        <ul className="space-y-1">
                                            {risk.risk_flags.map((flag: string) => (
                                                <li key={flag} className="flex items-center gap-2 text-[11px] text-rose-700 dark:text-rose-300">
                                                    <span className="w-1 h-1 rounded-full bg-rose-500 flex-shrink-0" />
                                                    {flag.replace(/_/g, ' ')}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                                <button className="block w-full text-center text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline py-1">
                                    View all risks →
                                </button>
                            </div>
                        ) : (
                            <div className="text-center py-8 text-slate-400 dark:text-slate-500">
                                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-2">
                                    {ICON.risk}
                                </div>
                                <p className="text-sm font-medium">No critical risks detected</p>
                            </div>
                        )}
                    </GovCard>
                </div>
            </div>

            {/* ── Workload ──────────────────────────────────── */}
            <GovCard icon={ICON.workload} accent="amber" title="Test Coverage & Workload" subtitle="Workload distribution across projects">
                <WorkloadBalanceWidget />
            </GovCard>

        </div>
    );
}

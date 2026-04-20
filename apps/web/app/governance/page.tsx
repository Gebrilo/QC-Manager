'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    ProjectHealthHeatmap,
    WorkloadBalanceWidget,
    TrendAnalysisWidget,
    TestExecutionSummaryWidget,
    BugSummaryWidget,
    QualityMetricsWidget,
    BlockedTestsWidget,
    GrossNetProgressWidget,
} from '../../src/components/governance';
import { getDashboardSummary, getQualityRisks, getExecutionTrend, getQualityMetrics, getBlockedAnalysis, getExecutionProgress } from '../../src/services/governanceApi';
import type { DashboardSummary, QualityRisk, TrendData, QualityMetrics, BlockedModuleAnalysis, ExecutionProgress } from '../../src/types/governance';
import { Button } from '../../src/components/ui/Button';
import { Badge } from '../../src/components/ui/Badge';
import { FolderOpen, CheckCircle2, ShieldAlert, AlertCircle, RefreshCw, FileText } from 'lucide-react';

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
        router.push(`/projects/${projectId}/quality`);
    };

    return (
        <div className="space-y-8 py-6 px-4 max-w-7xl mx-auto pb-12">
            {/* Page header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Governance</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Quality health monitoring and release readiness</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="outline" size="sm" onClick={loadData}>
                        <RefreshCw className="w-4 h-4 mr-1.5" strokeWidth={1.75} />
                        Refresh
                    </Button>
                    <Button variant="primary" size="sm" onClick={() => router.push('/reports')}>
                        <FileText className="w-4 h-4 mr-1.5" strokeWidth={1.75} />
                        Export Report
                    </Button>
                </div>
            </div>

            {/* 1. Summary Cards */}
            {summary && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <SummaryCard
                        title="Total Projects"
                        value={summary.total_projects}
                        icon={<FolderOpen className="w-5 h-5" strokeWidth={1.75} />}
                        color="indigo"
                    />
                    <SummaryCard
                        title="Ready for Release"
                        value={summary.ready_for_release}
                        icon={<CheckCircle2 className="w-5 h-5" strokeWidth={1.75} />}
                        color="emerald"
                    />
                    <SummaryCard
                        title="Critical Risks"
                        value={summary.critical_risk_count}
                        icon={<ShieldAlert className="w-5 h-5" strokeWidth={1.75} />}
                        color="rose"
                    />
                    <SummaryCard
                        title="Warning State"
                        value={summary.warning_risk_count}
                        icon={<AlertCircle className="w-5 h-5" strokeWidth={1.75} />}
                        color="amber"
                    />
                </div>
            )}

            {/* 2. Global Quality Trend */}
            <section>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Global Quality Trend (30 Days)</h2>
                </div>
                <div className="h-[320px]">
                    <TrendAnalysisWidget data={trendData} />
                </div>
            </section>

            {/* 3. Quality Metrics Row */}
            <section>
                <div className="mb-4">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Quality Metrics</h2>
                </div>
                <QualityMetricsWidget data={qualityMetrics} />
            </section>

            {/* 4. Blocked Analysis + Gross/Net Progress Row */}
            <section>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <BlockedTestsWidget data={blockedAnalysis} />
                    <GrossNetProgressWidget data={execProgress} />
                </div>
            </section>

            {/* 5. Bug Summary Section */}
            <section>
                <div className="mb-4">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Bug Summary</h2>
                </div>
                <BugSummaryWidget />
            </section>

            {/* 6. Test Execution Summary Section */}
            <section>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Test Execution Summary</h2>
                    <button
                        onClick={() => router.push('/reports?tab=executions')}
                        className="text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
                    >
                        View All Test Runs →
                    </button>
                </div>
                <TestExecutionSummaryWidget />
            </section>

            {/* 7. 3-column grid: Heatmap + Workload (left 2/3) + Top Critical Risks (right 1/3) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Heatmap & Workload (2/3 width) */}
                <div className="lg:col-span-2 space-y-8">
                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Project Health Heatmap</h2>
                        </div>
                        <ProjectHealthHeatmap onProjectClick={handleProjectClick} />
                    </section>

                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Test Coverage & Workload</h2>
                        </div>
                        <WorkloadBalanceWidget />
                    </section>
                </div>

                {/* Right Column: Key Risks (1/3 width) */}
                <div className="space-y-8">
                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Top Critical Risks</h2>
                        </div>
                        {loading ? (
                            <div className="h-64 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
                        ) : topRisks.length > 0 ? (
                            <div className="space-y-4">
                                {topRisks.map(risk => (
                                    <div key={risk.project_id} className="glass-card p-4 border-l-4 border-rose-500">
                                        <div className="flex justify-between items-start">
                                            <h3
                                                className="font-semibold text-slate-900 dark:text-white cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                                                onClick={() => handleProjectClick(risk.project_id)}
                                            >
                                                {risk.project_name}
                                            </h3>
                                            <Badge variant="atrisk">Critical</Badge>
                                        </div>
                                        <div className="mt-2 space-y-1">
                                            {risk.risk_flags.map(flag => (
                                                <div key={flag} className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                                    <span className="text-rose-500">•</span>
                                                    {flag.replace(/_/g, ' ')}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                <button className="w-full text-center text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 py-2 transition-colors">
                                    View All Risks
                                </button>
                            </div>
                        ) : (
                            <div className="glass-card p-8 text-center text-slate-500 dark:text-slate-400">
                                No critical risks detected.
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}

interface SummaryCardProps {
    title: string;
    value: string | number;
    icon: React.ReactNode;
    color: 'indigo' | 'emerald' | 'rose' | 'amber';
}

function SummaryCard({ title, value, icon, color }: SummaryCardProps) {
    const colorClasses: Record<string, string> = {
        indigo: 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
        emerald: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
        rose: 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400',
        amber: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
    };

    return (
        <div className="glass-card p-5 flex items-center gap-4">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${colorClasses[color]}`}>
                {icon}
            </div>
            <div>
                <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500">{title}</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white leading-none mt-0.5">{value}</p>
            </div>
        </div>
    );
}

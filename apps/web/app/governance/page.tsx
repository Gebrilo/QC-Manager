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
                    <button onClick={loadData} className="px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors">
                        Refresh
                    </button>
                    <button onClick={() => router.push('/reports')} className="px-3 py-2 bg-indigo-600 rounded-lg text-sm font-medium text-white hover:bg-indigo-700 transition-colors shadow-sm">
                        Export Report
                    </button>
                </div>
            </div>

            {/* 1. Summary Cards */}
            {summary && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <SummaryCard
                        title="Total Projects"
                        value={summary.total_projects}
                        icon="📂"
                        color="indigo"
                    />
                    <SummaryCard
                        title="Ready for Release"
                        value={summary.ready_for_release}
                        icon="🚀"
                        color="green"
                    />
                    <SummaryCard
                        title="Critical Risks"
                        value={summary.critical_risk_count}
                        icon="🚨"
                        color="red"
                    />
                    <SummaryCard
                        title="Warning State"
                        value={summary.warning_risk_count}
                        icon="⚠️"
                        color="yellow"
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
                        className="text-sm text-indigo-600 hover:text-indigo-800"
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
                                    <div key={risk.project_id} className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm border-l-4 border-red-500">
                                        <div className="flex justify-between items-start">
                                            <h3
                                                className="font-semibold text-slate-900 dark:text-white cursor-pointer hover:text-indigo-600"
                                                onClick={() => handleProjectClick(risk.project_id)}
                                            >
                                                {risk.project_name}
                                            </h3>
                                            <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded-full font-medium">Critical</span>
                                        </div>
                                        <div className="mt-2 space-y-1">
                                            {risk.risk_flags.map(flag => (
                                                <div key={flag} className="text-xs text-slate-500 flex items-center">
                                                    <span className="mr-2 text-red-500">•</span>
                                                    {flag.replace(/_/g, ' ')}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                <button className="w-full text-center text-sm text-indigo-600 hover:text-indigo-800 py-2">
                                    View All Risks
                                </button>
                            </div>
                        ) : (
                            <div className="bg-white dark:bg-slate-800 p-8 rounded-xl border border-slate-200 dark:border-slate-700 text-center text-slate-500">
                                No critical risks detected.
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}

function SummaryCard({ title, value, icon, color }: { title: string, value: string | number, icon: string, color: string }) {
    const colorClasses: Record<string, string> = {
        indigo: 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800',
        green: 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800',
        red: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
        yellow: 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800',
    };

    return (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 flex items-center">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-xl mr-4 ${colorClasses[color]}`}>
                {icon}
            </div>
            <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
            </div>
        </div>
    );
}

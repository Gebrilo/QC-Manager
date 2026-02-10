'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    ProjectHealthHeatmap,
    WorkloadBalanceWidget,
    RiskIndicatorsWidget,
    ReleaseReadinessWidget,
    TrendAnalysisWidget,
    TestExecutionSummaryWidget
} from '../../src/components/governance';
import { getDashboardSummary, getQualityRisks, getExecutionTrend } from '../../src/services/governanceApi';
import type { DashboardSummary, QualityRisk, TrendData } from '../../src/types/governance';

export default function GovernanceDashboardPage() {
    const router = useRouter();
    const [summary, setSummary] = useState<DashboardSummary | null>(null);
    const [topRisks, setTopRisks] = useState<QualityRisk[]>([]);
    const [trendData, setTrendData] = useState<TrendData[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [summaryData, risksData, trendData] = await Promise.all([
                getDashboardSummary(),
                getQualityRisks('CRITICAL'), // Fetch critical risks for the sidebar
                getExecutionTrend()
            ]);
            setSummary(summaryData);
            setTopRisks(risksData.slice(0, 5)); // Top 5 critical items
            setTrendData(trendData);
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
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-12">
            {/* Top Navigation / Header */}
            <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex justify-between items-center">
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Governance Dashboard</h1>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Quality health monitoring and release readiness</p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={loadData}
                                className="px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
                            >
                                Refresh Data
                            </button>
                            <button
                                onClick={() => router.push('/settings')}
                                className="px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors flex items-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                Settings
                            </button>
                            <button
                                onClick={() => router.push('/reports')}
                                className="px-3 py-2 bg-indigo-600 rounded-md text-sm font-medium text-white hover:bg-indigo-700 transition-colors shadow-sm"
                            >
                                Export Report
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

                {/* Test Execution Summary Section */}
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

                {/* 1. Summary Cards Section */}
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

                {/* 1.5. Global Trend Analysis */}
                <section>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Global Quality Trend (30 Days)</h2>
                    </div>
                    <div className="h-[320px]">
                        <TrendAnalysisWidget data={trendData} />
                    </div>
                </section>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column: Heatmap & Workload (2/3 width) */}
                    <div className="lg:col-span-2 space-y-8">

                        {/* 2. Project Health Heatmap */}
                        <section>
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Project Health Heatmap</h2>
                            </div>
                            <ProjectHealthHeatmap onProjectClick={handleProjectClick} />
                        </section>

                        {/* 3. Workload Balance */}
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
            </main>
        </div>
    );
}

function SummaryCard({ title, value, icon, color }: { title: string, value: string | number, icon: string, color: string }) {
    const colorClasses: Record<string, string> = {
        indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        green: 'bg-green-50 text-green-700 border-green-200',
        red: 'bg-red-50 text-red-700 border-red-200',
        yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
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

'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    ProjectHealthHeatmap,
    WorkloadBalanceWidget,
    RiskIndicatorsWidget,
    ReleaseReadinessWidget,
    TrendAnalysisWidget,
    TestExecutionSummaryWidget,
    BugSummaryWidget,
    QualityMetricsWidget,
    BlockedTestsWidget,
    GrossNetProgressWidget,
} from '../../src/components/governance';
import { getDashboardSummary, getQualityRisks, getExecutionTrend, getQualityMetrics, getBlockedAnalysis, getExecutionProgress } from '../../src/services/governanceApi';
import { projectsApi, tasksApi } from '../../src/lib/api';
import type { DashboardSummary, QualityRisk, TrendData, QualityMetrics, BlockedModuleAnalysis, ExecutionProgress } from '../../src/types/governance';
import type { Project, Task } from '../../src/lib/api';

const PROJECT_STATUS_COLORS: Record<string, string> = {
    'Active':      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    'On Hold':     'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    'Completed':   'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
    'Cancelled':   'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const TASK_STATUS_COLORS: Record<string, string> = {
    'Backlog':     'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
    'In Progress': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
    'Done':        'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    'Cancelled':   'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

export default function GovernanceDashboardPage() {
    const router = useRouter();
    const [summary, setSummary] = useState<DashboardSummary | null>(null);
    const [topRisks, setTopRisks] = useState<QualityRisk[]>([]);
    const [trendData, setTrendData] = useState<TrendData[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
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
            const [summaryData, risksData, trendDataResult, projectsData, tasksData, qualityMetricsData, blockedAnalysisData, execProgressData] = await Promise.all([
                getDashboardSummary(),
                getQualityRisks('CRITICAL'),
                getExecutionTrend(),
                projectsApi.list().catch(() => [] as Project[]),
                tasksApi.list().catch(() => [] as Task[]),
                getQualityMetrics(),
                getBlockedAnalysis(),
                getExecutionProgress(),
            ]);
            setSummary(summaryData);
            setTopRisks(risksData.slice(0, 5));
            setTrendData(trendDataResult);
            setProjects(projectsData);
            setTasks(tasksData);
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

                {/* Bug Summary Section (Tuleap Integration) */}
                <section>
                    <div className="mb-4">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Bug Summary</h2>
                    </div>
                    <BugSummaryWidget />
                </section>

                {/* Quality Metrics Row */}
                <section>
                    <div className="mb-4">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Quality Metrics</h2>
                    </div>
                    <QualityMetricsWidget data={qualityMetrics} />
                </section>

                {/* Blocked Analysis + Gross/Net Progress Row */}
                <section>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <BlockedTestsWidget data={blockedAnalysis} />
                        <GrossNetProgressWidget data={execProgress} />
                    </div>
                </section>

                {/* Projects Section */}
                <section>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Projects</h2>
                        <button
                            onClick={() => router.push('/projects')}
                            className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800"
                        >
                            View All Projects →
                        </button>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                        {loading ? (
                            <div className="m-4 h-24 bg-slate-100 dark:bg-slate-700 rounded-lg animate-pulse" />
                        ) : projects.length === 0 ? (
                            <div className="p-8 text-center text-slate-400 text-sm">No projects found.</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">Project</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 w-28">Status</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 w-24">Priority</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 w-40">Progress</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 w-28">Tasks</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 w-28">Target Date</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {projects.slice(0, 10).map(p => (
                                            <tr
                                                key={p.id}
                                                className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                                                onClick={() => router.push(`/projects/${p.id}`)}
                                            >
                                                <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                                                    {p.project_name}
                                                    <span className="ml-2 text-xs text-slate-400">{p.project_id}</span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PROJECT_STATUS_COLORS[p.status || ''] || 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'}`}>
                                                        {p.status || 'Active'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{p.priority || '—'}</td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                                            <div
                                                                className="h-1.5 bg-indigo-500 rounded-full"
                                                                style={{ width: `${Math.min(p.completion_pct || 0, 100)}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-xs text-slate-500 w-8 text-right">{Math.round(p.completion_pct || 0)}%</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                                                    {p.tasks_done_count ?? '—'}/{p.tasks_total_count ?? '—'}
                                                </td>
                                                <td className="px-4 py-3 text-xs text-slate-400">
                                                    {p.target_date ? new Date(p.target_date).toLocaleDateString() : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {projects.length > 10 && (
                                    <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400 text-center">
                                        Showing 10 of {projects.length} projects
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </section>

                {/* Tasks Overview Section */}
                <section>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Tasks Overview</h2>
                        <button
                            onClick={() => router.push('/tasks')}
                            className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800"
                        >
                            View All Tasks →
                        </button>
                    </div>
                    <div className="space-y-4">
                        {/* Task Status Stats */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {(['Backlog', 'In Progress', 'Done', 'Cancelled'] as const).map(status => {
                                const count = tasks.filter(t => t.status === status).length;
                                const colors: Record<string, string> = {
                                    'Backlog':     'text-slate-700 dark:text-slate-300',
                                    'In Progress': 'text-indigo-700 dark:text-indigo-300',
                                    'Done':        'text-green-700 dark:text-green-300',
                                    'Cancelled':   'text-red-700 dark:text-red-300',
                                };
                                return (
                                    <div key={status} className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700">
                                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{status}</p>
                                        <p className={`text-2xl font-bold mt-1 ${colors[status]}`}>
                                            {loading ? '—' : count}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>

                        {/* In-Progress Tasks List */}
                        {tasks.filter(t => t.status === 'In Progress').length > 0 && (
                            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">In Progress</h3>
                                </div>
                                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {tasks
                                        .filter(t => t.status === 'In Progress')
                                        .slice(0, 8)
                                        .map(task => (
                                            <div
                                                key={task.id}
                                                className="px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                                                onClick={() => router.push(`/tasks/${task.id}`)}
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{task.task_name}</p>
                                                    <p className="text-xs text-slate-400 mt-0.5">{task.project_name || '—'}</p>
                                                </div>
                                                <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                                                    {task.priority && (
                                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                                            task.priority === 'High' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                                            task.priority === 'Medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                                            'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                                                        }`}>
                                                            {task.priority}
                                                        </span>
                                                    )}
                                                    {task.overall_completion_pct !== undefined && (
                                                        <span className="text-xs text-slate-400 w-8 text-right">
                                                            {Math.round(task.overall_completion_pct)}%
                                                        </span>
                                                    )}
                                                    {(task.resource1_name || task.resource2_name) && (
                                                        <span className="text-xs text-slate-500 dark:text-slate-400">
                                                            {task.resource1_name || task.resource2_name}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    }
                                </div>
                                {tasks.filter(t => t.status === 'In Progress').length > 8 && (
                                    <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400 text-center">
                                        Showing 8 of {tasks.filter(t => t.status === 'In Progress').length} in-progress tasks
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
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

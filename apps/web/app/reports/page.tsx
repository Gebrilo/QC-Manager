'use client';

import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ReportGenerator } from '@/components/reports/ReportGenerator';
import {
    ReleaseReadinessWidget,
    TrendAnalysisWidget,
    ProjectHealthHeatmap,
    WorkloadBalanceWidget
} from '@/components/governance';
import {
    getDashboardSummary,
    getProjectHealth,
    getExecutionTrend,
    getWorkloadBalance
} from '@/services/governanceApi';
import type { ProjectHealth, TrendData, WorkloadBalance } from '@/types/governance';

type ReportType = 'READINESS' | 'WEEKLY_HEALTH' | 'COVERAGE_GAP' | null;
type TabType = 'async' | 'governance';

export default function ReportsPage() {
    const [activeTab, setActiveTab] = useState<TabType>('async');
    const [selectedReport, setSelectedReport] = useState<ReportType>(null);
    const [reportData, setReportData] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    const handleSelectReport = async (type: ReportType) => {
        setSelectedReport(type);
        setLoading(true);
        try {
            // Fetch relevant data based on report type
            if (type === 'READINESS') {
                const data = await getProjectHealth();
                setReportData(data);
            } else if (type === 'WEEKLY_HEALTH') {
                const [health, trend] = await Promise.all([
                    getProjectHealth(),
                    getExecutionTrend()
                ]);
                setReportData({ health, trend });
            } else if (type === 'COVERAGE_GAP') {
                const workload = await getWorkloadBalance();
                setReportData(workload);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const handleExportExcel = () => {
        if (!selectedReport || !reportData) return;

        let dataToExport: any[] = [];
        let fileName = 'Report.xlsx';

        if (selectedReport === 'READINESS') {
            fileName = 'Release_Readiness_Report.xlsx';
            dataToExport = (reportData as ProjectHealth[]).map(p => ({
                Project: p.project_name,
                Status: p.overall_health_status,
                'Pass Rate (%)': p.latest_pass_rate_pct,
                'Defects': p.blocking_issue_count + p.latest_failed_count,
                'Last Run': p.latest_execution_date ? new Date(p.latest_execution_date).toLocaleDateString() : 'N/A'
            }));
        } else if (selectedReport === 'WEEKLY_HEALTH') {
            fileName = 'Weekly_Health_Report.xlsx';
            // Export the full health list for detailed analysis
            dataToExport = (reportData.health as ProjectHealth[]).map(p => ({
                Project: p.project_name,
                Status: p.overall_health_status,
                'Pass Rate (%)': p.latest_pass_rate_pct,
                'Trend (Change)': p.pass_rate_change,
                'Risk Level': p.risk_level
            }));
        } else if (selectedReport === 'COVERAGE_GAP') {
            fileName = 'Coverage_Workload_Report.xlsx';
            dataToExport = (reportData as WorkloadBalance[]).map(w => ({
                Project: w.project_name,
                'Total Tasks': w.total_tasks,
                'Total Tests': w.total_tests,
                'Ratio': w.tests_per_task_ratio,
                'Balance Status': w.balance_status
            }));
        }

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Report Data");
        XLSX.writeFile(wb, fileName);
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-12 print:bg-white print:pb-0">
            {/* Header - Hidden on Print */}
            <div className="print:hidden bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Reports & Exports</h1>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Generate and export quality governance reports</p>
                        </div>
                    </div>
                    
                    {/* Tab Navigation */}
                    <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
                        <button
                            onClick={() => setActiveTab('async')}
                            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                                activeTab === 'async'
                                    ? 'text-indigo-600 dark:text-indigo-400'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                            }`}
                        >
                            Async Reports
                            {activeTab === 'async' && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400"></div>
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab('governance')}
                            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                                activeTab === 'governance'
                                    ? 'text-indigo-600 dark:text-indigo-400'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                            }`}
                        >
                            Governance Reports
                            {activeTab === 'governance' && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400"></div>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 print:p-0 print:max-w-none">

                {/* Async Reports Tab */}
                {activeTab === 'async' && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <ReportGenerator />
                    </div>
                )}

                {/* Governance Reports Tab */}
                {activeTab === 'governance' && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-8">

                        {/* Report Selector - Hidden on Print */}
                        <div className="print:hidden grid grid-cols-1 md:grid-cols-3 gap-6">
                    <ReportCard
                        title="Release Readiness Report"
                        description="Detailed status of all projects targeting the upcoming release window. Includes risk assessment and go/no-go status."
                        icon="🚀"
                        active={selectedReport === 'READINESS'}
                        onClick={() => handleSelectReport('READINESS')}
                    />
                    <ReportCard
                        title="Weekly Quality Health"
                        description="High-level summary of pass rates, execution trends, and critical defects over the last 7 days."
                        icon="📈"
                        active={selectedReport === 'WEEKLY_HEALTH'}
                        onClick={() => handleSelectReport('WEEKLY_HEALTH')}
                    />
                            <ReportCard
                                title="Test Coverage & Workload"
                                description="Analysis of test coverage gaps vs total tasks, and tester workload distribution."
                                icon="⚖️"
                                active={selectedReport === 'COVERAGE_GAP'}
                                onClick={() => handleSelectReport('COVERAGE_GAP')}
                            />
                        </div>

                        {/* Report Preview / Print Area */}
                        {selectedReport && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="flex justify-between items-center mb-6 print:hidden">
                                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Report Preview</h2>
                                    <div className="flex gap-2">
                                        <Button onClick={handleExportExcel} variant="outline" className="flex items-center gap-2">
                                            <span className="text-green-600">📊</span>
                                            Export Excel
                                        </Button>
                                        <Button onClick={handlePrint} variant="primary" className="flex items-center gap-2">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                                            Print / Save PDF
                                        </Button>
                                    </div>
                                </div>

                                {/* The Actual Report Content (A4-ish container) */}
                                <div className="bg-white text-slate-900 p-8 sm:p-12 shadow-lg print:shadow-none print:p-0 min-h-[1000px] print:min-h-0 mx-auto max-w-[210mm] print:max-w-none print:w-full rounded-xl print:rounded-none border print:border-none">

                                    {/* Report Header */}
                                    <div className="border-b-2 border-slate-800 pb-6 mb-8 flex justify-between items-end">
                                        <div>
                                            <h1 className="text-3xl font-bold uppercase tracking-tight text-slate-900">
                                                {selectedReport === 'READINESS' && 'Release Readiness Report'}
                                                {selectedReport === 'WEEKLY_HEALTH' && 'Weekly Quality Health'}
                                                {selectedReport === 'COVERAGE_GAP' && 'Coverage & Workload Analysis'}
                                            </h1>
                                            <p className="text-slate-500 mt-2">Generated on {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}</p>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xl font-bold text-indigo-700">QC Manager</div>
                                            <div className="text-sm text-slate-500">Governance System</div>
                                        </div>
                                    </div>

                                    {/* Report Body */}
                                    {loading ? (
                                        <div className="py-20 text-center">
                                            <div className="animate-spin text-4xl mb-4">⌛</div>
                                            <p>Loading report data...</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-8">

                                            {selectedReport === 'READINESS' && (
                                                <>
                                                    <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
                                                        <h3 className="font-semibold text-lg mb-2">Executive Summary</h3>
                                                        <p className="text-slate-700">
                                                            This report outlines the current readiness status of all active projects.
                                                            Projects marked as <span className="font-bold text-red-600">RED</span> have critical blocking issues preventing release.
                                                        </p>
                                                    </div>

                                                    <table className="w-full text-sm text-left border-collapse">
                                                <thead>
                                                    <tr className="border-b-2 border-slate-300">
                                                                <th className="py-3 font-bold text-slate-700">Project</th>
                                                                <th className="py-3 font-bold text-slate-700">Status</th>
                                                                <th className="py-3 font-bold text-slate-700">Pass Rate</th>
                                                                <th className="py-3 font-bold text-slate-700">Unresolved Defects</th>
                                                                <th className="py-3 font-bold text-slate-700">Recommendation</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-200">
                                                            {(reportData as ProjectHealth[] || []).map(p => (
                                                                <tr key={p.project_id}>
                                                                    <td className="py-3 font-medium">{p.project_name}</td>
                                                                    <td className="py-3">
                                                                        <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${p.overall_health_status === 'GREEN' ? 'bg-green-100 text-green-800' :
                                                                            p.overall_health_status === 'AMBER' ? 'bg-yellow-100 text-yellow-800' :
                                                                                'bg-red-100 text-red-800'
                                                                            }`}>
                                                                            {p.overall_health_status}
                                                                        </span>
                                                                    </td>
                                                                    <td className="py-3">{p.latest_pass_rate_pct}%</td>
                                                                    <td className="py-3">{p.blocking_issue_count + p.latest_failed_count}</td>
                                                                    <td className="py-3 text-slate-600 italic">
                                                                        {p.overall_health_status === 'GREEN' ? 'Proceed with Release' :
                                                                            p.overall_health_status === 'AMBER' ? 'Monitor Closely' : 'Block Release'}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </>
                                            )}

                                            {selectedReport === 'WEEKLY_HEALTH' && reportData && (
                                                <>
                                                    <div className="h-[300px] mb-8 border border-slate-200 rounded-lg p-4">
                                                        <h3 className="text-center font-bold mb-4">30-Day Execution Trend</h3>
                                                        <TrendAnalysisWidget data={reportData.trend} title="" />
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-8">
                                                        <div className="bg-green-50 p-6 rounded-lg border border-green-100">
                                                            <h3 className="text-green-800 font-bold text-lg mb-2">Top Performers</h3>
                                                            <ul className="space-y-2">
                                                                {(reportData.health as ProjectHealth[])
                                                                    .filter(p => p.overall_health_status === 'GREEN')
                                                                    .slice(0, 3)
                                                                    .map(p => (
                                                                        <li key={p.project_id} className="flex justify-between">
                                                                            <span>{p.project_name}</span>
                                                                            <span className="font-bold">{p.latest_pass_rate_pct}%</span>
                                                                        </li>
                                                                    ))}
                                                            </ul>
                                                        </div>
                                                        <div className="bg-red-50 p-6 rounded-lg border border-red-100">
                                                            <h3 className="text-red-800 font-bold text-lg mb-2">Projects at Risk</h3>
                                                            <ul className="space-y-2">
                                                                {(reportData.health as ProjectHealth[])
                                                                    .filter(p => p.overall_health_status === 'RED')
                                                                    .slice(0, 3)
                                                                    .map(p => (
                                                                        <li key={p.project_id} className="flex justify-between">
                                                                            <span>{p.project_name}</span>
                                                                            <span className="font-bold">{p.latest_pass_rate_pct}%</span>
                                                                        </li>
                                                                    ))}
                                                            </ul>
                                                        </div>
                                                    </div>
                                                </>
                                            )}

                                            {selectedReport === 'COVERAGE_GAP' && (
                                                <>
                                                    <p className="text-slate-700 mb-6">
                                                        Analysis of test coverage relative to feature development tasks. Ratios below 1.0 indicate insufficient testing for developed features.
                                                    </p>
                                                    <table className="w-full text-sm text-left border-collapse">
                                                <thead>
                                                    <tr className="border-b-2 border-slate-300">
                                                                <th className="py-3 font-bold text-slate-700">Project</th>
                                                                <th className="py-3 font-bold text-slate-700">Total Tasks</th>
                                                                <th className="py-3 font-bold text-slate-700">Total Tests</th>
                                                                <th className="py-3 font-bold text-slate-700">Ratio (Tests/Task)</th>
                                                                <th className="py-3 font-bold text-slate-700">Balance</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-200">
                                                            {(reportData as WorkloadBalance[] || []).map((w, i) => (
                                                                <tr key={i}>
                                                                    <td className="py-3 font-medium">{w.project_name}</td>
                                                                    <td className="py-3">{w.total_tasks}</td>
                                                                    <td className="py-3">{w.total_tests}</td>
                                                                    <td className="py-3 font-bold">{w.tests_per_task_ratio}</td>
                                                                    <td className="py-3">
                                                                        <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${w.balance_status === 'BALANCED' ? 'bg-green-100 text-green-800' :
                                                                            w.balance_status === 'UNDER_TESTED' ? 'bg-red-100 text-red-800' :
                                                                                'bg-blue-100 text-blue-800'
                                                                            }`}>
                                                                            {w.balance_status}
                                                                        </span>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </>
                                            )}

                                        </div>
                                    )}

                                    {/* Footer */}
                                    <div className="mt-12 pt-6 border-t border-slate-200 text-center text-sm text-slate-400">
                                        QC Management Tool • Confidential • Internal Use Only
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}

function ReportCard({ title, description, icon, onClick, active }: any) {
    return (
        <Card
            className={`cursor-pointer transition-all hover:shadow-md border-2 ${active ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-transparent hover:border-slate-200'}`}
            onClick={onClick}
        >
            <div className="p-6">
                <div className="text-3xl mb-4">{icon}</div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{title}</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm">{description}</p>
            </div>
        </Card>
    );
}

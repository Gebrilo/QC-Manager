'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GAUGE_DATA, REPORTS, type ReportDefinition } from '@/components/reports/reportTypes';
import { useReportData } from '@/components/reports/useReportData';
import { LibraryRail } from '@/components/reports/LibraryRail';
import { ActionBar } from '@/components/reports/ActionBar';
import { DocumentPreview } from '@/components/reports/DocumentPreview';
import { RecentScheduledPanel } from '@/components/reports/RecentScheduledPanel';
import { ShareModal, ScheduleModal, Toast } from '@/components/reports/ReportModals';
import { reportsApi } from '@/lib/api';

type BackendReportType = 'project_status' | 'resource_utilization' | 'task_export' | 'test_results' | 'dashboard';
type BackendFormat = 'xlsx' | 'csv' | 'json' | 'pdf';
type ReportPresentation = {
    report_id: string;
    name: string;
    category: string;
    generated_label: string;
    range: string;
    project: string;
    summary: string;
    summary_tone: string;
    kpis: ReportDefinition['kpis'];
    chart: ReportDefinition['chart'];
    columns: ReportDefinition['columns'];
    rows: ReportDefinition['rows'];
    gauge: { value: number; label: string; caption: string };
};

const REPORT_TYPE_BY_ID: Record<string, BackendReportType> = {
    'proj-status': 'project_status',
    'resource': 'resource_utilization',
    'test-exec': 'test_results',
    'readiness': 'dashboard',
    'quality': 'dashboard',
    'coverage': 'dashboard',
    'bug-dist': 'dashboard',
    'quality-trend': 'dashboard',
};

const FORMAT_BY_LABEL: Record<string, BackendFormat> = {
    PDF: 'pdf',
    Excel: 'xlsx',
    CSV: 'csv',
};

function saveBlobToDevice(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

function stampNow() {
    return new Date().toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function buildReportPresentation(
    report: ReportDefinition,
    realData: Parameters<typeof DocumentPreview>[0]['realData'],
    range: string,
    project: string,
    generatedLabel: string
): ReportPresentation {
    const merged = realData
        ? {
            ...report,
            kpis: realData.kpis?.length ? realData.kpis : report.kpis,
            chart: realData.chart?.bars.length ? realData.chart : report.chart,
            rows: realData.rows?.length ? realData.rows : report.rows,
            summary: realData.summary || report.summary,
            summaryTone: realData.summaryTone || report.summaryTone,
        }
        : report;

    return {
        report_id: report.id,
        name: merged.name,
        category: merged.category,
        generated_label: generatedLabel,
        range,
        project,
        summary: merged.summary,
        summary_tone: merged.summaryTone,
        kpis: merged.kpis,
        chart: merged.chart,
        columns: merged.columns,
        rows: merged.rows,
        gauge: realData?.gauge || GAUGE_DATA[report.id] || { value: 0, label: 'Headline', caption: '' },
    };
}

export default function ReportsPage() {
    const [activeId, setActiveId] = useState('readiness');
    const [generating, setGenerating] = useState(false);
    const [fmt, setFmt] = useState('PDF');
    const [range, setRange] = useState('Last 7 days');
    const [project, setProject] = useState('All projects');
    const [stamp, setStamp] = useState(stampNow);
    const [modal, setModal] = useState<'share' | 'schedule' | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const report = REPORTS.find(r => r.id === activeId) || REPORTS[0];
    const { override: realData, loading: dataLoading } = useReportData(report.id);

    const notify = useCallback((msg: string) => {
        setToast(msg);
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 2400);
    }, []);

    const clearPolling = useCallback(() => {
        if (pollTimer.current) {
            clearTimeout(pollTimer.current);
            pollTimer.current = null;
        }
    }, []);

    useEffect(() => {
        return () => {
            if (toastTimer.current) clearTimeout(toastTimer.current);
            clearPolling();
        };
    }, [clearPolling]);

    const pollJobUntilDone = useCallback(async (jobId: string, reportName: string, generatedStamp: string, attempt = 0) => {
        const maxAttempts = 40;
        const pollIntervalMs = 3000;

        try {
            const status = await reportsApi.getStatus(jobId);
            const job = status.data;

            if (job.status === 'completed') {
                setGenerating(false);
                setStamp(generatedStamp);

                if (job.download_url) {
                    try {
                        const file = await reportsApi.download(jobId);
                        saveBlobToDevice(file.blob, file.fileName);
                        notify(`${reportName} generated. Download started.`);
                    } catch (err: any) {
                        notify(err?.message || `${reportName} generated, but download failed.`);
                    }
                } else {
                    notify(`${reportName} generated, but no download link was provided.`);
                }
                return;
            }

            if (job.status === 'failed') {
                setGenerating(false);
                notify(job.error_message || `${reportName} generation failed.`);
                return;
            }

            if (attempt >= maxAttempts) {
                setGenerating(false);
                notify('Report generation timed out. Please try again.');
                return;
            }

            pollTimer.current = setTimeout(() => {
                pollJobUntilDone(jobId, reportName, generatedStamp, attempt + 1);
            }, pollIntervalMs);
        } catch {
            if (attempt >= maxAttempts) {
                setGenerating(false);
                notify('Could not check report status. Please try again.');
                return;
            }

            pollTimer.current = setTimeout(() => {
                pollJobUntilDone(jobId, reportName, generatedStamp, attempt + 1);
            }, pollIntervalMs);
        }
    }, [notify]);

    async function handleGenerate() {
        clearPolling();
        setGenerating(true);

        try {
            const reportType = REPORT_TYPE_BY_ID[report.id] || 'dashboard';
            const backendFormat = FORMAT_BY_LABEL[fmt] || 'pdf';
            const generatedStamp = stampNow();

            const response = await reportsApi.generate({
                report_type: reportType,
                format: backendFormat,
                presentation: backendFormat === 'pdf'
                    ? buildReportPresentation(report, realData, range, project, generatedStamp)
                    : undefined,
            });

            notify(`Generating ${report.name}...`);
            await pollJobUntilDone(response.data.job_id, report.name, generatedStamp);
        } catch (err: any) {
            setGenerating(false);
            notify(err?.message || `Failed to start ${report.name} generation.`);
        }
    }

    return (
        <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950">
            <div className="max-w-[1400px] mx-auto px-5 lg:px-8 py-6">
                {/* Page header */}
                <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Report Studio</h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            Generate, preview and share quality governance reports.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {REPORTS.length} report types
                        </span>
                    </div>
                </div>

                {/* Studio layout: rail + workspace */}
                <div className="flex gap-5 items-start">
                    <LibraryRail activeId={report.id} onSelect={setActiveId} />

                    <div className="flex-1 min-w-0 space-y-5">
                        <ActionBar
                            report={report}
                            generating={generating}
                            onGenerate={handleGenerate}
                            fmt={fmt}
                            setFmt={setFmt}
                            range={range}
                            setRange={setRange}
                            project={project}
                            setProject={setProject}
                            onShare={() => setModal('share')}
                            onSchedule={() => setModal('schedule')}
                            notify={notify}
                        />
                        <DocumentPreview
                            report={report}
                            generating={generating}
                            stamp={stamp}
                            range={range}
                            project={project}
                            realData={realData}
                            dataLoading={dataLoading}
                        />
                        <RecentScheduledPanel
                            notify={notify}
                            onSchedule={() => setModal('schedule')}
                        />
                    </div>
                </div>
            </div>

            {modal === 'share' && (
                <ShareModal
                    report={{ id: report.id, name: report.name, format: fmt }}
                    onClose={() => setModal(null)}
                    notify={notify}
                />
            )}
            {modal === 'schedule' && (
                <ScheduleModal
                    report={{ name: report.name }}
                    onClose={() => setModal(null)}
                    notify={notify}
                />
            )}
            <Toast toast={toast} />
        </div>
    );
}

'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { REPORTS, GAUGE_DATA } from '@/components/reports/reportTypes';
import { useReportData } from '@/components/reports/useReportData';
import { LibraryRail } from '@/components/reports/LibraryRail';
import { ActionBar } from '@/components/reports/ActionBar';
import { DocumentPreview } from '@/components/reports/DocumentPreview';
import { RecentScheduledPanel } from '@/components/reports/RecentScheduledPanel';
import { ShareModal, ScheduleModal } from '@/components/reports/ReportModals';
import { reportsApi, projectsApi, type Project } from '@/lib/api';
import { createReportPdfBlob, downloadReportAsPdf } from '@/lib/reportPdf';
import { useToast } from '@/components/ui/Toast';
import { Spinner } from '@/components/ui/Spinner';

type BackendReportType = 'project_status' | 'resource_utilization' | 'task_export' | 'test_results' | 'dashboard';
type BackendFormat = 'xlsx' | 'csv' | 'json' | 'pdf';

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

function toIsoDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const value = String(reader.result || '');
            resolve(value.includes(',') ? value.split(',')[1] : value);
        };
        reader.onerror = () => reject(reader.error || new Error('Could not read report file'));
        reader.readAsDataURL(blob);
    });
}

// Translate a preset range label (or "Custom range") into concrete
// dateFrom/dateTo strings (YYYY-MM-DD) the backend can use.
// Returns { from: undefined, to: undefined } only when the custom range is
// chosen with no user-entered dates.
function rangeToDates(range: string, customFrom: string, customTo: string): { from?: string; to?: string } {
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    if (range === 'Custom range') {
        return {
            from: customFrom || undefined,
            to: customTo || undefined,
        };
    }

    const start = new Date(today);
    if (range === 'Last 7 days') {
        start.setDate(start.getDate() - 6);
    } else if (range === 'Last 30 days') {
        start.setDate(start.getDate() - 29);
    } else if (range === 'This quarter') {
        const q = Math.floor(today.getMonth() / 3);
        start.setMonth(q * 3, 1);
    } else if (range === 'Year to date') {
        start.setMonth(0, 1);
    } else {
        return { from: undefined, to: undefined };
    }

    start.setHours(0, 0, 0, 0);
    return { from: toIsoDate(start), to: toIsoDate(today) };
}

export default function ReportsPage() {
    const searchParams = useSearchParams();
    const requestedReportId = searchParams.get('report');
    const printMode = searchParams.get('print') === '1';
    const initialReportId = REPORTS.some(r => r.id === requestedReportId) ? requestedReportId! : 'readiness';

    const [activeId, setActiveId] = useState(initialReportId);
    const [generating, setGenerating] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [fmt, setFmt] = useState('PDF');
    const [range, setRange] = useState('Last 7 days');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    // '' means 'All projects' (no server-side project filter). Otherwise holds a project id.
    const [project, setProject] = useState('');
    const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
    const [stamp, setStamp] = useState(stampNow);
    const [modal, setModal] = useState<'share' | 'schedule' | null>(null);
    const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const toast = useToast();

    useEffect(() => {
        projectsApi.list()
            .then((rows: Project[]) => {
                setProjects(rows.map(r => ({ id: r.id, name: r.project_name })));
            })
            .catch(() => setProjects([]));
    }, []);

    const report = REPORTS.find(r => r.id === activeId) || REPORTS[0];
    const { from: effFrom, to: effTo } = rangeToDates(range, dateFrom, dateTo);
    const { override: realData, loading: dataLoading } = useReportData(report.id, {
        dateFrom: effFrom,
        dateTo: effTo,
        projectId: project || undefined,
    });

    const projectLabel = project
        ? (projects.find(p => p.id === project)?.name ?? project)
        : 'All projects';

    const notify = useCallback((msg: string) => {
        toast.success(msg);
    }, [toast]);

    const clearPolling = useCallback(() => {
        if (pollTimer.current) {
            clearTimeout(pollTimer.current);
            pollTimer.current = null;
        }
    }, []);

    useEffect(() => {
        return () => {
            clearPolling();
        };
    }, [clearPolling]);

    useEffect(() => {
        if (printMode && requestedReportId && REPORTS.some(r => r.id === requestedReportId)) {
            setActiveId(requestedReportId);
        }
    }, [printMode, requestedReportId]);

    const pollJobUntilDone = useCallback(async (jobId: string, reportName: string, generatedStamp: string, attempt = 0) => {
        const maxAttempts = 40;
        const pollIntervalMs = 3000;

        try {
            const status = await reportsApi.getStatus(jobId);
            const job = status.data;

            if (job.status === 'completed') {
                setGenerating(false);
                setStamp(generatedStamp);
                setRefreshKey(k => k + 1);

                if (job.download_url) {
                    try {
                        const file = await reportsApi.download(jobId);
                        saveBlobToDevice(file.blob, file.fileName);
                        toast.success(`${reportName} generated. Download started.`);
                    } catch (err: any) {
                        toast.error(err?.message || `${reportName} generated, but download failed.`);
                    }
                } else {
                    toast.warning(`${reportName} generated, but no download link was provided.`);
                }
                return;
            }

            if (job.status === 'failed') {
                setGenerating(false);
                toast.error(job.error_message || `${reportName} generation failed.`);
                return;
            }

            if (attempt >= maxAttempts) {
                setGenerating(false);
                toast.error('Report generation timed out. Please try again.');
                return;
            }

            pollTimer.current = setTimeout(() => {
                pollJobUntilDone(jobId, reportName, generatedStamp, attempt + 1);
            }, pollIntervalMs);
        } catch {
            if (attempt >= maxAttempts) {
                setGenerating(false);
                toast.error('Could not check report status. Please try again.');
                return;
            }

            pollTimer.current = setTimeout(() => {
                pollJobUntilDone(jobId, reportName, generatedStamp, attempt + 1);
            }, pollIntervalMs);
        }
    }, [toast]);

    async function handleGenerate() {
        clearPolling();
        setGenerating(true);

        try {
            const reportType = REPORT_TYPE_BY_ID[report.id] || 'dashboard';
            const backendFormat = FORMAT_BY_LABEL[fmt] || 'pdf';
            const generatedStamp = stampNow();

            if (backendFormat === 'pdf') {
                setStamp(generatedStamp);
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
                const gauge = realData?.gauge ?? GAUGE_DATA[report.id] ?? { value: 0, label: 'Headline', caption: '' };
                await downloadReportAsPdf({ report: merged, gauge, range, project: projectLabel, stamp: generatedStamp });
                toast.success(`${report.name} PDF generated. Download started.`);
                setGenerating(false);
                // Record the PDF generation in the backend for history, then refresh the panel
                reportsApi.generate({ report_type: reportType, format: 'pdf' }).catch(() => {});
                setRefreshKey(k => k + 1);
                return;
            }

            const response = await reportsApi.generate({
                report_type: reportType,
                format: backendFormat,
            });

            toast.info(`Generating ${report.name}...`);
            await pollJobUntilDone(response.data.job_id, report.name, generatedStamp);
        } catch (err: any) {
            setGenerating(false);
            toast.error(err?.message || `Failed to start ${report.name} generation.`);
        }
    }

    async function handleShare({
        recipients,
        attachExport,
        shareUrl,
    }: {
        recipients: string[];
        attachExport: boolean;
        shareUrl: string;
    }) {
        const reportType = REPORT_TYPE_BY_ID[report.id] || 'dashboard';
        const backendFormat = FORMAT_BY_LABEL[fmt] || 'pdf';
        const filters = {
            ...(project ? { project_ids: [project] } : {}),
            ...(effFrom ? { date_from: effFrom } : {}),
            ...(effTo ? { date_to: effTo } : {}),
        };
        const sharePayload: Parameters<typeof reportsApi.share>[0] = {
            report_id: report.id,
            report_name: report.name,
            report_type: reportType,
            format: backendFormat,
            recipients,
            share_url: shareUrl,
            attach_export: attachExport,
            filters: Object.keys(filters).length ? filters : undefined,
        };

        if (attachExport && backendFormat === 'pdf') {
            const generatedStamp = stampNow();
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
            const gauge = realData?.gauge ?? GAUGE_DATA[report.id] ?? { value: 0, label: 'Headline', caption: '' };
            const file = await createReportPdfBlob({ report: merged, gauge, range, project: projectLabel, stamp: generatedStamp });
            sharePayload.attachment = {
                filename: file.fileName,
                mime_type: 'application/pdf',
                content_base64: await blobToBase64(file.blob),
            };
        }

        const response = await reportsApi.share(sharePayload);
        setRefreshKey(k => k + 1);
        return {
            emailHref: response.data.email_href,
            attachmentDownloadUrl: response.data.attachment_download_url,
            attachmentNote: response.data.attachment_note,
        };
    }

    if (printMode) {
        return (
            <div className="min-h-screen bg-slate-100 p-0 print:bg-white">
                <div className="mx-auto w-full max-w-[960px] print:max-w-none">
                    <DocumentPreview
                        report={report}
                        generating={false}
                        stamp={stamp}
                        range={range}
                        project={projectLabel}
                        realData={realData}
                        dataLoading={false}
                    />
                </div>
            </div>
        );
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

                {generating && (
                    <div className="glass-card rounded-xl p-4 flex items-center gap-3 border border-indigo-200 dark:border-indigo-900 mb-5">
                        <Spinner size="sm" />
                        <div className="flex-1">
                            <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                Generating report…
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                                This typically takes ~30 seconds.
                            </div>
                        </div>
                    </div>
                )}

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
                            dateFrom={dateFrom}
                            setDateFrom={setDateFrom}
                            dateTo={dateTo}
                            setDateTo={setDateTo}
                            project={project}
                            setProject={setProject}
                            projects={projects}
                            onShare={() => setModal('share')}
                            onSchedule={() => setModal('schedule')}
                            notify={notify}
                        />
                        <DocumentPreview
                            report={report}
                            generating={generating && fmt !== 'PDF'}
                            stamp={stamp}
                            range={range}
                            project={projectLabel}
                            realData={realData}
                            dataLoading={dataLoading && fmt !== 'PDF'}
                        />
                        <RecentScheduledPanel
                            notify={notify}
                            onSchedule={() => setModal('schedule')}
                            refreshKey={refreshKey}
                        />
                    </div>
                </div>
            </div>

            {modal === 'share' && (
                <ShareModal
                    report={{ id: report.id, name: report.name, format: fmt }}
                    shareUrl={`${window.location.origin}/quality/reports?report=${encodeURIComponent(report.id)}`}
                    onClose={() => setModal(null)}
                    notify={notify}
                    onShare={handleShare}
                />
            )}
            {modal === 'schedule' && (
                <ScheduleModal
                    report={{ name: report.name }}
                    onClose={() => setModal(null)}
                    notify={notify}
                />
            )}
        </div>
    );
}

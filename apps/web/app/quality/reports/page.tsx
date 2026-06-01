'use client';

import React, { useState, useRef, useCallback } from 'react';
import { REPORTS, cn } from '@/components/reports/reportTypes';
import { useReportData } from '@/components/reports/useReportData';
import { LibraryRail } from '@/components/reports/LibraryRail';
import { ActionBar } from '@/components/reports/ActionBar';
import { DocumentPreview } from '@/components/reports/DocumentPreview';
import { RecentScheduledPanel } from '@/components/reports/RecentScheduledPanel';
import { ShareModal, ScheduleModal, Toast } from '@/components/reports/ReportModals';

function stampNow() {
    return new Date().toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
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

    const report = REPORTS.find(r => r.id === activeId) || REPORTS[0];
    const { override: realData, loading: dataLoading } = useReportData(report.id);

    const notify = useCallback((msg: string) => {
        setToast(msg);
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 2400);
    }, []);

    function handleGenerate() {
        setGenerating(true);
        setTimeout(() => {
            setGenerating(false);
            setStamp(stampNow());
            notify(`${report.name} generated`);
        }, 1500);
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

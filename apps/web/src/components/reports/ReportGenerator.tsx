'use client';

import { useState } from 'react';
import { reportsApi, type ReportJob } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';

interface ReportFilters {
    project_ids?: string[];
    status?: string[];
    date_from?: string;
    date_to?: string;
}

interface ReportGeneratorProps {
    projects?: Array<{ id: string; name: string }>;
}

export function ReportGenerator({ projects = [] }: ReportGeneratorProps) {
    const [reportType, setReportType] = useState<'project_status' | 'resource_utilization' | 'task_export' | 'test_results' | 'dashboard'>('project_status');
    const [format, setFormat] = useState<'xlsx' | 'csv' | 'json' | 'pdf'>('xlsx');
    const [filters, setFilters] = useState<ReportFilters>({});
    const [isGenerating, setIsGenerating] = useState(false);
    const [currentJob, setCurrentJob] = useState<ReportJob | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleGenerate = async () => {
        setIsGenerating(true);
        setError(null);
        setCurrentJob(null);

        try {
            // Initiate report generation
            const response = await reportsApi.generate({
                report_type: reportType,
                format,
                filters: Object.keys(filters).length > 0 ? filters : undefined
            });

            const jobId = response.data.job_id;
            setCurrentJob({
                job_id: jobId,
                report_type: reportType,
                format,
                status: 'processing',
                filters: filters as any,
                created_at: new Date().toISOString()
            });

            // Start polling for job status
            pollJobStatus(jobId);
        } catch (err: any) {
            setError(err.message);
            setIsGenerating(false);
        }
    };

    const pollJobStatus = async (jobId: string) => {
        const maxAttempts = 30; // 30 seconds max polling (1s interval)
        let attempts = 0;

        const poll = async () => {
            try {
                attempts++;
                const response = await reportsApi.getStatus(jobId);
                const job = response.data;
                setCurrentJob(job);

                if (job.status === 'completed') {
                    setIsGenerating(false);
                    // Trigger download if URL is available
                    if (job.download_url) {
                        window.open(job.download_url, '_blank');
                    }
                } else if (job.status === 'failed') {
                    setError(job.error_message || 'Report generation failed');
                    setIsGenerating(false);
                } else if (attempts < maxAttempts) {
                    // Continue polling
                    setTimeout(poll, 1000);
                } else {
                    setError('Report generation timed out. Check status later.');
                    setIsGenerating(false);
                }
            } catch (err: any) {
                if (attempts < maxAttempts) {
                    // Retry on error
                    setTimeout(poll, 1000);
                } else {
                    setError('Failed to check report status');
                    setIsGenerating(false);
                }
            }
        };

        poll();
    };

    const handleFilterChange = (key: keyof ReportFilters, value: any) => {
        setFilters(prev => ({
            ...prev,
            [key]: value
        }));
    };

    return (
        <div className="space-y-6">
            {/* Report Configuration */}
            <Card>
                <div className="p-6 space-y-6">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Generate Report</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Select report type, format, and optional filters. Reports are generated asynchronously and will be available for download when ready.
                        </p>
                    </div>

                    {error && (
                        <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 p-4 rounded-xl text-sm flex items-center gap-2">
                            <svg className="w-5 h-5 text-rose-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Select
                            label="Report Type"
                            value={reportType}
                            onChange={(e) => setReportType(e.target.value as any)}
                            options={[
                                { value: 'project_status', label: 'Project Status Report' },
                                { value: 'resource_utilization', label: 'Resource Utilization Report' },
                                { value: 'task_export', label: 'Task Export' },
                                { value: 'test_results', label: 'Test Results Summary' },
                                { value: 'dashboard', label: 'Dashboard Metrics' }
                            ]}
                            className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                        />

                        <Select
                            label="Format"
                            value={format}
                            onChange={(e) => setFormat(e.target.value as any)}
                            options={[
                                { value: 'xlsx', label: 'Excel (.xlsx)' },
                                { value: 'csv', label: 'CSV (.csv)' },
                                { value: 'json', label: 'JSON (.json)' },
                                { value: 'pdf', label: 'PDF (.pdf)' }
                            ]}
                            className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                        />
                    </div>

                    {/* Optional Filters */}
                    <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                        <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Filters (Optional)</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Date From</label>
                                <input
                                    type="date"
                                    value={filters.date_from || ''}
                                    onChange={(e) => handleFilterChange('date_from', e.target.value || undefined)}
                                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Date To</label>
                                <input
                                    type="date"
                                    value={filters.date_to || ''}
                                    onChange={(e) => handleFilterChange('date_to', e.target.value || undefined)}
                                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <Button
                            onClick={handleGenerate}
                            disabled={isGenerating}
                            className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-500/30 border-none"
                        >
                            {isGenerating ? (
                                <>
                                    <span className="animate-spin mr-2">⏳</span>
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    Generate Report
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </Card>

            {/* Job Status Display */}
            {currentJob && (
                <Card>
                    <div className="p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h4 className="text-lg font-semibold text-slate-900 dark:text-white">Report Status</h4>
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                currentJob.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                currentJob.status === 'failed' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' :
                                'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 animate-pulse'
                            }`}>
                                {currentJob.status.toUpperCase()}
                            </span>
                        </div>

                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-slate-600 dark:text-slate-400">Job ID:</span>
                                <span className="text-slate-900 dark:text-slate-100 font-mono text-xs">{currentJob.job_id}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-600 dark:text-slate-400">Type:</span>
                                <span className="text-slate-900 dark:text-slate-100">{currentJob.report_type}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-600 dark:text-slate-400">Format:</span>
                                <span className="text-slate-900 dark:text-slate-100 uppercase">{currentJob.format}</span>
                            </div>
                            {currentJob.filename && (
                                <div className="flex justify-between">
                                    <span className="text-slate-600 dark:text-slate-400">File:</span>
                                    <span className="text-slate-900 dark:text-slate-100">{currentJob.filename}</span>
                                </div>
                            )}
                            {currentJob.file_size && (
                                <div className="flex justify-between">
                                    <span className="text-slate-600 dark:text-slate-400">Size:</span>
                                    <span className="text-slate-900 dark:text-slate-100">{currentJob.file_size}</span>
                                </div>
                            )}
                        </div>

                        {currentJob.status === 'completed' && currentJob.download_url && (
                            <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                                <Button
                                    onClick={() => window.open(currentJob.download_url!, '_blank')}
                                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                                >
                                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    Download Report
                                </Button>
                            </div>
                        )}

                        {currentJob.status === 'processing' && (
                            <div className="pt-4">
                                <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2">
                                    <div className="bg-indigo-600 h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 text-center">
                                    Your report is being generated. This may take a few moments...
                                </p>
                            </div>
                        )}
                    </div>
                </Card>
            )}
        </div>
    );
}

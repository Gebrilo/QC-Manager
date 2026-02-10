'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { projectsApi } from '@/lib/api';

interface Project {
    id: string;
    project_id: string;
    project_name: string;
}

interface TestRun {
    id: string;
    run_id: string;
    name: string;
    description: string;
    status: string;
    started_at: string;
    project_name: string;
    project_id: string;
    total_cases: number;
    passed: number;
    failed: number;
    not_run: number;
    blocked: number;
    skipped: number;
    pass_rate: number;
}

interface UploadResult {
    message: string;
    test_run: { id: string; run_id: string; name: string };
    summary: {
        total_rows: number;
        imported: number;
        errors: number;
        pass: number;
        fail: number;
        not_run: number;
        blocked: number;
        skipped: number;
        pass_rate: string;
    };
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Sample template data
const SAMPLE_TEMPLATE = [
    ['Test Case ID', 'Name', 'Status', 'Notes'],
    ['TC-001', 'Login Test', 'Pass', ''],
    ['TC-002', 'Checkout Flow', 'Fail', 'Bug #123'],
    ['TC-003', 'Profile Update', 'Blocked', 'Environment issue'],
    ['TC-004', 'Password Reset', 'Not Executed', ''],
    ['TC-005', 'Search Functionality', 'Skipped', 'Out of scope'],
];

export default function TestExecutionsPage() {
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [projects, setProjects] = useState<Project[]>([]);
    const [testRuns, setTestRuns] = useState<TestRun[]>([]);
    const [filteredRuns, setFilteredRuns] = useState<TestRun[]>([]);
    const [selectedProject, setSelectedProject] = useState<string>('');
    const [testRunName, setTestRunName] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [isDragOver, setIsDragOver] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterProject, setFilterProject] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    // Load projects and recent uploads
    useEffect(() => {
        async function loadData() {
            try {
                setLoading(true);
                const [projectsData, runsResponse] = await Promise.all([
                    projectsApi.list(),
                    fetch(`${API_BASE}/test-executions/recent-uploads`)
                ]);

                setProjects(Array.isArray(projectsData) ? projectsData : []);

                if (runsResponse.ok) {
                    const runsData = await runsResponse.json();
                    setTestRuns(Array.isArray(runsData) ? runsData : []);
                } else {
                    console.error('Failed to fetch test runs:', runsResponse.status);
                    setTestRuns([]);
                }
            } catch (err) {
                console.error('Error loading data:', err);
                setProjects([]);
                setTestRuns([]);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, []);

    // Filter test runs based on search and project filter
    useEffect(() => {
        let filtered = testRuns;

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(run =>
                run.name.toLowerCase().includes(query) ||
                run.run_id.toLowerCase().includes(query) ||
                (run.project_name && run.project_name.toLowerCase().includes(query))
            );
        }

        if (filterProject) {
            filtered = filtered.filter(run => run.project_id === filterProject);
        }

        setFilteredRuns(filtered);
    }, [testRuns, searchQuery, filterProject]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            validateAndSetFile(selectedFile);
        }
    };

    const validateAndSetFile = (selectedFile: File) => {
        const validTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv'
        ];
        const maxSize = 10 * 1024 * 1024; // 10MB

        if (!validTypes.includes(selectedFile.type) &&
            !selectedFile.name.match(/\.(xlsx|xls|csv)$/i)) {
            setError('Invalid file type. Please upload .xlsx, .xls, or .csv files.');
            return;
        }

        if (selectedFile.size > maxSize) {
            setError('File too large. Maximum size is 10MB.');
            return;
        }

        setFile(selectedFile);
        setError(null);
        setUploadResult(null);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile) {
            validateAndSetFile(droppedFile);
        }
    };

    const handleUpload = async () => {
        if (!file || !selectedProject) {
            setError('Please select a project and upload a file');
            return;
        }

        setUploading(true);
        setUploadProgress(0);
        setError(null);
        setUploadResult(null);

        // Simulate progress
        const progressInterval = setInterval(() => {
            setUploadProgress(prev => Math.min(prev + 10, 90));
        }, 200);

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('project_id', selectedProject);
            if (testRunName) {
                formData.append('test_run_name', testRunName);
            }

            const response = await fetch(`${API_BASE}/test-executions/upload-excel`, {
                method: 'POST',
                body: formData
            });

            clearInterval(progressInterval);
            setUploadProgress(100);

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Upload failed');
            }

            const result = await response.json();
            setUploadResult(result);

            // Refresh the test runs list
            const runsResponse = await fetch(`${API_BASE}/test-executions/recent-uploads`);
            if (runsResponse.ok) {
                const runsData = await runsResponse.json();
                setTestRuns(Array.isArray(runsData) ? runsData : []);
            }

            // Clear form
            setFile(null);
            setTestRunName('');
            if (fileInputRef.current) fileInputRef.current.value = '';

        } catch (err: any) {
            clearInterval(progressInterval);
            setError(err.message || 'Upload failed');
        } finally {
            setUploading(false);
            setTimeout(() => setUploadProgress(0), 1000);
        }
    };

    const handleDownloadTemplate = () => {
        const csvContent = SAMPLE_TEMPLATE.map(row => row.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'test_results_template.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleDeleteRun = async (runId: string) => {
        setDeleting(true);
        try {
            const response = await fetch(`${API_BASE}/test-executions/test-runs/${runId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                setTestRuns(prev => prev.filter(r => r.id !== runId));
                setDeleteConfirm(null);
            } else {
                const errData = await response.json();
                setError(errData.error || 'Failed to delete test run');
            }
        } catch (err: any) {
            setError(err.message || 'Failed to delete test run');
        } finally {
            setDeleting(false);
        }
    };

    const handleExportResults = () => {
        const headers = ['Run ID', 'Name', 'Project', 'Total', 'Passed', 'Failed', 'Blocked', 'Pass Rate', 'Date'];
        const rows = filteredRuns.map(run => [
            run.run_id,
            run.name,
            run.project_name || '-',
            run.total_cases,
            run.passed,
            run.failed,
            run.blocked,
            `${run.pass_rate}%`,
            run.started_at ? new Date(run.started_at).toLocaleDateString() : '-'
        ]);

        const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `test_runs_export_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-950 pb-12">
            {/* Header */}
            <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg border-b border-slate-200/50 dark:border-slate-700/50 sticky top-0 z-20 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex justify-between items-center">
                        <div>
                            <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                                Test Executions
                            </h1>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                Upload test results and track execution history
                            </p>
                        </div>
                        <button
                            onClick={() => router.push('/governance')}
                            className="group px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-lg text-sm font-medium text-white hover:from-indigo-700 hover:to-violet-700 transition-all shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5"
                        >
                            <span className="flex items-center gap-2">
                                <svg className="w-4 h-4 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                                Governance
                            </span>
                        </button>
                    </div>
                </div>
            </div>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

                {/* Upload Section */}
                <section className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50 border border-slate-200/50 dark:border-slate-700/50 p-6 transition-all hover:shadow-2xl">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <span className="p-2 bg-gradient-to-br from-indigo-500 to-violet-500 rounded-lg text-white">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                    </svg>
                                </span>
                                Upload Test Results
                            </h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                Upload Excel or CSV file with test case results
                            </p>
                        </div>
                        <button
                            onClick={handleDownloadTemplate}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 transition-all hover:scale-105"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Download Template
                        </button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Left: Upload Form */}
                        <div className="space-y-5">
                            {/* Project Selection */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    Select Project <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={selectedProject}
                                    onChange={(e) => setSelectedProject(e.target.value)}
                                    className="w-full px-4 py-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all shadow-sm hover:border-indigo-300"
                                >
                                    <option value="">-- Select a project --</option>
                                    {projects.map(p => (
                                        <option key={p.id} value={p.id}>{p.project_name} ({p.project_id})</option>
                                    ))}
                                </select>
                            </div>

                            {/* Test Run Name */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    Test Run Name <span className="text-slate-400">(Optional)</span>
                                </label>
                                <input
                                    type="text"
                                    value={testRunName}
                                    onChange={(e) => setTestRunName(e.target.value)}
                                    placeholder="e.g., Sprint 5 Regression Tests"
                                    className="w-full px-4 py-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all shadow-sm hover:border-indigo-300 placeholder:text-slate-400"
                                />
                            </div>

                            {/* File Upload - Drag & Drop */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    Excel/CSV File <span className="text-red-500">*</span>
                                </label>
                                <div
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 ${isDragOver
                                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 scale-[1.02]'
                                            : file
                                                ? 'border-green-400 bg-green-50 dark:bg-green-900/20'
                                                : 'border-slate-300 dark:border-slate-600 hover:border-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                                        }`}
                                >
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".xlsx,.xls,.csv"
                                        onChange={handleFileChange}
                                        className="hidden"
                                    />

                                    {file ? (
                                        <div className="space-y-2">
                                            <div className="w-16 h-16 mx-auto bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                                                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </div>
                                            <p className="text-sm font-medium text-slate-900 dark:text-white">{file.name}</p>
                                            <p className="text-xs text-slate-500">{formatFileSize(file.size)}</p>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setFile(null); }}
                                                className="text-xs text-red-500 hover:text-red-700 underline"
                                            >
                                                Remove file
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center transition-all ${isDragOver ? 'bg-indigo-100 dark:bg-indigo-900/30 scale-110' : 'bg-slate-100 dark:bg-slate-700'
                                                }`}>
                                                <svg className={`w-8 h-8 transition-colors ${isDragOver ? 'text-indigo-600' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                                    {isDragOver ? 'Drop file here' : 'Drag & drop or click to select'}
                                                </p>
                                                <p className="text-xs text-slate-400 mt-1">Supports .xlsx, .xls, .csv (max 10MB)</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Upload Progress */}
                            {uploading && (
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600 dark:text-slate-400">Uploading...</span>
                                        <span className="text-indigo-600 font-medium">{uploadProgress}%</span>
                                    </div>
                                    <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-300"
                                            style={{ width: `${uploadProgress}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Upload Button */}
                            <button
                                onClick={handleUpload}
                                disabled={uploading || !file || !selectedProject}
                                className="w-full py-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:from-slate-400 disabled:to-slate-500 text-white font-semibold rounded-xl shadow-lg shadow-indigo-500/30 transition-all disabled:shadow-none hover:shadow-indigo-500/50 hover:-translate-y-0.5 disabled:cursor-not-allowed"
                            >
                                {uploading ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                        Processing...
                                    </span>
                                ) : (
                                    <span className="flex items-center justify-center gap-2">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                        </svg>
                                        Upload & Process
                                    </span>
                                )}
                            </button>

                            {error && (
                                <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-sm flex items-start gap-3 animate-shake">
                                    <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    {error}
                                </div>
                            )}
                        </div>

                        {/* Right: Expected Format */}
                        <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-700/50 dark:to-slate-800/50 rounded-xl p-5 border border-slate-200/50 dark:border-slate-600/50">
                            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
                                <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                Expected File Format
                            </h3>
                            <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-600">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="bg-slate-200 dark:bg-slate-600">
                                            <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Test Case ID</th>
                                            <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Name</th>
                                            <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Status</th>
                                            <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Notes</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white dark:bg-slate-700">
                                        <tr className="border-b border-slate-200 dark:border-slate-600">
                                            <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-300">TC-001</td>
                                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300">Login Test</td>
                                            <td className="px-3 py-2"><span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-[10px] font-semibold">Pass</span></td>
                                            <td className="px-3 py-2 text-slate-400">-</td>
                                        </tr>
                                        <tr className="border-b border-slate-200 dark:border-slate-600">
                                            <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-300">TC-002</td>
                                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300">Checkout Flow</td>
                                            <td className="px-3 py-2"><span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-semibold">Fail</span></td>
                                            <td className="px-3 py-2 text-slate-500 dark:text-slate-400">Bug #123</td>
                                        </tr>
                                        <tr className="border-b border-slate-200 dark:border-slate-600">
                                            <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-300">TC-003</td>
                                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300">Profile Update</td>
                                            <td className="px-3 py-2"><span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-semibold">Blocked</span></td>
                                            <td className="px-3 py-2 text-slate-500 dark:text-slate-400">Env issue</td>
                                        </tr>
                                        <tr>
                                            <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-300">TC-004</td>
                                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300">Password Reset</td>
                                            <td className="px-3 py-2"><span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[10px] font-semibold">Not Run</span></td>
                                            <td className="px-3 py-2 text-slate-400">-</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <div className="mt-4 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800">
                                <p className="text-xs text-indigo-700 dark:text-indigo-300">
                                    <strong>Accepted Status Values:</strong><br />
                                    Pass, Passed, Fail, Failed, Blocked, Not Executed, Not Run, Skipped, Rejected
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Upload Result */}
                {uploadResult && (
                    <section className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-2xl shadow-xl border border-green-200 dark:border-green-800 p-6 animate-slideIn">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full">
                                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-green-700 dark:text-green-400">{uploadResult.message}</h3>
                                <p className="text-sm text-green-600 dark:text-green-500">
                                    Test Run: <span className="font-mono font-semibold">{uploadResult.test_run.run_id}</span> - {uploadResult.test_run.name}
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                            {[
                                { label: 'Total', value: uploadResult.summary.total_rows, color: 'slate' },
                                { label: 'Passed', value: uploadResult.summary.pass, color: 'green' },
                                { label: 'Failed', value: uploadResult.summary.fail, color: 'red' },
                                { label: 'Blocked', value: uploadResult.summary.blocked, color: 'amber' },
                                { label: 'Not Run', value: uploadResult.summary.not_run, color: 'slate' },
                                { label: 'Pass Rate', value: uploadResult.summary.pass_rate, color: 'indigo' },
                            ].map((stat, i) => (
                                <div key={i} className={`bg-${stat.color}-50 dark:bg-${stat.color}-900/30 rounded-xl p-4 text-center border border-${stat.color}-200 dark:border-${stat.color}-800`}>
                                    <p className={`text-2xl font-bold text-${stat.color}-700 dark:text-${stat.color}-400`}>{stat.value}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{stat.label}</p>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Test Run History */}
                <section className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50 border border-slate-200/50 dark:border-slate-700/50 overflow-hidden">
                    <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <span className="p-2 bg-gradient-to-br from-violet-500 to-purple-500 rounded-lg text-white">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                        </svg>
                                    </span>
                                    Test Run History
                                </h2>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                    {filteredRuns.length} of {testRuns.length} test runs
                                </p>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-3">
                                {/* Search */}
                                <div className="relative">
                                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                    <input
                                        type="text"
                                        placeholder="Search runs..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-10 pr-4 py-2 w-full sm:w-64 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                    />
                                </div>
                                {/* Filter by Project */}
                                <select
                                    value={filterProject}
                                    onChange={(e) => setFilterProject(e.target.value)}
                                    className="px-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="">All Projects</option>
                                    {projects.map(p => (
                                        <option key={p.id} value={p.id}>{p.project_name}</option>
                                    ))}
                                </select>
                                {/* Export Button */}
                                <button
                                    onClick={handleExportResults}
                                    disabled={filteredRuns.length === 0}
                                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 transition-all"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    Export CSV
                                </button>
                            </div>
                        </div>
                    </div>

                    {loading ? (
                        <div className="p-12 text-center">
                            <div className="inline-flex items-center gap-3 text-slate-400">
                                <svg className="animate-spin w-6 h-6" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Loading test runs...
                            </div>
                        </div>
                    ) : filteredRuns.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="w-16 h-16 mx-auto bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mb-4">
                                <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                            </div>
                            <p className="text-slate-500 dark:text-slate-400">
                                {testRuns.length === 0
                                    ? 'No test runs yet. Upload your first Excel file above.'
                                    : 'No test runs match your search criteria.'}
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-slate-50 dark:bg-slate-700/50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Run ID</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Name</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Project</th>
                                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total</th>
                                        <th className="px-4 py-3 text-center text-xs font-semibold text-green-600 uppercase tracking-wider">Pass</th>
                                        <th className="px-4 py-3 text-center text-xs font-semibold text-red-600 uppercase tracking-wider">Fail</th>
                                        <th className="px-4 py-3 text-center text-xs font-semibold text-amber-600 uppercase tracking-wider">Blocked</th>
                                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Pass Rate</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                    {filteredRuns.map(run => (
                                        <tr key={run.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group">
                                            <td className="px-4 py-4 text-sm font-mono text-indigo-600 dark:text-indigo-400 font-semibold">{run.run_id}</td>
                                            <td className="px-4 py-4 text-sm text-slate-900 dark:text-white font-medium max-w-xs truncate">{run.name}</td>
                                            <td className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400">{run.project_name || '-'}</td>
                                            <td className="px-4 py-4 text-sm text-center font-semibold text-slate-700 dark:text-slate-300">{run.total_cases}</td>
                                            <td className="px-4 py-4 text-sm text-center font-semibold text-green-600">{run.passed}</td>
                                            <td className="px-4 py-4 text-sm text-center font-semibold text-red-600">{run.failed}</td>
                                            <td className="px-4 py-4 text-sm text-center font-semibold text-amber-600">{run.blocked}</td>
                                            <td className="px-4 py-4 text-sm text-center">
                                                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${run.pass_rate >= 80 ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                                        run.pass_rate >= 60 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                                            'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                                    }`}>
                                                    {run.pass_rate}%
                                                </span>
                                            </td>
                                            <td className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
                                                {run.started_at ? new Date(run.started_at).toLocaleDateString() : '-'}
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                {deleteConfirm === run.id ? (
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button
                                                            onClick={() => handleDeleteRun(run.id)}
                                                            disabled={deleting}
                                                            className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded font-medium disabled:opacity-50"
                                                        >
                                                            {deleting ? '...' : 'Yes'}
                                                        </button>
                                                        <button
                                                            onClick={() => setDeleteConfirm(null)}
                                                            className="px-2 py-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-200 text-xs rounded font-medium"
                                                        >
                                                            No
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => setDeleteConfirm(run.id)}
                                                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                                        title="Delete test run"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </main>

            {/* Custom animations */}
            <style jsx>{`
                @keyframes slideIn {
                    from {
                        opacity: 0;
                        transform: translateY(-10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-5px); }
                    75% { transform: translateX(5px); }
                }
                .animate-slideIn {
                    animation: slideIn 0.3s ease-out;
                }
                .animate-shake {
                    animation: shake 0.3s ease-out;
                }
            `}</style>
        </div>
    );
}

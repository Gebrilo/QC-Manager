'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { testRunsApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { fetchApi } from '@/lib/api';
import { formatDistanceToNow, format } from 'date-fns';

interface TestRunDetail {
    id: string;
    run_id: string;
    name: string;
    description?: string;
    project_id: string;
    project_name?: string;
    status: string;
    suite_id?: string;
    source?: string;
    environment?: string;
    version_tag?: string;
    started_at: string;
    completed_at?: string;
    created_by_name?: string;
    created_at: string;
    metrics: {
        total_executions: number;
        pass_count: number;
        fail_count: number;
        not_run_count: number;
        blocked_count: number;
        skipped_count: number;
        pass_rate_pct: number;
        not_run_pct: number;
    };
    executions: TestRunExecutionItem[];
}

interface TestRunExecutionItem {
    id: string;
    test_case_id: string;
    test_case_title?: string;
    test_case_id_display?: string;
    test_case_steps?: string;
    expected_result?: string;
    sort_order?: number;
    status: string;
    notes?: string;
    duration_seconds?: number;
    defect_ids?: string[];
    assigned_to?: string;
    assigned_to_name?: string;
    executed_by_name?: string;
    executed_at?: string;
    category?: string;
    priority?: string;
}

const EXECUTION_STATUSES = ['pass', 'fail', 'blocked', 'not_run', 'skipped'] as const;

function getStatusBadge(status: string): 'success' | 'danger' | 'warning' | 'default' | 'info' {
    const map: Record<string, 'success' | 'danger' | 'warning' | 'default' | 'info'> = {
        pass: 'success', fail: 'danger', blocked: 'warning', not_run: 'default', skipped: 'info',
    };
    return map[status] || 'default';
}

function getStatusLabel(status: string): string {
    const map: Record<string, string> = {
        pass: 'Passed', fail: 'Failed', blocked: 'Blocked', not_run: 'Not Run', skipped: 'Skipped',
    };
    return map[status] || status;
}

export default function TestRunDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const [run, setRun] = useState<TestRunDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkStatus, setBulkStatus] = useState('');

    const loadRun = useCallback(async () => {
        try {
            setLoading(true);
            const data = await fetchApi<TestRunDetail>(`/test-executions/test-runs/${id}`);
            setRun(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        loadRun();
    }, [loadRun]);

    const handleStatusUpdate = async (executionId: string, newStatus: string) => {
        setUpdatingId(executionId);
        try {
            await fetchApi(`/test-executions/executions/${executionId}`, {
                method: 'PATCH',
                body: JSON.stringify({ status: newStatus }),
            });
            setRun(prev => prev ? {
                ...prev,
                executions: prev.executions.map(e =>
                    e.id === executionId ? { ...e, status: newStatus } : e
                ),
            } : null);
        } catch (err: any) {
            alert(err.message || 'Failed to update status');
        } finally {
            setUpdatingId(null);
        }
    };

    const handleBulkUpdate = async () => {
        if (selectedIds.size === 0 || !bulkStatus) return;
        try {
            await testRunsApi.bulkUpdateExecutions(id, {
                execution_ids: Array.from(selectedIds),
                status: bulkStatus,
            });
            setSelectedIds(new Set());
            setBulkStatus('');
            await loadRun();
        } catch (err: any) {
            alert(err.message || 'Failed to bulk update');
        }
    };

    const toggleSelection = (executionId: string) => {
        const next = new Set(selectedIds);
        if (next.has(executionId)) next.delete(executionId);
        else next.add(executionId);
        setSelectedIds(next);
    };

    const selectAll = () => {
        if (!run) return;
        if (selectedIds.size === run.executions.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(run.executions.map(e => e.id)));
        }
    };

    if (loading) {
        return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;
    }

    if (error || !run) {
        return (
            <div className="max-w-3xl mx-auto py-8 px-4">
                <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 p-6 rounded-2xl">
                    <h2 className="text-lg font-semibold mb-2">Error</h2>
                    <p>{error || 'Test run not found'}</p>
                    <Link href="/test-executions"><Button variant="outline" className="mt-4">Back to Test Runs</Button></Link>
                </div>
            </div>
        );
    }

    const metrics = run.metrics;
    const passRate = Number(metrics.pass_rate_pct) || 0;
    const completionRate = metrics.total_executions > 0
        ? Math.round(((metrics.total_executions - metrics.not_run_count) / metrics.total_executions) * 100)
        : 0;

    return (
        <div className="max-w-6xl mx-auto py-8 px-4">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <Link href="/test-executions"><Button variant="ghost" size="sm">Back</Button></Link>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{run.run_id}: {run.name}</h1>
                        <div className="flex gap-2 mt-1">
                            <Badge variant={run.status === 'completed' ? 'success' : run.status === 'in_progress' ? 'warning' : 'default'}>{run.status}</Badge>
                            {run.source && <Badge variant="info">Source: {run.source}</Badge>}
                            {run.environment && <Badge variant="default">{run.environment}</Badge>}
                            {run.version_tag && <Badge variant="default">v{run.version_tag}</Badge>}
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-center">
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">{metrics.total_executions}</div>
                    <div className="text-xs text-gray-500">Total</div>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-900/50 p-4 text-center">
                    <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{metrics.pass_count}</div>
                    <div className="text-xs text-emerald-600 dark:text-emerald-400">Passed</div>
                </div>
                <div className="bg-rose-50 dark:bg-rose-900/20 rounded-xl border border-rose-200 dark:border-rose-900/50 p-4 text-center">
                    <div className="text-2xl font-bold text-rose-700 dark:text-rose-400">{metrics.fail_count}</div>
                    <div className="text-xs text-rose-600 dark:text-rose-400">Failed</div>
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-900/50 p-4 text-center">
                    <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{metrics.blocked_count}</div>
                    <div className="text-xs text-amber-600 dark:text-amber-400">Blocked</div>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-center">
                    <div className="text-2xl font-bold text-gray-500">{metrics.not_run_count}</div>
                    <div className="text-xs text-gray-500">Not Run</div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Pass Rate</div>
                    <div className="flex items-center gap-3">
                        <div className="flex-1 h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${passRate >= 80 ? 'bg-emerald-500' : passRate >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${passRate}%` }} />
                        </div>
                        <span className="text-lg font-bold text-slate-900 dark:text-white">{passRate}%</span>
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Completion</div>
                    <div className="flex items-center gap-3">
                        <div className="flex-1 h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-blue-500" style={{ width: `${completionRate}%` }} />
                        </div>
                        <span className="text-lg font-bold text-slate-900 dark:text-white">{completionRate}%</span>
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 mb-4 text-sm text-gray-500 dark:text-gray-400 flex flex-wrap gap-4">
                {run.project_name && <span>Project: <strong className="text-slate-900 dark:text-white">{run.project_name}</strong></span>}
                {run.created_by_name && <span>Created by: <strong className="text-slate-900 dark:text-white">{run.created_by_name}</strong></span>}
                <span>Started: <strong className="text-slate-900 dark:text-white">{formatDistanceToNow(new Date(run.started_at), { addSuffix: true })}</strong></span>
                {run.completed_at && <span>Completed: <strong className="text-slate-900 dark:text-white">{formatDistanceToNow(new Date(run.completed_at), { addSuffix: true })}</strong></span>}
                {run.suite_id && (
                    <span>Suite: <Link href={`/test-suites/${run.suite_id}`} className="text-blue-600 dark:text-blue-400 hover:underline">View Suite</Link></span>
                )}
            </div>

            {selectedIds.size > 0 && (
                <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-900/50 rounded-xl p-4 mb-4 flex items-center gap-4">
                    <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">{selectedIds.size} selected</span>
                    <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-slate-900 dark:text-white text-sm">
                        <option value="">Set status to...</option>
                        {EXECUTION_STATUSES.map(s => <option key={s} value={s}>{getStatusLabel(s)}</option>)}
                    </select>
                    <Button size="sm" onClick={handleBulkUpdate} disabled={!bulkStatus}>Apply</Button>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>Clear</Button>
                </div>
            )}

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Executions ({run.executions.length})</h3>
                    <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
                        <input type="checkbox" checked={selectedIds.size === run.executions.length && run.executions.length > 0} onChange={selectAll} className="h-4 w-4 rounded" />
                        Select All
                    </label>
                </div>

                {run.executions.length === 0 ? (
                    <div className="p-8 text-center">
                        <p className="text-gray-500 dark:text-gray-400">No executions in this test run.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-10"></th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">#</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Test Case</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Assigned To</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Duration</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Notes</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {run.executions.map((ex, idx) => (
                                    <tr key={ex.id} className={`hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors ${selectedIds.has(ex.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                                        <td className="px-4 py-3">
                                            <input type="checkbox" checked={selectedIds.has(ex.id)} onChange={() => toggleSelection(ex.id)} className="h-4 w-4 rounded" />
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-500">{ex.sort_order || idx + 1}</td>
                                        <td className="px-4 py-3">
                                            <div className="text-sm font-medium text-slate-900 dark:text-white">{ex.test_case_title || ex.test_case_id}</div>
                                            {ex.test_case_steps && (
                                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{ex.test_case_steps.substring(0, 100)}{ex.test_case_steps.length > 100 ? '...' : ''}</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <Badge variant={getStatusBadge(ex.status)}>{getStatusLabel(ex.status)}</Badge>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{ex.assigned_to_name || '\u2014'}</td>
                                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{ex.duration_seconds ? `${ex.duration_seconds}s` : '\u2014'}</td>
                                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 max-w-32 truncate">{ex.notes || '\u2014'}</td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <div className="flex items-center gap-1">
                                                {EXECUTION_STATUSES.map(s => (
                                                    <button
                                                        key={s}
                                                        onClick={() => handleStatusUpdate(ex.id, s)}
                                                        disabled={updatingId === ex.id}
                                                        className={`px-2 py-1 text-xs rounded transition-colors disabled:opacity-50 ${
                                                            ex.status === s
                                                                ? s === 'pass' ? 'bg-emerald-600 text-white'
                                                                  : s === 'fail' ? 'bg-rose-600 text-white'
                                                                  : s === 'blocked' ? 'bg-amber-600 text-white'
                                                                  : s === 'skipped' ? 'bg-blue-600 text-white'
                                                                  : 'bg-gray-400 text-white'
                                                                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                                                        }`}
                                                        title={`Set ${getStatusLabel(s)}`}
                                                    >
                                                        {s === 'pass' ? '\u2713' : s === 'fail' ? '\u2717' : s === 'blocked' ? '\u25D0' : s === 'skipped' ? '\u2192' : '\u2014'}
                                                    </button>
                                                ))}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
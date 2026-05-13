'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { TestCase, TestCaseExecution, TestCaseActivityEntry } from '@/types';
import { testCasesApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { formatDistanceToNow, format } from 'date-fns';
import { LinkedTasksPanel } from '@/components/test-cases/LinkedTasksPanel';

export default function TestCaseDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const [testCase, setTestCase] = useState<(TestCase & { execution_history?: TestCaseExecution[]; activity?: TestCaseActivityEntry[] }) | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        testCasesApi.get(id)
            .then((data) => setTestCase(data as any))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, [id]);

    const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete this test case? This action can be undone by an admin.')) return;
        try {
            await testCasesApi.delete(id);
            router.push('/test-cases');
            router.refresh();
        } catch (err: any) {
            setError(err.message);
        }
    };

    if (loading) {
        return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;
    }

    if (error) {
        return (
            <div className="max-w-3xl mx-auto py-8 px-4">
                <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 p-6 rounded-2xl">
                    <h2 className="text-lg font-semibold mb-2">Error Loading Test Case</h2>
                    <p>{error}</p>
                    <Link href="/test-cases"><Button variant="outline" className="mt-4">Back to Test Cases</Button></Link>
                </div>
            </div>
        );
    }

    if (!testCase) {
        return (
            <div className="max-w-3xl mx-auto py-8 px-4">
                <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl text-center border border-slate-200 dark:border-slate-800">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Test Case Not Found</h2>
                    <Link href="/test-cases"><Button variant="outline">Back to Test Cases</Button></Link>
                </div>
            </div>
        );
    }

    const getStatusBadgeVariant = (s: string): 'success' | 'warning' | 'danger' | 'default' => {
        const map: Record<string, 'success' | 'warning' | 'danger' | 'default'> = { active: 'success', draft: 'warning', deprecated: 'danger', archived: 'default' };
        return map[s] || 'default';
    };

    const getPriorityBadgeVariant = (p: string): 'danger' | 'warning' | 'default' | 'success' => {
        const map: Record<string, 'danger' | 'warning' | 'default' | 'success'> = { critical: 'danger', high: 'warning', medium: 'default', low: 'success' };
        return map[p] || 'default';
    };

    return (
        <div className="max-w-4xl mx-auto py-8 px-4">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <Link href="/test-cases"><Button variant="ghost" size="sm">Back</Button></Link>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{testCase.test_case_id}</h1>
                </div>
                <div className="flex gap-3">
                    <Link href={`/test-cases/${id}/edit`}><Button variant="outline">Edit</Button></Link>
                    <Button variant="destructive" onClick={handleDelete}>Delete</Button>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-6">
                <div>
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">{testCase.title}</h2>
                    <div className="flex flex-wrap gap-2">
                        <Badge variant={getStatusBadgeVariant(testCase.status)}>{testCase.status}</Badge>
                        <Badge variant={getPriorityBadgeVariant(testCase.priority)}>{testCase.priority}</Badge>
                        {testCase.severity && <Badge variant="info">{testCase.severity}</Badge>}
                        {testCase.automation_status && <Badge variant="default">{testCase.automation_status.replace('_', ' ')}</Badge>}
                        {testCase.test_type && <Badge variant="default">{testCase.test_type}</Badge>}
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    <div><span className="text-gray-500 dark:text-gray-400">Project</span><br /><span className="text-slate-900 dark:text-white">{testCase.project_name || '\u2014'}</span></div>
                    <div><span className="text-gray-500 dark:text-gray-400">Category</span><br /><span className="text-slate-900 dark:text-white capitalize">{testCase.category || '\u2014'}</span></div>
                    <div><span className="text-gray-500 dark:text-gray-400">Component</span><br /><span className="text-slate-900 dark:text-white">{testCase.component || '\u2014'}</span></div>
                    <div><span className="text-gray-500 dark:text-gray-400">Assigned To</span><br /><span className="text-slate-900 dark:text-white">{testCase.assigned_to_name || 'Unassigned'}</span></div>
                    <div><span className="text-gray-500 dark:text-gray-400">Est. Duration</span><br /><span className="text-slate-900 dark:text-white">{testCase.estimated_duration_minutes ? `${testCase.estimated_duration_minutes} min` : '\u2014'}</span></div>
                    <div><span className="text-gray-500 dark:text-gray-400">Linked Requirement</span><br /><span className="text-slate-900 dark:text-white">{testCase.linked_requirement_id || '\u2014'}</span></div>
                    {testCase.tags && testCase.tags.length > 0 && (
                        <div className="col-span-2 md:col-span-3"><span className="text-gray-500 dark:text-gray-400">Tags</span><br /><div className="flex gap-1 mt-1">{testCase.tags.map(t => <Badge key={t} variant="default">{t}</Badge>)}</div></div>
                    )}
                    {testCase.tuleap_artifact_id && (
                        <div><span className="text-gray-500 dark:text-gray-400">Tuleap</span><br /><a href={testCase.tuleap_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Artifact #{testCase.tuleap_artifact_id}</a></div>
                    )}
                </div>

                {testCase.description && (
                    <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Description</h3>
                        <p className="text-sm text-slate-900 dark:text-white whitespace-pre-wrap">{testCase.description}</p>
                    </div>
                )}

                {testCase.preconditions && (
                    <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Preconditions</h3>
                        <p className="text-sm text-slate-900 dark:text-white whitespace-pre-wrap">{testCase.preconditions}</p>
                    </div>
                )}

                {testCase.test_steps && (
                    <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Test Steps</h3>
                        <p className="text-sm text-slate-900 dark:text-white whitespace-pre-wrap">{testCase.test_steps}</p>
                    </div>
                )}

                {testCase.expected_result && (
                    <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Expected Result</h3>
                        <p className="text-sm text-slate-900 dark:text-white whitespace-pre-wrap">{testCase.expected_result}</p>
                    </div>
                )}

                {testCase.sync_status && testCase.sync_status !== 'not_synced' && (
                    <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Sync Status</h3>
                        <div className="flex items-center gap-2">
                            <Badge variant={testCase.sync_status === 'synced' ? 'success' : testCase.sync_status === 'error' ? 'danger' : 'warning'}>{testCase.sync_status}</Badge>
                            {testCase.last_tuleap_sync && <span className="text-xs text-gray-500">Last synced {formatDistanceToNow(new Date(testCase.last_tuleap_sync), { addSuffix: true })}</span>}
                        </div>
                    </div>
                )}

                {testCase.execution_history && testCase.execution_history.length > 0 && (
                    <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Execution History</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                                        <th className="pb-2 pr-4">Date</th>
                                        <th className="pb-2 pr-4">Run</th>
                                        <th className="pb-2 pr-4">Status</th>
                                        <th className="pb-2">Tester</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {testCase.execution_history.map((ex) => (
                                        <tr key={ex.id}>
                                            <td className="py-2 pr-4 text-slate-900 dark:text-white">{ex.executed_at ? format(new Date(ex.executed_at), 'yyyy-MM-dd') : '\u2014'}</td>
                                            <td className="py-2 pr-4 text-slate-900 dark:text-white">{ex.test_run_name || ex.run_id || '\u2014'}</td>
                                            <td className="py-2 pr-4"><Badge variant={ex.status === 'passed' ? 'success' : ex.status === 'failed' ? 'danger' : 'default'}>{ex.status}</Badge></td>
                                            <td className="py-2 text-slate-900 dark:text-white">{ex.executed_by_name || '\u2014'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {testCase.activity && testCase.activity.length > 0 && (
                    <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Activity</h3>
                        <div className="space-y-2">
                            {testCase.activity.map((entry, i) => (
                                <div key={i} className="text-sm">
                                    <span className="text-gray-500 dark:text-gray-400">{formatDistanceToNow(new Date(entry.performed_at), { addSuffix: true })}</span>
                                    {' \u2014 '}
                                    <span className="text-slate-900 dark:text-white">{entry.change_summary || entry.action}</span>
                                    {entry.performed_by_email && <span className="text-gray-500"> by {entry.performed_by_email}</span>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <LinkedTasksPanel testCaseId={testCase.id} />
        </div>
    );
}

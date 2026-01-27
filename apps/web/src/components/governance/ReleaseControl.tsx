'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { governanceApi } from '@/services/governanceApi';
import { Badge } from '@/components/ui/Badge';

interface ReleaseControlProps {
    projectId: string;
    projectHealth: any; // Ideally typed, but keeping loose for integration flexibility
}

export function ReleaseControl({ projectId, projectHealth }: ReleaseControlProps) {
    const [gates, setGates] = useState<any>(null);
    const [approvals, setApprovals] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Approval Form
    const [showForm, setShowForm] = useState(false);
    const [version, setVersion] = useState('');
    const [comments, setComments] = useState('');
    const [action, setAction] = useState<'APPROVED' | 'REJECTED'>('APPROVED');

    useEffect(() => {
        loadData();
    }, [projectId]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [gatesData, approvalsData] = await Promise.all([
                governanceApi.getProjectGates(projectId),
                governanceApi.getApprovalHistory(projectId)
            ]);
            setGates(gatesData);
            setApprovals(approvalsData);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const evaluateGate = (metric: number, threshold: number, type: 'min' | 'max') => {
        const passed = type === 'min' ? metric >= threshold : metric <= threshold;
        return { passed, metric, threshold };
    };

    const gatesEvaluation = gates && projectHealth ? [
        { name: 'Pass Rate', ...evaluateGate(parseFloat(projectHealth.latest_pass_rate_pct || '0'), gates.min_pass_rate, 'min') },
        { name: 'Critical Defects', ...evaluateGate(projectHealth.blocking_issue_count || 0, gates.max_critical_defects, 'max') },
        // { name: 'Test Coverage', ...evaluateGate(parseFloat(projectHealth.test_coverage_pct || '0'), gates.min_test_coverage, 'min') }, // If available in health
    ] : [];

    const allPassed = gatesEvaluation.every(g => g.passed);

    const handleSubmit = async () => {
        if (!version) return alert('Version is required');

        try {
            await governanceApi.submitApproval({
                project_id: projectId,
                release_version: version,
                status: action,
                approver_name: 'Current User', // TODO: Get from Auth
                comments: comments,
                gate_snapshot: {
                    health: projectHealth,
                    gates: gates
                }
            });
            setShowForm(false);
            setVersion('');
            setComments('');
            loadData();
        } catch (e) {
            alert('Error submitting approval');
        }
    };

    if (loading) return <div>Loading release details...</div>;

    return (
        <div className="space-y-6">

            {/* Gate Status Card */}
            <Card className={allPassed ? "border-green-200 bg-green-50/50" : "border-red-200 bg-red-50/50"}>
                <CardHeader>
                    <CardTitle className="flex justify-between items-center">
                        <span>Release Gate Status</span>
                        <Badge variant={allPassed ? 'ontrack' : 'atrisk'} className="text-sm px-3 py-1">
                            {allPassed ? 'PASSED - Ready for Release' : 'FAILED - Criteria Not Met'}
                        </Badge>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {gatesEvaluation.map((g, idx) => (
                            <div key={idx} className={`p-4 rounded-lg border ${g.passed ? 'bg-white border-green-100' : 'bg-white border-red-200'}`}>
                                <div className="text-sm text-slate-500 mb-1">{g.name}</div>
                                <div className="text-2xl font-bold mb-1">
                                    {g.metric}{g.name.includes('Rate') ? '%' : ''}
                                </div>
                                <div className="text-xs text-slate-400">
                                    Target: {g.threshold}{g.name.includes('Rate') ? '%' : ''}
                                    {g.name === 'Critical Defects' ? ' Max' : ' Min'}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-6 flex justify-end">
                        <Button
                            onClick={() => { setAction('APPROVED'); setShowForm(true); }}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                            Start Release Procedure
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Approval Modal / Form Area */}
            {showForm && (
                <Card className="border-indigo-200 ring-4 ring-indigo-50 animate-in fade-in zoom-in-95 duration-200">
                    <CardHeader>
                        <CardTitle>Authorize Release</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Release Version</label>
                                <input className="w-full p-2 border rounded" placeholder="e.g. v1.2.0" value={version} onChange={e => setVersion(e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Decision</label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setAction('APPROVED')}
                                        className={`flex-1 p-2 rounded text-sm font-bold ${action === 'APPROVED' ? 'bg-green-600 text-white' : 'bg-slate-100'}`}
                                    >
                                        APPROVE
                                    </button>
                                    <button
                                        onClick={() => setAction('REJECTED')}
                                        className={`flex-1 p-2 rounded text-sm font-bold ${action === 'REJECTED' ? 'bg-red-600 text-white' : 'bg-slate-100'}`}
                                    >
                                        REJECT
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Comments / Audit Note</label>
                            <textarea
                                className="w-full p-2 border rounded"
                                rows={3}
                                placeholder="Enter justification or approval notes..."
                                value={comments}
                                onChange={e => setComments(e.target.value)}
                            />
                        </div>
                        {!allPassed && action === 'APPROVED' && (
                            <div className="bg-yellow-50 text-yellow-800 p-3 rounded text-sm border border-yellow-200">
                                <strong>Warning:</strong> You are approving a release that has failed Quality Gates. This will be logged as an exception.
                            </div>
                        )}
                        <div className="flex justify-end gap-3">
                            <Button onClick={() => setShowForm(false)} variant="outline">Cancel</Button>
                            <Button onClick={handleSubmit} variant="primary">Confirm Decision</Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* History Table */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                    <h3 className="font-bold text-slate-800 dark:text-gray-200">Approval History</h3>
                </div>
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                        <tr>
                            <th className="px-6 py-3 font-medium text-slate-500">Version</th>
                            <th className="px-6 py-3 font-medium text-slate-500">Date</th>
                            <th className="px-6 py-3 font-medium text-slate-500">Status</th>
                            <th className="px-6 py-3 font-medium text-slate-500">Approver</th>
                            <th className="px-6 py-3 font-medium text-slate-500">Comments</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {approvals.length === 0 ? (
                            <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400">No approval records found.</td></tr>
                        ) : (
                            approvals.map(a => (
                                <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                    <td className="px-6 py-3 font-bold">{a.release_version}</td>
                                    <td className="px-6 py-3">{new Date(a.created_at).toLocaleDateString()}</td>
                                    <td className="px-6 py-3">
                                        <Badge variant={a.status === 'APPROVED' ? 'ontrack' : 'atrisk'}>{a.status}</Badge>
                                    </td>
                                    <td className="px-6 py-3">{a.approver_name}</td>
                                    <td className="px-6 py-3 text-slate-500 truncate max-w-xs">{a.comments}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

        </div>
    );
}

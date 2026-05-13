'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { getSuiteReadiness } from '@/services/governanceApi';

interface SuiteReadinessPanelProps {
    projectId: string;
}

const READINESS_VARIANT: Record<string, 'complete' | 'danger' | 'warning' | 'default'> = {
    ready: 'complete',
    blocked: 'danger',
    warning: 'warning',
    unknown: 'default',
};

const SCOPE_VARIANT: Record<string, 'info' | 'default'> = {
    required: 'info',
    optional: 'default',
};

export function SuiteReadinessPanel({ projectId }: SuiteReadinessPanelProps) {
    const [suites, setSuites] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function load() {
            setIsLoading(true);
            try {
                const data = await getSuiteReadiness(projectId);
                setSuites(data);
            } catch (err) {
                console.error('Failed to load suite readiness', err);
            } finally {
                setIsLoading(false);
            }
        }
        if (projectId) load();
    }, [projectId]);

    if (isLoading) {
        return (
            <Card>
                <CardContent>
                    <div className="flex items-center justify-center py-8">
                        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (suites.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-sm uppercase tracking-wider text-slate-400">Suite Readiness</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-slate-500 italic">No test suites found for this project.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-sm uppercase tracking-wider text-slate-400">Suite Readiness</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-700">
                                <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Suite</th>
                                <th className="text-center py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Type</th>
                                <th className="text-center py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Scope</th>
                                <th className="text-center py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Last Run</th>
                                <th className="text-center py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Pass</th>
                                <th className="text-center py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Fail</th>
                                <th className="text-center py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Pass Rate</th>
                                <th className="text-center py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                                <th className="text-center py-2 px-3 text-xs font-semibold text-slate-500 uppercase">Risk</th>
                            </tr>
                        </thead>
                        <tbody>
                            {suites.map(suite => (
                                <tr key={suite.suite_id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                    <td className="py-2 px-3 font-medium text-slate-900 dark:text-white">{suite.suite_name}</td>
                                    <td className="py-2 px-3 text-center text-slate-600 dark:text-slate-400">{suite.suite_type}</td>
                                    <td className="py-2 px-3 text-center">
                                        <Badge variant={SCOPE_VARIANT[suite.readiness_scope] || 'default'}>
                                            {suite.readiness_scope}
                                        </Badge>
                                    </td>
                                    <td className="py-2 px-3 text-center text-slate-600 dark:text-slate-400 text-xs">
                                        {suite.completed_at ? new Date(suite.completed_at).toLocaleDateString() : '—'}
                                    </td>
                                    <td className="py-2 px-3 text-center text-emerald-600 font-medium">{suite.passed_count ?? 0}</td>
                                    <td className="py-2 px-3 text-center text-rose-600 font-medium">{suite.failed_count ?? 0}</td>
                                    <td className="py-2 px-3 text-center font-semibold text-slate-900 dark:text-white">
                                        {suite.pass_rate != null ? `${suite.pass_rate}%` : '—'}
                                    </td>
                                    <td className="py-2 px-3 text-center">
                                        <Badge variant={READINESS_VARIANT[suite.readiness_status] || 'default'}>
                                            {suite.readiness_status}
                                        </Badge>
                                    </td>
                                    <td className="py-2 px-3 text-center text-xs text-slate-500">
                                        {suite.risk_reason ? suite.risk_reason.replace(/_/g, ' ') : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    );
}
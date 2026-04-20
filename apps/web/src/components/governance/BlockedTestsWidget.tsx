'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import type { BlockedModuleAnalysis } from '@/types/governance';

interface BlockedTestsWidgetProps {
    data: BlockedModuleAnalysis[];
}

export function BlockedTestsWidget({ data }: BlockedTestsWidgetProps) {
    const pivotModules = data.filter(d => d.pivot_required);
    const totalBlockedHrs = data.reduce((sum, d) => sum + parseFloat(d.blocked_hrs || '0'), 0);
    const totalRetestHrs  = data.reduce((sum, d) => sum + parseFloat(d.retest_hrs  || '0'), 0);

    return (
        <Card className="shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white flex items-center justify-between">
                    Blocked Test Analysis
                    {pivotModules.length > 0 && (
                        <span className="text-xs font-normal px-2 py-1 bg-rose-100 text-rose-700 rounded-full">
                            {pivotModules.length} pivot required
                        </span>
                    )}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {pivotModules.length > 0 && (
                    <div className="space-y-2">
                        {pivotModules.map(m => (
                            <div
                                key={`${m.project_id}-${m.module_name}`}
                                className="flex items-start gap-2 p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg"
                            >
                                <span className="text-rose-500 mt-0.5">⚠</span>
                                <div>
                                    <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">
                                        PIVOT REQUIRED — {m.project_name} / {m.module_name}
                                    </p>
                                    <p className="text-xs text-rose-600 dark:text-rose-400">
                                        {m.blocked_count} of {m.total_tests} tests blocked ({m.blocked_pct}%).
                                        Reassign tester to unblocked modules.
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {data.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 dark:border-slate-700">
                                    <th className="text-left py-2 pr-3 font-medium text-slate-500 text-xs uppercase">Project / Module</th>
                                    <th className="text-right py-2 px-2 font-medium text-slate-500 text-xs uppercase">Tests</th>
                                    <th className="text-right py-2 px-2 font-medium text-slate-500 text-xs uppercase">Blocked</th>
                                    <th className="text-right py-2 px-2 font-medium text-slate-500 text-xs uppercase">Blocked %</th>
                                    <th className="text-right py-2 px-2 font-medium text-slate-500 text-xs uppercase">At Risk (hrs)</th>
                                    <th className="text-right py-2 pl-2 font-medium text-slate-500 text-xs uppercase">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.map(row => (
                                    <tr
                                        key={`${row.project_id}-${row.module_name}`}
                                        className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                    >
                                        <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">
                                            <span className="font-medium">{row.project_name}</span>
                                            <span className="text-slate-400"> / </span>
                                            <span>{row.module_name}</span>
                                        </td>
                                        <td className="py-2 px-2 text-right text-slate-600 dark:text-slate-400">{row.total_tests}</td>
                                        <td className="py-2 px-2 text-right text-slate-600 dark:text-slate-400">{row.blocked_count}</td>
                                        <td className="py-2 px-2 text-right">
                                            <span className={`font-semibold ${parseFloat(row.blocked_pct) >= 50 ? 'text-rose-600' : parseFloat(row.blocked_pct) >= 25 ? 'text-amber-600' : 'text-slate-600 dark:text-slate-400'}`}>
                                                {row.blocked_pct}%
                                            </span>
                                        </td>
                                        <td className="py-2 px-2 text-right text-slate-600 dark:text-slate-400">
                                            {parseFloat(row.blocked_hrs) > 0 ? `${row.blocked_hrs}h` : '—'}
                                        </td>
                                        <td className="py-2 pl-2 text-right">
                                            {row.pivot_required ? (
                                                <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded text-xs font-medium">PIVOT</span>
                                            ) : (
                                                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400 rounded text-xs">OK</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-sm text-slate-400 text-center py-4">No blocked test data. Upload results with a module_name column to see breakdown.</p>
                )}

                {(totalBlockedHrs > 0 || totalRetestHrs > 0) && (
                    <div className="flex gap-4 pt-2 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500">
                        <span>Effort at risk: <strong className="text-amber-600">{totalBlockedHrs.toFixed(1)}h</strong></span>
                        <span>Double-work (retests): <strong className="text-rose-600">{totalRetestHrs.toFixed(1)}h</strong></span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import type { ExecutionProgress } from '@/types/governance';

interface GrossNetProgressWidgetProps {
    data: ExecutionProgress[];
}

function ProgressBar({ value, color, label }: { value: number; color: string; label: string }) {
    return (
        <div className="space-y-1">
            <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500">{label}</span>
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{value.toFixed(1)}%</span>
            </div>
            <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-500 ${color}`}
                    style={{ width: `${Math.min(value, 100)}%` }}
                />
            </div>
        </div>
    );
}

export function GrossNetProgressWidget({ data }: GrossNetProgressWidgetProps) {
    if (data.length === 0) {
        return (
            <Card className="shadow-sm">
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">Progress Overview</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-slate-400 text-center py-4">No test execution data available.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    Progress Overview
                    <span className="text-xs font-normal text-slate-400">Gross vs. Net</span>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
                <div className="flex gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-indigo-400 inline-block" />
                        Gross — includes blocked (masks risk)
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
                        Net — Passed + Failed only (true quality)
                    </span>
                </div>

                <div className="space-y-5 divide-y divide-slate-100 dark:divide-slate-800">
                    {data.map(proj => {
                        const gross = parseFloat(proj.gross_progress_pct);
                        const net   = parseFloat(proj.net_progress_pct);
                        const gap   = gross - net;

                        return (
                            <div key={proj.project_id} className="pt-4 first:pt-0 space-y-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{proj.project_name}</p>
                                    {gap > 5 && (
                                        <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded">
                                            {gap.toFixed(1)}% blocked gap
                                        </span>
                                    )}
                                </div>
                                <ProgressBar value={gross} color="bg-indigo-400" label={`Gross Progress (${proj.blocked_count} blocked)`} />
                                <ProgressBar value={net}   color="bg-emerald-500" label={`Net Progress (${proj.passed_count} passed, ${proj.failed_count} failed)`} />
                                <div className="flex justify-between text-xs text-slate-400 pt-1">
                                    <span>{proj.executed_tests} of {proj.total_planned_tests} test cases executed</span>
                                    <span>Exec coverage: {proj.execution_coverage_pct}%</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
}

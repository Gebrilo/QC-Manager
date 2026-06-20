import { type PmProjectDashboard } from '@/lib/api';

export default function TestExecutionSummaryCard({
    summary,
}: { summary: PmProjectDashboard['test_execution_summary'] }) {
    return (
        <div className="rounded-2xl border border-slate-200/60 p-4 dark:border-slate-700/50">
            <div className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Test execution summary</div>
            <div className="grid grid-cols-4 gap-3 text-center text-sm">
                <div>
                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{summary.passed}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Passed</div>
                </div>
                <div>
                    <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">{summary.failed}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Failed</div>
                </div>
                <div>
                    <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{summary.blocked}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Blocked</div>
                </div>
                <div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">{summary.total}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Total</div>
                </div>
            </div>
        </div>
    );
}

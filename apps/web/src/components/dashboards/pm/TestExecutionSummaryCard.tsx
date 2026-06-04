import { type PmProjectDashboard } from '@/lib/api';

export default function TestExecutionSummaryCard({
    summary,
}: { summary: PmProjectDashboard['test_execution_summary'] }) {
    return (
        <div className="rounded-md border p-3">
            <div className="mb-2 text-sm font-medium">Test execution summary</div>
            <div className="grid grid-cols-4 gap-3 text-center text-sm">
                <div>
                    <div className="text-2xl font-semibold text-green-700">{summary.passed}</div>
                    <div className="text-xs text-gray-500">Passed</div>
                </div>
                <div>
                    <div className="text-2xl font-semibold text-red-700">{summary.failed}</div>
                    <div className="text-xs text-gray-500">Failed</div>
                </div>
                <div>
                    <div className="text-2xl font-semibold text-amber-700">{summary.blocked}</div>
                    <div className="text-xs text-gray-500">Blocked</div>
                </div>
                <div>
                    <div className="text-2xl font-semibold">{summary.total}</div>
                    <div className="text-xs text-gray-500">Total</div>
                </div>
            </div>
        </div>
    );
}

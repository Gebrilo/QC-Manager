import React, { useEffect, useState } from 'react';
import type { WorkloadBalance } from '../../types/governance';
import { getWorkloadBalance } from '../../services/governanceApi';

interface Props {
    className?: string;
}

export const WorkloadBalanceWidget: React.FC<Props> = ({ className }) => {
    const [data, setData] = useState<WorkloadBalance[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            try {
                const result = await getWorkloadBalance();
                setData(result);
            } catch (err) {
                console.error(err);
                setError('Failed to load workload balance');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    if (loading) return <div className="animate-pulse h-48 bg-slate-100 dark:bg-slate-800 rounded-xl" />;
    if (error) return <div className="text-red-500 text-sm">{error}</div>;

    return (
        <div className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 ${className}`}>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Workload Balance</h3>
            <div className="space-y-4">
                {data.map((item) => {
                    const total = item.total_tasks || 0;
                    const tested = item.total_tests || 0;
                    // Cap coverage visualization at 100% even if ratio > 100%
                    const ratio = total > 0 ? (tested / total) * 100 : 0;
                    const displayRatio = Math.min(ratio, 100);

                    let statusColor = "bg-slate-200";
                    if (item.balance_status === 'BALANCED') statusColor = "bg-green-500";
                    if (item.balance_status === 'UNDER_TESTED') statusColor = "bg-yellow-500";
                    if (item.balance_status === 'NO_TESTS') statusColor = "bg-red-500";

                    return (
                        <div key={item.project_id} className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="font-medium text-slate-700 dark:text-slate-300">{item.project_name}</span>
                                <span className="text-slate-500">{tested} tests / {total} tasks</span>
                            </div>
                            <div className="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div
                                    className={`h-full ${statusColor} transition-all duration-500`}
                                    style={{ width: `${displayRatio}%` }}
                                />
                            </div>
                        </div>
                    );
                })}
                {data.length === 0 && (
                    <p className="text-sm text-slate-500">No projects data available.</p>
                )}
            </div>
        </div>
    );
};

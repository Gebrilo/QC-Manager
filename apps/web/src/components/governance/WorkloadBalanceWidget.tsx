import React, { useEffect, useState } from 'react';
import type { WorkloadBalance } from '../../types/governance';
import { getWorkloadBalance } from '../../services/governanceApi';

import { InfoTooltip } from '../ui/Tooltip';

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
    if (error) return <div className="text-rose-500 text-sm">{error}</div>;

    return (
        <div className={className}>
            <div className="flex items-center gap-2 mb-4">
                <InfoTooltip
                    content="Compares completed test runs against the number of tasks. A project is balanced at roughly one completed run per task (ratio 0.9–1.1); above 1.1 is over, below 0.9 is under."
                    position="top"
                />
                <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Workload Balance</span>
            </div>
            <div className="space-y-4">
                {data.map((item) => {
                    const total = parseInt(String(item.total_tasks), 10) || 0;
                    const runs = parseInt(String(item.total_tests), 10) || 0;
                    // runs-per-task as a percentage; cap the bar fill at 100% even when over-tested
                    const ratio = total > 0 ? (runs / total) * 100 : 0;
                    const displayRatio = Math.min(ratio, 100);

                    let statusColor = "bg-slate-200";
                    if (item.balance_status === 'BALANCED') statusColor = "bg-emerald-500";
                    if (item.balance_status === 'OVER_TESTED') statusColor = "bg-sky-500";
                    if (item.balance_status === 'UNDER_TESTED') statusColor = "bg-amber-500";
                    if (item.balance_status === 'NO_TESTS') statusColor = "bg-rose-500";

                    return (
                        <div key={item.project_id} className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="font-medium text-slate-700 dark:text-slate-300">{item.project_name}</span>
                                <span className="text-slate-500">{runs} run{runs !== 1 ? 's' : ''} / {total} task{total !== 1 ? 's' : ''}</span>
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

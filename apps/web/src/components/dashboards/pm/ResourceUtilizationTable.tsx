import { type PmProjectResource } from '@/lib/api';

export default function ResourceUtilizationTable({ resources }: { resources: PmProjectResource[] }) {
    if (resources.length === 0) {
        return <div className="rounded-xl bg-slate-50/80 p-4 text-sm text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">No active resources on this project.</div>;
    }
    return (
        <div className="overflow-hidden rounded-2xl border border-slate-200/60 dark:border-slate-700/50">
            <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900 dark:border-slate-800 dark:text-white">Resource utilization</div>
            <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm dark:divide-slate-800">
                <thead className="bg-slate-50/80 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:bg-slate-900/40">
                    <tr>
                        <th className="px-3 py-2">Resource</th>
                        <th className="px-3 py-2">Capacity (hrs)</th>
                        <th className="px-3 py-2">Allocated</th>
                        <th className="px-3 py-2">Utilization</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {resources.map(r => (
                        <tr key={r.resource_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                            <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">{r.name}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{r.capacity_hrs}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{r.allocated_hrs}</td>
                            <td className={`px-3 py-2 font-medium tabular-nums ${r.utilization_pct > 100 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-200'}`}>
                                {r.utilization_pct}%
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            </div>
        </div>
    );
}

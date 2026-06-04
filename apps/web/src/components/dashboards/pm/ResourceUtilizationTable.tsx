import { type PmProjectResource } from '@/lib/api';

export default function ResourceUtilizationTable({ resources }: { resources: PmProjectResource[] }) {
    if (resources.length === 0) {
        return <div className="text-sm text-gray-500">No active resources on this project.</div>;
    }
    return (
        <div className="overflow-x-auto">
            <div className="mb-2 text-sm font-medium">Resource utilization</div>
            <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                        <th className="px-3 py-2">Resource</th>
                        <th className="px-3 py-2">Capacity (hrs)</th>
                        <th className="px-3 py-2">Allocated</th>
                        <th className="px-3 py-2">Utilization</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {resources.map(r => (
                        <tr key={r.resource_id}>
                            <td className="px-3 py-2">{r.name}</td>
                            <td className="px-3 py-2">{r.capacity_hrs}</td>
                            <td className="px-3 py-2">{r.allocated_hrs}</td>
                            <td className={`px-3 py-2 ${r.utilization_pct > 100 ? 'text-red-700 font-medium' : ''}`}>
                                {r.utilization_pct}%
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

import { type PmCrossTeamDependency } from '@/lib/api';

export default function CrossTeamDependencyMatrix({ deps }: { deps: PmCrossTeamDependency[] }) {
    if (deps.length === 0) {
        return <div className="text-sm text-gray-500">No cross-team dependencies detected.</div>;
    }
    return (
        <div>
            <div className="mb-2 text-sm font-medium">Cross-team dependencies (task → test case)</div>
            <ul className="space-y-1 text-sm">
                {deps.map(d => (
                    <li key={`${d.from_team}-${d.to_team}`}>
                        <code className="rounded bg-gray-100 px-1.5 py-0.5">{d.from_team}</code>
                        <span className="mx-2">→</span>
                        <code className="rounded bg-gray-100 px-1.5 py-0.5">{d.to_team}</code>
                        <span className="ml-3 text-gray-600">
                            {d.artifact_count} link{d.artifact_count === 1 ? '' : 's'}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

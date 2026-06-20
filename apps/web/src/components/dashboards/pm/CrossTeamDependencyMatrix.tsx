import { type PmCrossTeamDependency } from '@/lib/api';

export default function CrossTeamDependencyMatrix({ deps }: { deps: PmCrossTeamDependency[] }) {
    if (deps.length === 0) {
        return <div className="rounded-xl bg-slate-50/80 p-4 text-sm text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">No cross-team dependencies detected.</div>;
    }
    return (
        <div className="rounded-2xl border border-slate-200/60 p-4 dark:border-slate-700/50">
            <div className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Cross-team dependencies (task → test case)</div>
            <ul className="space-y-1 text-sm">
                {deps.map(d => (
                    <li key={`${d.from_team}-${d.to_team}`} className="flex flex-wrap items-center gap-2 rounded-xl px-2 py-1.5 text-slate-700 dark:text-slate-300">
                        <code className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">{d.from_team}</code>
                        <span className="text-slate-400">→</span>
                        <code className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">{d.to_team}</code>
                        <span className="text-slate-500 dark:text-slate-400">
                            {d.artifact_count} link{d.artifact_count === 1 ? '' : 's'}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

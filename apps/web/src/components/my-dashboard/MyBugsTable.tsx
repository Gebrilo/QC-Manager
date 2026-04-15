import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { InfoTooltip } from '@/components/ui/Tooltip';
import { MeDashboard } from '@/lib/api';

const SEVERITY_COLORS: Record<string, string> = {
    critical: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400',
    high:     'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-400',
    medium:   'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-400',
    low:      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400',
};

const STATUS_COLORS: Record<string, string> = {
    Open:          'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400',
    'In Progress': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-400',
    Resolved:      'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400',
    Closed:        'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    Reopened:      'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400',
};

interface MyBugsTableProps {
    bugs: MeDashboard['submitted_bugs'];
}

export function MyBugsTable({ bugs }: MyBugsTableProps) {
    return (
        <Card className="shadow-md hover:shadow-lg transition-shadow duration-300">
            <CardHeader className="flex flex-row items-center gap-2">
                <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Bugs I Submitted
                </CardTitle>
                <InfoTooltip content="Bugs synced from Tuleap where you are the submitter." position="right" />
            </CardHeader>
            <CardContent>
                {bugs.length === 0 ? (
                    <p className="text-sm text-slate-400 py-4 text-center">No bugs submitted yet.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 w-28">ID</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">Title</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 w-28">Severity</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 w-32">Status</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 w-36">Project</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 w-28">Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {bugs.map(bug => (
                                    <tr key={bug.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{bug.bug_id}</td>
                                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-white line-clamp-1">{bug.title}</td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${SEVERITY_COLORS[bug.severity] || SEVERITY_COLORS.low}`}>
                                                {bug.severity}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[bug.status] || STATUS_COLORS.Open}`}>
                                                {bug.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{bug.project_name || '—'}</td>
                                        <td className="px-4 py-3 text-slate-400 text-xs">
                                            {bug.creation_date ? new Date(bug.creation_date).toLocaleDateString() : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

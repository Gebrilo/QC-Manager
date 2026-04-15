import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { InfoTooltip } from '@/components/ui/Tooltip';
import { MeDashboard } from '@/lib/api';

interface TasksByProjectTableProps {
    tasksByProject: MeDashboard['tasks_by_project'];
}

export function TasksByProjectTable({ tasksByProject }: TasksByProjectTableProps) {
    return (
        <Card className="shadow-md hover:shadow-lg transition-shadow duration-300 md:col-span-2">
            <CardHeader className="flex flex-row items-center gap-2">
                <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Tasks per Project
                </CardTitle>
                <InfoTooltip content="Breakdown of your assigned tasks across each project." position="right" />
            </CardHeader>
            <CardContent>
                {tasksByProject.length === 0 ? (
                    <p className="text-sm text-slate-400 py-4 text-center">No project tasks assigned yet.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 dark:border-slate-800">
                                    <th className="text-left pb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Project</th>
                                    <th className="text-right pb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Total</th>
                                    <th className="text-right pb-2 text-xs font-semibold text-indigo-500">In Progress</th>
                                    <th className="text-right pb-2 text-xs font-semibold text-slate-400">Backlog</th>
                                    <th className="text-right pb-2 text-xs font-semibold text-emerald-500">Done</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {tasksByProject.map(row => (
                                    <tr key={row.project_id || row.project_name} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                        <td className="py-2.5 font-medium text-slate-800 dark:text-slate-200">{row.project_name}</td>
                                        <td className="py-2.5 text-right font-semibold text-slate-700 dark:text-slate-300">{row.total}</td>
                                        <td className="py-2.5 text-right text-indigo-600 dark:text-indigo-400">{row.in_progress}</td>
                                        <td className="py-2.5 text-right text-slate-400">{row.backlog}</td>
                                        <td className="py-2.5 text-right text-emerald-600 dark:text-emerald-400">{row.done}</td>
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

import { type PmProjectDashboard } from '@/lib/api';
import { AlertTriangle, CheckCircle2, Clock, ListTodo } from 'lucide-react';
import StatusBreakdownChart from './StatusBreakdownChart';
import BugSeverityChart from './BugSeverityChart';
import ResourceUtilizationTable from './ResourceUtilizationTable';
import CrossTeamDependencyMatrix from './CrossTeamDependencyMatrix';
import AlertCards from './AlertCards';
import TestExecutionSummaryCard from './TestExecutionSummaryCard';

export default function ProjectCard({ project }: { project: PmProjectDashboard }) {
    const taskCount = Object.values(project.tasks_by_status).reduce((sum, value) => sum + value, 0);
    const doneCount = project.tasks_by_status.Done ?? project.tasks_by_status.done ?? 0;

    return (
        <section className="glass-card rounded-2xl p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{project.project_name}</h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Workload, quality, and cross-team signals for this project.
                    </p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                    <div className="rounded-xl bg-slate-50/80 px-3 py-2 text-sm text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">
                        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            <ListTodo className="h-3.5 w-3.5" /> Tasks
                        </span>
                        <span className="mt-0.5 block text-lg font-bold text-slate-900 dark:text-white">{taskCount}</span>
                    </div>
                    <div className="rounded-xl bg-slate-50/80 px-3 py-2 text-sm text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">
                        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Done
                        </span>
                        <span className="mt-0.5 block text-lg font-bold text-slate-900 dark:text-white">{doneCount}</span>
                    </div>
                    <div className="rounded-xl bg-slate-50/80 px-3 py-2 text-sm text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">
                        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            <Clock className="h-3.5 w-3.5" /> Workload
                        </span>
                        <span className="mt-0.5 block text-lg font-bold text-slate-900 dark:text-white">{Number(project.total_workload).toFixed(1)}h</span>
                    </div>
                    <div className="rounded-xl bg-slate-50/80 px-3 py-2 text-sm text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">
                        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            <AlertTriangle className="h-3.5 w-3.5" /> Alerts
                        </span>
                        <span className="mt-0.5 block text-lg font-bold text-slate-900 dark:text-white">{project.blocked_count + project.overdue_count}</span>
                    </div>
                </div>
            </div>
            <AlertCards blocked={project.blocked_count} overdue={project.overdue_count} />
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <StatusBreakdownChart data={project.tasks_by_status} title="Tasks by status" />
                <BugSeverityChart data={project.bugs_by_severity} />
            </div>
            <div className="mt-4">
                <TestExecutionSummaryCard summary={project.test_execution_summary} />
            </div>
            <div className="mt-4">
                <ResourceUtilizationTable resources={project.resources} />
            </div>
            <div className="mt-4">
                <CrossTeamDependencyMatrix deps={project.cross_team_dependencies} />
            </div>
        </section>
    );
}

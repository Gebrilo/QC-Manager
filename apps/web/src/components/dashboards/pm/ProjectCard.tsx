import { type PmProjectDashboard } from '@/lib/api';
import StatusBreakdownChart from './StatusBreakdownChart';
import BugSeverityChart from './BugSeverityChart';
import ResourceUtilizationTable from './ResourceUtilizationTable';
import CrossTeamDependencyMatrix from './CrossTeamDependencyMatrix';
import AlertCards from './AlertCards';
import TestExecutionSummaryCard from './TestExecutionSummaryCard';

export default function ProjectCard({ project }: { project: PmProjectDashboard }) {
    return (
        <section className="rounded-lg border bg-white p-5 shadow-sm">
            <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-medium">{project.project_name}</h2>
                <div className="text-sm text-gray-500">
                    Total workload: <b>{project.total_workload}</b>
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

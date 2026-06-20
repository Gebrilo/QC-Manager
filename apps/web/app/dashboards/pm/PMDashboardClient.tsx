'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Briefcase, CheckCircle2, Clock, FolderKanban } from 'lucide-react';
import { pmDashboardApi, type PmProjectDashboard } from '@/lib/api';
import ProjectCard from '@/components/dashboards/pm/ProjectCard';
import { StatCard } from '@/components/ui/StatCard';

export default function PMDashboardClient() {
    const [projects, setProjects] = useState<PmProjectDashboard[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        pmDashboardApi.get()
            .then(r => setProjects(r.projects))
            .catch(e => setError(e?.message || 'Failed to load PM dashboard'));
    }, []);

    if (error) {
        return (
            <div className="glass-card rounded-2xl p-8 text-center">
                <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-rose-500" />
                <p className="text-base font-semibold text-rose-700 dark:text-rose-300">Failed to load PM dashboard</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{error}</p>
            </div>
        );
    }
    if (projects === null) {
        return (
            <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="glass-card h-28 animate-pulse rounded-xl" />
                    ))}
                </div>
                <div className="glass-card h-96 animate-pulse rounded-2xl" />
            </div>
        );
    }
    if (projects.length === 0) {
        return (
            <div className="glass-card rounded-2xl p-8 text-center">
                <Briefcase className="mx-auto mb-3 h-10 w-10 text-slate-300 dark:text-slate-600" />
                <p className="text-base font-semibold text-slate-900 dark:text-white">No active PM assignments</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    You are not a project manager on any active project.
                </p>
            </div>
        );
    }

    const totals = projects.reduce((acc, project) => {
        const taskCount = Object.values(project.tasks_by_status).reduce((sum, value) => sum + value, 0);
        acc.tasks += taskCount;
        acc.workload += Number(project.total_workload || 0);
        acc.blocked += Number(project.blocked_count || 0);
        acc.overdue += Number(project.overdue_count || 0);
        return acc;
    }, { tasks: 0, workload: 0, blocked: 0, overdue: 0 });

    return (
        <div className="space-y-6 animate-in fade-in duration-700">
            <header className="glass-card rounded-2xl p-5">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">PM Dashboard</h1>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                    Cross-team workload, quality, and capacity for projects you manage.
                </p>
            </header>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <StatCard
                    title="Managed Projects"
                    value={projects.length}
                    subtitle="active projects"
                    icon={<FolderKanban className="h-5 w-5" />}
                />
                <StatCard
                    title="Project Tasks"
                    value={totals.tasks}
                    subtitle={`${totals.workload.toFixed(1)}h workload`}
                    icon={<CheckCircle2 className="h-5 w-5" />}
                />
                <StatCard
                    title="Blocked"
                    value={totals.blocked}
                    subtitle={totals.blocked ? 'need attention' : 'nothing blocked'}
                    icon={<AlertTriangle className="h-5 w-5" />}
                />
                <StatCard
                    title="Overdue"
                    value={totals.overdue}
                    subtitle={totals.overdue ? 'past due' : 'on schedule'}
                    icon={<Clock className="h-5 w-5" />}
                />
            </div>

            {projects.map(p => <ProjectCard key={p.project_id} project={p} />)}
        </div>
    );
}

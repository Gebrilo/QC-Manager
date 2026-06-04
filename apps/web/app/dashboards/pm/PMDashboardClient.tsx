'use client';

import { useEffect, useState } from 'react';
import { pmDashboardApi, type PmProjectDashboard } from '@/lib/api';
import ProjectCard from '@/components/dashboards/pm/ProjectCard';

export default function PMDashboardClient() {
    const [projects, setProjects] = useState<PmProjectDashboard[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        pmDashboardApi.get()
            .then(r => setProjects(r.projects))
            .catch(e => setError(e?.message || 'Failed to load PM dashboard'));
    }, []);

    if (error) return <div className="p-6 text-red-600">{error}</div>;
    if (projects === null) return <div className="p-6">Loading…</div>;
    if (projects.length === 0) {
        return (
            <div className="p-6 text-gray-600">
                You are not a project manager on any active project.
            </div>
        );
    }

    return (
        <div className="space-y-6 p-6">
            <header>
                <h1 className="text-2xl font-semibold">PM Dashboard</h1>
                <p className="text-sm text-gray-500">
                    Cross-team workload, quality, and capacity for projects you manage.
                </p>
            </header>
            {projects.map(p => <ProjectCard key={p.project_id} project={p} />)}
        </div>
    );
}

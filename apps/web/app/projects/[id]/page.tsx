'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/api';
import { Project } from '@/types';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';

export default function ProjectDetailPage() {
    const params = useParams();
    const id = (params?.id as string) || '';
    const router = useRouter();
    const [project, setProject] = useState<Project | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function load() {
            try {
                const data = await fetchApi<Project>(`/projects/${id}`);
                setProject(data);
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        }
        if (id) load();
    }, [id]);

    const getLogo = (projectId: string) => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem(`project_logo_${projectId}`);
        }
        return null;
    };

    if (isLoading) return <div className="p-10 text-center">Loading...</div>;
    if (!project) return <div className="p-10 text-center">Project not found</div>;

    const handleDelete = async () => {
        if (!confirm(`Are you sure you want to delete project "${project.project_name}"? This action will archive the project.`)) {
            return;
        }
        try {
            await fetchApi(`/projects/${project.id}`, { method: 'DELETE' });
            alert('Project deleted successfully');
            router.push('/projects');
        } catch (err: any) {
            alert(`Failed to delete project: ${err.message}`);
        }
    };

    const logo = getLogo(project.id);
    // Formula for completion status based on percentage
    const isCompleted = (project.overall_completion_pct || 0) >= 100;

    return (
        <div className="max-w-5xl mx-auto py-8 px-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" onClick={() => router.back()}>
                        ← Back
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                            {project.project_name}
                            <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${isCompleted ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' :
                                project.dynamic_status === 'At Risk' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400' :
                                    'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400'
                                }`}>
                                {project.dynamic_status || 'Active'}
                            </span>
                        </h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{project.project_id}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Link href={`/projects/${project.id}/edit`}>
                        <Button variant="outline">Edit Project</Button>
                    </Link>
                    <Button
                        variant="outline"
                        onClick={handleDelete}
                        className="text-rose-600 border-rose-300 hover:bg-rose-50 dark:text-rose-400 dark:border-rose-800 dark:hover:bg-rose-900/20"
                    >
                        Delete
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Main Info */}
                <div className="md:col-span-2 space-y-6">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                        <div className="flex items-start gap-4 mb-4">
                            <div className="w-16 h-16 rounded-xl bg-slate-100 dark:bg-slate-800 p-1 shrink-0 border border-slate-200 dark:border-slate-700">
                                {logo ? (
                                    <img src={logo} alt={project.project_name} className="w-full h-full object-cover rounded-lg" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-indigo-500 font-bold bg-white dark:bg-slate-900 rounded-lg">
                                        {project.project_name?.charAt(0) || '?'}
                                    </div>
                                )}
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Description</h3>
                                <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                                    {project.description || 'No description provided.'}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Metrics</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            <StatBox label="Total Weight" value={project.total_weight} />
                            <StatBox label="Priority" value={project.priority} />
                            <StatBox label="Start Date" value={project.start_date ? new Date(project.start_date).toLocaleDateString() : '-'} />
                            <StatBox label="Target Date" value={project.target_date ? new Date(project.target_date).toLocaleDateString() : '-'} />
                        </div>
                    </div>
                </div>

                {/* Sidebar - Quick Stats from Backend Aggregation */}
                <div className="space-y-6">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Progress</h3>
                        <div className="space-y-4">
                            <StatRow label="Est Hours" value={(Number(project.task_hrs_est) || 0).toFixed(1)} />
                            <StatRow label="Actual Hours" value={(Number(project.task_hrs_actual) || 0).toFixed(1)} />
                            <StatRow label="Tasks Done" value={`${project.tasks_done_count || 0} / ${project.tasks_total_count || 0}`} />
                            <div className="pt-2">
                                <div className="flex justify-between text-xs mb-1">
                                    <span>Completion</span>
                                    <span>{project.overall_completion_pct || 0}%</span>
                                </div>
                                <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-indigo-500"
                                        style={{ width: `${project.overall_completion_pct || 0}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatBox({ label, value }: { label: string, value: string | number }) {
    return (
        <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">{label}</span>
            <span className="text-sm font-semibold text-slate-900 dark:text-white">{value}</span>
        </div>
    );
}

function StatRow({ label, value }: { label: string, value: string | number }) {
    return (
        <div className="flex justify-between items-center">
            <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
            <span className="text-sm font-medium text-slate-900 dark:text-white">{value}</span>
        </div>
    );
}

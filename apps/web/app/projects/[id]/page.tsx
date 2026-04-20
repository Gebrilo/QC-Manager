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
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

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

    if (isLoading) return (
        <div className="max-w-5xl mx-auto py-8 px-4 animate-pulse space-y-6">
            <div className="flex items-center gap-4">
                <div className="h-9 w-20 bg-slate-200 dark:bg-slate-700 rounded-lg" />
                <div className="space-y-2">
                    <div className="h-7 w-64 bg-slate-200 dark:bg-slate-700 rounded" />
                    <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-4">
                    <div className="h-40 bg-slate-200 dark:bg-slate-700 rounded-2xl" />
                    <div className="h-28 bg-slate-200 dark:bg-slate-700 rounded-2xl" />
                </div>
                <div className="h-48 bg-slate-200 dark:bg-slate-700 rounded-2xl" />
            </div>
        </div>
    );

    if (!project) return (
        <div className="max-w-5xl mx-auto py-8 px-4">
            <div className="text-center py-20">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                </div>
                <p className="text-lg font-medium text-slate-700 dark:text-slate-300">Project not found</p>
                <button onClick={() => router.push('/projects')} className="mt-4 text-sm text-indigo-600 hover:text-indigo-800">← Back to Projects</button>
            </div>
        </div>
    );

    const handleDelete = () => {
        setDeleteError(null);
        setShowDeleteModal(true);
    };

    const confirmDelete = async () => {
        setIsDeleting(true);
        setDeleteError(null);
        try {
            await fetchApi(`/projects/${project.id}`, { method: 'DELETE' });
            router.push('/projects');
        } catch (err: any) {
            setDeleteError(err.message);
            setIsDeleting(false);
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
                    <Link href={`/projects/${project.id}/quality`}>
                        <Button variant="outline" className="text-indigo-600 border-indigo-300 hover:bg-indigo-50 dark:text-indigo-400 dark:border-indigo-800 dark:hover:bg-indigo-900/20">
                            Quality
                        </Button>
                    </Link>
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

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-sm w-full p-6 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center flex-shrink-0">
                                <svg className="w-5 h-5 text-rose-600 dark:text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-base font-semibold text-slate-900 dark:text-white">Archive Project</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                                    Archive <span className="font-medium text-slate-700 dark:text-slate-200">{project.project_name}</span>? This cannot be undone.
                                </p>
                            </div>
                        </div>
                        {deleteError && (
                            <p className="text-sm text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 rounded-lg">{deleteError}</p>
                        )}
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => { setShowDeleteModal(false); setDeleteError(null); }}
                                disabled={isDeleting}
                                className="px-4 py-2 text-sm font-medium rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDelete}
                                disabled={isDeleting}
                                className="px-4 py-2 text-sm font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition-colors disabled:opacity-50"
                            >
                                {isDeleting ? 'Archiving...' : 'Archive Project'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
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

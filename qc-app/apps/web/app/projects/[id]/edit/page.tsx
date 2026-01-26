'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/api';
import ProjectForm from '@/components/projects/ProjectForm';
import { Project } from '@/types';

export default function EditProjectPage() {
    const params = useParams();
    const id = (params?.id as string) || '';
    const router = useRouter();
    const [project, setProject] = useState<Project | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function load() {
            try {
                // Fetching single project from the LIST or ID?
                // Backend "GET /projects" returns ALL. "GET /projects/:id" returns ONE.
                const data = await fetchApi<Project>(`/projects/${id}`);
                setProject(data);
            } catch (err) {
                console.error('Failed to load project:', err);
            } finally {
                setIsLoading(false);
            }
        }
        if (id) load();
    }, [id]);

    const handleSuccess = () => {
        router.push('/projects');
        router.refresh();
    };

    if (isLoading) return <div className="p-10 text-center">Loading...</div>;
    if (!project) return <div className="p-10 text-center">Project not found</div>;

    return (
        <div className="max-w-3xl mx-auto py-8 px-4">
            <header className="mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Edit Project</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Update project metadata.</p>
                </div>
                <button
                    onClick={() => router.back()}
                    className="text-sm text-slate-500 hover:text-indigo-600 underline"
                >
                    Cancel
                </button>
            </header>
            <ProjectForm initialData={project} onSuccess={handleSuccess} isEdit={true} />
        </div>
    );
}

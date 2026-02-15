'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/api';
import { Task, Project, Resource } from '@/types';
import { TaskForm } from '@/components/tasks/TaskForm';
import { useAuth } from '@/components/providers/AuthProvider';

export default function EditTaskPage() {
    const params = useParams();
    const id = (params?.id as string) || '';
    const router = useRouter();
    const { hasPermission, loading: authLoading } = useAuth();
    const [data, setData] = useState<{ task: Task; projects: Project[]; resources: Resource[] } | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && !hasPermission('action:tasks:edit')) {
            router.replace(`/tasks/${id}`);
        }
    }, [authLoading, hasPermission, router, id]);

    useEffect(() => {
        async function load() {
            try {
                const [taskData, projectsData, resourcesData] = await Promise.all([
                    fetchApi<Task>(`/tasks/${id}`),
                    fetchApi<Project[]>('/projects'),
                    fetchApi<Resource[]>('/resources')
                ]);
                setData({ task: taskData, projects: projectsData, resources: resourcesData });
            } catch (err) {
                console.error('Failed to load task data:', err);
            } finally {
                setIsLoading(false);
            }
        }
        if (id) load();
    }, [id]);

    if (authLoading || !hasPermission('action:tasks:edit')) return null;
    if (isLoading) return <div className="p-10 text-center">Loading...</div>;
    if (!data) return <div className="p-10 text-center">Task not found</div>;

    return (
        <div className="max-w-3xl mx-auto py-8 px-4">
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Edit Task</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Update task details, status, or assignment.</p>
                </div>
                <button onClick={() => router.back()} className="text-sm text-slate-500 hover:text-indigo-600 underline">
                    Cancel
                </button>
            </div>

            <TaskForm
                initialData={data.task}
                projects={data.projects}
                resources={data.resources}
                isEdit={true}
            />
        </div>
    );
}

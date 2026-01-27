'use client';

import { useEffect, useState } from 'react';
import { TaskForm } from '@/components/tasks/TaskForm';
import { fetchApi } from '@/lib/api';
import { Project, Resource } from '@/types';
import { Spinner } from '@/components/ui/Spinner';

export default function CreateTaskPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [resources, setResources] = useState<Resource[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function loadData() {
            try {
                const [projData, resData] = await Promise.all([
                    fetchApi<Project[]>('/projects'),
                    fetchApi<Resource[]>('/resources')
                ]);
                setProjects(projData);
                setResources(resData);
            } catch (err) {
                console.error('Failed to load form data', err);
            } finally {
                setIsLoading(false);
            }
        }
        loadData();
    }, []);

    if (isLoading) return <div className="flex justify-center p-8"><Spinner size="lg" /></div>;

    return (
        <div className="max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">Create New Task</h1>
            <TaskForm projects={projects} resources={resources} />
        </div>
    );
}

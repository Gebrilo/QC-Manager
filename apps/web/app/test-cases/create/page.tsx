'use client';

import { useState, useEffect } from 'react';
import { TestCaseForm } from '@/components/test-cases/TestCaseForm';
import { fetchApi } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';

interface ProjectOption {
    id: string;
    project_name: string;
}

export default function CreateTestCasePage() {
    const [projects, setProjects] = useState<ProjectOption[]>([]);
    const [selectedProject, setSelectedProject] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchApi('/projects?status=active&limit=100')
            .then((res: any) => {
                const data = Array.isArray(res) ? res : res?.data || [];
                setProjects(data.map((p: any) => ({ id: p.id, project_name: p.project_name || p.name })));
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Spinner size="lg" />
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto py-8 px-4">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Create Test Case</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">Define a new test case for your project.</p>

            <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Project *</label>
                <select
                    value={selectedProject}
                    onChange={(e) => setSelectedProject(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                >
                    <option value="">Select a project...</option>
                    {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.project_name}</option>
                    ))}
                </select>
            </div>

            {selectedProject ? (
                <TestCaseForm projectId={selectedProject} />
            ) : (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
                    <p className="text-gray-600 dark:text-gray-400">Please select a project to continue.</p>
                </div>
            )}
        </div>
    );
}

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { testSuitesApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { FormSection } from '@/components/ui/FormSection';
import { Spinner } from '@/components/ui/Spinner';
import { fetchApi } from '@/lib/api';

interface ProjectOption {
    id: string;
    project_name: string;
}

export default function CreateTestSuitePage() {
    const router = useRouter();
    const [projects, setProjects] = useState<ProjectOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [projectId, setProjectId] = useState('');
    const [status, setStatus] = useState('draft');

    useEffect(() => {
        fetchApi('/projects?status=active&limit=100')
            .then((res: any) => {
                const data = Array.isArray(res) ? res : res?.data || [];
                setProjects(data.map((p: any) => ({ id: p.id, project_name: p.project_name || p.name })));
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) { setError('Name is required'); return; }
        if (!projectId) { setError('Project is required'); return; }

        setSubmitting(true);
        setError(null);
        try {
            await testSuitesApi.create({
                name: name.trim(),
                description: description.trim() || undefined,
                project_id: projectId,
                status: status as 'draft' | 'active' | 'archived',
            });
            router.push('/test/suites');
            router.refresh();
        } catch (err: any) {
            setError(err.message || 'Failed to create test suite');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;
    }

    return (
        <div className="max-w-3xl mx-auto py-8 px-4">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Create Test Suite</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">Organize test cases into a reusable suite.</p>

            <form onSubmit={handleSubmit} className="space-y-6">
                <ErrorBanner message={error} />

                <FormSection title="General">
                    <Input
                        label="Name *"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Login Regression Suite"
                        className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                    />
                    <Select
                        label="Project *"
                        value={projectId}
                        onChange={(e) => setProjectId(e.target.value)}
                        options={[{ value: '', label: 'Select a project...' }, ...projects.map(p => ({ value: p.id, label: p.project_name }))]}
                        className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                    />
                    <Select
                        label="Status"
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        options={[
                            { value: 'draft', label: 'Draft' },
                            { value: 'active', label: 'Active' },
                            { value: 'archived', label: 'Archived' },
                        ]}
                        className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                    />
                </FormSection>

                <FormSection title="Details">
                    <div className="md:col-span-2">
                        <Textarea
                            label="Description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Describe the purpose and scope of this test suite..."
                        />
                    </div>
                </FormSection>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                    <Button type="button" variant="outline" onClick={() => router.back()} className="w-24 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300">Cancel</Button>
                    <Button type="submit" disabled={submitting} className="w-40 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-500/30 border-none">
                        {submitting ? 'Creating...' : 'Create Suite'}
                    </Button>
                </div>
            </form>
        </div>
    );
}
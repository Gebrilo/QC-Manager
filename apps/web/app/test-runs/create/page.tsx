'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { testSuitesApi, testRunsApi } from '@/lib/api';
import { fetchApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Spinner } from '@/components/ui/Spinner';

interface ProjectOption {
    id: string;
    project_name: string;
}

interface SuiteOption {
    id: string;
    suite_id: string;
    name: string;
}

export default function CreateTestRunPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const preselectedSuiteId = searchParams.get('suite_id') || '';

    const [projects, setProjects] = useState<ProjectOption[]>([]);
    const [suites, setSuites] = useState<SuiteOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [name, setName] = useState('');
    const [projectId, setProjectId] = useState('');
    const [suiteId, setSuiteId] = useState(preselectedSuiteId);
    const [environment, setEnvironment] = useState('');
    const [versionTag, setVersionTag] = useState('');

    useEffect(() => {
        Promise.all([
            fetchApi('/projects?status=active&limit=100'),
            testSuitesApi.list({ status: 'active', limit: 200 }),
        ])
            .then(([projRes, suiteRes]) => {
                const projData = projRes as any;
                const data = projData?.data || projData || [];
                setProjects(Array.isArray(data) ? data.map((p: any) => ({ id: p.id, project_name: p.project_name || p.name })) : []);

                const suiteData = (suiteRes as any)?.data || suiteRes || [];
                setSuites(Array.isArray(suiteData) ? suiteData.map((s: any) => ({ id: s.id, suite_id: s.suite_id, name: s.name })) : []);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    // Auto-fill project when suite is selected
    useEffect(() => {
        if (suiteId && suites.length > 0 && !projectId) {
            // Try to find the suite and auto-select its project
            testSuitesApi.get(suiteId).then((suite: any) => {
                if (suite?.project_id) {
                    setProjectId(suite.project_id);
                }
                if (suite?.name && !name) {
                    setName(`Run: ${suite.name}`);
                }
            }).catch(() => {});
        }
    }, [suiteId, suites]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) { setError('Name is required'); return; }
        if (!projectId) { setError('Project is required'); return; }
        if (!suiteId) { setError('Test suite is required'); return; }

        setSubmitting(true);
        setError(null);
        try {
            const result = await testRunsApi.createFromSuite({
                suite_id: suiteId,
                name: name.trim(),
                project_id: projectId,
                environment: environment.trim() || undefined,
                version_tag: versionTag.trim() || undefined,
            });
            router.push(`/test/runs/${(result as any).id}`);
            router.refresh();
        } catch (err: any) {
            setError(err.message || 'Failed to create test run');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;
    }

    return (
        <div className="max-w-3xl mx-auto py-8 px-4">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Create Test Run from Suite</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">Launch a test run from an existing test suite.</p>

            <form onSubmit={handleSubmit} className="space-y-6">
                <ErrorBanner message={error} />

                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">General</h3>

                    <Select
                        label="Test Suite *"
                        value={suiteId}
                        onChange={(e) => setSuiteId(e.target.value)}
                        options={[
                            { value: '', label: 'Select a suite...' },
                            ...suites.map(s => ({ value: s.id, label: `${s.suite_id} - ${s.name}` }))
                        ]}
                        className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                    />

                    <Input
                        label="Run Name *"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Sprint 5 Regression"
                        className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                    />

                    <Select
                        label="Project *"
                        value={projectId}
                        onChange={(e) => setProjectId(e.target.value)}
                        options={[
                            { value: '', label: 'Select a project...' },
                            ...projects.map(p => ({ value: p.id, label: p.project_name }))
                        ]}
                        className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                    />
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Configuration (Optional)</h3>

                    <Input
                        label="Environment"
                        value={environment}
                        onChange={(e) => setEnvironment(e.target.value)}
                        placeholder="e.g. Staging, QA, Production"
                        className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                    />

                    <Input
                        label="Version Tag"
                        value={versionTag}
                        onChange={(e) => setVersionTag(e.target.value)}
                        placeholder="e.g. v2.3.1"
                        className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                    />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                    <Button type="button" variant="outline" onClick={() => router.back()} className="w-24 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300">Cancel</Button>
                    <Button type="submit" disabled={submitting || !suiteId} className="w-40 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-500/30 border-none">
                        {submitting ? 'Creating...' : 'Start Test Run'}
                    </Button>
                </div>
            </form>
        </div>
    );
}
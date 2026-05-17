'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { bugsApi, type Bug } from '@/lib/api';
import { BugForm } from '@/components/bugs/BugForm';

export default function EditBugPage() {
    const params = useParams();
    const id = (params?.id as string) || '';
    const [bug, setBug] = useState<Bug | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function load() {
            try {
                const response = await bugsApi.get(id);
                setBug(response.data);
            } catch (err: any) {
                setError(err.message || 'Failed to load bug');
            } finally {
                setIsLoading(false);
            }
        }
        if (id) load();
    }, [id]);

    if (isLoading) return (
        <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
            <div className="h-8 w-48 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
            <div className="h-64 bg-slate-200 dark:bg-slate-700 rounded-2xl animate-pulse" />
        </div>
    );

    if (error) return (
        <div className="max-w-3xl mx-auto py-8 px-4">
            <div className="glass-card rounded-2xl p-6 text-center">
                <p className="text-rose-600 dark:text-rose-400">{error}</p>
            </div>
        </div>
    );

    if (!bug) return null;

    const initialData = {
        title: bug.title || '',
        steps_to_reproduce: bug.description || '',
        status: bug.status || 'New',
        assigned_to: bug.assigned_to || '',
        severity: bug.severity || 'medium',
        service_name: bug.service_name || '',
        environment: bug.environment || 'DEV',
        description: '',
        cc: '',
        dev_fix_description: '',
        qc_verification_notes: '',
        close_date: '',
    };

    return (
        <div className="max-w-3xl mx-auto py-8 px-4">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
                Edit Bug {bug.bug_id || `#${id.slice(0, 8)}`}
            </h1>
            <BugForm
                initialData={initialData}
                isEdit
                artifactId={bug.tuleap_artifact_id ? String(bug.tuleap_artifact_id) : undefined}
                bugUUID={id}
                projectId={bug.project_id}
            />
        </div>
    );
}

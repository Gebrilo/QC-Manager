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
        <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
            <div className="flex items-center gap-4">
                <div className="h-6 w-6 bg-slate-200 dark:bg-slate-700 rounded-full animate-pulse" />
                <div className="space-y-2">
                    <div className="h-4 w-40 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                    <div className="h-8 w-96 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                </div>
            </div>
            <div className="grid grid-cols-12 gap-6">
                <div className="col-span-2 space-y-2">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-9 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />
                    ))}
                </div>
                <div className="col-span-7 space-y-5">
                    <div className="h-64 bg-slate-200 dark:bg-slate-700 rounded-2xl animate-pulse" />
                    <div className="h-80 bg-slate-200 dark:bg-slate-700 rounded-2xl animate-pulse" />
                </div>
                <div className="col-span-3 space-y-4">
                    <div className="h-48 bg-slate-200 dark:bg-slate-700 rounded-2xl animate-pulse" />
                </div>
            </div>
        </div>
    );

    if (error) return (
        <div className="max-w-[1400px] mx-auto px-6 py-8">
            <div className="glass-card rounded-2xl p-8 text-center max-w-lg mx-auto">
                <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                </div>
                <p className="text-rose-600 dark:text-rose-400 font-medium">{error}</p>
            </div>
        </div>
    );

    if (!bug) return null;

    const initialData = {
        title: bug.title || '',
        steps_to_reproduce: bug.description || '',
        status: bug.status || 'New',
        assigned_to: bug.assigned_to || '',
        severity: bug.severity || 'None',
        service_name: bug.service_name || '',
        environment: bug.environment || 'DEV',
        description: (bug as any).description || '',
        cc: bug.cc || '',
        dev_fix_description: (bug as any).dev_fix_description || '',
        qc_verification_notes: (bug as any).qc_verification_notes || '',
        initial_effort: (bug as any).initial_effort ?? null,
        remaining_effort: (bug as any).remaining_effort ?? null,
        linked_test_case_ids: (bug as any).linked_test_case_ids || [],
        close_date: (bug as any).close_date || '',
    };

    return (
        <BugForm
            initialData={initialData}
            bug={bug}
            isEdit
            artifactId={bug.tuleap_artifact_id ? String(bug.tuleap_artifact_id) : undefined}
            bugUUID={id}
            projectId={bug.project_id}
        />
    );
}

'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { tuleapApi, TuleapArtifact } from '@/lib/api';
import { UserStoryForm } from '@/components/user-stories/UserStoryForm';
import { Spinner } from '@/components/ui/Spinner';

export default function EditUserStoryPage() {
    const params = useParams();
    const id = (params?.id as string) || '';
    const router = useRouter();
    const [artifact, setArtifact] = useState<TuleapArtifact | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function load() {
            try {
                const data = await tuleapApi.get('user-story', id);
                setArtifact(data);
            } catch (err: any) {
                setError(err.message || 'Failed to load user story');
            } finally {
                setIsLoading(false);
            }
        }
        if (id) load();
    }, [id]);

    if (isLoading) {
        return <div className="flex justify-center p-12"><Spinner size="lg" /></div>;
    }

    if (error) {
        return (
            <div className="max-w-3xl mx-auto py-8 px-4">
                <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 p-6 rounded-2xl">
                    <h2 className="text-lg font-semibold mb-2">Error</h2>
                    <p>{error}</p>
                </div>
            </div>
        );
    }

    if (!artifact) {
        return (
            <div className="max-w-3xl mx-auto py-8 px-4">
                <div className="text-center py-12">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">User Story Not Found</h2>
                    <p className="text-slate-500 dark:text-slate-400">The requested user story could not be found.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto py-8 px-4">
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Edit User Story</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Update user story details in Tuleap.</p>
                </div>
                <button onClick={() => router.back()} className="text-sm text-slate-500 hover:text-indigo-600 underline">
                    Cancel
                </button>
            </div>
            <UserStoryForm initialData={artifact as Record<string, unknown>} isEdit artifactId={id} />
        </div>
    );
}

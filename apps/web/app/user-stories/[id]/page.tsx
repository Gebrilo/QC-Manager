'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { tuleapApi, TuleapArtifact } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import Link from 'next/link';

function getStatusBadgeVariant(status: string | undefined): 'info' | 'warning' | 'default' | 'success' {
    switch (status) {
        case 'Draft': return 'info';
        case 'Changes': return 'warning';
        case 'Review': return 'default';
        case 'Approved': return 'success';
        default: return 'default';
    }
}

function getStatusBadgeColor(status: string | undefined): string {
    switch (status) {
        case 'Draft': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
        case 'Changes': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
        case 'Review': return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400';
        case 'Approved': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
        default: return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    }
}

export default function UserStoryDetailPage() {
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

    const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete this user story?')) return;
        try {
            await tuleapApi.remove(id);
            router.push('/user-stories');
        } catch (err: any) {
            alert(`Failed to delete: ${err.message}`);
        }
    };

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

    const title = artifact.title || artifact.xref || `User Story #${id}`;

    return (
        <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" onClick={() => router.back()}>
                        ← Back
                    </Button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{title}</h1>
                            {artifact.status && (
                                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${getStatusBadgeColor(artifact.status)}`}>
                                    {artifact.status}
                                </span>
                            )}
                        </div>
                        {artifact.xref && (
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{artifact.xref}</p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Link href={`/user-stories/${id}/edit`}>
                        <Button variant="outline">Edit</Button>
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

            <div className="glass-card rounded-2xl p-6">
                <h3 className="text-sm uppercase tracking-wider text-slate-400 mb-4">Artifact Data</h3>
                <pre className="bg-slate-50 dark:bg-slate-950 rounded-xl p-4 text-sm text-slate-700 dark:text-slate-300 overflow-auto max-h-[600px] border border-slate-200 dark:border-slate-800">
                    {JSON.stringify(artifact, null, 2)}
                </pre>
            </div>
        </div>
    );
}

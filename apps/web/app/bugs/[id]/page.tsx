'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { tuleapApi, type TuleapArtifact } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import Link from 'next/link';

const STATUS_VARIANT: Record<string, 'default' | 'info' | 'ontrack' | 'inprogress' | 'success' | 'complete' | 'secondary'> = {
    New: 'info',
    Open: 'ontrack',
    Assigned: 'inprogress',
    Fixed: 'success',
    Verified: 'complete',
    Closed: 'secondary',
};

export default function BugDetailPage() {
    const params = useParams();
    const id = (params?.id as string) || '';
    const router = useRouter();
    const [artifact, setArtifact] = useState<TuleapArtifact | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        async function load() {
            try {
                const data = await tuleapApi.get('bug', id);
                setArtifact(data);
            } catch (err: any) {
                setError(err.message || 'Failed to load bug');
            } finally {
                setIsLoading(false);
            }
        }
        if (id) load();
    }, [id]);

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            await tuleapApi.remove(id);
            router.push('/bugs');
            router.refresh();
        } catch (err: any) {
            setError(err.message || 'Failed to delete');
        } finally {
            setIsDeleting(false);
            setShowDeleteModal(false);
        }
    };

    if (isLoading) return (
        <div className="max-w-5xl mx-auto py-8 px-4 animate-pulse space-y-6">
            <div className="flex items-center gap-4">
                <div className="h-9 w-20 bg-slate-200 dark:bg-slate-700 rounded-lg" />
                <div className="space-y-2">
                    <div className="h-7 w-64 bg-slate-200 dark:bg-slate-700 rounded" />
                    <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
                </div>
            </div>
            <div className="h-48 bg-slate-200 dark:bg-slate-700 rounded-2xl" />
        </div>
    );

    if (error && !artifact) return (
        <div className="max-w-5xl mx-auto py-8 px-4">
            <div className="text-center py-20">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                </div>
                <p className="text-lg font-medium text-rose-700 dark:text-rose-400">{error}</p>
                <button onClick={() => router.push('/bugs')} className="mt-4 text-sm text-indigo-600 hover:text-indigo-800">← Back to Bugs</button>
            </div>
        </div>
    );

    if (!artifact) return null;

    const title = artifact.title || artifact.summary || `Bug #${id}`;
    const status = artifact.status || 'New';

    return (
        <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="outline" onClick={() => router.push('/bugs')} className="border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                        ← Back
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{title}</h1>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                            Artifact #{id}{artifact.xref ? ` · ${artifact.xref}` : ''}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Badge variant={STATUS_VARIANT[status] || 'default'}>
                        {status}
                    </Badge>
                    <Link href={`/bugs/${id}/edit`}>
                        <Button variant="outline" className="border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                            Edit
                        </Button>
                    </Link>
                    <Button variant="outline" onClick={() => setShowDeleteModal(true)} className="border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30">
                        Delete
                    </Button>
                </div>
            </div>

            <div className="glass-card rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">Artifact Data</h3>
                <pre className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 rounded-xl p-4 overflow-auto max-h-[600px]">
                    {JSON.stringify(artifact, null, 2)}
                </pre>
            </div>

            {showDeleteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 max-w-md w-full mx-4 p-6 space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center flex-shrink-0">
                                <svg className="w-5 h-5 text-rose-600 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="font-semibold text-slate-900 dark:text-white">Delete Bug</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                    Delete artifact <span className="font-mono font-medium">#{id}</span>: {title}?
                                </p>
                                <p className="text-xs text-slate-400 mt-2">This will remove the artifact from Tuleap.</p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                onClick={() => setShowDeleteModal(false)}
                                disabled={isDeleting}
                                className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className="px-4 py-2 text-sm rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 transition-colors"
                            >
                                {isDeleting ? 'Deleting…' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

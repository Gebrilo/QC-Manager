'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { tuleapApi, TuleapArtifact } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';

export default function TestCaseDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const [artifact, setArtifact] = useState<TuleapArtifact | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        tuleapApi.get('test-case', id)
            .then((data) => setArtifact(data))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, [id]);

    const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete this test case?')) return;
        try {
            await tuleapApi.remove(id);
            router.push('/test-cases');
            router.refresh();
        } catch (err: any) {
            setError(err.message);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Spinner size="lg" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="max-w-3xl mx-auto py-8 px-4">
                <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 p-6 rounded-2xl">
                    <h2 className="text-lg font-semibold mb-2">Error Loading Test Case</h2>
                    <p>{error}</p>
                    <Link href="/test-cases">
                        <Button variant="outline" className="mt-4">Back to Test Cases</Button>
                    </Link>
                </div>
            </div>
        );
    }

    if (!artifact) {
        return (
            <div className="max-w-3xl mx-auto py-8 px-4">
                <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl text-center border border-slate-200 dark:border-slate-800">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Test Case Not Found</h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">The test case you are looking for does not exist.</p>
                    <Link href="/test-cases">
                        <Button variant="outline">Back to Test Cases</Button>
                    </Link>
                </div>
            </div>
        );
    }

    const title = artifact.title || artifact.xref || `Test Case #${id}`;

    return (
        <div className="max-w-3xl mx-auto py-8 px-4">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <Link href="/test-cases">
                        <Button variant="ghost" size="sm">← Back</Button>
                    </Link>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{title}</h1>
                </div>
                <div className="flex gap-3">
                    <Link href={`/test-cases/${id}/edit`}>
                        <Button variant="outline">Edit</Button>
                    </Link>
                    <Button variant="destructive" onClick={handleDelete}>Delete</Button>
                </div>
            </div>

            <div className="glass-card rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-4 flex-wrap">
                    {artifact.status && (
                        <Badge variant="info">{artifact.status}</Badge>
                    )}
                    <span className="text-sm text-gray-500 dark:text-gray-400">ID: {artifact.id}</span>
                    {artifact.xref && (
                        <span className="text-sm text-gray-500 dark:text-gray-400">Xref: {artifact.xref}</span>
                    )}
                </div>

                <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                    <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Artifact Data</h3>
                    <pre className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl text-xs text-slate-700 dark:text-slate-300 overflow-auto max-h-[600px] border border-slate-200 dark:border-slate-800">
                        {JSON.stringify(artifact, null, 2)}
                    </pre>
                </div>
            </div>
        </div>
    );
}

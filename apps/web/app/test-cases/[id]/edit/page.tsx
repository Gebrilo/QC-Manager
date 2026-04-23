'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { tuleapApi, TuleapArtifact } from '@/lib/api';
import { TestCaseForm } from '@/components/test-cases/TestCaseForm';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';

export default function EditTestCasePage() {
    const params = useParams();
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

    return (
        <div className="max-w-3xl mx-auto py-8 px-4">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Edit Test Case</h1>
            <TestCaseForm initialData={artifact as Record<string, unknown>} isEdit artifactId={id} />
        </div>
    );
}

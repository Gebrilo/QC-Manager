'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { TestSuite } from '@/types';
import { testSuitesApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { FormSection } from '@/components/ui/FormSection';
import { Spinner } from '@/components/ui/Spinner';

export default function EditTestSuitePage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const [suite, setSuite] = useState<TestSuite | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [status, setStatus] = useState('');

    const loadSuite = useCallback(async () => {
        try {
            setLoading(true);
            const data = await testSuitesApi.get(id);
            const s = data as any;
            setSuite(s);
            setName(s.name || '');
            setDescription(s.description || '');
            setStatus(s.status || 'draft');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        loadSuite();
    }, [loadSuite]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) { setError('Name is required'); return; }

        setSubmitting(true);
        setError(null);
        try {
            await testSuitesApi.update(id, {
                name: name.trim(),
                description: description.trim() || undefined,
                status: status as 'draft' | 'active' | 'archived',
            });
            router.push(`/test-suites/${id}`);
            router.refresh();
        } catch (err: any) {
            setError(err.message || 'Failed to update test suite');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;
    }

    if (error && !suite) {
        return (
            <div className="max-w-3xl mx-auto py-8 px-4">
                <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 p-6 rounded-2xl">
                    <h2 className="text-lg font-semibold mb-2">Error</h2>
                    <p>{error}</p>
                    <Link href="/test-suites"><Button variant="outline" className="mt-4">Back to Test Suites</Button></Link>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto py-8 px-4">
            <div className="flex items-center gap-4 mb-6">
                <Link href={`/test-suites/${id}`}><Button variant="ghost" size="sm">Back</Button></Link>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Edit Suite: {suite?.suite_id}</h1>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <ErrorBanner message={error} />

                <FormSection title="General">
                    <Input
                        label="Name *"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Suite name"
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
                            placeholder="Describe the suite..."
                        />
                    </div>
                </FormSection>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                    <Button type="button" variant="outline" onClick={() => router.back()} className="w-24 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300">Cancel</Button>
                    <Button type="submit" disabled={submitting} className="w-40 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-500/30 border-none">
                        {submitting ? 'Saving...' : 'Save Changes'}
                    </Button>
                </div>
            </form>
        </div>
    );
}
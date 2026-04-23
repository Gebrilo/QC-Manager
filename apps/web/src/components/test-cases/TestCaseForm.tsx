'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { tuleapApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

const testCaseSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    testSteps: z.string().min(1, 'Test steps are required'),
    expectedResult: z.string().min(1, 'Expected result is required'),
    status: z.enum(['active', 'draft', 'deprecated']).default('draft'),
    priority: z.enum(['high', 'medium', 'low']).default('medium'),
    category: z.enum(['functional', 'integration', 'regression', 'performance', 'security', 'usability', 'other']).default('functional'),
});

type FormData = z.infer<typeof testCaseSchema>;

interface TestCaseFormProps {
    initialData?: Record<string, unknown>;
    isEdit?: boolean;
    artifactId?: string;
}

export function TestCaseForm({ initialData, isEdit, artifactId }: TestCaseFormProps) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<FormData>({
        resolver: zodResolver(testCaseSchema) as any,
        defaultValues: {
            title: (initialData?.title as string) || '',
            testSteps: (initialData?.test_steps as string) || (initialData?.testSteps as string) || '',
            expectedResult: (initialData?.expected_result as string) || (initialData?.expectedResult as string) || '',
            status: ((initialData?.status as string) || 'draft') as FormData['status'],
            priority: ((initialData?.priority as string) || 'medium') as FormData['priority'],
            category: ((initialData?.category as string) || 'functional') as FormData['category'],
        },
    });

    const onSubmit = async (data: FormData) => {
        setIsSubmitting(true);
        setError(null);
        try {
            const payload = {
                title: data.title,
                test_steps: data.testSteps,
                expected_result: data.expectedResult,
                status: data.status,
                priority: data.priority,
                category: data.category,
            };

            if (isEdit && artifactId) {
                await tuleapApi.update(artifactId, 'test-case', payload);
                router.push(`/test-cases/${artifactId}`);
            } else {
                const result = await tuleapApi.create('test-case', payload);
                router.push(`/test-cases/${result.tuleap_artifact_id}`);
            }
            router.refresh();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit) as any} className="space-y-8 max-w-3xl mx-auto">
            <div className="glass-card rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                    Test Case Details
                </h3>

                {error && (
                    <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 p-4 rounded-xl text-sm mb-6 flex items-center gap-2">
                        <svg className="w-5 h-5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                        <Input
                            label="Title"
                            {...register('title')}
                            error={errors.title?.message}
                            placeholder="Enter test case title"
                            className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                        />
                    </div>

                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Test Steps</label>
                        <textarea
                            {...register('testSteps')}
                            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none min-h-[120px] transition-all resize-y"
                            placeholder="Describe the test steps..."
                        />
                        {errors.testSteps && (
                            <p className="text-sm font-medium text-rose-500 mt-1">{errors.testSteps.message}</p>
                        )}
                    </div>

                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Expected Result</label>
                        <textarea
                            {...register('expectedResult')}
                            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none min-h-[120px] transition-all resize-y"
                            placeholder="Describe the expected result..."
                        />
                        {errors.expectedResult && (
                            <p className="text-sm font-medium text-rose-500 mt-1">{errors.expectedResult.message}</p>
                        )}
                    </div>

                    <Select
                        label="Status"
                        options={[
                            { value: 'active', label: 'Active' },
                            { value: 'draft', label: 'Draft' },
                            { value: 'deprecated', label: 'Deprecated' },
                        ]}
                        {...register('status')}
                        error={errors.status?.message}
                        className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                    />

                    <Select
                        label="Priority"
                        options={[
                            { value: 'high', label: 'High' },
                            { value: 'medium', label: 'Medium' },
                            { value: 'low', label: 'Low' },
                        ]}
                        {...register('priority')}
                        error={errors.priority?.message}
                        className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                    />

                    <div className="md:col-span-2">
                        <Select
                            label="Category"
                            options={[
                                { value: 'functional', label: 'Functional' },
                                { value: 'integration', label: 'Integration' },
                                { value: 'regression', label: 'Regression' },
                                { value: 'performance', label: 'Performance' },
                                { value: 'security', label: 'Security' },
                                { value: 'usability', label: 'Usability' },
                                { value: 'other', label: 'Other' },
                            ]}
                            {...register('category')}
                            error={errors.category?.message}
                            className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                        />
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <Button type="button" variant="outline" onClick={() => router.back()} className="w-24 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300">
                    Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting} className="w-40 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-500/30 border-none">
                    {isSubmitting ? <span className="animate-spin mr-2">⏳</span> : null}
                    {isEdit ? 'Save Changes' : 'Create Test Case'}
                </Button>
            </div>
        </form>
    );
}

'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { FormSection } from '@/components/ui/FormSection';
import { tuleapApi } from '@/lib/api';

const testCaseSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    description: z.string().optional().default(''),
    status: z.enum(['active', 'draft', 'deprecated']).default('draft'),
    priority: z.enum(['high', 'medium', 'low']).default('medium'),
    assigned_to: z.string().optional().default(''),
    service_name: z.string().optional().default(''),
    preconditions: z.string().optional().default(''),
    test_steps: z.string().min(1, 'Test steps are required'),
    expected_result: z.string().min(1, 'Expected result is required'),
    actual_result: z.string().optional().default(''),
    task_number: z.string().optional().default(''),
    is_regression: z.boolean().optional().default(false),
    execution_count: z.coerce.number().optional(),
    note: z.string().optional().default(''),
});

type FormData = z.infer<typeof testCaseSchema>;

interface TestCaseFormProps {
    initialData?: Record<string, unknown>;
    isEdit?: boolean;
    artifactId?: string;
    projectId?: string;
}

export function TestCaseForm({ initialData, isEdit, artifactId, projectId }: TestCaseFormProps) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(testCaseSchema) as any,
        defaultValues: {
            title: (initialData?.title as string) || '',
            description: (initialData?.description as string) || '',
            status: ((initialData?.status as string) || 'draft') as FormData['status'],
            priority: ((initialData?.priority as string) || 'medium') as FormData['priority'],
            assigned_to: (initialData?.assigned_to as string) || '',
            service_name: (initialData?.service_name as string) || '',
            preconditions: (initialData?.preconditions as string) || '',
            test_steps: (initialData?.test_steps as string) || (initialData?.testSteps as string) || '',
            expected_result: (initialData?.expected_result as string) || (initialData?.expectedResult as string) || '',
            actual_result: (initialData?.actual_result as string) || '',
            task_number: (initialData?.task_number as string) || '',
            is_regression: (initialData?.is_regression as boolean) || false,
            execution_count: initialData?.execution_count != null ? Number(initialData.execution_count) : undefined,
            note: (initialData?.note as string) || '',
        },
    });

    const onSubmit = async (data: FormData) => {
        setIsSubmitting(true);
        setError(null);
        try {
            const payload = {
                artifact_type: 'test_case' as const,
                project_id: projectId,
                common: {
                    title: data.title,
                    description: data.description || undefined,
                    status: data.status,
                    assigned_to: data.assigned_to || null,
                    priority: data.priority,
                },
                fields: {
                    service_name: data.service_name || undefined,
                    preconditions: data.preconditions || undefined,
                    test_steps: data.test_steps,
                    expected_result: data.expected_result,
                    actual_result: data.actual_result || undefined,
                    task_number: data.task_number || undefined,
                    is_regression: data.is_regression,
                    execution_count: data.execution_count,
                    note: data.note || undefined,
                },
            };

            if (isEdit && artifactId) {
                await tuleapApi.updateUnified(artifactId, payload);
                router.push(`/test-cases/${artifactId}`);
            } else {
                const result = await tuleapApi.createUnified(payload);
                router.push(`/test-cases/${result.tuleap_artifact_id}`);
            }
            router.refresh();
        } catch (err: any) {
            setError(err.message || 'Failed to save test case');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit) as any} className="space-y-6 max-w-3xl mx-auto">
            <ErrorBanner message={error} />

            <FormSection title="General">
                <div className="md:col-span-2">
                    <Input
                        label="Title"
                        {...register('title')}
                        error={errors.title?.message}
                        placeholder="Enter test case title"
                        className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                    />
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
                <Input
                    label="Assigned To"
                    {...register('assigned_to')}
                    placeholder="email@example.com"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
            </FormSection>

            <FormSection title="Details">
                <Input
                    label="Service Name"
                    {...register('service_name')}
                    placeholder="e.g. Auth Service"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Task Number"
                    {...register('task_number')}
                    placeholder="e.g. TSK-001"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <div className="md:col-span-2">
                    <Textarea
                        label="Preconditions"
                        {...register('preconditions')}
                        placeholder="Prerequisites for this test..."
                    />
                </div>
            </FormSection>

            <FormSection title="Test Definition">
                <div className="md:col-span-2">
                    <Textarea
                        label="Test Steps"
                        {...register('test_steps')}
                        error={errors.test_steps?.message}
                        placeholder="Describe the test steps..."
                    />
                </div>
                <div className="md:col-span-2">
                    <Textarea
                        label="Expected Result"
                        {...register('expected_result')}
                        error={errors.expected_result?.message}
                        placeholder="Describe the expected result..."
                    />
                </div>
                <div className="md:col-span-2">
                    <Textarea
                        label="Actual Result"
                        {...register('actual_result')}
                        placeholder="Describe the actual result (if executed)..."
                    />
                </div>
            </FormSection>

            <FormSection title="Progress">
                <div className="flex items-center gap-3 h-10">
                    <input
                        type="checkbox"
                        {...register('is_regression')}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Is Regression</label>
                </div>
                <Input
                    label="Execution Count"
                    type="number"
                    {...register('execution_count')}
                    placeholder="0"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <div className="md:col-span-2">
                    <Textarea
                        label="Note"
                        {...register('note')}
                        placeholder="Additional notes..."
                    />
                </div>
            </FormSection>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <Button type="button" variant="outline" onClick={() => router.back()} className="w-24 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300">Cancel</Button>
                <Button type="submit" disabled={isSubmitting} className="w-40 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-500/30 border-none">
                    {isSubmitting ? <span className="animate-spin mr-2">⏳</span> : null}
                    {isEdit ? 'Save Changes' : 'Create Test Case'}
                </Button>
            </div>
        </form>
    );
}

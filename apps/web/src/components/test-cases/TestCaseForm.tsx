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
import { testCasesApi } from '@/lib/api';
import { artifactPath } from '@/lib/artifactPath';
import { stripHtml } from '@/lib/stripHtml';
import { useTuleapResources } from '@/hooks/useTuleapResources';

const testCaseSchema = z.object({
    title: z.string().min(3, 'Title must be at least 3 characters').max(500),
    description: z.string().max(5000).optional().default(''),
    preconditions: z.string().max(3000).optional().default(''),
    test_steps: z.string().max(10000).optional().default(''),
    expected_result: z.string().max(5000).optional().default(''),
    priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
    severity: z.enum(['critical', 'major', 'normal', 'minor', 'trivial']).default('normal').optional(),
    test_type: z.enum(['functional', 'regression', 'smoke', 'integration', 'performance', 'security', 'usability', 'exploratory', 'automated']).default('functional'),
    category: z.string().max(50).optional().default(''),
    component: z.string().max(100).optional().default(''),
    suite_title: z.string().max(255).optional().default(''),
    automation_status: z.enum(['manual', 'automated', 'partial', 'to_automate']).default('manual'),
    status: z.enum(['None', 'Not Run', 'Review', 'Pass', 'Fail', 'Blocked']).default('Not Run'),
    estimated_duration_minutes: z.coerce.number().int().min(0).max(480).optional().nullable(),
    tags: z.string().optional().default(''),
    assigned_to: z.string().optional().default(''),
    linked_requirement_id: z.string().max(100).optional().default(''),
});

type FormData = z.infer<typeof testCaseSchema>;

interface TestCaseFormProps {
    initialData?: Record<string, unknown>;
    isEdit?: boolean;
    testCaseId?: string;
    projectId?: string;
}

export function TestCaseForm({ initialData, isEdit, testCaseId, projectId }: TestCaseFormProps) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { resources: tuleapResources, loaded: tuleapLoaded } = useTuleapResources(projectId, 'test_case');

    const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(testCaseSchema) as any,
        defaultValues: {
            title: stripHtml(initialData?.title as string),
            description: stripHtml(initialData?.description as string),
            preconditions: stripHtml(initialData?.preconditions as string),
            test_steps: stripHtml(initialData?.test_steps as string),
            expected_result: stripHtml(initialData?.expected_result as string),
            priority: ((initialData?.priority as string) || 'medium') as FormData['priority'],
            severity: ((initialData?.severity as string) || 'normal') as FormData['severity'],
            test_type: ((initialData?.test_type as string) || 'functional') as FormData['test_type'],
            category: (initialData?.category as string) || '',
            component: (initialData?.component as string) || '',
            suite_title: (initialData?.suite_title as string) || '',
            automation_status: ((initialData?.automation_status as string) || 'manual') as FormData['automation_status'],
            status: ((initialData?.status as string) || 'Not Run') as FormData['status'],
            estimated_duration_minutes: initialData?.estimated_duration_minutes != null ? Number(initialData.estimated_duration_minutes) : null,
            tags: Array.isArray(initialData?.tags) ? (initialData.tags as string[]).join(', ') : (initialData?.tags as string) || '',
            assigned_to: (initialData?.assigned_to as string) || '',
            linked_requirement_id: (initialData?.linked_requirement_id as string) || '',
        },
    });

    const onSubmit = async (data: FormData) => {
        setIsSubmitting(true);
        setError(null);
        try {
            const payload: Record<string, unknown> = {
                title: data.title,
                description: data.description || undefined,
                preconditions: data.preconditions || undefined,
                test_steps: data.test_steps || undefined,
                expected_result: data.expected_result || undefined,
                priority: data.priority,
                severity: data.severity,
                test_type: data.test_type,
                category: data.category || 'other',
                component: data.component || undefined,
                suite_title: data.suite_title || undefined,
                automation_status: data.automation_status,
                status: data.status,
                estimated_duration_minutes: data.estimated_duration_minutes || undefined,
                tags: data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
                assigned_to: data.assigned_to || undefined,
                linked_requirement_id: data.linked_requirement_id || undefined,
            };

            if (!isEdit && projectId) {
                (payload as any).project_id = projectId;
            }

            if (isEdit && testCaseId) {
                await testCasesApi.update(testCaseId, payload);
                router.push(artifactPath('test_case', { id: testCaseId }));
            } else {
                await testCasesApi.create(payload as any);
                router.push('/test/cases');
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
                        { value: 'None', label: 'None' },
                        { value: 'Not Run', label: 'Not Run' },
                        { value: 'Review', label: 'Review' },
                        { value: 'Pass', label: 'Pass' },
                        { value: 'Fail', label: 'Fail' },
                        { value: 'Blocked', label: 'Blocked' },
                    ]}
                    {...register('status')}
                    error={errors.status?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Select
                    label="Priority"
                    options={[
                        { value: 'critical', label: 'Critical' },
                        { value: 'high', label: 'High' },
                        { value: 'medium', label: 'Medium' },
                        { value: 'low', label: 'Low' },
                    ]}
                    {...register('priority')}
                    error={errors.priority?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Select
                    label="Severity"
                    options={[
                        { value: 'critical', label: 'Critical' },
                        { value: 'major', label: 'Major' },
                        { value: 'normal', label: 'Normal' },
                        { value: 'minor', label: 'Minor' },
                        { value: 'trivial', label: 'Trivial' },
                    ]}
                    {...register('severity')}
                    error={errors.severity?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Select
                    label="Test Type"
                    options={[
                        { value: 'functional', label: 'Functional' },
                        { value: 'regression', label: 'Regression' },
                        { value: 'smoke', label: 'Smoke' },
                        { value: 'integration', label: 'Integration' },
                        { value: 'performance', label: 'Performance' },
                        { value: 'security', label: 'Security' },
                        { value: 'usability', label: 'Usability' },
                        { value: 'exploratory', label: 'Exploratory' },
                        { value: 'automated', label: 'Automated' },
                    ]}
                    {...register('test_type')}
                    error={errors.test_type?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Select
                    label="Automation Status"
                    options={[
                        { value: 'manual', label: 'Manual' },
                        { value: 'automated', label: 'Automated' },
                        { value: 'partial', label: 'Partial' },
                        { value: 'to_automate', label: 'To Automate' },
                    ]}
                    {...register('automation_status')}
                    error={errors.automation_status?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Category"
                    {...register('category')}
                    placeholder="e.g. Authentication"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Component"
                    {...register('component')}
                    placeholder="e.g. Login Module"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Suite Title"
                    {...register('suite_title')}
                    placeholder="e.g. Authentication / Login"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <div>
                    <Select
                        label="Assigned To"
                        options={[
                            { value: '', label: '— Unassigned —' },
                            ...tuleapResources.map(r => ({
                                value: r.id,
                                label: `${r.resource_name} (${r.tuleap_username})`,
                            })),
                        ]}
                        {...register('assigned_to')}
                        className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                    />
                    {tuleapLoaded && tuleapResources.length === 0 && (
                        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                            No Tuleap-mapped resources found. Go to{' '}
                            <a href="/team/resources" className="underline font-medium">Team → Resources</a>{' '}
                            and set a Tuleap Username on each resource.
                        </p>
                    )}
                </div>
                <Input
                    label="Est. Duration (minutes)"
                    type="number"
                    {...register('estimated_duration_minutes')}
                    placeholder="5"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Linked Requirement"
                    {...register('linked_requirement_id')}
                    placeholder="REQ-001"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Tags (comma-separated)"
                    {...register('tags')}
                    placeholder="smoke, login, p1"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
            </FormSection>

            <FormSection title="Description & Details">
                <div className="md:col-span-2">
                    <Textarea label="Description" {...register('description')} placeholder="Describe the test case purpose..." />
                </div>
                <div className="md:col-span-2">
                    <Textarea label="Preconditions" {...register('preconditions')} placeholder="Prerequisites for this test..." />
                </div>
            </FormSection>

            <FormSection title="Test Definition">
                <div className="md:col-span-2">
                    <Textarea label="Test Steps" {...register('test_steps')} placeholder="1. Navigate to login page&#10;2. Enter valid email&#10;3. Click Login" />
                </div>
                <div className="md:col-span-2">
                    <Textarea label="Expected Result" {...register('expected_result')} placeholder="User is redirected to dashboard" />
                </div>
            </FormSection>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <Button type="button" variant="outline" onClick={() => router.back()} className="w-24 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300">Cancel</Button>
                <Button type="submit" disabled={isSubmitting} className="w-40 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-500/30 border-none">
                    {isSubmitting ? <span className="animate-spin mr-2">...</span> : null}
                    {isEdit ? 'Save Changes' : 'Create Test Case'}
                </Button>
            </div>
        </form>
    );
}

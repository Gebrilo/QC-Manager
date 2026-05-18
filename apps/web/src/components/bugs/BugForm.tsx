'use client';

import { useState, useEffect } from 'react';
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
import { tuleapApi, projectsApi, type Project } from '@/lib/api';
import { stripHtml } from '@/lib/stripHtml';
import { useTuleapResources } from '@/hooks/useTuleapResources';

const bugSchema = z.object({
    title: z.string().min(1, 'Bug title is required'),
    description: z.string().optional().default(''),
    steps_to_reproduce: z.string().optional().default(''),
    status: z.enum(['New', 'Open', 'Assigned', 'Fixed', 'Verified', 'Closed']).optional().default('New'),
    assigned_to: z.string().optional().default(''),
    severity: z.enum(['critical', 'high', 'medium', 'low']).optional().default('medium'),
    close_date: z.string().optional().default(''),
    service_name: z.string().optional().default(''),
    environment: z.enum(['DEV', 'TEST', 'PROD']).optional().default('DEV'),
    cc: z.string().optional().default(''),
    dev_fix_description: z.string().optional().default(''),
    qc_verification_notes: z.string().optional().default(''),
    initial_effort: z.coerce.number().nullable().optional(),
    remaining_effort: z.coerce.number().nullable().optional(),
    linked_test_case_ids: z.string().optional().default(''),
});

type FormData = z.infer<typeof bugSchema>;

interface BugFormProps {
    initialData?: Record<string, unknown>;
    isEdit?: boolean;
    artifactId?: string;
    bugUUID?: string;
    projectId?: string;
}

export function BugForm({ initialData, isEdit, artifactId, bugUUID, projectId: initialProjectId }: BugFormProps) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<string>(initialProjectId || '');
    const { resources: tuleapResources, loaded: tuleapLoaded } = useTuleapResources();

    useEffect(() => {
        projectsApi.list().then(setProjects).catch(() => {});
    }, []);

    const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(bugSchema) as any,
        defaultValues: {
            title: stripHtml((initialData?.title as string) || (initialData?.bugTitle as string)),
            description: stripHtml(initialData?.description as string),
            steps_to_reproduce: stripHtml((initialData?.steps_to_reproduce as string) || (initialData?.stepsToReproduce as string)),
            status: (initialData?.status as any) || 'New',
            assigned_to: (initialData?.assigned_to as string) || '',
            severity: (initialData?.severity as any) || 'medium',
            close_date: (initialData?.close_date as string) || '',
            service_name: (initialData?.service_name as string) || (initialData?.serviceName as string) || '',
            environment: (initialData?.environment as any) || 'DEV',
            cc: Array.isArray(initialData?.cc) ? (initialData.cc as string[]).join(', ') : ((initialData?.cc as string) || ''),
            dev_fix_description: stripHtml(initialData?.dev_fix_description as string),
            qc_verification_notes: stripHtml(initialData?.qc_verification_notes as string),
            initial_effort: initialData?.initial_effort != null ? Number(initialData.initial_effort) : null,
            remaining_effort: initialData?.remaining_effort != null ? Number(initialData.remaining_effort) : null,
            linked_test_case_ids: Array.isArray(initialData?.linked_test_case_ids)
                ? (initialData.linked_test_case_ids as string[]).join(', ')
                : ((initialData?.linked_test_case_ids as string) || ''),
        },
    });

    const onSubmit = async (data: FormData) => {
        setIsSubmitting(true);
        setError(null);
        try {
            if (!selectedProjectId) {
                setError('Please select a project before creating a bug.');
                setIsSubmitting(false);
                return;
            }
            const payload = {
                artifact_type: 'bug' as const,
                project_id: selectedProjectId,
                common: {
                    title: data.title,
                    description: data.description || undefined,
                    status: data.status,
                    assigned_to: data.assigned_to || null,
                    priority: data.severity,
                },
                fields: {
                    severity: data.severity,
                    environment: data.environment,
                    service_name: data.service_name || undefined,
                    steps_to_reproduce: data.steps_to_reproduce || undefined,
                    dev_fix_description: data.dev_fix_description || undefined,
                    qc_verification_notes: data.qc_verification_notes || undefined,
                    close_date: data.close_date || null,
                    cc: data.cc ? data.cc.split(',').map(s => s.trim()).filter(Boolean) : undefined,
                    linked_test_case_ids: data.linked_test_case_ids ? data.linked_test_case_ids.split(',').map(s => s.trim()).filter(Boolean) : undefined,
                    initial_effort: data.initial_effort ?? null,
                    remaining_effort: data.remaining_effort ?? null,
                },
            };

            if (isEdit && artifactId) {
                await tuleapApi.updateUnified(artifactId, payload);
                router.push(`/work/bugs/${bugUUID || artifactId}`);
            } else {
                const result = await tuleapApi.createUnified(payload);
                if (result.tuleap_warning) {
                    console.warn('Tuleap sync skipped:', result.tuleap_warning);
                }
                if (result.qc_id) {
                    router.push(`/work/bugs/${result.qc_id}`);
                } else {
                    router.push('/work/bugs');
                }
            }
            router.refresh();
        } catch (err: any) {
            setError(err.message || 'Failed to save bug');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-3xl mx-auto">
            <ErrorBanner message={error} />

            <FormSection title="General">
                <div className="md:col-span-2">
                    <Select
                        label="Project *"
                        options={[
                            { value: '', label: 'Select a project...' },
                            ...projects.map(p => ({ value: p.id, label: `${p.project_name} (${p.project_id})` })),
                        ]}
                        value={selectedProjectId}
                        onChange={e => setSelectedProjectId(e.target.value)}
                        disabled={isEdit}
                        className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                    />
                </div>
                <Select
                    label="Status"
                    options={[
                        { value: 'New', label: 'New' },
                        { value: 'Open', label: 'Open' },
                        { value: 'Assigned', label: 'Assigned' },
                        { value: 'Fixed', label: 'Fixed' },
                        { value: 'Verified', label: 'Verified' },
                        { value: 'Closed', label: 'Closed' },
                    ]}
                    {...register('status')}
                    error={errors.status?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <div>
                    <Select
                        label="Assigned To"
                        options={[
                            { value: '', label: '— Unassigned —' },
                            ...tuleapResources.map(r => ({
                                value: r.tuleap_username,
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
                <Select
                    label="Severity"
                    options={[
                        { value: 'critical', label: 'Critical' },
                        { value: 'high', label: 'High' },
                        { value: 'medium', label: 'Medium' },
                        { value: 'low', label: 'Low' },
                    ]}
                    {...register('severity')}
                    error={errors.severity?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Close Date"
                    type="date"
                    {...register('close_date')}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Service Name"
                    {...register('service_name')}
                    placeholder="e.g. Auth Service"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
            </FormSection>

            <FormSection title="Description">
                <div className="md:col-span-2">
                    <Input
                        label="Bug Title"
                        {...register('title')}
                        error={errors.title?.message}
                        placeholder="e.g. Login page crashes on mobile"
                        className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                    />
                </div>
                <div className="md:col-span-2">
                    <Textarea
                        label="Description + Steps to Reproduce"
                        {...register('steps_to_reproduce')}
                        placeholder="1. Go to login page&#10;2. Enter credentials&#10;3. Click submit..."
                    />
                </div>
                <Select
                    label="Environment"
                    options={[
                        { value: 'DEV', label: 'DEV' },
                        { value: 'TEST', label: 'TEST' },
                        { value: 'PROD', label: 'PROD' },
                    ]}
                    {...register('environment')}
                    error={errors.environment?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="CC (comma-separated emails)"
                    {...register('cc')}
                    placeholder="user1@example.com, user2@example.com"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <div className="md:col-span-2">
                    <Textarea
                        label="Dev Fix Description"
                        {...register('dev_fix_description')}
                        placeholder="Developer notes on the fix..."
                    />
                </div>
                <div className="md:col-span-2">
                    <Textarea
                        label="QC Verification Notes"
                        {...register('qc_verification_notes')}
                        placeholder="QC verification steps and results..."
                    />
                </div>
            </FormSection>

            <FormSection title="Progress">
                <Input
                    label="Initial Effort (hours)"
                    type="number"
                    step="0.5"
                    {...register('initial_effort')}
                    placeholder="0"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Input
                    label="Remaining Effort (hours)"
                    type="number"
                    step="0.5"
                    {...register('remaining_effort')}
                    placeholder="0"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
            </FormSection>

            <FormSection title="References">
                <div className="md:col-span-2">
                    <Input
                        label="Linked Test Case IDs (comma-separated)"
                        {...register('linked_test_case_ids')}
                        placeholder="T-123, T-456"
                        className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                    />
                </div>
            </FormSection>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <Button type="button" variant="outline" onClick={() => router.back()} className="w-24 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300">Cancel</Button>
                <Button type="submit" disabled={isSubmitting} className="w-36 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white shadow-lg shadow-indigo-500/30 border-none">
                    {isSubmitting ? <span className="animate-spin mr-2">⏳</span> : null}
                    {isEdit ? 'Save Changes' : 'Create Bug'}
                </Button>
            </div>
        </form>
    );
}

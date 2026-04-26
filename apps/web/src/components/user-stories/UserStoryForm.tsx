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

const userStorySchema = z.object({
    title: z.string().min(1, 'Summary is required'),
    description: z.string().optional().default(''),
    acceptance_criteria: z.string().optional().default(''),
    change_reason: z.string().optional().default(''),
    status: z.enum(['Draft', 'Changes', 'Review', 'Approved']).optional().default('Draft'),
    priority: z.enum(['P1-Critical', 'P2-High', 'P3-Medium', 'P4-Low']).optional().default('P3-Medium'),
    requirement_version: z.string().optional().default('1'),
    ba_author: z.string().optional().default(''),
    initial_effort: z.coerce.number().nullable().optional(),
    remaining_effort: z.coerce.number().nullable().optional(),
    assigned_to: z.string().optional().default(''),
});

type FormData = z.infer<typeof userStorySchema>;

interface UserStoryFormProps {
    initialData?: Record<string, unknown>;
    isEdit?: boolean;
    artifactId?: string;
    projectId?: string;
}

export function UserStoryForm({ initialData, isEdit, artifactId, projectId }: UserStoryFormProps) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(userStorySchema) as any,
        defaultValues: {
            title: (initialData?.title as string) || (initialData?.story_title as string) || (initialData?.summary as string) || '',
            description: (initialData?.description as string) || (initialData?.overview_description as string) || '',
            acceptance_criteria: (initialData?.acceptance_criteria as string) || '',
            change_reason: (initialData?.change_reason as string) || '',
            status: (initialData?.status as any) || 'Draft',
            priority: (initialData?.priority as any) || 'P3-Medium',
            requirement_version: (initialData?.requirement_version as string) || '1',
            ba_author: (initialData?.ba_author as string) || '',
            initial_effort: initialData?.initial_effort != null ? Number(initialData.initial_effort) : null,
            remaining_effort: initialData?.remaining_effort != null ? Number(initialData.remaining_effort) : null,
            assigned_to: (initialData?.assigned_to as string) || '',
        },
    });

    const onSubmit = async (data: FormData) => {
        setIsSubmitting(true);
        setError(null);
        try {
            const payload = {
                artifact_type: 'user_story' as const,
                project_id: projectId,
                common: {
                    title: data.title,
                    description: data.description || undefined,
                    status: data.status,
                    assigned_to: data.assigned_to || null,
                    priority: data.priority,
                },
                fields: {
                    acceptance_criteria: data.acceptance_criteria || undefined,
                    requirement_version: data.requirement_version || '1',
                    change_reason: data.change_reason || undefined,
                    ba_author: data.ba_author || undefined,
                    initial_effort: data.initial_effort ?? null,
                    remaining_effort: data.remaining_effort ?? null,
                },
            };

            if (isEdit && artifactId) {
                await tuleapApi.updateUnified(artifactId, payload);
                router.push(`/user-stories/${artifactId}`);
            } else {
                const result = await tuleapApi.createUnified(payload);
                router.push(`/user-stories/${result.tuleap_artifact_id}`);
            }
            router.refresh();
        } catch (err: any) {
            setError(err.message || 'Failed to save user story');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-3xl mx-auto">
            <ErrorBanner message={error} />

            <FormSection title="General">
                <div className="md:col-span-2">
                    <Input
                        label="Summary"
                        {...register('title')}
                        error={errors.title?.message}
                        placeholder="User story summary"
                        className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                    />
                </div>
                <Select
                    label="Status"
                    options={[
                        { value: 'Draft', label: 'Draft' },
                        { value: 'Changes', label: 'Changes' },
                        { value: 'Review', label: 'Review' },
                        { value: 'Approved', label: 'Approved' },
                    ]}
                    {...register('status')}
                    error={errors.status?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
                <Select
                    label="Priority"
                    options={[
                        { value: 'P1-Critical', label: 'P1 - Critical' },
                        { value: 'P2-High', label: 'P2 - High' },
                        { value: 'P3-Medium', label: 'P3 - Medium' },
                        { value: 'P4-Low', label: 'P4 - Low' },
                    ]}
                    {...register('priority')}
                    error={errors.priority?.message}
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
            </FormSection>

            <FormSection title="Description">
                <div className="md:col-span-2">
                    <Textarea
                        label="Description"
                        {...register('description')}
                        placeholder="Describe the user story..."
                    />
                </div>
                <div className="md:col-span-2">
                    <Textarea
                        label="Acceptance Criteria"
                        {...register('acceptance_criteria')}
                        placeholder="List acceptance criteria..."
                    />
                </div>
                <div className="md:col-span-2">
                    <Textarea
                        label="Change Reason"
                        {...register('change_reason')}
                        placeholder="Reason for this change..."
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
                <Input
                    label="Requirement Version"
                    {...register('requirement_version')}
                    placeholder="e.g. 1.0"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
            </FormSection>

            <FormSection title="References">
                <Input
                    label="BA Author"
                    {...register('ba_author')}
                    placeholder="Business analyst name"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />
            </FormSection>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <Button type="button" variant="outline" onClick={() => router.back()} className="w-24 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300">Cancel</Button>
                <Button type="submit" disabled={isSubmitting} className="w-40 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white shadow-lg shadow-indigo-500/30 border-none">
                    {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create User Story'}
                </Button>
            </div>
        </form>
    );
}

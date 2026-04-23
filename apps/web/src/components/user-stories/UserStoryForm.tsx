'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { tuleapApi } from '@/lib/api';

const userStorySchema = z.object({
    summary: z.string().min(1, 'Summary is required'),
    overviewDescription: z.string().optional().default(''),
    acceptanceCriteria: z.string().optional().default(''),
    status: z.enum(['Draft', 'Changes', 'Review', 'Approved']).optional().default('Draft'),
    requirementVersion: z.string().optional().default(''),
    priority: z.enum(['P1-Critical', 'P2-High', 'P3-Medium', 'P4-Low']).optional().default('P3-Medium'),
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

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<FormData>({
        resolver: zodResolver(userStorySchema) as any,
        defaultValues: {
            summary: (initialData?.story_title as string) || (initialData?.summary as string) || '',
            overviewDescription: (initialData?.overview_description as string) || '',
            acceptanceCriteria: (initialData?.acceptance_criteria as string) || '',
            status: (initialData?.status as any) || 'Draft',
            requirementVersion: (initialData?.requirement_version as string) || '',
            priority: (initialData?.priority as any) || 'P3-Medium',
        },
    });

    const onSubmit = async (data: FormData) => {
        setIsSubmitting(true);
        setError(null);
        try {
            const payload: Record<string, unknown> = {
                story_title: data.summary,
                overview_description: data.overviewDescription || undefined,
                acceptance_criteria: data.acceptanceCriteria || undefined,
                status: data.status,
                requirement_version: data.requirementVersion || undefined,
                priority: data.priority,
            };

            if (projectId) {
                payload.project_id = projectId;
            }

            if (isEdit && artifactId) {
                await tuleapApi.update(artifactId, 'user-story', payload);
                router.push(`/user-stories/${artifactId}`);
            } else {
                const result = await tuleapApi.create('user-story', payload);
                router.push(`/user-stories/${result.tuleap_artifact_id}`);
            }
            router.refresh();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="glass-card rounded-2xl p-6">
                {error && (
                    <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 p-4 rounded-xl text-sm mb-6 flex items-center gap-2">
                        <svg className="w-5 h-5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {error}
                    </div>
                )}

                <div className="space-y-6">
                    <Input
                        label="Summary *"
                        {...register('summary')}
                        error={errors.summary?.message}
                        placeholder="User story summary"
                        className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                    />

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Overview Description</label>
                        <textarea
                            {...register('overviewDescription')}
                            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none min-h-[120px] transition-all resize-y"
                            placeholder="Describe the user story..."
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Acceptance Criteria</label>
                        <textarea
                            {...register('acceptanceCriteria')}
                            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none min-h-[120px] transition-all resize-y"
                            placeholder="List acceptance criteria..."
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Status</label>
                            <select
                                {...register('status')}
                                className="flex h-10 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                            >
                                <option value="Draft">Draft</option>
                                <option value="Changes">Changes</option>
                                <option value="Review">Review</option>
                                <option value="Approved">Approved</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Priority</label>
                            <select
                                {...register('priority')}
                                className="flex h-10 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                            >
                                <option value="P1-Critical">P1 - Critical</option>
                                <option value="P2-High">P2 - High</option>
                                <option value="P3-Medium">P3 - Medium</option>
                                <option value="P4-Low">P4 - Low</option>
                            </select>
                        </div>

                        <Input
                            label="Requirement Version"
                            {...register('requirementVersion')}
                            placeholder="e.g. 1.0"
                            className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                        />
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <Button type="button" variant="outline" onClick={() => router.back()} className="w-24 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300">Cancel</Button>
                <Button type="submit" disabled={isSubmitting} className="w-40 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white shadow-lg shadow-indigo-500/30 border-none">
                    {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create User Story'}
                </Button>
            </div>
        </form>
    );
}

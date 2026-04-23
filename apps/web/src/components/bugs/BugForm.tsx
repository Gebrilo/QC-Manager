'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useRouter } from 'next/navigation';
import { tuleapApi } from '@/lib/api';

const bugSchema = z.object({
    bugTitle: z.string().min(1, 'Required'),
    environment: z.string().min(1, 'Required'),
    serviceName: z.string().min(1, 'Required'),
    stepsToReproduce: z.string().optional().or(z.literal('')),
    severity: z.enum(['critical', 'high', 'medium', 'low']).optional(),
    status: z.enum(['New', 'Open', 'Assigned', 'Fixed', 'Verified', 'Closed']).optional(),
});

type FormData = z.infer<typeof bugSchema>;

interface BugFormProps {
    initialData?: Record<string, unknown>;
    isEdit?: boolean;
    artifactId?: string;
}

export function BugForm({ initialData, isEdit, artifactId }: BugFormProps) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<FormData>({
        resolver: zodResolver(bugSchema) as any,
        defaultValues: {
            bugTitle: (initialData?.bugTitle as string) || (initialData?.title as string) || '',
            environment: (initialData?.environment as string) || '',
            serviceName: (initialData?.serviceName as string) || '',
            stepsToReproduce: (initialData?.stepsToReproduce as string) || '',
            severity: (initialData?.severity as any) || 'medium',
            status: (initialData?.status as any) || 'New',
        },
    });

    const onSubmit = async (data: FormData) => {
        setIsSubmitting(true);
        setError(null);
        try {
            if (isEdit && artifactId) {
                await tuleapApi.update(artifactId, 'bug', data);
                router.push(`/bugs/${artifactId}`);
            } else {
                const result = await tuleapApi.create('bug', data);
                router.push(`/bugs/${result.tuleap_artifact_id}`);
            }
            router.refresh();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 max-w-3xl mx-auto">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">Bug Details</h3>

                {error && (
                    <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 p-4 rounded-xl text-sm mb-6 flex items-center gap-2">
                        <svg className="w-5 h-5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                        <Input
                            label="Bug Title"
                            {...register('bugTitle')}
                            error={errors.bugTitle?.message}
                            placeholder="e.g. Login page crashes on mobile"
                            className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                        />
                    </div>
                    <Input
                        label="Environment"
                        {...register('environment')}
                        error={errors.environment?.message}
                        placeholder="e.g. Production, Staging"
                        className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                    />
                    <Input
                        label="Service Name"
                        {...register('serviceName')}
                        error={errors.serviceName?.message}
                        placeholder="e.g. Auth Service"
                        className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                    />
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
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Steps to Reproduce</label>
                        <textarea
                            {...register('stepsToReproduce')}
                            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none min-h-[120px] transition-all resize-y"
                            placeholder="1. Go to login page&#10;2. Enter credentials&#10;3. Click submit..."
                        />
                    </div>
                </div>
            </div>

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

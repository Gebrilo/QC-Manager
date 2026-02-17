'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { resourcesApi, type Resource } from '@/lib/api';

const resourceSchema = z.object({
    resource_name: z.string().min(1, 'Name is required').max(100),
    weekly_capacity_hrs: z.coerce.number().int().min(1).max(80),
    email: z.string().email('Invalid email').optional().or(z.literal('')),
    department: z.string().max(100).optional().or(z.literal('')),
    role: z.string().max(100).optional().or(z.literal('')),
    is_active: z.boolean()
});

type FormData = z.infer<typeof resourceSchema>;

interface ResourceFormProps {
    resource?: Resource;
    onSuccess: () => void;
    onCancel: () => void;
}

export function ResourceForm({ resource, onSuccess, onCancel }: ResourceFormProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isEdit = !!resource;
    const isLinkedUser = !!resource?.user_id;

    const {
        register,
        handleSubmit,
        formState: { errors }
    } = useForm<FormData>({
        resolver: zodResolver(resourceSchema) as any,
        defaultValues: {
            resource_name: resource?.resource_name || '',
            weekly_capacity_hrs: resource?.weekly_capacity_hrs || 40,
            email: resource?.email || '',
            department: resource?.department || '',
            role: resource?.role || '',
            is_active: resource?.is_active ?? true
        }
    });

    const onSubmit = async (data: FormData) => {
        setIsSubmitting(true);
        setError(null);
        try {
            const payload: Record<string, any> = {
                weekly_capacity_hrs: Number(data.weekly_capacity_hrs),
                department: data.department || undefined,
                role: data.role || undefined,
                is_active: data.is_active
            };

            // Don't send name/email for user-linked resources (synced from user)
            if (!isLinkedUser) {
                payload.resource_name = data.resource_name;
                payload.email = data.email || undefined;
            }

            if (isEdit && resource) {
                await resourcesApi.update(resource.id, payload);
            } else {
                payload.resource_name = data.resource_name;
                payload.email = data.email || undefined;
                await resourcesApi.create(payload);
            }

            onSuccess();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {error && (
                <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 p-4 rounded-xl text-sm flex items-center gap-2">
                    <svg className="w-5 h-5 text-rose-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {error}
                </div>
            )}

            {isLinkedUser && (
                <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-xl px-4 py-3 text-teal-700 dark:text-teal-400 text-sm flex items-center gap-2">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    Linked to a user account. Name and email are synced automatically.
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                    <Input
                        label="Resource Name"
                        {...register('resource_name')}
                        error={errors.resource_name?.message}
                        placeholder="e.g. John Doe"
                        className={`bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 ${isLinkedUser ? 'opacity-60 cursor-not-allowed' : ''}`}
                        required
                        disabled={isLinkedUser}
                    />
                </div>

                <Input
                    label="Email"
                    type="email"
                    {...register('email')}
                    error={errors.email?.message}
                    placeholder="email@example.com"
                    className={`bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 ${isLinkedUser ? 'opacity-60 cursor-not-allowed' : ''}`}
                    disabled={isLinkedUser}
                />

                <Input
                    label="Weekly Capacity (hours)"
                    type="number"
                    step="1"
                    min="1"
                    max="80"
                    {...register('weekly_capacity_hrs')}
                    error={errors.weekly_capacity_hrs?.message}
                    placeholder="40"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                    required
                />

                <Input
                    label="Department"
                    {...register('department')}
                    error={errors.department?.message}
                    placeholder="e.g. Engineering"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />

                <Input
                    label="Role"
                    {...register('role')}
                    error={errors.role?.message}
                    placeholder="e.g. Senior Developer"
                    className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                />

                <div className="md:col-span-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            {...register('is_active')}
                            className="w-5 h-5 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-2 focus:ring-indigo-500/20 bg-slate-50 dark:bg-slate-950"
                        />
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Active Resource</span>
                    </label>
                    {errors.is_active && (
                        <p className="mt-1 text-sm text-rose-600 dark:text-rose-400">{errors.is_active.message}</p>
                    )}
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <Button
                    type="button"
                    variant="outline"
                    onClick={onCancel}
                    disabled={isSubmitting}
                    className="w-24 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                >
                    Cancel
                </Button>
                <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-36 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white shadow-lg shadow-indigo-500/30 border-none"
                >
                    {isSubmitting ? (
                        <>
                            <span className="animate-spin mr-2">⏳</span>
                            {isEdit ? 'Saving...' : 'Creating...'}
                        </>
                    ) : (
                        isEdit ? 'Save Changes' : 'Create Resource'
                    )}
                </Button>
            </div>
        </form>
    );
}

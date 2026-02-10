'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Project } from '@/types';

interface ProjectFormProps {
    initialData?: Project;
    onSuccess: () => void;
    isEdit?: boolean;
}

export default function ProjectForm({ initialData, onSuccess, isEdit = false }: ProjectFormProps) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [logoPreview, setLogoPreview] = useState<string | null>(() => {
        if (initialData?.id && typeof window !== 'undefined') {
            return localStorage.getItem(`project_logo_${initialData.id}`);
        }
        return null;
    });

    const [formData, setFormData] = useState({
        project_id: initialData?.project_id || '',
        name: initialData?.name || '',
        total_weight: initialData?.total_weight || 0,
        priority: initialData?.priority || 'Medium',
        start_date: initialData?.start_date?.split('T')[0] || '',
        target_date: initialData?.target_date?.split('T')[0] || '',
        description: initialData?.description || ''
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: name === 'total_weight' ? parseFloat(value) : value
        }));
    };

    const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setLogoPreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const payload = { ...formData, total_weight: Number(formData.total_weight) };

            let projectId = initialData?.id;

            if (isEdit && projectId) {
                // Assuming PATCH /projects/:id exists or using PUT. 
                // The backend implementation I checked earlier (routes/projects.js) only had GET and POST.
                // I might need to ADD PATCH to the backend if it doesn't exist.
                // Or I can assume full replacement if PUT. 
                // For now, I'll attempt PATCH. If it fails, I'll fix the backend.
                // Actually, I should probably check backend routes again? 
                // Context says `projects.js` has GETs and POST. No update. 
                // I will need to ADD `router.patch('/:id')` to `apps/api/src/routes/projects.js`.
                await fetchApi(`/projects/${projectId}`, {
                    method: 'PATCH',
                    body: JSON.stringify(payload),
                });
            } else {
                const newProject = await fetchApi<Project>('/projects', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                });
                projectId = newProject.id;
            }

            // Store Logo Locally
            if (logoPreview && projectId) {
                localStorage.setItem(`project_logo_${projectId}`, logoPreview);
            }

            onSuccess();
        } catch (error: any) {
            console.error('Failed to save project:', error);
            alert(`Failed to save project: ${error.message || 'Unknown error'}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-8 space-y-8">
            {/* Logo Upload Section */}
            <div className="flex items-center gap-6 pb-6 border-b border-slate-100 dark:border-slate-800">
                <div className="shrink-0">
                    <div className="w-24 h-24 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden border-2 border-dashed border-slate-300 dark:border-slate-700">
                        {logoPreview ? (
                            <img src={logoPreview} alt="Logo Preview" className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-xs text-slate-400 font-medium">No Logo</span>
                        )}
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">Project Logo</label>
                    <p className="text-xs text-slate-500 mb-3">Square image recommended (PNG, JPG)</p>
                    <label className="inline-flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition-colors">
                        Upload Image
                        <input type="file" className="hidden" accept="image/*" onChange={handleLogoChange} />
                    </label>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Project Name</label>
                    <input
                        required
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 hover:border-slate-300 dark:hover:border-slate-700 transition-all outline-none"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Display ID</label>
                    <input
                        required
                        type="text"
                        name="project_id"
                        value={formData.project_id}
                        onChange={handleChange}
                        className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 hover:border-slate-300 dark:hover:border-slate-700 transition-all outline-none"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Total Weight</label>
                    <input
                        type="number"
                        name="total_weight"
                        min="1"
                        max="5"
                        value={formData.total_weight}
                        onChange={handleChange}
                        className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 hover:border-slate-300 dark:hover:border-slate-700 transition-all outline-none"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Priority</label>
                    <select
                        name="priority"
                        value={formData.priority}
                        onChange={handleChange}
                        className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 hover:border-slate-300 dark:hover:border-slate-700 transition-all outline-none"
                    >
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Start Date</label>
                    <input
                        type="date"
                        name="start_date"
                        value={formData.start_date}
                        onChange={handleChange}
                        className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 hover:border-slate-300 dark:hover:border-slate-700 transition-all outline-none"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Target Date</label>
                    <input
                        type="date"
                        name="target_date"
                        value={formData.target_date}
                        onChange={handleChange}
                        className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 hover:border-slate-300 dark:hover:border-slate-700 transition-all outline-none"
                    />
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
                <textarea
                    name="description"
                    rows={3}
                    value={formData.description}
                    onChange={handleChange}
                    className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 hover:border-slate-300 dark:hover:border-slate-700 transition-all outline-none"
                />
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-slate-100 dark:border-slate-800">
                <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Project'}
                </Button>
            </div>
        </form>
    );
}

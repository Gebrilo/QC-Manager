'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { journeysApi, Journey } from '../../../src/lib/api';

export default function AdminJourneysPage() {
    const [journeys, setJourneys] = useState<Journey[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [formData, setFormData] = useState({ slug: '', title: '', description: '', is_active: true, auto_assign_on_activation: true, sort_order: 0, next_journey_id: '' as string, required_xp: 0 });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();

    const loadJourneys = async () => {
        try {
            const data = await journeysApi.list();
            setJourneys(data);
        } catch (err) {
            console.error('Failed to load journeys:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { loadJourneys(); }, []);

    const handleCreate = async () => {
        if (!formData.slug || !formData.title) {
            setError('Slug and title are required');
            return;
        }
        setSaving(true);
        setError('');
        try {
            await journeysApi.create({ ...formData, next_journey_id: formData.next_journey_id || null });
            setShowCreate(false);
            setFormData({ slug: '', title: '', description: '', is_active: true, auto_assign_on_activation: true, sort_order: 0, next_journey_id: '', required_xp: 0 });
            loadJourneys();
        } catch (err: any) {
            setError(err.message || 'Failed to create journey');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string, title: string) => {
        if (!confirm(`Delete journey "${title}"? This will soft-delete it.`)) return;
        try {
            await journeysApi.delete(id);
            loadJourneys();
        } catch (err: any) {
            alert(err.message || 'Failed to delete');
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Manage Journeys</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Create and manage onboarding journeys for employees.</p>
                </div>
                <button
                    onClick={() => setShowCreate(!showCreate)}
                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 transition-colors"
                >
                    {showCreate ? 'Cancel' : 'Create Journey'}
                </button>
            </div>

            {/* Create form */}
            {showCreate && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 mb-6">
                    <h3 className="font-semibold text-slate-900 dark:text-white mb-4">New Journey</h3>
                    {error && (
                        <div className="mb-4 text-sm text-rose-600 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 rounded-lg">{error}</div>
                    )}
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Title</label>
                            <input
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                className="w-full h-10 border border-slate-200 dark:border-slate-700 rounded-lg px-3 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                placeholder="Day-One Essentials"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Slug</label>
                            <input
                                value={formData.slug}
                                onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                                className="w-full h-10 border border-slate-200 dark:border-slate-700 rounded-lg px-3 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                placeholder="day-one-essentials"
                            />
                        </div>
                        <div className="sm:col-span-2">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
                                rows={2}
                            />
                        </div>
                        <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={formData.is_active}
                                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-sm text-slate-700 dark:text-slate-300">Active</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={formData.auto_assign_on_activation}
                                    onChange={(e) => setFormData({ ...formData, auto_assign_on_activation: e.target.checked })}
                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-sm text-slate-700 dark:text-slate-300">Auto-assign on activation</span>
                            </label>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Sort Order</label>
                            <input
                                type="number"
                                value={formData.sort_order}
                                onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                                className="w-24 h-10 border border-slate-200 dark:border-slate-700 rounded-lg px-3 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                            />
                        </div>
                    </div>
                    <div className="mt-4 flex justify-end">
                        <button
                            onClick={handleCreate}
                            disabled={saving}
                            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 transition-colors disabled:opacity-50"
                        >
                            {saving ? 'Creating...' : 'Create Journey'}
                        </button>
                    </div>
                </div>
            )}

            {/* Journeys table */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-slate-800/50">
                        <tr>
                            <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider px-4 py-3">Journey</th>
                            <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider px-4 py-3">Slug</th>
                            <th className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider px-4 py-3">Chapters</th>
                            <th className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider px-4 py-3">Tasks</th>
                            <th className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider px-4 py-3">Status</th>
                            <th className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider px-4 py-3">Auto-Assign</th>
                            <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider px-4 py-3">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {journeys.map((journey) => (
                            <tr key={journey.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                                <td className="px-4 py-3">
                                    <p className="text-sm font-medium text-slate-900 dark:text-white">{journey.title}</p>
                                    {journey.description && (
                                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{journey.description}</p>
                                    )}
                                </td>
                                <td className="px-4 py-3">
                                    <code className="text-xs text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{journey.slug}</code>
                                </td>
                                <td className="px-4 py-3 text-center text-sm text-slate-600 dark:text-slate-400">{journey.chapter_count || 0}</td>
                                <td className="px-4 py-3 text-center text-sm text-slate-600 dark:text-slate-400">{journey.task_count || 0}</td>
                                <td className="px-4 py-3 text-center">
                                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${journey.is_active
                                            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400'
                                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                        }`}>
                                        {journey.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                    {journey.auto_assign_on_activation ? (
                                        <svg className="w-4 h-4 text-emerald-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    ) : (
                                        <svg className="w-4 h-4 text-slate-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <button
                                            onClick={() => router.push(`/settings/journeys/${journey.id}`)}
                                            className="text-xs font-medium px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => handleDelete(journey.id, journey.title)}
                                            className="text-xs font-medium px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-colors"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {journeys.length === 0 && (
                            <tr>
                                <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                                    No journeys found. Create one to get started.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

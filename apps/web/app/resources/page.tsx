'use client';

import { useState, useEffect, useMemo } from 'react';
import { resourcesApi, type Resource } from '@/lib/api';
import { ResourceTable } from '@/components/resources/ResourceTable';
import { ResourceForm } from '@/components/resources/ResourceForm';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/components/providers/AuthProvider';

export default function ResourcesPage() {
    const [resources, setResources] = useState<Resource[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState('');
    const [showDialog, setShowDialog] = useState(false);
    const [editingResource, setEditingResource] = useState<Resource | null>(null);
    const { hasPermission } = useAuth();

    const canCreate = hasPermission('action:resources:create');
    const canEdit = hasPermission('action:resources:edit');
    const canDelete = hasPermission('action:resources:delete');

    const loadResources = async () => {
        try {
            setIsLoading(true);
            const data = await resourcesApi.list();
            setResources(data);
        } catch (err) {
            console.error('Failed to load resources:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadResources();
    }, []);

    const filteredResources = useMemo(() => {
        if (!filter) return resources;
        const lower = filter.toLowerCase();
        return resources.filter(r =>
            r.resource_name.toLowerCase().includes(lower) ||
            r.email?.toLowerCase().includes(lower) ||
            r.department?.toLowerCase().includes(lower) ||
            r.role?.toLowerCase().includes(lower)
        );
    }, [resources, filter]);

    const handleEdit = (resource: Resource) => {
        setEditingResource(resource);
        setShowDialog(true);
    };

    const handleDelete = async (resource: Resource) => {
        if (!confirm('Are you sure you want to delete this resource? This action will mark it as inactive.')) {
            return;
        }
        try {
            await resourcesApi.delete(resource.id);
            await loadResources();
        } catch (err: any) {
            alert(`Failed to delete resource: ${err.message}`);
        }
    };

    const handleFormSuccess = async () => {
        setShowDialog(false);
        setEditingResource(null);
        await loadResources();
    };

    const handleFormCancel = () => {
        setShowDialog(false);
        setEditingResource(null);
    };

    const handleAddNew = () => {
        setEditingResource(null);
        setShowDialog(true);
    };

    return (
        <div className="space-y-6 py-6 px-4 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Resources</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                        Manage team members and track utilization.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {canCreate && (
                        <Button
                            onClick={handleAddNew}
                            className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-500/30 border-none"
                        >
                            + New Resource
                        </Button>
                    )}
                </div>
            </div>

            {/* Simple Search Bar for Resources */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
                <div className="relative max-w-md">
                    <input
                        type="text"
                        placeholder="Search resources by name, role, department..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border-none rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                    />
                    <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    {filter && (
                        <button
                            onClick={() => setFilter('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {/* Resource Table */}
            <ResourceTable
                resources={filteredResources}
                isLoading={isLoading}
                onEdit={canEdit ? handleEdit : undefined}
                onDelete={canDelete ? handleDelete : undefined}
            />

            {/* Add/Edit Dialog */}
            {showDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-slate-200 dark:border-slate-800">
                            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                                {editingResource ? 'Edit Resource' : 'Add New Resource'}
                            </h2>
                        </div>
                        <div className="p-6">
                            <ResourceForm
                                resource={editingResource || undefined}
                                onSuccess={handleFormSuccess}
                                onCancel={handleFormCancel}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

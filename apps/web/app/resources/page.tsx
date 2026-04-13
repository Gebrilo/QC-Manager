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
    const [autoMapStatus, setAutoMapStatus] = useState<string | null>(null);
    const [isAutoMapping, setIsAutoMapping] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Resource | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const { hasPermission, user } = useAuth();

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

    const handleDelete = (resource: Resource) => {
        setDeleteError(null);
        setDeleteTarget(resource);
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        setDeleteError(null);
        try {
            await resourcesApi.delete(deleteTarget.id);
            setDeleteTarget(null);
            await loadResources();
        } catch (err: any) {
            setDeleteError(err.message);
        } finally {
            setIsDeleting(false);
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

    const handleAutoMap = async () => {
        setIsAutoMapping(true);
        setAutoMapStatus(null);
        try {
            const result = await resourcesApi.autoMap();
            setAutoMapStatus(result.message);
            if (result.mapped > 0) await loadResources();
        } catch (err: any) {
            setAutoMapStatus(`Error: ${err.message}`);
        } finally {
            setIsAutoMapping(false);
        }
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
                    {(user?.role === 'admin' || user?.role === 'manager') && (
                        <Button
                            onClick={handleAutoMap}
                            disabled={isAutoMapping}
                            variant="outline"
                            className="border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                            {isAutoMapping ? 'Mapping…' : 'Auto-Map Users'}
                        </Button>
                    )}
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

            {/* Auto-map result banner */}
            {autoMapStatus && (
                <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-sm text-indigo-800 dark:text-indigo-300">
                    <span>{autoMapStatus}</span>
                    <button onClick={() => setAutoMapStatus(null)} className="text-indigo-500 hover:text-indigo-700">✕</button>
                </div>
            )}

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

            {/* Delete Confirmation Modal */}
            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-sm w-full p-6 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                                <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-base font-semibold text-slate-900 dark:text-white">Delete Resource</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                                    Mark <span className="font-medium text-slate-700 dark:text-slate-200">{deleteTarget.resource_name}</span> as inactive?
                                </p>
                            </div>
                        </div>
                        {deleteError && (
                            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{deleteError}</p>
                        )}
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => { setDeleteTarget(null); setDeleteError(null); }}
                                disabled={isDeleting}
                                className="px-4 py-2 text-sm font-medium rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDelete}
                                disabled={isDeleting}
                                className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                            >
                                {isDeleting ? 'Deleting...' : 'Delete Resource'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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

'use client';

import { useState, useEffect, useMemo } from 'react';
import { resourcesApi, type Resource } from '@/lib/api';
import { ResourceTable } from '@/components/resources/ResourceTable';
import { ResourceForm } from '@/components/resources/ResourceForm';
import { FilterBar } from '@/components/ui/FilterBar';
import { Button } from '@/components/ui/Button';

export default function ResourcesPage() {
    const [resources, setResources] = useState<Resource[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState('');
    const [showDialog, setShowDialog] = useState(false);
    const [editingResource, setEditingResource] = useState<Resource | null>(null);

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

    // Listen for FilterBar's custom event
    useEffect(() => {
        const handleSearch = (e: CustomEvent) => {
            setFilter(e.detail || '');
        };
        window.addEventListener('qc-search', handleSearch as EventListener);
        return () => window.removeEventListener('qc-search', handleSearch as EventListener);
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
                    <Button 
                        onClick={handleAddNew}
                        className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-500/30 border-none"
                    >
                        + New Resource
                    </Button>
                </div>
            </div>

            {/* Filter Bar */}
            <FilterBar />

            {/* Resource Table */}
            <ResourceTable 
                resources={filteredResources} 
                isLoading={isLoading} 
                onEdit={handleEdit}
                onDelete={handleDelete}
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

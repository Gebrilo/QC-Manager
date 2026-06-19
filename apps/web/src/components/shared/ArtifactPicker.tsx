'use client';

import { useEffect, useMemo, useState } from 'react';
import { searchApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
    getDirectionalRelationshipLabel,
    type LinkRelationshipDirection,
    type LinkRelationshipOption,
} from '@/lib/linkRelationships';
import { X } from 'lucide-react';

export interface ArtifactPickerItem {
    type: string;
    id: string;
    display_id: string;
    title: string;
    project_id: string;
    project_name: string;
    status: string;
    priority?: string | null;
    assignee_name?: string | null;
    url: string;
}

// All types the search API can return. Used to populate the type dropdown.
const SEARCHABLE_TYPE_OPTIONS = [
    { value: 'task', label: 'Task' },
    { value: 'bug', label: 'Bug' },
    { value: 'test_case', label: 'Test Case' },
    { value: 'user_story', label: 'User Story' },
    { value: 'test_suite', label: 'Test Suite' },
    { value: 'test_run', label: 'Test Run' },
];

interface ArtifactPickerProps {
    open: boolean;
    artifactType: 'task' | 'test_case' | 'user_story' | 'bug' | 'test_suite' | 'test_run';
    title: string;
    projectId?: string | null;
    excludeIds?: string[];
    relationshipOptions?: readonly LinkRelationshipOption[];
    relationshipDirection?: LinkRelationshipDirection;
    onClose: () => void;
    onConfirm: (items: ArtifactPickerItem[], relationshipType?: string) => Promise<void>;
}

export function ArtifactPicker({
    open,
    artifactType,
    title,
    projectId,
    excludeIds = [],
    relationshipOptions = [],
    relationshipDirection = 'from',
    onClose,
    onConfirm,
}: ArtifactPickerProps) {
    const [query, setQuery] = useState('');
    const [selectedType, setSelectedType] = useState<string>(artifactType);
    const [statusFilter, setStatusFilter] = useState('');
    const [priorityFilter, setPriorityFilter] = useState('');
    const [assigneeFilter, setAssigneeFilter] = useState('');
    const [items, setItems] = useState<ArtifactPickerItem[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [hideLinked, setHideLinked] = useState(true);
    const [selectedRelationshipType, setSelectedRelationshipType] = useState(relationshipOptions[0]?.value || '');
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) {
            setQuery('');
            setItems([]);
            setSelectedIds([]);
            setStatusFilter('');
            setPriorityFilter('');
            setAssigneeFilter('');
            setError(null);
        }
    }, [open]);

    // Reset type filter when the section's expected type changes (different
    // section opens the picker) — the dropdown defaults to the section's type.
    useEffect(() => {
        if (open) setSelectedType(artifactType);
    }, [open, artifactType]);

    useEffect(() => {
        if (!open) return;
        setSelectedRelationshipType(relationshipOptions[0]?.value || '');
    }, [open, relationshipOptions]);

    useEffect(() => {
        if (!open || query.trim().length < 2) {
            setItems([]);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError(null);
        const timeout = window.setTimeout(async () => {
            try {
                const response = await searchApi.search({
                    q: query.trim(),
                    type: selectedType,
                    project_id: projectId || undefined,
                    status: statusFilter.trim() || undefined,
                    priority: priorityFilter.trim() || undefined,
                    assignee: assigneeFilter.trim() || undefined,
                    limit: 25,
                });
                if (!cancelled) setItems(response.data as ArtifactPickerItem[]);
            } catch (err: any) {
                if (!cancelled) setError(err.message || 'Search failed');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }, 250);

        return () => {
            cancelled = true;
            window.clearTimeout(timeout);
        };
    }, [selectedType, projectId, statusFilter, priorityFilter, assigneeFilter, open, query]);

    const visibleItems = useMemo(() => {
        if (!hideLinked) return items;
        const excluded = new Set(excludeIds);
        return items.filter(item => !excluded.has(item.id));
    }, [excludeIds, hideLinked, items]);

    const selectedItems = visibleItems.filter(item => selectedIds.includes(item.id));
    const relationshipSelectOptions = relationshipOptions.map(option => ({
        value: option.value,
        label: getDirectionalRelationshipLabel(option.value, relationshipDirection),
    }));

    const toggleSelected = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
    };

    const submit = async () => {
        if (selectedItems.length === 0) return;
        setSubmitting(true);
        setError(null);
        try {
            await onConfirm(selectedItems, selectedRelationshipType || relationshipOptions[0]?.value);
            onClose();
        } catch (err: any) {
            setError(err.message || 'Could not add links');
        } finally {
            setSubmitting(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                        aria-label="Close"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="space-y-3 p-4">
                    <Input
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                        placeholder="Search by ID or title"
                        autoFocus
                    />

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <Select
                            label="Type"
                            value={selectedType}
                            onChange={event => setSelectedType(event.target.value)}
                            options={SEARCHABLE_TYPE_OPTIONS}
                        />
                        <Input
                            label="Status"
                            value={statusFilter}
                            onChange={event => setStatusFilter(event.target.value)}
                            placeholder="e.g. In Progress"
                        />
                        <Input
                            label="Priority"
                            value={priorityFilter}
                            onChange={event => setPriorityFilter(event.target.value)}
                            placeholder="e.g. High"
                        />
                        <Input
                            label="Assignee ID"
                            value={assigneeFilter}
                            onChange={event => setAssigneeFilter(event.target.value)}
                            placeholder="user UUID"
                        />
                    </div>

                    {relationshipSelectOptions.length > 0 && (
                        <Select
                            label="Relationship"
                            value={selectedRelationshipType}
                            onChange={event => setSelectedRelationshipType(event.target.value)}
                            options={relationshipSelectOptions}
                        />
                    )}

                    <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <input
                            type="checkbox"
                            checked={hideLinked}
                            onChange={event => setHideLinked(event.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                        />
                        Hide already linked
                    </label>

                    {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}

                    <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
                        {loading ? (
                            <div className="space-y-2 p-3">
                                {[0, 1, 2].map(index => <div key={index} className="h-11 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />)}
                            </div>
                        ) : query.trim().length < 2 ? (
                            <p className="p-4 text-sm text-slate-500">Enter at least 2 characters.</p>
                        ) : visibleItems.length === 0 ? (
                            <p className="p-4 text-sm text-slate-500">No matching artifacts.</p>
                        ) : (
                            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                                {visibleItems.map(item => (
                                    <li key={item.id}>
                                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-900">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(item.id)}
                                                onChange={() => toggleSelected(item.id)}
                                                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                                            />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">
                                                    {item.display_id} - {item.title}
                                                </span>
                                                <span className="block truncate text-xs text-slate-500">
                                                    {item.project_name || 'No project'} · {item.status}
                                                    {item.priority ? ` · ${item.priority}` : ''}
                                                    {item.assignee_name ? ` · @${item.assignee_name}` : ''}
                                                </span>
                                            </span>
                                        </label>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
                    <Button type="button" variant="primary" onClick={submit} disabled={submitting || selectedItems.length === 0}>
                        {submitting ? 'Adding...' : `Add ${selectedItems.length || ''}`.trim()}
                    </Button>
                </div>
            </div>
        </div>
    );
}

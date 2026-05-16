'use client';

import { useEffect, useMemo, useState } from 'react';
import { searchApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { X } from 'lucide-react';

export interface ArtifactPickerItem {
    type: string;
    id: string;
    display_id: string;
    title: string;
    project_id: string;
    project_name: string;
    status: string;
    url: string;
}

interface ArtifactPickerProps {
    open: boolean;
    artifactType: 'task' | 'test_case' | 'user_story' | 'bug';
    title: string;
    projectId?: string | null;
    excludeIds?: string[];
    onClose: () => void;
    onConfirm: (items: ArtifactPickerItem[]) => Promise<void>;
}

export function ArtifactPicker({
    open,
    artifactType,
    title,
    projectId,
    excludeIds = [],
    onClose,
    onConfirm,
}: ArtifactPickerProps) {
    const [query, setQuery] = useState('');
    const [items, setItems] = useState<ArtifactPickerItem[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [hideLinked, setHideLinked] = useState(true);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) {
            setQuery('');
            setItems([]);
            setSelectedIds([]);
            setError(null);
        }
    }, [open]);

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
                    type: artifactType,
                    project_id: projectId || undefined,
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
    }, [artifactType, open, projectId, query]);

    const visibleItems = useMemo(() => {
        if (!hideLinked) return items;
        const excluded = new Set(excludeIds);
        return items.filter(item => !excluded.has(item.id));
    }, [excludeIds, hideLinked, items]);

    const selectedItems = visibleItems.filter(item => selectedIds.includes(item.id));

    const toggleSelected = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
    };

    const submit = async () => {
        if (selectedItems.length === 0) return;
        setSubmitting(true);
        setError(null);
        try {
            await onConfirm(selectedItems);
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

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { ArtifactPicker, ArtifactPickerItem } from './ArtifactPicker';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/components/providers/AuthProvider';
import {
    getDirectionalRelationshipLabel,
    type LinkRelationshipDirection,
    type LinkRelationshipOption,
} from '@/lib/linkRelationships';

export interface LinkedArtifactRow {
    id: string;
    artifactId: string;
    displayId: string;
    title: string;
    status?: string;
    href?: string;
    source?: 'qc' | 'tuleap';
    relationshipType?: string;
    deleted?: boolean;
    meta?: string;
}

export interface LinkedArtifactsSectionConfig {
    title: string;
    emptyLabel: string;
    artifactType?: 'task' | 'test_case' | 'user_story' | 'bug' | 'test_suite' | 'test_run';
    pickerTitle?: string;
    readOnly?: boolean;
    viewPermission?: string;
    editPermission?: string;
    relationshipOptions?: readonly LinkRelationshipOption[];
    relationshipDirection?: LinkRelationshipDirection;
    addLabel?: string;
    load: () => Promise<LinkedArtifactRow[]>;
    add?: (items: ArtifactPickerItem[], relationshipType?: string) => Promise<void>;
    remove?: (row: LinkedArtifactRow) => Promise<void>;
}

interface LinkedArtifactsSectionProps {
    config: LinkedArtifactsSectionConfig;
    projectId?: string | null;
}

export function LinkedArtifactsSection({ config, projectId }: LinkedArtifactsSectionProps) {
    const { hasPermission } = useAuth();
    const [rows, setRows] = useState<LinkedArtifactRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [removingId, setRemovingId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setRows(await config.load());
        } catch (err: any) {
            setError(err.message || 'Could not load links');
        } finally {
            setLoading(false);
        }
    }, [config]);

    useEffect(() => { load(); }, [load]);

    const addItems = async (items: ArtifactPickerItem[], relationshipType?: string) => {
        if (!config.add) return;
        await config.add(items, relationshipType);
        await load();
    };

    const removeRow = async (row: LinkedArtifactRow) => {
        if (!config.remove || row.source === 'tuleap') return;
        setRemovingId(row.id);
        setError(null);
        try {
            await config.remove(row);
            await load();
        } catch (err: any) {
            setError(err.message || 'Could not remove link');
        } finally {
            setRemovingId(null);
        }
    };

    const canViewRows = !config.viewPermission || hasPermission(config.viewPermission);
    const canEdit = !config.editPermission || hasPermission(config.editPermission);
    const canAdd = !config.readOnly && canEdit && Boolean(config.artifactType && config.add);
    const canRemove = !config.readOnly && canEdit && Boolean(config.remove);

    if (!loading && !error && rows.length === 0 && !canAdd) return null;

    return (
        <section className="rounded-xl border border-slate-200 bg-white/80 dark:border-slate-800 dark:bg-slate-950/70">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{config.title}</h3>
                    <p className="mt-0.5 text-xs text-slate-500">{rows.length} linked</p>
                </div>
                <div className="flex items-center gap-2">
                    {error && (
                        <Button type="button" variant="ghost" size="sm" onClick={load}>
                            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                            Retry
                        </Button>
                    )}
                    {canAdd && (
                        <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
                            <Plus className="mr-1.5 h-3.5 w-3.5" />
                            {config.addLabel || 'Add'}
                        </Button>
                    )}
                </div>
            </div>

            <div className="p-4">
                {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}

                {loading ? (
                    <div className="space-y-2">
                        {[0, 1, 2].map(index => <div key={index} className="h-12 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />)}
                    </div>
                ) : !canViewRows ? (
                    <p className="text-sm text-slate-500">
                        {rows.length} hidden due to permissions.
                    </p>
                ) : rows.length === 0 ? (
                    <p className="text-sm text-slate-500">{config.emptyLabel}</p>
                ) : (
                    <ul className="space-y-2">
                        {rows.map(row => (
                            <li
                                key={row.id}
                                className={`flex items-center justify-between gap-3 rounded-lg border border-slate-100 p-3 dark:border-slate-800 ${row.deleted ? 'opacity-60' : ''}`}
                            >
                                <div className="min-w-0 flex-1">
                                    {row.href && !row.deleted ? (
                                        <Link href={row.href} className="block truncate text-sm font-medium text-slate-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400">
                                            {row.displayId} - {row.title}
                                        </Link>
                                    ) : (
                                        <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-300">
                                            {row.displayId}{row.deleted ? ' (deleted)' : ''} - {row.title}
                                        </p>
                                    )}
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                        {row.status && <span>{row.status}</span>}
                                        {row.relationshipType && (
                                            <span>{getDirectionalRelationshipLabel(row.relationshipType, config.relationshipDirection || 'from')}</span>
                                        )}
                                        {row.meta && <span>{row.meta}</span>}
                                    </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                    {row.source && (
                                        <Badge variant={row.source === 'tuleap' ? 'secondary' : 'info'}>
                                            {row.source === 'tuleap' ? 'Tuleap' : 'QC'}
                                        </Badge>
                                    )}
                                    {canRemove && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            disabled={row.source === 'tuleap' || removingId === row.id}
                                            onClick={() => removeRow(row)}
                                            title={row.source === 'tuleap' ? 'Tuleap-sourced links cannot be removed here' : row.deleted ? 'Unlink to clean up' : 'Unlink'}
                                        >
                                            <Trash2 className="h-4 w-4 text-rose-500" />
                                        </Button>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {config.artifactType && (
                <ArtifactPicker
                    open={pickerOpen}
                    artifactType={config.artifactType}
                    title={config.pickerTitle || `Add ${config.title}`}
                    projectId={projectId}
                    excludeIds={rows.map(row => row.artifactId)}
                    relationshipOptions={config.relationshipOptions}
                    relationshipDirection={config.relationshipDirection}
                    onClose={() => setPickerOpen(false)}
                    onConfirm={addItems}
                />
            )}
        </section>
    );
}

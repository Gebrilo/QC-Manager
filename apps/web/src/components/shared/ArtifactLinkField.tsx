'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { RelationshipPicker } from './RelationshipPicker';
import { addLinkValue, pickStoredValue, removeLinkValue, type ArtifactValueKey } from '@/lib/forms/artifactLink';

export interface ArtifactTypeOption {
    value: 'task' | 'bug' | 'test_case' | 'user_story' | 'test_suite' | 'test_run';
    label: string;
}

interface ResolvedLabel {
    display_id?: string;
    title?: string;
}

interface ArtifactLinkFieldProps {
    /** Stored value(s). An array when `multiple`, otherwise a single string. */
    value: string | string[];
    onChange: (value: string | string[]) => void;
    /** Searchable artifact types. More than one renders a type toggle. */
    types: ArtifactTypeOption[];
    /** Which property of the chosen artifact to persist. Defaults to the UUID. */
    valueKey?: ArtifactValueKey;
    multiple?: boolean;
    projectId?: string;
    placeholder?: string;
    disabled?: boolean;
    /**
     * Resolve a stored value into a human label. Needed when `valueKey='id'`
     * so existing links render as names instead of raw UUIDs.
     */
    resolveValue?: (storedValue: string) => Promise<ResolvedLabel | null>;
}

function chipLabel(stored: string, resolved?: ResolvedLabel): string {
    if (resolved) {
        return [resolved.display_id, resolved.title].filter(Boolean).join(' · ') || stored;
    }
    return stored;
}

/**
 * Inline artifact-link control: a search dropdown that lists matching artifacts
 * and stores the chosen one(s) — replacing free-text ID inputs. Single-select
 * collapses to a chip once chosen; multi-select keeps the dropdown for adding more.
 */
export function ArtifactLinkField({
    value,
    onChange,
    types,
    valueKey = 'id',
    multiple = false,
    projectId,
    placeholder,
    disabled = false,
    resolveValue,
}: ArtifactLinkFieldProps) {
    const values = Array.isArray(value) ? value : value ? [value] : [];
    const [selectedType, setSelectedType] = useState<ArtifactTypeOption['value']>(types[0]?.value);
    const [labels, setLabels] = useState<Record<string, ResolvedLabel>>({});
    // Ids we've already tried to resolve — kept on failure too, so a broken
    // (deleted/forbidden) link is attempted once, not re-fetched every render.
    const attempted = useRef<Set<string>>(new Set());

    useEffect(() => {
        setSelectedType(prev => (types.some(t => t.value === prev) ? prev : types[0]?.value));
    }, [types]);

    // Resolve stored ids into labels (only meaningful when valueKey='id').
    useEffect(() => {
        if (!resolveValue) return;
        let cancelled = false;
        for (const v of values) {
            if (labels[v] || attempted.current.has(v)) continue;
            attempted.current.add(v);
            resolveValue(v)
                .then(res => {
                    if (!cancelled && res) setLabels(prev => ({ ...prev, [v]: res }));
                })
                .catch(() => {});
        }
        return () => { cancelled = true; };
    }, [values, resolveValue, labels]);

    const addItem = useCallback((item: { id: string; display_id: string; title: string }) => {
        const stored = pickStoredValue(item, valueKey);
        if (!stored) return;
        setLabels(prev => ({ ...prev, [stored]: { display_id: item.display_id, title: item.title } }));
        onChange(addLinkValue(values, stored, multiple));
    }, [multiple, onChange, valueKey, values]);

    const removeItem = useCallback((stored: string) => {
        onChange(removeLinkValue(values, stored, multiple));
    }, [multiple, onChange, values]);

    const showPicker = !disabled && (multiple || values.length === 0);
    // RelationshipPicker excludes by artifact id, which only lines up when we
    // store ids (multi-select case). For display_id/title storage the dropdown
    // is hidden once a value is chosen, so exclusion is unnecessary.
    const excludeIds = valueKey === 'id' ? values : [];

    return (
        <div className="space-y-2">
            {values.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {values.map(v => (
                        <span
                            key={v}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-300"
                        >
                            <span className="truncate max-w-[240px]">{chipLabel(v, labels[v])}</span>
                            {!disabled && (
                                <button
                                    type="button"
                                    onClick={() => removeItem(v)}
                                    aria-label="Remove link"
                                    className="shrink-0 rounded p-0.5 hover:bg-white/70 dark:hover:bg-slate-800"
                                >
                                    <X className="h-3 w-3" aria-hidden />
                                </button>
                            )}
                        </span>
                    ))}
                </div>
            )}

            {showPicker && (
                <div className="space-y-2">
                    {types.length > 1 && (
                        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
                            {types.map(t => (
                                <button
                                    key={t.value}
                                    type="button"
                                    onClick={() => setSelectedType(t.value)}
                                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                                        selectedType === t.value
                                            ? 'bg-indigo-600 text-white'
                                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                    }`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    )}
                    <RelationshipPicker
                        searchType={selectedType}
                        projectId={projectId}
                        excludeIds={excludeIds}
                        onAdd={addItem}
                        searchPlaceholder={placeholder}
                    />
                </div>
            )}
        </div>
    );
}

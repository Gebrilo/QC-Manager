'use client';

import type { ReactNode } from 'react';
import { Filter, Search, X } from 'lucide-react';

export type ActivityFilterSlot =
    | 'search'
    | 'project'
    | 'status'
    | 'assignee'
    | 'author'
    | 'priority'
    | 'severity'
    | 'suiteType'
    | 'readinessScope'
    | 'environment'
    | 'versionTag'
    | 'source'
    | 'date'
    | 'relatedArtifact';

export type ActivitySourceFilter = '' | 'local' | 'tuleap';

export interface ActivityFilterOption {
    value: string;
    label: string;
}

export interface ActivityRelatedArtifactTypeOption extends ActivityFilterOption {
    searchTypes?: string[];
}

/**
 * Slot-config-driven activity filter state. The owning page is responsible for
 * serializing this value to URL query params and passing it to its list query.
 */
export interface ActivityFiltersValue {
    search: string;
    projectIds: string[];
    statuses: string[];
    assigneeIds: string[];
    authorIds: string[];
    priorities: string[];
    severities: string[];
    suiteTypes: string[];
    readinessScopes: string[];
    environments: string[];
    versionTags: string[];
    source: ActivitySourceFilter;
    createdFrom: string;
    createdTo: string;
    updatedFrom: string;
    updatedTo: string;
    relatedType: string;
    relatedId: string;
}

export interface ActivityFiltersConfig {
    slots: ActivityFilterSlot[];
    statusOptions?: ActivityFilterOption[];
    priorityOptions?: ActivityFilterOption[];
    severityOptions?: ActivityFilterOption[];
    suiteTypeOptions?: ActivityFilterOption[];
    readinessScopeOptions?: ActivityFilterOption[];
    environmentOptions?: ActivityFilterOption[];
    versionTagOptions?: ActivityFilterOption[];
    relatedArtifactTypes?: ActivityRelatedArtifactTypeOption[];
}

interface ActivityFiltersProps {
    value: ActivityFiltersValue;
    config: ActivityFiltersConfig;
    projects?: ActivityFilterOption[];
    assignees?: ActivityFilterOption[];
    authors?: ActivityFilterOption[];
    relatedArtifacts?: ActivityFilterOption[];
    relatedArtifactPlaceholder?: string;
    resultSummary?: string;
    onChange: (next: ActivityFiltersValue) => void;
    onRelatedArtifactSearch?: (query: string, relatedType: string) => void;
}

export const EMPTY_ACTIVITY_FILTERS: ActivityFiltersValue = {
    search: '',
    projectIds: [],
    statuses: [],
    assigneeIds: [],
    authorIds: [],
    priorities: [],
    severities: [],
    suiteTypes: [],
    readinessScopes: [],
    environments: [],
    versionTags: [],
    source: '',
    createdFrom: '',
    createdTo: '',
    updatedFrom: '',
    updatedTo: '',
    relatedType: '',
    relatedId: '',
};

function hasSlot(config: ActivityFiltersConfig, slot: ActivityFilterSlot) {
    return config.slots.includes(slot);
}

function toggleValue(values: string[], value: string) {
    return values.includes(value)
        ? values.filter(item => item !== value)
        : [...values, value];
}

function formatSelectedLabel(options: ActivityFilterOption[], values: string[], fallback: string) {
    if (values.length === 0) return fallback;
    if (values.length === 1) return options.find(option => option.value === values[0])?.label || values[0];
    return `${values.length} selected`;
}

function hasActiveFilters(value: ActivityFiltersValue) {
    return Boolean(
        value.search ||
        value.projectIds.length ||
        value.statuses.length ||
        value.assigneeIds.length ||
        value.authorIds.length ||
        value.priorities.length ||
        value.severities.length ||
        value.suiteTypes.length ||
        value.readinessScopes.length ||
        value.environments.length ||
        value.versionTags.length ||
        value.source ||
        value.createdFrom ||
        value.createdTo ||
        value.updatedFrom ||
        value.updatedTo ||
        value.relatedType ||
        value.relatedId
    );
}

function selectClassName(extra = '') {
    return `h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 ${extra}`;
}

function MultiSelectFilter({
    label,
    values,
    options,
    fallback,
    onChange,
}: {
    label: string;
    values: string[];
    options: ActivityFilterOption[];
    fallback: string;
    onChange: (values: string[]) => void;
}) {
    return (
        <details className="group relative">
            <summary className={`${selectClassName('flex min-w-[150px] cursor-pointer list-none items-center justify-between gap-2 pr-2')} marker:hidden`}>
                <span className="truncate">{formatSelectedLabel(options, values, fallback)}</span>
                <span className="text-slate-400 transition group-open:rotate-180">v</span>
            </summary>
            <div className="absolute left-0 top-12 z-30 max-h-72 min-w-[220px] overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
                {options.length === 0 ? (
                    <div className="px-2 py-2 text-sm text-slate-500">No options</div>
                ) : options.map(option => (
                    <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800">
                        <input
                            type="checkbox"
                            checked={values.includes(option.value)}
                            onChange={() => onChange(toggleValue(values, option.value))}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>{option.label}</span>
                    </label>
                ))}
            </div>
        </details>
    );
}

function ActiveChip({ children }: { children: ReactNode }) {
    return (
        <span className="rounded-md bg-indigo-50 px-2 py-1 text-xs text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
            {children}
        </span>
    );
}

export function ActivityFilters({
    value,
    config,
    projects = [],
    assignees = [],
    authors = [],
    relatedArtifacts = [],
    relatedArtifactPlaceholder = 'Search related artifact',
    resultSummary,
    onChange,
    onRelatedArtifactSearch,
}: ActivityFiltersProps) {
    const setValue = (patch: Partial<ActivityFiltersValue>) => {
        onChange({ ...value, ...patch });
    };
    const active = hasActiveFilters(value);

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                    {hasSlot(config, 'search') && (
                        <div className="relative min-w-0 flex-1">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                                type="search"
                                placeholder="Search"
                                value={value.search}
                                onChange={(event) => setValue({ search: event.target.value })}
                                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                            />
                        </div>
                    )}

                    <div className="flex flex-wrap items-start gap-3">
                        {hasSlot(config, 'project') && (
                            <MultiSelectFilter
                                label="Projects"
                                values={value.projectIds}
                                options={projects}
                                fallback="All Projects"
                                onChange={(projectIds) => setValue({ projectIds })}
                            />
                        )}

                        {hasSlot(config, 'status') && (
                            <MultiSelectFilter
                                label="Statuses"
                                values={value.statuses}
                                options={config.statusOptions || []}
                                fallback="All Statuses"
                                onChange={(statuses) => setValue({ statuses })}
                            />
                        )}

                        {hasSlot(config, 'assignee') && (
                            <MultiSelectFilter
                                label="Assignees"
                                values={value.assigneeIds}
                                options={assignees}
                                fallback="All Assignees"
                                onChange={(assigneeIds) => setValue({ assigneeIds })}
                            />
                        )}

                        {hasSlot(config, 'author') && (
                            <MultiSelectFilter
                                label="Authors"
                                values={value.authorIds}
                                options={authors}
                                fallback="All Authors"
                                onChange={(authorIds) => setValue({ authorIds })}
                            />
                        )}

                        {hasSlot(config, 'priority') && (
                            <MultiSelectFilter
                                label="Priorities"
                                values={value.priorities}
                                options={config.priorityOptions || []}
                                fallback="All Priorities"
                                onChange={(priorities) => setValue({ priorities })}
                            />
                        )}

                        {hasSlot(config, 'severity') && (
                            <MultiSelectFilter
                                label="Severities"
                                values={value.severities}
                                options={config.severityOptions || []}
                                fallback="All Severities"
                                onChange={(severities) => setValue({ severities })}
                            />
                        )}

                        {hasSlot(config, 'suiteType') && (
                            <MultiSelectFilter
                                label="Suite Types"
                                values={value.suiteTypes}
                                options={config.suiteTypeOptions || []}
                                fallback="All Suite Types"
                                onChange={(suiteTypes) => setValue({ suiteTypes })}
                            />
                        )}

                        {hasSlot(config, 'readinessScope') && (
                            <MultiSelectFilter
                                label="Readiness Scope"
                                values={value.readinessScopes}
                                options={config.readinessScopeOptions || []}
                                fallback="All Scopes"
                                onChange={(readinessScopes) => setValue({ readinessScopes })}
                            />
                        )}

                        {hasSlot(config, 'environment') && (
                            <MultiSelectFilter
                                label="Environments"
                                values={value.environments}
                                options={config.environmentOptions || []}
                                fallback="All Environments"
                                onChange={(environments) => setValue({ environments })}
                            />
                        )}

                        {hasSlot(config, 'versionTag') && (
                            <MultiSelectFilter
                                label="Version Tags"
                                values={value.versionTags}
                                options={config.versionTagOptions || []}
                                fallback="All Versions"
                                onChange={(versionTags) => setValue({ versionTags })}
                            />
                        )}

                        {hasSlot(config, 'source') && (
                            <div className="flex h-10 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                                {(['local', 'tuleap'] as const).map(source => (
                                    <button
                                        key={source}
                                        type="button"
                                        onClick={() => setValue({ source: value.source === source ? '' : source })}
                                        className={`px-3 text-sm transition ${value.source === source
                                            ? 'bg-indigo-600 text-white'
                                            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                                        }`}
                                    >
                                        {source === 'local' ? 'Local' : 'Tuleap'}
                                    </button>
                                ))}
                            </div>
                        )}

                        {hasSlot(config, 'date') && (
                            <details className="group relative">
                                <summary className={`${selectClassName('flex min-w-[128px] cursor-pointer list-none items-center justify-between gap-2 pr-2')} marker:hidden`}>
                                    <span>Date</span>
                                    <span className="text-slate-400 transition group-open:rotate-180">v</span>
                                </summary>
                                <div className="absolute right-0 top-12 z-30 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                                    <div className="grid grid-cols-2 gap-3">
                                        <label className="text-xs font-medium text-slate-500">
                                            Created From
                                            <input type="date" value={value.createdFrom} onChange={(event) => setValue({ createdFrom: event.target.value })} className={selectClassName('mt-1 w-full')} />
                                        </label>
                                        <label className="text-xs font-medium text-slate-500">
                                            Created To
                                            <input type="date" value={value.createdTo} onChange={(event) => setValue({ createdTo: event.target.value })} className={selectClassName('mt-1 w-full')} />
                                        </label>
                                        <label className="text-xs font-medium text-slate-500">
                                            Updated From
                                            <input type="date" value={value.updatedFrom} onChange={(event) => setValue({ updatedFrom: event.target.value })} className={selectClassName('mt-1 w-full')} />
                                        </label>
                                        <label className="text-xs font-medium text-slate-500">
                                            Updated To
                                            <input type="date" value={value.updatedTo} onChange={(event) => setValue({ updatedTo: event.target.value })} className={selectClassName('mt-1 w-full')} />
                                        </label>
                                    </div>
                                </div>
                            </details>
                        )}

                        {hasSlot(config, 'relatedArtifact') && (
                            <div className="flex flex-wrap items-center gap-2">
                                <select
                                    value={value.relatedType}
                                    onChange={(event) => setValue({ relatedType: event.target.value, relatedId: '' })}
                                    className={selectClassName('min-w-[150px]')}
                                >
                                    <option value="">Related Type</option>
                                    {(config.relatedArtifactTypes || []).map(option => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                                <input
                                    type="search"
                                    placeholder={relatedArtifactPlaceholder}
                                    disabled={!value.relatedType}
                                    value={onRelatedArtifactSearch ? undefined : value.relatedId}
                                    onChange={(event) => {
                                        if (onRelatedArtifactSearch) {
                                            onRelatedArtifactSearch(event.target.value, value.relatedType);
                                        } else {
                                            setValue({ relatedId: event.target.value.trim() });
                                        }
                                    }}
                                    className="h-10 min-w-[200px] rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                                />
                                <select
                                    value={value.relatedId}
                                    disabled={!value.relatedType}
                                    onChange={(event) => setValue({ relatedId: event.target.value })}
                                    className={selectClassName('min-w-[180px] disabled:cursor-not-allowed disabled:opacity-50')}
                                >
                                    <option value="">Any related item</option>
                                    {relatedArtifacts.map(option => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {active && (
                            <button
                                type="button"
                                onClick={() => onChange(EMPTY_ACTIVITY_FILTERS)}
                                className="flex h-10 items-center gap-1 rounded-lg px-3 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-indigo-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-indigo-300"
                            >
                                <X className="h-4 w-4" />
                                Clear
                            </button>
                        )}
                    </div>
                </div>

                {active && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                        <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                            <Filter className="h-3.5 w-3.5" />
                            Active
                        </span>
                        {value.search && <ActiveChip>Search: "{value.search}"</ActiveChip>}
                        {value.projectIds.length > 0 && <ActiveChip>Projects: {value.projectIds.length}</ActiveChip>}
                        {value.statuses.length > 0 && <ActiveChip>Status: {value.statuses.join(', ')}</ActiveChip>}
                        {value.assigneeIds.length > 0 && <ActiveChip>Assignees: {value.assigneeIds.length}</ActiveChip>}
                        {value.authorIds.length > 0 && <ActiveChip>Authors: {value.authorIds.length}</ActiveChip>}
                        {value.priorities.length > 0 && <ActiveChip>Priority: {value.priorities.join(', ')}</ActiveChip>}
                        {value.severities.length > 0 && <ActiveChip>Severity: {value.severities.join(', ')}</ActiveChip>}
                        {value.suiteTypes.length > 0 && <ActiveChip>Suite Type: {value.suiteTypes.join(', ')}</ActiveChip>}
                        {value.readinessScopes.length > 0 && <ActiveChip>Scope: {value.readinessScopes.join(', ')}</ActiveChip>}
                        {value.environments.length > 0 && <ActiveChip>Environment: {value.environments.join(', ')}</ActiveChip>}
                        {value.versionTags.length > 0 && <ActiveChip>Version: {value.versionTags.join(', ')}</ActiveChip>}
                        {value.source && <ActiveChip>Source: {value.source === 'local' ? 'Local' : 'Tuleap'}</ActiveChip>}
                        {(value.createdFrom || value.createdTo || value.updatedFrom || value.updatedTo) && <ActiveChip>Date range</ActiveChip>}
                        {value.relatedType && <ActiveChip>Related: {value.relatedId ? 'selected' : value.relatedType}</ActiveChip>}
                        {resultSummary && <span className="ml-1 text-xs text-slate-400">{resultSummary}</span>}
                    </div>
                )}
            </div>
        </div>
    );
}

import type { ActivityFiltersValue } from '@/components/ui/ActivityFilters';

export type FilterParamKeyMap = Partial<Record<keyof ActivityFiltersValue, string>>;

export const DEFAULT_FILTER_PARAM_KEYS: FilterParamKeyMap = {
    search: 'q',
    projectIds: 'project',
    statuses: 'status',
    assigneeIds: 'assignee',
    authorIds: 'author',
    priorities: 'priority',
    severities: 'severity',
    suiteTypes: 'suite_type',
    readinessScopes: 'readiness_scope',
    environments: 'environment',
    versionTags: 'version_tag',
    source: 'source',
    createdFrom: 'created_from',
    createdTo: 'created_to',
    updatedFrom: 'updated_from',
    updatedTo: 'updated_to',
    relatedType: 'related_type',
    relatedId: 'related_id',
};

export function csvParam(searchParams: { get: (key: string) => string | null }, key: string, fallbackKey?: string) {
    return (searchParams.get(key) || (fallbackKey ? searchParams.get(fallbackKey) : '') || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
}

export function parseActivityFilters(
    searchParams: { get: (key: string) => string | null },
    keyMap: FilterParamKeyMap = {}
): ActivityFiltersValue {
    const keys = { ...DEFAULT_FILTER_PARAM_KEYS, ...keyMap };
    const source = searchParams.get(keys.source || 'source');

    return {
        search: searchParams.get(keys.search || 'q') || '',
        projectIds: csvParam(searchParams, keys.projectIds || 'project', 'project_id'),
        statuses: csvParam(searchParams, keys.statuses || 'status', 'statuses'),
        assigneeIds: csvParam(searchParams, keys.assigneeIds || 'assignee', 'assignee_ids'),
        authorIds: csvParam(searchParams, keys.authorIds || 'author', 'author_ids'),
        priorities: csvParam(searchParams, keys.priorities || 'priority', 'priorities'),
        severities: csvParam(searchParams, keys.severities || 'severity', 'severities'),
        suiteTypes: csvParam(searchParams, keys.suiteTypes || 'suite_type'),
        readinessScopes: csvParam(searchParams, keys.readinessScopes || 'readiness_scope'),
        environments: csvParam(searchParams, keys.environments || 'environment'),
        versionTags: csvParam(searchParams, keys.versionTags || 'version_tag'),
        source: source === 'local' || source === 'tuleap' ? source : '',
        createdFrom: searchParams.get(keys.createdFrom || 'created_from') || '',
        createdTo: searchParams.get(keys.createdTo || 'created_to') || '',
        updatedFrom: searchParams.get(keys.updatedFrom || 'updated_from') || '',
        updatedTo: searchParams.get(keys.updatedTo || 'updated_to') || '',
        relatedType: searchParams.get(keys.relatedType || 'related_type') || '',
        relatedId: searchParams.get(keys.relatedId || 'related_id') || '',
    };
}

function setCsvParam(params: URLSearchParams, key: string | undefined, values: string[]) {
    if (!key) return;
    if (values.length > 0) params.set(key, values.join(','));
    else params.delete(key);
}

function setScalarParam(params: URLSearchParams, key: string | undefined, value: string) {
    if (!key) return;
    if (value) params.set(key, value);
    else params.delete(key);
}

export function writeActivityFiltersToParams(
    params: URLSearchParams,
    filters: ActivityFiltersValue,
    keyMap: FilterParamKeyMap = {}
) {
    const keys = { ...DEFAULT_FILTER_PARAM_KEYS, ...keyMap };
    setScalarParam(params, keys.search, filters.search);
    setCsvParam(params, keys.projectIds, filters.projectIds);
    setCsvParam(params, keys.statuses, filters.statuses);
    setCsvParam(params, keys.assigneeIds, filters.assigneeIds);
    setCsvParam(params, keys.authorIds, filters.authorIds);
    setCsvParam(params, keys.priorities, filters.priorities);
    setCsvParam(params, keys.severities, filters.severities);
    setCsvParam(params, keys.suiteTypes, filters.suiteTypes);
    setCsvParam(params, keys.readinessScopes, filters.readinessScopes);
    setCsvParam(params, keys.environments, filters.environments);
    setCsvParam(params, keys.versionTags, filters.versionTags);
    setScalarParam(params, keys.source, filters.source);
    setScalarParam(params, keys.createdFrom, filters.createdFrom);
    setScalarParam(params, keys.createdTo, filters.createdTo);
    setScalarParam(params, keys.updatedFrom, filters.updatedFrom);
    setScalarParam(params, keys.updatedTo, filters.updatedTo);
    setScalarParam(params, keys.relatedType, filters.relatedType);
    setScalarParam(params, keys.relatedId, filters.relatedId);
}

export function buildActivityQuery(filters: ActivityFiltersValue, keyMap: FilterParamKeyMap = {}) {
    const params = new URLSearchParams();
    writeActivityFiltersToParams(params, filters, keyMap);
    const query = params.toString();
    return query ? `?${query}` : '';
}

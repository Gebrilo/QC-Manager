'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ActivityFilters, type ActivityFilterOption, type ActivityFiltersConfig, type ActivityFiltersValue } from '@/components/ui/ActivityFilters';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { fetchApi, projectsApi, userStoriesApi, type Project, type UserStory } from '@/lib/api';
import { parseActivityFilters, writeActivityFiltersToParams } from '@/lib/activityFilters';

const STORY_FILTER_CONFIG: ActivityFiltersConfig = {
    slots: ['search', 'project', 'status', 'author', 'date', 'relatedArtifact'],
    statusOptions: ['Draft', 'Changes', 'Review', 'Approved'].map(status => ({ value: status, label: status })),
    relatedArtifactTypes: [
        { value: 'task', label: 'Task', searchTypes: ['task'] },
        { value: 'test_case', label: 'Test Case', searchTypes: ['test_case'] },
        { value: 'bug', label: 'Bug', searchTypes: ['bug'] },
    ],
};

function statusVariant(status: string): 'info' | 'warning' | 'success' | 'default' {
    if (status === 'Draft') return 'info';
    if (status === 'Changes' || status === 'Review') return 'warning';
    if (status === 'Approved') return 'success';
    return 'default';
}

export default function WorkStoriesPage() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const searchParamString = searchParams.toString();
    const filters = useMemo(() => parseActivityFilters(new URLSearchParams(searchParamString)), [searchParamString]);

    const [stories, setStories] = useState<UserStory[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [relatedArtifacts, setRelatedArtifacts] = useState<ActivityFilterOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, total_pages: 0 });

    const loadStories = useCallback(async (page = 1) => {
        try {
            setLoading(true);
            const response = await userStoriesApi.list({
                page,
                limit: 25,
                q: filters.search || undefined,
                project_ids: filters.projectIds.join(',') || undefined,
                statuses: filters.statuses.join(',') || undefined,
                author_ids: filters.authorIds.join(',') || undefined,
                created_from: filters.createdFrom || undefined,
                created_to: filters.createdTo || undefined,
                updated_from: filters.updatedFrom || undefined,
                updated_to: filters.updatedTo || undefined,
                related_type: filters.relatedType || undefined,
                related_id: filters.relatedId || undefined,
                sort_by: 'created_at',
                sort_order: 'desc',
            });
            setStories(response.data);
            setPagination(response.pagination);
        } catch (error) {
            console.error('Failed to load user stories:', error);
            setStories([]);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        loadStories(1);
    }, [loadStories]);

    useEffect(() => {
        projectsApi.list().then(data => setProjects(Array.isArray(data) ? data : [])).catch(() => setProjects([]));
    }, []);

    const updateFilters = (nextFilters: ActivityFiltersValue) => {
        const params = new URLSearchParams(searchParamString);
        writeActivityFiltersToParams(params, nextFilters);
        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    };

    const handleRelatedArtifactSearch = async (query: string, relatedType: string) => {
        if (query.trim().length < 2 || !relatedType) {
            setRelatedArtifacts(filters.relatedId ? [{ value: filters.relatedId, label: filters.relatedId }] : []);
            return;
        }
        try {
            const response = await fetchApi<{ data: Array<{ id: string; display_id: string; title: string }> }>(
                `/search?q=${encodeURIComponent(query.trim())}&type=${encodeURIComponent(relatedType)}&limit=20`
            );
            setRelatedArtifacts(response.data.map(item => ({ value: item.id, label: `${item.display_id} - ${item.title}` })));
        } catch (error) {
            console.error(error);
            setRelatedArtifacts([]);
        }
    };

    const projectOptions = useMemo(() => projects.map(project => ({ value: project.id, label: project.project_name })), [projects]);
    const authorOptions = useMemo(
        () => Array.from(new Set(stories.map(story => story.ba_author).filter(Boolean) as string[])).map(author => ({ value: author, label: author })),
        [stories]
    );

    return (
        <div className="space-y-6 py-6 px-4 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">User Stories</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Review synced user stories and their coverage links.</p>
                </div>
                <Link href="/work/stories/create">
                    <Button>+ New Story</Button>
                </Link>
            </div>

            <ActivityFilters
                value={filters}
                config={STORY_FILTER_CONFIG}
                projects={projectOptions}
                authors={authorOptions}
                relatedArtifacts={relatedArtifacts}
                relatedArtifactPlaceholder="Search related item"
                resultSummary={`${pagination.total} stor${pagination.total === 1 ? 'y' : 'ies'}`}
                onChange={updateFilters}
                onRelatedArtifactSearch={handleRelatedArtifactSearch}
            />

            {loading && stories.length === 0 ? (
                <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>
            ) : stories.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
                    <p className="text-slate-500 dark:text-slate-400">No user stories found.</p>
                </div>
            ) : (
                <>
                    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">ID</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Title</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Project</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Status</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Author</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Updated</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {stories.map(story => (
                                        <tr key={story.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                            <td className="px-4 py-3 font-mono text-sm text-indigo-600 dark:text-indigo-400">
                                                <Link href={`/work/stories/${story.id}`}>
                                                    {story.tuleap_artifact_id ? `US-${story.tuleap_artifact_id}` : story.id.slice(0, 8)}
                                                </Link>
                                            </td>
                                            <td className="px-4 py-3">
                                                <Link href={`/work/stories/${story.id}`} className="font-medium text-slate-900 hover:underline dark:text-white">
                                                    {story.title}
                                                </Link>
                                                {story.description && <div className="mt-0.5 max-w-md truncate text-xs text-slate-500">{story.description}</div>}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{story.project_name || '-'}</td>
                                            <td className="px-4 py-3"><Badge variant={statusVariant(story.status)}>{story.status}</Badge></td>
                                            <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{story.ba_author || '-'}</td>
                                            <td className="px-4 py-3 text-xs text-slate-500">{story.updated_at ? new Date(story.updated_at).toLocaleDateString() : '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {pagination.total_pages > 1 && (
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">
                                Showing {((pagination.page - 1) * pagination.limit) + 1}-{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                            </span>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => loadStories(pagination.page - 1)}>Previous</Button>
                                <Button variant="outline" size="sm" disabled={pagination.page >= pagination.total_pages} onClick={() => loadStories(pagination.page + 1)}>Next</Button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

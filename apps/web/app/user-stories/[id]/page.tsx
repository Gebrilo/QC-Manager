'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { tuleapApi, userStoriesApi, UserStory } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { UserStoryCoverageLinksPanel } from '@/components/user-stories/UserStoryCoverageLinksPanel';
import Link from 'next/link';

function getStatusBadgeVariant(status: string | undefined): 'info' | 'warning' | 'default' | 'success' {
    switch (status) {
        case 'Draft': return 'info';
        case 'Changes': return 'warning';
        case 'Review': return 'default';
        case 'Approved': return 'success';
        default: return 'default';
    }
}

export default function UserStoryDetailPage() {
    const params = useParams();
    const id = (params?.id as string) || '';
    const router = useRouter();
    const [story, setStory] = useState<UserStory | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function load() {
            try {
                const data = await userStoriesApi.get(id);
                setStory(data);
            } catch (err: any) {
                setError(err.message || 'Failed to load user story');
            } finally {
                setIsLoading(false);
            }
        }
        if (id) load();
    }, [id]);

    const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete this user story?')) return;
        try {
            await tuleapApi.remove(story?.tuleap_artifact_id || id);
            router.push('/work/stories');
        } catch (err: any) {
            alert(`Failed to delete: ${err.message}`);
        }
    };

    if (isLoading) {
        return <div className="flex justify-center p-12"><Spinner size="lg" /></div>;
    }

    if (error) {
        return (
            <div className="max-w-3xl mx-auto py-8 px-4">
                <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 p-6 rounded-2xl">
                    <h2 className="text-lg font-semibold mb-2">Error</h2>
                    <p>{error}</p>
                </div>
            </div>
        );
    }

    if (!story) {
        return (
            <div className="max-w-3xl mx-auto py-8 px-4">
                <div className="text-center py-12">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">User Story Not Found</h2>
                    <p className="text-slate-500 dark:text-slate-400">The requested user story could not be found.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" onClick={() => router.back()}>
                        ← Back
                    </Button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{story.title}</h1>
                            <Badge variant={getStatusBadgeVariant(story.status)}>{story.status}</Badge>
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            {story.tuleap_artifact_id ? `US-${story.tuleap_artifact_id}` : story.id.slice(0, 8)}
                            {' '}• {story.project_name || 'No Project'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Link href={`/work/stories/${story.tuleap_artifact_id || story.id}/edit`}>
                        <Button variant="outline">Edit</Button>
                    </Link>
                    <Button
                        variant="outline"
                        onClick={handleDelete}
                        className="text-rose-600 border-rose-300 hover:bg-rose-50 dark:text-rose-400 dark:border-rose-800 dark:hover:bg-rose-900/20"
                    >
                        Delete
                    </Button>
                </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
                <div className="grid gap-4 text-sm md:grid-cols-3">
                    <div>
                        <span className="text-slate-500">Project</span>
                        <p className="font-medium text-slate-900 dark:text-white">{story.project_name || '-'}</p>
                    </div>
                    <div>
                        <span className="text-slate-500">Author</span>
                        <p className="font-medium text-slate-900 dark:text-white">{story.ba_author || '-'}</p>
                    </div>
                    <div>
                        <span className="text-slate-500">Priority</span>
                        <p className="font-medium text-slate-900 dark:text-white">{story.priority || '-'}</p>
                    </div>
                </div>

                {story.description && (
                    <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-800">
                        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">Description</h3>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-900 dark:text-white">{story.description}</p>
                    </div>
                )}

                {story.acceptance_criteria && (
                    <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-800">
                        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">Acceptance Criteria</h3>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-900 dark:text-white">{story.acceptance_criteria}</p>
                    </div>
                )}
            </div>

            <UserStoryCoverageLinksPanel storyId={story.id} projectId={story.project_id} />
        </div>
    );
}

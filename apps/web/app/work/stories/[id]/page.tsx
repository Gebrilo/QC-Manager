'use client';

import { useMemo, useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { taskTestCaseLinksApi, tasksApi, tuleapApi, userStoriesApi, type UserStory } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import {
    LinkedArtifactsSection,
    type LinkedArtifactsSectionConfig,
} from '@/components/shared/LinkedArtifactsSection';
import type { ArtifactPickerItem } from '@/components/shared/ArtifactPicker';
import { AttachmentSection } from '@/components/shared/AttachmentSection';
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
        if (!story) return;
        if (!story.tuleap_artifact_id) {
            alert('This user story does not have a Tuleap artifact ID to delete.');
            return;
        }
        if (!confirm('Are you sure you want to delete this user story?')) return;
        try {
            await tuleapApi.remove(story.tuleap_artifact_id);
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

    const title = story.title || `User Story ${id}`;
    const displayId = story.tuleap_artifact_id ? `US-${story.tuleap_artifact_id}` : id.slice(0, 8);

    return (
        <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" onClick={() => router.back()}>
                        Back
                    </Button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{title}</h1>
                            {story.status && <Badge variant={getStatusBadgeVariant(story.status)}>{story.status}</Badge>}
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            {displayId} - {story.project_name || 'No Project'}
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

            <div className="glass-card rounded-2xl p-6 space-y-4">
                <div>
                    <h3 className="text-sm uppercase tracking-wider text-slate-400 mb-2">Description</h3>
                    <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                        {story.description || 'No description provided.'}
                    </p>
                </div>
                {story.acceptance_criteria && (
                    <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
                        <h3 className="text-sm uppercase tracking-wider text-slate-400 mb-2">Acceptance Criteria</h3>
                        <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{story.acceptance_criteria}</p>
                    </div>
                )}
            </div>

            <UserStoryLinkedArtifactsSections story={story} />

            <AttachmentSection
                artifactType="user_story"
                artifactId={story.id}
                tempId={null}
            />
        </div>
    );
}

function UserStoryLinkedArtifactsSections({ story }: { story: UserStory }) {
    const sections: LinkedArtifactsSectionConfig[] = useMemo(() => [
        {
            title: 'Child Tasks',
            emptyLabel: 'No child tasks yet.',
            readOnly: true,
            viewPermission: 'qc.tasks.view',
            load: async () => {
                const tasks = await tasksApi.list({ related_type: 'user_story', related_id: story.id });
                return tasks.map(task => ({
                    id: task.id,
                    artifactId: task.id,
                    displayId: task.task_id || task.id.slice(0, 8),
                    title: task.task_name || '(no title)',
                    status: task.status,
                    href: `/work/tasks/${task.id}`,
                    source: 'qc' as const,
                }));
            },
        },
        {
            title: 'Linked Test Cases',
            emptyLabel: 'No linked test cases yet.',
            artifactType: 'test_case',
            pickerTitle: 'Link test cases to this user story',
            viewPermission: 'qc.testcases.view',
            editPermission: 'qc.projects.view',
            load: async () => {
                const response = await taskTestCaseLinksApi.listTestCasesForUserStory(story.id);
                return response.data.map(row => ({
                    id: row.id,
                    artifactId: row.test_case_id,
                    displayId: row.test_case_display_id || row.test_case_id.slice(0, 8),
                    title: row.test_case_title || '(no title)',
                    status: row.test_case_status,
                    href: `/test/cases/${row.test_case_id}`,
                    source: row.source || 'qc',
                    relationshipType: row.relationship_type || 'verifies',
                }));
            },
            add: async (items: ArtifactPickerItem[]) => {
                for (const item of items) {
                    await taskTestCaseLinksApi.addTestCaseToUserStory(story.id, item.id, 'verifies');
                }
            },
            remove: async (row) => {
                await taskTestCaseLinksApi.removeTestCaseFromUserStory(story.id, row.artifactId);
            },
        },
        {
            title: 'Linked Bugs',
            emptyLabel: 'No linked bugs yet.',
            artifactType: 'bug',
            pickerTitle: 'Link bugs to this user story',
            viewPermission: 'qc.bugs.view',
            editPermission: 'qc.projects.view',
            load: async () => {
                const response = await taskTestCaseLinksApi.listBugsForUserStory(story.id);
                return response.data.map(row => ({
                    id: row.id,
                    artifactId: row.bug_id,
                    displayId: row.bug_display_id || row.bug_id.slice(0, 8),
                    title: row.bug_title || '(no title)',
                    status: row.bug_status,
                    href: `/work/bugs/${row.bug_id}`,
                    source: row.source || 'qc',
                    relationshipType: row.relationship_type || 'affects',
                }));
            },
            add: async (items: ArtifactPickerItem[]) => {
                for (const item of items) {
                    await taskTestCaseLinksApi.addBugToUserStory(story.id, item.id, 'affects');
                }
            },
            remove: async (row) => {
                await taskTestCaseLinksApi.removeBugFromUserStory(story.id, row.artifactId);
            },
        },
    ], [story.id]);

    return (
        <div className="space-y-4">
            {sections.map(section => (
                <LinkedArtifactsSection key={section.title} config={section} projectId={story.project_id || null} />
            ))}
        </div>
    );
}

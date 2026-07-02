'use client';

import { useMemo, useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { taskTestCaseLinksApi, tasksApi, tuleapApi, userStoriesApi, type UserStory } from '@/lib/api';
import { artifactPath, artifactPublicId } from '@/lib/artifactPath';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { SyncPanel } from '@/components/shared/SyncPanel';
import {
    LinkedArtifactsSection,
    type LinkedArtifactsSectionConfig,
} from '@/components/shared/LinkedArtifactsSection';
import type { ArtifactPickerItem } from '@/components/shared/ArtifactPicker';
import { AttachmentSection } from '@/components/shared/AttachmentSection';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import Link from 'next/link';
import { StatusControl } from '@/components/shared/StatusControl';
import { useAuth } from '@/components/providers/AuthProvider';
import { storyStatusRegistry } from '@/lib/statusRegistry';
import { LINK_RELATIONSHIP_OPTIONS_BY_PAIR } from '@/lib/linkRelationships';
import { QCCard, SectionLabel, DetailRow, EditIcon, TrashIcon } from '@/components/shared/DetailCard';
import { AutoDetailsCard } from '@/components/shared/AutoDetailsCard';

export default function UserStoryDetailPage() {
    const params = useParams();
    const id = (params?.id as string) || '';
    const router = useRouter();
    const toast = useToast();
    const confirmAction = useConfirm();
    const { hasPermission } = useAuth();
    const [story, setStory] = useState<UserStory | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showRawMarkdown, setShowRawMarkdown] = useState(false);

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

    useEffect(() => {
        if (!story) return;
        const canonical = artifactPublicId('user_story', story);
        if (canonical && canonical !== id) {
            router.replace(artifactPath('user_story', story));
        }
    }, [story, id, router]);

    const handleDelete = async () => {
        if (!story) return;
        if (!story.tuleap_artifact_id) {
            toast.warning('This user story does not have a Tuleap artifact ID to delete.');
            return;
        }
        const confirmed = await confirmAction({
            title: 'Delete user story',
            message: 'Are you sure you want to delete this user story?',
            confirmLabel: 'Delete',
            variant: 'danger',
        });
        if (!confirmed) return;
        try {
            await tuleapApi.remove(story.tuleap_artifact_id);
            router.push('/work/stories');
        } catch (err: any) {
            toast.error(`Failed to delete: ${err.message}`);
        }
    };

    const patchStory = (patch: Partial<UserStory>) => {
        setStory(prev => prev ? { ...prev, ...patch } : prev);
    };

    const handleStatusCommitted = (_nextStatus: string, updated: unknown) => {
        if (!updated || typeof updated !== 'object') return;
        const next = updated as Partial<UserStory>;
        setStory(prev => prev ? { ...prev, ...next, _can: next._can ?? prev._can } : prev);
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
    const isAiIntakeStory = story.generated_by_ai || story.source === 'ai_intake';

    return (
        <div className="max-w-[1280px] mx-auto px-6 py-6 space-y-5">

            {/* ── Header ─────────────────────────────────────────────── */}
            <div className="flex items-start justify-between gap-6">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                    <button
                        onClick={() => router.back()}
                        className="mt-2 text-sm font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors flex-shrink-0"
                    >
                        ← Back
                    </button>
                    <div className="min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white" dir="auto">
                                {title}
                            </h1>
                            <StatusControl
                                artifactType="user_story"
                                artifactId={story.id}
                                value={story.status || 'Draft'}
                                canEdit={story._can?.edit}
                                hasFallbackPermission={hasPermission(storyStatusRegistry.editPermission)}
                                size="md"
                                align="left"
                                onOptimisticChange={(nextStatus) => patchStory({ status: nextStatus })}
                                onChangeCommitted={handleStatusCommitted}
                                onChangeRolledBack={(previousStatus) => patchStory({ status: previousStatus })}
                            />
                        </div>
                        <div className="mt-1.5 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                            {story.tuleap_url ? (
                                <a
                                    href={story.tuleap_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-mono font-semibold text-violet-600 dark:text-violet-300 hover:underline"
                                >
                                    {displayId}
                                </a>
                            ) : (
                                <span className="font-mono font-semibold text-violet-600 dark:text-violet-300">
                                    {displayId}
                                </span>
                            )}
                            <span className="text-slate-300 dark:text-slate-600">·</span>
                            <span>{story.project_name || 'No Project'}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    <Link href={`${artifactPath('user_story', story)}/edit`}>
                        <Button variant="outline" size="sm" className="gap-1.5">
                            <EditIcon />
                            Edit Story
                        </Button>
                    </Link>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDelete}
                        className="gap-1.5 text-rose-600 border-rose-300 hover:bg-rose-50 dark:text-rose-400 dark:border-rose-800 dark:hover:bg-rose-900/20"
                    >
                        <TrashIcon />
                        Delete
                    </Button>
                </div>
            </div>

            {/* ── Two-column layout ───────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-5">

                {/* Left (2/3) */}
                <div className="col-span-2 space-y-5">
                    <QCCard>
                        <SectionLabel>Description</SectionLabel>
                        {story.description ? (
                            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap" dir="auto">
                                {story.description}
                            </p>
                        ) : (
                            <p className="text-sm text-slate-400 italic">No description provided.</p>
                        )}
                    </QCCard>

                    <QCCard>
                        <SectionLabel>Acceptance Criteria</SectionLabel>
                        {story.acceptance_criteria ? (
                            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap" dir="auto">
                                {story.acceptance_criteria}
                            </p>
                        ) : (
                            <p className="text-sm text-slate-400 italic">No acceptance criteria provided.</p>
                        )}
                    </QCCard>

                    {/* Linked Artifacts */}
                    <UserStoryLinkedArtifactsSections story={story} />

                    {/* Attachments */}
                    <AttachmentSection
                        artifactType="user_story"
                        artifactId={story.id}
                        tempId={null}
                    />
                </div>

                {/* Right column (1/3) */}
                <div className="space-y-5">
                    {isAiIntakeStory && (
                        <QCCard>
                            <SectionLabel>AI Source</SectionLabel>
                            <div className="space-y-0">
                                <DetailRow label="Channel" value={story.source || 'ai_intake'} />
                                <DetailRow label="Agent" value={story.ai_source_agent || 'Unknown'} />
                                <DetailRow label="Skill" value={story.ai_skill_name || 'Unknown'} />
                                <DetailRow label="Conversation" value={story.ai_source_conversation_id || 'None'} />
                                <DetailRow label="Content Hash" value={story.source_content_hash || story.ai_content_hash || 'Unavailable'} />
                                <DetailRow label="Sync mode" value="Standalone" />
                            </div>
                            {story.ai_raw_markdown && (
                                <div className="mt-4">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setShowRawMarkdown(value => !value)}
                                    >
                                        {showRawMarkdown ? 'Hide Original Markdown' : 'View Original Markdown'}
                                    </Button>
                                    {showRawMarkdown && (
                                        <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-slate-950 p-3 text-xs leading-relaxed text-slate-100 whitespace-pre-wrap">
                                            {story.ai_raw_markdown}
                                        </pre>
                                    )}
                                </div>
                            )}
                        </QCCard>
                    )}

                    <SyncPanel
                        status={story.sync_status}
                        lastAttemptedAt={story.last_sync_attempted_at}
                        error={story.last_sync_error}
                        tuleapUrl={story.tuleap_url}
                        artifactType="user_story"
                        artifactId={story.id}
                        syncFn={(id) => userStoriesApi.sync(id)}
                    />

                    <AutoDetailsCard
                        record={story as unknown as Record<string, unknown>}
                        exclude={['title', 'status', 'description', 'acceptance_criteria', 'tuleap_url', 'generated_by_ai', 'source', 'source_content_hash', 'ai_content_hash', 'ai_skill_name', 'ai_source_agent', 'ai_source_conversation_id', 'ai_raw_markdown']}
                    />
                </div>
            </div>
        </div>
    );
}

function UserStoryLinkedArtifactsSections({ story }: { story: UserStory }) {
    const isAiIntakeStory = story.generated_by_ai || story.source === 'ai_intake';
    const sections: LinkedArtifactsSectionConfig[] = useMemo(() => [
        {
            title: isAiIntakeStory ? 'Generated Tasks' : 'Child Tasks',
            emptyLabel: isAiIntakeStory ? 'No generated tasks yet.' : 'No child tasks yet.',
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
                    href: artifactPath('task', task),
                    source: 'qc' as const,
                    relationshipType: 'parent of',
                    derived: true,
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
            relationshipOptions: LINK_RELATIONSHIP_OPTIONS_BY_PAIR.testCaseUserStories,
            relationshipDirection: 'to',
            load: async () => {
                const response = await taskTestCaseLinksApi.listTestCasesForUserStory(story.id);
                return response.data.map(row => ({
                    id: row.id,
                    artifactId: row.test_case_id,
                    displayId: row.test_case_display_id || row.test_case_id.slice(0, 8),
                    title: row.test_case_title || '(no title)',
                    status: row.test_case_status,
                    href: artifactPath('test_case', { id: row.test_case_id, test_case_id: row.test_case_display_id }),
                    source: row.source || 'qc',
                    relationshipType: row.relationship_type || 'verifies',
                    artifactType: row.artifact_type,
                    accessStatus: row.access_status,
                    priority: row.priority,
                    assigneeName: row.assignee_name,
                    projectName: row.project_name,
                }));
            },
            add: async (items: ArtifactPickerItem[], relationshipType = 'verifies') => {
                for (const item of items) {
                    await taskTestCaseLinksApi.addTestCaseToUserStory(story.id, item.id, relationshipType);
                }
            },
            remove: async (row) => {
                await taskTestCaseLinksApi.removeTestCaseFromUserStory(story.id, row.artifactId);
            },
        },
        {
            title: 'Linked Test Suites',
            emptyLabel: 'No linked test suites yet.',
            artifactType: 'test_suite',
            pickerTitle: 'Link test suites to this user story',
            viewPermission: 'qc.testsuites.view',
            editPermission: 'qc.projects.view',
            relationshipOptions: LINK_RELATIONSHIP_OPTIONS_BY_PAIR.storySuites,
            relationshipDirection: 'from',
            load: async () => {
                const response = await taskTestCaseLinksApi.listSuitesForUserStory(story.id);
                return response.data.map(row => ({
                    id: row.id,
                    artifactId: row.test_suite_id,
                    displayId: row.test_suite_display_id || row.test_suite_id.slice(0, 8),
                    title: row.test_suite_title || '(no title)',
                    status: row.test_suite_status,
                    href: artifactPath('test_suite', { id: row.test_suite_id, suite_id: row.test_suite_display_id }),
                    source: row.source || 'qc',
                    relationshipType: row.relationship_type || 'validated by',
                    artifactType: row.artifact_type,
                    accessStatus: row.access_status,
                    priority: row.priority,
                    assigneeName: row.assignee_name,
                    projectName: row.project_name,
                }));
            },
            add: async (items: ArtifactPickerItem[], relationshipType = 'validated by') => {
                for (const item of items) {
                    await taskTestCaseLinksApi.addSuiteToUserStory(story.id, item.id, relationshipType);
                }
            },
            remove: async (row) => {
                await taskTestCaseLinksApi.removeSuiteFromUserStory(story.id, row.artifactId);
            },
        },
        {
            title: 'Linked Test Runs',
            emptyLabel: 'No linked test runs yet.',
            artifactType: 'test_run',
            pickerTitle: 'Link test runs to this user story',
            viewPermission: 'qc.testexecutions.view',
            editPermission: 'qc.projects.view',
            relationshipOptions: LINK_RELATIONSHIP_OPTIONS_BY_PAIR.storyRuns,
            relationshipDirection: 'from',
            load: async () => {
                const response = await taskTestCaseLinksApi.listRunsForUserStory(story.id);
                return response.data.map(row => ({
                    id: row.id,
                    artifactId: row.test_run_id,
                    displayId: row.test_run_display_id || row.test_run_id.slice(0, 8),
                    title: row.test_run_title || '(no title)',
                    status: row.test_run_status,
                    href: artifactPath('test_run', { id: row.test_run_id, run_id: row.test_run_display_id }),
                    source: row.source || 'qc',
                    relationshipType: row.relationship_type || 'validated by',
                    artifactType: row.artifact_type,
                    accessStatus: row.access_status,
                    priority: row.priority,
                    assigneeName: row.assignee_name,
                    projectName: row.project_name,
                }));
            },
            add: async (items: ArtifactPickerItem[], relationshipType = 'validated by') => {
                for (const item of items) {
                    await taskTestCaseLinksApi.addRunToUserStory(story.id, item.id, relationshipType);
                }
            },
            remove: async (row) => {
                await taskTestCaseLinksApi.removeRunFromUserStory(story.id, row.artifactId);
            },
        },
        {
            title: 'Linked Bugs',
            emptyLabel: 'No linked bugs yet.',
            artifactType: 'bug',
            pickerTitle: 'Link bugs to this user story',
            viewPermission: 'qc.bugs.view',
            editPermission: 'qc.projects.view',
            relationshipOptions: LINK_RELATIONSHIP_OPTIONS_BY_PAIR.bugUserStories,
            relationshipDirection: 'to',
            load: async () => {
                const response = await taskTestCaseLinksApi.listBugsForUserStory(story.id);
                return response.data.map(row => ({
                    id: row.id,
                    artifactId: row.bug_id,
                    displayId: row.bug_display_id || row.bug_id.slice(0, 8),
                    title: row.bug_title || '(no title)',
                    status: row.bug_status,
                    href: artifactPath('bug', { id: row.bug_id, bug_id: row.bug_display_id }),
                    source: row.source || 'qc',
                    relationshipType: row.relationship_type || 'affects',
                    artifactType: row.artifact_type,
                    accessStatus: row.access_status,
                    priority: row.priority,
                    assigneeName: row.assignee_name,
                    projectName: row.project_name,
                }));
            },
            add: async (items: ArtifactPickerItem[], relationshipType = 'affects') => {
                for (const item of items) {
                    await taskTestCaseLinksApi.addBugToUserStory(story.id, item.id, relationshipType);
                }
            },
            remove: async (row) => {
                await taskTestCaseLinksApi.removeBugFromUserStory(story.id, row.artifactId);
            },
        },
    ], [story.id, isAiIntakeStory]);

    return (
        <div className="space-y-5">
            {sections.map(section => (
                <LinkedArtifactsSection key={section.title} config={section} projectId={story.project_id || null} />
            ))}
        </div>
    );
}

'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { bugsApi, type Bug, bugLinksApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { artifactPath, artifactPublicId } from '@/lib/artifactPath';
import {
    LinkedArtifactsSection,
    type LinkedArtifactsSectionConfig,
} from '@/components/shared/LinkedArtifactsSection';
import type { ArtifactPickerItem } from '@/components/shared/ArtifactPicker';
import { stripHtml } from '@/lib/stripHtml';
import { AttachmentSection } from '@/components/shared/AttachmentSection';
import { SyncPanel } from '@/components/shared/SyncPanel';
import { StatusControl } from '@/components/shared/StatusControl';
import { useAuth } from '@/components/providers/AuthProvider';
import { bugStatusRegistry } from '@/lib/statusRegistry';
import { LINK_RELATIONSHIP_OPTIONS_BY_PAIR } from '@/lib/linkRelationships';
import { AutoDetailsCard } from '@/components/shared/AutoDetailsCard';
import { QCCard, SectionLabel, EditIcon, TrashIcon } from '@/components/shared/DetailCard';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';

const BUG_AUTO_DETAIL_EXCLUDE = [
    'title',
    'status',
    'bug_id',
    'project_name',
    'tuleap_artifact_id',
    'description',
    'dev_fix_description',
    'qc_verification_notes',
    'tuleap_url',
];

const BUG_AUTO_DETAIL_LABELS = {
    service_name: 'Service',
    bug_type: 'Type',
    reported_date: 'Reported',
    created_at: 'Created',
    updated_at: 'Last Updated',
};

function formatEffortHours(value: unknown) {
    if (value === null || value === undefined || value === '') return null;
    return `${value}h`;
}

function formatBugSource(value: unknown) {
    if (value === null || value === undefined || value === '') return null;
    return value === 'TEST_CASE' ? 'Test Case' : 'Exploratory';
}

export default function BugDetailPage() {
    const params = useParams();
    const id = (params?.id as string) || '';
    const router = useRouter();
    const toast = useToast();
    const confirmAction = useConfirm();
    const { hasPermission } = useAuth();
    const [bug, setBug] = useState<Bug | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function load() {
            try {
                const response = await bugsApi.get(id);
                setBug(response.data);
            } catch (err: any) {
                setError(err.message || 'Failed to load bug');
            } finally {
                setIsLoading(false);
            }
        }
        if (id) load();
    }, [id]);

    useEffect(() => {
        if (!bug) return;
        const canonical = artifactPublicId('bug', bug);
        if (canonical && canonical !== id) {
            router.replace(artifactPath('bug', bug));
        }
    }, [bug, id, router]);

    const projectId = bug?.project_id;

    const sections: LinkedArtifactsSectionConfig[] = useMemo(() => [
        {
            title: 'Source / Provenance',
            emptyLabel: 'Not discovered via a test execution.',
            readOnly: true,
            viewPermission: 'qc.testexecutions.view',
            load: async () => {
                const response = await bugLinksApi.listTestExecutions(id);
                return response.data.map(row => ({
                    id: row.id,
                    artifactId: row.test_execution_id,
                    displayId: row.test_run_name || `EX-${row.test_execution_id.slice(0, 8)}`,
                    title: row.execution_notes || row.execution_status || 'Test execution',
                    status: row.execution_status,
                    href: row.test_run_uuid ? artifactPath('test_run', { id: row.test_run_uuid, run_id: row.test_run_id }) : undefined,
                    source: 'qc',
                    relationshipType: 'discovered via',
                    derived: true,
                    meta: row.executed_at ? new Date(row.executed_at).toLocaleString() : undefined,
                }));
            },
        },
        {
            title: 'Linked Test Runs',
            emptyLabel: 'No directly linked test runs yet.',
            artifactType: 'test_run',
            pickerTitle: 'Link test runs to this bug',
            viewPermission: 'qc.testexecutions.view',
            editPermission: 'qc.bugs.edit',
            relationshipOptions: LINK_RELATIONSHIP_OPTIONS_BY_PAIR.bugRuns,
            relationshipDirection: 'from',
            load: async () => {
                const response = await bugLinksApi.listRuns(id);
                return response.data.map(row => ({
                    id: row.id,
                    artifactId: row.test_run_id,
                    displayId: row.test_run_display_id || row.test_run_id.slice(0, 8),
                    title: row.test_run_title || '(no title)',
                    status: row.test_run_status,
                    href: artifactPath('test_run', { id: row.test_run_id, run_id: row.test_run_display_id }),
                    source: row.source || 'qc',
                    relationshipType: row.relationship_type || 'found in',
                    artifactType: row.artifact_type,
                    accessStatus: row.access_status,
                    priority: row.priority,
                    assigneeName: row.assignee_name,
                    projectName: row.project_name,
                }));
            },
            add: async (items: ArtifactPickerItem[], relationshipType = 'found in') => {
                for (const item of items) {
                    await bugLinksApi.addRun(id, item.id, relationshipType);
                }
            },
            remove: async (row) => {
                await bugLinksApi.removeRun(id, row.artifactId);
            },
        },
        {
            title: 'Linked Tasks',
            emptyLabel: 'No linked tasks yet.',
            artifactType: 'task',
            pickerTitle: 'Link tasks to this bug',
            viewPermission: 'qc.tasks.view',
            editPermission: 'qc.bugs.edit',
            relationshipOptions: LINK_RELATIONSHIP_OPTIONS_BY_PAIR.bugTasks,
            relationshipDirection: 'from',
            load: async () => {
                const response = await bugLinksApi.listTasks(id);
                return response.data.map(row => ({
                    id: row.id,
                    artifactId: row.task_id,
                    displayId: row.task_display_id || row.task_id.slice(0, 8),
                    title: row.task_title || '(no title)',
                    status: row.task_status,
                    href: artifactPath('task', { id: row.task_id, task_id: row.task_display_id }),
                    source: row.source || 'qc',
                    relationshipType: row.relationship_type || 'blocks',
                    artifactType: row.artifact_type,
                    accessStatus: row.access_status,
                    priority: row.priority,
                    assigneeName: row.assignee_name,
                    projectName: row.project_name,
                }));
            },
            add: async (items: ArtifactPickerItem[], relationshipType = 'blocks') => {
                for (const item of items) {
                    await bugLinksApi.addTask(id, item.id, relationshipType);
                }
            },
            remove: async (row) => {
                await bugLinksApi.removeTask(id, row.artifactId);
            },
        },
        {
            title: 'Linked Test Cases',
            emptyLabel: 'No linked test cases yet.',
            artifactType: 'test_case',
            pickerTitle: 'Link test cases to this bug',
            viewPermission: 'qc.testcases.view',
            editPermission: 'qc.bugs.edit',
            relationshipOptions: LINK_RELATIONSHIP_OPTIONS_BY_PAIR.bugTestCases,
            relationshipDirection: 'from',
            load: async () => {
                const response = await bugLinksApi.listTestCases(id);
                return response.data.map(row => ({
                    id: row.id,
                    artifactId: row.test_case_id,
                    displayId: row.test_case_display_id || row.test_case_id.slice(0, 8),
                    title: row.test_case_title || '(no title)',
                    status: row.test_case_status,
                    href: artifactPath('test_case', { id: row.test_case_id, test_case_id: row.test_case_display_id }),
                    source: row.source || 'qc',
                    relationshipType: row.relationship_type || 'reveals',
                    artifactType: row.artifact_type,
                    accessStatus: row.access_status,
                    priority: row.priority,
                    assigneeName: row.assignee_name,
                    projectName: row.project_name,
                }));
            },
            add: async (items: ArtifactPickerItem[], relationshipType = 'reveals') => {
                for (const item of items) {
                    await bugLinksApi.addTestCase(id, item.id, relationshipType);
                }
            },
            remove: async (row) => {
                await bugLinksApi.removeTestCase(id, row.artifactId);
            },
        },
        {
            title: 'Linked User Stories',
            emptyLabel: 'No linked user stories yet.',
            artifactType: 'user_story',
            pickerTitle: 'Link user stories to this bug',
            viewPermission: 'qc.projects.view',
            editPermission: 'qc.bugs.edit',
            relationshipOptions: LINK_RELATIONSHIP_OPTIONS_BY_PAIR.bugUserStories,
            relationshipDirection: 'from',
            load: async () => {
                const response = await bugLinksApi.listUserStories(id);
                return response.data.map(row => ({
                    id: row.id,
                    artifactId: row.user_story_id,
                    displayId: row.user_story_display_id || row.user_story_id.slice(0, 8),
                    title: row.user_story_title || '(no title)',
                    status: row.user_story_status,
                    href: artifactPath('user_story', { id: row.user_story_id, display_id: row.user_story_display_id }),
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
                    await bugLinksApi.addUserStory(id, item.id, relationshipType);
                }
            },
            remove: async (row) => {
                await bugLinksApi.removeUserStory(id, row.artifactId);
            },
        },
    ], [id]);

    const handleDelete = async () => {
        const confirmed = await confirmAction({
            title: 'Delete bug',
            message: `Delete bug ${bug?.bug_id || id}${bug?.title ? `: ${bug.title}` : ''}? This removes the bug from QC-Manager only.`,
            confirmLabel: 'Delete',
            variant: 'danger',
        });
        if (!confirmed) return;
        try {
            await bugsApi.delete(id);
            toast.success('Bug deleted');
            router.push('/work/bugs');
            router.refresh();
        } catch (err: any) {
            toast.error(err.message || 'Failed to delete');
        }
    };

    const patchBug = (patch: Partial<Bug>) => {
        setBug(prev => prev ? { ...prev, ...patch } : prev);
    };

    const handleStatusCommitted = (_nextStatus: string, updated: unknown) => {
        if (!updated || typeof updated !== 'object') return;
        const next = updated as Partial<Bug>;
        setBug(prev => prev ? { ...prev, ...next, _can: next._can ?? prev._can } : prev);
    };

    if (isLoading) return (
        <div className="max-w-[1280px] mx-auto px-6 py-6 animate-pulse space-y-6">
            <div className="flex items-center gap-4">
                <div className="h-9 w-20 bg-slate-200 dark:bg-slate-700 rounded-lg" />
                <div className="space-y-2">
                    <div className="h-7 w-64 bg-slate-200 dark:bg-slate-700 rounded" />
                    <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
                </div>
            </div>
            <div className="h-48 bg-slate-200 dark:bg-slate-700 rounded-2xl" />
        </div>
    );

    if (error && !bug) return (
        <div className="max-w-[1280px] mx-auto px-6 py-6">
            <div className="text-center py-20">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                </div>
                <p className="text-lg font-medium text-rose-700 dark:text-rose-400">{error}</p>
                <button onClick={() => router.push('/work/bugs')} className="mt-4 text-sm text-indigo-600 hover:text-indigo-800">← Back to Bugs</button>
            </div>
        </div>
    );

    if (!bug) return null;

    const title = bug.title || `Bug ${bug.bug_id || id}`;
    const status = bug.status || 'New';

    const bodyFields = [
        { label: 'Description / Steps to Reproduce', value: bug.description },
        { label: 'Dev Fix Description', value: bug.dev_fix_description },
        { label: 'QC Verification Notes', value: bug.qc_verification_notes },
    ].filter(f => f.value);

    return (
        <div className="max-w-[1280px] mx-auto px-6 py-6 space-y-5">

            {/* ── Header ─────────────────────────────────────────────── */}
            <div className="flex items-start justify-between gap-6">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                    <button
                        onClick={() => router.push('/work/bugs')}
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
                                artifactType="bug"
                                artifactId={bug.id}
                                value={status}
                                canEdit={bug._can?.edit}
                                hasFallbackPermission={hasPermission(bugStatusRegistry.editPermission)}
                                size="md"
                                align="left"
                                onOptimisticChange={(nextStatus) => patchBug({ status: nextStatus })}
                                onChangeCommitted={handleStatusCommitted}
                                onChangeRolledBack={(previousStatus) => patchBug({ status: previousStatus })}
                            />
                        </div>
                        <div className="mt-1.5 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                            {bug.tuleap_url ? (
                                <a
                                    href={bug.tuleap_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-mono font-semibold text-violet-600 dark:text-violet-300 hover:underline"
                                >
                                    {bug.bug_id || id}
                                </a>
                            ) : (
                                <span className="font-mono font-semibold text-violet-600 dark:text-violet-300">
                                    {bug.bug_id || id}
                                </span>
                            )}
                            <span className="text-slate-300 dark:text-slate-600">·</span>
                            <span>{bug.project_name || 'No Project'}</span>
                            {bug.tuleap_artifact_id && (
                                <>
                                    <span className="text-slate-300 dark:text-slate-600">·</span>
                                    <span className="font-mono">Tuleap #{bug.tuleap_artifact_id}</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    <Link href={`${artifactPath('bug', bug)}/edit`}>
                        <Button variant="outline" size="sm" className="gap-1.5">
                            <EditIcon />
                            Edit Bug
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
                    {bodyFields.length > 0 ? (
                        bodyFields.map(({ label, value }) => (
                            <QCCard key={label}>
                                <SectionLabel>{label}</SectionLabel>
                                <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap" dir="auto">
                                    {stripHtml(value!)}
                                </p>
                            </QCCard>
                        ))
                    ) : (
                        <QCCard>
                            <SectionLabel>Description</SectionLabel>
                            <p className="text-sm text-slate-400 italic">No description provided.</p>
                        </QCCard>
                    )}

                    {/* Linked Artifacts */}
                    {sections.map(section => (
                        <LinkedArtifactsSection key={section.title} config={section} projectId={projectId} />
                    ))}

                    {/* Attachments */}
                    <AttachmentSection
                        artifactType="bug"
                        artifactId={bug.id}
                        tempId={null}
                    />
                </div>

                {/* Right column (1/3) */}
                <div className="space-y-5">
                    <SyncPanel
                        status={bug.sync_status}
                        lastAttemptedAt={bug.last_sync_attempted_at}
                        error={bug.last_sync_error}
                        tuleapUrl={bug.tuleap_url}
                        artifactType="bug"
                        artifactId={bug.id}
                        syncFn={(id) => bugsApi.sync(id)}
                    />

                    <AutoDetailsCard
                        record={{ ...bug }}
                        exclude={BUG_AUTO_DETAIL_EXCLUDE}
                        labels={BUG_AUTO_DETAIL_LABELS}
                        formatters={{
                            initial_effort: formatEffortHours,
                            remaining_effort: formatEffortHours,
                            source: formatBugSource,
                        }}
                    />
                </div>
            </div>
        </div>
    );
}

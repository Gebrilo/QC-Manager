'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { bugsApi, type Bug, bugLinksApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
    LinkedArtifactsSection,
    type LinkedArtifactsSectionConfig,
} from '@/components/shared/LinkedArtifactsSection';
import type { ArtifactPickerItem } from '@/components/shared/ArtifactPicker';
import { stripHtml } from '@/lib/stripHtml';
import { AttachmentSection } from '@/components/shared/AttachmentSection';

const STATUS_VARIANT: Record<string, 'default' | 'info' | 'ontrack' | 'inprogress' | 'success' | 'complete' | 'secondary'> = {
    New: 'info',
    Open: 'ontrack',
    Assigned: 'inprogress',
    Fixed: 'success',
    Verified: 'complete',
    Closed: 'secondary',
};

export default function BugDetailPage() {
    const params = useParams();
    const id = (params?.id as string) || '';
    const router = useRouter();
    const [bug, setBug] = useState<Bug | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

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
                    href: row.test_run_id ? `/test-runs/${row.test_run_id}` : undefined,
                    source: 'qc',
                    relationshipType: 'discovered via',
                    meta: row.executed_at ? new Date(row.executed_at).toLocaleString() : undefined,
                }));
            },
        },
        {
            title: 'Linked Tasks',
            emptyLabel: 'No linked tasks yet.',
            artifactType: 'task',
            pickerTitle: 'Link tasks to this bug',
            viewPermission: 'qc.tasks.view',
            editPermission: 'qc.bugs.edit',
            load: async () => {
                const response = await bugLinksApi.listTasks(id);
                return response.data.map(row => ({
                    id: row.id,
                    artifactId: row.task_id,
                    displayId: row.task_display_id || row.task_id.slice(0, 8),
                    title: row.task_title || '(no title)',
                    status: row.task_status,
                    href: `/work/tasks/${row.task_id}`,
                    source: row.source || 'qc',
                    relationshipType: row.relationship_type || 'blocks',
                }));
            },
            add: async (items: ArtifactPickerItem[]) => {
                for (const item of items) {
                    await bugLinksApi.addTask(id, item.id, 'blocks');
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
            load: async () => {
                const response = await bugLinksApi.listTestCases(id);
                return response.data.map(row => ({
                    id: row.id,
                    artifactId: row.test_case_id,
                    displayId: row.test_case_display_id || row.test_case_id.slice(0, 8),
                    title: row.test_case_title || '(no title)',
                    status: row.test_case_status,
                    href: `/test/cases/${row.test_case_id}`,
                    source: row.source || 'qc',
                    relationshipType: row.relationship_type || 'reveals',
                }));
            },
            add: async (items: ArtifactPickerItem[]) => {
                for (const item of items) {
                    await bugLinksApi.addTestCase(id, item.id, 'reveals');
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
            load: async () => {
                const response = await bugLinksApi.listUserStories(id);
                return response.data.map(row => ({
                    id: row.id,
                    artifactId: row.user_story_id,
                    displayId: row.user_story_display_id || row.user_story_id.slice(0, 8),
                    title: row.user_story_title || '(no title)',
                    status: row.user_story_status,
                    href: `/work/stories/${row.user_story_id}`,
                    source: row.source || 'qc',
                    relationshipType: row.relationship_type || 'affects',
                }));
            },
            add: async (items: ArtifactPickerItem[]) => {
                for (const item of items) {
                    await bugLinksApi.addUserStory(id, item.id, 'affects');
                }
            },
            remove: async (row) => {
                await bugLinksApi.removeUserStory(id, row.artifactId);
            },
        },
    ], [id]);

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            await bugsApi.delete(id);
            router.push('/work/bugs');
            router.refresh();
        } catch (err: any) {
            setError(err.message || 'Failed to delete');
        } finally {
            setIsDeleting(false);
            setShowDeleteModal(false);
        }
    };

    if (isLoading) return (
        <div className="max-w-5xl mx-auto py-8 px-4 animate-pulse space-y-6">
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
        <div className="max-w-5xl mx-auto py-8 px-4">
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

    return (
        <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="outline" onClick={() => router.push('/work/bugs')} className="border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                        ← Back
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{title}</h1>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                            {bug.bug_id || id}{bug.tuleap_artifact_id ? ` · Tuleap #${bug.tuleap_artifact_id}` : ''}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Badge variant={STATUS_VARIANT[status] || 'default'}>
                        {status}
                    </Badge>
                    <Link href={`/work/bugs/${bug.id}/edit`}>
                        <Button variant="outline" className="border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                            Edit
                        </Button>
                    </Link>
                    <Button variant="outline" onClick={() => setShowDeleteModal(true)} className="border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30">
                        Delete
                    </Button>
                </div>
            </div>

            <div className="glass-card rounded-2xl p-6 space-y-6">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3">Bug Details</h3>

                {bug.description && (
                    <div>
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Description / Steps to Reproduce</p>
                        <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">{stripHtml(bug.description)}</p>
                    </div>
                )}

                {bug.dev_fix_description && (
                    <div>
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Dev Fix Description</p>
                        <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">{stripHtml(bug.dev_fix_description)}</p>
                    </div>
                )}

                {bug.qc_verification_notes && (
                    <div>
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">QC Verification Notes</p>
                        <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">{stripHtml(bug.qc_verification_notes)}</p>
                    </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
                    {[
                        { label: 'Severity', value: bug.severity },
                        { label: 'Priority', value: bug.priority },
                        { label: 'Source', value: bug.source === 'TEST_CASE' ? 'Test Case' : 'Exploratory' },
                        { label: 'Environment', value: bug.environment },
                        { label: 'Service', value: bug.service_name },
                        { label: 'Component', value: bug.component },
                        { label: 'Type', value: bug.bug_type },
                        { label: 'Initial Effort', value: bug.initial_effort != null ? `${bug.initial_effort}h` : undefined },
                        { label: 'Remaining Effort', value: bug.remaining_effort != null ? `${bug.remaining_effort}h` : undefined },
                        { label: 'CC', value: bug.cc?.length ? bug.cc.join(', ') : undefined },
                        { label: 'Assigned To', value: bug.assigned_to },
                        { label: 'Reported By', value: bug.reported_by },
                        { label: 'Updated By', value: bug.updated_by },
                        { label: 'Project', value: bug.project_name },
                        { label: 'Reported', value: bug.reported_date ? new Date(bug.reported_date).toLocaleDateString() : undefined },
                        { label: 'Created', value: bug.created_at ? new Date(bug.created_at).toLocaleDateString() : undefined },
                        { label: 'Last Updated', value: bug.updated_at ? new Date(bug.updated_at).toLocaleDateString() : undefined },
                        { label: 'Last Sync', value: bug.last_sync_at ? new Date(bug.last_sync_at).toLocaleString() : undefined },
                    ].filter(f => f.value).map(({ label, value }) => (
                        <div key={label}>
                            <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-0.5">{label}</p>
                            <p className="text-sm text-slate-800 dark:text-slate-200 capitalize">{value}</p>
                        </div>
                    ))}
                </div>

                {bug.tuleap_artifact_id && (
                    <div className="flex items-center gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">Tuleap #{bug.tuleap_artifact_id}</span>
                        {bug.tuleap_url && (
                            <a href={bug.tuleap_url} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
                                View in Tuleap ↗
                            </a>
                        )}
                    </div>
                )}
            </div>

            <div className="space-y-4">
                {sections.map(section => (
                    <LinkedArtifactsSection key={section.title} config={section} projectId={projectId} />
                ))}
            </div>

            <AttachmentSection
                artifactType="bug"
                artifactId={bug.id}
                tempId={null}
            />

            {showDeleteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 max-w-md w-full mx-4 p-6 space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center flex-shrink-0">
                                <svg className="w-5 h-5 text-rose-600 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="font-semibold text-slate-900 dark:text-white">Delete Bug</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                    Delete bug <span className="font-mono font-medium">{bug.bug_id || id}</span>: {title}?
                                </p>
                                <p className="text-xs text-slate-400 mt-2">This removes the bug from QC-Manager only.</p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                onClick={() => setShowDeleteModal(false)}
                                disabled={isDeleting}
                                className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className="px-4 py-2 text-sm rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 transition-colors"
                            >
                                {isDeleting ? 'Deleting…' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

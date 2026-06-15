'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { TestCase, TestCaseExecution, TestCaseActivityEntry } from '@/types';
import { taskTestCaseLinksApi, testCasesApi, testSuitesApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { SyncPanel } from '@/components/shared/SyncPanel';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { formatDistanceToNow, format } from 'date-fns';
import {
    LinkedArtifactsSection,
    type LinkedArtifactsSectionConfig,
} from '@/components/shared/LinkedArtifactsSection';
import type { ArtifactPickerItem } from '@/components/shared/ArtifactPicker';
import { StatusControl } from '@/components/shared/StatusControl';
import { useAuth } from '@/components/providers/AuthProvider';
import { testCaseStatusRegistry } from '@/lib/statusRegistry';
import { QCCard, SectionLabel, EditIcon, TrashIcon } from '@/components/shared/DetailCard';
import { AutoDetailsCard } from '@/components/shared/AutoDetailsCard';

export default function TestCaseDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;
    const confirmAction = useConfirm();
    const { hasPermission } = useAuth();

    const [testCase, setTestCase] = useState<(TestCase & { execution_history?: TestCaseExecution[]; activity?: TestCaseActivityEntry[] }) | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        testCasesApi.get(id)
            .then((data) => setTestCase(data as any))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, [id]);

    const handleDelete = async () => {
        const confirmed = await confirmAction({
            title: 'Delete test case',
            message: 'Are you sure you want to delete this test case? This action can be undone by an admin.',
            confirmLabel: 'Delete',
            variant: 'danger',
        });
        if (!confirmed) return;
        try {
            await testCasesApi.delete(id);
            router.push('/test/cases');
            router.refresh();
        } catch (err: any) {
            setError(err.message);
        }
    };

    const patchTestCase = (patch: Partial<TestCase>) => {
        setTestCase(prev => prev ? { ...prev, ...patch } : prev);
    };

    const handleStatusCommitted = (_nextStatus: string, updated: unknown) => {
        if (!updated || typeof updated !== 'object') return;
        const next = updated as Partial<TestCase>;
        setTestCase(prev => prev ? { ...prev, ...next, _can: next._can ?? prev._can } : prev);
    };

    if (loading) {
        return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;
    }

    if (error) {
        return (
            <div className="max-w-3xl mx-auto py-8 px-4">
                <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 p-6 rounded-2xl">
                    <h2 className="text-lg font-semibold mb-2">Error Loading Test Case</h2>
                    <p>{error}</p>
                    <Link href="/test/cases"><Button variant="outline" className="mt-4">Back to Test Cases</Button></Link>
                </div>
            </div>
        );
    }

    if (!testCase) {
        return (
            <div className="max-w-3xl mx-auto py-8 px-4">
                <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl text-center border border-slate-200 dark:border-slate-800">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Test Case Not Found</h2>
                    <Link href="/test/cases"><Button variant="outline">Back to Test Cases</Button></Link>
                </div>
            </div>
        );
    }

    const getPriorityBadgeVariant = (p: string): 'danger' | 'warning' | 'default' | 'success' => {
        const map: Record<string, 'danger' | 'warning' | 'default' | 'success'> = { critical: 'danger', high: 'warning', medium: 'default', low: 'success' };
        return map[p] || 'default';
    };

    const bodyFields = [
        { label: 'Description', value: testCase.description },
        { label: 'Preconditions', value: testCase.preconditions },
        { label: 'Test Steps', value: testCase.test_steps },
        { label: 'Expected Result', value: testCase.expected_result },
    ].filter(f => f.value);

    return (
        <div className="max-w-[1280px] mx-auto px-6 py-6 space-y-5">

            {/* ── Header ─────────────────────────────────────────────── */}
            <div className="flex items-start justify-between gap-6">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                    <button
                        onClick={() => router.push('/test/cases')}
                        className="mt-2 text-sm font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors flex-shrink-0"
                    >
                        ← Back
                    </button>
                    <div className="min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white" dir="auto">
                                {testCase.title}
                            </h1>
                            <StatusControl
                                artifactType="test_case"
                                artifactId={testCase.id}
                                value={testCase.status || 'None'}
                                canEdit={testCase._can?.edit}
                                hasFallbackPermission={hasPermission(testCaseStatusRegistry.editPermission)}
                                size="md"
                                align="left"
                                onOptimisticChange={(nextStatus) => patchTestCase({ status: nextStatus as TestCase['status'] })}
                                onChangeCommitted={handleStatusCommitted}
                                onChangeRolledBack={(previousStatus) => patchTestCase({ status: previousStatus as TestCase['status'] })}
                            />
                        </div>
                        <div className="mt-1.5 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                            <span className="font-mono font-semibold text-violet-600 dark:text-violet-300">
                                {testCase.test_case_id}
                            </span>
                            <span className="text-slate-300 dark:text-slate-600">·</span>
                            <span>{testCase.project_name || 'No Project'}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                            <Badge variant={getPriorityBadgeVariant(testCase.priority)}>{testCase.priority}</Badge>
                            {testCase.severity && <Badge variant="info">{testCase.severity}</Badge>}
                            {testCase.automation_status && <Badge variant="default">{testCase.automation_status.replace('_', ' ')}</Badge>}
                            {testCase.test_type && <Badge variant="default">{testCase.test_type}</Badge>}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    <Link href={`/test/cases/${id}/edit`}>
                        <Button variant="outline" size="sm" className="gap-1.5">
                            <EditIcon />
                            Edit Case
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
                                    {value}
                                </p>
                            </QCCard>
                        ))
                    ) : (
                        <QCCard>
                            <SectionLabel>Description</SectionLabel>
                            <p className="text-sm text-slate-400 italic">No description provided.</p>
                        </QCCard>
                    )}

                    {testCase.execution_history && testCase.execution_history.length > 0 && (
                        <QCCard>
                            <SectionLabel>Execution History</SectionLabel>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
                                            <th className="pb-2 pr-4">Date</th>
                                            <th className="pb-2 pr-4">Run</th>
                                            <th className="pb-2 pr-4">Status</th>
                                            <th className="pb-2">Tester</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {testCase.execution_history.map((ex) => (
                                            <tr key={ex.id}>
                                                <td className="py-2 pr-4 text-slate-900 dark:text-white">{ex.executed_at ? format(new Date(ex.executed_at), 'yyyy-MM-dd') : '—'}</td>
                                                <td className="py-2 pr-4 text-slate-900 dark:text-white">{ex.test_run_name || ex.run_id || '—'}</td>
                                                <td className="py-2 pr-4"><Badge variant={ex.status === 'passed' ? 'success' : ex.status === 'failed' ? 'danger' : 'default'}>{ex.status}</Badge></td>
                                                <td className="py-2 text-slate-900 dark:text-white">{ex.executed_by_name || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </QCCard>
                    )}

                    {testCase.activity && testCase.activity.length > 0 && (
                        <QCCard>
                            <SectionLabel>Activity</SectionLabel>
                            <div className="space-y-2">
                                {testCase.activity.map((entry, i) => (
                                    <div key={i} className="text-sm">
                                        <span className="text-slate-500 dark:text-slate-400">{formatDistanceToNow(new Date(entry.performed_at), { addSuffix: true })}</span>
                                        {' — '}
                                        <span className="text-slate-900 dark:text-white">{entry.change_summary || entry.action}</span>
                                        {entry.performed_by_email && <span className="text-slate-500"> by {entry.performed_by_email}</span>}
                                    </div>
                                ))}
                            </div>
                        </QCCard>
                    )}
                </div>

                {/* Right column (1/3) */}
                <div className="space-y-5">
                    <SyncPanel
                        status={testCase.sync_status as any}
                        lastAttemptedAt={testCase.last_sync_attempted_at}
                        error={testCase.last_sync_error}
                        tuleapUrl={testCase.tuleap_url}
                        artifactType="test_case"
                        artifactId={testCase.id}
                        syncFn={(id) => testCasesApi.sync(id)}
                    />

                    <AutoDetailsCard
                        record={testCase as unknown as Record<string, unknown>}
                        exclude={[
                            'title',
                            'status',
                            'test_case_id',
                            'description',
                            'preconditions',
                            'test_steps',
                            'expected_result',
                            'tags',
                            'tuleap_url',
                        ]}
                        labels={{
                            assigned_to_name: 'Assigned To',
                            estimated_duration_minutes: 'Est. Duration',
                            linked_requirement_id: 'Requirement',
                            suite_title: 'Suite Title',
                        }}
                        formatters={{
                            estimated_duration_minutes: (v) => (v == null ? null : `${v} min`),
                        }}
                    />

                    {testCase.tags && testCase.tags.length > 0 && (
                        <QCCard>
                            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2">Tags</div>
                            <div className="flex flex-wrap gap-1">
                                {testCase.tags.map(t => <Badge key={t} variant="default">{t}</Badge>)}
                            </div>
                        </QCCard>
                    )}
                </div>
            </div>

            {/* ── Linked Artifacts ────────────────────────────────────── */}
            <TestCaseLinkedArtifactsSections testCase={testCase} />
        </div>
    );
}

function TestCaseLinkedArtifactsSections({ testCase }: { testCase: TestCase }) {
    const sections: LinkedArtifactsSectionConfig[] = useMemo(() => [
        {
            title: 'Linked User Stories',
            emptyLabel: 'No linked user stories yet.',
            artifactType: 'user_story',
            pickerTitle: 'Link user stories to this test case',
            viewPermission: 'qc.projects.view',
            editPermission: 'qc.testcases.edit',
            load: async () => {
                const response = await taskTestCaseLinksApi.listUserStoriesForTestCase(testCase.id);
                return response.data.map(row => ({
                    id: row.id,
                    artifactId: row.user_story_id,
                    displayId: row.user_story_display_id || row.user_story_id.slice(0, 8),
                    title: row.user_story_title || '(no title)',
                    status: row.user_story_status,
                    href: `/work/stories/${row.user_story_id}`,
                    source: row.source || 'qc',
                    relationshipType: row.relationship_type || 'verifies',
                }));
            },
            add: async (items: ArtifactPickerItem[]) => {
                for (const item of items) {
                    await taskTestCaseLinksApi.addUserStoryToTestCase(testCase.id, item.id, 'verifies');
                }
            },
            remove: async (row) => {
                await taskTestCaseLinksApi.removeUserStoryFromTestCase(testCase.id, row.artifactId);
            },
        },
        {
            title: 'Linked Tasks',
            emptyLabel: 'No linked tasks yet.',
            artifactType: 'task',
            pickerTitle: 'Link tasks to this test case',
            viewPermission: 'qc.tasks.view',
            editPermission: 'qc.testcases.edit',
            load: async () => {
                const response = await taskTestCaseLinksApi.listTasks(testCase.id);
                return response.data.map(row => ({
                    id: row.id,
                    artifactId: row.task_id,
                    displayId: row.task_display_id || row.task_id.slice(0, 8),
                    title: row.task_title || '(no title)',
                    status: row.task_status,
                    href: `/work/tasks/${row.task_id}`,
                    source: row.source || 'qc',
                    relationshipType: row.relationship_type || 'covers',
                }));
            },
            add: async (items: ArtifactPickerItem[]) => {
                for (const item of items) {
                    await taskTestCaseLinksApi.addTask(testCase.id, item.id, 'covers');
                }
            },
            remove: async (row) => {
                await taskTestCaseLinksApi.removeTask(testCase.id, row.artifactId);
            },
        },
        {
            title: 'Linked Bugs',
            emptyLabel: 'No linked bugs yet.',
            artifactType: 'bug',
            pickerTitle: 'Link bugs to this test case',
            viewPermission: 'qc.bugs.view',
            editPermission: 'qc.testcases.edit',
            load: async () => {
                const response = await taskTestCaseLinksApi.listBugsForTestCase(testCase.id);
                return response.data.map(row => ({
                    id: row.id,
                    artifactId: row.bug_id,
                    displayId: row.bug_display_id || row.bug_id.slice(0, 8),
                    title: row.bug_title || '(no title)',
                    status: row.bug_status,
                    href: `/work/bugs/${row.bug_id}`,
                    source: row.source || 'qc',
                    relationshipType: row.relationship_type || 'reveals',
                }));
            },
            add: async (items: ArtifactPickerItem[]) => {
                for (const item of items) {
                    await taskTestCaseLinksApi.addBugToTestCase(testCase.id, item.id, 'reveals');
                }
            },
            remove: async (row) => {
                await taskTestCaseLinksApi.removeBugFromTestCase(testCase.id, row.artifactId);
            },
        },
        {
            title: 'Containing Test Suites',
            emptyLabel: 'This test case is not in any suites.',
            readOnly: true,
            viewPermission: 'qc.testsuites.view',
            load: async () => {
                const response = await testSuitesApi.list({ related_type: 'test_case', related_id: testCase.id, limit: 100 });
                return response.data.map((suite: any) => ({
                    id: suite.id,
                    artifactId: suite.id,
                    displayId: suite.suite_id || suite.id.slice(0, 8),
                    title: suite.name || '(no title)',
                    status: suite.status,
                    href: `/test/suites/${suite.id}`,
                    source: 'qc',
                    meta: suite.test_case_count ? `${suite.test_case_count} cases` : undefined,
                }));
            },
        },
    ], [testCase.id]);

    return (
        <div className="space-y-4">
            {sections.map(section => (
                <LinkedArtifactsSection key={section.title} config={section} projectId={testCase.project_id || null} />
            ))}
        </div>
    );
}

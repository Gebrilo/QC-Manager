'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { TestSuite, SuiteTestCase } from '@/types';
import { taskTestCaseLinksApi, testSuitesApi } from '@/lib/api';
import { artifactPath, artifactPublicId } from '@/lib/artifactPath';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog, useConfirm } from '@/components/ui/ConfirmDialog';
import {
    LinkedArtifactsSection,
    type LinkedArtifactsSectionConfig,
} from '@/components/shared/LinkedArtifactsSection';
import type { ArtifactPickerItem } from '@/components/shared/ArtifactPicker';
import { StatusControl } from '@/components/shared/StatusControl';
import { useAuth } from '@/components/providers/AuthProvider';
import { testSuiteStatusRegistry } from '@/lib/statusRegistry';
import { LINK_RELATIONSHIP_OPTIONS_BY_PAIR } from '@/lib/linkRelationships';
import { QCCard, SectionLabel, EditIcon, TrashIcon } from '@/components/shared/DetailCard';
import { AutoDetailsCard } from '@/components/shared/AutoDetailsCard';

function getPriorityBadgeVariant(priority: string): 'danger' | 'warning' | 'default' | 'success' {
    const map: Record<string, 'danger' | 'warning' | 'default' | 'success'> = {
        critical: 'danger', high: 'warning', medium: 'default', low: 'success',
    };
    return map[priority] || 'default';
}

function getTestCaseStatusVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
    const map: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
        active: 'success', draft: 'warning', deprecated: 'danger', archived: 'default',
    };
    return map[status] || 'default';
}

export default function TestSuiteDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;
    const toast = useToast();
    const confirmAction = useConfirm();
    const { hasPermission } = useAuth();

    const [suite, setSuite] = useState<(TestSuite & { test_cases?: SuiteTestCase[] }) | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showAddCases, setShowAddCases] = useState(false);
    const [availableCases, setAvailableCases] = useState<any[]>([]);
    const [selectedCaseIds, setSelectedCaseIds] = useState<Set<string>>(new Set());
    const [addingCases, setAddingCases] = useState(false);
    const [removingCaseId, setRemovingCaseId] = useState<string | null>(null);
    const [cloning, setCloning] = useState(false);
    const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
    const [cloneName, setCloneName] = useState('');

    const loadSuite = useCallback(async () => {
        try {
            setLoading(true);
            const data = await testSuitesApi.get(id);
            setSuite(data as any);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        loadSuite();
    }, [loadSuite]);

    useEffect(() => {
        if (!suite) return;
        const canonical = artifactPublicId('test_suite', suite);
        if (canonical && canonical !== id) {
            router.replace(artifactPath('test_suite', suite));
        }
    }, [suite, id, router]);

    const handleDelete = async () => {
        const confirmed = await confirmAction({
            title: 'Delete test suite',
            message: 'Are you sure you want to delete this test suite?',
            confirmLabel: 'Delete',
            variant: 'danger',
        });
        if (!confirmed) return;
        try {
            await testSuitesApi.delete(id);
            router.push('/test/suites');
            router.refresh();
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleRemoveCase = async (caseId: string) => {
        setRemovingCaseId(caseId);
        try {
            await testSuitesApi.removeTestCases(id, { test_case_ids: [caseId] });
            await loadSuite();
        } catch (err: any) {
            toast.error(err.message || 'Failed to remove test case');
        } finally {
            setRemovingCaseId(null);
        }
    };

    const handleLoadAvailableCases = async () => {
        if (availableCases.length > 0) {
            setShowAddCases(!showAddCases);
            return;
        }
        setShowAddCases(true);
        try {
            const res = await testSuitesApi.availableTestCases(id, { limit: 200 });
            setAvailableCases(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error('Failed to load available cases', err);
        }
    };

    const handleAddCases = async () => {
        if (selectedCaseIds.size === 0) return;
        setAddingCases(true);
        try {
            await testSuitesApi.addTestCases(id, { test_case_ids: Array.from(selectedCaseIds), position: 'end' });
            setSelectedCaseIds(new Set());
            setShowAddCases(false);
            setAvailableCases([]);
            await loadSuite();
        } catch (err: any) {
            toast.error(err.message || 'Failed to add test cases');
        } finally {
            setAddingCases(false);
        }
    };

    const handleClone = () => {
        setCloneName(`${suite?.name || 'Suite'} (Copy)`);
        setCloneDialogOpen(true);
    };

    const handleConfirmClone = async () => {
        const name = cloneName.trim();
        if (!name) {
            toast.error('Suite name is required');
            return;
        }
        setCloneDialogOpen(false);
        setCloning(true);
        try {
            await testSuitesApi.clone(id, { name });
            router.push('/test/suites');
            router.refresh();
        } catch (err: any) {
            toast.error(err.message || 'Failed to clone suite');
        } finally {
            setCloning(false);
        }
    };

    const toggleCaseSelection = (caseId: string) => {
        const next = new Set(selectedCaseIds);
        if (next.has(caseId)) next.delete(caseId);
        else next.add(caseId);
        setSelectedCaseIds(next);
    };

    const patchSuite = (patch: Partial<TestSuite>) => {
        setSuite(prev => prev ? { ...prev, ...patch } : prev);
    };

    const handleStatusCommitted = (_nextStatus: string, updated: unknown) => {
        if (!updated || typeof updated !== 'object') return;
        const next = updated as Partial<TestSuite>;
        setSuite(prev => prev ? { ...prev, ...next, _can: next._can ?? prev._can } : prev);
    };

    if (loading) {
        return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;
    }

    if (error) {
        return (
            <div className="max-w-3xl mx-auto py-8 px-4">
                <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 p-6 rounded-2xl">
                    <h2 className="text-lg font-semibold mb-2">Error Loading Test Suite</h2>
                    <p>{error}</p>
                    <Link href="/test/suites"><Button variant="outline" className="mt-4">Back to Test Suites</Button></Link>
                </div>
            </div>
        );
    }

    if (!suite) {
        return (
            <div className="max-w-3xl mx-auto py-8 px-4">
                <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl text-center border border-slate-200 dark:border-slate-800">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Test Suite Not Found</h2>
                    <Link href="/test/suites"><Button variant="outline">Back to Test Suites</Button></Link>
                </div>
            </div>
        );
    }

    const testCases = suite.test_cases || [];
    const quickActionClass = 'w-full px-3 py-2 rounded-lg text-sm text-left text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors flex items-center gap-2';

    return (
        <>
        <div className="max-w-[1280px] mx-auto px-6 py-6 space-y-5">

            {/* ── Header ─────────────────────────────────────────────── */}
            <div className="flex items-start justify-between gap-6">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                    <button
                        onClick={() => router.push('/test/suites')}
                        className="mt-2 text-sm font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors flex-shrink-0"
                    >
                        ← Back
                    </button>
                    <div className="min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white" dir="auto">
                                {suite.name}
                            </h1>
                            <StatusControl
                                artifactType="test_suite"
                                artifactId={suite.id}
                                value={suite.status || 'draft'}
                                canEdit={suite._can?.edit}
                                hasFallbackPermission={hasPermission(testSuiteStatusRegistry.editPermission)}
                                size="md"
                                align="left"
                                onOptimisticChange={(nextStatus) => patchSuite({ status: nextStatus as TestSuite['status'] })}
                                onChangeCommitted={handleStatusCommitted}
                                onChangeRolledBack={(previousStatus) => patchSuite({ status: previousStatus as TestSuite['status'] })}
                            />
                        </div>
                        <div className="mt-1.5 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                            <span className="font-mono font-semibold text-violet-600 dark:text-violet-300">
                                {suite.suite_id}
                            </span>
                            <span className="text-slate-300 dark:text-slate-600">·</span>
                            <span>{suite.project_name || 'No Project'}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    <Link href={`${artifactPath('test_suite', { id })}/edit`}>
                        <Button variant="outline" size="sm" className="gap-1.5">
                            <EditIcon />
                            Edit Suite
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
                    {suite.description && (
                        <QCCard>
                            <SectionLabel>Description</SectionLabel>
                            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap" dir="auto">
                                {suite.description}
                            </p>
                        </QCCard>
                    )}

                    {showAddCases && (
                        <QCCard className="border-blue-200 dark:border-blue-900/50">
                            <div className="flex items-center justify-between mb-4">
                                <SectionLabel>Add Test Cases</SectionLabel>
                                <Button variant="ghost" size="sm" onClick={() => { setShowAddCases(false); setSelectedCaseIds(new Set()); }}>Cancel</Button>
                            </div>
                            {availableCases.length === 0 ? (
                                <p className="text-slate-500 dark:text-slate-400 text-sm">No additional active test cases available to add.</p>
                            ) : (
                                <>
                                    <div className="mb-2">
                                        <label className="flex items-center gap-3 p-2 rounded-lg cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={selectedCaseIds.size === availableCases.length}
                                                ref={(el) => { if (el) el.indeterminate = selectedCaseIds.size > 0 && selectedCaseIds.size < availableCases.length; }}
                                                onChange={() => {
                                                    if (selectedCaseIds.size === availableCases.length) {
                                                        setSelectedCaseIds(new Set());
                                                    } else {
                                                        setSelectedCaseIds(new Set(availableCases.map(tc => tc.id)));
                                                    }
                                                }}
                                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Select all ({availableCases.length})</span>
                                        </label>
                                    </div>
                                    <div className="max-h-64 overflow-y-auto space-y-2 mb-4">
                                        {availableCases.map((tc) => (
                                            <label key={tc.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                                                <input type="checkbox" checked={selectedCaseIds.has(tc.id)} onChange={() => toggleCaseSelection(tc.id)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                                                <span className="font-mono text-xs text-slate-500">{tc.test_case_id}</span>
                                                <span className="text-sm text-slate-900 dark:text-white flex-1 truncate">{tc.title}</span>
                                                {tc.priority && <Badge variant={getPriorityBadgeVariant(tc.priority)}>{tc.priority}</Badge>}
                                            </label>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Button onClick={handleAddCases} disabled={addingCases || selectedCaseIds.size === 0}>
                                            {addingCases ? 'Adding...' : `Add ${selectedCaseIds.size} Case${selectedCaseIds.size !== 1 ? 's' : ''}`}
                                        </Button>
                                        <span className="text-sm text-slate-500">{selectedCaseIds.size} selected</span>
                                    </div>
                                </>
                            )}
                        </QCCard>
                    )}

                    <QCCard className="p-0 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Test Cases ({testCases.length})</div>
                        </div>
                        {testCases.length === 0 ? (
                            <div className="p-8 text-center">
                                <p className="text-slate-500 dark:text-slate-400">No test cases in this suite yet. Use &quot;Add Cases&quot; to add some.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase w-12">#</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">ID</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Title</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Priority</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Status</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Type</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                        {testCases.map((tc, idx) => (
                                            <tr key={tc.junction_id || tc.id} className="hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors">
                                                <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{tc.sort_order || idx + 1}</td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <Link href={artifactPath('test_case', tc)} className="text-blue-600 dark:text-blue-400 hover:underline font-mono text-sm">
                                                        {tc.test_case_id_display || tc.test_case_id}
                                                    </Link>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <Link href={artifactPath('test_case', tc)} className="text-sm font-medium text-slate-900 dark:text-white hover:underline">
                                                        {tc.title}
                                                    </Link>
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    {tc.priority && <Badge variant={getPriorityBadgeVariant(tc.priority)}>{tc.priority}</Badge>}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    {tc.status && <Badge variant={getTestCaseStatusVariant(tc.status)}>{tc.status}</Badge>}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700 dark:text-slate-300 capitalize">
                                                    {tc.test_type || '—'}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <button
                                                        onClick={() => handleRemoveCase(tc.id)}
                                                        disabled={removingCaseId === tc.id}
                                                        className="text-rose-600 dark:text-rose-400 hover:underline text-sm disabled:opacity-50"
                                                    >
                                                        {removingCaseId === tc.id ? 'Removing...' : 'Remove'}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </QCCard>

                    <TestSuiteLinkedArtifactsSections suite={suite} />
                </div>

                {/* Right column (1/3) */}
                <div className="space-y-5">
                    <AutoDetailsCard
                        record={{ ...suite }}
                        title="Overview"
                        exclude={['name', 'status', 'suite_id', 'project_name', 'description', 'test_cases']}
                        labels={{
                            test_case_count: 'Cases',
                            last_run_pass_rate: 'Pass Rate',
                            created_by_name: 'Created By',
                            created_at: 'Created',
                            updated_at: 'Last Updated',
                        }}
                        formatters={{
                            test_case_count: (v) => String(v ?? testCases.length),
                            last_run_pass_rate: (v) => (v == null ? null : `${Math.round(Number(v) * 100)}%`),
                        }}
                    />

                    <QCCard>
                        <SectionLabel>Quick Actions</SectionLabel>
                        <div className="space-y-1">
                            <Link href={`/test/runs/create?suite_id=${id}`} className={quickActionClass}>
                                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <polygon points="5 3 19 12 5 21 5 3" />
                                </svg>
                                Start Test Run
                            </Link>
                            <button onClick={handleLoadAvailableCases} className={quickActionClass}>
                                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path d="M12 5v14M5 12h14" />
                                </svg>
                                {showAddCases ? 'Hide Add Cases' : 'Add Cases'}
                            </button>
                            <button onClick={handleClone} disabled={cloning} className={`${quickActionClass} disabled:opacity-50`}>
                                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                                </svg>
                                {cloning ? 'Cloning...' : 'Clone Suite'}
                            </button>
                        </div>
                    </QCCard>
                </div>
            </div>
        </div>
        <ConfirmDialog
            open={cloneDialogOpen}
            title="Clone test suite"
            message="Enter a name for the cloned suite."
            confirmLabel="Clone"
            onConfirm={handleConfirmClone}
            onCancel={() => setCloneDialogOpen(false)}
        >
            <input
                type="text"
                value={cloneName}
                onChange={e => setCloneName(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
            />
        </ConfirmDialog>
        </>
    );
}

function TestSuiteLinkedArtifactsSections({ suite }: { suite: TestSuite & { test_cases?: SuiteTestCase[] } }) {
    const sections: LinkedArtifactsSectionConfig[] = useMemo(() => [
        {
            title: 'Contained Test Cases',
            emptyLabel: 'No contained test cases yet.',
            readOnly: true,
            viewPermission: 'qc.testcases.view',
            load: async () => {
                return (suite.test_cases || []).map(testCase => ({
                    id: testCase.junction_id || testCase.id,
                    artifactId: testCase.id,
                    displayId: testCase.test_case_id_display || testCase.test_case_id || testCase.id.slice(0, 8),
                    title: testCase.title || '(no title)',
                    status: testCase.status,
                    href: artifactPath('test_case', testCase),
                    source: 'qc' as const,
                    relationshipType: 'contains',
                    derived: true,
                }));
            },
        },
        {
            title: 'Linked User Stories',
            emptyLabel: 'No linked user stories yet.',
            artifactType: 'user_story',
            pickerTitle: 'Link user stories to this test suite',
            viewPermission: 'qc.projects.view',
            editPermission: 'qc.testsuites.edit',
            relationshipOptions: LINK_RELATIONSHIP_OPTIONS_BY_PAIR.storySuites,
            relationshipDirection: 'to',
            load: async () => {
                const response = await taskTestCaseLinksApi.listUserStoriesForSuite(suite.id);
                return response.data.map(row => ({
                    id: row.id,
                    artifactId: row.user_story_id,
                    displayId: row.user_story_display_id || row.user_story_id.slice(0, 8),
                    title: row.user_story_title || '(no title)',
                    status: row.user_story_status,
                    href: artifactPath('user_story', { id: row.user_story_id, display_id: row.user_story_display_id }),
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
                    await taskTestCaseLinksApi.addUserStoryToSuite(suite.id, item.id, relationshipType);
                }
            },
            remove: async (row) => {
                await taskTestCaseLinksApi.removeUserStoryFromSuite(suite.id, row.artifactId);
            },
        },
    ], [suite.id, suite.test_cases]);

    return (
        <div className="space-y-5">
            {sections.map(section => (
                <LinkedArtifactsSection key={section.title} config={section} projectId={suite.project_id || null} />
            ))}
        </div>
    );
}

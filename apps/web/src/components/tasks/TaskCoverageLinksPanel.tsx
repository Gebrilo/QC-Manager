'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { taskTestCaseLinksApi } from '@/lib/api';
import {
    LinkedArtifactRow,
    LinkedArtifactsSection,
    LinkedArtifactsSectionConfig,
} from '@/components/shared/LinkedArtifactsSection';
import { ArtifactPickerItem } from '@/components/shared/ArtifactPicker';

interface TaskCoverageLinksPanelProps {
    taskId: string;
    projectId?: string | null;
    parentUserStoryId?: string | null;
}

function normalizeTestCase(row: any): LinkedArtifactRow {
    return {
        id: row.id,
        artifactId: row.test_case_id,
        displayId: row['test-case_display_id'] || row.test_case_display_id || row.test_case_id,
        title: row['test-case_title'] || row.test_case_title || 'Deleted test case',
        status: row['test-case_status'] || row.test_case_status,
        href: `/test/cases/${row.test_case_id}`,
        source: row.source || 'qc',
        relationshipType: row.relationship_type,
        deleted: !row['test-case_title'] && !row.test_case_title,
    };
}

function normalizeBug(row: any): LinkedArtifactRow {
    return {
        id: row.id,
        artifactId: row.bug_id,
        displayId: row.bug_display_id || row.bug_id,
        title: row.bug_title || 'Deleted bug',
        status: row.bug_status,
        href: `/work/bugs/${row.bug_id}`,
        source: row.source || 'qc',
        relationshipType: row.relationship_type,
        deleted: !row.bug_title,
    };
}

export function TaskCoverageLinksPanel({ taskId, projectId, parentUserStoryId }: TaskCoverageLinksPanelProps) {
    const sections = useMemo<LinkedArtifactsSectionConfig[]>(() => [
        {
            title: 'Linked Test Cases',
            emptyLabel: 'No linked test cases yet.',
            artifactType: 'test_case',
            pickerTitle: 'Add linked test cases',
            addLabel: 'Add',
            viewPermission: 'qc.testcases.view',
            editPermission: 'qc.tasks.edit',
            load: async () => {
                const response = await taskTestCaseLinksApi.listTestCases(taskId);
                return response.data.map(normalizeTestCase);
            },
            add: async (items: ArtifactPickerItem[]) => {
                await Promise.all(items.map(item => taskTestCaseLinksApi.addTestCase(taskId, item.id, 'covers')));
            },
            remove: async (row: LinkedArtifactRow) => {
                await taskTestCaseLinksApi.removeTestCase(taskId, row.artifactId);
            },
        },
        {
            title: 'Linked Bugs',
            emptyLabel: 'No linked bugs yet.',
            artifactType: 'bug',
            pickerTitle: 'Add linked bugs',
            addLabel: 'Add',
            viewPermission: 'qc.bugs.view',
            editPermission: 'qc.tasks.edit',
            load: async () => {
                const response = await taskTestCaseLinksApi.listBugsForTask(taskId);
                return response.data.map(normalizeBug);
            },
            add: async (items: ArtifactPickerItem[]) => {
                await Promise.all(items.map(item => taskTestCaseLinksApi.addBugToTask(taskId, item.id, 'blocks')));
            },
            remove: async (row: LinkedArtifactRow) => {
                await taskTestCaseLinksApi.removeBugFromTask(taskId, row.artifactId);
            },
        },
    ], [taskId]);

    return (
        <div className="space-y-4">
            {parentUserStoryId && (
                <section className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Parent User Story</h3>
                    <Link href={`/work/stories/${parentUserStoryId}`} className="mt-1 block text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                        Open parent story
                    </Link>
                </section>
            )}

            {sections.map(section => (
                <LinkedArtifactsSection key={section.title} config={section} projectId={projectId} />
            ))}
        </div>
    );
}

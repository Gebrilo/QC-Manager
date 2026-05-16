'use client';

import { useMemo } from 'react';
import { taskTestCaseLinksApi, tasksApi } from '@/lib/api';
import {
    LinkedArtifactRow,
    LinkedArtifactsSection,
    LinkedArtifactsSectionConfig,
} from '@/components/shared/LinkedArtifactsSection';
import { ArtifactPickerItem } from '@/components/shared/ArtifactPicker';

interface UserStoryCoverageLinksPanelProps {
    storyId: string;
    projectId?: string | null;
}

function normalizeTask(row: any): LinkedArtifactRow {
    return {
        id: row.id,
        artifactId: row.id,
        displayId: row.task_id || row.id,
        title: row.task_name || 'Deleted task',
        status: row.status,
        href: `/work/tasks/${row.id}`,
        meta: row.resource1_name || row.resource2_name || undefined,
    };
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

export function UserStoryCoverageLinksPanel({ storyId, projectId }: UserStoryCoverageLinksPanelProps) {
    const sections = useMemo<LinkedArtifactsSectionConfig[]>(() => [
        {
            title: 'Child Tasks',
            emptyLabel: 'No child tasks yet.',
            readOnly: true,
            viewPermission: 'qc.tasks.view',
            load: async () => {
                const response = await tasksApi.list({ related_type: 'user_story', related_id: storyId });
                return response.map(normalizeTask);
            },
        },
        {
            title: 'Linked Test Cases',
            emptyLabel: 'No linked test cases yet.',
            artifactType: 'test_case',
            pickerTitle: 'Add linked test cases',
            addLabel: 'Add',
            viewPermission: 'qc.testcases.view',
            editPermission: 'qc.projects.view',
            load: async () => {
                const response = await taskTestCaseLinksApi.listTestCasesForUserStory(storyId);
                return response.data.map(normalizeTestCase);
            },
            add: async (items: ArtifactPickerItem[]) => {
                await Promise.all(items.map(item => taskTestCaseLinksApi.addTestCaseToUserStory(storyId, item.id, 'verifies')));
            },
            remove: async (row: LinkedArtifactRow) => {
                await taskTestCaseLinksApi.removeTestCaseFromUserStory(storyId, row.artifactId);
            },
        },
        {
            title: 'Linked Bugs',
            emptyLabel: 'No linked bugs yet.',
            artifactType: 'bug',
            pickerTitle: 'Add linked bugs',
            addLabel: 'Add',
            viewPermission: 'qc.bugs.view',
            editPermission: 'qc.projects.view',
            load: async () => {
                const response = await taskTestCaseLinksApi.listBugsForUserStory(storyId);
                return response.data.map(normalizeBug);
            },
            add: async (items: ArtifactPickerItem[]) => {
                await Promise.all(items.map(item => taskTestCaseLinksApi.addBugToUserStory(storyId, item.id, 'affects')));
            },
            remove: async (row: LinkedArtifactRow) => {
                await taskTestCaseLinksApi.removeBugFromUserStory(storyId, row.artifactId);
            },
        },
    ], [storyId]);

    return (
        <div className="space-y-4">
            {sections.map(section => (
                <LinkedArtifactsSection key={section.title} config={section} projectId={projectId} />
            ))}
        </div>
    );
}

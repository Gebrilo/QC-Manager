'use client';

import { useMemo } from 'react';
import { taskTestCaseLinksApi, testSuitesApi } from '@/lib/api';
import {
    LinkedArtifactRow,
    LinkedArtifactsSection,
    LinkedArtifactsSectionConfig,
} from '@/components/shared/LinkedArtifactsSection';
import { ArtifactPickerItem } from '@/components/shared/ArtifactPicker';

interface TestCaseCoverageLinksPanelProps {
    testCaseId: string;
    projectId?: string | null;
}

function normalizeTask(row: any): LinkedArtifactRow {
    return {
        id: row.id,
        artifactId: row.task_id,
        displayId: row.task_display_id || row.task_id,
        title: row.task_title || row.task_name || 'Deleted task',
        status: row.task_status,
        href: `/work/tasks/${row.task_id}`,
        source: row.source || 'qc',
        relationshipType: row.relationship_type,
        deleted: !row.task_title && !row.task_name,
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

function normalizeUserStory(row: any): LinkedArtifactRow {
    return {
        id: row.id,
        artifactId: row.user_story_id,
        displayId: row['user-story_display_id'] || row.user_story_display_id || row.user_story_id,
        title: row['user-story_title'] || row.user_story_title || 'Deleted user story',
        status: row['user-story_status'] || row.user_story_status,
        href: `/work/stories/${row.user_story_id}`,
        source: row.source || 'qc',
        relationshipType: row.relationship_type,
        deleted: !row['user-story_title'] && !row.user_story_title,
    };
}

function normalizeSuite(row: any): LinkedArtifactRow {
    return {
        id: row.id,
        artifactId: row.id,
        displayId: row.suite_id || row.id,
        title: row.name || 'Deleted suite',
        status: row.status,
        href: `/test/suites/${row.id}`,
        meta: row.test_case_count != null ? `${row.test_case_count} cases` : undefined,
    };
}

export function TestCaseCoverageLinksPanel({ testCaseId, projectId }: TestCaseCoverageLinksPanelProps) {
    const sections = useMemo<LinkedArtifactsSectionConfig[]>(() => [
        {
            title: 'Linked User Stories',
            emptyLabel: 'No linked user stories yet.',
            artifactType: 'user_story',
            pickerTitle: 'Add linked user stories',
            addLabel: 'Add',
            viewPermission: 'qc.projects.view',
            editPermission: 'qc.testcases.edit',
            load: async () => {
                const response = await taskTestCaseLinksApi.listUserStoriesForTestCase(testCaseId);
                return response.data.map(normalizeUserStory);
            },
            add: async (items: ArtifactPickerItem[]) => {
                await Promise.all(items.map(item => taskTestCaseLinksApi.addUserStoryToTestCase(testCaseId, item.id, 'verifies')));
            },
            remove: async (row: LinkedArtifactRow) => {
                await taskTestCaseLinksApi.removeUserStoryFromTestCase(testCaseId, row.artifactId);
            },
        },
        {
            title: 'Linked Tasks',
            emptyLabel: 'No linked tasks yet.',
            artifactType: 'task',
            pickerTitle: 'Add linked tasks',
            addLabel: 'Add',
            viewPermission: 'qc.tasks.view',
            editPermission: 'qc.testcases.edit',
            load: async () => {
                const response = await taskTestCaseLinksApi.listTasks(testCaseId);
                return response.data.map(normalizeTask);
            },
            add: async (items: ArtifactPickerItem[]) => {
                await Promise.all(items.map(item => taskTestCaseLinksApi.addTask(testCaseId, item.id, 'covers')));
            },
            remove: async (row: LinkedArtifactRow) => {
                await taskTestCaseLinksApi.removeTask(testCaseId, row.artifactId);
            },
        },
        {
            title: 'Linked Bugs',
            emptyLabel: 'No linked bugs yet.',
            artifactType: 'bug',
            pickerTitle: 'Add linked bugs',
            addLabel: 'Add',
            viewPermission: 'qc.bugs.view',
            editPermission: 'qc.testcases.edit',
            load: async () => {
                const response = await taskTestCaseLinksApi.listBugsForTestCase(testCaseId);
                return response.data.map(normalizeBug);
            },
            add: async (items: ArtifactPickerItem[]) => {
                await Promise.all(items.map(item => taskTestCaseLinksApi.addBugToTestCase(testCaseId, item.id, 'reveals')));
            },
            remove: async (row: LinkedArtifactRow) => {
                await taskTestCaseLinksApi.removeBugFromTestCase(testCaseId, row.artifactId);
            },
        },
        {
            title: 'Containing Test Suites',
            emptyLabel: 'This test case is not in any active suites.',
            readOnly: true,
            viewPermission: 'qc.testsuites.view',
            load: async () => {
                const response = await testSuitesApi.list({ related_type: 'test_case', related_id: testCaseId, limit: 100 });
                return response.data.map(normalizeSuite);
            },
        },
    ], [testCaseId]);

    return (
        <div className="space-y-4">
            {sections.map(section => (
                <LinkedArtifactsSection key={section.title} config={section} projectId={projectId} />
            ))}
        </div>
    );
}

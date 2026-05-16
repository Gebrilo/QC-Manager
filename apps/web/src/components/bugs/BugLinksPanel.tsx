'use client';

import { useMemo } from 'react';
import { bugLinksApi } from '@/lib/api';
import {
    LinkedArtifactsSection,
    LinkedArtifactsSectionConfig,
    LinkedArtifactRow,
} from '@/components/shared/LinkedArtifactsSection';
import { ArtifactPickerItem } from '@/components/shared/ArtifactPicker';

interface BugLinksPanelProps {
    bugId: string;
    projectId?: string | null;
    triageStatus?: string;
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

function normalizeTask(row: any): LinkedArtifactRow {
    return {
        id: row.id,
        artifactId: row.task_id,
        displayId: row.task_display_id || row.task_id,
        title: row.task_name || 'Deleted task',
        status: row.task_status,
        href: `/work/tasks/${row.task_id}`,
        source: row.source || 'qc',
        relationshipType: row.relationship_type,
        deleted: !row.task_name,
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

function normalizeExecution(row: any): LinkedArtifactRow {
    return {
        id: row.id,
        artifactId: row.test_execution_id,
        displayId: row.test_run_id || row.test_execution_id,
        title: row.test_run_name || 'Test execution',
        status: row.execution_status,
        source: 'tuleap',
        meta: row.executed_at ? new Date(row.executed_at).toLocaleDateString() : undefined,
    };
}

export function BugLinksPanel({ bugId, projectId, triageStatus }: BugLinksPanelProps) {
    const sections = useMemo<LinkedArtifactsSectionConfig[]>(() => [
        {
            title: 'Source / Provenance',
            emptyLabel: 'No source execution recorded.',
            readOnly: true,
            viewPermission: 'qc.testexecutions.view',
            load: async () => {
                const response = await bugLinksApi.listTestExecutions(bugId);
                return response.data.map(normalizeExecution);
            },
        },
        {
            title: 'Linked Test Cases',
            emptyLabel: 'No linked test cases yet.',
            artifactType: 'test_case',
            pickerTitle: 'Add linked test cases',
            addLabel: 'Add',
            viewPermission: 'qc.testcases.view',
            editPermission: 'qc.bugs.edit',
            load: async () => {
                const response = await bugLinksApi.listTestCases(bugId);
                return response.data.map(normalizeTestCase);
            },
            add: async (items: ArtifactPickerItem[]) => {
                await Promise.all(items.map(item => bugLinksApi.addTestCase(bugId, item.id, 'reveals')));
            },
            remove: async (row: LinkedArtifactRow) => {
                await bugLinksApi.removeTestCase(bugId, row.artifactId);
            },
        },
        {
            title: 'Linked Tasks',
            emptyLabel: 'No linked tasks yet.',
            artifactType: 'task',
            pickerTitle: 'Add linked tasks',
            addLabel: 'Add',
            viewPermission: 'qc.tasks.view',
            editPermission: 'qc.bugs.edit',
            load: async () => {
                const response = await bugLinksApi.listTasks(bugId);
                return response.data.map(normalizeTask);
            },
            add: async (items: ArtifactPickerItem[]) => {
                await Promise.all(items.map(item => bugLinksApi.addTask(bugId, item.id, 'blocks')));
            },
            remove: async (row: LinkedArtifactRow) => {
                await bugLinksApi.removeTask(bugId, row.artifactId);
            },
        },
        {
            title: 'Linked User Stories',
            emptyLabel: 'No linked user stories yet.',
            artifactType: 'user_story',
            pickerTitle: 'Add linked user stories',
            addLabel: 'Add',
            viewPermission: 'qc.projects.view',
            editPermission: 'qc.bugs.edit',
            load: async () => {
                const response = await bugLinksApi.listUserStories(bugId);
                return response.data.map(normalizeUserStory);
            },
            add: async (items: ArtifactPickerItem[]) => {
                await Promise.all(items.map(item => bugLinksApi.addUserStory(bugId, item.id, 'affects')));
            },
            remove: async (row: LinkedArtifactRow) => {
                await bugLinksApi.removeUserStory(bugId, row.artifactId);
            },
        },
    ], [bugId]);

    return (
        <div className="space-y-4">
            {triageStatus === 'untriaged' && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                    Untriaged - link this bug to source or coverage artifacts to complete triage.
                </div>
            )}

            {sections.map(section => (
                <LinkedArtifactsSection
                    key={section.title}
                    config={section}
                    projectId={projectId}
                />
            ))}
        </div>
    );
}

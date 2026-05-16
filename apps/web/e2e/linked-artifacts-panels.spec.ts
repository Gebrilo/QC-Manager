import { test, expect } from '@playwright/test';
import { mockAuthenticatedSession } from './helpers/session';

const projectId = '11111111-1111-1111-1111-111111111111';
const taskId = '22222222-2222-2222-2222-222222222222';
const testCaseId = '33333333-3333-3333-3333-333333333333';
const bugId = '44444444-4444-4444-4444-444444444444';
const storyId = '55555555-5555-5555-5555-555555555555';

test.describe('Linked artifact panels', () => {
    test('renders panels on task, test case, and user story details and supports picker add', async ({ page }) => {
        await mockAuthenticatedSession(page);

        let taskTestCases = [
            {
                id: 'link-task-case-1',
                task_id: taskId,
                test_case_id: testCaseId,
                relationship_type: 'covers',
                source: 'qc',
                created_at: new Date().toISOString(),
                'test-case_display_id': 'TC-101',
                'test-case_title': 'Login validates password',
                'test-case_status': 'active',
            },
        ];

        await page.route('**/tasks**', async (route) => {
            if (route.request().resourceType() === 'document') return route.continue();
            const url = new URL(route.request().url());
            if (route.request().method() === 'GET' && url.pathname.endsWith(`/tasks/${taskId}`)) {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        id: taskId,
                        task_id: 'TSK-101',
                        task_name: 'Implement login',
                        description: 'Build login flow',
                        status: 'In Progress',
                        project_id: projectId,
                        project_name: 'Atlas',
                        parent_user_story_id: storyId,
                    }),
                });
                return;
            }
            if (route.request().method() === 'GET' && url.pathname.endsWith(`/tasks/${taskId}/test-cases`)) {
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: taskTestCases }) });
                return;
            }
            if (route.request().method() === 'POST' && url.pathname.endsWith(`/tasks/${taskId}/test-cases`)) {
                taskTestCases = [
                    {
                        id: 'link-task-case-2',
                        task_id: taskId,
                        test_case_id: '66666666-6666-6666-6666-666666666666',
                        relationship_type: 'covers',
                        source: 'qc',
                        created_at: new Date().toISOString(),
                        'test-case_display_id': 'TC-202',
                        'test-case_title': 'Password reset works',
                        'test-case_status': 'draft',
                    },
                    ...taskTestCases,
                ];
                await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: taskTestCases[0] }) });
                return;
            }
            if (route.request().method() === 'GET' && url.pathname.endsWith(`/tasks/${taskId}/bugs`)) {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        data: [{
                            id: 'link-task-bug-1',
                            task_id: taskId,
                            bug_id: bugId,
                            relationship_type: 'blocks',
                            source: 'tuleap',
                            created_at: new Date().toISOString(),
                            bug_display_id: 'BUG-101',
                            bug_title: 'Login fails on Safari',
                            bug_status: 'open',
                        }],
                    }),
                });
                return;
            }
            if (route.request().method() === 'GET' && url.searchParams.get('related_type') === 'user_story') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([{
                        id: taskId,
                        task_id: 'TSK-101',
                        task_name: 'Implement login',
                        status: 'In Progress',
                        project_id: projectId,
                    }]),
                });
                return;
            }
            await route.continue();
        });

        await page.route('**/test-cases**', async (route) => {
            if (route.request().resourceType() === 'document') return route.continue();
            const url = new URL(route.request().url());
            if (url.pathname.includes('/tasks/')) return route.fallback();
            if (route.request().method() === 'GET' && url.pathname.endsWith(`/test-cases/${testCaseId}`)) {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        id: testCaseId,
                        test_case_id: 'TC-101',
                        title: 'Login validates password',
                        status: 'active',
                        priority: 'high',
                        project_id: projectId,
                        project_name: 'Atlas',
                    }),
                });
                return;
            }
            if (route.request().method() === 'GET' && url.pathname.endsWith(`/test-cases/${testCaseId}/user-storys`)) {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ data: [{ id: 'link-case-story-1', test_case_id: testCaseId, user_story_id: storyId, relationship_type: 'verifies', source: 'qc', 'user-story_display_id': 'US-101', 'user-story_title': 'User can log in', 'user-story_status': 'Approved' }] }),
                });
                return;
            }
            if (route.request().method() === 'GET' && url.pathname.endsWith(`/test-cases/${testCaseId}/tasks`)) {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ data: [{ id: 'link-case-task-1', task_id: taskId, test_case_id: testCaseId, relationship_type: 'covers', source: 'qc', task_display_id: 'TSK-101', task_title: 'Implement login', task_status: 'In Progress' }] }),
                });
                return;
            }
            if (route.request().method() === 'GET' && url.pathname.endsWith(`/test-cases/${testCaseId}/bugs`)) {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ data: [{ id: 'link-case-bug-1', bug_id: bugId, test_case_id: testCaseId, relationship_type: 'reveals', source: 'qc', bug_display_id: 'BUG-101', bug_title: 'Login fails on Safari', bug_status: 'open' }] }),
                });
                return;
            }
            await route.continue();
        });

        await page.route('**/test-suites**', async (route) => {
            if (route.request().resourceType() === 'document') return route.continue();
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: [{ id: '77777777-7777-7777-7777-777777777777', suite_id: 'TS-101', name: 'Regression suite', status: 'active', test_case_count: 12 }], pagination: { page: 1, limit: 100, total: 1, total_pages: 1 } }),
            });
        });

        await page.route('**/user-stories**', async (route) => {
            if (route.request().resourceType() === 'document') return route.continue();
            const url = new URL(route.request().url());
            if (route.request().method() === 'GET' && url.pathname.endsWith(`/user-stories/${storyId}`)) {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        id: storyId,
                        tuleap_artifact_id: 101,
                        title: 'User can log in',
                        status: 'Approved',
                        project_id: projectId,
                        project_name: 'Atlas',
                        ba_author: 'Product',
                    }),
                });
                return;
            }
            if (route.request().method() === 'GET' && url.pathname.endsWith(`/user-stories/${storyId}/test-cases`)) {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ data: [{ id: 'link-story-case-1', test_case_id: testCaseId, user_story_id: storyId, relationship_type: 'verifies', source: 'qc', 'test-case_display_id': 'TC-101', 'test-case_title': 'Login validates password', 'test-case_status': 'active' }] }),
                });
                return;
            }
            if (route.request().method() === 'GET' && url.pathname.endsWith(`/user-stories/${storyId}/bugs`)) {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ data: [{ id: 'link-story-bug-1', bug_id: bugId, user_story_id: storyId, relationship_type: 'affects', source: 'qc', bug_display_id: 'BUG-101', bug_title: 'Login fails on Safari', bug_status: 'open' }] }),
                });
                return;
            }
            await route.continue();
        });

        await page.route('**/search**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    data: [{
                        type: 'test_case',
                        id: '66666666-6666-6666-6666-666666666666',
                        display_id: 'TC-202',
                        title: 'Password reset works',
                        project_id: projectId,
                        project_name: 'Atlas',
                        status: 'draft',
                        url: `/test-cases/66666666-6666-6666-6666-666666666666`,
                    }],
                    meta: { q: 'password', limit: 25, types: ['test_case'] },
                }),
            });
        });

        await page.route('**/bugs**', async (route) => {
            if (route.request().resourceType() === 'document') return route.continue();
            const url = new URL(route.request().url());
            if (url.pathname.includes('/tasks/') || url.pathname.includes('/test-cases/') || url.pathname.includes('/user-stories/')) {
                return route.fallback();
            }
            if (route.request().method() === 'GET' && url.pathname.endsWith(`/bugs/${bugId}`)) {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        success: true,
                        data: {
                            id: bugId,
                            bug_id: 'BUG-101',
                            title: 'Login fails on Safari',
                            status: 'Open',
                            severity: 'high',
                            priority: 'high',
                            project_id: projectId,
                            project_name: 'Atlas',
                        },
                    }),
                });
                return;
            }
            if (route.request().method() === 'GET' && url.pathname.endsWith(`/bugs/${bugId}/test-executions`)) {
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'link-bug-exec-1', bug_id: bugId, test_execution_id: 'exec-1', test_run_id: 'RUN-101', test_run_name: 'Safari regression run', execution_status: 'failed', executed_at: new Date().toISOString() }] }) });
                return;
            }
            if (route.request().method() === 'GET' && url.pathname.endsWith(`/bugs/${bugId}/test-cases`)) {
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'link-bug-case-1', bug_id: bugId, test_case_id: testCaseId, relationship_type: 'reveals', source: 'qc', 'test-case_display_id': 'TC-101', 'test-case_title': 'Login validates password', 'test-case_status': 'active' }] }) });
                return;
            }
            if (route.request().method() === 'GET' && url.pathname.endsWith(`/bugs/${bugId}/tasks`)) {
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'link-bug-task-1', bug_id: bugId, task_id: taskId, relationship_type: 'blocks', source: 'qc', task_display_id: 'TSK-101', task_name: 'Implement login', task_status: 'In Progress' }] }) });
                return;
            }
            if (route.request().method() === 'GET' && url.pathname.endsWith(`/bugs/${bugId}/user-storys`)) {
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'link-bug-story-1', bug_id: bugId, user_story_id: storyId, relationship_type: 'affects', source: 'qc', 'user-story_display_id': 'US-101', 'user-story_title': 'User can log in', 'user-story_status': 'Approved' }] }) });
                return;
            }
            await route.continue();
        });

        await page.goto(`/work/tasks/${taskId}`);
        await expect(page.getByRole('heading', { name: 'Implement login' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Parent User Story' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Linked Test Cases' })).toBeVisible();
        await expect(page.getByText('Login validates password')).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Linked Bugs' })).toBeVisible();
        await expect(page.getByText('Login fails on Safari')).toBeVisible();

        const taskCaseSection = page.locator('section').filter({ hasText: 'Linked Test Cases' });
        await taskCaseSection.getByRole('button', { name: 'Add' }).click();
        await page.getByPlaceholder('Search by ID or title').fill('password');
        await page.getByText('TC-202 - Password reset works').click();
        await page.getByRole('button', { name: 'Add 1' }).click();
        await expect(taskCaseSection.getByText('Password reset works')).toBeVisible();

        await page.goto(`/work/bugs/${bugId}`);
        await expect(page.getByRole('heading', { name: 'Login fails on Safari' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Source / Provenance' })).toBeVisible();
        await expect(page.getByText('Safari regression run')).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Linked Test Cases' })).toBeVisible();
        await expect(page.getByText('Login validates password')).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Linked User Stories' })).toBeVisible();
        await expect(page.getByText('User can log in')).toBeVisible();

        await page.goto(`/test/cases/${testCaseId}`);
        await expect(page.getByRole('heading', { name: 'TC-101' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Linked User Stories' })).toBeVisible();
        await expect(page.getByText('User can log in')).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Containing Test Suites' })).toBeVisible();
        await expect(page.getByText('Regression suite')).toBeVisible();

        await page.goto(`/work/stories/${storyId}`);
        await expect(page.getByRole('heading', { name: 'User can log in' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Child Tasks' })).toBeVisible();
        await expect(page.getByText('Implement login')).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Linked Test Cases' })).toBeVisible();
        await expect(page.getByText('Login validates password')).toBeVisible();
    });
});

import { expect, test } from '@playwright/test';
import { mockAuthenticatedSession } from './helpers/session';

const projectId = '99999999-9999-9999-9999-999999999999';
const bugId = '55555555-5555-5555-5555-555555555555';
const taskId = '11111111-1111-1111-1111-111111111111';
const testCaseId = '33333333-3333-3333-3333-333333333333';
const userStoryId = '77777777-7777-7777-7777-777777777777';

async function mockAuth(page: any) {
    await mockAuthenticatedSession(page, { permissions: ['*'] });
    await page.route('**/auth/sync', async (route: any) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                user: {
                    id: '00000000-0000-0000-0000-000000000001',
                    name: 'E2E Admin',
                    email: 'e2e-admin@example.com',
                    role: 'admin',
                    status: 'ACTIVE',
                    preferences: {},
                },
                permissions: ['*'],
            }),
        });
    });
}

async function json(route: any, body: unknown) {
    await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
    });
}

test('bug detail renders provenance and all linked artifact panels', async ({ page }) => {
    await mockAuth(page);
    await page.route(`http://localhost:3001/bugs/${bugId}`, route => json(route, {
        success: true,
        data: {
            id: bugId,
            bug_id: 'BUG-001',
            title: 'Checkout fails',
            status: 'Open',
            severity: 'high',
            priority: 'high',
            project_id: projectId,
            project_name: 'Gerbil',
        },
    }));
    await page.route(`http://localhost:3001/bugs/${bugId}/test-executions`, route => json(route, { data: [] }));
    await page.route(`http://localhost:3001/bugs/${bugId}/tasks`, route => json(route, {
        data: [{ id: 'bt-1', bug_id: bugId, task_id: taskId, relationship_type: 'blocks', source: 'qc', task_display_id: 'TSK-001', task_title: 'Fix checkout', task_status: 'In Progress' }],
    }));
    await page.route(`http://localhost:3001/bugs/${bugId}/test-cases`, route => json(route, {
        data: [{ id: 'btc-1', bug_id: bugId, test_case_id: testCaseId, relationship_type: 'reveals', source: 'tuleap', test_case_display_id: 'TC-001', test_case_title: 'Checkout regression', test_case_status: 'active' }],
    }));
    await page.route(`http://localhost:3001/bugs/${bugId}/user-stories`, route => json(route, {
        data: [{ id: 'bus-1', bug_id: bugId, user_story_id: userStoryId, relationship_type: 'affects', source: 'qc', user_story_display_id: 'US-77', user_story_title: 'Buyer checks out', user_story_status: 'Review' }],
    }));

    await page.goto(`/work/bugs/${bugId}`);

    await expect(page.getByRole('heading', { name: 'Checkout fails' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Linked Tasks' })).toBeVisible();
    await expect(page.getByText('TSK-001 - Fix checkout')).toBeVisible();
    await expect(page.getByText('blocks')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Linked Test Cases' })).toBeVisible();
    await expect(page.getByText('TC-001 - Checkout regression')).toBeVisible();
    await expect(page.getByText('reveals')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Linked User Stories' })).toBeVisible();
    await expect(page.getByText('US-77 - Buyer checks out')).toBeVisible();
    await expect(page.getByText('affects')).toBeVisible();
});

test('task detail renders linked test cases and bugs', async ({ page }) => {
    await mockAuth(page);
    await page.route(`http://localhost:3001/tasks/${taskId}`, route => json(route, {
        id: taskId,
        task_id: 'TSK-001',
        task_name: 'Fix checkout',
        status: 'In Progress',
        project_id: projectId,
        project_name: 'Gerbil',
        parent_user_story_id: userStoryId,
    }));
    await page.route(`http://localhost:3001/tasks/${taskId}/comments`, route => json(route, []));
    await page.route(`http://localhost:3001/tasks/${taskId}/test-cases`, route => json(route, {
        data: [{ id: 'ttc-1', task_id: taskId, test_case_id: testCaseId, relationship_type: 'covers', source: 'qc', test_case_display_id: 'TC-001', test_case_title: 'Checkout regression', test_case_status: 'active', test_case_priority: 'high' }],
    }));
    await page.route(`http://localhost:3001/tasks/${taskId}/bugs`, route => json(route, {
        data: [{ id: 'bt-1', bug_id: bugId, task_id: taskId, relationship_type: 'blocks', source: 'qc', bug_display_id: 'BUG-001', bug_title: 'Checkout fails', bug_status: 'Open' }],
    }));

    await page.goto(`/work/tasks/${taskId}`);

    await expect(page.getByRole('heading', { name: 'Fix checkout' })).toBeVisible();
    await expect(page.getByText('Parent user story')).toBeVisible();
    await expect(page.getByText('TC-001 - Checkout regression')).toBeVisible();
    await expect(page.getByText('covers')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Linked Bugs' })).toBeVisible();
    await expect(page.getByText('BUG-001 - Checkout fails')).toBeVisible();
    await expect(page.getByText('is blocked by')).toBeVisible();

    await page
        .getByRole('heading', { name: 'Linked Test Cases' })
        .locator('xpath=ancestor::section')
        .getByRole('button', { name: 'Add' })
        .click();
    await expect(page.getByLabel('Relationship')).toHaveValue('covers');
});

test('test case detail renders upstream and downstream artifact panels', async ({ page }) => {
    await mockAuth(page);
    await page.route(`http://localhost:3001/test-cases/${testCaseId}`, route => json(route, {
        id: testCaseId,
        test_case_id: 'TC-001',
        title: 'Checkout regression',
        status: 'active',
        priority: 'high',
        project_id: projectId,
        project_name: 'Gerbil',
    }));
    await page.route(`http://localhost:3001/test-cases/${testCaseId}/user-stories`, route => json(route, {
        data: [{ id: 'tcus-1', test_case_id: testCaseId, user_story_id: userStoryId, relationship_type: 'verifies', source: 'qc', user_story_display_id: 'US-77', user_story_title: 'Buyer checks out', user_story_status: 'Review' }],
    }));
    await page.route(`http://localhost:3001/test-cases/${testCaseId}/tasks`, route => json(route, {
        data: [{ id: 'ttc-1', task_id: taskId, test_case_id: testCaseId, relationship_type: 'covers', source: 'qc', task_display_id: 'TSK-001', task_title: 'Fix checkout', task_name: 'Fix checkout', task_status: 'In Progress' }],
    }));
    await page.route(`http://localhost:3001/test-cases/${testCaseId}/bugs`, route => json(route, {
        data: [{ id: 'btc-1', bug_id: bugId, test_case_id: testCaseId, relationship_type: 'reveals', source: 'qc', bug_display_id: 'BUG-001', bug_title: 'Checkout fails', bug_status: 'Open' }],
    }));
    await page.route('http://localhost:3001/test-suites?*', route => json(route, {
        data: [{ id: 'suite-1', suite_id: 'TS-001', name: 'Release smoke', status: 'active', test_case_count: 12 }],
        pagination: { page: 1, limit: 100, total: 1, total_pages: 1 },
    }));

    await page.goto(`/test/cases/${testCaseId}`);

    await expect(page.getByRole('heading', { name: 'Linked User Stories' })).toBeVisible();
    await expect(page.getByText('US-77 - Buyer checks out')).toBeVisible();
    await expect(page.getByText('verifies')).toBeVisible();
    await expect(page.getByText('TSK-001 - Fix checkout')).toBeVisible();
    await expect(page.getByText('covered by')).toBeVisible();
    await expect(page.getByText('BUG-001 - Checkout fails')).toBeVisible();
    await expect(page.getByText('revealed by')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Containing Test Suites' })).toBeVisible();
    await expect(page.getByText('TS-001 - Release smoke')).toBeVisible();
});

test('user story detail renders child tasks, test cases, and bugs', async ({ page }) => {
    await mockAuth(page);
    await page.route(`http://localhost:3001/user-stories/${userStoryId}`, route => json(route, {
        id: userStoryId,
        tuleap_artifact_id: 77,
        title: 'Buyer checks out',
        description: 'As a buyer I can complete checkout.',
        acceptance_criteria: 'Payment is accepted.',
        status: 'Review',
        project_id: projectId,
        project_name: 'Gerbil',
    }));
    await page.route('http://localhost:3001/tasks?*', route => json(route, [{
        id: taskId,
        task_id: 'TSK-001',
        task_name: 'Fix checkout',
        status: 'In Progress',
        project_id: projectId,
    }]));
    await page.route(`http://localhost:3001/user-stories/${userStoryId}/test-cases`, route => json(route, {
        data: [{ id: 'tcus-1', test_case_id: testCaseId, user_story_id: userStoryId, relationship_type: 'verifies', source: 'qc', test_case_display_id: 'TC-001', test_case_title: 'Checkout regression', test_case_status: 'active' }],
    }));
    await page.route(`http://localhost:3001/user-stories/${userStoryId}/bugs`, route => json(route, {
        data: [{ id: 'bus-1', bug_id: bugId, user_story_id: userStoryId, relationship_type: 'affects', source: 'qc', bug_display_id: 'BUG-001', bug_title: 'Checkout fails', bug_status: 'Open' }],
    }));

    await page.goto(`/work/stories/${userStoryId}`);

    await expect(page.getByRole('heading', { name: 'Buyer checks out' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Child Tasks' })).toBeVisible();
    await expect(page.getByText('TSK-001 - Fix checkout')).toBeVisible();
    await expect(page.getByText('TC-001 - Checkout regression')).toBeVisible();
    await expect(page.getByText('verified by')).toBeVisible();
    await expect(page.getByText('BUG-001 - Checkout fails')).toBeVisible();
    await expect(page.getByText('affected by')).toBeVisible();
});

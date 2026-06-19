import { expect, test } from '@playwright/test';
import { mockAuthenticatedSession } from './helpers/session';

const projectId = '99999999-9999-9999-9999-999999999999';
const bugId = '55555555-5555-5555-5555-555555555555';
const taskId = '11111111-1111-1111-1111-111111111111';
const testCaseId = '33333333-3333-3333-3333-333333333333';
const testSuiteId = '22222222-2222-2222-2222-222222222222';
const testRunId = '44444444-4444-4444-4444-444444444444';
const foundBugId = '66666666-6666-6666-6666-666666666666';
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
    await page.route(`http://localhost:3001/user-stories/${userStoryId}`, route => json(route, {
        id: userStoryId,
        tuleap_artifact_id: 77,
        title: 'Buyer checks out',
        status: 'Review',
        project_id: projectId,
        project_name: 'Gerbil',
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
    await expect(page.getByRole('heading', { name: 'Parent User Story' })).toBeVisible();
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

test('test suite detail renders linked user stories', async ({ page }) => {
    await mockAuth(page);
    await page.route(`http://localhost:3001/test-suites/${testSuiteId}`, route => json(route, {
        id: testSuiteId,
        suite_id: 'TS-001',
        name: 'Release smoke',
        description: 'Release readiness coverage.',
        status: 'active',
        project_id: projectId,
        project_name: 'Gerbil',
        created_at: '2026-06-19T00:00:00.000Z',
        updated_at: '2026-06-19T00:00:00.000Z',
        test_cases: [{ id: testCaseId, junction_id: 'suite-case-1', test_case_id: 'TC-001', title: 'Checkout regression', status: 'active', priority: 'high', sort_order: 1 }],
    }));
    await page.route(`http://localhost:3001/test-suites/${testSuiteId}/user-stories`, route => json(route, {
        data: [{ id: 'ss-1', user_story_id: userStoryId, test_suite_id: testSuiteId, relationship_type: 'validated by', source: 'qc', user_story_display_id: 'US-77', user_story_title: 'Buyer checks out', user_story_status: 'Review' }],
    }));

    await page.goto(`/test/suites/${testSuiteId}`);

    await expect(page.getByRole('heading', { name: 'Release smoke' })).toBeVisible();
    const containedCases = page.getByRole('heading', { name: 'Contained Test Cases' }).locator('xpath=ancestor::section');
    await expect(containedCases.getByText('TC-001 - Checkout regression')).toBeVisible();
    await expect(containedCases.getByText('Derived')).toBeVisible();
    await expect(containedCases.getByRole('button', { name: 'Add' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Linked User Stories' })).toBeVisible();
    await expect(page.getByText('US-77 - Buyer checks out')).toBeVisible();
    await expect(page.getByText('validates')).toBeVisible();

    await page
        .getByRole('heading', { name: 'Linked User Stories' })
        .locator('xpath=ancestor::section')
        .getByRole('button', { name: 'Add' })
        .click();
    await expect(page.getByLabel('Relationship')).toHaveValue('validated by');
});

test('test run detail renders linked user stories, tasks, and bugs', async ({ page }) => {
    await mockAuth(page);
    await page.route(`http://localhost:3001/test-executions/test-runs/${testRunId}`, route => json(route, {
        id: testRunId,
        run_id: 'RUN-001',
        name: 'Checkout regression run',
        description: 'Nightly checkout checks.',
        project_id: projectId,
        project_name: 'Gerbil',
        status: 'in_progress',
        suite_id: testSuiteId,
        source: 'suite',
        environment: 'staging',
        version_tag: '2026.06',
        started_at: '2026-06-19T00:00:00.000Z',
        created_at: '2026-06-19T00:00:00.000Z',
        metrics: {
            total_executions: 0,
            pass_count: 0,
            fail_count: 0,
            not_run_count: 0,
            blocked_count: 0,
            skipped_count: 0,
            pass_rate_pct: 0,
            not_run_pct: 0,
        },
        executions: [{
            id: 'exec-1',
            test_case_uuid: testCaseId,
            test_case_id: 'TC-001',
            test_case_title: 'Checkout regression',
            status: 'fail',
            sort_order: 1,
        }],
    }));
    await page.route(`http://localhost:3001/test-suites/${testSuiteId}`, route => json(route, {
        id: testSuiteId,
        suite_id: 'TS-001',
        name: 'Release smoke',
        status: 'active',
        project_id: projectId,
        project_name: 'Gerbil',
        created_at: '2026-06-19T00:00:00.000Z',
        updated_at: '2026-06-19T00:00:00.000Z',
        test_cases: [],
    }));
    await page.route(`http://localhost:3001/test-executions/test-runs/${testRunId}/user-stories`, route => json(route, {
        data: [{ id: 'sr-1', user_story_id: userStoryId, test_run_id: testRunId, relationship_type: 'validated by', source: 'qc', user_story_display_id: 'US-77', user_story_title: 'Buyer checks out', user_story_status: 'Review' }],
    }));
    await page.route(`http://localhost:3001/test-executions/test-runs/${testRunId}/tasks`, route => json(route, {
        data: [{ id: 'tr-1', task_id: taskId, test_run_id: testRunId, relationship_type: 'exercised by', source: 'qc', task_display_id: 'TSK-001', task_title: 'Fix checkout', task_status: 'In Progress' }],
    }));
    await page.route(`http://localhost:3001/test-executions/test-runs/${testRunId}/bugs`, route => json(route, {
        data: [{ id: 'br-1', bug_id: bugId, test_run_id: testRunId, relationship_type: 'found in', source: 'qc', bug_display_id: 'BUG-001', bug_title: 'Checkout fails', bug_status: 'Open' }],
    }));
    await page.route(`http://localhost:3001/test-executions/test-runs/${testRunId}/bugs-found`, route => json(route, {
        data: [{ id: 'bte-1', bug_id: foundBugId, bug_display_id: 'BUG-FOUND', bug_title: 'Payment rejected', bug_status: 'Open', bug_project_id: projectId, execution_count: 1, created_at: '2026-06-19T00:00:00.000Z' }],
    }));

    await page.goto(`/test/runs/${testRunId}`);

    await expect(page.getByRole('heading', { name: 'RUN-001: Checkout regression run' })).toBeVisible();
    const bugsFound = page.getByRole('heading', { name: 'Bugs Found In This Run' }).locator('xpath=ancestor::section');
    await expect(bugsFound.getByText('BUG-FOUND - Payment rejected')).toBeVisible();
    await expect(bugsFound.getByText('finds')).toBeVisible();
    await expect(bugsFound.getByText('Derived')).toBeVisible();
    await expect(bugsFound.getByRole('button', { name: 'Add' })).toHaveCount(0);
    await expect(page.getByText('US-77 - Buyer checks out')).toBeVisible();
    await expect(page.getByText('validates')).toBeVisible();
    await expect(page.getByText('TSK-001 - Fix checkout')).toBeVisible();
    await expect(page.getByText('exercises')).toBeVisible();
    const linkedBugs = page.getByRole('heading', { name: 'Linked Bugs' }).locator('xpath=ancestor::section');
    await expect(linkedBugs.getByText('BUG-001 - Checkout fails')).toBeVisible();
    await expect(linkedBugs.getByText('finds')).toBeVisible();

    await page
        .getByRole('heading', { name: 'Linked Tasks' })
        .locator('xpath=ancestor::section')
        .getByRole('button', { name: 'Add' })
        .click();
    await expect(page.getByLabel('Relationship')).toHaveValue('exercised by');
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

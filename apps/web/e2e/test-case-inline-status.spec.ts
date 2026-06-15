import { expect, test, type Page, type Route } from '@playwright/test';
import { mockAuthenticatedSession } from './helpers/session';

const testCaseId = '33333333-4444-4555-8666-777777777777';
const projectId = '77777777-7777-4777-8777-777777777777';

function makeTestCase(overrides: Record<string, unknown> = {}) {
    return {
        id: testCaseId,
        test_case_id: 'TC-224',
        title: 'Checkout validation case',
        description: 'Validate checkout completion.',
        priority: 'high',
        severity: 'normal',
        test_type: 'functional',
        automation_status: 'manual',
        status: 'Not Run',
        project_id: projectId,
        project_name: 'Atlas Platform',
        created_at: '2026-06-01T00:00:00.000Z',
        updated_at: '2026-06-01T00:00:00.000Z',
        _can: { edit: true, delete: true, assign: true, comment: true },
        ...overrides,
    };
}

function makeBulkTestCases(count: number) {
    return Array.from({ length: count }, (_, index) => {
        const sequence = index + 1;
        return makeTestCase({
            id: `30000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
            test_case_id: `TC-${String(sequence).padStart(3, '0')}`,
            title: `Bulk test case ${sequence}`,
            status: 'Not Run',
        });
    });
}

async function mockTestCaseApis(
    page: Page,
    options: {
        initialTestCase?: Record<string, unknown>;
        initialTestCases?: Record<string, unknown>[];
        patchStatus?: number | ((testCaseId: string, payload: any) => number | undefined);
        onPatch?: (payload: any, testCaseId: string) => void;
    } = {}
) {
    let currentTestCases = options.initialTestCases
        ? options.initialTestCases.map(testCase => makeTestCase(testCase))
        : [makeTestCase(options.initialTestCase)];

    await page.route('**/projects*', async (route) => {
        if (route.request().method() === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([{ id: projectId, project_id: 'PRJ-224', project_name: 'Atlas Platform' }]),
            });
            return;
        }
        await route.continue();
    });

    await page.route('**/test-suites**', async (route) => {
        if (route.request().method() === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, data: [], pagination: { total: 0 } }),
            });
            return;
        }
        await route.continue();
    });

    await page.route('**/test-cases**', async (route: Route) => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname;
        const method = request.method();

        if (path === '/test-cases' && method === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    data: currentTestCases,
                    pagination: { page: 1, limit: 25, total: currentTestCases.length, total_pages: 1 },
                    stats: { active: currentTestCases.length, critical: 0, automated: 0 },
                }),
            });
            return;
        }

        const testCaseIdFromPath = path.match(/^\/test-cases\/([^/]+)$/)?.[1];
        const currentTestCase = testCaseIdFromPath
            ? currentTestCases.find(testCase => testCase.id === testCaseIdFromPath)
            : undefined;

        if (testCaseIdFromPath && method === 'GET' && currentTestCase) {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentTestCase) });
            return;
        }

        if (testCaseIdFromPath && method === 'PATCH' && currentTestCase) {
            const payload = request.postDataJSON();
            options.onPatch?.(payload, testCaseIdFromPath);
            const patchStatus = typeof options.patchStatus === 'function'
                ? options.patchStatus(testCaseIdFromPath, payload)
                : options.patchStatus;
            if (patchStatus && patchStatus >= 400) {
                await route.fulfill({
                    status: patchStatus,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: patchStatus === 403 ? 'no permission' : 'Exploded' }),
                });
                return;
            }
            currentTestCases = currentTestCases.map(testCase => testCase.id === testCaseIdFromPath ? { ...testCase, ...payload } : testCase);
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(currentTestCases.find(testCase => testCase.id === testCaseIdFromPath)),
            });
            return;
        }

        if (path.startsWith('/test-cases/') && method === 'GET') {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
            return;
        }

        await route.continue();
    });
}

test.describe('Test Case inline status control', () => {
    test.describe.configure({ timeout: 120_000 });

    test('updates a test case from the list', async ({ page }) => {
        let patchPayload: any = null;
        await mockAuthenticatedSession(page, {
            effectivePermissions: ['qc.testcases.view', 'qc.testcases.edit', 'qc.projects.view'],
            permissions: ['qc.testcases.view', 'qc.testcases.edit', 'qc.projects.view'],
        });
        await mockTestCaseApis(page, { onPatch: payload => { patchPayload = payload; } });

        await page.goto('/test/cases');
        await page.getByRole('button', { name: /Change status, currently Not Run/i }).click();
        const patchRequest = page.waitForRequest(request =>
            new URL(request.url()).pathname === `/test-cases/${testCaseId}` && request.method() === 'PATCH'
        );
        await page.getByRole('menuitem', { name: 'Pass' }).click();
        await patchRequest;

        await expect(page.getByRole('button', { name: /Change status, currently Pass/i })).toBeVisible();
        await expect(page.getByText('Test Case status updated to Pass')).toBeVisible();
        expect(patchPayload).toMatchObject({ status: 'Pass' });
    });

    test('renders the same control in the test case detail header', async ({ page }) => {
        let patchPayload: any = null;
        await mockAuthenticatedSession(page, {
            effectivePermissions: ['qc.testcases.view', 'qc.testcases.edit', 'qc.projects.view', 'qc.tasks.view', 'qc.bugs.view', 'qc.testsuites.view'],
            permissions: ['qc.testcases.view', 'qc.testcases.edit', 'qc.projects.view', 'qc.tasks.view', 'qc.bugs.view', 'qc.testsuites.view'],
        });
        await mockTestCaseApis(page, { onPatch: payload => { patchPayload = payload; } });

        await page.goto(`/test/cases/${testCaseId}`);
        await expect(page.getByRole('heading', { name: 'TC-224' })).toBeVisible();
        await page.getByRole('button', { name: /Change status, currently Not Run/i }).click();
        const patchRequest = page.waitForRequest(request =>
            new URL(request.url()).pathname === `/test-cases/${testCaseId}` && request.method() === 'PATCH'
        );
        await page.getByRole('menuitem', { name: 'Blocked' }).click();
        await patchRequest;

        await expect(page.getByRole('button', { name: /Change status, currently Blocked/i })).toBeVisible();
        expect(patchPayload).toMatchObject({ status: 'Blocked' });
    });

    test('disables test case status when _can.edit is false', async ({ page }) => {
        await mockAuthenticatedSession(page, {
            effectivePermissions: ['qc.testcases.view', 'qc.testcases.edit', 'qc.projects.view'],
            permissions: ['qc.testcases.view', 'qc.testcases.edit', 'qc.projects.view'],
        });
        await mockTestCaseApis(page, { initialTestCase: { _can: { edit: false } } });

        await page.goto('/test/cases');
        const disabledControl = page.getByRole('button', { name: /You don't have permission to change status/i });
        await expect(disabledControl).toBeDisabled();

        await page.getByTestId(`status-control-disabled-${testCaseId}`).hover();
        await expect(page.getByText("You don't have permission to change status")).toBeVisible();
    });

    test('bulk partial failure rolls back the failed test case and reports a summary', async ({ page }) => {
        const testCases = makeBulkTestCases(3);
        const failingTestCase = testCases[1];
        const patchCalls: Array<{ testCaseId: string; payload: any }> = [];
        await mockAuthenticatedSession(page, {
            effectivePermissions: ['qc.testcases.view', 'qc.testcases.edit', 'qc.projects.view'],
            permissions: ['qc.testcases.view', 'qc.testcases.edit', 'qc.projects.view'],
        });
        await mockTestCaseApis(page, {
            initialTestCases: testCases,
            patchStatus: (id) => id === failingTestCase.id ? 403 : undefined,
            onPatch: (payload, id) => { patchCalls.push({ testCaseId: id, payload }); },
        });

        await page.goto('/test/cases');
        await page.getByRole('checkbox', { name: 'Select all filtered test cases' }).check();
        await expect(page.getByTestId('bulk-status-bar')).toContainText('3 selected');
        await page.getByTestId('bulk-status-select').selectOption('Blocked');
        await page.getByTestId('bulk-status-apply').click();

        await expect.poll(() => patchCalls.length).toBe(3);
        await expect(page.getByRole('status').filter({ hasText: '2 updated, 1 failed (no permission)' })).toBeVisible();
        await expect(page.getByTestId(`test-case-row-${testCases[0].id}`).getByRole('button', { name: /currently Blocked/i })).toBeVisible();
        await expect(page.getByTestId(`test-case-row-${failingTestCase.id}`).getByRole('button', { name: /currently Not Run/i })).toBeVisible();
        await expect(page.getByTestId(`test-case-row-${testCases[2].id}`).getByRole('button', { name: /currently Blocked/i })).toBeVisible();
    });
});

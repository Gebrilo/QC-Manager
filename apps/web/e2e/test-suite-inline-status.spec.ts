import { expect, test, type Page, type Route } from '@playwright/test';
import { mockAuthenticatedSession } from './helpers/session';

const suiteId = '44444444-5555-4666-8777-888888888888';
const projectId = '99999999-9999-4999-8999-999999999999';

function makeTestSuite(overrides: Record<string, unknown> = {}) {
    return {
        id: suiteId,
        suite_id: 'TS-225',
        name: 'Release readiness suite',
        description: 'Validates release readiness.',
        status: 'draft',
        suite_type: 'regression',
        readiness_scope: 'required',
        project_id: projectId,
        project_name: 'Atlas Platform',
        created_by_name: 'QA Lead',
        updated_by_name: 'QA Lead',
        created_at: '2026-06-01T00:00:00.000Z',
        updated_at: '2026-06-01T00:00:00.000Z',
        test_case_count: 0,
        last_run_date: null,
        last_run_pass_rate: null,
        test_cases: [],
        _can: { edit: true, delete: true, assign: true, comment: true },
        ...overrides,
    };
}

function makeBulkSuites(count: number) {
    return Array.from({ length: count }, (_, index) => {
        const sequence = index + 1;
        return makeTestSuite({
            id: `40000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
            suite_id: `TS-${String(sequence).padStart(3, '0')}`,
            name: `Bulk test suite ${sequence}`,
            status: 'draft',
        });
    });
}

async function mockTestSuiteApis(
    page: Page,
    options: {
        initialSuite?: Record<string, unknown>;
        initialSuites?: Record<string, unknown>[];
        patchStatus?: number | ((suiteId: string, payload: any) => number | undefined);
        onPatch?: (payload: any, suiteId: string) => void;
    } = {}
) {
    let currentSuites = options.initialSuites
        ? options.initialSuites.map(suite => makeTestSuite(suite))
        : [makeTestSuite(options.initialSuite)];

    await page.route('**/projects*', async (route) => {
        if (route.request().method() === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([{ id: projectId, project_id: 'PRJ-225', project_name: 'Atlas Platform' }]),
            });
            return;
        }
        await route.continue();
    });

    await page.route('**/test-suites**', async (route: Route) => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname;
        const method = request.method();

        if (path === '/test-suites' && method === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    data: currentSuites,
                    pagination: { page: 1, limit: 25, total: currentSuites.length, total_pages: 1 },
                    stats: {
                        active: currentSuites.filter(suite => suite.status === 'active').length,
                        archived: currentSuites.filter(suite => suite.status === 'archived').length,
                        total_cases: currentSuites.reduce((sum, suite) => sum + Number(suite.test_case_count || 0), 0),
                    },
                }),
            });
            return;
        }

        const suiteIdFromPath = path.match(/^\/test-suites\/([^/]+)$/)?.[1];
        const currentSuite = suiteIdFromPath
            ? currentSuites.find(suite => suite.id === suiteIdFromPath)
            : undefined;

        if (suiteIdFromPath && method === 'GET' && currentSuite) {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentSuite) });
            return;
        }

        if (suiteIdFromPath && method === 'PATCH' && currentSuite) {
            const payload = request.postDataJSON();
            options.onPatch?.(payload, suiteIdFromPath);
            const patchStatus = typeof options.patchStatus === 'function'
                ? options.patchStatus(suiteIdFromPath, payload)
                : options.patchStatus;
            if (patchStatus && patchStatus >= 400) {
                await route.fulfill({
                    status: patchStatus,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: patchStatus === 403 ? 'no permission' : 'Exploded' }),
                });
                return;
            }
            currentSuites = currentSuites.map(suite => suite.id === suiteIdFromPath ? { ...suite, ...payload } : suite);
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(currentSuites.find(suite => suite.id === suiteIdFromPath)),
            });
            return;
        }

        if (path.startsWith('/test-suites/') && method === 'GET') {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
            return;
        }

        await route.continue();
    });
}

test.describe('Test Suite inline status control', () => {
    test.describe.configure({ timeout: 120_000 });

    test('updates a test suite from the list', async ({ page }) => {
        let patchPayload: any = null;
        await mockAuthenticatedSession(page, {
            effectivePermissions: ['qc.testsuites.view', 'qc.testsuites.edit', 'qc.projects.view'],
            permissions: ['qc.testsuites.view', 'qc.testsuites.edit', 'qc.projects.view'],
        });
        await mockTestSuiteApis(page, { onPatch: payload => { patchPayload = payload; } });

        await page.goto('/test/suites');
        await page.getByRole('button', { name: /Change status, currently Draft/i }).click();
        const patchRequest = page.waitForRequest(request =>
            new URL(request.url()).pathname === `/test-suites/${suiteId}` && request.method() === 'PATCH'
        );
        await page.getByRole('menuitem', { name: 'Active' }).click();
        await patchRequest;

        await expect(page.getByRole('button', { name: /Change status, currently Active/i })).toBeVisible();
        await expect(page.getByText('Test Suite status updated to Active')).toBeVisible();
        expect(patchPayload).toMatchObject({ status: 'active' });
    });

    test('renders the same control in the test suite detail header', async ({ page }) => {
        let patchPayload: any = null;
        await mockAuthenticatedSession(page, {
            effectivePermissions: ['qc.testsuites.view', 'qc.testsuites.edit', 'qc.projects.view', 'qc.testruns.create'],
            permissions: ['qc.testsuites.view', 'qc.testsuites.edit', 'qc.projects.view', 'qc.testruns.create'],
        });
        await mockTestSuiteApis(page, { onPatch: payload => { patchPayload = payload; } });

        await page.goto(`/test/suites/${suiteId}`);
        await expect(page.getByRole('heading', { name: 'TS-225' })).toBeVisible();
        await page.getByRole('button', { name: /Change status, currently Draft/i }).click();
        const patchRequest = page.waitForRequest(request =>
            new URL(request.url()).pathname === `/test-suites/${suiteId}` && request.method() === 'PATCH'
        );
        await page.getByRole('menuitem', { name: 'Archived' }).click();
        await patchRequest;

        await expect(page.getByRole('button', { name: /Change status, currently Archived/i })).toBeVisible();
        expect(patchPayload).toMatchObject({ status: 'archived' });
    });

    test('disables test suite status when _can.edit is false', async ({ page }) => {
        await mockAuthenticatedSession(page, {
            effectivePermissions: ['qc.testsuites.view', 'qc.testsuites.edit', 'qc.projects.view'],
            permissions: ['qc.testsuites.view', 'qc.testsuites.edit', 'qc.projects.view'],
        });
        await mockTestSuiteApis(page, { initialSuite: { _can: { edit: false } } });

        await page.goto('/test/suites');
        const disabledControl = page.getByRole('button', { name: /You don't have permission to change status/i });
        await expect(disabledControl).toBeDisabled();

        await page.getByTestId(`status-control-disabled-${suiteId}`).hover();
        await expect(page.getByText("You don't have permission to change status")).toBeVisible();
    });

    test('bulk partial failure rolls back the failed test suite and reports a summary', async ({ page }) => {
        const suites = makeBulkSuites(3);
        const failingSuite = suites[1];
        const patchCalls: Array<{ suiteId: string; payload: any }> = [];
        await mockAuthenticatedSession(page, {
            effectivePermissions: ['qc.testsuites.view', 'qc.testsuites.edit', 'qc.projects.view'],
            permissions: ['qc.testsuites.view', 'qc.testsuites.edit', 'qc.projects.view'],
        });
        await mockTestSuiteApis(page, {
            initialSuites: suites,
            patchStatus: (id) => id === failingSuite.id ? 403 : undefined,
            onPatch: (payload, id) => { patchCalls.push({ suiteId: id, payload }); },
        });

        await page.goto('/test/suites');
        await page.getByRole('checkbox', { name: 'Select all filtered test suites' }).check();
        await expect(page.getByTestId('bulk-status-bar')).toContainText('3 selected');
        await page.getByTestId('bulk-status-select').selectOption('archived');
        await page.getByTestId('bulk-status-apply').click();

        await expect.poll(() => patchCalls.length).toBe(3);
        await expect(page.getByRole('status').filter({ hasText: '2 updated, 1 failed (no permission)' })).toBeVisible();
        await expect(page.getByTestId(`test-suite-row-${suites[0].id}`).getByRole('button', { name: /currently Archived/i })).toBeVisible();
        await expect(page.getByTestId(`test-suite-row-${failingSuite.id}`).getByRole('button', { name: /currently Draft/i })).toBeVisible();
        await expect(page.getByTestId(`test-suite-row-${suites[2].id}`).getByRole('button', { name: /currently Archived/i })).toBeVisible();
    });
});

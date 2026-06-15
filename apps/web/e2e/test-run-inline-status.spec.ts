import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import { mockAuthenticatedSession } from './helpers/session';

const runId = '55555555-6666-4777-8888-999999999999';
const projectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function makeTestRun(overrides: Record<string, unknown> = {}) {
    return {
        id: runId,
        run_id: 'TR-226',
        name: 'Sprint regression run',
        description: 'Regression run for the sprint.',
        status: 'in_progress',
        started_at: '2026-06-01T00:00:00.000Z',
        completed_at: null,
        project_id: projectId,
        project_name: 'Atlas Platform',
        total_cases: 5,
        passed: 2,
        failed: 1,
        not_run: 1,
        blocked: 1,
        skipped: 0,
        pass_rate: 40,
        source: 'suite',
        environment: 'staging',
        version_tag: '1.2.3',
        created_by_name: 'QA Lead',
        created_at: '2026-06-01T00:00:00.000Z',
        updated_at: '2026-06-01T00:00:00.000Z',
        _can: { edit: true, delete: true, assign: true, comment: true },
        ...overrides,
    };
}

function makeBulkRuns(count: number) {
    return Array.from({ length: count }, (_, index) => {
        const sequence = index + 1;
        return makeTestRun({
            id: `50000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
            run_id: `TR-${String(sequence).padStart(3, '0')}`,
            name: `Bulk test run ${sequence}`,
            status: 'in_progress',
        });
    });
}

function makeRunDetail(run: Record<string, unknown>) {
    return {
        ...run,
        metrics: {
            total_executions: run.total_cases ?? 0,
            pass_count: run.passed ?? 0,
            fail_count: run.failed ?? 0,
            not_run_count: run.not_run ?? 0,
            blocked_count: run.blocked ?? 0,
            skipped_count: run.skipped ?? 0,
            pass_rate_pct: run.pass_rate ?? 0,
            not_run_pct: 20,
        },
        executions: [],
    };
}

async function mockTestRunApis(
    page: Page,
    options: {
        initialRun?: Record<string, unknown>;
        initialRuns?: Record<string, unknown>[];
        patchStatus?: number | ((runId: string, payload: any) => number | undefined);
        onPatch?: (payload: any, runId: string) => void;
    } = {}
) {
    let currentRuns = options.initialRuns
        ? options.initialRuns.map(run => makeTestRun(run))
        : [makeTestRun(options.initialRun)];

    await page.route('**/projects*', async (route) => {
        if (route.request().method() === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([{ id: projectId, project_id: 'PRJ-226', project_name: 'Atlas Platform' }]),
            });
            return;
        }
        await route.continue();
    });

    await page.route('**/test-executions/**', async (route: Route) => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname;
        const method = request.method();

        if (path === '/test-executions/recent-uploads' && method === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(currentRuns),
            });
            return;
        }

        const runIdFromPath = path.match(/^\/test-executions\/test-runs\/([^/]+)$/)?.[1];
        const currentRun = runIdFromPath
            ? currentRuns.find(run => run.id === runIdFromPath)
            : undefined;

        if (runIdFromPath && method === 'GET' && currentRun) {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(makeRunDetail(currentRun)),
            });
            return;
        }

        if (runIdFromPath && method === 'PATCH' && currentRun) {
            const payload = request.postDataJSON();
            options.onPatch?.(payload, runIdFromPath);
            const patchStatus = typeof options.patchStatus === 'function'
                ? options.patchStatus(runIdFromPath, payload)
                : options.patchStatus;
            if (patchStatus && patchStatus >= 400) {
                await route.fulfill({
                    status: patchStatus,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: patchStatus === 403 ? 'no permission' : 'Exploded' }),
                });
                return;
            }
            currentRuns = currentRuns.map(run => run.id === runIdFromPath ? { ...run, ...payload } : run);
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(currentRuns.find(run => run.id === runIdFromPath)),
            });
            return;
        }

        await route.continue();
    });
}

async function gotoAndWaitFor(page: Page, url: string, locator: Locator) {
    await page.goto(url);
    try {
        await expect(locator).toBeVisible({ timeout: 15_000 });
    } catch (error) {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(locator).toBeVisible({ timeout: 45_000 });
    }
}

test.describe('Test Run inline status control', () => {
    test.describe.configure({ timeout: 120_000 });

    test('updates a test run from the history list through the run PATCH endpoint', async ({ page }) => {
        let patchPayload: any = null;
        await mockAuthenticatedSession(page, {
            effectivePermissions: ['qc.testexecutions.view', 'qc.testexecutions.edit', 'qc.projects.view'],
            permissions: ['qc.testexecutions.view', 'qc.testexecutions.edit', 'qc.projects.view'],
        });
        await mockTestRunApis(page, { onPatch: payload => { patchPayload = payload; } });

        const statusControl = page.getByRole('button', { name: /Change status, currently In Progress/i });
        await gotoAndWaitFor(page, '/test/runs?tab=history', statusControl);
        await statusControl.click();
        const patchRequest = page.waitForRequest(request =>
            new URL(request.url()).pathname === `/test-executions/test-runs/${runId}` && request.method() === 'PATCH'
        );
        await page.getByRole('menuitem', { name: 'Completed' }).click();
        await patchRequest;

        await expect(page.getByRole('button', { name: /Change status, currently Completed/i })).toBeVisible();
        await expect(page.getByText('Test Run status updated to Completed')).toBeVisible();
        expect(patchPayload).toMatchObject({ status: 'completed' });
    });

    test('renders the same control in the test run detail header', async ({ page }) => {
        let patchPayload: any = null;
        await mockAuthenticatedSession(page, {
            effectivePermissions: ['qc.testexecutions.view', 'qc.testexecutions.edit', 'qc.projects.view'],
            permissions: ['qc.testexecutions.view', 'qc.testexecutions.edit', 'qc.projects.view'],
        });
        await mockTestRunApis(page, { onPatch: payload => { patchPayload = payload; } });

        const heading = page.getByRole('heading', { name: /TR-226: Sprint regression run/i });
        await gotoAndWaitFor(page, `/test/runs/${runId}`, heading);
        await page.getByRole('button', { name: /Change status, currently In Progress/i }).click();
        const patchRequest = page.waitForRequest(request =>
            new URL(request.url()).pathname === `/test-executions/test-runs/${runId}` && request.method() === 'PATCH'
        );
        await page.getByRole('menuitem', { name: 'Aborted' }).click();
        await patchRequest;

        await expect(page.getByRole('button', { name: /Change status, currently Aborted/i })).toBeVisible();
        expect(patchPayload).toMatchObject({ status: 'aborted' });
    });

    test('disables test run status when _can.edit is false', async ({ page }) => {
        await mockAuthenticatedSession(page, {
            effectivePermissions: ['qc.testexecutions.view', 'qc.testexecutions.edit', 'qc.projects.view'],
            permissions: ['qc.testexecutions.view', 'qc.testexecutions.edit', 'qc.projects.view'],
        });
        await mockTestRunApis(page, { initialRun: { _can: { edit: false } } });

        const disabledControl = page.getByRole('button', { name: /You don't have permission to change status/i });
        await gotoAndWaitFor(page, '/test/runs?tab=history', disabledControl);
        await expect(disabledControl).toBeDisabled();

        await page.getByTestId(`status-control-disabled-${runId}`).hover();
        await expect(page.getByText("You don't have permission to change status")).toBeVisible();
    });

    test('bulk partial failure rolls back the failed test run and reports a summary', async ({ page }) => {
        const runs = makeBulkRuns(3);
        const failingRun = runs[1];
        const patchCalls: Array<{ runId: string; payload: any }> = [];
        await mockAuthenticatedSession(page, {
            effectivePermissions: ['qc.testexecutions.view', 'qc.testexecutions.edit', 'qc.projects.view'],
            permissions: ['qc.testexecutions.view', 'qc.testexecutions.edit', 'qc.projects.view'],
        });
        await mockTestRunApis(page, {
            initialRuns: runs,
            patchStatus: (id) => id === failingRun.id ? 403 : undefined,
            onPatch: (payload, id) => { patchCalls.push({ runId: id, payload }); },
        });

        const selectAll = page.getByRole('checkbox', { name: 'Select all filtered test runs' });
        await gotoAndWaitFor(page, '/test/runs?tab=history', selectAll);
        await selectAll.check();
        await expect(page.getByTestId('bulk-status-bar')).toContainText('3 selected');
        await page.getByTestId('bulk-status-select').selectOption('completed');
        await page.getByTestId('bulk-status-apply').click();

        await expect.poll(() => patchCalls.length).toBe(3);
        await expect(page.getByRole('status').filter({ hasText: '2 updated, 1 failed (no permission)' })).toBeVisible();
        await expect(page.getByTestId(`test-run-row-${runs[0].id}`).getByRole('button', { name: /currently Completed/i })).toBeVisible();
        await expect(page.getByTestId(`test-run-row-${failingRun.id}`).getByRole('button', { name: /currently In Progress/i })).toBeVisible();
        await expect(page.getByTestId(`test-run-row-${runs[2].id}`).getByRole('button', { name: /currently Completed/i })).toBeVisible();
    });
});

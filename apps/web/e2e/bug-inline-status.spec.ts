import { expect, test, type Page, type Route } from '@playwright/test';
import { mockAuthenticatedSession } from './helpers/session';

const bugId = '22222222-3333-4444-8555-666666666666';
const projectId = '88888888-8888-4888-8888-888888888888';

function makeBug(overrides: Record<string, unknown> = {}) {
    return {
        id: bugId,
        bug_id: 'BUG-223',
        tuleap_artifact_id: 3223,
        title: 'Login redirect bug',
        description: 'Redirect fails after login.',
        status: 'New',
        severity: 'Major impact',
        priority: 'P2-High',
        source: 'EXPLORATORY',
        project_id: projectId,
        project_name: 'Atlas Platform',
        reported_by: 'QA Tester',
        assigned_to: 'Developer One',
        reported_date: '2026-06-01',
        _can: { edit: true, delete: true, assign: true, comment: true },
        ...overrides,
    };
}

function makeBulkBugs(count: number) {
    return Array.from({ length: count }, (_, index) => {
        const sequence = index + 1;
        return makeBug({
            id: `20000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
            bug_id: `BUG-${String(sequence).padStart(3, '0')}`,
            tuleap_artifact_id: 3000 + sequence,
            title: `Bulk bug ${sequence}`,
            status: 'New',
        });
    });
}

async function mockBugApis(
    page: Page,
    options: {
        initialBug?: Record<string, unknown>;
        initialBugs?: Record<string, unknown>[];
        patchStatus?: number | ((bugId: string, payload: any) => number | undefined);
        onPatch?: (payload: any, bugId: string) => void;
    } = {}
) {
    let currentBugs = options.initialBugs
        ? options.initialBugs.map(bug => makeBug(bug))
        : [makeBug(options.initialBug)];

    await page.route('**/projects*', async (route) => {
        if (route.request().method() === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([{ id: projectId, project_id: 'PRJ-223', project_name: 'Atlas Platform' }]),
            });
            return;
        }
        await route.continue();
    });

    await page.route('**/attachments/**', async (route) => {
        if (route.request().method() === 'GET') {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
            return;
        }
        await route.continue();
    });

    await page.route('**/bugs**', async (route: Route) => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname;
        const method = request.method();

        if (path === '/bugs/summary' && method === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    data: {
                        totals: {
                            total_bugs: currentBugs.length,
                            open_bugs: currentBugs.filter(bug => bug.status !== 'Closed').length,
                            closed_bugs: currentBugs.filter(bug => bug.status === 'Closed').length,
                            bugs_from_testing: 0,
                            standalone_bugs: currentBugs.length,
                        },
                        by_severity: { critical: 0, major: currentBugs.length, minor: 0, cosmetic: 0 },
                    },
                }),
            });
            return;
        }

        if (path === '/bugs' && method === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    count: currentBugs.length,
                    total: currentBugs.length,
                    data: currentBugs,
                }),
            });
            return;
        }

        const bugIdFromPath = path.match(/^\/bugs\/([^/]+)$/)?.[1];
        const currentBug = bugIdFromPath
            ? currentBugs.find(bug => bug.id === bugIdFromPath)
            : undefined;

        if (bugIdFromPath && method === 'GET' && currentBug) {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: currentBug }) });
            return;
        }

        if (bugIdFromPath && method === 'PATCH' && currentBug) {
            const payload = request.postDataJSON();
            options.onPatch?.(payload, bugIdFromPath);
            const patchStatus = typeof options.patchStatus === 'function'
                ? options.patchStatus(bugIdFromPath, payload)
                : options.patchStatus;
            if (patchStatus && patchStatus >= 400) {
                await route.fulfill({
                    status: patchStatus,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: patchStatus === 403 ? 'no permission' : 'Exploded' }),
                });
                return;
            }
            currentBugs = currentBugs.map(bug => bug.id === bugIdFromPath ? { ...bug, ...payload } : bug);
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, data: currentBugs.find(bug => bug.id === bugIdFromPath) }),
            });
            return;
        }

        if (path.startsWith('/bugs/') && method === 'GET') {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
            return;
        }

        await route.continue();
    });
}

test.describe('Bug inline status control', () => {
    test.describe.configure({ timeout: 120_000 });

    test('updates a bug from the list', async ({ page }) => {
        let patchPayload: any = null;
        await mockAuthenticatedSession(page, {
            effectivePermissions: ['qc.bugs.view', 'qc.bugs.edit', 'qc.projects.view'],
            permissions: ['qc.bugs.view', 'qc.bugs.edit', 'qc.projects.view'],
        });
        await mockBugApis(page, { onPatch: payload => { patchPayload = payload; } });

        await page.goto('/work/bugs');
        await page.getByRole('button', { name: /Change status, currently New/i }).click();
        const patchRequest = page.waitForRequest(request =>
            new URL(request.url()).pathname === `/bugs/${bugId}` && request.method() === 'PATCH'
        );
        await page.getByRole('menuitem', { name: 'Fixed' }).click();
        await patchRequest;

        await expect(page.getByRole('button', { name: /Change status, currently Fixed/i })).toBeVisible();
        await expect(page.getByText('Bug status updated to Fixed')).toBeVisible();
        expect(patchPayload).toMatchObject({ status: 'Fixed' });
    });

    test('renders the same control in the bug detail header', async ({ page }) => {
        let patchPayload: any = null;
        await mockAuthenticatedSession(page, {
            effectivePermissions: ['qc.bugs.view', 'qc.bugs.edit', 'qc.tasks.view', 'qc.testcases.view', 'qc.projects.view', 'qc.testexecutions.view'],
            permissions: ['qc.bugs.view', 'qc.bugs.edit', 'qc.tasks.view', 'qc.testcases.view', 'qc.projects.view', 'qc.testexecutions.view'],
        });
        await mockBugApis(page, { onPatch: payload => { patchPayload = payload; } });

        await page.goto(`/work/bugs/${bugId}`);
        await expect(page.getByRole('heading', { name: 'Login redirect bug' })).toBeVisible();
        await page.getByRole('button', { name: /Change status, currently New/i }).click();
        const patchRequest = page.waitForRequest(request =>
            new URL(request.url()).pathname === `/bugs/${bugId}` && request.method() === 'PATCH'
        );
        await page.getByRole('menuitem', { name: 'Verified' }).click();
        await patchRequest;

        await expect(page.getByRole('button', { name: /Change status, currently Verified/i })).toBeVisible();
        expect(patchPayload).toMatchObject({ status: 'Verified' });
    });

    test('disables bug status when _can.edit is false', async ({ page }) => {
        await mockAuthenticatedSession(page, {
            effectivePermissions: ['qc.bugs.view', 'qc.bugs.edit', 'qc.projects.view'],
            permissions: ['qc.bugs.view', 'qc.bugs.edit', 'qc.projects.view'],
        });
        await mockBugApis(page, { initialBug: { _can: { edit: false } } });

        await page.goto('/work/bugs');
        const disabledControl = page.getByRole('button', { name: /You don't have permission to change status/i });
        await expect(disabledControl).toBeDisabled();

        await page.getByTestId(`status-control-disabled-${bugId}`).hover();
        await expect(page.getByText("You don't have permission to change status")).toBeVisible();
    });

    test('bulk partial failure rolls back the failed bug and reports a summary', async ({ page }) => {
        const bugs = makeBulkBugs(3);
        const failingBug = bugs[1];
        const patchCalls: Array<{ bugId: string; payload: any }> = [];
        await mockAuthenticatedSession(page, {
            effectivePermissions: ['qc.bugs.view', 'qc.bugs.edit', 'qc.projects.view'],
            permissions: ['qc.bugs.view', 'qc.bugs.edit', 'qc.projects.view'],
        });
        await mockBugApis(page, {
            initialBugs: bugs,
            patchStatus: (id) => id === failingBug.id ? 403 : undefined,
            onPatch: (payload, id) => { patchCalls.push({ bugId: id, payload }); },
        });

        await page.goto('/work/bugs');
        await page.getByRole('checkbox', { name: 'Select all filtered bugs' }).check();
        await expect(page.getByTestId('bulk-status-bar')).toContainText('3 selected');
        await page.getByTestId('bulk-status-select').selectOption('Closed');
        await page.getByTestId('bulk-status-apply').click();

        await expect.poll(() => patchCalls.length).toBe(3);
        await expect(page.getByRole('status').filter({ hasText: '2 updated, 1 failed (no permission)' })).toBeVisible();
        await expect(page.getByTestId(`bug-row-${bugs[0].id}`).getByRole('button', { name: /currently Closed/i })).toBeVisible();
        await expect(page.getByTestId(`bug-row-${failingBug.id}`).getByRole('button', { name: /currently New/i })).toBeVisible();
        await expect(page.getByTestId(`bug-row-${bugs[2].id}`).getByRole('button', { name: /currently Closed/i })).toBeVisible();
    });
});

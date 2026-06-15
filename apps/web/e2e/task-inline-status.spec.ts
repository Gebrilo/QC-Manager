import { expect, test, type Page, type Route } from '@playwright/test';
import { mockAuthenticatedSession } from './helpers/session';

const taskId = '33333333-3333-4333-8333-333333333333';
const projectId = '11111111-1111-4111-8111-111111111111';

function makeTask(overrides: Record<string, unknown> = {}) {
    return {
        id: taskId,
        task_id: 'TSK-220',
        task_name: 'Inline status tracer',
        status: 'Todo',
        priority: 'Medium',
        project_id: projectId,
        project_name: 'Atlas Platform',
        total_est_hrs: 8,
        total_actual_hrs: 0,
        overall_completion_pct: 0,
        _can: { edit: true, delete: true, assign: true, comment: true },
        ...overrides,
    };
}

async function mockTaskApis(
    page: Page,
    options: {
        initialTask?: Record<string, unknown>;
        patchStatus?: number;
        patchDelayMs?: number;
        onPatch?: (payload: any) => void;
    } = {}
) {
    let currentTask = makeTask(options.initialTask);

    await page.route('**/projects*', async (route) => {
        if (route.request().method() === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([{ id: projectId, project_id: 'PRJ-220', project_name: 'Atlas Platform' }]),
            });
            return;
        }
        await route.continue();
    });

    await page.route('**/resources*', async (route) => {
        if (route.request().method() === 'GET') {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
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

    await page.route('**/tasks**', async (route: Route) => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname;
        const method = request.method();

        if (path === '/tasks' && method === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([currentTask]),
            });
            return;
        }

        if (path === `/tasks/${taskId}` && method === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(currentTask),
            });
            return;
        }

        if (path === `/tasks/${taskId}` && method === 'PATCH') {
            const payload = request.postDataJSON();
            options.onPatch?.(payload);
            if (options.patchDelayMs) {
                await new Promise(resolve => setTimeout(resolve, options.patchDelayMs));
            }
            if (options.patchStatus && options.patchStatus >= 400) {
                await route.fulfill({
                    status: options.patchStatus,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: 'Exploded' }),
                });
                return;
            }
            currentTask = { ...currentTask, ...payload };
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(currentTask),
            });
            return;
        }

        if (path === `/tasks/${taskId}/test-cases` || path === `/tasks/${taskId}/bugs`) {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
            return;
        }

        await route.continue();
    });
}

test.describe('Task inline status control', () => {
    test('updates a task from the list and sends Done default fills', async ({ page }) => {
        let patchPayload: any = null;
        await mockAuthenticatedSession(page, {
            effectivePermissions: ['qc.tasks.view', 'qc.tasks.edit', 'qc.projects.view', 'qc.resources.view'],
            permissions: ['qc.tasks.view', 'qc.tasks.edit', 'qc.projects.view', 'qc.resources.view'],
        });
        await mockTaskApis(page, { onPatch: payload => { patchPayload = payload; } });

        await page.goto('/work/tasks');
        await page.getByRole('button', { name: /Change status, currently Todo/i }).click();
        const patchRequest = page.waitForRequest(request =>
            new URL(request.url()).pathname === `/tasks/${taskId}` && request.method() === 'PATCH'
        );
        await page.getByRole('menuitem', { name: 'Done' }).click();
        await patchRequest;

        await expect(page.getByRole('button', { name: /Change status, currently Done/i })).toBeVisible();
        await expect(page.getByText('Task status updated to Done')).toBeVisible();
        expect(patchPayload).toMatchObject({
            status: 'Done',
            completion_status: 'Completed',
        });
        expect(patchPayload.completed_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test('rolls back the visible status when the update fails', async ({ page }) => {
        await mockAuthenticatedSession(page, {
            effectivePermissions: ['qc.tasks.view', 'qc.tasks.edit'],
            permissions: ['qc.tasks.view', 'qc.tasks.edit'],
        });
        await mockTaskApis(page, { patchStatus: 500, patchDelayMs: 250 });

        await page.goto('/work/tasks');
        await page.getByRole('button', { name: /Change status, currently Todo/i }).click();
        await page.getByRole('menuitem', { name: 'Blocked' }).click();

        await expect(page.getByRole('button', { name: /Change status, currently Blocked/i })).toBeVisible();
        await expect(page.getByRole('alert').filter({ hasText: 'Exploded' })).toBeVisible();
        await expect(page.getByRole('button', { name: /Change status, currently Todo/i })).toBeVisible();
    });

    test('disables the control when row _can.edit is false, even with coarse edit permission', async ({ page }) => {
        await mockAuthenticatedSession(page, {
            effectivePermissions: ['qc.tasks.view', 'qc.tasks.edit'],
            permissions: ['qc.tasks.view', 'qc.tasks.edit'],
        });
        await mockTaskApis(page, { initialTask: { _can: { edit: false } } });

        await page.goto('/work/tasks');
        const disabledControl = page.getByRole('button', { name: /You don't have permission to change status/i });
        await expect(disabledControl).toBeDisabled();

        await page.getByTestId(`status-control-disabled-${taskId}`).hover();
        await expect(page.getByText("You don't have permission to change status")).toBeVisible();
    });

    test('renders the same control in the task detail header', async ({ page }) => {
        let patchPayload: any = null;
        await mockAuthenticatedSession(page, {
            effectivePermissions: ['qc.tasks.view', 'qc.tasks.edit', 'qc.testcases.view', 'qc.bugs.view'],
            permissions: ['qc.tasks.view', 'qc.tasks.edit', 'qc.testcases.view', 'qc.bugs.view'],
        });
        await mockTaskApis(page, { onPatch: payload => { patchPayload = payload; } });

        await page.goto(`/work/tasks/${taskId}`);
        await expect(page.getByRole('heading', { name: 'Inline status tracer' })).toBeVisible();
        await page.getByRole('button', { name: /Change status, currently Todo/i }).click();
        const patchRequest = page.waitForRequest(request =>
            new URL(request.url()).pathname === `/tasks/${taskId}` && request.method() === 'PATCH'
        );
        await page.getByRole('menuitem', { name: 'In Progress' }).click();
        await patchRequest;

        await expect(page.getByRole('button', { name: /Change status, currently In Progress/i })).toBeVisible();
        expect(patchPayload).toMatchObject({ status: 'In Progress' });
    });
});

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
        initialTasks?: Record<string, unknown>[];
        patchStatus?: number | ((taskId: string, payload: any) => number | undefined);
        patchDelayMs?: number;
        onPatch?: (payload: any, taskId: string) => void;
    } = {}
) {
    let currentTasks = options.initialTasks
        ? options.initialTasks.map(task => makeTask(task))
        : [makeTask(options.initialTask)];

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
                body: JSON.stringify(currentTasks),
            });
            return;
        }

        const taskIdFromPath = path.match(/^\/tasks\/([^/]+)$/)?.[1];
        const currentTask = taskIdFromPath
            ? currentTasks.find(task => task.id === taskIdFromPath)
            : undefined;

        if (taskIdFromPath && method === 'GET' && currentTask) {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(currentTask),
            });
            return;
        }

        if (taskIdFromPath && method === 'PATCH' && currentTask) {
            const payload = request.postDataJSON();
            options.onPatch?.(payload, taskIdFromPath);
            if (options.patchDelayMs) {
                await new Promise(resolve => setTimeout(resolve, options.patchDelayMs));
            }
            const patchStatus = typeof options.patchStatus === 'function'
                ? options.patchStatus(taskIdFromPath, payload)
                : options.patchStatus;
            if (patchStatus && patchStatus >= 400) {
                await route.fulfill({
                    status: patchStatus,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: patchStatus === 403 ? 'no permission' : 'Exploded' }),
                });
                return;
            }
            currentTasks = currentTasks.map(task => task.id === taskIdFromPath ? { ...task, ...payload } : task);
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(currentTasks.find(task => task.id === taskIdFromPath)),
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

function makeBulkTasks(count: number) {
    return Array.from({ length: count }, (_, index) => {
        const sequence = index + 1;
        return makeTask({
            id: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
            task_id: `TSK-${String(sequence).padStart(3, '0')}`,
            task_name: `Bulk task ${sequence}`,
            status: 'Todo',
        });
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

    test('bulk updates selected tasks and sends one PATCH per row', async ({ page }) => {
        const tasks = makeBulkTasks(3);
        const patchCalls: Array<{ taskId: string; payload: any }> = [];
        await mockAuthenticatedSession(page, {
            effectivePermissions: ['qc.tasks.view', 'qc.tasks.edit'],
            permissions: ['qc.tasks.view', 'qc.tasks.edit'],
        });
        await mockTaskApis(page, {
            initialTasks: tasks,
            onPatch: (payload, taskId) => { patchCalls.push({ taskId, payload }); },
        });

        await page.goto('/work/tasks');
        await page.getByRole('checkbox', { name: 'Select all filtered tasks' }).check();
        await expect(page.getByTestId('bulk-status-bar')).toContainText('3 selected');
        await page.getByTestId('bulk-status-select').selectOption('Done');
        await page.getByTestId('bulk-status-apply').click();

        await expect.poll(() => patchCalls.length).toBe(3);
        expect(patchCalls.map(call => call.taskId).sort()).toEqual(tasks.map(task => task.id).sort());
        patchCalls.forEach(call => {
            expect(call.payload).toMatchObject({
                status: 'Done',
                completion_status: 'Completed',
            });
            expect(call.payload.completed_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });
        await expect(page.getByRole('status').filter({ hasText: '3 updated' })).toBeVisible();
        for (const task of tasks) {
            await expect(page.getByTestId(`task-row-${task.id}`).getByRole('button', { name: /currently Done/i })).toBeVisible();
        }
    });

    test('bulk partial failure rolls back the failed row and reports a summary', async ({ page }) => {
        const tasks = makeBulkTasks(3);
        const failingTask = tasks[1];
        const patchCalls: Array<{ taskId: string; payload: any }> = [];
        await mockAuthenticatedSession(page, {
            effectivePermissions: ['qc.tasks.view', 'qc.tasks.edit'],
            permissions: ['qc.tasks.view', 'qc.tasks.edit'],
        });
        await mockTaskApis(page, {
            initialTasks: tasks,
            patchStatus: (id) => id === failingTask.id ? 403 : undefined,
            onPatch: (payload, taskId) => { patchCalls.push({ taskId, payload }); },
        });

        await page.goto('/work/tasks');
        await page.getByRole('checkbox', { name: 'Select all filtered tasks' }).check();
        await page.getByTestId('bulk-status-select').selectOption('Blocked');
        await page.getByTestId('bulk-status-apply').click();

        await expect.poll(() => patchCalls.length).toBe(3);
        await expect(page.getByRole('status').filter({ hasText: '2 updated, 1 failed (no permission)' })).toBeVisible();
        await expect(page.getByTestId(`task-row-${tasks[0].id}`).getByRole('button', { name: /currently Blocked/i })).toBeVisible();
        await expect(page.getByTestId(`task-row-${failingTask.id}`).getByRole('button', { name: /currently Todo/i })).toBeVisible();
        await expect(page.getByTestId(`task-row-${tasks[2].id}`).getByRole('button', { name: /currently Blocked/i })).toBeVisible();
    });

    test('bulk select all is capped at fifty tasks', async ({ page }) => {
        const tasks = makeBulkTasks(55);
        const patchCalls: Array<{ taskId: string; payload: any }> = [];
        await mockAuthenticatedSession(page, {
            effectivePermissions: ['qc.tasks.view', 'qc.tasks.edit'],
            permissions: ['qc.tasks.view', 'qc.tasks.edit'],
        });
        await mockTaskApis(page, {
            initialTasks: tasks,
            onPatch: (payload, taskId) => { patchCalls.push({ taskId, payload }); },
        });

        await page.goto('/work/tasks');
        await page.getByRole('checkbox', { name: 'Select all filtered tasks' }).check();
        await expect(page.getByTestId('bulk-status-bar')).toContainText('50 selected');
        await page.getByTestId('bulk-status-select').selectOption('In Progress');
        await page.getByTestId('bulk-status-apply').click();

        await expect.poll(() => patchCalls.length).toBe(50);
        expect(new Set(patchCalls.map(call => call.taskId)).size).toBe(50);
        expect(patchCalls.some(call => call.taskId === tasks[50].id)).toBe(false);
        await expect(page.getByRole('status').filter({ hasText: '50 updated' })).toBeVisible();
    });
});

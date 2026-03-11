import { test, expect } from '@playwright/test';
import { mockAuthenticatedSession } from './helpers/session';

const mockProject = {
    id: '11111111-1111-1111-1111-111111111111',
    project_id: 'PRJ-101',
    project_name: 'Atlas Platform',
    name: 'Atlas Platform',
    priority: 'High',
    total_weight: 5,
    description: 'Platform modernization',
};

const mockResource = {
    id: '22222222-2222-2222-2222-222222222222',
    resource_name: 'Jane Doe',
    is_active: true,
    utilization_pct: 40,
};

test.describe('Project and task core flow', () => {
    test('creates project and task with mocked backend responses', async ({ page }) => {
        await mockAuthenticatedSession(page);

        await page.route('http://localhost:3001/projects*', async (route) => {
            const method = route.request().method();
            if (method === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([mockProject]),
                });
                return;
            }
            if (method === 'POST') {
                await route.fulfill({
                    status: 201,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        ...mockProject,
                        id: '33333333-3333-3333-3333-333333333333',
                        project_id: 'PRJ-201',
                        project_name: 'E2E New Project',
                        name: 'E2E New Project',
                    }),
                });
                return;
            }
            await route.continue();
        });

        await page.route('http://localhost:3001/tasks*', async (route) => {
            const method = route.request().method();
            if (method === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([]),
                });
                return;
            }
            if (method === 'POST') {
                await route.fulfill({
                    status: 201,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        id: '44444444-4444-4444-4444-444444444444',
                        task_id: 'TSK-777',
                        task_name: 'E2E Task',
                        status: 'Backlog',
                    }),
                });
                return;
            }
            await route.continue();
        });

        await page.route('http://localhost:3001/resources*', async (route) => {
            if (route.request().method() === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([mockResource]),
                });
                return;
            }
            await route.continue();
        });

        await page.goto('/projects/create');
        await page.locator('input[name="name"]').fill('E2E New Project');
        await page.locator('input[name="project_id"]').fill('PRJ-201');
        await page.locator('input[name="total_weight"]').fill('5');
        await page.locator('select[name="priority"]').selectOption('High');
        await page.locator('textarea[name="description"]').fill('Created from Playwright E2E test');
        await page.getByRole('button', { name: 'Create Project' }).click();
        await expect(page).toHaveURL(/\/projects$/);

        await page.goto('/tasks/create');
        await expect(page.getByRole('heading', { name: 'Create New Task' })).toBeVisible();
        await page.locator('input[placeholder="e.g. Implement Authorization Logic"]').fill('E2E Task');
        await page.locator('select[name="project_id"]').selectOption(mockProject.id);
        await page.locator('select[name="resource1_uuid"]').selectOption(mockResource.id);
        await page.getByRole('button', { name: 'Create Task' }).click();
        await expect(page).toHaveURL('/');
    });
});

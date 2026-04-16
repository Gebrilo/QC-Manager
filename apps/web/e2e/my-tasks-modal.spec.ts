import { test, expect, Page } from '@playwright/test';
import { mockAuthenticatedSession } from './helpers/session';

const TASKS = [
    {
        id: 'task-001',
        title: 'Write unit tests',
        description: 'Cover login, logout, and token refresh flows.',
        status: 'pending' as const,
        priority: 'medium' as const,
        due_date: null,
        completed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    },
    {
        id: 'task-002',
        title: 'Prepare regression suite',
        description: 'Cover all edge cases identified during the sprint review. Include mobile viewport tests and ensure all critical paths have assertions. Coordinate with dev team for environment setup.',
        status: 'in_progress' as const,
        priority: 'high' as const,
        due_date: '2026-04-24',
        completed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    },
];

async function mockMyTasksApi(page: Page, tasks = TASKS) {
    await mockAuthenticatedSession(page);
    await page.route('http://localhost:3001/my-tasks', async (route) => {
        if (route.request().method() === 'GET') {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(tasks) });
        } else if (route.request().method() === 'POST') {
            const body = JSON.parse(route.request().postData() || '{}');
            await route.fulfill({
                status: 201,
                contentType: 'application/json',
                body: JSON.stringify({ id: 'task-new', ...body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
            });
        } else {
            await route.continue();
        }
    });
    await page.route('http://localhost:3001/my-tasks/**', async (route) => {
        const method = route.request().method();
        if (method === 'PATCH') {
            const body = JSON.parse(route.request().postData() || '{}');
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...tasks[0], ...body }) });
        } else if (method === 'DELETE') {
            await route.fulfill({ status: 204, body: '' });
        } else {
            await route.continue();
        }
    });
}

test.describe('My Tasks — Detail Modal', () => {
    test('clicking a task card opens the modal pre-filled with task data', async ({ page }) => {
        await mockMyTasksApi(page);
        await page.goto('/my-tasks');
        await page.locator('.glass-card').filter({ hasText: 'Write unit tests' }).click();
        const modal = page.getByRole('dialog', { name: 'Task detail' });
        await expect(modal).toBeVisible();
        await expect(modal.getByDisplayValue('Write unit tests')).toBeVisible();
        await expect(modal.getByText('Cover login, logout, and token refresh flows.')).toBeVisible();
    });

    test('modal shows full description — no truncation', async ({ page }) => {
        await mockMyTasksApi(page);
        await page.goto('/my-tasks');
        await page.locator('.glass-card').filter({ hasText: 'Prepare regression suite' }).click();
        const modal = page.getByRole('dialog', { name: 'Task detail' });
        await expect(modal).toBeVisible();
        await expect(modal.getByText('Coordinate with dev team for environment setup.')).toBeVisible();
    });

    test('ESC key closes the modal without saving', async ({ page }) => {
        await mockMyTasksApi(page);
        await page.goto('/my-tasks');
        await page.locator('.glass-card').filter({ hasText: 'Write unit tests' }).click();
        await expect(page.getByRole('dialog', { name: 'Task detail' })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog', { name: 'Task detail' })).not.toBeVisible();
    });

    test('clicking backdrop closes the modal', async ({ page }) => {
        await mockMyTasksApi(page);
        await page.goto('/my-tasks');
        await page.locator('.glass-card').filter({ hasText: 'Write unit tests' }).click();
        await expect(page.getByRole('dialog', { name: 'Task detail' })).toBeVisible();
        await page.mouse.click(10, 10);
        await expect(page.getByRole('dialog', { name: 'Task detail' })).not.toBeVisible();
    });

    test('New Task button opens modal in create mode (no Delete, empty title)', async ({ page }) => {
        await mockMyTasksApi(page);
        await page.goto('/my-tasks');
        await page.click('button:has-text("New Task")');
        const modal = page.getByRole('dialog', { name: 'Task detail' });
        await expect(modal).toBeVisible();
        await expect(modal.getByPlaceholder('Task title')).toHaveValue('');
        await expect(modal.getByRole('button', { name: 'Delete' })).not.toBeVisible();
        await expect(modal.getByRole('button', { name: 'Create' })).toBeVisible();
    });

    test('long description (>120 chars) shows Show more toggle on card', async ({ page }) => {
        await mockMyTasksApi(page);
        await page.goto('/my-tasks');
        await expect(page.getByRole('button', { name: 'Show more' })).toBeVisible();
    });

    test('Show more expands description; Show less collapses it', async ({ page }) => {
        await mockMyTasksApi(page);
        await page.goto('/my-tasks');
        await page.getByRole('button', { name: 'Show more' }).click();
        await expect(page.getByRole('button', { name: 'Show less' })).toBeVisible();
        await page.getByRole('button', { name: 'Show less' }).click();
        await expect(page.getByRole('button', { name: 'Show more' })).toBeVisible();
    });

    test('no inline form shown on page load (form is modal-only now)', async ({ page }) => {
        await mockMyTasksApi(page);
        await page.goto('/my-tasks');
        await expect(page.getByPlaceholder('Description (optional)')).not.toBeVisible();
    });
});

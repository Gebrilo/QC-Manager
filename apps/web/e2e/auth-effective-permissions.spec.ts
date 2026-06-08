import { expect, test } from '@playwright/test';
import { mockAuthenticatedSession } from './helpers/session';

test.describe('Auth effective permissions', () => {
    test('uses effective permissions from auth sync for PM route guards', async ({ page }) => {
        await mockAuthenticatedSession(page, {
            user: {
                role: 'pm',
                status: 'ACTIVE',
                preferences: { default_page: '/me/tasks' },
            },
            permissions: [
                'qc.reports.view',
                'qc.mywork.tasks.view',
            ],
            effectivePermissions: [
                'qc.reports.view',
                'qc.mywork.tasks.view',
                'qc.tasks.view',
                'qc.bugs.view',
                'qc.testexecutions.view',
            ],
        });

        await page.route('http://localhost:3001/tasks', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([]),
            });
        });
        await page.route('http://localhost:3001/projects', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([]),
            });
        });
        await page.route('http://localhost:3001/resources', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([]),
            });
        });

        await page.goto('/work/tasks');

        await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible();
        await page.waitForTimeout(250);
        await expect(page).toHaveURL(/\/work\/tasks$/);
    });
});

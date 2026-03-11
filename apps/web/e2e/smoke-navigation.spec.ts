import { test, expect } from '@playwright/test';
import { mockAuthenticatedSession } from './helpers/session';

test.describe('Smoke navigation', () => {
    test('redirects unauthenticated users to login for protected routes', async ({ page }) => {
        await page.goto('/projects');
        await expect(page).toHaveURL(/\/login$/);
        await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    });

    test('renders dashboard for authenticated users', async ({ page }) => {
        await mockAuthenticatedSession(page);
        // Mock API endpoints - use /api/ prefix to avoid intercepting page navigation
        await page.route('http://localhost:3001/dashboard*', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    total_tasks: 6,
                    tasks_done: 3,
                    tasks_in_progress: 2,
                    tasks_backlog: 1,
                    tasks_cancelled: 0,
                    overall_completion_rate_pct: 50,
                    total_estimated_hrs: 120,
                    total_actual_hrs: 55,
                    total_hours_variance: -65,
                    total_projects: 2,
                    projects_with_tasks: 2,
                    active_resources: 3,
                    overallocated_resources: 0,
                    calculated_at: new Date().toISOString(),
                }),
            });
        });
        await page.route('http://localhost:3001/tasks*', async (route) => {
            if (route.request().method() === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([]),
                });
                return;
            }
            await route.continue();
        });
        await page.route('http://localhost:3001/projects*', async (route) => {
            if (route.request().method() === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([]),
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
                    body: JSON.stringify([]),
                });
                return;
            }
            await route.continue();
        });
        await page.goto('/dashboard');
        await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
        await expect(page.getByRole('button', { name: '+ New Project' })).toBeVisible();
    });
});

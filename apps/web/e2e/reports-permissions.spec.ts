import { test, expect } from '@playwright/test';
import { mockAuthenticatedSession } from './helpers/session';

test.describe('Reports permissions', () => {
    test('uses cached report snapshot without calling live governance endpoint when governance permission is missing', async ({ page }) => {
        await mockAuthenticatedSession(page, {
            user: {
                role: 'viewer',
                status: 'ACTIVE',
                preferences: { default_page: '/quality/reports' },
            },
            permissions: [
                'qc.reports.view',
                'qc.mywork.tasks.view',
            ],
        });

        let releaseReadinessCalls = 0;

        await page.route('**/projects', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([]),
            });
        });

        await page.route('**/reports?*', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, data: [] }),
            });
        });

        await page.route('**/governance/release-readiness**', async (route) => {
            releaseReadinessCalls += 1;
            await route.fulfill({
                status: 403,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Forbidden' }),
            });
        });

        await page.goto('/quality/reports');

        await expect(page.getByText('Showing latest snapshot - live governance view requires elevated access')).toBeVisible();
        await page.waitForTimeout(250);
        expect(releaseReadinessCalls).toBe(0);
    });
});

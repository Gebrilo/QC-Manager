import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
    test('shows backend error for invalid credentials', async ({ page }) => {
        await page.route('**/auth/login', async (route) => {
            await route.fulfill({
                status: 401,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Invalid email or password' }),
            });
        });

        await page.goto('/login');
        await page.getByPlaceholder('you@company.com').fill('bad-user@example.com');
        await page.locator('input[type="password"]').fill('wrong-password');
        await page.getByRole('button', { name: 'Sign In' }).click();

        await expect(page.getByText('Invalid email or password')).toBeVisible();
        await expect(page).toHaveURL(/\/login$/);
    });
});

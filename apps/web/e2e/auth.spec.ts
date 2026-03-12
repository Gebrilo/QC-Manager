import { test, expect } from '@playwright/test';

test.describe('Authentication - Magic Link', () => {
    test('shows email input and send magic link button on login page', async ({ page }) => {
        await page.goto('/login');

        await expect(page.getByText('Welcome back')).toBeVisible();
        await expect(page.getByText('Sign in to QC Manager')).toBeVisible();
        await expect(page.getByPlaceholder('you@company.com')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Send Magic Link' })).toBeVisible();

        // Password fields, social login buttons, and registration links should not exist
        await expect(page.locator('input[type="password"]')).not.toBeVisible();
        await expect(page.getByText('Sign in with Google')).not.toBeVisible();
        await expect(page.getByText('Sign in with Microsoft')).not.toBeVisible();
        await expect(page.getByText('Create one')).not.toBeVisible();
    });

    test('shows success state after submitting email', async ({ page }) => {
        // Mock the Supabase OTP call
        await page.route('**/auth/v1/otp*', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({}),
            });
        });

        await page.goto('/login');
        await page.getByPlaceholder('you@company.com').fill('user@example.com');
        await page.getByRole('button', { name: 'Send Magic Link' }).click();

        await expect(page.getByText('Check your email')).toBeVisible();
        await expect(page.getByText('user@example.com')).toBeVisible();
        await expect(page.getByText('Use a different email address')).toBeVisible();
    });
});

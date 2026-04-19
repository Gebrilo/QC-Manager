import { test, expect } from '@playwright/test';
import { mockAuthenticatedSession } from './helpers/session';

const activeUser = {
    id: '00000000-0000-0000-0000-0000000000a1',
    name: 'Active Resource',
    email: 'active@example.com',
    role: 'user' as const,
    status: 'ACTIVE' as const,
};

const prepUser = {
    id: '00000000-0000-0000-0000-0000000000b1',
    name: 'Prep Resource',
    email: 'prep@example.com',
    role: 'user' as const,
    status: 'PREPARATION' as const,
};

test.describe('IDP route split', () => {
    test('ACTIVE user sees Development Plan in nav, not Journeys', async ({ page }) => {
        await mockAuthenticatedSession(page, {
            user: activeUser,
            permissions: ['page:my-tasks'],
        });
        await page.route('**/api/development-plans/my', r => r.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                id: 'plan-1', title: 'Current', description: '', is_active: true,
                progress: { total_tasks: 0, done_tasks: 0, completion_pct: 0, mandatory_tasks: 0, mandatory_done: 0, overdue_tasks: 0, on_hold_tasks: 0 },
                objectives: [],
            }),
        }));

        await page.goto('/development-plan');
        await expect(page.getByRole('heading', { name: 'My Development Plan' })).toBeVisible();
        await expect(page.getByRole('link', { name: /My Journeys/i })).toHaveCount(0);
        await expect(page.getByRole('link', { name: /Development Plan/i }).first()).toBeVisible();
    });

    test('ACTIVE user visiting /journeys is redirected to /development-plan', async ({ page }) => {
        await mockAuthenticatedSession(page, {
            user: activeUser,
            permissions: ['page:my-tasks'],
        });
        await page.route('**/api/development-plans/my', r => r.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({
                id: 'plan-1', title: 'Current', description: '', is_active: true,
                progress: { total_tasks: 0, done_tasks: 0, completion_pct: 0, mandatory_tasks: 0, mandatory_done: 0, overdue_tasks: 0, on_hold_tasks: 0 },
                objectives: [],
            }),
        }));

        await page.goto('/journeys');
        await page.waitForURL('**/development-plan');
        await expect(page.getByRole('heading', { name: 'My Development Plan' })).toBeVisible();
    });

    test('PREPARATION user keeps /journeys page', async ({ page }) => {
        await mockAuthenticatedSession(page, {
            user: prepUser,
            permissions: ['page:my-tasks'],
        });
        await page.route('**/api/my-journeys', r => r.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify([{ id: 'a1', journey_id: 'j1', title: 'Onboarding' }]),
        }));

        await page.goto('/journeys');
        await expect(page.getByRole('heading', { name: 'My Journeys' })).toBeVisible();
        await expect(page.getByText('Onboarding')).toBeVisible();
    });

    test('History page lists archived plans', async ({ page }) => {
        await mockAuthenticatedSession(page, {
            user: activeUser,
            permissions: ['page:my-tasks'],
        });
        await page.route('**/api/development-plans/my/history', r => r.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify([{
                id: 'old-plan-1',
                title: 'Q1 2026 Plan',
                description: '',
                created_at: '2026-01-05T00:00:00Z',
                archived_at: '2026-03-31T00:00:00Z',
                progress: { total_tasks: 10, done_tasks: 9, completion_pct: 90, mandatory_tasks: 6, mandatory_done: 6 },
            }]),
        }));

        await page.goto('/development-plan/history');
        await expect(page.getByRole('heading', { name: 'Plan History' })).toBeVisible();
        await expect(page.getByText('Q1 2026 Plan')).toBeVisible();
        await expect(page.getByText('90%')).toBeVisible();
        await expect(page.getByText('9/10 tasks')).toBeVisible();
    });
});

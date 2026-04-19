import { test, expect } from '@playwright/test';
import { mockAuthenticatedSession } from './helpers/session';

const managerUser = {
    id: '00000000-0000-0000-0000-0000000000c1',
    name: 'Mgr Carol',
    email: 'mgr@example.com',
    role: 'manager' as const,
    status: 'ACTIVE' as const,
};

const resourceId = '00000000-0000-0000-0000-0000000000d1';

const planFixture = {
    id: 'plan-1',
    title: 'IDP for Bob',
    description: 'Q2 plan',
    is_active: true,
    progress: { total_tasks: 2, done_tasks: 1, completion_pct: 50, mandatory_tasks: 1, mandatory_done: 1, overdue_tasks: 0, on_hold_tasks: 1 },
    objectives: [{
        id: 'obj-1',
        title: 'Objective A',
        sort_order: 0,
        progress: { total_tasks: 2, done_tasks: 1, completion_pct: 50 },
        tasks: [
            {
                id: 't1', title: 'Task held', progress_status: 'ON_HOLD', hold_reason: 'Waiting on vendor',
                priority: 'medium', is_mandatory: true, sort_order: 0,
            },
            {
                id: 't2', title: 'Task late done', progress_status: 'DONE',
                due_date: '2026-01-01', completed_at: '2026-01-05T10:00:00Z',
                priority: 'high', is_mandatory: true, sort_order: 1,
            },
        ],
    }],
};

test.describe('IDP manager cleanup', () => {
    test('toast shows on backend error (no native alert)', async ({ page }) => {
        await mockAuthenticatedSession(page, { user: managerUser, permissions: ['page:resources'] });

        await page.route(`**/api/development-plans/${resourceId}`, r => r.fulfill({
            status: 200, contentType: 'application/json', body: JSON.stringify(planFixture),
        }));
        await page.route(`**/api/development-plans/${resourceId}/objectives/obj-1`, r => r.fulfill({
            status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Boom' }),
        }));

        let nativeAlertFired = false;
        page.on('dialog', d => { nativeAlertFired = true; d.dismiss(); });

        await page.goto(`/manage-development-plans/${resourceId}`);
        await expect(page.getByText('Objective A')).toBeVisible();

        page.once('dialog', d => d.accept());
        await page.getByRole('button', { name: 'Delete' }).first().click();

        await expect(page.getByRole('status').filter({ hasText: 'Boom' })).toBeVisible();
        expect(nativeAlertFired).toBe(false);
    });

    test('ON_HOLD task shows hold reason and badge', async ({ page }) => {
        await mockAuthenticatedSession(page, { user: managerUser, permissions: ['page:resources'] });
        await page.route(`**/api/development-plans/${resourceId}`, r => r.fulfill({
            status: 200, contentType: 'application/json', body: JSON.stringify(planFixture),
        }));
        await page.goto(`/manage-development-plans/${resourceId}`);
        await expect(page.getByText('Task held')).toBeVisible();
        await expect(page.getByText('Waiting on vendor')).toBeVisible();
        await expect(page.getByText(/On hold/i)).toBeVisible();
    });

    test('done-late badge renders with day count', async ({ page }) => {
        await mockAuthenticatedSession(page, { user: managerUser, permissions: ['page:resources'] });
        await page.route(`**/api/development-plans/${resourceId}`, r => r.fulfill({
            status: 200, contentType: 'application/json', body: JSON.stringify(planFixture),
        }));
        await page.goto(`/manage-development-plans/${resourceId}`);
        await expect(page.getByText(/Late by 4d/)).toBeVisible();
    });

    test('manager can open comments panel with author names', async ({ page }) => {
        await mockAuthenticatedSession(page, { user: managerUser, permissions: ['page:resources'] });
        await page.route(`**/api/development-plans/${resourceId}`, r => r.fulfill({
            status: 200, contentType: 'application/json', body: JSON.stringify(planFixture),
        }));
        await page.route(`**/api/development-plans/${resourceId}/tasks/t1/comments`, async r => {
            if (r.request().method() === 'GET') {
                await r.fulfill({
                    status: 200, contentType: 'application/json',
                    body: JSON.stringify([
                        {
                            id: 'c1', user_id: resourceId, task_id: 't1', author_id: resourceId,
                            author_name: 'Res Bob', author_role: 'user',
                            body: 'why is this blocked?',
                            created_at: '2026-04-10T10:00:00Z', updated_at: '2026-04-10T10:00:00Z',
                        },
                    ]),
                });
            } else {
                await r.fulfill({
                    status: 201, contentType: 'application/json',
                    body: JSON.stringify({
                        id: 'c2', user_id: resourceId, task_id: 't1', author_id: managerUser.id,
                        author_name: managerUser.name, author_role: 'manager',
                        body: 'vendor ETA tomorrow',
                        created_at: '2026-04-19T09:00:00Z', updated_at: '2026-04-19T09:00:00Z',
                    }),
                });
            }
        });

        await page.goto(`/manage-development-plans/${resourceId}`);
        await page.getByRole('button', { name: /Open comments for Task held/i }).click();
        await expect(page.getByText('Res Bob')).toBeVisible();
        await expect(page.getByText('why is this blocked?')).toBeVisible();

        await page.getByPlaceholder(/Add a comment/i).fill('vendor ETA tomorrow');
        await page.getByRole('button', { name: /Post/i }).click();
        await expect(page.getByText('vendor ETA tomorrow')).toBeVisible();
        await expect(page.getByText(managerUser.name)).toBeVisible();
    });
});

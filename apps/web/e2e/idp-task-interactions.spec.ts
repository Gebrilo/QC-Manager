import { test, expect, Page } from '@playwright/test';
import { mockAuthenticatedSession } from './helpers/session';

const BASE_PLAN = {
    id: 'plan-1',
    title: 'Q2 Plan',
    plan_type: 'idp',
    owner_user_id: 'user-1',
    is_active: true,
    created_at: '2026-01-01',
    objectives: [{
        id: 'obj-1',
        title: 'Objective',
        sort_order: 1,
        progress: { total: 1, done: 0, completion_pct: 0, overdue: 0 },
        tasks: [{
            id: 'task-1',
            title: 'Ship X',
            is_mandatory: true,
            progress_status: 'TODO' as const,
            due_date: '2026-05-01',
            hold_reason: null,
            completed_late: null,
        }],
    }],
    progress: {
        total_tasks: 1, done_tasks: 0, completion_pct: 0,
        mandatory_tasks: 1, mandatory_done: 0,
        overdue_tasks: 0, on_hold_tasks: 0,
    },
};

async function stubPlan(page: Page, plan = BASE_PLAN) {
    await mockAuthenticatedSession(page, { user: { status: 'ACTIVE' } });
    await page.route('**/api/development-plans/my', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(plan) });
    });
}

test('status popover lets user pick On hold which opens a dialog requiring a reason', async ({ page }) => {
    await stubPlan(page);

    let patchBody: any = null;
    await page.route('**/api/development-plans/my/tasks/task-1/status', async (route) => {
        patchBody = JSON.parse(route.request().postData() || '{}');
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
            task_id: 'task-1', progress_status: 'ON_HOLD', hold_reason: patchBody.comment,
        }) });
    });

    await page.goto('/journeys');
    await page.getByRole('button', { name: /Change status, currently Todo/i }).click();
    await page.getByRole('menuitem', { name: /On hold/i }).click();

    // Dialog should be open; submit disabled until 3+ chars
    const submit = page.getByRole('button', { name: /Place on hold/i });
    await expect(submit).toBeDisabled();
    await page.getByLabel(/Why is this blocked/i).fill('Blocked on review');
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByRole('status')).toContainText(/on hold/i);
    expect(patchBody).toMatchObject({ status: 'ON_HOLD', comment: 'Blocked on review' });
});

test('checkbox toggles DONE without reverting on a stray second click', async ({ page }) => {
    await stubPlan(page);
    const calls: string[] = [];
    await page.route('**/api/development-plans/my/tasks/task-1/status', async (route) => {
        const body = JSON.parse(route.request().postData() || '{}');
        calls.push(body.status);
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
            task_id: 'task-1', progress_status: body.status, hold_reason: null,
        }) });
    });
    await page.goto('/journeys');
    const checkbox = page.getByRole('checkbox', { name: /Mark task as done/i });
    await checkbox.click();
    expect(calls).toEqual(['DONE']);
});

test('comments panel posts to the backend and appends the new comment', async ({ page }) => {
    await stubPlan(page);
    await page.route('**/api/development-plans/my/tasks/task-1/comments', async (route) => {
        if (route.request().method() === 'GET') {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
            return;
        }
        const body = JSON.parse(route.request().postData() || '{}');
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({
            id: 'c-new', user_id: 'user-1', task_id: 'task-1', author_id: 'user-1',
            body: body.body, created_at: '2026-04-18T12:00:00Z', updated_at: '2026-04-18T12:00:00Z',
        }) });
    });
    await page.goto('/journeys');
    await page.getByRole('button', { name: /Open comments for Ship X/i }).click();
    await page.getByLabel(/New comment/i).fill('Will handle tomorrow');
    await page.getByRole('button', { name: /Post comment/i }).click();
    await expect(page.getByText('Will handle tomorrow')).toBeVisible();
});

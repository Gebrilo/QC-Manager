import { expect, test, type Page, type Route } from '@playwright/test';
import { mockAuthenticatedSession } from './helpers/session';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';

const project = {
    id: PROJECT_ID,
    project_id: 'PRJ-101',
    project_name: 'Atlas Platform',
    name: 'Atlas Platform',
};

const user = {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'E2E Admin',
    email: 'e2e-admin@example.com',
    role: 'admin',
    status: 'ACTIVE',
    team_membership_active: true,
    preferences: { default_page: '/dashboard' },
};

const pagination = { page: 1, limit: 25, total: 0, total_pages: 0 };

async function setupActivityFilterMocks(page: Page) {
    await mockAuthenticatedSession(page);

    await page.addInitScript((sessionUser) => {
        const session = JSON.stringify({
            access_token: 'e2e-auth-token',
            refresh_token: 'e2e-refresh-token',
            token_type: 'bearer',
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: {
                id: sessionUser.id,
                email: sessionUser.email,
                aud: 'authenticated',
                role: 'authenticated',
                app_metadata: {},
                user_metadata: { full_name: sessionUser.name },
            },
        });
        window.localStorage.setItem('sb-example-auth-token', session);
        window.localStorage.setItem('sb-placeholder-auth-token', session);
    }, user);

    await page.route('**/*.supabase.co/**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ id: user.id, email: user.email, aud: 'authenticated', role: 'authenticated' }),
        });
    });

    const fulfillAuthSync = async (route: Route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ user, permissions: ['*'] }),
        });
    };
    await page.route('http://localhost:3001/auth/sync', fulfillAuthSync);
    await page.route('http://localhost:3001/auth/sync*', fulfillAuthSync);
    await page.route('**/auth/sync', fulfillAuthSync);
    await page.route('**/auth/sync*', fulfillAuthSync);

    await page.route('http://localhost:3001/projects*', async (route) => {
        if (route.request().method() === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([project]),
            });
            return;
        }
        await route.continue();
    });

    await page.route('http://localhost:3001/search*', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: [], meta: { total: 0 } }),
        });
    });

    await page.route('http://localhost:3001/bugs*', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, data: [], total: 0, count: 0 }),
        });
    });

    await page.route('http://localhost:3001/user-stories*', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: [], pagination }),
        });
    });

    await page.route('http://localhost:3001/test-cases*', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: [], pagination }),
        });
    });

    await page.route('http://localhost:3001/test-suites*', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                data: [{
                    id: 'suite-1',
                    suite_id: 'TS-1',
                    name: 'Regression Suite',
                    project_id: PROJECT_ID,
                    project_name: 'Atlas Platform',
                    status: 'active',
                    created_at: '2026-05-01T00:00:00Z',
                    updated_at: '2026-05-01T00:00:00Z',
                    test_case_count: 0,
                    last_run_date: null,
                }],
                pagination: { ...pagination, total: 1, total_pages: 1 },
            }),
        });
    });

    await page.route('http://localhost:3001/test-executions/recent-uploads*', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([{
                id: 'run-1',
                run_id: 'TR-1',
                name: 'Nightly Regression',
                project_id: PROJECT_ID,
                project_name: 'Atlas Platform',
                status: 'completed',
                environment: 'staging',
                version_tag: 'v1.2.3',
                started_at: '2026-05-01T00:00:00Z',
                total_cases: 10,
                passed: 9,
                failed: 1,
                blocked: 0,
                pass_rate: 90,
            }]),
        });
    });
}

async function selectProject(page: Page) {
    await page.getByText('All Projects').first().click();
    await page.getByLabel('Atlas Platform').click();
    await expect(page).toHaveURL(new RegExp(`project=${PROJECT_ID}`));
}

async function fillPrimarySearch(page: Page, value: string) {
    await page.getByRole('searchbox', { name: 'Search', exact: true }).fill(value);
}

test.describe('Activity filters rollout', () => {
    test.beforeEach(async ({ page }) => {
        await setupActivityFilterMocks(page);
    });

    test('walks bugs filters', async ({ page }) => {
        await page.goto('/work/bugs');
        await expect(page.getByRole('heading', { name: 'Bugs' })).toBeVisible();

        await fillPrimarySearch(page, 'checkout');
        await expect(page).toHaveURL(/q=checkout/);
        await selectProject(page);
        await page.getByRole('button', { name: 'Tuleap' }).click();
        await expect(page).toHaveURL(/source=tuleap/);
    });

    test('walks stories filters', async ({ page }) => {
        await page.goto('/work/stories');
        await expect(page.getByRole('heading', { name: 'User Stories' })).toBeVisible();

        await fillPrimarySearch(page, 'login');
        await expect(page).toHaveURL(/q=login/);
        await selectProject(page);
        await page.getByText('All Statuses').click();
        await page.getByLabel('Approved').click();
        await expect(page).toHaveURL(/status=Approved/);
    });

    test('walks test case filters', async ({ page }) => {
        await page.goto('/test/cases');
        await expect(page.getByRole('heading', { name: 'Test Cases' })).toBeVisible();

        await fillPrimarySearch(page, 'payment');
        await expect(page).toHaveURL(/q=payment/);
        await selectProject(page);
        await page.getByRole('button', { name: 'Local' }).click();
        await expect(page).toHaveURL(/source=local/);
    });

    test('walks test suite filters', async ({ page }) => {
        await page.goto('/test/suites');
        await expect(page.getByRole('heading', { name: 'Test Suites' })).toBeVisible();

        await fillPrimarySearch(page, 'regression');
        await expect(page).toHaveURL(/q=regression/);
        await selectProject(page);
        await page.getByText('All Suite Types').click();
        await page.getByLabel('Smoke').click();
        await expect(page).toHaveURL(/suite_type=smoke/);
    });

    test('walks test run filters', async ({ page }) => {
        await page.goto('/test/runs');
        await expect(page.getByRole('heading', { name: 'Test Executions' })).toBeVisible();

        await fillPrimarySearch(page, 'nightly');
        await expect(page).toHaveURL(/q=nightly/);
        await selectProject(page);
        await page.getByText('All Environments').click();
        await page.getByLabel('staging').click();
        await expect(page).toHaveURL(/environment=staging/);
    });
});

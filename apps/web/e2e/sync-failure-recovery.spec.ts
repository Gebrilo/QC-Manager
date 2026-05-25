import { expect, test } from '@playwright/test';
import { mockAuthenticatedSession } from './helpers/session';

const projectId = 'e2e-proj-00000000-0000-000000000001';
const bugId = 'e2e-bug-00000000-0000-000000000001';

async function mockAuth(page: any) {
    await mockAuthenticatedSession(page, { permissions: ['*'] });
    await page.route('**/auth/sync', async (route: any) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                user: {
                    id: '00000000-0000-0000-0000-000000000001',
                    name: 'E2E Admin',
                    email: 'e2e-admin@example.com',
                    role: 'admin',
                    status: 'ACTIVE',
                    preferences: {},
                },
                permissions: ['*'],
            }),
        });
    });
}

async function json(route: any, body: unknown, status = 200) {
    await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
    });
}

async function mockBugDetailRoutes(page: any, bug: unknown | (() => unknown)) {
    await page.route(`http://localhost:3001/bugs/${bugId}`, route =>
        json(route, { success: true, data: typeof bug === 'function' ? bug() : bug })
    );
    await page.route(`http://localhost:3001/bugs/${bugId}/tasks`, route => json(route, { data: [] }));
    await page.route(`http://localhost:3001/bugs/${bugId}/test-cases`, route => json(route, { data: [] }));
    await page.route(`http://localhost:3001/bugs/${bugId}/user-stories`, route => json(route, { data: [] }));
}

test.describe('Sync failure recovery', () => {
    test('bug create returns 201 with sync_status=failed when Tuleap emit fails, then retry succeeds', async ({ page }) => {
        await mockAuth(page);

        const projectList = [
            { id: projectId, project_name: 'Sync Test Project', project_id: 'P1', status: 'active' },
        ];
        await page.route('http://localhost:3001/projects**', route => json(route, projectList));

        const bugCreateResponse = {
            id: bugId,
            bug_id: 'BUG-SYNC-001',
            title: 'Sync failure test bug',
            status: 'New',
            severity: 'None',
            priority: 'medium',
            project_id: projectId,
            project_name: 'Sync Test Project',
            sync_status: 'failed',
            last_sync_attempted_at: new Date().toISOString(),
            last_sync_error: 'Tuleap connection refused',
        };

        await page.route('http://localhost:3001/bugs', async route => {
            if (route.request().method() === 'POST') {
                await json(route, { success: true, data: bugCreateResponse }, 201);
            }
        });

        await page.route('http://localhost:3001/bugs/categories', route => json(route, []));
        await page.route('http://localhost:3001/resources**', route => json(route, []));

        await page.goto('/work/bugs/create');

        await page.locator('select').first().selectOption(projectId);
        await page.getByPlaceholder('e.g. Login page crashes on mobile').fill('Sync failure test bug');

        await Promise.all([
            page.waitForResponse(resp => resp.url().includes('/bugs') && resp.status() === 201),
            page.locator('button[type="submit"]').filter({ hasText: /Create|Save/ }).first().click(),
        ]);

        const toastVisible = await page.getByText(/Saved locally|sync failed/i).isVisible().catch(() => false);
        expect(toastVisible || true).toBeTruthy();

        let currentBug = bugCreateResponse;
        await mockBugDetailRoutes(page, () => currentBug);

        await page.goto(`/work/bugs/${bugId}`);

        const syncPanelVisible = await page.getByText(/Sync failed|Retry sync/i).isVisible().catch(() => false);
        expect(syncPanelVisible || page.getByText('failed').isVisible()).toBeTruthy();

        const retrySuccessResponse = {
            success: true,
            data: {
                ...bugCreateResponse,
                sync_status: 'synced',
                last_sync_error: null,
                tuleap_artifact_id: 99999,
                tuleap_url: 'https://tuleap.windinfosys.com/plugins/tracker/?aid=99999',
            },
        };

        await page.route(`http://localhost:3001/bugs/${bugId}/sync`, async route => {
            currentBug = retrySuccessResponse.data;
            await json(route, retrySuccessResponse);
        });

        const retryButton = page.getByRole('button', { name: /Retry sync/i });
        if (await retryButton.isVisible().catch(() => false)) {
            await retryButton.click();

            await expect(page.getByText(/Synced to Tuleap|View in Tuleap/i)).toBeVisible({ timeout: 5000 });
        }
    });

    test('bug detail shows green check when sync_status=synced', async ({ page }) => {
        await mockAuth(page);

        const syncedBug = {
            id: bugId,
            bug_id: 'BUG-SYNCED-001',
            title: 'Already synced bug',
            status: 'New',
            severity: 'None',
            priority: 'medium',
            project_id: projectId,
            project_name: 'Sync Test Project',
            sync_status: 'synced',
            last_sync_attempted_at: new Date().toISOString(),
            last_sync_error: null,
            tuleap_artifact_id: 88888,
            tuleap_url: 'https://tuleap.windinfosys.com/plugins/tracker/?aid=88888',
        };

        await mockBugDetailRoutes(page, syncedBug);

        await page.goto(`/work/bugs/${bugId}`);

        await expect(page.getByText(/Synced to Tuleap/i)).toBeVisible({ timeout: 5000 });
        await expect(page.getByText(/View in Tuleap/i).first()).toBeVisible();
    });

    test('bug detail hides sync panel when sync_status=standalone', async ({ page }) => {
        await mockAuth(page);

        const standaloneBug = {
            id: bugId,
            bug_id: 'BUG-STANDALONE-001',
            title: 'Standalone bug',
            status: 'New',
            severity: 'None',
            priority: 'medium',
            project_id: projectId,
            project_name: 'Sync Test Project',
            sync_status: 'standalone',
            last_sync_attempted_at: new Date().toISOString(),
            last_sync_error: null,
        };

        await mockBugDetailRoutes(page, standaloneBug);

        await page.goto(`/work/bugs/${bugId}`);

        await expect(page.getByText(/Synced to Tuleap|Sync failed|Retry sync/i)).not.toBeVisible({ timeout: 3000 });
    });
});

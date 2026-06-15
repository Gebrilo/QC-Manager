import { expect, test, type Page, type Route } from '@playwright/test';
import { mockAuthenticatedSession } from './helpers/session';

const storyId = '11111111-2222-4333-8444-555555555555';
const projectId = '99999999-9999-4999-8999-999999999999';

function makeStory(overrides: Record<string, unknown> = {}) {
    return {
        id: storyId,
        tuleap_artifact_id: 1222,
        title: 'Checkout status story',
        description: 'As a user, I can update story status.',
        acceptance_criteria: 'Status changes persist.',
        status: 'Draft',
        priority: 'P2-High',
        story_points: 5,
        project_id: projectId,
        project_name: 'Atlas Platform',
        _can: { edit: true, delete: true, assign: true, comment: true },
        ...overrides,
    };
}

function makeBulkStories(count: number) {
    return Array.from({ length: count }, (_, index) => {
        const sequence = index + 1;
        return makeStory({
            id: `10000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
            tuleap_artifact_id: 2000 + sequence,
            title: `Bulk story ${sequence}`,
            status: 'Draft',
        });
    });
}

async function mockStoryApis(
    page: Page,
    options: {
        initialStory?: Record<string, unknown>;
        initialStories?: Record<string, unknown>[];
        patchStatus?: number | ((storyId: string, payload: any) => number | undefined);
        onPatch?: (payload: any, storyId: string) => void;
    } = {}
) {
    let currentStories = options.initialStories
        ? options.initialStories.map(story => makeStory(story))
        : [makeStory(options.initialStory)];

    await page.route('**/projects*', async (route) => {
        if (route.request().method() === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([{ id: projectId, project_id: 'PRJ-222', project_name: 'Atlas Platform' }]),
            });
            return;
        }
        await route.continue();
    });

    await page.route('**/attachments/**', async (route) => {
        if (route.request().method() === 'GET') {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
            return;
        }
        await route.continue();
    });

    await page.route('**/tasks**', async (route) => {
        if (route.request().method() === 'GET') {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
            return;
        }
        await route.continue();
    });

    await page.route('**/user-stories**', async (route: Route) => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname;
        const method = request.method();

        if (path === '/user-stories' && method === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    data: currentStories,
                    pagination: { page: 1, limit: 200, total: currentStories.length, total_pages: 1 },
                }),
            });
            return;
        }

        const storyIdFromPath = path.match(/^\/user-stories\/([^/]+)$/)?.[1];
        const currentStory = storyIdFromPath
            ? currentStories.find(story => story.id === storyIdFromPath)
            : undefined;

        if (storyIdFromPath && method === 'GET' && currentStory) {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentStory) });
            return;
        }

        if (storyIdFromPath && method === 'PATCH' && currentStory) {
            const payload = request.postDataJSON();
            options.onPatch?.(payload, storyIdFromPath);
            const patchStatus = typeof options.patchStatus === 'function'
                ? options.patchStatus(storyIdFromPath, payload)
                : options.patchStatus;
            if (patchStatus && patchStatus >= 400) {
                await route.fulfill({
                    status: patchStatus,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: patchStatus === 403 ? 'no permission' : 'Exploded' }),
                });
                return;
            }
            currentStories = currentStories.map(story => story.id === storyIdFromPath ? { ...story, ...payload } : story);
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, data: currentStories.find(story => story.id === storyIdFromPath) }),
            });
            return;
        }

        if (path.endsWith('/test-cases') || path.endsWith('/bugs')) {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
            return;
        }

        await route.continue();
    });
}

test.describe('Story inline status control', () => {
    test.describe.configure({ timeout: 60_000 });

    test('updates a story from the list using qc.projects.edit', async ({ page }) => {
        let patchPayload: any = null;
        await mockAuthenticatedSession(page, {
            effectivePermissions: ['qc.user_stories.view', 'qc.projects.view', 'qc.projects.edit'],
            permissions: ['qc.user_stories.view', 'qc.projects.view', 'qc.projects.edit'],
        });
        await mockStoryApis(page, { onPatch: payload => { patchPayload = payload; } });

        await page.goto('/work/stories');
        await page.getByRole('button', { name: /Change status, currently Draft/i }).click();
        const patchRequest = page.waitForRequest(request =>
            new URL(request.url()).pathname === `/user-stories/${storyId}` && request.method() === 'PATCH'
        );
        await page.getByRole('menuitem', { name: 'Approved' }).click();
        await patchRequest;

        await expect(page.getByRole('button', { name: /Change status, currently Approved/i })).toBeVisible();
        await expect(page.getByText('User Story status updated to Approved')).toBeVisible();
        expect(patchPayload).toMatchObject({ status: 'Approved' });
    });

    test('renders the same control in the story detail header', async ({ page }) => {
        let patchPayload: any = null;
        await mockAuthenticatedSession(page, {
            effectivePermissions: ['qc.user_stories.view', 'qc.projects.view', 'qc.projects.edit', 'qc.tasks.view', 'qc.testcases.view', 'qc.bugs.view'],
            permissions: ['qc.user_stories.view', 'qc.projects.view', 'qc.projects.edit', 'qc.tasks.view', 'qc.testcases.view', 'qc.bugs.view'],
        });
        await mockStoryApis(page, { onPatch: payload => { patchPayload = payload; } });

        await page.goto(`/work/stories/${storyId}`);
        await expect(page.getByRole('heading', { name: 'Checkout status story' })).toBeVisible();
        await page.getByRole('button', { name: /Change status, currently Draft/i }).click();
        const patchRequest = page.waitForRequest(request =>
            new URL(request.url()).pathname === `/user-stories/${storyId}` && request.method() === 'PATCH'
        );
        await page.getByRole('menuitem', { name: 'Review' }).click();
        await patchRequest;

        await expect(page.getByRole('button', { name: /Change status, currently Review/i })).toBeVisible();
        expect(patchPayload).toMatchObject({ status: 'Review' });
    });

    test('disables story status when row _can.edit is false', async ({ page }) => {
        await mockAuthenticatedSession(page, {
            effectivePermissions: ['qc.user_stories.view', 'qc.projects.view', 'qc.projects.edit'],
            permissions: ['qc.user_stories.view', 'qc.projects.view', 'qc.projects.edit'],
        });
        await mockStoryApis(page, { initialStory: { _can: { edit: false } } });

        await page.goto('/work/stories');
        const disabledControl = page.getByRole('button', { name: /You don't have permission to change status/i });
        await expect(disabledControl).toBeDisabled();

        await page.getByTestId(`status-control-disabled-${storyId}`).hover();
        await expect(page.getByText("You don't have permission to change status")).toBeVisible();
    });

    test('bulk partial failure rolls back the failed story and reports a summary', async ({ page }) => {
        const stories = makeBulkStories(3);
        const failingStory = stories[1];
        const patchCalls: Array<{ storyId: string; payload: any }> = [];
        await mockAuthenticatedSession(page, {
            effectivePermissions: ['qc.user_stories.view', 'qc.projects.view', 'qc.projects.edit'],
            permissions: ['qc.user_stories.view', 'qc.projects.view', 'qc.projects.edit'],
        });
        await mockStoryApis(page, {
            initialStories: stories,
            patchStatus: (id) => id === failingStory.id ? 403 : undefined,
            onPatch: (payload, id) => { patchCalls.push({ storyId: id, payload }); },
        });

        await page.goto('/work/stories');
        await page.getByRole('checkbox', { name: 'Select all filtered stories' }).check();
        await expect(page.getByTestId('bulk-status-bar')).toContainText('3 selected');
        await page.getByTestId('bulk-status-select').selectOption('Approved');
        await page.getByTestId('bulk-status-apply').click();

        await expect.poll(() => patchCalls.length).toBe(3);
        await expect(page.getByRole('status').filter({ hasText: '2 updated, 1 failed (no permission)' })).toBeVisible();
        await expect(page.getByTestId(`story-row-${stories[0].id}`).getByRole('button', { name: /currently Approved/i })).toBeVisible();
        await expect(page.getByTestId(`story-row-${failingStory.id}`).getByRole('button', { name: /currently Draft/i })).toBeVisible();
        await expect(page.getByTestId(`story-row-${stories[2].id}`).getByRole('button', { name: /currently Approved/i })).toBeVisible();
    });
});

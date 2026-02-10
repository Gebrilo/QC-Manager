import { test, expect } from '@playwright/test';

test.describe('QC Management Tool Frontend Tests', () => {

    test('should load the dashboard', async ({ page }) => {
        // Mock Dashboard Metrics
        await page.route('**/dashboard', async route => {
            await route.fulfill({
                json: {
                    total_tasks: 10,
                    overall_completion_rate_pct: 75,
                    total_projects: 3,
                    projects_with_tasks: 2,
                    active_resources: 5,
                    loading: false
                }
            });
            // Also mock tasks for the list
            // await page.route('**/tasks', ...) - might be needed
        });

        await page.goto('/');
        await expect(page).toHaveTitle(/QC Management/i);
        // Check for key elements on the dashboard
        await expect(page.locator('text=Dashboard')).toBeVisible();
    });

    test('should navigate to Projects page and list projects', async ({ page }) => {
        await page.goto('/projects');
        await expect(page).toHaveURL(/\/projects/);
        await expect(page.locator('h1')).toContainText('Projects');
        // Check for "New Project" button or similar
        await expect(page.getByRole('button', { name: /New Project|Create Project/i })).toBeVisible();
    });

    test('should navigate to Tasks page', async ({ page }) => {
        await page.goto('/tasks');
        await expect(page).toHaveURL(/\/tasks/);
        await expect(page.locator('h1')).toContainText('Tasks');
    });

    test('should navigate to Resources page', async ({ page }) => {
        await page.goto('/resources');
        await expect(page).toHaveURL(/\/resources/);
        await expect(page.locator('h1')).toContainText('Resources');
    });

    test('should navigate to Test Cases page', async ({ page }) => {
        await page.goto('/test-cases');
        await expect(page).toHaveURL(/\/test-cases/);
        await expect(page.locator('h1')).toContainText('Test Cases');
    });

    test('should navigate to Governance page', async ({ page }) => {
        await page.goto('/governance');
        await expect(page).toHaveURL(/\/governance/);
        // Governance might have multiple tabs or sections
    });

    test('should navigate to Reports page', async ({ page }) => {
        await page.goto('/reports');
        await expect(page).toHaveURL(/\/reports/);
        await expect(page.locator('h1')).toContainText('Reports');
    });

    test.describe('Creation Flows', () => {

        test('should create a new project', async ({ page }) => {
            await page.goto('/projects/create');

            // Fill out Project Form
            await page.fill('input[name="name"]', 'E2E Test Project');
            await page.fill('input[name="project_id"]', 'E2E-001');
            await page.fill('input[name="total_weight"]', '5');
            await page.selectOption('select[name="priority"]', 'High');
            await page.fill('textarea[name="description"]', 'This is a test project created by Playwright');

            // Submit
            const submitButton = page.getByRole('button', { name: 'Create Project' });
            await expect(submitButton).toBeVisible();

            await page.route('**/projects', async route => { // Fixed pattern
                if (route.request().method() === 'POST') {
                    await route.fulfill({ json: { id: 'uuid-123', name: 'E2E Test Project' } });
                } else {
                    await route.continue();
                }
            });

            // Now click
            await submitButton.click();

            // Expect redirection to /projects or success message
            await expect(page).toHaveURL(/\/projects/);
        });

        test('should create a new task', async ({ page }) => {
            // Mock dependencies for the form
            // Mock GET /projects (for dropdown)
            await page.route('**/projects', async route => {
                if (route.request().method() === 'GET') {
                    await route.fulfill({ json: [{ id: '123e4567-e89b-12d3-a456-426614174000', project_id: 'PRJ-1', name: 'Mock Project' }] });
                } else {
                    await route.continue();
                }
            });

            await page.route('**/resources', async route => {
                await route.fulfill({ json: [{ id: '123e4567-e89b-12d3-a456-426614174001', name: 'Mock Resource' }] });
            });

            await page.goto('/tasks/create');

            // Form Loading
            await expect(page.locator('h1')).toContainText('Create New Task');

            // Fill Form
            await page.fill('input[name="task_id"]', 'TSK-999');
            await page.fill('input[name="task_name"]', 'E2E Test Task');
            await page.selectOption('select[name="status"]', 'In Progress');

            // These selects depend on the mocked data above
            // We need to wait for the options to appear
            const projectSelect = page.locator('select[name="project_id"]');
            await expect(projectSelect).not.toBeDisabled();
            // Wait for at least one option to be present (other than placeholder if any)
            // await expect(projectSelect.locator('option')).toHaveCount(1);
            // Using label selection is safer if we know the content
            await projectSelect.selectOption({ label: 'PRJ-1 - Mock Project' });

            const resourceSelect = page.locator('select[name="resource1_uuid"]');
            await expect(resourceSelect).not.toBeDisabled();
            await resourceSelect.selectOption({ label: 'Mock Resource' });

            // Submit Mock
            await page.route('**/tasks', async route => {
                if (route.request().method() === 'POST') {
                    await route.fulfill({ json: { id: '123e4567-e89b-12d3-a456-426614174002', task_name: 'E2E Test Task' } });
                } else {
                    await route.continue();
                }
            });

            await page.getByRole('button', { name: 'Create Task' }).click();

            // Expect redirect to dashboard
            await expect(page).toHaveURL('/');
        });

    });
});

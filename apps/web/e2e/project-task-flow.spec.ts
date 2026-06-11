import { test, expect } from '@playwright/test';
import { mockAuthenticatedSession } from './helpers/session';

const mockProject = {
    id: '11111111-1111-4111-8111-111111111111',
    project_id: 'PRJ-101',
    project_name: 'Atlas Platform',
    name: 'Atlas Platform',
    priority: 'High',
    total_weight: 5,
    description: 'Platform modernization',
};

const mockResource = {
    id: '22222222-2222-4222-8222-222222222222',
    resource_name: 'Jane Doe',
    is_active: true,
    utilization_pct: 40,
};

const mockSecondaryResource = {
    id: '55555555-5555-4555-8555-555555555555',
    resource_name: 'John Smith',
    is_active: true,
    utilization_pct: 25,
};

const mockThirdResource = {
    id: '66666666-6666-4666-8666-666666666666',
    resource_name: 'Alex Lee',
    is_active: true,
    utilization_pct: 15,
};

test.describe('Task assignment flow', () => {
    test('creates task with primary and multiple secondary assignments', async ({ page }) => {
        await mockAuthenticatedSession(page, {
            permissions: ['qc.tasks.create', 'qc.tasks.view', 'qc.projects.view', 'qc.resources.view'],
            effectivePermissions: ['qc.tasks.create', 'qc.tasks.view', 'qc.projects.view', 'qc.resources.view'],
        });
        let createdTaskPayload: any = null;

        await page.route('http://localhost:3001/projects*', async (route) => {
            const method = route.request().method();
            if (method === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([mockProject]),
                });
                return;
            }
            if (method === 'POST') {
                await route.fulfill({
                    status: 201,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        ...mockProject,
                        id: '33333333-3333-3333-3333-333333333333',
                        project_id: 'PRJ-201',
                        project_name: 'E2E New Project',
                        name: 'E2E New Project',
                    }),
                });
                return;
            }
            await route.continue();
        });

        await page.route('http://localhost:3001/tasks*', async (route) => {
            const method = route.request().method();
            if (method === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([]),
                });
                return;
            }
            if (method === 'POST') {
                createdTaskPayload = route.request().postDataJSON();
                await route.fulfill({
                    status: 201,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        id: '44444444-4444-4444-4444-444444444444',
                        task_id: 'TSK-777',
                        task_name: 'E2E Task',
                        status: 'Backlog',
                    }),
                });
                return;
            }
            await route.continue();
        });

        await page.route('http://localhost:3001/resources*', async (route) => {
            if (route.request().method() === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([mockResource, mockSecondaryResource, mockThirdResource]),
                });
                return;
            }
            await route.continue();
        });

        await page.goto('/work/tasks/create');
        await expect(page.getByRole('heading', { name: 'New Task' })).toBeVisible();
        await page.locator('input[placeholder="e.g. Implement Authorization Logic"]').fill('E2E Task');
        await page.locator('select[name="project_id"]').selectOption(mockProject.id);
        await page.locator('select[name="resource1_uuid"]').selectOption(mockResource.id);
        await page.locator('input[name="estimate_days"]').fill('2');
        await page.locator('input[name="primary_actual_days"]').fill('1');
        await page.getByRole('button', { name: 'Add Secondary' }).click();
        await page.locator('select[name="secondary_assignments.0.resource_id"]').selectOption(mockSecondaryResource.id);
        await page.locator('input[name="secondary_assignments.0.estimate_days"]').fill('0.5');
        await page.locator('input[name="secondary_assignments.0.actual_days"]').fill('0.25');
        await page.getByRole('button', { name: 'Add Secondary' }).click();
        await page.locator('select[name="secondary_assignments.1.resource_id"]').selectOption(mockThirdResource.id);
        await page.locator('input[name="secondary_assignments.1.estimate_days"]').fill('1.5');
        await page.getByRole('button', { name: 'Create Task' }).first().click();
        await expect(page).toHaveURL(/\/work\/tasks$/);
        expect(createdTaskPayload.assignments).toHaveLength(3);
        expect(createdTaskPayload.assignments).toEqual([
            expect.objectContaining({
                resource_id: mockResource.id,
                assignment_type: 'PRIMARY',
                estimate_hrs: 16,
                actual_hrs: 8,
            }),
            expect.objectContaining({
                resource_id: mockSecondaryResource.id,
                assignment_type: 'SECONDARY',
                estimate_hrs: 4,
                actual_hrs: 2,
            }),
            expect.objectContaining({
                resource_id: mockThirdResource.id,
                assignment_type: 'SECONDARY',
                estimate_hrs: 12,
                actual_hrs: 0,
            }),
        ]);
        expect(createdTaskPayload.resource2_uuid).toBe(mockSecondaryResource.id);
        expect(createdTaskPayload.r2_estimate_hrs).toBe(4);
    });
});

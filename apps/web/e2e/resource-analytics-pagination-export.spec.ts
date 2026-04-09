import { test, expect } from '@playwright/test';
import { mockAuthenticatedSession } from './helpers/session';

const RESOURCE_ID = 'res-001';

const mockAnalytics = {
  profile: {
    id: RESOURCE_ID,
    resource_name: 'Alice Smith',
    email: 'alice@example.com',
    department: 'Engineering',
    role: 'Senior QA',
    is_active: true,
    user_id: 'user-001',
  },
  utilization: {
    weekly_capacity_hrs: 40,
    current_allocation_hrs: 35,
    utilization_pct: 87.5,
    active_tasks_count: 8,
    backlog_tasks_count: 7,
  },
  current_week_actual_hrs: 28,
  backlog_hrs: 52,
  timeline_summary: { on_track: 5, at_risk: 3, overdue: 2, completed_early: 1 },
  task_summary: {
    total: 15,
    by_status: { Done: 5, 'In Progress': 6, Backlog: 4 },
    by_priority: { high: 7, medium: 5, low: 3 },
    by_project: { Alpha: 8, Beta: 7 },
  },
  tasks: Array.from({ length: 15 }, (_, i) => ({
    id: `task-${i + 1}`,
    task_id: `T-${String(i + 1).padStart(3, '0')}`,
    task_name: `Test Task ${i + 1}`,
    status: i < 5 ? 'Done' : i < 11 ? 'In Progress' : 'Backlog',
    priority: 'medium',
    project_name: i < 8 ? 'Alpha' : 'Beta',
    estimate_hrs: 4,
    actual_hrs: 3.5,
    assignment_role: 'tester',
    start_variance: null,
    completion_variance: null,
    execution_variance: null,
    health_status: 'on_track',
  })),
  bugs: Array.from({ length: 12 }, (_, i) => ({
    id: `bug-${i + 1}`,
    bug_id: `B-${String(i + 1).padStart(3, '0')}`,
    title: `Test Bug ${i + 1}`,
    source: i % 2 === 0 ? 'TEST_CASE' : 'EXPLORATORY',
    status: i < 6 ? 'Open' : 'Closed',
    severity: 'medium',
    project_name: 'Alpha',
    creation_date: '2026-04-01T00:00:00Z',
  })),
};

async function setupPage(page: import('@playwright/test').Page) {
  await mockAuthenticatedSession(page);
  await page.route(`http://localhost:3001/resources/${RESOURCE_ID}/analytics`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockAnalytics),
    });
  });
  await page.goto(`/resources/${RESOURCE_ID}`);
  await page.waitForSelector('h1');
}

test.describe('Resource Analytics – Tasks Pagination', () => {
  test('shows only 10 tasks on page 1 of 2', async ({ page }) => {
    await setupPage(page);
    const rows = page.locator('[data-testid="tasks-table"] tbody tr');
    await expect(rows).toHaveCount(10);
  });

  test('shows "Page 1 of 2" indicator for 15 tasks', async ({ page }) => {
    await setupPage(page);
    await expect(page.getByTestId('tasks-pagination')).toContainText('Page 1 of 2');
  });

  test('Previous button is disabled on first page', async ({ page }) => {
    await setupPage(page);
    await expect(page.getByTestId('tasks-prev-btn')).toBeDisabled();
  });

  test('Next button navigates to page 2 showing remaining 5 tasks', async ({ page }) => {
    await setupPage(page);
    await page.getByTestId('tasks-next-btn').click();
    const rows = page.locator('[data-testid="tasks-table"] tbody tr');
    await expect(rows).toHaveCount(5);
    await expect(page.getByTestId('tasks-pagination')).toContainText('Page 2 of 2');
  });

  test('Next button is disabled on last page', async ({ page }) => {
    await setupPage(page);
    await page.getByTestId('tasks-next-btn').click();
    await expect(page.getByTestId('tasks-next-btn')).toBeDisabled();
  });

  test('Previous button returns to page 1', async ({ page }) => {
    await setupPage(page);
    await page.getByTestId('tasks-next-btn').click();
    await page.getByTestId('tasks-prev-btn').click();
    await expect(page.getByTestId('tasks-pagination')).toContainText('Page 1 of 2');
    const rows = page.locator('[data-testid="tasks-table"] tbody tr');
    await expect(rows).toHaveCount(10);
  });
});

test.describe('Resource Analytics – Bugs Pagination', () => {
  test('shows only 10 bugs on page 1 of 2', async ({ page }) => {
    await setupPage(page);
    const rows = page.locator('[data-testid="bugs-table"] tbody tr');
    await expect(rows).toHaveCount(10);
  });

  test('shows "Page 1 of 2" indicator for 12 bugs', async ({ page }) => {
    await setupPage(page);
    await expect(page.getByTestId('bugs-pagination')).toContainText('Page 1 of 2');
  });

  test('Next button navigates to page 2 showing remaining 2 bugs', async ({ page }) => {
    await setupPage(page);
    await page.getByTestId('bugs-next-btn').click();
    const rows = page.locator('[data-testid="bugs-table"] tbody tr');
    await expect(rows).toHaveCount(2);
  });
});

test.describe('Resource Analytics – Export', () => {
  test('tasks CSV export button is visible', async ({ page }) => {
    await setupPage(page);
    await expect(page.getByTestId('tasks-export-csv')).toBeVisible();
  });

  test('tasks XLSX export button is visible', async ({ page }) => {
    await setupPage(page);
    await expect(page.getByTestId('tasks-export-xlsx')).toBeVisible();
  });

  test('bugs CSV export button is visible', async ({ page }) => {
    await setupPage(page);
    await expect(page.getByTestId('bugs-export-csv')).toBeVisible();
  });

  test('bugs XLSX export button is visible', async ({ page }) => {
    await setupPage(page);
    await expect(page.getByTestId('bugs-export-xlsx')).toBeVisible();
  });

  test('tasks CSV export triggers a file download named resource_tasks_alice_smith.csv', async ({ page }) => {
    await setupPage(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('tasks-export-csv').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/resource_tasks_alice_smith\.csv/);
  });

  test('tasks XLSX export triggers a file download named resource_tasks_alice_smith.xlsx', async ({ page }) => {
    await setupPage(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('tasks-export-xlsx').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/resource_tasks_alice_smith\.xlsx/);
  });
});

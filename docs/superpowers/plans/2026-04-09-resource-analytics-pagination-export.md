# Resource Analytics Dashboard – Pagination & Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add client-side pagination (10 rows/page) and CSV/XLSX export to the Tasks and Bugs tables in the Resource Analytics Dashboard page.

**Architecture:** All data is fetched once from `/resources/:id/analytics` and held in React state. Pagination slices the in-memory array — no backend changes needed. Export generates files client-side using the `xlsx` library (v0.18.5, already in `package.json`).

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS, `xlsx` 0.18.5, Playwright (E2E tests)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `apps/web/src/hooks/usePagination.ts` | Pagination state: currentPage, totalPages, slice, goToPrev, goToNext |
| Create | `apps/web/src/components/ui/Pagination.tsx` | Pagination UI: Previous/Next buttons + "Page X of N" label |
| Create | `apps/web/src/lib/exportUtils.ts` | downloadCSV, downloadXLSX, safeFilename helpers |
| Modify | `apps/web/app/resources/[id]/page.tsx` | Wire pagination hooks + export buttons into Tasks/Bugs tables |
| Create | `apps/web/e2e/resource-analytics-pagination-export.spec.ts` | Playwright E2E tests (written first) |

---

### Task 1: Write failing E2E tests

**Files:**
- Create: `apps/web/e2e/resource-analytics-pagination-export.spec.ts`

- [ ] **Step 1: Create the test file**

```typescript
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
```

- [ ] **Step 2: Run tests to confirm they all fail (feature does not exist yet)**

```bash
cd /root/QC-Manager/apps/web
npx playwright test e2e/resource-analytics-pagination-export.spec.ts --reporter=list 2>&1 | head -50
```

Expected output: All tests fail with "locator not found" or "element not visible" errors. No green checkmarks.

- [ ] **Step 3: Commit the failing tests**

```bash
cd /root/QC-Manager
git add apps/web/e2e/resource-analytics-pagination-export.spec.ts
git commit -m "test: add failing E2E tests for resource analytics pagination and export"
```

---

### Task 2: Create `usePagination` hook

**Files:**
- Create: `apps/web/src/hooks/usePagination.ts`

- [ ] **Step 1: Create the hook file**

```typescript
import { useState, useEffect } from 'react';

export function usePagination(totalItems: number, pageSize: number = 10) {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Reset to page 1 whenever the dataset size changes (e.g. after data loads)
  useEffect(() => {
    setCurrentPage(1);
  }, [totalItems]);

  return {
    currentPage,
    totalPages,
    goToPrev: () => setCurrentPage(p => Math.max(1, p - 1)),
    goToNext: () => setCurrentPage(p => Math.min(totalPages, p + 1)),
    slice: <T>(items: T[]): T[] =>
      items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
  };
}
```

- [ ] **Step 2: Commit**

```bash
cd /root/QC-Manager
git add apps/web/src/hooks/usePagination.ts
git commit -m "feat: add usePagination hook"
```

---

### Task 3: Create `Pagination` UI component

**Files:**
- Create: `apps/web/src/components/ui/Pagination.tsx`

- [ ] **Step 1: Create the component file**

```tsx
interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  testIdPrefix: string;
}

export function Pagination({ currentPage, totalPages, onPrev, onNext, testIdPrefix }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div
      data-testid={`${testIdPrefix}-pagination`}
      className="flex items-center justify-between px-6 py-3 border-t border-slate-100 dark:border-slate-800"
    >
      <button
        data-testid={`${testIdPrefix}-prev-btn`}
        onClick={onPrev}
        disabled={currentPage === 1}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        ← Previous
      </button>
      <span className="text-xs text-slate-500 dark:text-slate-400">
        Page {currentPage} of {totalPages}
      </span>
      <button
        data-testid={`${testIdPrefix}-next-btn`}
        onClick={onNext}
        disabled={currentPage === totalPages}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Next →
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /root/QC-Manager
git add apps/web/src/components/ui/Pagination.tsx
git commit -m "feat: add Pagination UI component"
```

---

### Task 4: Create `exportUtils.ts`

**Files:**
- Create: `apps/web/src/lib/exportUtils.ts`

- [ ] **Step 1: Create the export utilities file**

```typescript
import * as XLSX from 'xlsx';

type Row = Record<string, string | number | null | undefined>;

/** Converts a display name to a filesystem-safe slug, e.g. "Alice Smith" → "alice_smith" */
export function safeFilename(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '_');
}

/** Generates and triggers a browser download of a CSV file from a row array */
export function downloadCSV(filename: string, rows: Row[]): void {
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  triggerBlobDownload(blob, filename);
}

/** Generates and triggers a browser download of an XLSX file from a row array */
export function downloadXLSX(filename: string, rows: Row[]): void {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, filename);
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Commit**

```bash
cd /root/QC-Manager
git add apps/web/src/lib/exportUtils.ts
git commit -m "feat: add CSV and XLSX client-side export utilities"
```

---

### Task 5: Add pagination and export to the Tasks table

**Files:**
- Modify: `apps/web/app/resources/[id]/page.tsx`

The current file is 600 lines. All edits are surgical replacements — no full rewrite.

- [ ] **Step 1: Add imports after line 6 (`import Link from 'next/link';`)**

Insert these three lines immediately after `import Link from 'next/link';`:

```typescript
import { usePagination } from '@/hooks/usePagination';
import { Pagination } from '@/components/ui/Pagination';
import { downloadCSV, downloadXLSX, safeFilename } from '@/lib/exportUtils';
```

- [ ] **Step 2: Add `tasksToRows` helper after the `BADGE_CLASSES` const (after line 119)**

Insert after the closing `};` of `BADGE_CLASSES`:

```typescript
function tasksToRows(tasks: ResourceAnalytics['tasks']) {
  return tasks.map(t => ({
    'Task ID': t.task_id,
    'Task Name': t.task_name,
    'Project': t.project_name ?? '',
    'Status': t.status,
    'Priority': t.priority ?? '',
    'Health Status': t.health_status ?? '',
    'Start Variance (days)': t.start_variance ?? '',
    'Completion Variance (days)': t.completion_variance ?? '',
    'Execution Variance (days)': t.execution_variance ?? '',
    'Estimated Hrs': Number(t.estimate_hrs).toFixed(1),
    'Actual Hrs': Number(t.actual_hrs).toFixed(1),
  }));
}
```

- [ ] **Step 3: Add pagination hooks before the early returns (after line 165 `const resourceId = ...`)**

Insert after `const resourceId = params?.id as string;`:

```typescript
const tasksPagination = usePagination(data?.tasks.length ?? 0);
const bugsPagination = usePagination(data?.bugs.length ?? 0);
```

These must be placed before any `if (!canAccess) return` — React hook rules require all hooks to run unconditionally.

- [ ] **Step 4: Replace the Tasks table section header with one that includes export buttons**

Find and replace this exact block:

```tsx
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                    <h3 className="text-sm font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                        Assigned Tasks ({data.tasks.length})
                    </h3>
                </div>
```

Replace with:

```tsx
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                        Assigned Tasks ({data.tasks.length})
                    </h3>
                    {data.tasks.length > 0 && (
                        <div className="flex items-center gap-2">
                            <button
                                data-testid="tasks-export-csv"
                                onClick={() => downloadCSV(
                                    `resource_tasks_${safeFilename(profile.resource_name)}.csv`,
                                    tasksToRows(data.tasks)
                                )}
                                className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            >
                                Export CSV
                            </button>
                            <button
                                data-testid="tasks-export-xlsx"
                                onClick={() => downloadXLSX(
                                    `resource_tasks_${safeFilename(profile.resource_name)}.xlsx`,
                                    tasksToRows(data.tasks)
                                )}
                                className="text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white transition-colors shadow-sm"
                            >
                                Export Excel
                            </button>
                        </div>
                    )}
                </div>
```

- [ ] **Step 5: Add `data-testid` to tasks `<table>` and switch to paginated slice**

Find:

```tsx
                        <table className="w-full table-fixed">
                            <thead className="bg-slate-50 dark:bg-slate-800/50">
                                <tr>
                                    <th className="w-[26%]
```

Replace the opening `<table` tag only:

```tsx
                        <table data-testid="tasks-table" className="w-full table-fixed">
```

Find:

```tsx
                                {data.tasks.map(task => {
```

Replace with:

```tsx
                                {tasksPagination.slice(data.tasks).map(task => {
```

- [ ] **Step 6: Add `<Pagination>` component after `</tbody>` in the tasks table**

Find this exact block (the closing of the tasks tbody + table):

```tsx
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Reported Bugs */}
```

Replace with:

```tsx
                            </tbody>
                        </table>
                        <Pagination
                            currentPage={tasksPagination.currentPage}
                            totalPages={tasksPagination.totalPages}
                            onPrev={tasksPagination.goToPrev}
                            onNext={tasksPagination.goToNext}
                            testIdPrefix="tasks"
                        />
                    </div>
                )}
            </div>

            {/* Reported Bugs */}
```

- [ ] **Step 7: Commit**

```bash
cd /root/QC-Manager
git add apps/web/app/resources/[id]/page.tsx
git commit -m "feat: add pagination and export to resource analytics tasks table"
```

---

### Task 6: Add pagination and export to the Bugs table

**Files:**
- Modify: `apps/web/app/resources/[id]/page.tsx`

- [ ] **Step 1: Add `bugsToRows` helper after `tasksToRows`**

Insert after the closing `}` of `tasksToRows`:

```typescript
function bugsToRows(bugs: ResourceAnalytics['bugs']) {
  return bugs.map(b => ({
    'Bug ID': b.bug_id,
    'Title': b.title,
    'Source': b.source === 'TEST_CASE' ? 'Test Case' : 'Exploratory',
    'Status': b.status,
    'Severity': b.severity,
    'Project': b.project_name ?? '',
    'Created': b.creation_date
      ? new Date(b.creation_date).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      : '',
  }));
}
```

- [ ] **Step 2: Replace the Bugs table section header with one that includes export buttons**

Find and replace this exact block:

```tsx
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                    <h3 className="text-sm font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                        Reported Bugs ({data.bugs.length})
                    </h3>
                </div>
```

Replace with:

```tsx
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                        Reported Bugs ({data.bugs.length})
                    </h3>
                    {data.bugs.length > 0 && (
                        <div className="flex items-center gap-2">
                            <button
                                data-testid="bugs-export-csv"
                                onClick={() => downloadCSV(
                                    `resource_bugs_${safeFilename(profile.resource_name)}.csv`,
                                    bugsToRows(data.bugs)
                                )}
                                className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            >
                                Export CSV
                            </button>
                            <button
                                data-testid="bugs-export-xlsx"
                                onClick={() => downloadXLSX(
                                    `resource_bugs_${safeFilename(profile.resource_name)}.xlsx`,
                                    bugsToRows(data.bugs)
                                )}
                                className="text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white transition-colors shadow-sm"
                            >
                                Export Excel
                            </button>
                        </div>
                    )}
                </div>
```

- [ ] **Step 3: Add `data-testid` to the bugs `<table>` and switch to paginated slice**

The bugs section has a second `<table className="w-full table-fixed">`. Add the testid to it:

Find (the one inside the bugs section, after "Reported Bugs"):

```tsx
                        <table className="w-full table-fixed">
                            <thead className="bg-slate-50 dark:bg-slate-800/50">
                                <tr>
                                    <th className="w-[8%]
```

Replace the opening `<table` tag:

```tsx
                        <table data-testid="bugs-table" className="w-full table-fixed">
```

Find:

```tsx
                                {data.bugs.map(bug => {
```

Replace with:

```tsx
                                {bugsPagination.slice(data.bugs).map(bug => {
```

- [ ] **Step 4: Add `<Pagination>` component after `</tbody>` in the bugs table**

Find this exact block (closing of bugs tbody + table + outer divs):

```tsx
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Variance Legend */}
```

Replace with:

```tsx
                            </tbody>
                        </table>
                        <Pagination
                            currentPage={bugsPagination.currentPage}
                            totalPages={bugsPagination.totalPages}
                            onPrev={bugsPagination.goToPrev}
                            onNext={bugsPagination.goToNext}
                            testIdPrefix="bugs"
                        />
                    </div>
                )}
            </div>

            {/* Variance Legend */}
```

- [ ] **Step 5: Commit**

```bash
cd /root/QC-Manager
git add apps/web/app/resources/[id]/page.tsx
git commit -m "feat: add pagination and export to resource analytics bugs table"
```

---

### Task 7: Run E2E tests and verify all pass

- [ ] **Step 1: Ensure the dev server is running on port 3000**

```bash
cd /root/QC-Manager/apps/web
npm run dev > /tmp/web-dev.log 2>&1 &
sleep 8
curl -s http://localhost:3000 | grep -q "html" && echo "Server ready" || echo "Server not ready"
```

Expected: `Server ready`

- [ ] **Step 2: Run the new E2E suite**

```bash
cd /root/QC-Manager/apps/web
npx playwright test e2e/resource-analytics-pagination-export.spec.ts --reporter=list
```

Expected: All 14 tests pass (green checkmarks). Zero failures.

- [ ] **Step 3: Fix any failures before continuing**

If a test fails, read the error carefully:
- "locator not found" → `data-testid` attribute missing or wrong in the component
- "expected 10, got 15" → pagination hook not wired up (slice not called)
- "download event not fired" → `downloadXLSX` / `downloadCSV` not triggering the browser download mechanism (check the `XLSX.writeFile` call uses the correct filename string)

Fix the issue, then re-run Step 2.

- [ ] **Step 4: Run the full E2E suite to catch regressions**

```bash
cd /root/QC-Manager/apps/web
npx playwright test --reporter=list 2>&1 | tail -30
```

Expected: All pre-existing tests still pass. Zero regressions.

- [ ] **Step 5: Commit any fixes**

```bash
cd /root/QC-Manager
git add apps/web/app/resources/[id]/page.tsx apps/web/src/hooks/usePagination.ts apps/web/src/components/ui/Pagination.tsx apps/web/src/lib/exportUtils.ts
git commit -m "fix: resolve E2E test failures in pagination and export implementation"
```

(Skip this commit if no fixes were needed.)

---

## Self-Review

### Spec Coverage

| Spec Requirement | Covered By |
|-----------------|------------|
| Page size = 10 records | `usePagination` default `pageSize = 10` |
| Show pagination controls only if > 10 records | `Pagination` returns `null` when `totalPages <= 1` |
| Previous / Next arrows | `Pagination` component buttons |
| "Page X of N" indicator | `<span>` in `Pagination` component |
| Previous disabled on first page | `disabled={currentPage === 1}` |
| Next disabled on last page | `disabled={currentPage === totalPages}` |
| Independent pagination per table | Separate `tasksPagination` and `bugsPagination` hook instances |
| CSV export for Tasks | `tasks-export-csv` button → `downloadCSV` |
| XLSX export for Tasks | `tasks-export-xlsx` button → `downloadXLSX` |
| CSV export for Bugs | `bugs-export-csv` button → `downloadCSV` |
| XLSX export for Bugs | `bugs-export-xlsx` button → `downloadXLSX` |
| Export = all records, not current page | `data.tasks` / `data.bugs` passed to export (not paginated slice) |
| Export reflects filtered dataset | Export uses `data.tasks` / `data.bugs` which are the API-returned arrays (no additional filters exist on this page) |
| File naming: `resource_tasks_<name>.csv` | `safeFilename(profile.resource_name)` in button `onClick` |
| File naming: `resource_bugs_<name>.xlsx` | Same pattern |
| Dates are readable in export | `toLocaleDateString('en-GB', ...)` in `bugsToRows` |
| No null/undefined in export | `?? ''` coalescing on all optional fields in `tasksToRows` / `bugsToRows` |
| Column headers are clear | Explicit human-readable string keys in row conversion helpers |

No gaps found. All spec requirements are covered.

### Placeholder Scan

No TBD, TODO, "similar to Task N", or "add appropriate handling" patterns present. Every code block is complete and runnable.

### Type Consistency

- `usePagination.slice<T>()` is generic — called as `tasksPagination.slice(data.tasks)` and `bugsPagination.slice(data.bugs)`, TypeScript infers `T` from the argument. ✓
- `Pagination` prop `testIdPrefix: string` → produces `data-testid="${testIdPrefix}-pagination"`, `"${testIdPrefix}-prev-btn"`, `"${testIdPrefix}-next-btn"` — matches exact `getByTestId` strings used in tests (`tasks-pagination`, `tasks-prev-btn`, etc.). ✓
- `tasksToRows` accepts `ResourceAnalytics['tasks']` — that type is defined in the same page file at line 41. ✓
- `bugsToRows` accepts `ResourceAnalytics['bugs']` — defined at line 56 in the same file. ✓
- `safeFilename` used identically in both tasks and bugs export handlers. ✓

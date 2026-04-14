# Quality Metrics — Delete Cleanup & Template Fix

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two remaining gaps so Quality Metrics governance data is consistent with test run deletions and the downloadable template teaches users about optional columns.

**Architecture:** The upload already dual-writes to both `test_execution` (test run UI) and `test_result` (governance views). The delete handler currently only soft-deletes `test_run` (cascading to `test_execution`) but leaves `test_result` untouched — this is why governance numbers survive after a test run is deleted. Fix: add a hard DELETE from `test_result` for the same `(project_id, execution_date)` inside the existing delete transaction. Separately, the downloadable template CSV still has only 4 columns — update the `SAMPLE_TEMPLATE` constant to match the 8-column format preview already shown in the UI.

**Tech Stack:** Node.js/Express, PostgreSQL (pool.connect transaction pattern), Jest/supertest, Next.js/React

---

## File Map

| File | Change |
|---|---|
| `apps/api/src/routes/testExecutions.js` | Add `DELETE FROM test_result` inside the delete transaction (lines 450–469) |
| `apps/api/__tests__/testExecutions.delete.test.js` | New test file for the delete endpoint |
| `apps/web/app/test-executions/page.tsx` | Update `SAMPLE_TEMPLATE` constant (lines 57–64) |

---

## Task 1: Delete handler — also clear test_result

**Files:**
- Modify: `apps/api/src/routes/testExecutions.js` (lines 450–469)
- Create: `apps/api/__tests__/testExecutions.delete.test.js`

---

- [ ] **Step 1: Create the test file**

Create `apps/api/__tests__/testExecutions.delete.test.js` with this content:

```js
/**
 * Tests for DELETE /test-executions/test-runs/:id
 * Verifies that deleting a test run also clears test_result rows
 * for the same project + execution date (governance cleanup).
 */

const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockClient = { query: mockQuery, release: mockRelease };

jest.mock('../src/config/db', () => ({
  pool: { connect: jest.fn().mockResolvedValue(mockClient) }
}));

jest.mock('../src/middleware/authMiddleware', () => ({
  requireAuth: (req, res, next) => {
    req.user = { id: 'user-1', email: 'tester@example.com' };
    next();
  },
  requirePermission: () => (req, res, next) => next(),
}));

const express = require('express');
const request = require('supertest');
const testExecutionsRouter = require('../src/routes/testExecutions');

const app = express();
app.use(express.json());
app.use('/test-executions', testExecutionsRouter);

afterEach(() => jest.clearAllMocks());

describe('DELETE /test-executions/test-runs/:id', () => {
  test('soft-deletes test_run AND deletes test_result rows for same project+date', async () => {
    // Query call order: BEGIN, SELECT, UPDATE test_run, DELETE test_result, INSERT audit_log, COMMIT
    mockQuery
      .mockResolvedValueOnce({})  // BEGIN
      .mockResolvedValueOnce({    // SELECT — test run exists
        rows: [{
          id: 'run-uuid-1',
          run_id: 'TR-001',
          project_id: 'proj-uuid-1',
          started_at: '2026-04-10',
        }]
      })
      .mockResolvedValueOnce({})  // UPDATE test_run (soft delete)
      .mockResolvedValueOnce({})  // DELETE test_result
      .mockResolvedValueOnce({})  // INSERT audit_log
      .mockResolvedValueOnce({}); // COMMIT

    const res = await request(app).delete('/test-executions/test-runs/run-uuid-1');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Test run deleted successfully');

    // 4th call (index 3) must be the test_result DELETE
    const deleteCall = mockQuery.mock.calls[3];
    expect(deleteCall[0]).toMatch(/DELETE FROM test_result/i);
    expect(deleteCall[0]).toMatch(/project_id\s*=\s*\$1/i);
    expect(deleteCall[0]).toMatch(/executed_at/i);
    expect(deleteCall[1][0]).toBe('proj-uuid-1');
    expect(deleteCall[1][1]).toBe('2026-04-10');
  });

  test('returns 404 when test run does not exist', async () => {
    mockQuery
      .mockResolvedValueOnce({})              // BEGIN
      .mockResolvedValueOnce({ rows: [] })    // SELECT — not found
      .mockResolvedValueOnce({});             // ROLLBACK

    const res = await request(app).delete('/test-executions/test-runs/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Test run not found');
  });

  test('rolls back and returns 500 on DB error during delete', async () => {
    mockQuery
      .mockResolvedValueOnce({})  // BEGIN
      .mockResolvedValueOnce({    // SELECT — exists
        rows: [{ id: 'run-uuid-1', run_id: 'TR-001', project_id: 'proj-uuid-1', started_at: '2026-04-10' }]
      })
      .mockRejectedValueOnce(new Error('DB connection lost')); // UPDATE fails

    const res = await request(app).delete('/test-executions/test-runs/run-uuid-1');

    expect(res.status).toBe(500);
  });
});
```

---

- [ ] **Step 2: Run the test — verify it FAILS**

```bash
cd /root/QC-Manager && npx jest --testPathPattern="testExecutions.delete" --no-coverage 2>&1 | tail -20
```

Expected: the first test fails because the 4th query call is the audit log INSERT, not a `DELETE FROM test_result` (the step hasn't been added yet).

---

- [ ] **Step 3: Add the test_result DELETE to the delete handler**

Open `apps/api/src/routes/testExecutions.js`. Find the delete handler at line ~450. The current block looks like this:

```js
    // Soft delete
    await client.query(
      'UPDATE test_run SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );

    // Audit log
    await client.query(
```

Replace it with:

```js
    const run = existingResult.rows[0];

    // Soft delete
    await client.query(
      'UPDATE test_run SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );

    // Clear governance data for this project+date so metrics reflect the deletion
    await client.query(
      `DELETE FROM test_result
       WHERE project_id = $1
         AND executed_at = $2::date
         AND deleted_at IS NULL`,
      [run.project_id, run.started_at]
    );

    // Audit log
    await client.query(
```

---

- [ ] **Step 4: Run the test — verify it PASSES**

```bash
cd /root/QC-Manager && npx jest --testPathPattern="testExecutions.delete" --no-coverage 2>&1 | tail -20
```

Expected output:
```
PASS apps/api/__tests__/testExecutions.delete.test.js
  DELETE /test-executions/test-runs/:id
    ✓ soft-deletes test_run AND deletes test_result rows for same project+date
    ✓ returns 404 when test run does not exist
    ✓ rolls back and returns 500 on DB error during delete
```

---

- [ ] **Step 5: Run the full test suite to confirm no regressions**

```bash
cd /root/QC-Manager && npx jest --no-coverage 2>&1 | tail -15
```

Expected: all existing tests still pass.

---

- [ ] **Step 6: Commit**

```bash
cd /root/QC-Manager && git add apps/api/src/routes/testExecutions.js apps/api/__tests__/testExecutions.delete.test.js && git commit -m "$(cat <<'EOF'
fix(api): clear test_result when test run is deleted

Deleting a test run now also hard-deletes test_result rows for the same
project + execution date so governance metrics (v_execution_progress,
v_blocked_test_analysis) reflect the deletion instead of staying stale.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Update downloadable template to include optional columns

**Files:**
- Modify: `apps/web/app/test-executions/page.tsx` (lines 57–64)

---

- [ ] **Step 1: Update the SAMPLE_TEMPLATE constant**

Open `apps/web/app/test-executions/page.tsx`. Find lines 57–64:

```js
const SAMPLE_TEMPLATE = [
    ['Test Case ID', 'Name', 'Status', 'Notes'],
    ['TC-001', 'Login Test', 'Pass', ''],
    ['TC-002', 'Checkout Flow', 'Fail', 'Bug #123'],
    ['TC-003', 'Profile Update', 'Blocked', 'Environment issue'],
    ['TC-004', 'Password Reset', 'Not Executed', ''],
    ['TC-005', 'Search Functionality', 'Skipped', 'Out of scope'],
];
```

Replace with:

```js
const SAMPLE_TEMPLATE = [
    ['Test Case ID', 'Name', 'Status', 'Notes', 'Module Name', 'Requirement ID', 'Est Hours', 'Is Retest'],
    ['TC-001', 'Login Test',          'Pass',         '',             'Authentication', 'REQ-001', '2',   'No'],
    ['TC-002', 'Checkout Flow',       'Fail',         'Bug #123',     'Checkout',       'REQ-002', '1.5', 'No'],
    ['TC-003', 'Profile Update',      'Blocked',      'Env issue',    'Profile',        '',        '1',   'No'],
    ['TC-004', 'Password Reset',      'Not Executed', '',             'Authentication', '',        '',    'No'],
    ['TC-005', 'Search Functionality','Pass',          'Retested',    'Search',         'REQ-005', '0.5', 'Yes'],
];
```

---

- [ ] **Step 2: Verify the download produces an 8-column CSV**

Start the dev server if not already running:
```bash
cd /root/QC-Manager && docker logs qc-web --tail 5 2>&1
```

If it's running, navigate to `https://gebrils.cloud/test-executions`, click **Download Template**, and open the downloaded `test_results_template.csv`. Confirm the first row is:
```
Test Case ID,Name,Status,Notes,Module Name,Requirement ID,Est Hours,Is Retest
```

If you cannot open a browser, verify the constant was saved correctly:
```bash
grep -A 8 'SAMPLE_TEMPLATE' /root/QC-Manager/apps/web/app/test-executions/page.tsx | head -10
```

Expected: first array row has 8 elements.

---

- [ ] **Step 3: Commit**

```bash
cd /root/QC-Manager && git add apps/web/app/test-executions/page.tsx && git commit -m "$(cat <<'EOF'
fix(ui): update download template to include optional governance columns

Template CSV now includes Module Name, Requirement ID, Est Hours, and
Is Retest columns so the downloaded file matches the format preview
shown on the page and teaches users what optional columns unlock.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Done — Verification Checklist

After both tasks are committed, verify end-to-end on the live site:

- [ ] Upload a CSV → Governance page shows non-zero execution coverage and gross/net progress
- [ ] Delete that test run → refresh Governance → numbers reset to zero (or previous batch) for that project
- [ ] Download template → CSV has 8 columns
- [ ] Upload a CSV with `Module Name` and `Blocked` rows → Blocked Test Analysis populates
- [ ] Upload a CSV with `Requirement ID` → Requirement Coverage % appears in Quality Metrics

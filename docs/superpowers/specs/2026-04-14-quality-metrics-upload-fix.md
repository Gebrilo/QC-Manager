# Quality Metrics Upload Fix — Design Spec
**Date:** 2026-04-14
**Status:** Approved for implementation

---

## Problem Statement

Migration 017 added three governance views (`v_execution_progress`, `v_blocked_test_analysis`, `v_test_effectiveness`) and three governance API endpoints that power the new Governance page widgets (Quality Metrics, Blocked Test Analysis, Progress Overview).

All three views read from the `test_result` table. However, the upload handler in `testExecutions.js` writes rows into `test_execution` — a separate table used for the test run tracking UI. Nothing ever lands in `test_result` from the upload flow, so all three new governance widgets show zeros regardless of how many test results are uploaded.

Additionally, the upload parser only reads four columns from the CSV/Excel file. The four new optional columns added by migration 017 (`module_name`, `requirement_id`, `estimated_hrs`, `is_retest`) are never parsed or stored, so Blocked Analysis and Requirement Coverage remain permanently empty.

The task form (`TaskForm.tsx`) was audited and requires **no changes** — all fields needed for resource analytics and governance workload calculations are present.

---

## Approach: Dual-Write (Option A)

During upload, write each test result row to **both** tables:

1. `test_execution` — existing write, unchanged. Preserves test run tracking UI with no breakage.
2. `test_result` — new write. Feeds the governance views directly.

`test_result` needs `project_id` and `executed_at` directly on each row (not via a join). The upload already knows both — `project_id` comes from the form field, `execution_date` from the date picker. The dual-write is therefore straightforward: no new form inputs required.

`blocked_result_id` (a UUID FK that links a retest to its original blocked row) is **out of scope**. It cannot be reliably resolved from a flat CSV import. Leave it NULL for all rows created via upload.

---

## Data Flow (After Fix)

```
User uploads CSV/Excel
        │
        ▼
testExecutions.js — parse row
        │
        ├──► INSERT test_execution (existing — test run UI)
        │
        └──► INSERT test_result (new — governance views)
                │
                ├── project_id          ← from form field
                ├── executed_at         ← from execution date picker
                ├── test_case_id        ← from "Test Case ID" column (stored as string)
                ├── status              ← normalized from "Status" column
                ├── notes               ← from "Notes" column
                ├── module_name         ← from "Module Name" column (optional)
                ├── requirement_id      ← from "Requirement ID" column (optional)
                ├── estimated_hrs       ← from "Est Hours" column (optional)
                └── is_retest           ← from "Is Retest" column (optional, boolean)
```

---

## Changes Required

### 1. API — Upload Parser (`apps/api/src/routes/testExecutions.js`)

**Parse four new optional columns** using the same flexible-name pattern already in use:

| CSV column name(s) accepted | Maps to DB column | Default when absent |
|---|---|---|
| `Module Name`, `module_name`, `Module` | `module_name` | `NULL` |
| `Requirement ID`, `requirement_id`, `Req ID` | `requirement_id` | `NULL` |
| `Est Hours`, `estimated_hrs`, `Hours` | `estimated_hrs` | `NULL` |
| `Is Retest`, `is_retest`, `Retest` | `is_retest` | `FALSE` |

For `is_retest`, accept any of: `true`, `yes`, `1` (case-insensitive) → `TRUE`. Anything else → `FALSE`.

For `estimated_hrs`, parse as float via `parseFloat()`. If the result is `NaN` or negative, store `NULL`.

**Handle re-uploads: delete before insert.** The `unique_test_result_per_day` constraint includes `deleted_at`, which is nullable. PostgreSQL does not treat two NULL values as equal in unique constraints, so `ON CONFLICT` cannot reliably detect duplicates when `deleted_at IS NULL`. The safe approach: at the start of the upload transaction, before any row inserts, delete all existing `test_result` rows for the same `(project_id, executed_at)` pair:

```sql
DELETE FROM test_result
WHERE project_id = $1
  AND executed_at = $2
  AND deleted_at IS NULL
```

Then insert fresh rows for each CSV row:

```sql
INSERT INTO test_result (
  test_case_id, project_id, executed_at,
  status, notes,
  module_name, requirement_id, estimated_hrs, is_retest
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
```

This "replace batch" pattern is consistent with how test runs work — re-uploading a file replaces the previous results for that project + date combination. Since both the DELETE and all INSERTs run inside the same `BEGIN/COMMIT` transaction already used by the upload handler, a failure mid-way rolls everything back safely.

**Status value alignment** — the upload currently normalises to `'pass'` and `'fail'` (no `d` suffix), but the governance views filter on `'passed'` and `'failed'`. Fix: update the normaliser in `testExecutions.js` to emit `'passed'` and `'failed'` instead of `'pass'` and `'fail'`. This affects only the `test_result` insert — `test_execution` can keep whatever value it uses since its table is not read by governance views. Concretely:
- `['pass', 'passed', 'success', 'ok']` → `'passed'`
- `['fail', 'failed', 'failure', 'error']` → `'failed'`
- `'blocked'`, `'not_run'`, `'skipped'` remain unchanged — views already use these spellings.

### 2. UI — Test Executions Page (`apps/web/app/test-executions/page.tsx`)

**Update `SAMPLE_TEMPLATE`** to include all columns:

```js
const SAMPLE_TEMPLATE = [
  ['Test Case ID', 'Name', 'Status', 'Notes', 'Module Name', 'Requirement ID', 'Est Hours', 'Is Retest'],
  ['TC-001', 'Login Test',        'Pass',         '',              'Authentication', 'REQ-001', '2',   'No'],
  ['TC-002', 'Checkout Flow',     'Fail',         'Bug #123',      'Checkout',       'REQ-002', '1.5', 'No'],
  ['TC-003', 'Profile Update',    'Blocked',      'Env issue',     'Profile',        '',        '1',   'No'],
  ['TC-004', 'Password Reset',    'Not Executed', '',              'Authentication', '',        '',    'No'],
  ['TC-005', 'Search Function',   'Pass',         'Retested',      'Search',         'REQ-005', '0.5', 'Yes'],
];
```

**Update the "Expected File Format" preview table** to show all 8 columns. Mark the last 4 as optional with a muted style or `(optional)` label in the header.

**Add an info callout** below the format table (collapsed by default or always visible) explaining what each optional column unlocks:

| Column | Unlocks |
|---|---|
| `Module Name` | Blocked Test Analysis — per-module breakdown + pivot alerts |
| `Requirement ID` | Requirement Coverage % in Quality Metrics |
| `Est Hours` | Effort-at-risk hours in Blocked Analysis |
| `Is Retest` | Double-work (retest) hours tracking |

---

## What Does NOT Change

- `test_execution` insert — untouched, exactly as-is
- Test run tracking UI (recent uploads list, delete run, export) — no impact
- `test_result` unique constraint — the upsert handles re-uploads
- Task form (`TaskForm.tsx`) — complete, no gaps found
- Any existing governance endpoints (release readiness, quality risks, workload balance, trend) — unaffected

---

## Success Criteria

After implementation:

1. Upload a CSV with only the 4 original columns → `v_execution_progress` shows execution coverage and gross/net progress for that project.
2. Upload a CSV that also includes `Module Name` → `v_blocked_test_analysis` shows per-module rows; Blocked Test Analysis widget populates.
3. Upload a CSV with `Requirement ID` → Requirement Coverage % appears in Quality Metrics widget.
4. Upload a CSV with `Est Hours` and some `Blocked` rows → Blocked hrs and retest hrs appear in Blocked Analysis footer.
5. Re-upload the same file → no duplicate rows, latest result wins (upsert).
6. Test run tracking UI (recent uploads list) continues to work as before.
7. Task form create/edit flows unchanged.

---

## Out of Scope

- `blocked_result_id` linkage via CSV (requires UUID of another row — not feasible from a flat import)
- Editing individual test results after upload
- Per-requirement traceability UI (just the coverage % for now)
- Any changes to the task form or task API

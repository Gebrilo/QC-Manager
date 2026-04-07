# Execution Date Field on Test Results Upload

**Date:** 2026-04-07  
**Status:** Approved  
**Scope:** Small — 2 files, no DB schema changes

---

## Problem

When uploading a test results sheet (Excel/CSV), the `test_run.started_at` is always set to `CURRENT_TIMESTAMP` (upload time). If the user uploads historical results, the Governance Dashboard trend chart plots them as today's data, not the actual test date.

## Solution

Add a date picker to the upload form. The selected date is passed to the API and stored as `started_at` on the new `test_run` record. Defaults to today so existing behaviour is unchanged when uploading same-day results.

---

## Changes

### 1. Frontend — `apps/web/app/test-executions/page.tsx`

- Add `executionDate` state, initialised to `new Date().toISOString().split('T')[0]` (today in `YYYY-MM-DD`)
- Add `<input type="date">` labeled **"Execution Date"**, placed between the run name field and the file drop zone
- Append `execution_date` to the `FormData` sent to `POST /test-executions/upload-excel`
- Use `executionDate` (not `new Date()`) when generating the fallback run name: `Excel Import - <executionDate>`

### 2. Backend — `apps/api/src/routes/testExecutions.js` (`upload-excel` handler)

- Destructure `execution_date` from `req.body`
- Validate: if present, must match `YYYY-MM-DD` format (simple regex `^\d{4}-\d{2}-\d{2}$`)
- In the `INSERT INTO test_run` query:
  - If valid: pass `execution_date` as the 6th parameter, add `started_at` to the column list, use `$6::timestamptz`
  - If missing or invalid: omit `started_at` from the insert and let the DB default (`CURRENT_TIMESTAMP`) apply
- No other endpoints are affected

---

## Data Flow

```
User selects date (default: today)
  → FormData.append('execution_date', '2026-03-15')
  → POST /test-executions/upload-excel
  → INSERT INTO test_run (run_id, name, ..., started_at)
                   VALUES (..., '2026-03-15'::timestamptz)
  → Governance trend query: DATE(tr.started_at) = '2026-03-15' ✓
```

---

## Constraints

- Date field is **optional** — if omitted the upload still works (backward compatible)
- No DB migration needed — `started_at` column already exists and accepts `timestamptz`
- No changes to any other pages, API routes, or components

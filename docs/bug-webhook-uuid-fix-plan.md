# Bug Webhook UUID Error — Investigation & Fix Plan

**Date:** 2026-04-07
**Error:** `invalid input syntax for type uuid: "140"`
**Failing node:** n8n → "Send to QC API"
**Status:** Fix implemented — code changes deployed to repo

---

## Root Cause

The n8n "Transform Bug Data" node (version from commit `2ec8a5d`) extracts linked artifact IDs from Tuleap fields using the `sel()` helper function and places them in `linked_test_case_ids` / `linked_test_execution_ids`. These are **Tuleap integer artifact IDs** (e.g., `"140"`), but the PostgreSQL columns `linked_test_case_ids UUID[]` and `linked_test_execution_ids UUID[]` require valid UUIDs.

### How the broken flow works

```
Tuleap webhook sends bug with art_link field:
  → sel('Linked test cases') returns "140" (Tuleap artifact ID)
  → linkedTestCaseIds = "140".split(',') = ["140"]
  → bugData.linked_test_case_ids = ["140"]
  → POST /tuleap-webhook/bug sends linked_test_case_ids: ["140"]
  → INSERT INTO bugs (..., linked_test_case_ids) VALUES (..., '{"140"}')
  → PostgreSQL rejects: invalid input syntax for type uuid: "140"
```

### Broken code (commit `2ec8a5d` — Transform Bug Data node)

```javascript
// This is WRONG — sel() returns Tuleap integer IDs, not QC UUIDs
const linkedTestCases = sel('Linked test cases', 'Linked Test Cases', 'linked_test_cases');
const linkedExecs = sel('Linked test executions', 'Linked Test Executions', 'linked_test_executions');
const linkedTestCaseIds = linkedTestCases ? linkedTestCases.split(',').filter(Boolean) : [];
const linkedTestExecIds = linkedExecs ? linkedExecs.split(',').filter(Boolean) : [];
// ...
bugData.linked_test_case_ids = linkedTestCaseIds;   // ["140"] — not a UUID!
bugData.linked_test_execution_ids = linkedTestExecIds;
```

### Corrected code (current repo HEAD)

```javascript
// Linked artifact data used ONLY for source classification, not for UUID columns
const hasTestCaseLink = allValues.some(v =>
  v.type === 'art_link' &&
  Array.isArray(v.links) &&
  v.links.some(link => link.tracker && link.tracker.label === 'Test Case')
);
const source = hasTestCaseLink ? 'TEST_CASE' : 'EXPLORATORY';
// ...
bugData.linked_test_case_ids = [];    // Always empty — correct
bugData.linked_test_execution_ids = [];
```

### Why Tuleap IDs can't go in UUID columns

The `linked_test_case_ids UUID[]` column stores **QC-Manager internal UUIDs** (e.g., `a1b2c3d4-...`), not Tuleap integer IDs. To properly populate these columns, the system would need to:

1. Extract Tuleap artifact IDs from `art_link` fields
2. Look up corresponding QC-Manager test cases by `tuleap_artifact_id`
3. Use the QC-Manager UUIDs

This lookup is not implemented and is out of scope for the current fix.

---

## Fix Steps

### Step 1: Re-import the corrected n8n workflow

The repo already has the fix at `HEAD`. Re-import the workflow into n8n.

**File:** `n8n-workflows/tuleap-bug-sync.json`

```bash
# Option A: Import via n8n UI
# 1. Open n8n → Workflows
# 2. Delete or deactivate the current "Tuleap Bug → QC-Manager Sync" workflow
# 3. Import n8n-workflows/tuleap-bug-sync.json
# 4. Re-activate the workflow

# Option B: If n8n API is available
curl -X POST http://localhost:5678/api/v1/workflows \
  -H "Content-Type: application/json" \
  -d @n8n-workflows/tuleap-bug-sync.json
```

> **Important:** Importing deactivates the workflow — re-activate it after import.

### Step 2: Verify the deployed Transform Bug Data code

After importing, open the "Transform Bug Data" node in n8n and confirm:
- `linked_test_case_ids: []` (empty array, NOT `linkedTestCaseIds`)
- `linked_test_execution_ids: []` (empty array, NOT `linkedTestExecIds`)
- `source` field is set based on `hasTestCaseLink` check

### Step 3: Clean up any corrupted data

If any bugs were partially inserted before the error, clean them up:

```sql
-- Check for any bugs with invalid linked_test_case_ids
SELECT id, bug_id, linked_test_case_ids, linked_test_execution_ids
FROM bugs
WHERE deleted_at IS NULL
  AND (linked_test_case_ids != '{}' OR linked_test_execution_ids != '{}')
ORDER BY created_at DESC
LIMIT 20;

-- If invalid data exists, reset to empty arrays
UPDATE bugs
SET linked_test_case_ids = '{}',
    linked_test_execution_ids = '{}',
    updated_at = NOW()
WHERE linked_test_case_ids IS NOT NULL
  AND linked_test_case_ids != '{}'
  AND NOT (linked_test_case_ids[1]::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-');
```

### Step 4: Test the fix

Trigger a test webhook from Tuleap (or use the n8n test execution):

1. **Bug without linked test cases** → should sync with `source = 'EXPLORATORY'`
2. **Bug with art_link to a Test Case tracker** → should sync with `source = 'TEST_CASE'`
3. Both should have `linked_test_case_ids = '{}'` (empty)

### Step 5: Verify end-to-end

```bash
# Check that bugs are being inserted correctly
SELECT id, bug_id, source, linked_test_case_ids, project_id
FROM bugs
WHERE deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 5;

# Check the bug summary endpoint
curl http://localhost:3001/bugs/summary?project_id=<UUID>
```

---

## Secondary Check: Deployed vs Repo Workflow Versions

There are **two workflow files** in the repo:

| File | Purpose | Status |
|------|---------|--------|
| `n8n-workflows/tuleap-bug-sync.json` | **Canonical source** — updated, correct | Has the fix |
| `n8n/workflows/tuleap_bug_sync.json` | Legacy/backup copy — uses Postgres node directly | Outdated, different node structure |

**Always import from `n8n-workflows/tuleap-bug-sync.json`** — it has the correct Provision Project flow and the fixed Transform Bug Data code.

---

## Also Affected: The `n8n/workflows/` Backup

The `n8n/workflows/tuleap_bug_sync.json` file is an older version with a completely different node structure (uses Postgres nodes instead of HTTP requests, no Provision Project support). It should be updated to match the canonical version or deleted to avoid confusion.

---

## Architecture Note (Future)

To properly populate `linked_test_case_ids` with valid UUIDs in the future:

1. n8n extracts Tuleap artifact IDs from `art_link` fields
2. n8n calls a new API: `GET /test-cases?tuleap_artifact_id=140`
3. API returns the QC-Manager UUID for that test case
4. n8n puts the UUID in `linked_test_case_ids`

This requires the test case sync to be fully operational first, so that QC-Manager has records of test cases with their `tuleap_artifact_id` mappings.

---

## Key Files Reference

| File | Relevance |
|------|-----------|
| `n8n-workflows/tuleap-bug-sync.json` | n8n workflow (canonical, has fix) |
| `apps/api/src/routes/tuleapWebhook.js:220-405` | Bug webhook handler — INSERT/UPDATE |
| `database/migrations/005_tuleap_integration.sql:10-49` | Bugs table schema — UUID[] columns |
| `n8n/workflows/tuleap_bug_sync.json` | Legacy workflow backup (outdated) |

## Commit History

| Commit | Description |
|--------|-------------|
| `2ec8a5d` | Introduced bug: `sel()` extraction puts integer IDs in UUID[] columns |
| `HEAD` (current) | Fix: reverted to `linked_test_case_ids: []` |

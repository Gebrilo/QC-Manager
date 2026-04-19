# Bug Reverse-Link Classification Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correctly classify bugs as `TEST_CASE` when their test-case association comes through Tuleap `reverse_links` (not just forward `links`).

**Architecture:** Two parallel fixes — (1) the n8n `Transform Bug Data` node that classifies bugs at ingest time, and (2) the backfill SQL that re-classifies existing bugs from their stored `raw_tuleap_payload`. Both currently read only `links`; both must also read `reverse_links`.

**Tech Stack:** n8n workflow JSON (embedded JS), PostgreSQL/jsonb, Node/Express API

---

## Background

In Tuleap's REST API, an `art_link` field on an artifact contains two arrays:
- `links` — artifacts *this* artifact links forward to
- `reverse_links` — artifacts that link *to this* artifact (e.g. a Test Case that references a Bug)

When a QA engineer attaches a bug to a test case from the test case side, the connection appears in `reverse_links` on the bug payload. The existing classification code ignores `reverse_links`, so those bugs are stored as `EXPLORATORY` even though they have associated test cases.

---

## Files Changed

| File | Change |
|------|--------|
| `n8n-workflows/tuleap-bug-sync.json` | Fix `Transform Bug Data` node to check `reverse_links` |
| `scripts/backfill-bug-source-from-payload.sql` | Fix backfill query to check `reverse_links` |

No API changes are needed — the API already trusts the `source` field sent by n8n.

---

## Task 1: Fix the n8n Workflow Classification Logic

**Files:**
- Modify: `n8n-workflows/tuleap-bug-sync.json` (the `Transform Bug Data` node's `jsCode`)

The current classification in `Transform Bug Data`:

```js
const hasTestCaseLink = allValues.some(v =>
  v.type === 'art_link' &&
  Array.isArray(v.links) &&
  v.links.some(link => link.tracker && link.tracker.label === 'Test Case')
);
```

This must become:

```js
const hasTestCaseLink = allValues.some(v =>
  v.type === 'art_link' &&
  (
    (Array.isArray(v.links) &&
      v.links.some(link => link.tracker && link.tracker.label === 'Test Case')) ||
    (Array.isArray(v.reverse_links) &&
      v.reverse_links.some(link => link.tracker && link.tracker.label === 'Test Case'))
  )
);
```

### Steps

- [ ] **Step 1: Open the workflow JSON and locate the node**

  Read `n8n-workflows/tuleap-bug-sync.json` and find the `"name": "Transform Bug Data"` node.
  Confirm the current `hasTestCaseLink` block matches the snippet above before editing.

- [ ] **Step 2: Apply the fix**

  In the `jsCode` value of the `Transform Bug Data` node, replace the `hasTestCaseLink` block with the fixed version that includes the `reverse_links` check.

  The replacement is a pure string edit inside the JSON `jsCode` field — do not reformat the surrounding JSON.

- [ ] **Step 3: Validate the JSON is still parseable**

  ```bash
  python3 -c "import json; json.load(open('n8n-workflows/tuleap-bug-sync.json')); print('OK')"
  ```

  Expected: `OK`

- [ ] **Step 4: Commit**

  ```bash
  git add n8n-workflows/tuleap-bug-sync.json
  git commit -m "fix: check reverse_links when classifying bug source in n8n workflow"
  ```

---

## Task 2: Fix the Backfill SQL

**Files:**
- Modify: `scripts/backfill-bug-source-from-payload.sql`

The existing SQL checks `field->'links'` to determine if any link points to a `Test Case` tracker. It must also check `field->'reverse_links'`.

Current condition inside the `EXISTS`:
```sql
AND EXISTS (
  SELECT 1
  FROM jsonb_array_elements(field->'links') AS link
  WHERE link->'tracker'->>'label' = 'Test Case'
)
```

Replace the inner exists block with:
```sql
AND (
  EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(field->'links', '[]'::jsonb)) AS link
    WHERE link->'tracker'->>'label' = 'Test Case'
  )
  OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(field->'reverse_links', '[]'::jsonb)) AS link
    WHERE link->'tracker'->>'label' = 'Test Case'
  )
)
```

Note: `COALESCE(field->'links', '[]'::jsonb)` handles the case where the key is absent entirely — `jsonb_array_elements` errors on NULL, but not on an empty array.
The old `AND field->'links' IS NOT NULL` guard must be **removed** — the `COALESCE` replaces it.

### Steps

- [ ] **Step 1: Write the fixed SQL file**

  Replace `scripts/backfill-bug-source-from-payload.sql` with the corrected version:

  ```sql
  -- Backfill bug source classification by parsing art_link fields from raw_tuleap_payload
  -- Checks BOTH forward links and reverse_links for Test Case tracker associations
  -- Bugs with such links -> TEST_CASE, otherwise -> EXPLORATORY
  -- Note: linked_test_case_ids is UUID[] so we don't touch it (Tuleap artifact IDs are integers)

  BEGIN;

  UPDATE bugs
  SET
    source = CASE
      WHEN raw_tuleap_payload IS NOT NULL
       AND raw_tuleap_payload->'current'->'values' IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM jsonb_array_elements(raw_tuleap_payload->'current'->'values') AS field
         WHERE field->>'type' = 'art_link'
           AND (
             EXISTS (
               SELECT 1
               FROM jsonb_array_elements(COALESCE(field->'links', '[]'::jsonb)) AS link
               WHERE link->'tracker'->>'label' = 'Test Case'
             )
             OR EXISTS (
               SELECT 1
               FROM jsonb_array_elements(COALESCE(field->'reverse_links', '[]'::jsonb)) AS link
               WHERE link->'tracker'->>'label' = 'Test Case'
             )
           )
       )
      THEN 'TEST_CASE'
      ELSE 'EXPLORATORY'
    END,
    updated_at = NOW()
  WHERE deleted_at IS NULL;

  COMMIT;

  -- Verification: show source distribution after backfill
  SELECT source, COUNT(*) FROM bugs WHERE deleted_at IS NULL GROUP BY source ORDER BY count DESC;

  -- Verification: show individual bugs
  SELECT
    tuleap_artifact_id,
    bug_id,
    title,
    source
  FROM bugs
  WHERE deleted_at IS NULL
  ORDER BY tuleap_artifact_id
  LIMIT 20;
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add scripts/backfill-bug-source-from-payload.sql
  git commit -m "fix: backfill SQL now checks reverse_links for Test Case classification"
  ```

---

## Task 3: Run the Backfill Against Production

This re-classifies any bugs already in the DB that were wrongly stored as `EXPLORATORY`.

### Steps

- [ ] **Step 1: Check current source distribution before running**

  ```bash
  docker exec supabase-db psql -U postgres -d postgres -c \
    "SELECT source, COUNT(*) FROM bugs WHERE deleted_at IS NULL GROUP BY source ORDER BY count DESC;"
  ```

  Note the counts — you'll compare after the backfill.

- [ ] **Step 2: Preview which bugs would flip (dry run)**

  ```bash
  docker exec supabase-db psql -U postgres -d postgres -c "
  SELECT
    tuleap_artifact_id,
    bug_id,
    title,
    source AS current_source,
    CASE
      WHEN raw_tuleap_payload IS NOT NULL
       AND raw_tuleap_payload->'current'->'values' IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM jsonb_array_elements(raw_tuleap_payload->'current'->'values') AS field
         WHERE field->>'type' = 'art_link'
           AND (
             EXISTS (
               SELECT 1
               FROM jsonb_array_elements(COALESCE(field->'links', '[]'::jsonb)) AS link
               WHERE link->'tracker'->>'label' = 'Test Case'
             )
             OR EXISTS (
               SELECT 1
               FROM jsonb_array_elements(COALESCE(field->'reverse_links', '[]'::jsonb)) AS link
               WHERE link->'tracker'->>'label' = 'Test Case'
             )
           )
       )
      THEN 'TEST_CASE'
      ELSE 'EXPLORATORY'
    END AS new_source
  FROM bugs
  WHERE deleted_at IS NULL
  ORDER BY tuleap_artifact_id;
  "
  ```

  Look for rows where `current_source` is `EXPLORATORY` but `new_source` would be `TEST_CASE` — those are the bugs that were wrongly classified.

- [ ] **Step 3: Run the backfill**

  ```bash
  docker exec -i supabase-db psql -U postgres -d postgres \
    < scripts/backfill-bug-source-from-payload.sql
  ```

  Expected: `UPDATE N` where N ≥ 0, followed by the verification counts and bug list.

- [ ] **Step 4: Confirm the distribution changed as expected**

  Compare the before/after `source` counts from steps 1 and 3.

---

## Task 4: Re-import Fixed Workflow into n8n

The live n8n instance is still running the pre-fix workflow (this was already a known pending action). This task deploys the fixed JSON.

### Steps

- [ ] **Step 1: Open n8n and delete (or deactivate) the old workflow**

  In the n8n UI, navigate to **Workflows** → find `BugSync001TuleapQC` → deactivate it.

- [ ] **Step 2: Import the fixed workflow**

  In n8n: **Workflows** → **Import from file** → select `n8n-workflows/tuleap-bug-sync.json`.

- [ ] **Step 3: Activate the imported workflow**

  Toggle the workflow to **Active**.

- [ ] **Step 4: End-to-end smoke test**

  Trigger a test webhook from Tuleap (update any bug that has a reverse link to a test case).
  In n8n, verify the execution log shows:
  - `Parse Payload` → success
  - `Transform Bug Data` → `source: "TEST_CASE"` in the output
  - `Send to QC API` → HTTP 200/201

  In the QC-Manager UI / directly in the DB:
  ```bash
  docker exec supabase-db psql -U postgres -d postgres -c \
    "SELECT tuleap_artifact_id, source FROM bugs ORDER BY updated_at DESC LIMIT 5;"
  ```

  Confirm the bug appears as `TEST_CASE`.

---

## Definition of Done

- [ ] `n8n-workflows/tuleap-bug-sync.json` classifies bugs with `reverse_links` to Test Case as `TEST_CASE`
- [ ] `scripts/backfill-bug-source-from-payload.sql` checks both `links` and `reverse_links`
- [ ] Backfill has been run and existing bugs re-classified
- [ ] Fixed workflow is active in n8n
- [ ] End-to-end smoke test passes (bug with reverse test-case link → `TEST_CASE` in DB)

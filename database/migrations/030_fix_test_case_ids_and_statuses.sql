-- Migration 030: Fix duplicate test_case_ids and invalid statuses
-- Root causes:
--   1. generateTestCaseId() used ORDER BY without a lock → concurrent webhooks all got the same ID
--   2. No UNIQUE constraint on test_case_id → duplicates were silently inserted
--   3. Tuleap statuses ('Backlog', 'Done', etc.) stored verbatim → invalid for QC status model

-- Step 1: Reassign all test_case_ids to unique sequential values ordered by tuleap_artifact_id.
-- Each row has a unique tuleap_artifact_id (UNIQUE constraint exists there), so this is safe.
WITH ordered_cases AS (
  SELECT id,
    ROW_NUMBER() OVER (
      ORDER BY
        CASE WHEN tuleap_artifact_id IS NULL THEN 1 ELSE 0 END,
        COALESCE(tuleap_artifact_id, 2147483647),
        created_at,
        id
    ) AS rn
  FROM test_case
)
UPDATE test_case tc
SET test_case_id = 'TC-' || LPAD(oc.rn::text, 5, '0')
FROM ordered_cases oc
WHERE tc.id = oc.id;

-- Step 2: Create a sequence and initialise it past the current max.
CREATE SEQUENCE IF NOT EXISTS test_case_id_seq;

SELECT setval(
  'test_case_id_seq',
  COALESCE(
    (SELECT MAX(CAST(SUBSTRING(test_case_id FROM 4) AS BIGINT))
     FROM test_case
     WHERE test_case_id ~ '^TC-[0-9]+$'),
    0
  )
);

-- Step 3: Add UNIQUE constraint (now safe because all IDs are distinct).
ALTER TABLE test_case
  ADD CONSTRAINT test_case_test_case_id_key UNIQUE (test_case_id);

-- Step 4: Map invalid (Tuleap-originated) status values to the nearest valid QC status.
-- Valid QC test-case statuses: 'draft', 'active', 'deprecated', 'archived'
-- NOTE: Run this step last; if n8n is actively syncing, rows may revert between step 1 and step 4.
UPDATE test_case
SET status = CASE LOWER(status)
  WHEN 'backlog'     THEN 'draft'
  WHEN 'to do'       THEN 'draft'
  WHEN 'todo'        THEN 'draft'
  WHEN 'new'         THEN 'draft'
  WHEN 'open'        THEN 'draft'
  WHEN 'in progress' THEN 'active'
  WHEN 'running'     THEN 'active'
  WHEN 'done'        THEN 'deprecated'
  WHEN 'closed'      THEN 'deprecated'
  WHEN 'resolved'    THEN 'deprecated'
  WHEN 'passed'      THEN 'deprecated'
  WHEN 'complete'    THEN 'deprecated'
  WHEN 'completed'   THEN 'deprecated'
  WHEN 'fail'        THEN 'active'
  WHEN 'failed'      THEN 'active'
  WHEN 'cancelled'   THEN 'archived'
  WHEN 'canceled'    THEN 'archived'
  WHEN 'rejected'    THEN 'archived'
  ELSE 'draft'
END
WHERE status NOT IN ('draft', 'active', 'deprecated', 'archived');

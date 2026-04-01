-- Backfill bug source classification from existing linked arrays data
-- No Tuleap re-sync required

BEGIN;

UPDATE bugs
SET source = CASE
  WHEN linked_test_case_ids IS NOT NULL AND linked_test_case_ids != '{}'
    THEN 'TEST_CASE'
  WHEN linked_test_execution_ids IS NOT NULL AND linked_test_execution_ids != '{}'
    then 'TEST_CASE'
  ELSE 'EXPLORATORY'
END,
updated_at = NOW()
WHERE deleted_at IS NULL;

COMMIT;

-- Verification
SELECT source, COUNT(*) FROM bugs WHERE deleted_at IS NULL GROUP BY source ORDER BY count DESC;

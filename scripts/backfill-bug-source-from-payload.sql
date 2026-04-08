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

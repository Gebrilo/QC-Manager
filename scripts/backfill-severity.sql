-- Phase 0: Backfill severity from stored Tuleap payloads
-- Run once after deploying the n8n mapSeverity fix
-- This corrects all bugs that defaulted to 'medium' due to the mapping bug

BEGIN;

UPDATE bugs SET severity = CASE
  WHEN sv_label ILIKE '%critical%' THEN 'critical'
  WHEN sv_label ILIKE '%high%'     THEN 'high'
  WHEN sv_label ILIKE '%major%'    THEN 'high'
  WHEN sv_label ILIKE '%medium%'   THEN 'medium'
  WHEN sv_label ILIKE '%normal%'   THEN 'medium'
  WHEN sv_label ILIKE '%low%'      THEN 'low'
  WHEN sv_label ILIKE '%minor%'    THEN 'low'
  ELSE 'medium'
END,
updated_at = NOW()
FROM (
  SELECT b.id,
    (SELECT sv->>'label'
     FROM jsonb_array_elements(b.raw_tuleap_payload->'current'->'values') AS val,
          jsonb_array_elements(val->'values') AS sv
     WHERE val->>'label' = 'Severity'
     LIMIT 1
    ) AS sv_label
  FROM bugs b
  WHERE b.raw_tuleap_payload IS NOT NULL
    AND b.deleted_at IS NULL
) AS extracted
WHERE bugs.id = extracted.id
  AND extracted.sv_label IS NOT NULL;

COMMIT;

-- Verification: check severity distribution after backfill
-- SELECT severity, count(*) FROM bugs WHERE deleted_at IS NULL GROUP BY severity ORDER BY count DESC;

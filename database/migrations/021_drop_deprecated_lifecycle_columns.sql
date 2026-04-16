-- Migration 021: Drop deprecated lifecycle columns
-- Run ONLY after verifying migration 020 data in production.
-- activated and probation_completed are replaced by status and ready_for_activation.

BEGIN;

ALTER TABLE app_user
    DROP COLUMN IF EXISTS activated,
    DROP COLUMN IF EXISTS probation_completed;

COMMIT;

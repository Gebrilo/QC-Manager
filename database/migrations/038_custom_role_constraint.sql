-- Migration 038: Allow custom role identifiers in app_user.role.
-- API validation keeps role assignment constrained to built-in roles or
-- names present in custom_roles; the database constraint enforces only the
-- normalized role identifier format.

BEGIN;

ALTER TABLE app_user DROP CONSTRAINT IF EXISTS valid_role;
ALTER TABLE app_user ADD CONSTRAINT valid_role
CHECK (role ~ '^[a-z0-9_]+$');

COMMIT;

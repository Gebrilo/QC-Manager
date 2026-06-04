-- Migration 037: Seed qc.dashboard.pm.view permission for pm + admin roles.
-- Strictly additive; idempotent.

BEGIN;

INSERT INTO role_permissions (role_identifier, permission_key, granted_by)
VALUES
    ('pm',    'qc.dashboard.pm.view', NULL),
    ('admin', 'qc.dashboard.pm.view', NULL)
ON CONFLICT (role_identifier, permission_key) DO NOTHING;

COMMIT;

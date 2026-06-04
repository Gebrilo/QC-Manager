-- Migration 037: Seed qc.dashboards.pm.view permission for pm + admin roles.
-- Strictly additive; idempotent.

BEGIN;

INSERT INTO role_permissions (role_identifier, permission_key, granted_by)
VALUES
    ('pm',    'qc.dashboards.pm.view', NULL),
    ('admin', 'qc.dashboards.pm.view', NULL)
ON CONFLICT (role_identifier, permission_key) DO NOTHING;

COMMIT;

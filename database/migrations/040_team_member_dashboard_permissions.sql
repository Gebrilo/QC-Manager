-- Migration 040: Seed team-manager and member dashboard permissions.
-- Strictly additive; idempotent.

BEGIN;

INSERT INTO role_permissions (role_identifier, permission_key, granted_by)
VALUES
    ('team_manager', 'qc.dashboards.team_manager.view', NULL),
    ('team_manager', 'qc.tasks.take_over', NULL),
    ('manager',      'qc.dashboards.team_manager.view', NULL),
    ('manager',      'qc.tasks.take_over', NULL),
    ('member',       'qc.dashboards.member.view', NULL),
    ('admin',        'qc.dashboards.team_manager.view', NULL),
    ('admin',        'qc.dashboards.member.view', NULL)
ON CONFLICT (role_identifier, permission_key) DO NOTHING;

COMMIT;

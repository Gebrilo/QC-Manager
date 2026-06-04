-- Migration 039: Access Engine cleanup.
-- Engine enforcement is the only artifact route path after issue #91.

DELETE FROM feature_flags
WHERE key LIKE 'access_engine.%';

INSERT INTO role_permissions (role_identifier, permission_key, granted_by)
SELECT 'team_manager', permission_key, granted_by
FROM role_permissions
WHERE role_identifier = 'manager'
ON CONFLICT (role_identifier, permission_key) DO NOTHING;

DELETE FROM role_permissions
WHERE role_identifier = 'manager';

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'custom_roles'
          AND column_name = 'permissions'
    ) THEN
        INSERT INTO role_permissions (role_identifier, permission_key, granted_by)
        SELECT cr.name, perm, cr.created_by
        FROM custom_roles cr, UNNEST(cr.permissions) AS perm
        WHERE perm IS NOT NULL
        ON CONFLICT (role_identifier, permission_key) DO NOTHING;

        ALTER TABLE custom_roles DROP COLUMN permissions;
    END IF;
END $$;

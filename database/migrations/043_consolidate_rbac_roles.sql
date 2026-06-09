-- Migration 043: Consolidate RBAC roles per issue #189.
-- Maps legacy role identifiers to their canonical successors and refreshes
-- tester role permissions from the application catalog on API startup.

BEGIN;

UPDATE app_user
SET role = 'team_manager'
WHERE role = 'manager';

UPDATE app_user
SET role = 'tester'
WHERE role IN ('user', 'member');

DELETE FROM role_permissions
WHERE role_identifier IN ('manager', 'user', 'member', 'tester');

DELETE FROM custom_roles
WHERE name IN ('manager', 'user', 'member');

-- The startup migration runner inserts the current catalog defaults for tester
-- after deleting stale rows. This SQL file is a reference for the data rewrite;
-- use the application runner to seed the exact permission list.

COMMIT;

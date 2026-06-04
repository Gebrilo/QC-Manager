# Access Control Rollout

This note summarizes the access-control rollout completed by PRD #79 and issue #91.

## Current Model

- Artifact routes use the Access Engine as the only authorization path.
- Artifact visibility is derived from owner team, owner or assignee user, PM project scope, and explicit `artifact_access` grants.
- Role permissions are canonical in `role_permissions`.
- `custom_roles` stores role metadata only; the legacy `custom_roles.permissions` array is removed by migration 039 after backfill.
- The generic `feature_flags` table remains available, but retired `access_engine.*` rows are deleted by migration 039.

## Admin Gates

Admin-only user, team, and role management routes now use `qc.admin.*` permission keys instead of broad `requireRole('admin')` checks where the permission catalog has a precise management key.

## Deferred Alias Cleanup

The legacy `manager` role alias remains intentionally. It cannot be removed safely yet because older non-engine IDP, team, resource, dashboard, and frontend paths still contain direct `role === 'manager'` checks. The Access Engine canonicalizes `manager` to `team_manager`, and migration 039 folds `role_permissions` rows from `manager` into `team_manager`.

Before removing the alias, update those remaining role-identity checks to support `team_manager` or to use permission gates, then migrate any `app_user.role = 'manager'` rows to `team_manager`.

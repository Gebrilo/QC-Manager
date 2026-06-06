# QC-Manager UI Role Scenario Pack

This pack defines UI-focused role and permission scenarios for QC-Manager. It is meant for a human tester or an agent using Playwright/browser automation to validate that each built-in role can use only the workflows allowed by the RBAC catalog and route guards.

## Source Of Truth

- Role definitions: `apps/shared/rbac/catalog.ts`
- UI route guards: `apps/web/src/config/routes.ts` and `apps/web/src/components/providers/RouteGuard.tsx`
- UI permission checks: `apps/web/src/components/providers/AuthProvider.tsx`
- API permission middleware: `apps/api/src/middleware/authMiddleware.js`
- Team scope helpers: `apps/api/src/middleware/teamAccess.js`

## Roles Covered

| Role | File | Notes |
| --- | --- | --- |
| `admin` | [roles/admin.md](roles/admin.md) | Wildcard access. |
| `team_manager` | [roles/team-manager.md](roles/team-manager.md) | Catalog role for team management. |
| `manager` | [roles/manager-legacy-alias.md](roles/manager-legacy-alias.md) | Legacy alias that should behave like `team_manager`; some API paths still check this exact role. |
| `pm` | [roles/pm.md](roles/pm.md) | Project manager dashboard and project-scoped visibility. |
| `member` | [roles/member.md](roles/member.md) | Active team member with own/team artifact access. |
| `tester` | [roles/tester.md](roles/tester.md) | Legacy editor/test execution role. |
| `viewer` | [roles/viewer.md](roles/viewer.md) | Read-mostly role with personal task access. |
| `contributor` | [roles/contributor.md](roles/contributor.md) | Preparation-only role focused on onboarding and assigned work. |
| `user` | [roles/user-legacy-alias.md](roles/user-legacy-alias.md) | Legacy alias that should behave like `tester`. |

## How To Invoke An Agent

Use a prompt like this:

```text
Use docs/05-qa/ui-role-scenarios/setup.md and docs/05-qa/ui-role-scenarios/roles/<role>.md.
Run the scenarios from the browser UI only unless a scenario explicitly asks you to inspect network responses.
Record pass/fail for every numbered scenario, include screenshots for failures, and call out any mismatch between visible UI controls and API permission errors.
```

## Pass Criteria

A role passes when:

- Allowed navigation renders without redirecting to `/me/tasks` or `/login`.
- Forbidden navigation is hidden or redirects to an allowed landing page.
- Allowed create/edit/delete actions complete successfully.
- Forbidden actions are hidden, disabled, or return a controlled 403 without changing data.
- Scoped roles see only own, team, or project data according to the role file.

## Known Risk Areas To Watch

- The UI currently checks exact permission keys. A scoped permission such as `qc.tasks.view_any` may not satisfy a route requiring `qc.tasks.view`.
- Some legacy team and development-plan API paths still branch on `role === 'manager'`.
- Page-level route guards can allow a page while action buttons still require a narrower permission.
- A role with `ACTIVE_ONLY` routes must have `status = ACTIVE`; `contributor` scenarios assume `status = PREPARATION`.


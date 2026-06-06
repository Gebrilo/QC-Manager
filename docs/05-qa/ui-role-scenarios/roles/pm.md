# Project Manager UI Scenarios

## Intent

Validate that `pm` can use PM dashboards and project-scoped views without receiving team-manager or admin privileges.

## Expected Navigation

Expected visible routes:

- `/me/tasks`
- `/me/dashboard`
- `/dashboards/pm`
- `/work/projects`
- `/work/stories`
- `/team/resources`
- `/quality/governance`
- `/quality/reports`

Expected hidden or denied routes:

- `/dashboards/team-manager`
- `/team/idp`
- `/team/journeys`
- `/team/history`
- `/admin/users`
- `/admin/roles`
- `/admin/permissions/matrix`
- Create/edit/delete admin routes.

Implementation watch: `pm` has scoped permissions like `qc.tasks.view_any` and `qc.bugs.view_any`, while some UI routes require exact unscoped keys like `qc.tasks.view` or `qc.bugs.view`. Record any route denied because of this exact-match behavior.

## Scenarios

### PM-01: PM dashboard

1. Log in as `PM_USER`.
2. Open `/dashboards/pm`.
3. Confirm Project A appears.
4. Confirm Project B does not appear unless `PM_USER` is also manager for Project B.

Expected: PM dashboard is accessible and project-scoped.

### PM-02: Project and story visibility

1. Open `/work/projects`.
2. Open Project A.
3. Open `/work/stories`.
4. Confirm Project A stories are visible.
5. Try to create, edit, and delete a project.

Expected: project/story read access works. Create/edit/delete project controls are hidden or denied unless custom permissions grant them.

### PM-03: Resource read boundary

1. Open `/team/resources`.
2. Search for resources on Project A.
3. Try to create, edit, or delete a resource.

Expected: resource read access is allowed; create/edit/delete controls are hidden or denied.

### PM-04: Quality governance and reports

1. Open `/quality/governance`.
2. Confirm read-only governance metrics render.
3. Try to change gates or approve releases.
4. Open `/quality/reports`.
5. Export or download an existing project report if available.
6. Try to generate a new report.

Expected: read/export actions are allowed where present; gate management, release approval, and report generation are hidden or denied.

### PM-05: Non-manager boundary

1. Directly open `/dashboards/team-manager`.
2. Directly open `/team/journeys`.
3. Directly open `/team/idp`.
4. Directly open `/admin/users`.

Expected: all routes redirect to an allowed landing page or show a controlled denied state.

### PM-06: Scoped artifact route watch

1. Directly open `/work/tasks`.
2. Directly open `/work/bugs`.
3. Directly open `/test/runs`.

Expected: if pages render, they must show only permitted project-scope data. If pages redirect because exact unscoped permission keys are required, record as an RBAC/UI mapping issue rather than a data leak.


# Viewer UI Scenarios

## Intent

Validate that `viewer` can view allowed work, execution, reports, and personal tasks without editing or administrative access.

## Expected Navigation

Expected accessible routes:

- `/me/tasks`
- `/me/dashboard`
- `/work/projects`
- `/work/tasks`
- `/team/resources`
- `/test/runs`
- `/test/results`
- `/quality/reports`

Expected hidden or denied routes:

- `/work/bugs`
- `/test/cases`
- `/test/suites`
- `/quality/governance`
- `/dashboards/team-manager`
- `/dashboards/pm`
- `/dashboards/member`
- `/admin/*`

## Scenarios

### VW-01: Viewer navigation

1. Log in as `VIEWER_USER`.
2. Confirm allowed navigation items are visible.
3. Confirm Manage and Admin sections are hidden.
4. Open every expected accessible route.

Expected: read pages render; denied pages redirect or do not render.

### VW-02: Read-only work access

1. Open `/work/projects`.
2. Open a project detail page.
3. Open `/work/tasks`.
4. Open a task detail page.
5. Try to create or edit a project.
6. Try to create or edit a task.

Expected: project/task read access works. Create and edit controls are hidden or denied.

### VW-03: Test execution read access

1. Open `/test/runs`.
2. Open a test run detail page.
3. Open `/test/results`.
4. Try to create a run, upload results, edit an execution, or delete a run.

Expected: read access works. Create/upload/edit/delete actions are hidden or denied.

### VW-04: Personal tasks

1. Open `/me/tasks`.
2. Create a personal task.
3. Edit the personal task.
4. Delete the personal task.

Expected: personal task actions are allowed because viewer has `qc.mywork.tasks.*` permissions.

### VW-05: Forbidden areas

1. Directly open `/work/bugs`.
2. Directly open `/test/cases`.
3. Directly open `/quality/governance`.
4. Directly open `/admin/users`.

Expected: all forbidden routes redirect to an allowed landing page or show controlled denied state.


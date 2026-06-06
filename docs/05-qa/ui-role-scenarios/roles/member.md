# Member UI Scenarios

## Intent

Validate that `member` can perform personal and team-scoped work, while being blocked from global, team-management, and admin actions.

## Expected Navigation

Visible sections: My Work and Quality.

Expected accessible routes:

- `/me/tasks`
- `/me/journeys`
- `/me/idp`
- `/me/idp/history`
- `/me/dashboard`
- `/dashboards/member`
- `/work/projects`
- `/work/tasks`
- `/work/stories`
- `/work/bugs`
- `/test/cases`
- `/test/suites`
- `/test/runs`
- `/quality/reports`

Expected denied routes:

- `/dashboards/team-manager`
- `/team/resources`
- `/team/idp`
- `/team/journeys`
- `/admin/*`

## Scenarios

### MEM-01: Member navigation

1. Log in as `MEMBER_A_USER`.
2. Confirm My Work and Quality sections are visible.
3. Confirm Manage and Admin sections are hidden.
4. Open `/dashboards/member`.

Expected: member dashboard renders without team-manager/admin navigation.

### MEM-02: Personal work

1. Open `/me/tasks`.
2. Create a personal task.
3. Edit that personal task.
4. Delete that personal task.
5. Open `/me/idp` and `/me/idp/history`.

Expected: personal tasks and personal development plan pages are accessible.

### MEM-03: Own and team artifact visibility

1. Open `/work/tasks`.
2. Confirm own assigned Team A tasks are visible.
3. Confirm Team A shared/team tasks are visible where seeded.
4. Confirm Team B-only tasks are not visible.
5. Repeat the visibility check for bugs, test cases, test suites, test executions, and stories where seeded.

Expected: own/team visibility works and Team B data is not exposed.

### MEM-04: Own artifact editing

1. Open an artifact owned by or assigned to `MEMBER_A_USER`.
2. Edit a safe field where the UI allows editing.
3. Open a Team A artifact not owned by `MEMBER_A_USER`.
4. Try to edit it.

Expected: own edit succeeds. Non-owned team artifact edit is hidden, denied, or limited according to artifact-specific `_can` state.

### MEM-05: Management boundary

1. Directly open `/team/resources`.
2. Directly open `/team/journeys`.
3. Directly open `/team/idp`.
4. Directly open `/admin/users`.

Expected: all management/admin routes are denied or redirect.


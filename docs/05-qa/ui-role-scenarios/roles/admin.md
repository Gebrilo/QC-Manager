# Admin UI Scenarios

## Intent

Validate that `admin` has wildcard access across QC-Manager, including admin-only routes and destructive actions.

## Expected Navigation

Visible sections: My Work, Quality, Manage, Admin.

Expected direct route access:

- `/admin/users`
- `/admin/teams`
- `/admin/journeys`
- `/admin/roles`
- `/admin/permissions/matrix`
- `/admin/integrations/tuleap`
- `/work/projects`
- `/work/tasks`
- `/work/stories`
- `/work/bugs`
- `/test/cases`
- `/test/suites`
- `/test/runs`
- `/quality/governance`
- `/quality/reports`
- `/team/resources`
- `/team/idp`
- `/team/journeys`

## Scenarios

### ADMIN-01: Admin navigation shell

1. Log in as `ADMIN_USER`.
2. Confirm My Work, Quality, Manage, and Admin sections are visible.
3. Open every route listed in Expected Navigation.

Expected: every page renders without redirect or permission toast.

### ADMIN-02: User and role administration

1. Open `/admin/users`.
2. View a user detail or editable row.
3. Change a non-critical field on a test user, then revert it.
4. Open `/admin/roles`.
5. Open `/admin/permissions/matrix`.

Expected: admin can view users, manage users, view roles, and update permission matrix controls.

### ADMIN-03: Team and journey administration

1. Open `/admin/teams`.
2. Create or edit a test team named `RBAC UI admin Team`.
3. Assign or remove a test member if safe test data exists.
4. Open `/admin/journeys`.
5. Create or edit a journey template named `RBAC UI admin Journey`.

Expected: team and journey management actions complete without 403 responses.

### ADMIN-04: Work artifact lifecycle

1. Create a project from `/work/projects/create`.
2. Create a story, task, bug, test case, suite, and test run linked to that project where the UI supports linkage.
3. Edit each created artifact.
4. Delete or soft-delete each created artifact where the UI supports deletion.

Expected: create, edit, and delete actions are visible and succeed.

### ADMIN-05: Quality and reporting

1. Open `/quality/governance`.
2. Update a test quality gate or global setting if safe.
3. Open `/quality/reports`.
4. Generate a report.
5. Download or view the generated report.

Expected: governance management and report generation are allowed.


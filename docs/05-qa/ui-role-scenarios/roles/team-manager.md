# Team Manager UI Scenarios

## Intent

Validate that `team_manager` can manage its team, view team-scoped artifacts, and perform team manager actions without admin-only access.

## Expected Navigation

Visible sections: My Work, Quality, Manage.

Hidden section: Admin.

Expected accessible routes:

- `/dashboards/team-manager`
- `/team/resources`
- `/team/idp`
- `/team/journeys`
- `/team/history`
- `/work/projects`
- `/work/tasks`
- `/work/stories`
- `/work/bugs`
- `/test/cases`
- `/test/suites`
- `/test/runs`
- `/quality/governance`
- `/quality/reports`

Expected forbidden routes:

- `/admin/users`
- `/admin/teams`
- `/admin/roles`
- `/admin/permissions/matrix`
- `/admin/integrations/tuleap`

## Scenarios

### TM-01: Team manager navigation

1. Log in as `TEAM_MANAGER_USER`.
2. Confirm My Work, Quality, and Manage sections are visible.
3. Confirm Admin section is hidden.
4. Open `/dashboards/team-manager`.

Expected: team dashboard renders and admin routes redirect to an allowed landing page.

### TM-02: Team-scoped resources

1. Open `/team/resources`.
2. Confirm Team A resources are visible.
3. Confirm Team B-only resources are not visible.
4. Create or edit a resource for a Team A user.

Expected: Team A resources are manageable; Team B resources are hidden or inaccessible.

### TM-03: Team work management

1. Open `/work/tasks`.
2. Confirm Team A tasks are visible.
3. Confirm Team B-only tasks are not visible.
4. Edit a Team A task.
5. Try to open a known Team B task detail URL directly.

Expected: Team A edit succeeds; Team B direct access is denied, hidden, or not found.

### TM-04: Team quality workflows

1. Open `/work/bugs`.
2. Edit or triage a Team A bug.
3. Open `/test/cases`.
4. Edit a Team A test case.
5. Open `/test/runs`.
6. Edit a Team A test execution or run where the UI supports it.

Expected: team-scoped quality actions succeed for Team A only.

### TM-05: Team journeys and development plans

1. Open `/team/journeys`.
2. Open a Team A member journey.
3. Open `/team/idp`.
4. Open a Team A member development plan.
5. Add a comment or update a safe test task in that plan.

Expected: Team A journey and development plan access succeeds.

Note: if this fails for `team_manager` while the same scenario passes for `manager`, record it as a role-alias mismatch. Some API paths still check exact `manager` role.

### TM-06: Admin boundary

1. Directly open `/admin/users`.
2. Directly open `/admin/permissions/matrix`.
3. Try to call an admin-only action through visible UI if any appears.

Expected: admin pages do not render; no admin-only action is available.


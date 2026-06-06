# Contributor UI Scenarios

## Intent

Validate that `contributor` is preparation-only and can work through onboarding/personal tasks without active-user access to the main quality workspace.

## Expected Account State

`CONTRIBUTOR_USER` should have:

- `role = contributor`
- `status = PREPARATION`
- `active = true`
- At least one assigned journey or personal task

## Expected Navigation

Expected accessible routes:

- `/me/tasks`
- `/me/journeys`
- `/me/dashboard`
- `/me/preferences`

Expected denied due to active-only route scope:

- `/me/idp`
- `/me/idp/history`
- `/work/projects`
- `/work/tasks`
- `/work/stories`
- `/work/bugs`
- `/team/resources`
- `/test/cases`
- `/test/suites`
- `/test/runs`
- `/quality/governance`
- `/quality/reports`
- `/admin/*`

## Scenarios

### CON-01: Preparation landing

1. Log in as `CONTRIBUTOR_USER`.
2. Confirm landing page is `/me/tasks` or another allowed My Work page.
3. Confirm active-only workspace sections are hidden or inaccessible.

Expected: contributor stays inside preparation-accessible My Work routes.

### CON-02: My tasks workflow

1. Open `/me/tasks`.
2. Create a personal task.
3. Edit the personal task.
4. Delete the personal task.

Expected: personal task workflow succeeds.

### CON-03: Journey access

1. Open `/me/journeys`.
2. Open an assigned journey.
3. Complete or update a safe test task if available.

Expected: assigned journey is visible and usable.

### CON-04: Active workspace boundary

1. Directly open `/work/tasks`.
2. Directly open `/work/projects`.
3. Directly open `/test/cases`.
4. Directly open `/quality/reports`.

Expected: all active-only routes redirect to `/me/tasks` or another allowed landing page.

### CON-05: Status transition watch

1. Ask an admin to activate the contributor only in a disposable test environment.
2. Log in again as the same user after status changes to `ACTIVE`.
3. Repeat CON-04.

Expected: document whether the role should remain preparation-only after activation. If active contributor can enter work routes because route scope checks only account status, record it as a product decision or RBAC gap.


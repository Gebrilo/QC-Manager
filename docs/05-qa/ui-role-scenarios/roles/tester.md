# Tester UI Scenarios

## Intent

Validate that `tester` keeps legacy editor behavior for projects, tasks, bugs, test authoring, test execution, and reports without admin or team-manager privileges.

## Expected Navigation

Visible sections: My Work and Quality.

Expected accessible routes:

- `/me/tasks`
- `/me/dashboard`
- `/work/projects`
- `/work/tasks`
- `/work/stories`
- `/work/bugs`
- `/test/cases`
- `/test/suites`
- `/test/runs`
- `/test/results`
- `/quality/reports`

Expected denied routes:

- `/quality/governance` if `qc.governance.view` is not customized for tester.
- `/team/resources` management actions beyond read-only route access.
- `/admin/*`

## Scenarios

### TST-01: Tester navigation

1. Log in as `TESTER_USER`.
2. Confirm My Work and Quality sections are visible.
3. Confirm Manage and Admin sections are hidden.
4. Open each expected accessible route.

Expected: tester can reach work and test execution pages.

### TST-02: Work creation and editing

1. Create a task from `/work/tasks/create`.
2. Edit the created task.
3. Create a bug from `/work/bugs/create`.
4. Edit the created bug.
5. Try to delete the task and bug.

Expected: create/edit actions succeed. Delete actions are hidden or denied unless custom permissions grant them.

### TST-03: Test authoring

1. Create a test case from `/test/cases/create`.
2. Edit the test case.
3. Create a test suite from `/test/suites/create`.
4. Add the test case to the suite.
5. Try to delete the case or suite.

Expected: create/edit succeeds. Delete is hidden or denied unless custom permissions grant it.

### TST-04: Test execution and results

1. Create a test run from `/test/runs/create`.
2. Add or edit execution results where the UI supports it.
3. Upload test results through the available upload UI.
4. Try to delete a test run or uploaded result.

Expected: create/upload/edit actions succeed. Delete actions are hidden or denied unless custom permissions grant them.

### TST-05: Boundary checks

1. Directly open `/admin/users`.
2. Directly open `/admin/roles`.
3. Directly open `/dashboards/team-manager`.
4. Directly open `/team/journeys`.

Expected: all routes are denied or redirect.


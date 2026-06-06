# User Legacy Alias UI Scenarios

## Intent

Validate that legacy `user` accounts still behave like `tester` accounts. The RBAC catalog defines `user` as an alias for `tester`.

## Expected Navigation

Same baseline as `tester`:

- My Work and Quality are visible.
- Manage and Admin are hidden.
- Work, bug, test case, test suite, test run, results, and reports pages are accessible.

## Scenarios

### USER-01: Alias navigation parity

1. Log in as `USER_ALIAS_USER`.
2. Confirm My Work and Quality sections are visible.
3. Confirm Manage and Admin sections are hidden.
4. Open the accessible routes listed in `tester.md`.

Expected: navigation matches `tester`.

### USER-02: Legacy work creation

1. Create a task.
2. Edit the created task.
3. Create a bug.
4. Edit the created bug.

Expected: behavior matches `tester`.

### USER-03: Legacy testing workflow

1. Create a test case.
2. Edit the test case.
3. Create a test suite.
4. Create a test run or upload results where available.

Expected: behavior matches `tester`.

### USER-04: Boundary checks

1. Directly open `/admin/users`.
2. Directly open `/team/journeys`.
3. Directly open `/dashboards/team-manager`.

Expected: admin and team-manager-only routes are denied or redirect.


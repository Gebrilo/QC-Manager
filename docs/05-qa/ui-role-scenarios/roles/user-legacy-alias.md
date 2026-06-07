# User Legacy Alias Role — User Story & Test Scenarios

## User Story

**As a** User (legacy role: `user`, alias for `tester`) with `status = ACTIVE`,
**I want** to continue using the legacy `user` role with all the same capabilities as a `tester`,
**so that** backward compatibility is maintained without requiring role migration for existing users.

---

## Role Profile

| Property | Value |
|----------|-------|
| Role key | `user` (legacy alias) |
| Status scope | `ACTIVE_ONLY` — all routes require `status = ACTIVE` |
| Inherits | Same permissions as `tester` |
| Also applies to | _(none)_ — this is an alias, not a parent |

> **Note:** The `user` role is defined as an alias for `tester` in the RBAC catalog. This means `user` has identical permissions to `tester`. If any behavior differs, it is a compatibility bug.

---

## Permission Parity with Tester

The `user` role should behave **identically** to the `tester` role. See `tester.md` for full permission tables.

### Permissions Granted (same as tester)

| Area | Allowed |
|------|---------|
| Dashboard | View dashboard, My Dashboard |
| My Work | View / Create / Edit / Delete own tasks |
| Tasks | View / Create / Edit (global) |
| Projects | View |
| Resources | View |
| Bugs | View / Create |
| Test Cases | View / Create / Edit |
| Test Suites | View / Create / Edit |
| Test Executions | View / Create |
| Test Results | Upload |
| Reports | View / Generate |

### Permissions Denied (same as tester)

| Area | Blocked |
|------|---------|
| Tasks | Delete (global), change priority |
| Bugs | Edit / Delete |
| Test Cases | Delete, Approve, Clone, Import/Export, Edit Steps |
| Test Suites | Delete, Reorder |
| Test Executions | Edit / Delete |
| Test Results | Delete |
| Governance | View, manage gates, approve releases |
| Reports | Export |
| Resources | Create / Edit / Delete |
| Projects | Create / Edit / Delete |
| Manage section | Task history, team journeys, IDP management |
| Admin section | All `/admin/*` routes |
| PM / Team-Manager dashboards | Hidden |

---

## Acceptance Criteria

### AC-1: Navigation parity
- Navigation matches `tester` exactly.
- My Work and Quality nav sections are visible.
- Manage and Admin nav sections are **not** visible.

### AC-2: Forbidden routes redirect
- Directly navigating to any tester-forbidden route redirects to `/me/tasks` (or shows a 403/access-denied page), never renders the target page.

### AC-3: Create/Edit actions succeed (parity with tester)
- User can create and edit tasks, bugs, test cases, test suites, and test runs via the UI.

### AC-4: Delete/Destructive actions are blocked (parity with tester)
- Delete buttons are hidden or disabled for bugs, test cases, test suites, and global test executions.
- If a delete API call is made manually (e.g. via network tab), the API returns 403.

### AC-5: Test result upload works (parity with tester)
- User can reach `/test/results/upload` and upload a result file successfully.

### AC-6: Reports are viewable and generatable but not exportable (parity with tester)
- `/quality/reports` renders and allows report generation.
- Export/download button is hidden or returns 403.

### AC-7: ACTIVE_ONLY scope is enforced (parity with tester)
- If the same user's status is changed to anything other than `ACTIVE`, all routes with `ACTIVE_ONLY` scope redirect away.

### AC-8: Alias behavior matches tester
- All scenarios from `tester.md` pass for `user` role without modification.
- No behavioral differences exist between `user` and `tester` roles.

---

## Test Scenarios

> **Setup:** Log in as a user with `role = user` (legacy alias) and `status = ACTIVE`.
> See `docs/05-qa/ui-role-scenarios/setup.md` for credential setup.

---

### USER-01 — Alias Navigation Parity

**Covers:** AC-1, AC-2, AC-8

1. Log in as `USER_ALIAS_USER` (role: `user`).
2. Inspect the sidebar — verify only **My Work** and **Quality** sections are present.
3. Confirm **Manage** and **Admin** sections are absent.
4. Click through each accessible route listed in `tester.md`:
   - `/me/dashboard`
   - `/me/tasks`
   - `/work/projects`
   - `/work/tasks`
   - `/work/stories`
   - `/work/bugs`
   - `/test/cases`
   - `/test/suites`
   - `/test/runs`
   - `/test/results`
   - `/quality/reports`

**Expected:** Every listed route loads successfully (HTTP 200, page content renders). Navigation matches `tester` exactly.

5. Directly navigate to each forbidden route listed in `tester.md`:
   - `/quality/governance`
   - `/dashboards/pm`
   - `/dashboards/team-manager`
   - `/team/history`
   - `/team/journeys`
   - `/team/idp`
   - `/admin/users`
   - `/admin/roles`
   - `/admin/teams`
   - `/admin/integrations/tuleap`
   - `/admin/permissions/matrix`

**Expected:** Each forbidden route redirects to `/me/tasks` or renders an access-denied message — never the target page content.

---

### USER-02 — Legacy Work Creation

**Covers:** AC-3, AC-4, AC-8

1. Navigate to `/work/tasks/create`.
2. Fill in required fields and submit.
3. Open the created task (`/work/tasks/[id]`).
4. Click **Edit** and change the task title. Save.
5. Attempt to delete the task (look for a Delete button or kebab menu option).
6. Navigate to `/work/bugs/create`.
7. Fill in required fields (title, project, severity) and submit.
8. Open the created bug (`/work/bugs/[id]`).
9. Verify there is **no Edit button**.
10. Verify there is **no Delete button**.

**Expected:** Task create and edit succeed; delete is absent. Bug creation succeeds; edit and delete are absent. Behavior matches `tester`.

---

### USER-03 — Legacy Testing Workflow

**Covers:** AC-3, AC-4, AC-5, AC-8

1. Navigate to `/test/cases/create`.
2. Fill in required fields and submit.
3. Open the created case (`/test/cases/[id]`).
4. Click **Edit** and modify the description. Save.
5. Verify there is **no Delete**, **Approve**, **Clone**, or **Export** button.
6. Navigate to `/test/suites/create`.
7. Create a new suite with a name and description.
8. Open the suite (`/test/suites/[id]`).
9. Add the test case created above to the suite.
10. Verify there is **no Delete** or **Reorder** control.
11. Navigate to `/test/runs/create`.
12. Select a project and test suite, then create the run.
13. Open the run (`/test/runs/[id]`).
14. Verify there is **no Delete** control.
15. Navigate to `/test/results/upload`.
16. Select a project and upload a valid test results file.

**Expected:** All create/edit actions succeed. Delete, approve, export, and reorder controls are absent. Upload completes successfully. Behavior matches `tester`.

---

### USER-04 — Boundary Checks

**Covers:** AC-2, AC-8

1. Directly open `/admin/users`.
2. Directly open `/team/journeys`.
3. Directly open `/dashboards/team-manager`.
4. Directly open `/quality/governance`.
5. Directly open `/team/idp`.

**Expected:** Admin and team-manager-only routes are denied or redirect. Behavior matches `tester`.

---

### USER-05 — Reports Access

**Covers:** AC-6, AC-8

1. Navigate to `/quality/reports`.
2. Confirm reports list renders.
3. Generate a report if the UI provides a **Generate** action.
4. Look for an **Export** or **Download** button.
5. Try to click export/download if visible.

**Expected:** Reports page and generation work. Export/Download is absent or returns 403. Behavior matches `tester`.

---

### USER-06 — Direct API Parity Check

**Covers:** AC-4, AC-8

1. Open browser DevTools Network tab.
2. Navigate to `/work/bugs`.
3. Open a bug detail page.
4. Issue a `PATCH /api/bugs/[id]` request from the console.
5. Issue a `DELETE /api/bugs/[id]` request from the console.
6. Navigate to `/test/cases`.
7. Open a test case detail page.
8. Issue a `DELETE /api/test-cases/[id]` request from the console.

**Expected:** All direct API calls for denied actions return 403. Behavior matches `tester`.

---

### USER-07 — ACTIVE_ONLY Scope Enforcement

**Covers:** AC-7, AC-8

1. Using admin credentials, change `USER_ALIAS_USER.status` to `PREPARATION` (or `SUSPENDED`).
2. Log in as `USER_ALIAS_USER` again (or refresh the session).
3. Attempt to navigate to `/work/tasks`, `/test/runs`, `/quality/reports`.

**Expected:** All `ACTIVE_ONLY` routes redirect away. Only non-scoped routes (e.g. `/me/tasks`) remain accessible.

4. Restore status to `ACTIVE` and verify full access returns.

---

### USER-08 — Comparison with Tester

**Covers:** AC-8

1. Run all scenarios from `tester.md` (TST-01 through TST-10) with `USER_ALIAS_USER`.
2. Compare results to `TESTER_USER`.

**Expected:** All scenarios pass with identical results. Any difference is a compatibility bug.

---

## Pass Criteria

| # | Criterion |
|---|-----------|
| 1 | Navigation matches `tester` exactly. |
| 2 | All forbidden routes redirect or show access-denied without rendering content. |
| 3 | Create and edit actions for tasks, bugs, test cases, test suites, and test runs complete without error. |
| 4 | Delete, approve, export, and triage controls are absent from the UI for all tester-denied permissions. |
| 5 | Direct API calls for denied actions return 403. |
| 6 | Test result upload completes successfully. |
| 7 | Reports page and generation work; export/download is absent or returns 403. |
| 8 | A non-ACTIVE user is blocked from all ACTIVE_ONLY routes. |
| 9 | All tester scenarios (TST-01 through TST-10) pass for `user` role without modification. |
| 10 | No behavioral differences exist between `user` and `tester` roles. |
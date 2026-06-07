# Tester Role — User Story & Test Scenarios

## User Story

**As a** Tester (role: `tester`) with `status = ACTIVE`,  
**I want** to be able to author and execute tests, track bugs, create tasks, and view reports,  
**so that** I can perform my full quality-assurance workflow without needing admin or team-management privileges.

---

## Role Profile

| Property | Value |
|----------|-------|
| Role key | `tester` |
| Status scope | `ACTIVE_ONLY` — all routes require `status = ACTIVE` |
| Inherits | _(nothing)_ |
| Also applies to | `user` role (legacy alias — same permissions) |

### Permissions Granted

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

### Permissions Denied

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

### AC-1: Navigation
- My Work and Quality nav sections are visible.
- Manage and Admin nav sections are **not** visible.
- All expected routes render without redirect for an `ACTIVE` tester user.

### AC-2: Forbidden routes redirect
- Directly navigating to any route in the "Permissions Denied" table redirects to `/me/tasks` (or shows a 403/access-denied page), never renders the target page.

### AC-3: Create/Edit actions succeed
- Tester can create and edit tasks, bugs, test cases, test suites, and test runs via the UI.

### AC-4: Delete/Destructive actions are blocked
- Delete buttons are hidden or disabled for bugs, test cases, test suites, and global test executions.
- If a delete API call is made manually (e.g. via network tab), the API returns 403.

### AC-5: Test result upload works
- Tester can reach `/test/results/upload` and upload a result file successfully.

### AC-6: Reports are viewable and generatable but not exportable
- `/quality/reports` renders and allows report generation.
- Export/download button is hidden or returns 403.

### AC-7: ACTIVE_ONLY scope is enforced
- If the same user's status is changed to anything other than `ACTIVE`, all routes with `ACTIVE_ONLY` scope redirect away.

---

## Test Scenarios

> **Setup:** Log in as a user with `role = tester` and `status = ACTIVE`.  
> See `docs/05-qa/ui-role-scenarios/setup.md` for credential setup.

---

### TST-01 — Navigation Smoke Test

**Covers:** AC-1, AC-2

1. Log in as `TESTER_USER`.
2. Inspect the sidebar — verify only **My Work** and **Quality** sections are present.
3. Confirm **Manage** and **Admin** sections are absent.
4. Click through each expected route:
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

**Expected:** Every listed route loads successfully (HTTP 200, page content renders).

5. Directly navigate to each forbidden route:
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

### TST-02 — Task Workflow

**Covers:** AC-3, AC-4

1. Navigate to `/work/tasks/create`.
2. Fill in required fields and submit.
3. Open the created task (`/work/tasks/[id]`).
4. Click **Edit** and change the task title. Save.
5. Attempt to delete the task (look for a Delete button or kebab menu option).

**Expected:** Create and edit succeed. Delete option is absent from the UI; if navigating to a delete endpoint directly, API returns 403.

---

### TST-03 — Bug Workflow

**Covers:** AC-3, AC-4

1. Navigate to `/work/bugs/create`.
2. Fill in required fields (title, project, severity) and submit.
3. Open the created bug (`/work/bugs/[id]`).
4. Verify there is **no Edit button** (tester lacks `qc.bugs.edit`).
5. Verify there is **no Delete button**.
6. Optionally issue a `PATCH /api/bugs/[id]` request from the browser network tab.

**Expected:** Bug creation succeeds. Edit and Delete actions are absent in the UI. Direct API edit/delete returns 403.

---

### TST-04 — Test Case Authoring

**Covers:** AC-3, AC-4

1. Navigate to `/test/cases/create`.
2. Fill in required fields and submit.
3. Open the created case (`/test/cases/[id]`).
4. Click **Edit** and modify the description. Save.
5. Check for a **Delete** button, **Approve** button, **Clone** button, and **Export** option.
6. Check if test step editing UI is exposed.

**Expected:**
- Create and edit succeed.
- Delete, Approve, Clone, Export, and Edit Steps controls are absent or disabled.

---

### TST-05 — Test Suite Management

**Covers:** AC-3, AC-4

1. Navigate to `/test/suites/create`.
2. Create a new suite with a name and description.
3. Open the suite (`/test/suites/[id]`).
4. Add the test case created in TST-04 to the suite.
5. Try to reorder test cases if a drag-handle or reorder control is shown.
6. Try to delete the suite.

**Expected:**
- Create and edit succeed.
- Suite addition succeeds.
- Reorder UI is absent (no `qc.testsuites.reorder`).
- Delete option is absent or returns 403.

---

### TST-06 — Test Run Execution

**Covers:** AC-3, AC-4

1. Navigate to `/test/runs/create`.
2. Select a project and test suite, then create the run.
3. Open the run (`/test/runs/[id]`).
4. Record results for individual test cases if the UI supports inline result entry.
5. Try to delete the test run.

**Expected:**
- Test run creation succeeds.
- Result recording (if UI present) succeeds.
- Delete option is absent or returns 403.

---

### TST-07 — Test Result Upload

**Covers:** AC-5

1. Navigate to `/test/results/upload`.
2. Select a project.
3. Upload a valid test results file (CSV or supported format).
4. Optionally provide an execution date in the date picker.
5. Submit the upload.

**Expected:** Upload completes successfully and results appear in `/test/results`.

---

### TST-08 — Reports Access

**Covers:** AC-6

1. Navigate to `/quality/reports`.
2. Confirm reports list renders.
3. Generate a report if the UI provides a **Generate** action.
4. Look for an **Export** or **Download** button.

**Expected:**
- Reports page and generation work.
- Export/Download is absent or returns 403 (no `qc.reports.export`).

---

### TST-09 — Governance Is Blocked

**Covers:** AC-1, AC-2

1. Directly navigate to `/quality/governance`.

**Expected:** Redirected away — governance page does not render (tester lacks `qc.governance.view`).

---

### TST-10 — ACTIVE_ONLY Scope Enforcement

**Covers:** AC-7

1. Using admin credentials, change `TESTER_USER.status` to `PREPARATION` (or `SUSPENDED`).
2. Log in as `TESTER_USER` again (or refresh the session).
3. Attempt to navigate to `/work/tasks`, `/test/runs`, `/quality/reports`.

**Expected:** All `ACTIVE_ONLY` routes redirect away. Only non-scoped routes (e.g. `/me/tasks`) remain accessible.

4. Restore status to `ACTIVE` and verify full access returns.

---

## Pass Criteria

| # | Criterion |
|---|-----------|
| 1 | All expected routes render (HTTP 200) for an ACTIVE tester. |
| 2 | All forbidden routes redirect or show access-denied without rendering content. |
| 3 | Create and edit actions for tasks, test cases, test suites, and test runs complete without error. |
| 4 | Delete, approve, export, and triage controls are absent from the UI for all tester-denied permissions. |
| 5 | Direct API calls for denied actions return 403. |
| 6 | Test result upload completes successfully. |
| 7 | A non-ACTIVE tester is blocked from all ACTIVE_ONLY routes. |

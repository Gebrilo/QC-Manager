# Team Manager Role — User Story & Test Scenarios

## User Story

**As a** Team Manager (role: `team_manager`) with `status = ACTIVE`,
**I want** to be able to manage my team's resources, view team-scoped artifacts, manage team journeys and development plans, and perform quality workflows,
**so that** I can lead my team effectively while respecting administrative boundaries.

---

## Role Profile

| Property | Value |
|----------|-------|
| Role key | `team_manager` |
| Status scope | `ACTIVE_ONLY` — all routes require `status = ACTIVE` |
| Inherits | _(nothing)_ |
| Also applies to | `manager` role (legacy alias — same permissions) |

### Permissions Granted

| Area | Allowed |
|------|---------|
| Dashboard | View dashboard, My Dashboard, Team Manager Dashboard |
| Team Resources | View / Create / Edit / Delete (team-scoped) |
| Team Journeys | View / Edit (team-scoped) |
| Team IDP | View / Edit (team-scoped) |
| Team History | View (team-scoped) |
| Projects | View |
| Tasks | View / Create / Edit / Delete (team-scoped) |
| Stories | View / Create / Edit / Delete (team-scoped) |
| Bugs | View / Create / Edit / Delete (team-scoped) |
| Test Cases | View / Create / Edit / Delete (team-scoped) |
| Test Suites | View / Create / Edit / Delete (team-scoped) |
| Test Executions | View / Create / Edit / Delete (team-scoped) |
| Quality Governance | View / Manage gates / Approve releases (team-scoped) |
| Reports | View / Generate / Export (team-scoped) |

### Permissions Denied

| Area | Blocked |
|------|---------|
| Admin section | All `/admin/*` routes |
| Other teams | View / Edit any resource, journey, IDP, task, bug, test artifact from other teams |
| Global resources | Create / Edit / Delete global/non-team-scoped resources |
| Admin-only operations | User management, role management, team creation, permission matrix editing |

---

## Acceptance Criteria

### AC-1: Navigation
- My Work, Quality, and Manage nav sections are visible.
- Admin nav section is **not** visible.
- Team Manager Dashboard is accessible via `/dashboards/team-manager`.
- All expected routes render without redirect for an `ACTIVE` team manager user.

### AC-2: Forbidden routes redirect
- Directly navigating to any route in the "Permissions Denied" table redirects to `/me/tasks` (or shows a 403/access-denied page), never renders the target page.

### AC-3: Team-scoped resources are manageable
- Team manager can create, edit, and delete resources for their team.
- Other team resources are not visible or accessible.

### AC-4: Team work management works
- Team manager can view, create, edit, and delete team tasks.
- Other team tasks are not visible or accessible.

### AC-5: Team quality workflows succeed
- Team manager can view, create, edit, and delete team bugs, test cases, test suites, and test executions.
- Other team quality artifacts are not visible or accessible.

### AC-6: Team journeys and development plans are accessible
- Team manager can view and edit team member journeys.
- Team manager can view and edit team member IDPs.
- Other team journeys and IDPs are not accessible.

### AC-7: Quality governance is manageable
- Team manager can view governance metrics.
- Team manager can manage gates.
- Team manager can approve releases (team-scoped).

### AC-8: Admin boundary is enforced
- All `/admin/*` routes are blocked.
- Admin-specific controls are hidden or denied.

### AC-9: Team scope is enforced
- Direct access to other team artifacts is denied.
- API calls for other team artifacts return 403.

### AC-10: Role alias compatibility is maintained
- `manager` role behaves identically to `team_manager`.
- Any exact role checks for `manager` also work for `team_manager`.

### AC-11: ACTIVE_ONLY scope is enforced
- If the same user's status is changed to anything other than `ACTIVE`, all routes with `ACTIVE_ONLY` scope redirect away.

---

## Test Scenarios

> **Setup:** Log in as a user with `role = team_manager` and `status = ACTIVE`.
> See `docs/05-qa/ui-role-scenarios/setup.md` for credential setup.

---

### TM-01 — Team Manager Navigation Smoke Test

**Covers:** AC-1, AC-2

1. Log in as `TEAM_MANAGER_USER`.
2. Inspect the sidebar — verify **My Work**, **Quality**, and **Manage** sections are present.
3. Confirm **Admin** section is absent.
4. Click through each expected route:
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

**Expected:** Every listed route loads successfully (HTTP 200, page content renders).

5. Directly navigate to each forbidden route:
   - `/admin/users`
   - `/admin/teams`
   - `/admin/roles`
   - `/admin/permissions/matrix`
   - `/admin/integrations/tuleap`

**Expected:** Each forbidden route redirects to `/me/tasks` or renders an access-denied message — never the target page content.

---

### TM-02 — Team-Scoped Resources

**Covers:** AC-3, AC-9

1. Open `/team/resources`.
2. Confirm Team A resources are visible.
3. Confirm Team B-only resources are not visible.
4. Click **Create Resource**.
5. Fill in required fields and create a resource for a Team A user.
6. Open the created resource and edit a field (e.g., description).
7. Delete the created resource.
8. Try to navigate directly to a Team B resource URL.

**Expected:** Team A resources are manageable; Team B resources are hidden or inaccessible. Direct Team B resource access returns 403.

---

### TM-03 — Team Work Management

**Covers:** AC-4, AC-9

1. Open `/work/tasks`.
2. Confirm Team A tasks are visible.
3. Confirm Team B-only tasks are not visible.
4. Click **Create Task**.
5. Fill in required fields and create a task for Team A.
6. Open the created task and edit a field.
7. Delete the created task.
8. Open `/work/stories`.
9. Confirm Team A stories are visible.
10. Create, edit, and delete a Team A story.
11. Try to navigate directly to a known Team B task detail URL.

**Expected:** Team A create/edit/delete succeeds; Team B direct access is denied, hidden, or not found.

---

### TM-04 — Team Quality Workflows

**Covers:** AC-5, AC-9

1. Open `/work/bugs`.
2. Confirm Team A bugs are visible.
3. Click **Create Bug**.
4. Fill in required fields and create a bug for Team A.
5. Open the created bug and edit a field.
6. Delete the created bug.
7. Open `/test/cases`.
8. Confirm Team A test cases are visible.
9. Click **Create Test Case**.
10. Fill in required fields and create a test case for Team A.
11. Edit the test case.
12. Delete the test case.
13. Repeat for test suites (`/test/suites`) and test executions (`/test/runs`).

**Expected:** Team-scoped quality actions (create/edit/delete) succeed for Team A only. Team B artifacts are inaccessible.

---

### TM-05 — Team Journeys and Development Plans

**Covers:** AC-6, AC-9, AC-10

1. Open `/team/journeys`.
2. Confirm Team A member journeys are visible.
3. Open a Team A member journey.
4. Edit the journey (e.g., add a comment or update a field).
5. Open `/team/idp`.
6. Confirm Team A member development plans are visible.
7. Open a Team A member development plan.
8. Add a comment or update a safe test task in that plan.
9. Try to navigate directly to a Team B member journey URL.
10. Try to navigate directly to a Team B member IDP URL.

**Expected:** Team A journey and development plan access succeeds. Team B access is denied or hidden.

**Note:** If this fails for `team_manager` while the same scenario passes for `manager`, record it as a role-alias mismatch. Some API paths still check exact `manager` role.

---

### TM-06 — Quality Governance Management

**Covers:** AC-7

1. Open `/quality/governance`.
2. Confirm governance metrics render for Team A.
3. Identify a quality gate (e.g., "Test Coverage").
4. Change the gate state (e.g., from "Not Met" to "Met") if UI supports it.
5. Navigate to release approval section if available.
6. Approve a pending release for Team A if available.

**Expected:** Governance metrics are viewable. Gate management and release approval controls are present and functional for Team A.

---

### TM-07 — Reports Generation and Export

**Covers:** AC-7

1. Open `/quality/reports`.
2. Confirm reports page renders.
3. Click **Generate Report**.
4. Select Team A as scope and generate a report.
5. Click **Export** or **Download** on the generated report.

**Expected:** Report generation and export succeed for Team A scope.

---

### TM-08 — Admin Boundary

**Covers:** AC-2, AC-8

1. Directly open `/admin/users`.
2. Directly open `/admin/permissions/matrix`.
3. Directly open `/admin/teams`.
4. Directly open `/admin/integrations/tuleap`.
5. Verify no admin-specific controls are visible in any accessible page.

**Expected:** Admin pages do not render; no admin-only action is available.

---

### TM-09 — Team Dashboard Access

**Covers:** AC-1

1. Open `/dashboards/team-manager`.
2. Confirm dashboard renders with Team A metrics.
3. Verify metrics are scoped to Team A (no Team B data).

**Expected:** Team manager dashboard renders with team-scoped metrics only.

---

### TM-10 — Role Alias Compatibility Check

**Covers:** AC-10

1. Log in as `MANAGER_ALIAS_USER` (role: `manager`).
2. Run TM-02 through TM-05 scenarios.
3. Compare results to `TEAM_MANAGER_USER`.

**Expected:** Both roles behave the same from the user's perspective. Any difference is a compatibility bug unless deliberately configured through custom role permissions.

---

### TM-11 — Team History Access

**Covers:** AC-1

1. Open `/team/history`.
2. Confirm team history renders for Team A.
3. Verify task history and changes are visible.

**Expected:** Team history is accessible and shows team-scoped data.

---

### TM-12 — ACTIVE_ONLY Scope Enforcement

**Covers:** AC-11

1. Using admin credentials, change `TEAM_MANAGER_USER.status` to `PREPARATION` (or `SUSPENDED`).
2. Log in as `TEAM_MANAGER_USER` again (or refresh the session).
3. Attempt to navigate to `/dashboards/team-manager`, `/team/resources`, `/quality/governance`.

**Expected:** All `ACTIVE_ONLY` routes redirect away. Only non-scoped routes (if any) remain accessible.

4. Restore status to `ACTIVE` and verify full access returns.

---

## Pass Criteria

| # | Criterion |
|---|-----------|
| 1 | All expected routes render (HTTP 200) for an ACTIVE team manager. |
| 2 | All forbidden routes redirect or show access-denied without rendering content. |
| 3 | Team resources can be created, edited, and deleted. |
| 4 | Team tasks and stories can be created, edited, and deleted. |
| 5 | Team quality artifacts (bugs, test cases, suites, executions) can be created, edited, and deleted. |
| 6 | Team journeys and development plans are accessible and editable. |
| 7 | Quality governance gates can be managed and releases can be approved. |
| 8 | Reports can be generated and exported. |
| 9 | Admin routes are blocked. |
| 10 | Other team artifacts are not visible or accessible. |
| 11 | `manager` role behaves identically to `team_manager`. |
| 12 | Team dashboard renders with team-scoped metrics. |
| 13 | Team history is accessible. |
| 14 | A non-ACTIVE team manager is blocked from all ACTIVE_ONLY routes. |
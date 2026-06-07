# Project Manager Role — User Story & Test Scenarios

## User Story

**As a** Project Manager (role: `pm`) with `status = ACTIVE`,
**I want** to be able to access PM dashboards, view project-scoped artifacts, read quality governance metrics, and export reports,
**so that** I can monitor project health and quality without needing team management or admin privileges.

---

## Role Profile

| Property | Value |
|----------|-------|
| Role key | `pm` |
| Status scope | `ACTIVE_ONLY` — all routes require `status = ACTIVE` |
| Inherits | _(nothing)_ |
| Also applies to | _(none)_ |

### Permissions Granted

| Area | Allowed |
|------|---------|
| Dashboard | View dashboard, My Dashboard, PM Dashboard |
| Projects | View (project-scoped) |
| Stories | View (project-scoped) |
| Team Resources | View (project-scoped) |
| Quality Governance | View (read-only metrics) |
| Reports | View / Export |
| Tasks | View (project-scoped) |
| Bugs | View (project-scoped) |

### Permissions Denied

| Area | Blocked |
|------|---------|
| Projects | Create / Edit / Delete |
| Stories | Create / Edit / Delete |
| Team Resources | Create / Edit / Delete |
| Quality Governance | Manage gates, approve releases |
| Reports | Generate new reports |
| Tasks | Create / Edit / Delete (project-scoped) |
| Bugs | Create / Edit / Delete (project-scoped) |
| Test Cases | View / Create / Edit / Delete |
| Test Suites | View / Create / Edit / Delete |
| Test Executions | View / Create / Edit / Delete |
| Team Manager Dashboard | View |
| Team Journeys | View / Edit |
| Team IDP | View / Edit |
| Team History | View |
| Admin section | All `/admin/*` routes |

---

## Acceptance Criteria

### AC-1: Navigation
- My Work and Quality nav sections are visible.
- Manage and Admin nav sections are **not** visible.
- PM Dashboard is accessible via `/dashboards/pm`.
- All expected routes render without redirect for an `ACTIVE` PM user.

### AC-2: Forbidden routes redirect
- Directly navigating to any route in the "Permissions Denied" table redirects to `/me/tasks` (or shows a 403/access-denied page), never renders the target page.

### AC-3: PM dashboard is project-scoped
- PM can access `/dashboards/pm`.
- PM sees only projects they are manager for.
- Other projects do not appear.

### AC-4: Project and story read access works
- PM can view project details and stories for managed projects.
- Create/edit/delete project controls are hidden or denied.

### AC-5: Resource read access works
- PM can view resources for managed projects.
- Create/edit/delete resource controls are hidden or denied.

### AC-6: Governance is read-only
- PM can view governance metrics.
- Gate management and release approval controls are hidden or denied.

### AC-7: Reports can be viewed and exported
- PM can view reports page.
- Export/download buttons work.
- Generate new report controls are hidden or denied.

### AC-8: Non-manager boundary is enforced
- Team Manager Dashboard is not accessible.
- Team journeys and IDP are not accessible.
- Admin routes are not accessible.

### AC-9: Scoped artifact behavior is consistent
- Routes requiring exact unscoped permissions (e.g., `qc.tasks.view`) work correctly with scoped permissions (e.g., `qc.tasks.view_any`).
- Data is correctly scoped to managed projects.

### AC-10: ACTIVE_ONLY scope is enforced
- If the same user's status is changed to anything other than `ACTIVE`, all routes with `ACTIVE_ONLY` scope redirect away.

---

## Test Scenarios

> **Setup:** Log in as a user with `role = pm` and `status = ACTIVE`.
> See `docs/05-qa/ui-role-scenarios/setup.md` for credential setup.

---

### PM-01 — PM Dashboard Access

**Covers:** AC-1, AC-3

1. Log in as `PM_USER`.
2. Open `/dashboards/pm`.
3. Confirm Project A appears.
4. Confirm Project B does not appear unless `PM_USER` is also manager for Project B.
5. Verify dashboard metrics are relevant to managed projects only.

**Expected:** PM dashboard is accessible and project-scoped.

---

### PM-02 — Project and Story Visibility

**Covers:** AC-4

1. Open `/work/projects`.
2. Open Project A detail page.
3. Confirm project details render.
4. Verify there is **no Create Project** button or it is disabled.
5. Verify there is **no Edit Project** button or it is disabled.
6. Verify there is **no Delete Project** button or it is disabled.
7. Open `/work/stories`.
8. Confirm Project A stories are visible.
9. Verify story create/edit/delete controls are hidden or denied.
10. Optionally navigate to a create/edit endpoint directly and confirm 403.

**Expected:** Project/story read access works. Create/edit/delete project controls are hidden or denied.

---

### PM-03 — Resource Read Boundary

**Covers:** AC-5

1. Open `/team/resources`.
2. Search for resources on Project A.
3. Confirm resources are visible.
4. Verify there is **no Create Resource** button or it is disabled.
5. Verify there is **no Edit** button on existing resources or it is disabled.
6. Verify there is **no Delete** button on existing resources or it is disabled.
7. Try to navigate to a resource create/edit endpoint directly.

**Expected:** Resource read access is allowed; create/edit/delete controls are hidden or denied. Direct API calls return 403.

---

### PM-04 — Quality Governance and Reports

**Covers:** AC-6, AC-7

1. Open `/quality/governance`.
2. Confirm read-only governance metrics render.
3. Verify there are no gate management controls (e.g., change gate state).
4. Verify there are no release approval controls.
5. Try to interact with any gate or release approval UI (if visible).
6. Open `/quality/reports`.
7. Confirm reports list renders.
8. Select an existing project report.
9. Click **Export** or **Download** if available.
10. Verify export/download succeeds.
11. Verify there is **no Generate New Report** button or it is disabled.

**Expected:** Read/export actions are allowed where present; gate management, release approval, and report generation are hidden or denied.

---

### PM-05 — Non-Manager Boundary

**Covers:** AC-1, AC-2, AC-8

1. Directly open `/dashboards/team-manager`.
2. Directly open `/team/journeys`.
3. Directly open `/team/idp`.
4. Directly open `/team/history`.
5. Directly open `/admin/users`.
6. Directly open `/admin/roles`.
7. Directly open `/admin/teams`.
8. Directly open `/admin/permissions/matrix`.
9. Directly open `/admin/integrations/tuleap`.

**Expected:** All routes redirect to an allowed landing page or show a controlled denied state.

---

### PM-06 — Scoped Artifact Route Watch

**Covers:** AC-9

1. Directly open `/work/tasks`.
2. Confirm page renders with Project A tasks visible.
3. Confirm tasks for non-managed projects are not visible.
4. Directly open `/work/bugs`.
5. Confirm page renders with Project A bugs visible.
6. Confirm bugs for non-managed projects are not visible.
7. Directly open `/test/runs`.
8. Confirm page renders with Project A test runs visible.
9. Confirm test runs for non-managed projects are not visible.

**Expected:** If pages render, they must show only permitted project-scope data. If pages redirect because exact unscoped permission keys are required, record as an RBAC/UI mapping issue rather than a data leak.

---

### PM-07 — Test Artifact Boundary

**Covers:** AC-2

1. Directly open `/test/cases`.
2. Confirm redirect or access-denied message.
3. Directly open `/test/suites`.
4. Confirm redirect or access-denied message.
5. Directly open `/test/results`.
6. Confirm redirect or access-denied message.

**Expected:** Test artifact routes are not accessible to PM role.

---

### PM-08 — Bug and Task Creation Boundary

**Covers:** AC-2

1. Open `/work/tasks`.
2. Verify there is **no Create Task** button or it is disabled.
3. Open `/work/bugs`.
4. Verify there is **no Create Bug** button or it is disabled.
5. Try to navigate to task and bug creation endpoints directly.

**Expected:** Task and bug creation controls are hidden or denied. Direct API calls return 403.

---

### PM-09 — Scoped Permission Verification

**Covers:** AC-9

1. Open browser DevTools Network tab.
2. Navigate to `/work/tasks`.
3. Verify API calls use project-scoped parameters (e.g., project_id filter).
4. Navigate to `/work/bugs`.
5. Verify API calls use project-scoped parameters.
6. Check for any API calls that might bypass scoping (e.g., fetch all tasks).

**Expected:** All API calls respect project scoping. No unscoped queries that return all tasks/bugs across projects.

---

### PM-10 — ACTIVE_ONLY Scope Enforcement

**Covers:** AC-10

1. Using admin credentials, change `PM_USER.status` to `PREPARATION` (or `SUSPENDED`).
2. Log in as `PM_USER` again (or refresh the session).
3. Attempt to navigate to `/dashboards/pm`, `/work/projects`, `/quality/reports`.

**Expected:** All `ACTIVE_ONLY` routes redirect away. Only non-scoped routes (if any) remain accessible.

4. Restore status to `ACTIVE` and verify full access returns.

---

## Pass Criteria

| # | Criterion |
|---|-----------|
| 1 | All expected routes render (HTTP 200) for an ACTIVE PM. |
| 2 | All forbidden routes redirect or show access-denied without rendering content. |
| 3 | PM dashboard is accessible and shows only managed projects. |
| 4 | Project and story read access works; create/edit/delete controls are absent. |
| 5 | Resource read access works; create/edit/delete controls are absent. |
| 6 | Governance metrics are viewable; gate management and approval controls are absent. |
| 7 | Reports can be viewed and exported; generate new report controls are absent. |
| 8 | Team Manager, team journeys, team IDP, team history, and admin routes are blocked. |
| 9 | Scoped artifact routes show only managed project data. |
| 10 | Test artifact routes, task/bug creation are blocked. |
| 11 | A non-ACTIVE PM is blocked from all ACTIVE_ONLY routes. |
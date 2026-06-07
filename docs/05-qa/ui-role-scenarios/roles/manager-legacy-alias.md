# Manager Legacy Alias Role — User Story & Test Scenarios

## User Story

**As a** Manager (legacy role: `manager`, alias for `team_manager`) with `status = ACTIVE`,
**I want** to continue using the legacy `manager` role with all the same capabilities as a `team_manager`,
**so that** backward compatibility is maintained without requiring role migration for existing team managers.

---

## Role Profile

| Property | Value |
|----------|-------|
| Role key | `manager` (legacy alias) |
| Status scope | `ACTIVE_ONLY` — all routes require `status = ACTIVE` |
| Inherits | Same permissions as `team_manager` |
| Also applies to | _(none)_ — this is an alias, not a parent |

> **Note:** The `manager` role is defined as an alias for `team_manager` in the RBAC catalog. This means `manager` has identical permissions to `team_manager`. However, some API paths may still use exact role checks for `manager` instead of the alias. Any behavioral difference is a compatibility bug unless deliberate.

---

## Permission Parity with Team Manager

The `manager` role should behave **identically** to the `team_manager` role. See `team-manager.md` for full permission tables.

### Permissions Granted (same as team_manager)

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

### Permissions Denied (same as team_manager)

| Area | Blocked |
|------|---------|
| Admin section | All `/admin/*` routes |
| Other teams | View / Edit any resource, journey, IDP, task, bug, test artifact from other teams |
| Global resources | Create / Edit / Delete global/non-team-scoped resources |
| Admin-only operations | User management, role management, team creation, permission matrix editing |

---

## Acceptance Criteria

### AC-1: Navigation parity
- Navigation matches `team_manager` exactly.
- My Work, Quality, and Manage nav sections are visible.
- Admin nav section is **not** visible.

### AC-2: Forbidden routes redirect
- Directly navigating to any team_manager-forbidden route redirects to `/me/tasks` (or shows a 403/access-denied page), never renders the target page.

### AC-3: Team-scoped resources are manageable (parity with team_manager)
- Manager can create, edit, and delete resources for their team.
- Other team resources are not visible or accessible.

### AC-4: Team work management works (parity with team_manager)
- Manager can view, create, edit, and delete team tasks.
- Other team tasks are not visible or accessible.

### AC-5: Team quality workflows succeed (parity with team_manager)
- Manager can view, create, edit, and delete team bugs, test cases, test suites, and test executions.
- Other team quality artifacts are not visible or accessible.

### AC-6: Team journeys and development plans are accessible (parity with team_manager)
- Manager can view and edit team member journeys.
- Manager can view and edit team member IDPs.
- Other team journeys and IDPs are not accessible.

### AC-7: Quality governance is manageable (parity with team_manager)
- Manager can view governance metrics.
- Manager can manage gates.
- Manager can approve releases (team-scoped).

### AC-8: Admin boundary is enforced (parity with team_manager)
- All `/admin/*` routes are blocked.
- Admin-specific controls are hidden or denied.

### AC-9: Team scope is enforced (parity with team_manager)
- Direct access to other team artifacts is denied.
- API calls for other team artifacts return 403.

### AC-10: Alias compatibility is maintained
- `manager` role behaves identically to `team_manager` from the user's perspective.
- Any exact role checks for `manager` also work for `team_manager`.

### AC-11: Legacy team API compatibility
- All team-scoped API routes (e.g., `/team/resources`, `/team/journeys`, `/team/idp`) work without 403 responses.
- No unexpected routing or permission errors occur due to role aliasing.

### AC-12: ACTIVE_ONLY scope is enforced (parity with team_manager)
- If the same user's status is changed to anything other than `ACTIVE`, all routes with `ACTIVE_ONLY` scope redirect away.

---

## Test Scenarios

> **Setup:** Log in as a user with `role = manager` (legacy alias) and `status = ACTIVE`.
> See `docs/05-qa/ui-role-scenarios/setup.md` for credential setup.

---

### MGR-01 — Alias Navigation Parity

**Covers:** AC-1, AC-2, AC-10

1. Log in as `MANAGER_ALIAS_USER` (role: `manager`).
2. Inspect the sidebar — verify **My Work**, **Quality**, and **Manage** sections are present.
3. Confirm **Admin** section is absent.
4. Click through each accessible route listed in `team-manager.md`:
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

**Expected:** Every listed route loads successfully (HTTP 200, page content renders). Navigation matches `team_manager` exactly.

5. Directly navigate to each forbidden route listed in `team-manager.md`:
   - `/admin/users`
   - `/admin/teams`
   - `/admin/roles`
   - `/admin/permissions/matrix`
   - `/admin/integrations/tuleap`

**Expected:** Each forbidden route redirects to `/me/tasks` or renders an access-denied message — never the target page content.

---

### MGR-02 — Legacy Team API Compatibility

**Covers:** AC-11

1. Open `/team/resources`.
2. Confirm Team A resources are visible.
3. Confirm no 403 errors appear in console.
4. Open `/team/journeys`.
5. Confirm Team A member journeys are visible.
6. Confirm no 403 errors appear in console.
7. Open `/team/idp`.
8. Confirm Team A member development plans are visible.
9. Confirm no 403 errors appear in console.
10. Open a Team A member profile or plan.
11. Confirm details render without error.

**Expected:** Legacy manager can access team-scoped routes without 403 responses.

---

### MGR-03 — Team Scope Boundary

**Covers:** AC-3, AC-4, AC-5, AC-6, AC-9

1. Open `/team/resources`.
2. Confirm Team A members and resources are visible.
3. Confirm Team B resources are not visible.
4. Try direct URLs for Team B resource records.
5. Open `/work/tasks`.
6. Confirm Team A tasks are visible.
7. Confirm Team B tasks are not visible.
8. Try direct URLs for Team B task records.
9. Open `/work/bugs`.
10. Confirm Team A bugs are visible.
11. Confirm Team B bugs are not visible.
12. Try direct URLs for Team B bug records.
13. Open `/test/cases`.
14. Confirm Team A test cases are visible.
15. Confirm Team B test cases are not visible.
16. Try direct URLs for Team B test case records.

**Expected:** Team A records are visible and accessible; Team B records are denied, hidden, or not found.

---

### MGR-04 — Team Resource Management

**Covers:** AC-3, AC-10

1. Open `/team/resources`.
2. Click **Create Resource**.
3. Fill in required fields and create a resource for a Team A user.
4. Open the created resource and edit a field.
5. Delete the created resource.

**Expected:** Team A resource create/edit/delete succeeds. Behavior matches `team_manager`.

---

### MGR-05 — Team Journey and IDP Management

**Covers:** AC-6, AC-10

1. Open `/team/journeys`.
2. Open a Team A member journey.
3. Edit the journey (e.g., add a comment).
4. Open `/team/idp`.
5. Open a Team A member development plan.
6. Update a safe test task in that plan.

**Expected:** Team A journey and development plan edits succeed. Behavior matches `team_manager`.

**Note:** If this fails for `manager` while the same scenario passes for `team_manager`, record it as a role-alias mismatch. Some API paths still check exact `manager` role.

---

### MGR-06 — Team Quality Workflows

**Covers:** AC-5, AC-10

1. Open `/work/bugs`.
2. Click **Create Bug**.
3. Fill in required fields and create a bug for Team A.
4. Open the created bug and edit a field.
5. Delete the created bug.
6. Open `/test/cases`.
7. Click **Create Test Case**.
8. Fill in required fields and create a test case for Team A.
9. Edit the test case.
10. Delete the test case.
11. Repeat for test suites (`/test/suites`) and test executions (`/test/runs`).

**Expected:** Team-scoped quality actions (create/edit/delete) succeed for Team A only. Behavior matches `team_manager`.

---

### MGR-07 — Quality Governance Management

**Covers:** AC-7, AC-10

1. Open `/quality/governance`.
2. Confirm governance metrics render for Team A.
3. Identify a quality gate (e.g., "Test Coverage").
4. Change the gate state (e.g., from "Not Met" to "Met") if UI supports it.
5. Navigate to release approval section if available.
6. Approve a pending release for Team A if available.

**Expected:** Governance metrics are viewable. Gate management and release approval controls are present and functional for Team A. Behavior matches `team_manager`.

---

### MGR-08 — Reports Generation and Export

**Covers:** AC-7, AC-10

1. Open `/quality/reports`.
2. Confirm reports page renders.
3. Click **Generate Report**.
4. Select Team A as scope and generate a report.
5. Click **Export** or **Download** on the generated report.

**Expected:** Report generation and export succeed for Team A scope. Behavior matches `team_manager`.

---

### MGR-09 — Admin Boundary

**Covers:** AC-2, AC-8, AC-10

1. Directly open `/admin/users`.
2. Directly open `/admin/permissions/matrix`.
3. Directly open `/admin/teams`.
4. Directly open `/admin/integrations/tuleap`.

**Expected:** Admin pages do not render; no admin-only action is available. Behavior matches `team_manager`.

---

### MGR-10 — Team Dashboard Access

**Covers:** AC-1, AC-10

1. Open `/dashboards/team-manager`.
2. Confirm dashboard renders with Team A metrics.
3. Verify metrics are scoped to Team A (no Team B data).

**Expected:** Team manager dashboard renders with team-scoped metrics only. Behavior matches `team_manager`.

---

### MGR-11 — Compare with Team Manager

**Covers:** AC-10

1. Run TM-02 through TM-05 from `team-manager.md` with `MANAGER_ALIAS_USER`.
2. Compare results to `TEAM_MANAGER_USER`.

**Expected:** Both roles behave the same from the user's perspective. Any difference is a compatibility bug unless deliberately configured through custom role permissions.

---

### MGR-12 — Team History Access

**Covers:** AC-1, AC-10

1. Open `/team/history`.
2. Confirm team history renders for Team A.
3. Verify task history and changes are visible.

**Expected:** Team history is accessible and shows team-scoped data. Behavior matches `team_manager`.

---

### MGR-13 — Direct API Parity Check

**Covers:** AC-9, AC-10

1. Open browser DevTools Network tab.
2. Navigate to `/team/journeys`.
3. Issue a direct `GET /api/team/journeys` request for a Team A member.
4. Issue a direct `GET /api/team/journeys` request for a Team B member.
5. Navigate to `/work/bugs`.
6. Issue a direct `PATCH /api/bugs/[id]` request for a Team A bug.
7. Issue a direct `DELETE /api/bugs/[id]` request for a Team B bug.

**Expected:** Team A API calls succeed (200). Team B API calls return 403. Behavior matches `team_manager`.

---

### MGR-14 — ACTIVE_ONLY Scope Enforcement

**Covers:** AC-12, AC-10

1. Using admin credentials, change `MANAGER_ALIAS_USER.status` to `PREPARATION` (or `SUSPENDED`).
2. Log in as `MANAGER_ALIAS_USER` again (or refresh the session).
3. Attempt to navigate to `/dashboards/team-manager`, `/team/resources`, `/quality/governance`.

**Expected:** All `ACTIVE_ONLY` routes redirect away. Only non-scoped routes (if any) remain accessible.

4. Restore status to `ACTIVE` and verify full access returns.

---

## Pass Criteria

| # | Criterion |
|---|-----------|
| 1 | Navigation matches `team_manager` exactly. |
| 2 | All forbidden routes redirect or show access-denied without rendering content. |
| 3 | Team resources can be created, edited, and deleted. |
| 4 | Team tasks and stories can be created, edited, and deleted. |
| 5 | Team quality artifacts (bugs, test cases, suites, executions) can be created, edited, and deleted. |
| 6 | Team journeys and development plans are accessible and editable. |
| 7 | Quality governance gates can be managed and releases can be approved. |
| 8 | Reports can be generated and exported. |
| 9 | Admin routes are blocked. |
| 10 | Other team artifacts are not visible or accessible. |
| 11 | All team-scoped API routes work without 403 responses. |
| 12 | `manager` role behaves identically to `team_manager` from user perspective. |
| 13 | Team dashboard renders with team-scoped metrics. |
| 14 | Team history is accessible. |
| 15 | A non-ACTIVE manager is blocked from all ACTIVE_ONLY routes. |
| 16 | All team_manager scenarios (TM-01 through TM-12) pass for `manager` role without modification. |
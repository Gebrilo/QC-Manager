# Member Role — User Story & Test Scenarios

## User Story

**As a** Member (role: `member`) with `status = ACTIVE`,
**I want** to be able to view and manage my personal tasks, view team-shared artifacts where appropriate, and access my development journey and IDP,
**so that** I can contribute to team quality work while respecting management and administrative boundaries.

---

## Role Profile

| Property | Value |
|----------|-------|
| Role key | `member` |
| Status scope | `ACTIVE_ONLY` — all routes require `status = ACTIVE` |
| Inherits | _(nothing)_ |
| Also applies to | _(none)_ |

### Permissions Granted

| Area | Allowed |
|------|---------|
| Dashboard | View dashboard, My Dashboard, Member Dashboard |
| My Work | View / Create / Edit / Delete own tasks |
| Journeys | View own journeys and IDP |
| IDP | View and manage own development plan and history |
| Projects | View |
| Tasks | View (own and team-assigned) |
| Bugs | View (own and team-assigned) |
| Test Cases | View (own and team-assigned) |
| Test Suites | View (own and team-assigned) |
| Test Executions | View (own and team-assigned) |
| Reports | View |

### Permissions Denied

| Area | Blocked |
|------|---------|
| Tasks | Edit/Delete non-owned team artifacts |
| Bugs | Edit/Delete non-owned team artifacts |
| Test Cases | Edit/Delete non-owned team artifacts |
| Test Suites | Edit/Delete non-owned team artifacts |
| Test Executions | Edit/Delete non-owned team artifacts |
| Team Resources | View / Create / Edit / Delete |
| Team Journeys | View / Edit (non-owned) |
| Team IDP | View / Edit (non-owned) |
| Team Manager Dashboard | View |
| Manage section | All `/team/*` routes (non-owned) |
| Admin section | All `/admin/*` routes |
| Governance | View, manage gates, approve releases |

---

## Acceptance Criteria

### AC-1: Navigation
- My Work and Quality nav sections are visible.
- Manage and Admin nav sections are **not** visible.
- Member Dashboard is accessible via `/dashboards/member`.
- All expected routes render without redirect for an `ACTIVE` member user.

### AC-2: Forbidden routes redirect
- Directly navigating to any route in the "Permissions Denied" table redirects to `/me/tasks` (or shows a 403/access-denied page), never renders the target page.

### AC-3: Personal task workflow succeeds
- Member can create, edit, and delete own personal tasks via the UI.

### AC-4: Personal development access works
- Member can view and manage their own journeys and IDP including history.

### AC-5: Team visibility is scoped
- Member can view team-shared artifacts for their team only.
- Other team artifacts are not visible or accessible.

### AC-6: Non-owned artifact editing is blocked
- Edit/Delete buttons for non-owned team artifacts are hidden or disabled.
- Direct API calls for non-owned artifacts return 403.

### AC-7: ACTIVE_ONLY scope is enforced
- If the same user's status is changed to anything other than `ACTIVE`, all routes with `ACTIVE_ONLY` scope redirect away.

---

## Test Scenarios

> **Setup:** Log in as a user with `role = member` and `status = ACTIVE`.
> See `docs/05-qa/ui-role-scenarios/setup.md` for credential setup.

---

### MEM-01 — Member Navigation Smoke Test

**Covers:** AC-1, AC-2

1. Log in as `MEMBER_A_USER`.
2. Inspect the sidebar — verify only **My Work** and **Quality** sections are present.
3. Confirm **Manage** and **Admin** sections are absent.
4. Click through each expected route:
   - `/me/tasks`
   - `/me/journeys`
   - `/me/idp`
   - `/me/idp/history`
   - `/me/dashboard`
   - `/dashboards/member`
   - `/work/projects`
   - `/work/tasks`
   - `/work/stories`
   - `/work/bugs`
   - `/test/cases`
   - `/test/suites`
   - `/test/runs`
   - `/quality/reports`

**Expected:** Every listed route loads successfully (HTTP 200, page content renders).

5. Directly navigate to each forbidden route:
   - `/dashboards/team-manager`
   - `/team/resources`
   - `/team/idp`
   - `/team/journeys`
   - `/admin/users`
   - `/admin/roles`
   - `/admin/teams`

**Expected:** Each forbidden route redirects to `/me/tasks` or renders an access-denied message — never the target page content.

---

### MEM-02 — Personal Work Workflow

**Covers:** AC-3, AC-4

1. Navigate to `/me/tasks`.
2. Create a new personal task with title "Personal Task 1".
3. Open the created task and edit the description.
4. Delete the personal task.
5. Navigate to `/me/idp` and confirm development plan renders.
6. Navigate to `/me/idp/history` and confirm history renders.
7. Navigate to `/me/journeys` and confirm personal journey renders.

**Expected:** Personal task create/edit/delete succeeds. IDP and journey pages render without error.

---

### MEM-03 — Own and Team Artifact Visibility

**Covers:** AC-5

1. Open `/work/tasks`.
2. Confirm own assigned Team A tasks are visible.
3. Confirm Team A shared/team tasks are visible where seeded.
4. Confirm Team B-only tasks are not visible.
5. Repeat the visibility check for bugs (`/work/bugs`):
   - Own bugs are visible
   - Team A bugs are visible
   - Team B bugs are not visible
6. Repeat for test cases (`/test/cases`):
   - Own test cases are visible
   - Team A test cases are visible
   - Team B test cases are not visible
7. Repeat for test suites (`/test/suites`):
   - Team A suites are visible
   - Team B suites are not visible
8. Repeat for test executions (`/test/runs`):
   - Team A runs are visible
   - Team B runs are not visible

**Expected:** Own/team visibility works and Team B data is not exposed across all artifact types.

---

### MEM-04 — Own Artifact Editing

**Covers:** AC-3, AC-6

1. Open an artifact owned by or assigned to `MEMBER_A_USER` (e.g., a task).
2. Click **Edit** and modify a safe field (e.g., description). Save.
3. Open a Team A artifact not owned by `MEMBER_A_USER`.
4. Verify there is **no Edit button** or it is disabled.
5. Try to navigate directly to an edit endpoint for the non-owned artifact.
6. Optionally issue a `PATCH` request from the browser network tab.

**Expected:** Own edit succeeds. Non-owned team artifact edit is hidden, denied, or limited according to artifact-specific `_can` state. Direct API calls return 403.

---

### MEM-05 — Management Boundary

**Covers:** AC-1, AC-2

1. Directly open `/team/resources`.
2. Directly open `/team/journeys`.
3. Directly open `/team/idp`.
4. Directly open `/admin/users`.
5. Directly open `/admin/roles`.
6. Directly open `/admin/teams`.

**Expected:** All management/admin routes are denied or redirect to `/me/tasks` or show access-denied message.

---

### MEM-06 — Member Dashboard Access

**Covers:** AC-1

1. Navigate to `/dashboards/member`.
2. Confirm dashboard renders with member-specific metrics.
3. Verify no team-manager or admin-specific controls are visible.

**Expected:** Member dashboard renders without team-manager/admin navigation or controls.

---

### MEM-07 — Team Resource Boundary

**Covers:** AC-2, AC-5

1. Directly open `/team/resources`.
2. Confirm redirect or access-denied message.
3. Verify no resource management UI is accessible.

**Expected:** Team resources are not accessible to member role.

---

### MEM-08 — Team IDP Boundary

**Covers:** AC-2, AC-5

1. Directly open `/team/idp`.
2. Confirm redirect or access-denied message.
3. Verify no team-level IDP management is accessible.

**Expected:** Team IDP is not accessible; only `/me/idp` is accessible.

---

### MEM-09 — Team Journeys Boundary

**Covers:** AC-2, AC-5

1. Directly open `/team/journeys`.
2. Confirm redirect or access-denied message.
3. Verify no team-level journey management is accessible.

**Expected:** Team journeys are not accessible; only `/me/journeys` is accessible.

---

### MEM-10 — ACTIVE_ONLY Scope Enforcement

**Covers:** AC-7

1. Using admin credentials, change `MEMBER_A_USER.status` to `PREPARATION` (or `SUSPENDED`).
2. Log in as `MEMBER_A_USER` again (or refresh the session).
3. Attempt to navigate to `/work/tasks`, `/me/idp`, `/quality/reports`.

**Expected:** All `ACTIVE_ONLY` routes redirect away. Only non-scoped routes (if any) remain accessible.

4. Restore status to `ACTIVE` and verify full access returns.

---

## Pass Criteria

| # | Criterion |
|---|-----------|
| 1 | All expected routes render (HTTP 200) for an ACTIVE member. |
| 2 | All forbidden routes redirect or show access-denied without rendering content. |
| 3 | Personal task create/edit/delete completes without error. |
| 4 | Personal IDP and journey pages render without error. |
| 5 | Team A artifacts are visible; Team B artifacts are not visible. |
| 6 | Edit/Delete controls for non-owned artifacts are absent from the UI. |
| 7 | Direct API calls for non-owned artifacts return 403. |
| 8 | Team management and admin routes are blocked. |
| 9 | Member dashboard renders with member-specific content only. |
| 10 | A non-ACTIVE member is blocked from all ACTIVE_ONLY routes. |
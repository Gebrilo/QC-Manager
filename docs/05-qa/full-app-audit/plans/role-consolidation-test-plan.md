# Role Consolidation Testing Plan — Issue #189

> **Status:** Pending user approval — do NOT execute until instructed.

## Objective

Verify that the role consolidation fix (9 roles → 5) is deployed correctly:
- Old roles (`manager`, `user`, `member`) are removed
- New 5-role system works without regressions
- Permission boundaries are intact for all roles
- Legacy code paths no longer reference old role names

## Test Accounts

| # | Email | Password | Purpose |
|---|-------|----------|---------|
| Admin | `wosog33787@aspensif.com` | `Password123!` | Verify admin panel, role list, switch roles on test account |
| Flexible | `mamojoj825@5nek.com` | `QCTest2024!` | Test individual roles by switching on Users page |

## Phase 1: Admin Verification (admin account)

### 1.1 — Role Registry Check
- [ ] Navigate to `/admin/roles`
- [ ] **Verify exactly 5 roles** are listed: `admin`, `team_manager`, `pm`, `tester`, `contributor`
- [ ] **Verify absent**: `manager`, `user`, `member` (should not appear)
- [ ] Click each role card, verify permission list is correct

### 1.2 — Permissions Matrix Check
- [ ] Navigate to `/admin/permissions/matrix`
- [ ] Verify matrix shows exactly 5 role columns
- [ ] Spot-check: `tester` should have `qc.tasks.log_time`, `qc.testcases.view_steps`, `qc.dashboards.member.view` (merged from member)
- [ ] Spot-check: `team_manager` should inherit tester permissions

### 1.3 — User Management Check
- [ ] Navigate to `/admin/users`
- [ ] Verify no user has role `manager`, `user`, or `member`
- [ ] If any user has old role → migration failed → **BLOCKER**

### 1.4 — Legacy Code Path Check (terminal)
- [ ] Run: `grep -r "role === 'manager'" apps/api/src/ apps/web/src/` → expect ZERO results
- [ ] Run: `grep -r "role === 'user'" apps/api/src/ apps/web/src/` → expect ZERO results (unless in migration scripts)
- [ ] Run: `grep -r "'member'" apps/shared/rbac/catalog.ts` → expect ZERO results (role definition removed)

---

## Phase 2: Role-by-Role Testing (flexible account)

For each role, switch the flexible account's role on `/admin/users`, then log in fresh and test.

### 2.1 — Tester Role (the expanded one)

**Setup:** Set `mamojoj825@5nek.com` role → `tester`, status → `ACTIVE`

| # | Test | Route/Action | Expected |
|---|------|-------------|----------|
| T1 | Sidebar | After login | My Work + Quality visible. Manage and Admin absent. |
| T2 | My Dashboard | `/me/dashboard` | Loads with Member Dashboard link visible (from merged member perms) |
| T3 | Personal Tasks | `/me/tasks` | Create, edit, delete personal tasks work |
| T4 | Log Time | Any personal task | `qc.tasks.log_time` available (merged from member) |
| T5 | Global Tasks | `/work/tasks` | 24 tasks visible, New Task + Edit visible |
| T6 | Priority Guard | `/work/tasks/create` | Priority shown as non-interactive badges (not radio buttons) |
| T7 | Bugs | `/work/bugs` | Create Bug enabled, 39 bugs, no Edit/Delete |
| T8 | Test Cases | `/test/cases` | 120 cases, New + Bulk upload enabled, View Steps available |
| T9 | Test Suites | `/test/suites` | New Suite enabled |
| T10 | Test Runs | `/test/runs` | Upload form visible |
| T11 | Results | `/test/results` | Upload button present |
| T12 | Reports | `/quality/reports` | Generate visible, Export hidden |
| T13 | Projects | `/work/projects` | View only, no Create/Edit/Delete |
| T14 | Resources | `/team/resources` | View only, no Create/Edit/Delete |
| T15 | Governance | `/quality/governance` | **Redirect to /me/tasks** (tester cannot view governance) |
| T16 | Admin routes | `/admin/users` | **Redirect to /me/tasks** |
| T17 | Manage routes | `/team/journeys`, `/team/history` | **Redirect to /me/tasks** |

### 2.2 — Team Manager Role

**Setup:** Set `mamojoj825@5nek.com` role → `team_manager`, status → `ACTIVE`

| # | Test | Route/Action | Expected |
|---|------|-------------|----------|
| TM1 | Sidebar | After login | My Work + Quality + **Manage** visible. Admin absent. |
| TM2 | Team Dashboard | `/dashboards/team-manager` | Loads (may show "requires team assignment") |
| TM3 | Resources | `/team/resources` | + New Resource, Edit buttons visible |
| TM4 | Tasks | `/work/tasks` | Tasks visible, team-scoped |
| TM5 | Bugs | `/work/bugs` | Create Bug + triage controls |
| TM6 | Governance | `/quality/governance` | Export Report visible, no manage gates |
| TM7 | Reports | `/quality/reports` | Generate + Export visible |
| TM8 | Admin routes | `/admin/roles` | **Redirect to /me/tasks** |
| TM9 | Inherited tester | All tester scenarios from 2.1 | Must pass (team_manager inherits tester) |

### 2.3 — PM Role

**Setup:** Set `mamojoj825@5nek.com` role → `pm`, status → `ACTIVE`

| # | Test | Route/Action | Expected |
|---|------|-------------|----------|
| PM1 | Sidebar | After login | My Work + Quality (subset: Projects, Stories, Tasks, Bugs, Test Runs, Results, Governance, Reports). NO Test Cases, Suites, Manage, Admin. |
| PM2 | Projects | `/work/projects` | Read-only, no Create/Edit/Delete |
| PM3 | Tasks | `/work/tasks` | 24 tasks visible, no Create/Edit/Delete buttons |
| PM4 | Bugs | `/work/bugs` | 39 bugs visible, no Create/Edit/Delete buttons |
| PM5 | Reports | `/quality/reports` | Export (PDF, Excel, CSV) visible, **Generate hidden** |
| PM6 | Governance | `/quality/governance` | Read-only metrics, Export Report enabled |
| PM7 | Admin routes | `/admin/users` | **Redirect to /me/tasks** |

### 2.4 — Contributor Role

**Setup:** Set `mamojoj825@5nek.com` role → `contributor`, status → `PREPARATION`

| # | Test | Route/Action | Expected |
|---|------|-------------|----------|
| C1 | Sidebar | After login | **Only** My Work (My Dashboard, My Tasks, My Journeys). No Quality, Manage, Admin. |
| C2 | Personal Tasks | `/me/tasks` | Create, edit, delete work |
| C3 | Dashboard | `/me/dashboard` | GET STARTED state |
| C4 | Journeys | `/me/journeys` | No Journeys Assigned (or assigned journey visible) |
| C5 | Global Tasks | `/work/tasks` | **Redirect to /me/tasks** |
| C6 | Bugs | `/work/bugs` | **Redirect to /me/tasks** |
| C7 | Test Cases | `/test/cases` | **Redirect to /me/tasks** |
| C8 | Admin routes | `/admin/users` | **Redirect to /me/tasks** |
| C9 | Reports | `/quality/reports` | **Redirect to /me/tasks** |

---

## Phase 3: Regression Checks

### 3.1 — Old Role Names Don't Leak
- [ ] No reference to `manager` role in sidebar rendering
- [ ] No reference to `user` role in sidebar rendering
- [ ] No reference to `member` role in sidebar rendering
- [ ] Breadcrumb/page titles don't show old role names
- [ ] Preferences page doesn't show old role names

### 3.2 — RBAC Tests
- [ ] Run: `cd apps/api && npm test` — all RBAC tests pass
- [ ] Run: `cd apps/shared && npx jest` (if tests exist) — catalog tests pass

### 3.3 — Console Errors
- [ ] Zero JavaScript errors during any role test
- [ ] Zero failed network requests during any role test

---

## Phase 4: Summary Report

| Role | Stories Tested | Pass | Fail | Notes |
|------|---------------|------|------|-------|
| Tester | T1-T17 | | | |
| Team Manager | TM1-TM9 | | | |
| PM | PM1-PM7 | | | |
| Contributor | C1-C9 | | | |
| **Admin verification** | A1-A4 | | | |

---

## Stop Conditions

- ❌ Any old role name (`manager`, `user`, `member`) still visible in UI
- ❌ Any user still assigned an old role
- ❌ Any legacy `role === 'manager'` code path still active
- ❌ Tester role missing any member-merged permissions (LOG_TIME, VIEW_STEPS, MEMBER_DASHBOARD)
- ❌ Team manager missing any inherited tester permissions
- ❌ More than 3 consecutive 5xx errors

---

## Test Data

No data creation needed — all tests are read-only permission boundary checks. No `[AUDIT-...]` prefixed data will be created.

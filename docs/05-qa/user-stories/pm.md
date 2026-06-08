# Project Manager — User Stories

**Role key:** `pm` | **Status scope:** `ACTIVE_ONLY`

---

## US-PM01: Access the PM dashboard

**As a** Project Manager, **I want** to open a dashboard scoped to my managed projects,
**so that** I can monitor project health at a glance without seeing other teams' data.

| | |
|---|---|
| **Given** | I am logged in as an `ACTIVE` PM |
| **When** | I navigate to `/dashboards/pm` |
| **Then** | The dashboard loads and shows only projects I manage; other projects are not listed |

---

## US-PM02: View project details and stories (read-only)

**As a** Project Manager, **I want** to read project details and linked user stories,
**so that** I understand scope without being able to accidentally mutate them.

| | |
|---|---|
| **Given** | I am on `/work/projects` |
| **When** | I open a managed project |
| **Then** | Project details render; Create, Edit, and Delete controls are absent or return 403 |

| | |
|---|---|
| **Given** | I am on `/work/stories` |
| **When** | I view stories for my managed project |
| **Then** | Stories are visible; Create, Edit, and Delete controls are absent or return 403 |

---

## US-PM03: View team resources (read-only)

**As a** Project Manager, **I want** to see which resources are allocated to my projects,
**so that** I can track team capacity.

| | |
|---|---|
| **Given** | I am on `/team/resources` |
| **When** | I search for resources on a managed project |
| **Then** | Resources are listed; Create, Edit, and Delete controls are absent or return 403 |

---

## US-PM04: View quality governance metrics (read-only)

**As a** Project Manager, **I want** to read governance metrics for my projects,
**so that** I can assess release readiness without modifying gate states.

| | |
|---|---|
| **Given** | I am on `/quality/governance` |
| **When** | I view the governance dashboard |
| **Then** | Read-only metrics render; gate-management and release-approval controls are absent |

---

## US-PM05: View and export reports

**As a** Project Manager, **I want** to view and download project reports,
**so that** I can share quality data with stakeholders.

| | |
|---|---|
| **Given** | I am on `/quality/reports` |
| **When** | I open a report for my project |
| **Then** | The report renders correctly |

| | |
|---|---|
| **Given** | I select a report |
| **When** | I click the Export or Download button |
| **Then** | The file downloads successfully (`qc.reports.export` is granted) |

| | |
|---|---|
| **Given** | I am on the reports page |
| **When** | I look for a Generate New Report control |
| **Then** | It is absent or returns 403 (PM lacks `qc.reports.generate`) |

---

## US-PM06: View tasks across projects

**As a** Project Manager, **I want** to view tasks across all projects I have oversight of,
**so that** I can spot bottlenecks and adjust priorities.

| | |
|---|---|
| **Given** | I am on `/work/tasks` |
| **When** | The page loads |
| **Then** | Tasks for managed projects are visible; Create / Edit / Delete controls are absent except where explicitly granted |

---

## US-PM07: View bugs across projects

**As a** Project Manager, **I want** to see all bugs across my managed projects,
**so that** I can assess defect density and release risk.

| | |
|---|---|
| **Given** | I am on `/work/bugs` |
| **When** | The page loads |
| **Then** | Bugs for managed projects are visible; Create / Edit / Delete controls are absent |

---

## US-PM08: View test executions across projects

**As a** Project Manager, **I want** to read test execution history across projects I manage,
**so that** I can track test coverage and execution trends.

| | |
|---|---|
| **Given** | I am on `/test/runs` |
| **When** | The page loads |
| **Then** | Test runs for managed projects are visible (read-only); Create / Edit / Delete controls are absent |

---

## US-PM09: Create and manage own personal tasks

**As a** Project Manager, **I want** to maintain a personal task list,
**so that** I can track follow-ups that do not belong to a team task.

| | |
|---|---|
| **Given** | I am on `/me/tasks` |
| **When** | I create, edit, and delete a personal task |
| **Then** | All three operations succeed |

---

## US-PM10: ACTIVE status is required

**As a** Project Manager, **I want** to be blocked from all PM routes when my status is not ACTIVE,
**so that** inactive accounts cannot access project data.

| | |
|---|---|
| **Given** | My account status is changed to `PREPARATION` or `SUSPENDED` |
| **When** | I navigate to `/dashboards/pm` or `/work/projects` |
| **Then** | ACTIVE_ONLY routes redirect away |

---

## Out-of-scope (should be blocked)

| Action | Reason |
|--------|--------|
| Create / Edit / Delete projects | Lacks `qc.projects.create/edit/delete` |
| Create / Edit / Delete bugs | Lacks `qc.bugs.create/edit/delete` |
| Create / Edit / Delete stories | Lacks `qc.user_stories.create/edit/delete` |
| Access test cases or suites | Lacks `qc.testcases.*` and `qc.testsuites.*` |
| Manage governance gates or approve releases | Lacks `qc.governance.manage_gates` and `qc.governance.approve_release` |
| Access Team Manager Dashboard | Lacks `qc.dashboards.team_manager.view` |
| Access team journeys / IDP / history | Lacks team management permissions |
| Access Admin section | Role not granted any admin permissions |

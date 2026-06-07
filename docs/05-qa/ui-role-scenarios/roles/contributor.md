# Contributor Role — User Stories & Test Scenarios

## Role Summary

The `contributor` role is a **preparation-only** onboarding role. Contributors land in the My Work space and have no access to the active quality workspace (projects, bugs, test cases, reports, governance, or admin).

**Permissions granted:**

| Permission key | What it unlocks |
| --- | --- |
| `qc.tasks.view` | Read all tasks (scoped to PREPARATION status) |
| `qc.tasks.edit` | Edit tasks (scoped to PREPARATION status) |
| `qc.mywork.tasks.view` | View personal My Work task list |
| `qc.mywork.tasks.create` | Create personal tasks |
| `qc.mywork.tasks.edit` | Edit personal tasks |
| `qc.mywork.tasks.delete` | Delete personal tasks |
| `qc.mywork.dashboard.view` | View personal My Work dashboard |

**Scope:** `preparation_only` — only tasks with `status = PREPARATION` are visible.

**No access to:** projects, resources, bugs, test cases, test suites, test executions, reports, governance, journeys assignment, team management, admin.

---

## Required Account State

`CONTRIBUTOR_USER` must have:

- `role = contributor`
- `status = PREPARATION`
- `active = true`
- At least one personal task already created (seeded)
- At least one assigned journey (if the journeys feature is enabled)

---

## User Stories

### US-CON-01: Login and landing page

**As a** Contributor,  
**I want** to be taken directly to my personal task board after login,  
**so that** I am not exposed to workspace sections that require an active account.

**Acceptance Criteria:**

- Given I log in as `CONTRIBUTOR_USER`
- When authentication succeeds
- Then I am redirected to `/me/tasks` (or `/me/dashboard`) and not to any `/work/*`, `/test/*`, `/quality/*`, or `/admin/*` route
- And the top navigation shows only My Work sections (no Projects, Bugs, Test Cases, Reports, Governance, or Admin items)

---

### US-CON-02: View personal task list

**As a** Contributor,  
**I want** to view the list of my personal tasks,  
**so that** I can track my onboarding progress.

**Acceptance Criteria:**

- Given I am logged in as `CONTRIBUTOR_USER`
- When I open `/me/tasks`
- Then I see the task list page without being redirected
- And only tasks belonging to or assigned to me are listed
- And no error or 403 is returned

---

### US-CON-03: Create a personal task

**As a** Contributor,  
**I want** to create a new personal task,  
**so that** I can track my own work items during onboarding.

**Acceptance Criteria:**

- Given I am on `/me/tasks`
- When I click the "New task" (or equivalent) button
- And I fill in a task title prefixed with `RBAC UI contributor`
- And I submit the form
- Then the task appears in my personal task list
- And the API returns 2xx with the created task record
- And no 403 or permission error is shown

---

### US-CON-04: Edit a personal task

**As a** Contributor,  
**I want** to edit the details of a personal task I created,  
**so that** I can update its description or status as my work progresses.

**Acceptance Criteria:**

- Given I am on `/me/tasks` and a personal task exists (created in US-CON-03 or seeded)
- When I open the task detail and change the title or description
- And I save the change
- Then the task detail reflects the updated values
- And the API returns 2xx

---

### US-CON-05: Delete a personal task

**As a** Contributor,  
**I want** to delete a personal task,  
**so that** I can clean up work items that are no longer relevant.

**Acceptance Criteria:**

- Given I am on `/me/tasks` and a personal task exists
- When I delete the task (via UI control or confirmation dialog)
- Then the task is removed from the list
- And the API returns 2xx or 204
- And the task does not reappear on page refresh

---

### US-CON-06: View personal dashboard

**As a** Contributor,  
**I want** to view my personal dashboard,  
**so that** I can get an overview of my assigned work and progress.

**Acceptance Criteria:**

- Given I am logged in as `CONTRIBUTOR_USER`
- When I open `/me/dashboard`
- Then the page loads without redirect or 403
- And widgets relevant to My Work (task count, assigned items) are visible
- And no workspace-level dashboard widgets (project summary, bug trends, test execution stats) are shown

---

### US-CON-07: View an assigned journey

**As a** Contributor,  
**I want** to open and read my assigned onboarding journey,  
**so that** I can follow the onboarding steps required before becoming an active member.

**Acceptance Criteria:**

- Given I am logged in as `CONTRIBUTOR_USER`
- And an onboarding journey has been assigned to `CONTRIBUTOR_USER`
- When I open `/me/journeys`
- Then the assigned journey is listed
- When I click into the journey
- Then I can read the journey steps without error
- And I can mark a step complete if that action is available

---

### US-CON-08: Active workspace is inaccessible

**As a** Contributor,  
**I want** the system to block me from entering workspace sections I am not allowed to use,  
**so that** I cannot accidentally view or modify active project data.

**Acceptance Criteria:**

- Given I am logged in as `CONTRIBUTOR_USER`
- When I directly navigate to any of the following routes:

  | Route | Reason blocked |
  | --- | --- |
  | `/work/tasks` | No active-workspace task permission |
  | `/work/projects` | No `qc.projects.view` |
  | `/work/stories` | No `qc.user_stories.view` |
  | `/work/bugs` | No `qc.bugs.view` |
  | `/test/cases` | No `qc.testcases.view` |
  | `/test/suites` | No `qc.testsuites.view` |
  | `/test/runs` | No `qc.testexecutions.view` |
  | `/quality/governance` | No `qc.governance.view` |
  | `/quality/reports` | No `qc.reports.view` |
  | `/team/resources` | No `qc.resources.view` |
  | `/admin/*` | No admin permissions |
  | `/me/idp` | No IDP / development-plan permission |

- Then each route redirects to `/me/tasks` or the configured fallback page
- And no content from the blocked page is visible even briefly before redirect

---

### US-CON-09: API boundary — forbidden actions return 403

**As a** QA engineer testing the Contributor role,  
**I want** to verify that API endpoints for disallowed resources reject contributor tokens with 403,  
**so that** the permission boundary is enforced at both UI and API layers.

**Acceptance Criteria:**

- Given I obtain the bearer token for `CONTRIBUTOR_USER`
- When I call the following API endpoints:

  | Method | Endpoint | Expected response |
  | --- | --- | --- |
  | GET | `/api/projects` | 403 |
  | GET | `/api/bugs` | 403 |
  | GET | `/api/test-cases` | 403 |
  | GET | `/api/test-suites` | 403 |
  | GET | `/api/test-executions` | 403 |
  | GET | `/api/resources` | 403 |
  | GET | `/api/governance` | 403 |
  | GET | `/api/reports` | 403 |
  | GET | `/api/admin/users` | 403 |

- Then each call returns HTTP 403
- And the response body does not include any data records

---

### US-CON-10: Preparation scope — ACTIVE tasks are not visible

**As a** Contributor,  
**I want** only tasks in PREPARATION status to appear in my task views,  
**so that** the scope restriction is applied consistently and I am not exposed to active-phase work.

**Acceptance Criteria:**

- Given a task exists with `status = ACTIVE` and is otherwise visible to the contributor's account
- When I open `/me/tasks` or any task list as `CONTRIBUTOR_USER`
- Then the ACTIVE task does not appear in the list
- And a PREPARATION-status task does appear

---

### US-CON-11: Status transition — contributor activated by admin

**As a** QA engineer,  
**I want** to document the system behaviour when an admin changes a contributor's account status to ACTIVE,  
**so that** the product team can decide whether the role should auto-upgrade or stay preparation-only.

**Acceptance Criteria (record, do not assume pass/fail):**

- Given `CONTRIBUTOR_USER` has been set to `status = ACTIVE` by `ADMIN_USER` in a disposable test environment
- When the contributor logs in again
- Then record:
  - Whether workspace routes (`/work/tasks`, etc.) become accessible
  - Whether the navigation changes
  - Whether any API calls for workspace resources now succeed or still return 403
- Document the result as a product decision: expected behaviour after activation is **undefined by RBAC** and must be clarified by the team.

---

## Evidence Template

For every scenario, fill in:

```text
Scenario ID:
Role:        contributor
Account:     CONTRIBUTOR_USER
Result:      PASS | FAIL | BLOCKED
Observed:
Expected:
Evidence:    (screenshot path or network HAR reference)
Notes:
```

## Data Cleanup

- Delete any tasks created during testing that are prefixed with `RBAC UI contributor`.
- Do not delete seeded journey or task records shared with other scenarios.

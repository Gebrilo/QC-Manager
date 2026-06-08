# Team Manager — User Stories

**Role key:** `team_manager` | **Inherits:** `tester` | **Status scope:** `ACTIVE_ONLY` + `TEAM`

> Team Manager inherits all Tester permissions and adds team-management, governance, and broader artifact control.
> All artifact access is scoped to the actor's team unless the permission is global.

---

## US-TM01: View the Team Manager Dashboard

**As a** Team Manager, **I want** to open the team dashboard,
**so that** I can see an overview of my team's task load, bug trends, and quality metrics in one place.

| | |
|---|---|
| **Given** | I am logged in as an `ACTIVE` team_manager |
| **When** | I navigate to `/dashboards/team-manager` |
| **Then** | The Team Dashboard loads and displays data scoped to my team |

---

## US-TM02: Manage team resources

**As a** Team Manager, **I want** to create, edit, and delete resources within my team's scope,
**so that** I can keep the resource registry accurate for my team.

| | |
|---|---|
| **Given** | I am on `/team/resources/create` |
| **When** | I fill in resource details and submit |
| **Then** | The resource is created and visible in my team's resource list |

| | |
|---|---|
| **Given** | I open an existing resource in my team |
| **When** | I edit its details and save |
| **Then** | The update succeeds |

| | |
|---|---|
| **Given** | I open a resource outside my team |
| **When** | I attempt to edit or delete it |
| **Then** | The action is blocked (team scope boundary) |

---

## US-TM03: View and edit team journeys

**As a** Team Manager, **I want** to view and edit development journeys for my team,
**so that** I can keep learning paths current and assign them to team members.

| | |
|---|---|
| **Given** | I am on `/team/journeys` |
| **When** | I open a journey and edit its content |
| **Then** | The edit succeeds and is reflected for team members |

| | |
|---|---|
| **Given** | I am on `/team/journeys` |
| **When** | I assign a journey to a team member |
| **Then** | The assignment is saved (`qc.journeys.assign` granted) |

---

## US-TM04: View team IDP (Individual Development Plans)

**As a** Team Manager, **I want** to view and edit my team members' development plans,
**so that** I can track growth goals and provide coaching.

| | |
|---|---|
| **Given** | I am on `/team/idp` |
| **When** | I open a team member's plan |
| **Then** | The plan renders; I can view team progress (`qc.journeys.view_team_progress` granted) |

---

## US-TM05: View team history

**As a** Team Manager, **I want** to see the task and activity history for my team,
**so that** I can review past performance.

| | |
|---|---|
| **Given** | I am on `/team/history` |
| **When** | The page loads |
| **Then** | Team-scoped history records are displayed (`qc.tasks.history.view` granted) |

---

## US-TM06: Create and manage projects

**As a** Team Manager, **I want** to create new projects and edit existing ones,
**so that** I can organise work for my team.

| | |
|---|---|
| **Given** | I am on `/work/projects/create` |
| **When** | I fill in project details and submit |
| **Then** | The project is created (`qc.projects.create` granted) |

| | |
|---|---|
| **Given** | I open a project I own |
| **When** | I edit the project name and save |
| **Then** | The update succeeds (`qc.projects.edit` granted) |

---

## US-TM07: Manage team tasks (take over, approve, change priority)

**As a** Team Manager, **I want** to take ownership of stalled tasks, approve completed tasks, and change task priority,
**so that** I can unblock my team and ensure correct prioritisation.

| | |
|---|---|
| **Given** | A team member's task is stalled |
| **When** | I click Take Over |
| **Then** | Task ownership transfers to me (`qc.tasks.take_over` granted) |

| | |
|---|---|
| **Given** | A team member marks a task as complete |
| **When** | I click Approve Completion |
| **Then** | Task is approved (`qc.tasks.approve_completion` granted) |

| | |
|---|---|
| **Given** | A task has incorrect priority |
| **When** | I change the priority |
| **Then** | Priority is updated (`qc.tasks.change_priority` granted) |

| | |
|---|---|
| **Given** | I attempt to manage a task outside my team |
| **When** | I try to edit or delete it |
| **Then** | Action is blocked (TEAM scope boundary) |

---

## US-TM08: Triage and manage team bugs

**As a** Team Manager, **I want** to triage, close, reopen, and adjust severity/priority of bugs for my team,
**so that** the defect backlog is accurately maintained.

| | |
|---|---|
| **Given** | I am viewing a bug from my team |
| **When** | I triage it (e.g. change severity, change priority) |
| **Then** | Triage actions succeed (`qc.bugs.triage`, `qc.bugs.change_severity`, `qc.bugs.change_priority` granted) |

| | |
|---|---|
| **Given** | A bug is resolved |
| **When** | I click Close Bug |
| **Then** | Bug status changes to Closed (`qc.bugs.close` granted) |

| | |
|---|---|
| **Given** | A previously closed bug resurfaces |
| **When** | I click Reopen Bug |
| **Then** | Bug is reopened (`qc.bugs.reopen` granted) |

---

## US-TM09: Approve test cases

**As a** Team Manager, **I want** to review and approve test cases written by my team,
**so that** only validated test cases are used in test runs.

| | |
|---|---|
| **Given** | I am viewing a team test case awaiting approval |
| **When** | I click Approve |
| **Then** | Test case status changes to Approved (`qc.testcases.approve` granted) |

---

## US-TM10: View and edit test steps

**As a** Team Manager, **I want** to read and edit the detailed steps of a test case,
**so that** I can improve or correct test procedures.

| | |
|---|---|
| **Given** | I am on a test case detail page |
| **When** | I view and then edit the test steps |
| **Then** | Steps are visible and editable (`qc.testcases.view_steps` and `qc.testcases.edit_steps` granted) |

---

## US-TM11: Approve releases in governance

**As a** Team Manager, **I want** to approve pending release gates in the governance module,
**so that** my team's releases can proceed once quality criteria are met.

| | |
|---|---|
| **Given** | A governance gate is pending release approval |
| **When** | I click Approve Release |
| **Then** | The approval is recorded (`qc.governance.approve_release` granted) |

| | |
|---|---|
| **Given** | I look for gate management controls (e.g. add/remove gates) |
| **When** | I inspect the governance page |
| **Then** | Gate management controls are absent (team_manager lacks `qc.governance.manage_gates`) |

---

## US-TM12: View and export reports

**As a** Team Manager, **I want** to view team-scoped reports and download them,
**so that** I can share quality metrics with stakeholders.

| | |
|---|---|
| **Given** | I am on `/quality/reports` |
| **When** | I view a team report and click Export |
| **Then** | The report downloads (`qc.reports.export` granted) |

---

## US-TM13: Inherit all tester capabilities

**As a** Team Manager, **I want** to retain all tester-level capabilities (create test cases, run tests, upload results, create bugs),
**so that** I can participate in hands-on QA work as well as manage my team.

| | |
|---|---|
| **Given** | I perform any scenario from [tester.md](tester.md) |
| **When** | I use `role = team_manager` |
| **Then** | All tester scenarios pass (inherited permissions) |

---

## US-TM14: ACTIVE status is required

**As a** Team Manager, **I want** to be blocked from ACTIVE_ONLY routes when my account is not ACTIVE,
**so that** the status boundary is consistently enforced.

| | |
|---|---|
| **Given** | My account status is changed to `PREPARATION` |
| **When** | I navigate to `/dashboards/team-manager` or `/team/resources` |
| **Then** | ACTIVE_ONLY routes redirect away |

---

## Out-of-scope (should be blocked)

| Action | Reason |
|--------|--------|
| Manage governance gates | Lacks `qc.governance.manage_gates` |
| Delete resources | Lacks `qc.resources.delete` |
| Delete projects | Lacks `qc.projects.delete` |
| Access Admin section | Lacks all `qc.admin.*` permissions |
| Access other teams' artifacts | TEAM scope enforced server-side |

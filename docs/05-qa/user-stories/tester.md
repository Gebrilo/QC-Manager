# Tester — User Stories

**Role key:** `tester` | **Status scope:** `ACTIVE_ONLY`

---

## US-T01: View and navigate to quality areas

**As a** Tester, **I want** to see the My Work and Quality navigation sections,
**so that** I can quickly reach test cases, runs, bugs, and reports without irrelevant admin links.

| | |
|---|---|
| **Given** | I am logged in as an `ACTIVE` tester |
| **When** | I look at the sidebar navigation |
| **Then** | I see My Work and Quality sections; Manage and Admin sections are absent |

---

## US-T02: Create and edit tasks

**As a** Tester, **I want** to create and edit tasks in the global task list,
**so that** I can track my work items alongside the team.

| | |
|---|---|
| **Given** | I am on `/work/tasks` |
| **When** | I click Create Task, fill in the form, and submit |
| **Then** | The task is created and visible in the list |

| | |
|---|---|
| **Given** | I open an existing task I created |
| **When** | I click Edit, change the title, and save |
| **Then** | The task reflects my change without error |

---

## US-T03: Manage own personal tasks

**As a** Tester, **I want** to create, edit, and delete my own personal tasks under My Work,
**so that** I can keep track of my day-to-day to-do list independently of global tasks.

| | |
|---|---|
| **Given** | I am on `/me/tasks` |
| **When** | I create a personal task, edit it, then delete it |
| **Then** | All three operations succeed; the deleted task disappears |

---

## US-T04: Create and edit test cases

**As a** Tester, **I want** to author new test cases and edit existing ones,
**so that** I can maintain an up-to-date test library for the project.

| | |
|---|---|
| **Given** | I am on `/test/cases/create` |
| **When** | I fill in title and description, then submit |
| **Then** | The test case is created and appears in `/test/cases` |

| | |
|---|---|
| **Given** | I open an existing test case I own |
| **When** | I edit the description and save |
| **Then** | The change is persisted; delete / approve / clone / export controls are not visible |

---

## US-T05: Create and edit test suites

**As a** Tester, **I want** to create test suites and add test cases to them,
**so that** I can organise related tests for a run.

| | |
|---|---|
| **Given** | I am on `/test/suites/create` |
| **When** | I provide a name and submit |
| **Then** | The suite is created; I can open it and add test cases |

| | |
|---|---|
| **Given** | I am viewing a suite I created |
| **When** | I look for a reorder control or a delete button |
| **Then** | Neither is present (tester lacks `qc.testsuites.reorder` and `qc.testsuites.delete`) |

---

## US-T06: Create and monitor test runs

**As a** Tester, **I want** to start a new test execution run and record results against it,
**so that** I can track test progress for a release.

| | |
|---|---|
| **Given** | I am on `/test/runs/create` |
| **When** | I select a project and a test suite, then submit |
| **Then** | The run is created and appears in `/test/runs` |

| | |
|---|---|
| **Given** | I open the run detail page |
| **When** | I look for an edit or delete button |
| **Then** | Neither is present (tester lacks `qc.testexecutions.edit` and `qc.testexecutions.delete`) |

---

## US-T07: Upload test results

**As a** Tester, **I want** to upload a bulk test results file with an optional back-date,
**so that** historical execution data is captured accurately in the system.

| | |
|---|---|
| **Given** | I am on `/test/results/upload` |
| **When** | I select a project, optionally pick a past execution date, upload a valid CSV, and submit |
| **Then** | The upload succeeds and the results appear in `/test/results` with the correct date |

---

## US-T08: View and generate reports

**As a** Tester, **I want** to view quality reports and trigger report generation,
**so that** I can share test metrics with stakeholders.

| | |
|---|---|
| **Given** | I am on `/quality/reports` |
| **When** | I open the reports list |
| **Then** | Existing reports are visible and a Generate button is present |

| | |
|---|---|
| **Given** | I look for an Export or Download report button |
| **When** | I check the UI or try a direct API call |
| **Then** | The export action is absent or returns 403 (tester lacks `qc.reports.export`) |

---

## US-T09: Create bugs

**As a** Tester, **I want** to report new bugs,
**so that** defects discovered during testing are tracked.

| | |
|---|---|
| **Given** | I am on `/work/bugs/create` |
| **When** | I fill in title, project, and severity, then submit |
| **Then** | The bug is created and appears in `/work/bugs` |

| | |
|---|---|
| **Given** | I open the bug I just created |
| **When** | I look for Edit and Delete buttons |
| **Then** | Neither is present (tester lacks `qc.bugs.edit` and `qc.bugs.delete`) |

---

## US-T10: ACTIVE status is required

**As a** Tester, **I want** to be blocked from quality routes when my account is not ACTIVE,
**so that** suspended or preparation-stage accounts cannot access sensitive test data.

| | |
|---|---|
| **Given** | My account status is changed to `PREPARATION` or `SUSPENDED` |
| **When** | I navigate to `/work/tasks`, `/test/runs`, or `/quality/reports` |
| **Then** | All ACTIVE_ONLY routes redirect away; only `/me/tasks` (non-scoped) remains accessible |

---

## Out-of-scope (should be blocked)

| Action | Reason |
|--------|--------|
| Delete tasks (global) | Lacks `qc.tasks.delete` |
| Delete bugs | Lacks `qc.bugs.delete` |
| Edit / Delete test runs | Lacks `qc.testexecutions.edit/delete` |
| Delete test results | Lacks `qc.testresults.delete` |
| Export reports | Lacks `qc.reports.export` |
| Access governance | Lacks `qc.governance.view` |
| Access Manage / Admin sections | Role not granted any admin or team-manage permissions |

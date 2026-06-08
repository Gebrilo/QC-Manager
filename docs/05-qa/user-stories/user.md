# User — User Stories

**Role key:** `user` (legacy alias for `tester`) | **Status scope:** `ACTIVE_ONLY`

> `user` is a backwards-compatibility alias. It inherits all `tester` permissions via `inherits: ['tester']`.
> Any behavioral difference between `user` and `tester` is a bug.
> See also: [tester.md](tester.md) for the canonical role.

---

## US-U01: Same navigation as tester

**As a** User (legacy), **I want** to see the same My Work and Quality navigation as a Tester,
**so that** my existing account keeps working after any role-system update.

| | |
|---|---|
| **Given** | I am logged in with `role = user` and `status = ACTIVE` |
| **When** | I look at the sidebar |
| **Then** | My Work and Quality sections are visible; Manage and Admin are absent — identical to `tester` |

---

## US-U02: Create and edit tasks

**As a** User (legacy), **I want** to create and edit global tasks,
**so that** my task workflow is unaffected by using the legacy role key.

| | |
|---|---|
| **Given** | I am on `/work/tasks/create` |
| **When** | I fill in required fields and submit |
| **Then** | Task is created — identical to `tester` behavior |

---

## US-U03: Author and edit test cases

**As a** User (legacy), **I want** to create and edit test cases,
**so that** my QA authoring workflow continues without role migration.

| | |
|---|---|
| **Given** | I am on `/test/cases/create` |
| **When** | I submit a new test case |
| **Then** | Test case is created; delete / approve / clone / export controls are absent |

---

## US-U04: Create and manage test suites

**As a** User (legacy), **I want** to create test suites and add test cases to them,
**so that** I can organise tests the same way a tester would.

| | |
|---|---|
| **Given** | I am on `/test/suites/create` |
| **When** | I create a suite and add a test case |
| **Then** | Suite is created; reorder and delete controls are absent |

---

## US-U05: Start test runs

**As a** User (legacy), **I want** to create test execution runs,
**so that** I can record test outcomes.

| | |
|---|---|
| **Given** | I am on `/test/runs/create` |
| **When** | I select a project and suite, then submit |
| **Then** | Test run is created — identical to `tester` behavior |

---

## US-U06: Upload test results

**As a** User (legacy), **I want** to upload bulk test result files,
**so that** historical test data is captured correctly.

| | |
|---|---|
| **Given** | I am on `/test/results/upload` |
| **When** | I upload a valid CSV with an optional execution date |
| **Then** | Upload succeeds — identical to `tester` behavior |

---

## US-U07: View and generate reports

**As a** User (legacy), **I want** to view reports and trigger generation,
**so that** I can produce QA summaries.

| | |
|---|---|
| **Given** | I am on `/quality/reports` |
| **When** | I generate a report |
| **Then** | Report is generated; export is absent or returns 403 |

---

## US-U08: Create bugs

**As a** User (legacy), **I want** to report bugs,
**so that** defects are tracked.

| | |
|---|---|
| **Given** | I am on `/work/bugs/create` |
| **When** | I submit a bug report |
| **Then** | Bug is created; edit and delete controls are absent |

---

## US-U09: Manage own personal tasks

**As a** User (legacy), **I want** to create, edit, and delete personal tasks in My Work,
**so that** my personal task management is unaffected by the legacy role key.

| | |
|---|---|
| **Given** | I am on `/me/tasks` |
| **When** | I create, edit, and then delete a personal task |
| **Then** | All operations succeed |

---

## US-U10: ACTIVE status is required

**As a** User (legacy), **I want** to be blocked from ACTIVE_ONLY routes when my account is inactive,
**so that** the status enforcement is consistent with the `tester` baseline.

| | |
|---|---|
| **Given** | My account status is changed to `PREPARATION` or `SUSPENDED` |
| **When** | I navigate to any ACTIVE_ONLY route |
| **Then** | I am redirected away — same behavior as `tester` |

---

## Permission parity check

All scenarios from [tester.md](tester.md) must produce the same result when run with `role = user`.
Any divergence is a compatibility bug.

| Parity test | Expected |
|-------------|----------|
| Navigation (no Manage / Admin) | Pass |
| Task create / edit | Pass |
| Test case create / edit | Pass |
| Test suite create / edit | Pass |
| Test run create | Pass |
| Test results upload | Pass |
| Reports view / generate (no export) | Pass |
| Bug create (no edit / delete) | Pass |
| Delete denied (tasks, bugs, test runs) | Pass |
| Governance blocked | Pass |

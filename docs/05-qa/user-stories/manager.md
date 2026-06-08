# Manager — User Stories

**Role key:** `manager` (legacy alias for `team_manager`) | **Status scope:** `ACTIVE_ONLY` + `TEAM`

> `manager` is a backwards-compatibility alias. It inherits all `team_manager` permissions via `inherits: ['team_manager']`.
> Any behavioral difference between `manager` and `team_manager` is a bug unless explicitly documented.
> See also: [team-manager.md](team-manager.md) for the canonical role.

---

## US-MG01: Same dashboard access as team_manager

**As a** Manager (legacy), **I want** to access the Team Manager Dashboard,
**so that** existing accounts using the `manager` role key continue working without migration.

| | |
|---|---|
| **Given** | I am logged in with `role = manager` and `status = ACTIVE` |
| **When** | I navigate to `/dashboards/team-manager` |
| **Then** | The Team Dashboard loads — identical to the behavior for `team_manager` |

---

## US-MG02: Team-scoped task management

**As a** Manager (legacy), **I want** to view, edit, delete, take over, and approve team tasks,
**so that** my team's work is managed correctly under the old role key.

| | |
|---|---|
| **Given** | I am on `/work/tasks` |
| **When** | I view tasks in my team's scope |
| **Then** | I can edit, delete, take over, approve completion, and change priority — same as `team_manager` |

---

## US-MG03: Team-scoped bug triage

**As a** Manager (legacy), **I want** to triage, close, reopen, and change severity/priority for team bugs,
**so that** defect management is not blocked by a role key rename.

| | |
|---|---|
| **Given** | I am on `/work/bugs` |
| **When** | I open a bug assigned to my team |
| **Then** | Triage, close, reopen, change-severity, and change-priority actions are available |

---

## US-MG04: Test case approval

**As a** Manager (legacy), **I want** to approve test cases within my team,
**so that** the QA approval workflow is unaffected by using the legacy role.

| | |
|---|---|
| **Given** | I am viewing a test case created by a team member |
| **When** | I click Approve |
| **Then** | The approval succeeds — identical to the behavior for `team_manager` |

---

## US-MG05: Resource management

**As a** Manager (legacy), **I want** to create and edit team resources,
**so that** resource allocation continues to work with the `manager` role key.

| | |
|---|---|
| **Given** | I am on `/team/resources/create` |
| **When** | I fill in details and submit |
| **Then** | Resource is created (no difference vs. `team_manager`) |

---

## US-MG06: Legacy API paths accept manager role

**As a** Manager (legacy), **I want** paths that branch on `role === 'manager'` to work correctly,
**so that** my accounts are not rejected by legacy non-Access-Engine route guards.

| | |
|---|---|
| **Given** | I call team-management API endpoints that still use `role === 'manager'` checks |
| **When** | My JWT carries `role: manager` |
| **Then** | Those paths accept the request — no 403 for legacy-guarded routes |

---

## US-MG07: Governance — approve releases

**As a** Manager (legacy), **I want** to approve releases in the governance module,
**so that** my team's release workflow is not broken by the alias.

| | |
|---|---|
| **Given** | A governance gate is in pending-approval state |
| **When** | I click Approve Release |
| **Then** | Approval succeeds (permission inherited via `team_manager`) |

---

## US-MG08: ACTIVE status is required

**As a** Manager (legacy), **I want** to be blocked from ACTIVE_ONLY routes when inactive,
**so that** suspended `manager` accounts cannot access team data.

| | |
|---|---|
| **Given** | My account status is changed to `PREPARATION` |
| **When** | I navigate to `/dashboards/team-manager` or `/work/tasks` |
| **Then** | ACTIVE_ONLY routes redirect away — same as `team_manager` behavior |

---

## Permission parity check

All scenarios from [team-manager.md](team-manager.md) must produce the same result when run with `role = manager`.
Any divergence is a compatibility bug.

| Parity test | Expected |
|-------------|----------|
| Navigation (Team Dashboard visible) | Pass |
| Team resource CRUD | Pass |
| Team task management (take over, approve, priority) | Pass |
| Bug triage / close / reopen | Pass |
| Test case approval | Pass |
| Governance release approval | Pass |
| Report export | Pass |
| Admin section blocked | Pass |

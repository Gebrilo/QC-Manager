# Test Traceability, Suites, Runs, Bugs, and Governance Handoff

## Purpose

This document hands off the remaining work after the backend foundation for normalized test traceability was added.

The product goal is to support this chain:

```text
User Story optional root
  -> Task
  -> Test Cases
  -> Test Suite
  -> Test Run
  -> Test Executions
  -> Bugs
```

The model must also support:

- A task without a user story.
- A test case reused by multiple tasks.
- A test suite reused independently of tasks.
- A bug found from one or more test executions.
- A bug assigned directly to one or more tasks.
- A bug created without task/test evidence, flagged as needing triage.
- Governance insights by task coverage, story coverage, suite readiness, and project readiness.

## Decisions Already Made

- Test cases can be linked to multiple tasks.
- Tasks can have multiple test cases.
- Test suites are independent reusable collections, filtered by project.
- Test runs are immutable historical snapshots.
- Bugs found during testing link to `test_execution` first.
- One bug can link to multiple test executions.
- Standalone bugs can be created without task/test evidence, but must be flagged as `untriaged` / needs link.
- Task to user story uses local QC UUID as the real relation and stores the Tuleap artifact ID separately.
- Backend global search is one shared endpoint reused by future top-bar search and relationship pickers.
- Global search defaults to non-deleted records only.
- Governance shows both task coverage and story coverage; task coverage is the operational metric.
- Only `active` test cases count toward governance coverage.
- Release/readiness insight uses latest completed test runs, not in-progress runs.
- Governance readiness is calculated per suite and rolled up per project.
- Project readiness should consider the latest completed run for every required active suite.
- Required suites with no completed run block readiness.
- Old array/snapshot fields remain temporarily for compatibility while normalized tables are adopted gradually.

## Backend Foundation Already Implemented

Implemented in `apps/api/src/config/db.js`:

- `task_test_cases`
  - Many-to-many link between `tasks` and `test_case`.
  - `relationship_type` defaults to `covers`.
- `bug_test_executions`
  - Many-to-many link between `bugs` and `test_execution`.
- `bug_tasks`
  - Many-to-many link between `bugs` and `tasks`.
- `test_run_suite_cases`
  - Clean historical run snapshot table.
  - Stores `test_run_id`, `original_suite_id`, `test_case_id`, `sort_order`, and test case title/steps/expected-result snapshots.
- `tasks.parent_user_story_id`
  - UUID FK to `user_stories(id)`.
- `tasks.parent_story_tuleap_artifact_id`
  - External Tuleap artifact ID retained separately.
- `test_suites.readiness_scope`
  - `required` or `optional`.
- `test_suites.suite_type`
  - `smoke`, `regression`, `acceptance`, `security`, `performance`, or `other`.
- `bugs.triage_status`
  - `untriaged` or `triaged`.
- Compatibility/reporting views:
  - `v_task_test_coverage`
  - `v_user_story_test_coverage`
  - `v_bug_traceability`

Implemented in routes/services:

- `POST /test-executions/test-runs/from-suite` now writes `test_run_suite_cases` while retaining old `test_suite_cases.snapshot_id` behavior.
- `testSuites` create/update/clone accepts `readiness_scope` and `suite_type`.
- Tuleap task persister writes both `parent_user_story_id` and `parent_story_tuleap_artifact_id`.
- Bug create/update writes normalized `bug_test_executions` and `bug_tasks` when `linked_test_execution_ids` or `linked_task_ids` are supplied.
- `GET /search` added and mounted.

Global search behavior:

```text
GET /search?q=login
GET /search?q=TSK-123&type=task
GET /search?q=bug title&type=bug,test_case&limit=20
GET /search?q=login&project_id=<uuid>
GET /search?q=login&include_archived=true
```

Searchable types:

- `task`
- `user_story`
- `test_case`
- `bug`

The response shape is normalized:

```json
{
  "data": [
    {
      "type": "task",
      "id": "local-uuid",
      "display_id": "TSK-001",
      "title": "Login task",
      "project_id": "project-uuid",
      "project_name": "Project A",
      "status": "In Progress",
      "url": "/tasks/local-uuid"
    }
  ],
  "meta": {
    "q": "login",
    "limit": 10,
    "types": ["task"]
  }
}
```

## Verification Already Done

Full API test suite passes:

```text
40 passed, 1 skipped
323 passed, 1 skipped
```

The skipped test is the live DB connection check. It now uses:

```text
DATABASE_URL || SUPABASE_DATABASE_URL
```

and skips when no Supabase connection string is present in the test shell.

## Important Compatibility Notes

Do not remove these yet:

- `bugs.linked_test_case_ids`
- `bugs.linked_test_execution_ids`
- `test_suite_cases.snapshot_id`
- `tasks.parent_story_id`

They are legacy compatibility fields. Existing pages and integrations may still read them.

New work should prefer normalized tables:

- Use `task_test_cases` for task/test-case traceability.
- Use `bug_test_executions` for bugs found during runs.
- Use `bug_tasks` for standalone/task-assigned bugs.
- Use `test_run_suite_cases` for historical suite run composition.
- Use `tasks.parent_user_story_id` for local joins to user stories.

## Remaining Work

### Slice 1: Task/Test Case Linking API

Add backend endpoints to manage task to test case links.

Recommended endpoints:

```text
GET    /tasks/:id/test-cases
POST   /tasks/:id/test-cases
DELETE /tasks/:id/test-cases/:testCaseId

GET    /test-cases/:id/tasks
POST   /test-cases/:id/tasks
DELETE /test-cases/:id/tasks/:taskId
```

Rules:

- Both records must exist and be non-deleted.
- Prefer same project. If cross-project is allowed later, make it explicit and audited.
- Do not duplicate links; rely on `UNIQUE(task_id, test_case_id)`.
- Only `active` test cases count for governance coverage, but UI can show all linked cases with status badges.

Recommended tests:

- Add active test case to task.
- Reject missing task.
- Reject missing test case.
- Prevent duplicate links.
- List linked cases for task.
- List linked tasks for test case.
- Delete link.

### Slice 2: Bug Linking API

Add backend endpoints for normalized bug traceability.

Recommended endpoints:

```text
GET    /bugs/:id/test-executions
POST   /bugs/:id/test-executions
DELETE /bugs/:id/test-executions/:executionId

GET    /bugs/:id/tasks
POST   /bugs/:id/tasks
DELETE /bugs/:id/tasks/:taskId
```

Rules:

- A bug linked to at least one test execution or task should become `triaged`.
- A bug with no execution/task/test-case link should remain or become `untriaged`.
- Keep legacy arrays updated only where existing screens need them.
- A bug may link to multiple executions.
- A bug may link to multiple tasks if ownership crosses work items.

Recommended tests:

- Link one bug to multiple executions.
- Link bug directly to task.
- Mark bug `triaged` after adding evidence.
- Mark bug `untriaged` when all evidence is removed, if product wants automatic downgrade.
- Preserve legacy `linked_test_execution_ids` when needed.

### Slice 3: Governance Readiness Queries

Add backend queries/views for suite and project readiness.

Suite readiness should use:

```text
latest completed test_run per active suite
```

Project readiness should use:

```text
latest completed run for each active required suite in the project
```

Required active suite with no completed run:

```text
project readiness = blocked
risk reason = missing_required_suite_run
```

Recommended risk reasons:

- `missing_required_suite_run`
- `pass_rate_below_threshold`
- `failed_cases_present`
- `blocked_cases_present`
- `untriaged_bugs_present`
- `task_test_coverage_below_threshold`
- `story_test_coverage_below_threshold`

Recommended new/updated API:

```text
GET /governance/test-coverage?project_id=<uuid>
GET /governance/suite-readiness?project_id=<uuid>
GET /governance/project-readiness?project_id=<uuid>
```

Suggested response fields:

```json
{
  "project_id": "uuid",
  "readiness_status": "ready | warning | blocked | unknown",
  "task_test_coverage_pct": 72.5,
  "story_test_coverage_pct": 80,
  "required_suites_total": 4,
  "required_suites_with_completed_run": 3,
  "risk_reasons": ["missing_required_suite_run"],
  "suites": []
}
```

### Slice 4: UI Relationship Pickers

Use `GET /search` for all pickers.

Recommended UI additions:

- Task detail page:
  - Linked test cases panel.
  - Add test case picker.
  - Remove link action.
- Test case detail page:
  - Linked tasks panel.
  - Add task picker.
- Bug detail/edit pages:
  - Linked tasks panel.
  - Linked test executions panel.
  - Mark untriaged bugs clearly.
- Test run detail page:
  - On failed execution, allow linking or creating a bug.

Keep UI dense and operational; avoid large marketing-style cards.

### Slice 5: Governance UI

Update governance page to show:

- Task test coverage.
- Story test coverage.
- Suite readiness table.
- Project readiness roll-up.
- Required suite missing-run blockers.
- Untriaged bug count.

Suite readiness table should show:

- Suite ID/name/type/scope.
- Latest completed run.
- Pass/fail/blocked/not-run counts.
- Pass rate.
- Readiness status.
- Risk reason.

### Slice 6: Migrate Away From Legacy Reads

After the new APIs/UI are live:

- Replace reads from `bugs.linked_test_execution_ids` with `bug_test_executions`.
- Replace reads from `bugs.linked_test_case_ids` with derived joins through executions or explicit compatibility views.
- Replace run snapshot reads from `test_suite_cases.snapshot_id` with `test_run_suite_cases`.
- Replace user story joins through `tasks.parent_story_id` with `tasks.parent_user_story_id`.

Only after all consumers are migrated should legacy columns be considered for removal.

## Suggested Next Prompt For Coding Agent

```text
Implement Slice 1 from docs/superpowers/plans/2026-05-13-test-traceability-governance-handoff.md.

Scope:
- Backend only.
- Add task/test-case linking endpoints.
- Use normalized task_test_cases table.
- Keep existing behavior and legacy fields untouched.
- Add focused Jest route tests.
- Run relevant API tests.
```

## Files To Read First

- `apps/api/src/config/db.js`
- `apps/api/src/routes/tasks.js`
- `apps/api/src/routes/testCases.js`
- `apps/api/src/routes/search.js`
- `apps/api/src/routes/testExecutions.js`
- `apps/api/src/routes/bugs.js`
- `apps/api/__tests__/suiteRuns.workflow.test.js`
- `apps/api/__tests__/search.routes.test.js`

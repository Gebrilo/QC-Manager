# Tasks: N8N Workflow Validation

**Input**: Design documents from `/specs/004-n8n-workflow-validation/`  
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Included — the spec and plan explicitly call for automated tests (Jest API tests + workflow validation script).

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Project initialization, test framework setup, and shared tooling

- [x] T001 Add Jest dev dependency and test script to `apps/api/package.json`
- [x] T002 [P] Create test directory structure at `apps/api/__tests__/`
- [x] T003 [P] Create Jest config file at `apps/api/jest.config.js` with Node.js test environment and module path mappings
- [x] T004 [P] Create shared test fixtures file at `apps/api/__tests__/fixtures/tuleapPayloads.js` with sample Tuleap artifact payloads (task, bug, form-urlencoded) based on the artifact structure documented in `specs/004-n8n-workflow-validation/data-model.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Fix critical cross-cutting issues that affect ALL user stories before per-story validation

**⚠️ CRITICAL**: No user story work can begin until these issues are resolved

- [x] T005 Standardize PostgreSQL credential naming across all n8n workflow files — rename "Local Postgres" and "Postgres account" to "QC Tool Postgres" with ID "1" in `n8n/workflows/02_Update_Task.json`, `n8n/workflows/03_Generate_Report.json`, `n8n/workflows/task_automation.json`, and `n8n/qc_generate_project_summary_pdf.json`
- [x] T006 [P] Add `computed` field type handling to `getFieldValue()` in the "Extract Task Data" code node of `n8n/workflows/tuleap_task_sync.json` — return `field.value` for type `computed`
- [x] T007 [P] Add `computed` and `aid` field type handling to `getFieldValue()` in the "Transform Bug Data" code node of `n8n/workflows/tuleap_bug_sync.json` — return `field.value` for types `computed` and ensure `aid` is handled
- [x] T008 [P] Create database mock helper at `apps/api/__tests__/helpers/dbMock.js` — mock `pool.query` from `apps/api/src/config/db.js` and `auditLog` from `apps/api/src/middleware/audit.js` for use in all test files

**Checkpoint**: Foundation ready — all credential names consistent, field types supported, test infrastructure in place

---

## Phase 3: User Story 1 — Task Sync Workflow Validation (Priority: P1) 🎯 MVP

**Goal**: Validate the Tuleap task sync workflow correctly parses artifacts, extracts task data, resolves assignees, and creates/updates tasks in the QC Tool

**Independent Test**: Send a sample Tuleap task webhook payload and verify a task is created/updated in the database with correct field values

### Tests for User Story 1

- [x] T009 [P] [US1] Write Jest test: task creation via `POST /tuleap-webhook/task` with action `create` in `apps/api/__tests__/tuleapWebhook.task.test.js` — verify task is inserted with `synced_from_tuleap = TRUE`, correct `task_id` generated, and audit log created
- [x] T010 [P] [US1] Write Jest test: task update via `POST /tuleap-webhook/task` with action `update` for an existing `tuleap_artifact_id` in `apps/api/__tests__/tuleapWebhook.task.test.js` — verify fields are updated, not duplicated
- [x] T011 [P] [US1] Write Jest test: task creation falls through from `update` action when task doesn't exist in `apps/api/__tests__/tuleapWebhook.task.test.js`
- [x] T012 [P] [US1] Write Jest test: missing `task_name` returns 400 error in `apps/api/__tests__/tuleapWebhook.task.test.js`
- [x] T013 [P] [US1] Write Jest test: duplicate task (same `tuleap_artifact_id` already exists) returns `action: 'exists'` in `apps/api/__tests__/tuleapWebhook.task.test.js`

### Implementation for User Story 1

- [x] T014 [US1] Fix resource lookup handling in "Build Request" code node of `n8n/workflows/tuleap_task_sync.json` — change `resourceResponse.data` to `resourceResponse.data && resourceResponse.data[0]` to handle the array response from `/tuleap-webhook/resources`
- [ ] T015 [US1] Fix the "Lookup Resource" node in `n8n/workflows/tuleap_task_sync.json` — add error handling for when the HTTP request fails (QC API unreachable), default to `null` resource
- [ ] T016 [US1] Add explicit JSDoc comment documenting the intentional fall-through from `case 'update'` to `case 'create'` at line 473 in `apps/api/src/routes/tuleapWebhook.js`
- [ ] T017 [US1] Add input validation for `tuleap_artifact_id` (must be a positive integer) in the `POST /task` route of `apps/api/src/routes/tuleapWebhook.js`

**Checkpoint**: Task sync workflow is validated — tasks from Tuleap are correctly processed through n8n → QC API → database

---

## Phase 4: User Story 2 — Bug Sync Workflow Validation (Priority: P2)

**Goal**: Validate the bug sync workflow correctly maps Tuleap bug status and severity to QC Tool values

**Independent Test**: Send a Tuleap bug artifact payload and verify the bug record has correctly mapped status/severity

### Tests for User Story 2

- [x] T018 [P] [US2] Write Jest test: bug creation via `POST /tuleap-webhook/bug` in `apps/api/__tests__/tuleapWebhook.bug.test.js` — verify status mapping (Tuleap "New" → QC "Open") and severity mapping (Tuleap "Critical" → QC "critical")
- [x] T019 [P] [US2] Write Jest test: bug update for existing `tuleap_artifact_id` in `apps/api/__tests__/tuleapWebhook.bug.test.js` — verify fields updated, not duplicated
- [x] T020 [P] [US2] Write Jest test: missing `tuleap_artifact_id` or `title` returns 400 error in `apps/api/__tests__/tuleapWebhook.bug.test.js`

### Implementation for User Story 2

- [ ] T021 [US2] Fix the "Transform Bug Data" code node in `n8n/workflows/tuleap_bug_sync.json` — include `bug_id` field (`TLP-${artifact.id}`) in the payload sent to `POST /tuleap-webhook/bug`
- [x] T022 [US2] Fix `assigned_to` extraction in the "Transform Bug Data" code node of `n8n/workflows/tuleap_bug_sync.json` — use dedicated user field extraction (check for `display_name`, `username`, `label` in `values[0]`) instead of generic `getFieldValue()`

**Checkpoint**: Bug sync validated — bugs from Tuleap are correctly processed with accurate status/severity mapping

---

## Phase 5: User Story 3 — Idempotency and Webhook Logging (Priority: P2)

**Goal**: Verify duplicate webhook deliveries are handled gracefully and all events are logged

**Independent Test**: Send the same payload twice and verify only one record is created; check `tuleap_webhook_log` for both receipts

### Tests for User Story 3

- [ ] T023 [P] [US3] Write Jest test: webhook log entry is created on task processing in `apps/api/__tests__/tuleapWebhook.logging.test.js` — verify `logWebhook()` is called with correct `processing_status`
- [ ] T024 [P] [US3] Write Jest test: duplicate payload (same `tuleap_artifact_id` + same body) doesn't create duplicate task in `apps/api/__tests__/tuleapWebhook.logging.test.js`
- [ ] T025 [P] [US3] Write Jest test: webhook for tracker with no sync config returns `{"success": false}` in `apps/api/__tests__/tuleapWebhook.logging.test.js`

### Implementation for User Story 3

- [ ] T026 [US3] Verify and document the `ON CONFLICT (tuleap_artifact_id, payload_hash) DO NOTHING` constraint in the "Log Webhook" node of `n8n/workflows/tuleap_task_sync.json` — add inline comment explaining the idempotency mechanism
- [ ] T027 [US3] Verify the "Has Config?" branch in `n8n/workflows/tuleap_task_sync.json` correctly routes to "Respond No Config" when `Get Sync Config` returns empty results — review the condition `json.length > 0`

**Checkpoint**: Idempotency verified — duplicate webhooks are safe, all events are traceable in logs

---

## Phase 6: User Story 4 — Report Generation and Export (Priority: P3)

**Goal**: Validate report export workflows generate correct Excel files with proper filtering

**Independent Test**: Trigger the task export endpoint and verify the workflow produces filtered data

### Implementation for User Story 4

- [ ] T028 [US4] Verify the query builder in "Build Dynamic Query" code node of `n8n/qc_generate_task_export_excel.json` correctly handles all filter combinations (project_id, status array, date_from, date_to, assignee)
- [ ] T029 [US4] Verify the "Has Results?" node in `n8n/qc_generate_task_export_excel.json` correctly routes to the "Error: No Data" response when query returns zero rows
- [ ] T030 [P] [US4] Verify the retention policy in "Define Retention Policy" code node of `n8n/qc_cleanup_expired_reports.json` correctly calculates cutoff dates for on-demand (7 days), scheduled (90 days), and temp (1 day) categories

**Checkpoint**: Report workflows validated — exports and cleanup function correctly

---

## Phase 7: User Story 5 — Sync Config Management (Priority: P3)

**Goal**: Validate sync configuration CRUD operations and upsert behavior

**Independent Test**: Create a sync config, then POST the same `(tuleap_project_id, tuleap_tracker_id)` pair to verify upsert

### Tests for User Story 5

- [x] T031 [P] [US5] Write Jest test: create sync config via `POST /tuleap-webhook/config` in `apps/api/__tests__/tuleapWebhook.config.test.js` — verify config is inserted and returns valid data
- [x] T032 [P] [US5] Write Jest test: upsert sync config with same `(tuleap_project_id, tuleap_tracker_id)` in `apps/api/__tests__/tuleapWebhook.config.test.js` — verify existing config is updated, not duplicated
- [x] T033 [P] [US5] Write Jest test: missing required fields returns 400 error in `apps/api/__tests__/tuleapWebhook.config.test.js`

### Implementation for User Story 5

- [x] T034 [US5] Write Jest test: resource lookup by name and by email via `GET /tuleap-webhook/resources` in `apps/api/__tests__/tuleapWebhook.config.test.js`
- [ ] T035 [US5] Fix the `/resources` endpoint response in `apps/api/src/routes/tuleapWebhook.js` — when `name` query param is provided and exactly one result matches, also return `data` as the first element for backward compatibility with n8n workflow expectations (add `data: result.rows.length === 1 ? result.rows[0] : result.rows`)

**Checkpoint**: Config management validated — sync configs can be created, updated, and queried

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, static validation, and final cleanup

- [x] T036 [P] Create workflow JSON validation script at `n8n/validate-workflows.js` — validate all workflow files have required fields (`name`, `nodes`, `connections`), all nodes have required props, all connection references point to existing nodes, and flag duplicate webhook paths
- [x] T037 [P] Update `n8n/README.md` — add Tuleap Sync Workflows section documenting `tuleap_task_sync.json` and `tuleap_bug_sync.json` with webhook URLs (`/webhook/tuleap-task`, `/webhook/tuleap-bug`), payload format, and sync config requirements
- [x] T038 [P] Add false-branch handling to `n8n/workflows/02_Update_Task.json` — add a no-op or log node for when "Is Completed?" condition is false
- [ ] T039 Fix duplicate webhook path conflict — `n8n/workflows/01_Create_Task.json` and `n8n/workflows/task_automation.json` both use `/webhook/task-created`. Either remove the stub or rename the path. Document decision in `n8n/README.md`
- [x] T040 Run `node n8n/validate-workflows.js` and fix any remaining structural issues across all workflow JSON files
- [ ] T041 Run `npx jest --verbose` from `apps/api/` and verify all tests pass
- [ ] T042 Run `specs/004-n8n-workflow-validation/quickstart.md` validation steps end-to-end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Stories (Phases 3–7)**: All depend on Foundational completion
  - US1 (task sync) can start independently
  - US2 (bug sync) can start independently (parallel with US1)
  - US3 (idempotency) can start independently (parallel with US1/US2)
  - US4 (reports) can start independently
  - US5 (config) can start independently
- **Polish (Phase 8)**: Depends on all story phases being complete

### User Story Dependencies

- **US1 (P1 — Task Sync)**: Independent. No dependency on other stories.
- **US2 (P2 — Bug Sync)**: Independent. Shares `getFieldValue()` helper pattern with US1 but in separate workflow file.
- **US3 (P2 — Idempotency)**: Independent. Validates cross-cutting logging in task/bug workflows.
- **US4 (P3 — Reports)**: Independent. Separate workflow files entirely.
- **US5 (P3 — Config)**: Independent. Tests the config API that US1/US2 workflows depend on at runtime, but the code is separate.

### Within Each User Story

1. Tests FIRST (write and verify they fail)
2. Workflow JSON fixes
3. API route fixes (if applicable)
4. Verify tests now pass

### Parallel Opportunities

- T002, T003, T004 (Phase 1 setup) — all parallel
- T005, T006, T007, T008 (Phase 2 foundation) — T006/T007/T008 parallel; T005 touches multiple files but can parallel with others
- T009–T013 (US1 tests) — all parallel
- T018–T020 (US2 tests) — all parallel
- T023–T025 (US3 tests) — all parallel
- T031–T033 (US5 tests) — all parallel
- T036, T037, T038 (Polish) — all parallel
- **All US phases (3–7) can run in parallel with each other**

---

## Parallel Example: User Story 1

```text
# Write all US1 tests in parallel:
T009: Jest test — task creation (apps/api/__tests__/tuleapWebhook.task.test.js)
T010: Jest test — task update (same file, different describe block)
T011: Jest test — update fall-through (same file)
T012: Jest test — missing task_name 400 (same file)
T013: Jest test — duplicate task (same file)

# Then implement fixes sequentially:
T014: Fix resource lookup in tuleap_task_sync.json
T015: Add error handling for HTTP request failure
T016: Add JSDoc comment for fall-through
T017: Add input validation
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T004)
2. Complete Phase 2: Foundational (T005–T008)
3. Complete Phase 3: User Story 1 — Task Sync (T009–T017)
4. **STOP and VALIDATE**: Run `npx jest __tests__/tuleapWebhook.task.test.js --verbose`
5. Send a test payload via quickstart.md to verify end-to-end

### Incremental Delivery

1. Setup + Foundational → Infrastructure ready
2. US1 (Task Sync) → Core sync validated → **MVP complete**
3. US2 (Bug Sync) → Bug tracking validated
4. US3 (Idempotency) → Production safety confirmed
5. US4 (Reports) → Export workflows validated
6. US5 (Config) → Config management validated
7. Polish → Documentation, static validation, cleanup

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Tests are written FIRST to verify they fail, then implementation fixes are applied
- Commit after each completed user story phase
- All n8n workflow changes are JSON edits — no n8n runtime needed for the edits themselves
- API tests use mocked database — no Docker required to run tests

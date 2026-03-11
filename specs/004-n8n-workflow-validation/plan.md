# Implementation Plan: N8N Workflow Validation

**Branch**: `004-n8n-workflow-validation` | **Date**: 2026-03-02 | **Spec**: [spec.md](file:///d:/Claude/QC%20management%20tool/specs/004-n8n-workflow-validation/spec.md)
**Input**: Feature specification from `/specs/004-n8n-workflow-validation/spec.md`

## Summary

Validate and harden all existing n8n workflows that synchronize tasks, bugs, and reports between Tuleap and the QC Management Tool. The work focuses on ensuring the workflow JSON definitions correctly handle the Tuleap artifact JSON structure, verifying the QC API webhook endpoints process data correctly (create/update/reject/archive), and confirming idempotency, field mapping, and status mapping behave as specified. This includes fixing any discovered issues in the existing workflow JSONs and API routes, plus adding automated tests.

## Technical Context

**Language/Version**: Node.js 18 (Express API), n8n workflow JSON  
**Primary Dependencies**: Express.js, node-postgres (pg), n8n-nodes-base, crypto  
**Storage**: PostgreSQL 15 (tables: `tasks`, `bugs`, `tuleap_sync_config`, `tuleap_webhook_log`, `tuleap_task_history`)  
**Testing**: Jest (to be added for API route tests), manual n8n workflow verification  
**Target Platform**: Docker containers (Linux/Alpine) — local and production  
**Project Type**: Web service (API + workflow automation)  
**Performance Goals**: Webhook processing < 30 seconds end-to-end  
**Constraints**: Must handle duplicate webhooks idempotently, must parse both JSON and form-urlencoded payloads  
**Scale/Scope**: ~10 n8n workflows, 1 API route file (753 lines), 5 database tables

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality | ✅ PASS | Existing code is readable; plan adds documentation and validation |
| II. Testing Standards | ⚠️ PARTIAL | No existing unit tests for tuleapWebhook.js — plan adds Jest tests |
| III. UX Consistency | ✅ PASS | N/A for backend workflows; API responses follow consistent JSON format |
| IV. Performance | ✅ PASS | Webhook processing targets < 30s; payload hashing is O(n) |
| Security | ✅ PASS | Payload hashing for idempotency; parameterized SQL queries in API |
| Accessibility | ✅ PASS | N/A for backend workflows |

**Gate Result**: PASS — Testing gap addressed by adding Jest test suite in this plan.

## Project Structure

### Documentation (this feature)

```text
specs/004-n8n-workflow-validation/
├── plan.md              # This file
├── research.md          # Phase 0: Research findings
├── data-model.md        # Phase 1: Entity model
├── quickstart.md        # Phase 1: Getting started guide
├── contracts/           # Phase 1: API contracts
│   └── tuleap-webhook-api.md
└── tasks.md             # Phase 2: Task breakdown (from /speckit.tasks)
```

### Source Code (repository root)

```text
apps/api/
├── src/
│   ├── routes/
│   │   └── tuleapWebhook.js       # Tuleap webhook API (existing, to validate/fix)
│   ├── config/
│   │   └── db.js                   # Database connection
│   ├── middleware/
│   │   └── audit.js                # Audit logging
│   └── utils/
│       └── n8n.js                  # n8n webhook trigger utility
├── __tests__/                      # NEW: Test directory
│   └── tuleapWebhook.test.js       # NEW: API route tests
└── package.json                    # Update: add jest dev dependency

n8n/
├── workflows/
│   ├── tuleap_task_sync.json       # Validate: field extraction, resource lookup
│   ├── tuleap_bug_sync.json        # Validate: status/severity mapping
│   ├── 01_Create_Task.json         # Validate: stub workflow (no-op)
│   ├── 02_Update_Task.json         # Validate: completion logging
│   ├── 03_Generate_Report.json     # Validate: report generation
│   ├── create_project.json         # Validate: stub workflow (no-op)
│   └── task_automation.json        # Validate: audit logging
├── qc_cleanup_expired_reports.json # Validate: retention policy
├── qc_generate_project_summary_pdf.json  # Validate: PDF generation
├── qc_generate_task_export_excel.json    # Validate: Excel export
└── README.md                       # Update: add Tuleap sync workflow docs

database/
└── migrations/
    └── 005_tuleap_integration.sql  # Reference only (already applied)
```

**Structure Decision**: Existing monorepo structure with `apps/api` for backend and `n8n/workflows` for automation. No new directories except `apps/api/__tests__/` for the new test suite.

## Proposed Changes

### Component 1: N8N Workflow JSON Validation & Fixes

#### [MODIFY] [tuleap_task_sync.json](file:///d:/Claude/QC%20management%20tool/n8n/workflows/tuleap_task_sync.json)

Validate the workflow handles all Tuleap field types correctly. Issues found:
- The "Extract Task Data" node uses `getFieldValue()` but only handles `sb`, `msb`, `string`, `text`, `date` — missing `aid` (artifact ID) and `computed` types
- The "Lookup Resource" node calls `/tuleap-webhook/resources?name=` but doesn't handle the case where the API returns `{ data: [] }` (empty array) vs `{ data: { id, resource_name } }` (single object)
- The "Build Request" node reads `resourceResponse.data` as a single object, but the API returns an object with `data` that could be an array

**Changes**: Fix the resource lookup handling to properly extract the first matching resource from the array response. Add `aid` field type support.

#### [MODIFY] [tuleap_bug_sync.json](file:///d:/Claude/QC%20management%20tool/n8n/workflows/tuleap_bug_sync.json)

Validate status and severity mappings. Issues found:
- Missing `bug_id` field in the payload sent to `POST /tuleap-webhook/bug` — the workflow generates `TLP-${artifact.id}` internally but doesn't include it in the HTTP request body
- The `assigned_to` field is extracted but uses `getFieldValue()` which returns a label for select boxes, not the user display name — should use dedicated user extraction logic

**Changes**: Include `bug_id` in the request payload. Fix `assigned_to` extraction to handle user-type fields.

#### [MODIFY] [02_Update_Task.json](file:///d:/Claude/QC%20management%20tool/n8n/workflows/02_Update_Task.json)

Issues found:
- Uses `typeVersion: 1` for webhook and postgres nodes (outdated)
- Credential name is "Local Postgres" (inconsistent with other workflows using "QC Tool Postgres")
- No error handling path — if the "Is Completed?" condition is false, there's no node to handle it

**Changes**: Update credential name for consistency. Add a no-op node for the false branch. Consider updating node versions for consistency.

#### [MODIFY] [README.md](file:///d:/Claude/QC%20management%20tool/n8n/README.md)

**Changes**: Add documentation for the Tuleap sync workflows (`tuleap_task_sync.json`, `tuleap_bug_sync.json`) including webhook URLs, expected payload format, and configuration requirements.

---

### Component 2: QC API Webhook Route Validation

#### [MODIFY] [tuleapWebhook.js](file:///d:/Claude/QC%20management%20tool/apps/api/src/routes/tuleapWebhook.js)

Validate the API correctly handles all task lifecycle actions. Issues found:
- The `POST /task` route has a fall-through from `case 'update'` to `case 'create'` when the task doesn't exist — this is intentional but should be explicitly documented
- The `/resources` endpoint returns `{ data: result.rows }` (an array), but the n8n workflow expects `{ data: { id, resource_name } }` — potential mismatch when multiple or zero resources match
- Missing input validation on `tuleap_artifact_id` type (should be integer)

**Changes**: Add explicit comments for the fall-through behavior. Fix the resource endpoint response to handle single-resource lookup correctly. Add input validation.

---

### Component 3: Automated Tests

#### [NEW] [tuleapWebhook.test.js](file:///d:/Claude/QC%20management%20tool/apps/api/__tests__/tuleapWebhook.test.js)

Jest test suite covering:
- Task webhook: create, update, reject, archive actions
- Bug webhook: create and update with status/severity mapping
- Resource lookup: single match, no match, multiple matches
- Idempotency: duplicate payloads produce no duplicates
- Config endpoint: create and upsert sync config
- Input validation: missing required fields, invalid types

---

### Component 4: N8N Workflow JSON Schema Validation Script

#### [NEW] [validate-workflows.js](file:///d:/Claude/QC%20management%20tool/n8n/validate-workflows.js)

A Node.js script that:
- Reads all `.json` files in `n8n/` and `n8n/workflows/`
- Validates each workflow has required fields: `name`, `nodes`, `connections`
- Checks all nodes have `name`, `type`, `typeVersion`, `position`
- Validates all connections reference existing node names
- Checks for credential consistency (same credential names across workflows)
- Reports warnings for stub workflows (webhook → no-op)

## Verification Plan

### Automated Tests

1. **Jest API Tests** — Run from `apps/api/`:
   ```bash
   cd apps/api && npx jest __tests__/tuleapWebhook.test.js --verbose
   ```
   Tests cover: task CRUD, bug CRUD, resource lookup, idempotency, input validation.

2. **Workflow JSON Validation** — Run from repo root:
   ```bash
   node n8n/validate-workflows.js
   ```
   Validates structural correctness of all workflow JSON files.

### Manual Verification

1. **Send test Tuleap payload to running n8n instance**:
   - Start Docker containers: `docker compose up -d`
   - Send a sample task payload: `curl -X POST http://localhost:5678/webhook/tuleap-task -H "Content-Type: application/json" -d @n8n/test-payloads/task-sample.json`
   - Verify task appears in the QC Tool database

2. **User to verify**: After implementation, the user should verify the n8n workflows are importable and activatable in the n8n UI at `http://localhost:5678`.

## Complexity Tracking

No constitution violations to justify.

# Feature Specification: N8N Workflow Validation Against Tuleap Task Artifacts

**Feature Branch**: `004-n8n-workflow-validation`  
**Created**: 2026-03-02  
**Status**: Draft  
**Input**: User description: "Validate n8n workflows are correctly created based on Tuleap task artifact JSON structure"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Validate Task Sync Workflow Processes Tuleap Artifacts Correctly (Priority: P1)

A QC manager triggers the Tuleap task sync workflow by sending a webhook payload that matches the Tuleap artifact JSON structure. The workflow should correctly parse the payload, look up the sync configuration, extract task fields using field mappings, resolve the assignee to a QC Tool resource, and create or update the corresponding task in the QC management system.

**Why this priority**: This is the core integration path — if the task sync workflow doesn't correctly interpret Tuleap artifact data, tasks won't appear in the QC Tool, breaking the entire Tuleap-to-QC synchronization.

**Independent Test**: Can be fully tested by sending a sample Tuleap webhook payload to the `tuleap-task` endpoint and verifying the task is created/updated in the QC Tool database with correct field values.

**Acceptance Scenarios**:

1. **Given** a valid Tuleap task artifact payload with all mapped fields (title, description, assigned_to, tracker ID), **When** the webhook hits `/webhook/tuleap-task`, **Then** the workflow parses the payload, retrieves the matching sync config from `tuleap_sync_config`, extracts task data using `field_mappings`, looks up the assignee via the `/tuleap-webhook/resources` API, builds the request payload, and sends it to `POST /tuleap-webhook/task` — resulting in a task created in the `tasks` table with `synced_from_tuleap = TRUE`.
2. **Given** a Tuleap payload for an artifact that already exists as a task in the QC Tool (matched by `tuleap_artifact_id`), **When** the webhook fires, **Then** the existing task is updated (not duplicated) with the latest field values from the artifact.
3. **Given** a Tuleap payload where the assigned user does not match any resource in the QC Tool, **When** the workflow processes it, **Then** the task is still created but with `resource_id = NULL`, and the assignee's display name is preserved in the payload for manual resolution.

---

### User Story 2 - Validate Bug Sync Workflow Maps Tuleap Bug Data Correctly (Priority: P2)

A QC manager receives bug reports from Tuleap trackers. The bug sync workflow should correctly transform Tuleap bug artifacts — including severity, priority, status, component, and assigned_to fields — into QC Tool bug records with properly mapped status values (e.g., Tuleap "New" → QC "Open", Tuleap "Fixed" → QC "Resolved").

**Why this priority**: Bug tracking is the second most critical integration. Incorrect severity or status mapping could lead to missed critical bugs.

**Independent Test**: Can be tested by sending a Tuleap bug artifact payload to the `tuleap-bug` endpoint and verifying the bug record in the `bugs` table has correctly mapped status, severity, and priority values.

**Acceptance Scenarios**:

1. **Given** a Tuleap bug artifact with status "New" and severity "Critical", **When** the bug sync workflow processes it, **Then** a bug record is created with QC status "Open" and severity "critical".
2. **Given** a bug payload with custom status/severity mappings defined in `tuleap_sync_config.status_mappings`, **When** processed, **Then** the custom mappings take precedence over default mappings.
3. **Given** a previously synced bug whose status changed in Tuleap from "Open" to "Closed", **When** the updated payload arrives, **Then** the existing bug record is updated (not duplicated) with the new status.

---

### User Story 3 - Validate Workflow Idempotency and Webhook Logging (Priority: P2)

The system must handle duplicate webhook deliveries gracefully. If the same Tuleap artifact payload is delivered multiple times (network retries, Tuleap re-sends), the workflow should detect the duplicate via payload hashing and avoid creating duplicate records. All webhook events — successful or not — must be logged to `tuleap_webhook_log` for debugging and audit purposes.

**Why this priority**: Idempotency is critical for production reliability — duplicate webhooks are common and must not corrupt data.

**Independent Test**: Can be tested by sending the same payload twice and verifying only one task/bug is created, and both webhook receipts are logged.

**Acceptance Scenarios**:

1. **Given** a task sync webhook payload is received for the first time, **When** processed, **Then** a log entry is recorded in `tuleap_webhook_log` with `processing_status = 'processed'` and the computed `payload_hash`.
2. **Given** the exact same payload is received again, **When** processed, **Then** the `ON CONFLICT (tuleap_artifact_id, payload_hash) DO NOTHING` constraint prevents duplicate log entries, and no duplicate task is created.
3. **Given** a webhook payload for a tracker without a matching entry in `tuleap_sync_config`, **When** processed, **Then** the workflow responds with `{"success": false, "message": "No sync configuration found for this tracker"}` and does not attempt to create or update any entity.

---

### User Story 4 - Validate Report Generation and Export Workflows (Priority: P3)

QC managers export task data via n8n-powered report workflows. The report generation workflow should query the database for non-deleted tasks, apply optional filters (project, status, date range, assignee), generate an Excel spreadsheet, and provide a downloadable file. The cleanup workflow should remove expired report files based on retention policies.

**Why this priority**: Reports are a supporting feature — important for visibility but not the core sync path.

**Independent Test**: Can be tested by triggering the `POST /webhook/qc/reports/task-export` endpoint with filter parameters and verifying an Excel file is generated with the correct data subset.

**Acceptance Scenarios**:

1. **Given** a report export request with `project_id` filter, **When** the export workflow runs, **Then** only tasks belonging to that project appear in the generated Excel file.
2. **Given** a report export request with no matching tasks, **When** processed, **Then** the workflow returns a 404 response with error code `NO_DATA`.
3. **Given** a report file older than the retention period (7 days for on-demand, 90 days for scheduled), **When** the daily cleanup trigger runs, **Then** the expired file is deleted from storage and the cleanup is logged in the audit log.

---

### User Story 5 - Validate Workflow Configuration and Sync Config Management (Priority: P3)

Administrators configure which Tuleap trackers sync to which QC projects by creating entries in `tuleap_sync_config`. This includes specifying field mappings (which Tuleap field IDs map to which QC fields) and status mappings. The system should support creating, updating, and querying these configurations via the `/tuleap-webhook/config` API.

**Why this priority**: Configuration management is an admin-level concern that enables the core sync workflows.

**Independent Test**: Can be tested by creating a sync config via `POST /tuleap-webhook/config` and verifying the workflow correctly uses it when a matching tracker webhook arrives.

**Acceptance Scenarios**:

1. **Given** an administrator creates sync config with `tracker_type = 'task'`, `field_mappings` including `title_field_id`, `description_field_id`, and `assigned_to_field_id`, **When** a Tuleap webhook arrives for that tracker, **Then** the task sync workflow reads the correct fields from the artifact.
2. **Given** a sync config already exists for a `(tuleap_project_id, tuleap_tracker_id)` pair, **When** a new config is POSTed for the same pair, **Then** the existing config is updated (upsert behavior) rather than duplicated.

---

### Edge Cases

- What happens when the Tuleap payload is sent as `application/x-www-form-urlencoded` with a `payload` field (instead of raw JSON)?
- How does the system handle a Tuleap artifact with field types not covered by the `getFieldValue` helper (e.g., `computed`, `file`, `cross_ref`)?
- What happens when the `tuleap_sync_config.field_mappings` references a `field_id` that doesn't exist in the artifact's `values` array?
- How does the system handle concurrent webhooks for the same artifact arriving simultaneously?
- What happens when the QC API (`http://qc-api:3001`) is unreachable from n8n?
- How does the system handle mismatched field types (e.g., a `date` field mapped where a `string` is expected)?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST parse Tuleap webhook payloads in both `application/json` and `application/x-www-form-urlencoded` formats (where JSON is nested inside a `payload` form field).
- **FR-002**: System MUST look up sync configuration from `tuleap_sync_config` by `tuleap_tracker_id` and `tracker_type` before processing any artifact.
- **FR-003**: System MUST extract task/bug field values from the Tuleap artifact using configurable `field_mappings` that map Tuleap field IDs to QC Tool fields.
- **FR-004**: System MUST support the following Tuleap field types in extraction: `sb` (select box), `msb` (multi-select box), `string`, `text`, `date`, and `aid` (artifact ID).
- **FR-005**: System MUST resolve Tuleap assignee names to QC Tool resource IDs by calling the `/tuleap-webhook/resources` lookup API.
- **FR-006**: System MUST compute a SHA-256 hash of the webhook payload for idempotency and store it in `tuleap_webhook_log`.
- **FR-007**: System MUST log every webhook event to `tuleap_webhook_log` with processing status (`received`, `processed`, `failed`, `rejected`).
- **FR-008**: System MUST support task lifecycle actions: `create`, `update`, `reject` (unknown assignee for new tasks), and `archive` (reassigned to unknown user for existing tasks).
- **FR-009**: System MUST map Tuleap bug statuses to QC Tool statuses using configurable `status_mappings`, with sensible defaults (e.g., "New" → "Open", "Fixed" → "Resolved").
- **FR-010**: System MUST map Tuleap bug severity values to QC Tool severity levels (critical, high, medium, low).
- **FR-011**: System MUST generate Excel (XLSX) exports of task data with optional filters for project, status, date range, and assignee.
- **FR-012**: System MUST automatically clean up expired report files based on configurable retention policies (7 days for on-demand, 90 days for scheduled, 1 day for temp).
- **FR-013**: System MUST respond with appropriate success/error messages when no sync configuration exists for an incoming tracker webhook.

### Key Entities

- **Tuleap Artifact**: The source data object from Tuleap containing `id`, `tracker.id`, `values` (array of typed field objects), `last_update_date`, `submitted_on`, and `user` info. Each value has a `field_id`, `type`, and type-specific data (`value`, `values[]`, `label`).
- **Tuleap Sync Config**: Configuration mapping a Tuleap tracker to a QC project, including `field_mappings` (JSON of Tuleap field_id → QC field name), `status_mappings` (JSON of Tuleap status → QC status), and `tracker_type` (task/bug/test_case).
- **Task**: QC Tool work item with `task_id`, `task_name`, `notes`, `status`, `project_id`, `resource1_id`, and Tuleap metadata (`tuleap_artifact_id`, `tuleap_url`, `synced_from_tuleap`, `last_tuleap_sync`).
- **Bug**: QC Tool defect record with `bug_id`, `title`, `description`, `status`, `severity`, `priority`, `component`, and Tuleap reference fields.
- **Webhook Log**: Audit record for every webhook receipt with `payload_hash`, `processing_status`, `processing_result`, and `error_message` for debugging.
- **Task History**: Archive of tasks that were rejected (new task with unknown assignee) or removed (existing task reassigned to unrecognized user), preserving full context for manual review.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of Tuleap task webhook payloads with valid sync configuration result in correctly created or updated tasks in the QC Tool within 30 seconds of delivery.
- **SC-002**: 100% of Tuleap bug webhook payloads produce bug records with correctly mapped status and severity values per the configured mappings.
- **SC-003**: Duplicate webhook deliveries (same artifact + same payload hash) do not produce duplicate tasks, bugs, or log entries.
- **SC-004**: All webhook events (success, failure, rejection) are logged with full traceability — artifact ID, tracker ID, action, processing status, and payload hash.
- **SC-005**: Task export reports generate successfully for datasets of up to 10,000 tasks within 60 seconds.
- **SC-006**: Expired report files are automatically cleaned up within 24 hours of exceeding their retention period.
- **SC-007**: Workflows gracefully handle and log errors when the QC API is unreachable, without crashing or losing the webhook payload.

## Assumptions

- **A-001**: Tuleap webhooks are configured to POST to the n8n webhook URLs (`/webhook/tuleap-task`, `/webhook/tuleap-bug`) and the n8n instance is reachable from the Tuleap server.
- **A-002**: Sync configurations (`tuleap_sync_config`) are pre-configured by administrators before any webhook data flows.
- **A-003**: The QC API (`http://qc-api:3001`) is running and accessible from the n8n container within the Docker network.
- **A-004**: Resource names in Tuleap match resource names in the QC Tool (case-insensitive comparison via the `/tuleap-webhook/resources` API).
- **A-005**: The existing database schema (migration 005) is already applied, including the `bugs`, `tuleap_sync_config`, `tuleap_webhook_log`, and `tuleap_task_history` tables.

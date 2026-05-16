# Unified Tuleap Payload Design Spec

**Date:** 2026-04-23  
**Status:** Draft  
**Approach:** Centralized Transform Engine (Approach A)

---

## Goal

Unify the field structure, payload mapping, and tracker configuration across all Tuleap artifact types (User Stories, Tasks, Test Cases, Bugs) so that QC Manager can dynamically route artifacts to the correct Tuleap project and tracker, with field mappings configurable at runtime instead of hardcoded.

## Architecture Decision

**Approach A: Centralized Transform Engine** — The API becomes the single source of truth for field mapping. A new `tuleapTransformEngine` module reads tracker configs from `tuleap_sync_config`, transforms between unified payloads and Tuleap-specific payloads. n8n becomes a thin passthrough router. Frontend forms are redesigned with all specified fields.

**Key decisions from brainstorming:**
- **Multi-project support:** Multiple Tuleap projects, each with their own tracker IDs
- **Bidirectional data flow:** Unified payload structure applies to both inbound (Tuleap→QC) and outbound (QC→Tuleap)
- **Consolidated n8n workflow:** Single unified workflow replacing 4 separate sync workflows
- **Separate tables, unified API:** Keep `bugs`, `tasks`, `user_stories`, `test_cases` as separate DB tables; unified payload is a transport/translation layer only
- **API-side mapping:** All field transformation logic lives in the API, not n8n
- **Full form redesign:** Frontend forms get all specified fields with section-based layout
- **Full admin UI:** `/settings/tuleap` page for managing Tuleap connection, project mappings, tracker IDs, and field mappings

---

## 1. Data Model Design

### 1.1 Unified Field Structure

#### Common Fields (all artifact types)

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | Yes | Summary/title |
| `description` | string (markdown) | Yes | Main description |
| `status` | string (enum) | Yes | Lifecycle status |
| `assigned_to` | string \| null | No | Person responsible |
| `priority` | string (enum) \| null | No | Priority level |
| `attachments` | Attachment[] | No | File attachments |
| `links` | ArtifactLink[] | No | Related artifact links |

#### Type-Specific Fields

**User Story fields:**

| Field | Type | Required | Section |
|---|---|---|---|
| `acceptance_criteria` | string (markdown) | Yes | Description |
| `requirement_version` | string | Yes (default "1") | Description |
| `change_reason` | string (markdown) | No | Description |
| `ba_author` | string | Yes | References |
| `initial_effort` | number \| null | No | Progress |
| `remaining_effort` | number \| null | No | Progress |

**Test Case fields:**

| Field | Type | Required | Section |
|---|---|---|---|
| `service_name` | string \| null | No | Details |
| `preconditions` | string (markdown) | No | Details |
| `test_steps` | string (markdown) | Yes | Details |
| `expected_result` | string (markdown) | Yes | Details |
| `actual_result` | string (markdown) | No | Details |
| `task_number` | string \| null | No | Details |
| `is_regression` | boolean | No (default false) | Progress |
| `execution_count` | number \| null | No | Progress |
| `note` | string (markdown) | No | Progress |

**Task fields:**

| Field | Type | Required | Section |
|---|---|---|---|
| `team` | string | Yes | Description |
| `parent_story_id` | string | Yes | Links |
| `initial_estimate` | number \| null | No | Progress |
| `final_estimate` | number \| null | No | Progress |
| `actual_effort` | number \| null | No | Progress |
| `blocked_reason` | string (markdown) | No | Description |

**Bug fields:**

| Field | Type | Required | Section |
|---|---|---|---|
| `severity` | string (enum) | Yes | Status |
| `environment` | enum (DEV/TEST/PROD) | Yes | Description |
| `service_name` | string | Yes | Description |
| `steps_to_reproduce` | string (markdown) | No | Description |
| `dev_fix_description` | string (markdown) | No | Description |
| `qc_verification_notes` | string (markdown) | No | Description |
| `close_date` | string (date) \| null | No | Status |
| `cc` | string[] | No | Description |
| `linked_test_case_ids` | string[] | No | Links |
| `initial_effort` | number \| null | No | Effort |
| `remaining_effort` | number \| null | No | Effort |

### 1.2 Canonical Unified Payload Format

All APIs use this format for both inbound and outbound communication:

```json
{
  "artifact_type": "bug | task | user_story | test_case",
  "project_id": "uuid-xxx",
  "tuleap": {
    "project_id": 101,
    "tracker_id": 1,
    "artifact_id": 140,
    "url": "https://tuleap.windinfosys.com/plugins/tracker?aid=140"
  },
  "common": {
    "title": "...",
    "description": "...",
    "status": "Open",
    "assigned_to": "john@example.com",
    "priority": "high",
    "attachments": [],
    "links": [
      { "type": "parent_story", "target_artifact_id": 120 }
    ]
  },
  "fields": {
    // Type-specific fields as defined above
  }
}
```

- `common` — always present, shared across all artifact types
- `fields` — type-specific, validated per `artifact_type`
- `tuleap` — optional metadata for Tuleap routing; populated on inbound, used for outbound resolution

### 1.3 Database Schema Changes

Additive-only changes — no breaking changes to existing tables.

**`tuleap_sync_config` — new columns:**

```sql
ALTER TABLE tuleap_sync_config ADD COLUMN IF NOT EXISTS
  artifact_fields JSONB DEFAULT '{}';
  -- Maps unified field name → Tuleap field name
  -- e.g., { "title": "bug_title", "severity": "severity", "status": "status" }

ALTER TABLE tuleap_sync_config ADD COLUMN IF NOT EXISTS
  status_value_map JSONB DEFAULT '{}';
  -- Maps Tuleap status label → QC unified status
  -- e.g., { "New": "Open", "Assigned": "In Progress", "Fixed": "Resolved" }
```

**Existing artifact tables — add missing columns:**

```sql
-- bugs table additions
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS environment VARCHAR(20);
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS cc TEXT[];
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS dev_fix_description TEXT;
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS qc_verification_notes TEXT;

-- tasks table additions
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS initial_estimate NUMERIC;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS final_estimate NUMERIC;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actual_effort NUMERIC;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_story_id INTEGER;

-- user_stories table additions
ALTER TABLE user_stories ADD COLUMN IF NOT EXISTS initial_effort NUMERIC;
ALTER TABLE user_stories ADD COLUMN IF NOT EXISTS remaining_effort NUMERIC;
ALTER TABLE user_stories ADD COLUMN IF NOT EXISTS change_reason TEXT;

-- test_cases table additions (if not already present)
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS service_name VARCHAR(100);
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS preconditions TEXT;
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS actual_result TEXT;
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS task_number VARCHAR(50);
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS is_regression BOOLEAN DEFAULT FALSE;
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS execution_count INTEGER DEFAULT 0;
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS note TEXT;
```

---

## 2. Tracker Mapping Strategy

### 2.1 Configuration Storage

Each row in `tuleap_sync_config` maps **one tracker** in **one Tuleap project** to **one QC project**:

| Column | Purpose | Example |
|---|---|---|
| `tuleap_project_id` | Tuleap project ID | 101 |
| `tuleap_tracker_id` | Tracker within that project | 1 |
| `tracker_type` | Artifact type | 'bug' |
| `tuleap_base_url` | Tuleap instance URL | 'https://tuleap.windinfosys.com' |
| `qc_project_id` | QC project UUID | 'uuid-xxx' |
| `artifact_fields` | Field name mapping JSONB | '{"title": "bug_title"}' |
| `status_value_map` | Status value mapping JSONB | '{"New": "Open"}' |
| `is_active` | Soft toggle | true |

For a project with 4 artifact types, there are **4 rows** — one per tracker.

### 2.2 Dynamic Tracker Resolution

**Outbound (QC → Tuleap):**

1. Frontend sends `{ artifact_type: "bug", project_id: "uuid-xxx", common: {...}, fields: {...} }`
2. API queries: `SELECT * FROM tuleap_sync_config WHERE qc_project_id = $1 AND tracker_type = 'bug' AND is_active = true`
3. API uses `artifact_fields` mapping to build Tuleap payload
4. API sends to `{tuleap_base_url}/api/v1/artifacts` with the resolved tracker ID

**Inbound (Tuleap → QC):**

1. n8n receives webhook with `tracker.id` and `project.id`
2. n8n forwards raw payload to `POST /tuleap-webhook/unified`
3. API queries: `SELECT * FROM tuleap_sync_config WHERE tuleap_tracker_id = $1 AND is_active = true`
4. API uses `artifact_fields` mapping (reversed) to extract unified fields from Tuleap payload
5. API upserts into the appropriate table

### 2.3 Fallback Chain

If no exact config match:

1. Check for a config with the same `tuleap_project_id` but different tracker (project-level fallback)
2. Auto-provision using `provisionTuleapProject()` (existing pattern)
3. If still no match → reject with 400 "No tracker configuration found"

---

## 3. API Payload Standardization

### 3.1 Unified Payload Format

Defined in Section 1.2 above.

### 3.2 Outbound Transform (QC → Tuleap)

```
Unified Payload ──▶ tuleapTransformEngine.toTuleap() ──▶ Tuleap API Payload
```

The transform engine:

1. Looks up `tuleap_sync_config` for `(project_id, artifact_type)`
2. Resolves Tuleap field IDs from `tuleapFieldRegistry` (existing, with caching)
3. Maps unified field names → Tuleap field names using `artifact_fields`
4. Maps enum values (status, severity, priority) using `status_value_map` (reversed for outbound)
5. Formats payload per Tuleap API spec (field_id vs name, bind_value_ids for select lists)

Example:

```javascript
// Input: unified payload
{
  artifact_type: "bug",
  project_id: "uuid-xxx",
  common: { title: "Login fails on mobile", status: "Open" },
  fields: { severity: "critical", environment: "DEV" }
}

// Transform engine output: Tuleap API payload
{
  tracker: { id: 1 },
  values: [
    { field_id: 1234, value: "Login fails on mobile" },    // bug_title ← title
    { field_id: 5678, bind_value_ids: [901] },              // severity ← critical
    { field_id: 2345, bind_value_ids: [789] },              // environment ← DEV
    { field_id: 3456, bind_value_ids: [456] }               // status ← Open (mapped to "New")
  ]
}
```

### 3.3 Inbound Transform (Tuleap → QC)

```
Tuleap Webhook ──▶ n8n (thin passthrough) ──▶ POST /tuleap-webhook/unified
                                                       │
                                                       ▼
                                              tuleapTransformEngine.fromTuleap()
                                                       │
                                                       ▼
                                              Unified Payload ──▶ DB upsert
```

The transform engine in reverse:

1. Determine `tracker_type` from `tuleap_tracker_id` (query `tuleap_sync_config`)
2. Apply `artifact_fields` mapping in reverse (Tuleap field name → unified name)
3. Apply `status_value_map` in reverse (Tuleap status → QC status)
4. Build unified payload
5. Upsert into appropriate table

---

## 4. n8n Integration Design

### 4.1 Unified Workflow

**Current state:** 4 separate sync workflows, each with ~150 lines of hardcoded field-mapping JS.

**New state:** 1 unified workflow — thin passthrough.

```
┌──────────────────────────────────────────────────────────────────────┐
│                    n8n: Tuleap Unified Sync                          │
│                                                                      │
│  [Webhook Trigger]                                                   │
│       │                                                              │
│       ▼                                                              │
│  [Normalize Payload]                                                 │
│    • Handle form-encoded and JSON formats                            │
│    • Extract: artifact.tracker.id, project.id, action                │
│       │                                                              │
│       ▼                                                              │
│  [Route by Action]                                                   │
│    ├── create/update ──▶ [POST /tuleap-webhook/unified]              │
│    ├── delete ──────────▶ [POST /tuleap-webhook/unified?action=delete]│
│    └── unknown ─────────▶ [Log + skip]                                │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.2 What Moves Out of n8n

| Removed from n8n | Moved to |
|---|---|
| Field mapping (txt(), sel(), user() helpers) | `tuleapTransformEngine.fromTuleap()` |
| Status value mapping | `tuleapTransformEngine.fromTuleap()` |
| Team filtering (QA-Team check) | API route `/tuleap-webhook/unified` |
| Assignee resolution against `resources` table | API route (existing pattern) |
| Bug source classification (TEST_CASE vs EXPLORATORY) | API route |
| Config fetching | API route (looks up `tuleap_sync_config` directly) |

### 4.3 Error Handling & Retries

| Error | n8n Action |
|---|---|
| 400 Bad Request | Log error, skip (bad data) |
| 404 No config | Log warning, skip (not configured) |
| 409 Conflict | Retry once (upsert race condition) |
| 429 Rate Limited | Exponential backoff, retry up to 3x |
| 5xx Server Error | Retry up to 3x with 30s backoff |
| Network Error | Retry up to 3x with exponential backoff |

The API's Tuleap client already has its own retry logic (3 retries, exponential backoff for 429/5xx).

### 4.4 Polling Workflows

Consolidated into a single polling workflow:

```
[Schedule: */15 min]
  → [Fetch active trackers from GET /tuleap-webhook/config]
  → [For each tracker]
    → [Fetch recent artifacts from Tuleap API]
    → [POST each to /tuleap-webhook/unified]
```

---

## 5. UI/UX Adjustments

### 5.1 Section-Based Form Layout

Each form uses section cards matching the field definitions:

- **General** — status, assigned to, severity (bug), service name (bug)
- **Description** — title, description, type-specific description fields, environment, attachments, CC
- **Progress** — effort fields, priority, regression flag, execution count
- **References** — BA author, parent story, test case links, artifact links
- **Internal** — dev fix description, QC verification notes, close date

### 5.2 Form Structure Per Artifact Type

| Section | User Story | Test Case | Task | Bug |
|---|---|---|---|---|
| **General** | Status, Summary | — | Status | Status, Assigned To, Severity, Close Date, Service Name |
| **Description** | Description, Acceptance Criteria, Change Reason | Title, Service Name, Preconditions, Test Steps, Expected Result, Actual Result, Task Number | Task Title, Description, Assigned To, Team, Blocked Reason | Bug Title, Description + Steps, Environment, CC, Dev Fix Description, QC Verification Notes |
| **Progress** | Initial Effort, Remaining Effort, Priority | Assigned To, Status, Is Regression, Execution Count, Note | Dev Initial Estimate, PM Final Estimate, Actual Effort | Initial Effort, Remaining Effort |
| **References** | BA Author, Links | Links | Parent Story, Links | Test Case Link, Parent, Links |
| **Attachments** | Attachments | Attachments | — | Attachments |

### 5.3 New Settings Page — `/settings/tuleap`

**Connection section:** Base URL, Access Key, Test Connection button.

**Project Mappings:** Table showing QC Project ↔ Tuleap Project ↔ Trackers, with Add Mapping and Edit buttons.

**Tracker Configuration per Project:** Four tracker ID inputs (Bug, Task, Test Case, User Story), each with expandable Field Mappings editor.

**Field Mappings editor:** Table showing Unified Field ↔ Tuleap Field, with auto-detect that fetches the tracker's field schema from Tuleap API and suggests mappings.

**Status Value Map editor:** Table showing Tuleap Value ↔ QC Value, editable per tracker.

---

## 6. Validation & Governance

### 6.1 Three-Layer Validation

**Layer 1 — Frontend (Zod + React Hook Form):**
- Required field enforcement before submit
- Immediate feedback on field errors
- Type coercion (numbers, dates)

**Layer 2 — API (Zod validation on route):**
- Same schemas, server-side enforcement
- Rejects malformed payloads with 400 + field list

**Layer 3 — Transform Engine (pre-Tuleap validation):**
- Verify all required Tuleap fields have values
- Check tracker config exists and is_active
- Verify enum values map to valid Tuleap options
- Return 422 with specific field errors

### 6.2 Pre-API-Call Consistency Checks

1. **Config check:** Does a `tuleap_sync_config` row exist for `(project_id, artifact_type)` and `is_active = true`?
2. **Required fields:** Are all Tuleap-required fields present in the unified payload?
3. **Enum validation:** Do status/priority/severity values have valid mappings in `status_value_map`?
4. **Link validation:** Do artifact links reference valid artifact IDs?
5. **Idempotency:** Use existing `tuleap_webhook_log` pattern — hash the payload, skip if already processed

---

## 7. Scalability Considerations

### 7.1 Adding a New Artifact Type

1. Database: Add columns or new table. Add `tuleap_sync_config` row with `tracker_type = 'new_type'`.
2. Transform Engine: Add field mapping entry to base constants.
3. API: Add Zod schema for new type. Unified route handles it automatically.
4. Frontend: Add section-based form component.
5. n8n: No changes needed.

Estimated effort: ~2 hours for a simple artifact type.

### 7.2 Multiple Tuleap Instances

Current architecture already supports multiple Tuleap projects (each QC project maps to its own `tuleap_project_id`). To extend to multiple instances:

- `tuleap_base_url` is already per-config
- `tuleapFieldRegistry` needs to key by `(base_url, tracker_id)` instead of just `tracker_id`
- API credentials need per-instance storage: either a `tuleap_instances` table or `tuleap_access_key` column on `tuleap_sync_config`

For v1: single instance (one `TULEAP_ACCESS_KEY` env var). Multi-instance is a future enhancement with a clear migration path.

---

## 8. Risks & Mitigation

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| **Tracker misconfiguration** — wrong tracker ID maps bugs to tasks | High data corruption | Medium | Admin UI validates tracker IDs by fetching tracker info from Tuleap API before saving. "Test Connection" button. |
| **Field mapping drift** — Tuleap admin renames a field | Artifacts fail to create | Medium | Transform engine logs "unmapped field" warnings. Admin UI shows "unmapped fields" indicator. Auto-discovery suggests new mappings. |
| **Status value mismatch** — new Tuleap status not in `status_value_map` | Wrong status on created artifacts | Medium | Validate status values against Tuleap tracker field schema before save. Default to first value + log warning if unmapped. |
| **n8n workflow migration** — switching from 4 to 1 workflow | Sync interruption during cutover | High | Deploy unified workflow alongside existing ones. Switch webhooks in Tuleap one at a time. Keep old workflows active until all migrated. |
| **Existing data migration** — new columns on existing tables | Data loss | Low | Additive-only schema changes. No column renames or deletes. New columns default to NULL. Backfill from `raw_tuleap_payload` where available. |
| **Payload format divergence** — Tuleap sends both form-encoded and JSON | Parsing errors | Existing (handled) | Unified webhook handler supports both formats (existing pattern). |

---

## 9. Implementation Phases

### Phase 1: Backend Foundation
- Enhance `tuleap_sync_config` with `artifact_fields` and `status_value_map` columns
- Build `tuleapTransformEngine.js` module (fromTuleap/toTuleap)
- Add unified route `POST /tuleap-webhook/unified`
- Add DB columns for new fields on existing tables
- Add Zod schemas for all 4 artifact types

### Phase 2: Admin Configuration
- Add API endpoints for `tuleap_sync_config` CRUD (already partially exists)
- Add "Test Connection" endpoint that validates tracker IDs against Tuleap API
- Add auto-discover endpoint that fetches tracker field schema and suggests mappings
- Build `/settings/tuleap` page (connection, project mappings, tracker config, field/status editors)

### Phase 3: n8n Migration
- Build unified n8n workflow
- Deploy alongside existing workflows
- Migrate webhooks one artifact type at a time
- Remove old workflows once all are migrated

### Phase 4: Frontend Forms
- Redesign BugForm with section-based layout + all specified fields
- Redesign UserStoryForm with all specified fields
- Redesign TestCaseForm with all specified fields
- Redesign TaskForm with all specified fields
- Update `tuleapApi` client to use unified payload format

---

## 10. Key Files Reference

| File | Role |
|---|---|
| `apps/api/src/config/db.js` | Migration runner (add new columns) |
| `apps/api/src/routes/tuleapWebhook.js` | Webhook handler (add unified route) |
| `apps/api/src/routes/tuleapArtifacts.js` | Bidirectional CRUD (refactor to use transform engine) |
| `apps/api/src/utils/tuleapClient.js` | Tuleap REST client (existing, no changes needed) |
| `apps/api/src/utils/tuleapFieldRegistry.js` | Field ID resolver (existing, enhance for multi-project) |
| `apps/api/src/utils/tuleapPayloadBuilder.js` | Payload builder (refactor to use transform engine) |
| `apps/api/src/schemas/` | Zod validation schemas (add unified schemas) |
| `n8n-workflows/` | n8n workflow JSONs (add unified workflow) |
| `apps/web/app/settings/tuleap/` | New settings page |
| `apps/web/src/components/bugs/BugForm.tsx` | Bug form (redesign) |
| `apps/web/src/components/user-stories/UserStoryForm.tsx` | User story form (redesign) |
| `apps/web/src/components/test-cases/TestCaseForm.tsx` | Test case form (redesign) |
| `apps/web/src/components/tasks/TaskForm.tsx` | Task form (redesign) |
| `apps/web/src/lib/api.ts` | API client (update tuleapApi to unified format) |

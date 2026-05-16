# Unified Tuleap Payload — Implementation Status

> **Branch:** `feat/unified-tuleap-payload` (merged to `main` at `5a5e9e2`, pushed to origin)
> **Date:** 2026-05-04
> **Spec:** `docs/superpowers/specs/2026-04-23-unified-tuleap-payload-design.md`

---

## Overview

Unified all 4 Tuleap artifact types (Bug, Task, User Story, Test Case) under a single canonical payload format with a centralized transform engine, dynamic tracker resolution, admin configuration UI, and redesigned frontend forms.

**13 commits, 24 files changed, +3650/-531 lines**

---

## What Was Implemented

### Phase 1: Backend Foundation (7 commits)

| Commit | Description |
|--------|-------------|
| `d1cac99` | DB migrations — 21 new columns across 5 tables (`bugs`, `tasks`, `user_stories`, `test_cases`, `tuleap_sync_config`) |
| `26419bf` | Zod schemas for unified payload (`tuleapUnified.js`) and sync config validation (`tuleapConfig.js`) |
| `2ca8d1b` | Transform engine (`tuleapTransformEngine.js`) — `fromTuleap()` / `toTuleap()` with `BASE_FIELD_MAPPINGS` |
| `1d21fa2` | Unified webhook route `POST /tuleap-webhook/unified` with config lookup + project fallback |
| `916a2cf` | Config-based tracker resolution in `tuleapArtifacts.js` with env-var fallback chain |
| `9236439` | Config CRUD endpoints: PUT/DELETE `/config/:id`, POST `/config/test-connection`, GET `/config/discover/:trackerId` |
| `58ae89c` | Integration tests — 7 end-to-end tests for unified flow |

**Key files created:**
- `apps/api/src/services/tuleapTransformEngine.js` — Bidirectional field mapping engine
- `apps/api/src/schemas/tuleapUnified.js` — Discriminated union Zod schema for 4 artifact types
- `apps/api/src/schemas/tuleapConfig.js` — Config CRUD validation schemas
- `apps/api/__tests__/tuleapTransformEngine.test.js` — 11 unit tests
- `apps/api/__tests__/tuleapUnifiedWebhook.test.js` — 5 webhook route tests
- `apps/api/__tests__/tuleapUnified.integration.test.js` — 7 integration tests

**Tests:** 83/83 Tuleap tests pass (13 suites)

### Phase 2: Admin Configuration UI (1 commit)

| Commit | Description |
|--------|-------------|
| `a304432` | `/settings/tuleap` admin page (916 lines) |

**Features:**
- Connection Settings panel (base URL, access key, test connection)
- Project Mappings section (link Tuleap projects to QC projects)
- Tracker Configuration (map tracker IDs to artifact types)
- Field Mapping Editor (visual editor for `artifact_fields` JSONB)
- Status Value Map Editor (visual editor for `status_value_map` JSONB)
- Auto-discover button (fetches tracker schema from Tuleap API, suggests mappings)

**Key files:**
- `apps/web/app/settings/tuleap/page.tsx`
- `apps/web/src/lib/api.ts` — Added `tuleapConfigApi` namespace with `TuleapSyncConfig` interface
- `apps/web/src/config/routes.ts` — Route entry `/settings/tuleap` (adminOnly, navOrder 9.1)

### Phase 3: n8n Migration (1 commit)

| Commit | Description |
|--------|-------------|
| `5a5e9e2` | Unified n8n workflow JSONs |

**Key files:**
- `n8n-workflows/tuleap-unified-sync.json` — Single webhook replacing 4 separate sync workflows. Webhook trigger → Normalize Payload (handles both form-encoded and JSON) → POST to `/tuleap-webhook/unified` → Respond
- `n8n-workflows/tuleap-unified-poll.json` — Unified polling workflow replacing 4 separate poll workflows. Every 15min → Fetch active configs → Split → Fetch artifacts from Tuleap → Build unified payloads → POST to `/tuleap-webhook/unified`

**Migration note:** Old workflows should remain active until Tuleap webhook URLs are switched to the new unified path one artifact type at a time.

### Phase 4: Frontend Form Redesign (4 commits)

| Commit | Description |
|--------|-------------|
| `26471e8` | Shared components: `FormSection`, `Textarea`, `ErrorBanner` |
| `e36841e` | `tuleapApi.createUnified()` / `tuleapApi.updateUnified()` + API outbound route update |
| `54ee4e8` | BugForm, UserStoryForm, TestCaseForm redesigned |
| `5d81c3f` | TaskForm redesigned |

#### Shared Components Created
- `apps/web/src/components/ui/Textarea.tsx` — forwardRef textarea with label/error, uses `cn()` utility
- `apps/web/src/components/ui/ErrorBanner.tsx` — Reusable error banner (replaces 4x duplication)
- `apps/web/src/components/ui/FormSection.tsx` — Card wrapper with title + 2-column grid

#### BugForm Redesign (152→255 lines)
- **Before:** 6 fields, 1 section
- **After:** 17 fields, 4 sections (General, Description, Progress, References)
- **New fields:** `assigned_to`, `description`, `dev_fix_description`, `qc_verification_notes`, `close_date`, `cc`, `linked_test_case_ids`, `initial_effort`, `remaining_effort`, `environment` (now enum DEV/TEST/PROD)
- **API:** Uses `tuleapApi.createUnified()` / `updateUnified()`

#### UserStoryForm Redesign (165→206 lines)
- **Before:** 6 fields, 1 section
- **After:** 12 fields, 4 sections (General, Description, Progress, References)
- **New fields:** `assigned_to`, `description`, `change_reason`, `ba_author`, `initial_effort`, `remaining_effort`
- **API:** Uses `tuleapApi.createUnified()` / `updateUnified()`

#### TestCaseForm Redesign (183→235 lines)
- **Before:** 6 fields, 1 section
- **After:** 15 fields, 4 sections (General, Details, Test Definition, Progress)
- **New fields:** `assigned_to`, `description`, `service_name`, `preconditions`, `actual_result`, `task_number`, `is_regression`, `execution_count`, `note`
- **API:** Uses `tuleapApi.createUnified()` / `updateUnified()`

#### TaskForm Redesign (340→~310 lines)
- **Before:** 17 fields, 2 sections, uses `fetchApi('/tasks')` directly
- **After:** 23 fields, 4 sections (Task Details, Description, Assignment & Planning, Links), still uses `fetchApi('/tasks')`
- **New fields:** `team`, `blocked_reason`, `parent_story_id`, `initial_estimate`, `final_estimate`, `actual_effort`
- **API:** Keeps `fetchApi('/tasks')` — tasks are QC entities first, not pure Tuleap artifacts

#### API Outbound Route Update
- `tuleapArtifacts.js` POST handler now detects unified payloads (`artifact_type` + `common`)
- Looks up `tuleap_sync_config` by `(project_id, artifact_type)`, calls `toTuleap()`, creates artifact
- Existing non-unified code path remains intact for backward compatibility

---

## Database Schema Changes

### `tuleap_sync_config` — new columns:
- `artifact_fields JSONB DEFAULT '{}'` — Maps unified field name → Tuleap field name
- `status_value_map JSONB DEFAULT '{}'` — Maps Tuleap status label → QC unified status

### `bugs` table additions:
- `environment VARCHAR(20)`
- `cc TEXT[]`
- `dev_fix_description TEXT`
- `qc_verification_notes TEXT`

### `tasks` table additions:
- `initial_estimate NUMERIC`
- `final_estimate NUMERIC`
- `actual_effort NUMERIC`
- `blocked_reason TEXT`
- `parent_story_id INTEGER`

### `user_stories` table additions:
- `initial_effort NUMERIC`
- `remaining_effort NUMERIC`
- `change_reason TEXT`

### `test_cases` table additions:
- `service_name VARCHAR(100)`
- `preconditions TEXT`
- `actual_result TEXT`
- `task_number VARCHAR(50)`
- `is_regression BOOLEAN DEFAULT FALSE`
- `execution_count INTEGER DEFAULT 0`
- `note TEXT`

---

## Canonical Unified Payload Format

```json
{
  "artifact_type": "bug | task | user_story | test_case",
  "project_id": "uuid-xxx",
  "common": {
    "title": "...",
    "description": "...",
    "status": "Open",
    "assigned_to": "john@example.com",
    "priority": "high",
    "attachments": [],
    "links": [{ "type": "parent_story", "target_artifact_id": 120 }]
  },
  "fields": { /* type-specific fields */ },
  "tuleap": { "project_id": 101, "tracker_id": 1, "artifact_id": 140, "url": "..." }
}
```

---

## Key Architecture Decisions

1. **Centralized Transform Engine** — `tuleapTransformEngine.js` handles all bidirectional mapping
2. **Separate tables, unified API** — Keep existing DB tables, unified payload is transport/translation layer only
3. **API-side mapping** — All field transformation in API, n8n is thin passthrough
4. **Config-driven** — `artifact_fields` JSONB on `tuleap_sync_config` drives field mapping per tracker
5. **Backward compatible** — Existing env-var tracker IDs still work as fallback
6. **TaskForm keeps `fetchApi('/tasks')`** — Tasks are QC entities first with optional Tuleap sync

---

## What's NOT Done / Future Work

### n8n Migration (Phase 3 — needs manual steps)
- [ ] Import `tuleap-unified-sync.json` into n8n UI at `n8n.gerbil.qc`
- [ ] Import `tuleap-unified-poll.json` into n8n UI
- [ ] Switch Tuleap webhook URLs one artifact type at a time
- [ ] Keep old workflows active until all migrated
- [ ] Remove old workflows after full migration

### Known Gaps
- [x] PATCH route handles unified payloads — `UnifiedPatchSchema` validates the envelope, emitter called with `mode='update'`
- [ ] TaskForm `description` field replaces `notes` — backend `/tasks` route may need to handle both field names
- [ ] No frontend component tests exist in the codebase — all verification is via TypeScript build
- [ ] n8n workflows are JSON files only — not auto-imported, need manual n8n UI import
- [ ] BugForm `environment` changed from free text to enum (DEV/TEST/PROD) — existing bugs with free-text environment values will show as empty in edit mode

### Pre-existing Issues (not from this branch)
- 17 test failures in `developmentPlans.*` and `db-connection.test.js` (unrelated)
- Web build has Supabase env var warnings during static prerendering (cosmetic)

---

## Test Results

- **API Tests:** 83/83 Tuleap tests pass (13 suites)
- **Web Build:** Compiles successfully with no TypeScript errors
- **Total suite:** 225/242 pass (17 pre-existing failures unrelated to this branch)

---

## Deploy Status

- **Merged to main:** Yes (`5a5e9e2`)
- **Pushed to origin:** Yes
- **CI/CD:** GitHub Actions auto-builds and deploys to VPS
- **Docker images:** Will be rebuilt and deployed via `docker-compose.prod.yml`

---

## Relevant Files Reference

| File | Role |
|------|------|
| `apps/api/src/services/tuleapTransformEngine.js` | Core bidirectional field mapping engine |
| `apps/api/src/schemas/tuleapUnified.js` | Zod schemas for unified payload (discriminated union) |
| `apps/api/src/schemas/tuleapConfig.js` | Zod schemas for config CRUD |
| `apps/api/src/routes/tuleapWebhook.js` | Unified webhook route + config CRUD endpoints |
| `apps/api/src/routes/tuleapArtifacts.js` | Outbound artifact creation with unified payload support |
| `apps/api/src/config/db.js` | Migration runner (21 new columns) |
| `apps/web/app/settings/tuleap/page.tsx` | Admin UI for Tuleap configuration |
| `apps/web/src/lib/api.ts` | `tuleapApi` + `tuleapConfigApi` + `UnifiedPayload` type |
| `apps/web/src/components/ui/FormSection.tsx` | Shared form section card |
| `apps/web/src/components/ui/Textarea.tsx` | Shared textarea component |
| `apps/web/src/components/ui/ErrorBanner.tsx` | Shared error banner |
| `apps/web/src/components/bugs/BugForm.tsx` | Redesigned bug form (17 fields, 4 sections) |
| `apps/web/src/components/user-stories/UserStoryForm.tsx` | Redesigned user story form (12 fields, 4 sections) |
| `apps/web/src/components/test-cases/TestCaseForm.tsx` | Redesigned test case form (15 fields, 4 sections) |
| `apps/web/src/components/tasks/TaskForm.tsx` | Redesigned task form (23 fields, 4 sections) |
| `n8n-workflows/tuleap-unified-sync.json` | Unified webhook workflow |
| `n8n-workflows/tuleap-unified-poll.json` | Unified polling workflow |
| `docs/superpowers/specs/2026-04-23-unified-tuleap-payload-design.md` | Full design spec |
| `docs/superpowers/plans/2026-04-25-unified-tuleap-phase4-frontend-forms.md` | Phase 4 implementation plan |

# Unified Tuleap Payload — Phase 1: Backend Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the centralized transform engine, unified webhook route, Zod schemas, and DB migrations that enable multi-project Tuleap integration with dynamic field mapping.

**Architecture:** A new `tuleapTransformEngine.js` service reads tracker configs from `tuleap_sync_config`, maps between unified payloads and Tuleap-specific payloads. A new `POST /tuleap-webhook/unified` route replaces the per-type webhook handlers. The existing `tuleapArtifacts.js` route is refactored to use the transform engine instead of hardcoded env-var-based tracker IDs.

**Tech Stack:** Node.js/Express, PostgreSQL (Supabase), Zod (validation), Jest (testing), existing `tuleapClient.js`/`tuleapFieldRegistry.js` services.

**Spec:** `docs/superpowers/specs/2026-04-23-unified-tuleap-payload-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `apps/api/src/config/db.js` | Add new columns in `runMigrations()` |
| `apps/api/src/schemas/tuleapUnified.js` | Zod schemas for all 4 artifact types (common + type-specific) |
| `apps/api/src/schemas/tuleapConfig.js` | Zod schemas for `tuleap_sync_config` CRUD |
| `apps/api/src/services/tuleapTransformEngine.js` | Bidirectional transform: `fromTuleap()` and `toTuleap()` |
| `apps/api/src/services/tuleapPayloadBuilder.js` | Refactored: thin wrapper delegating to transform engine |
| `apps/api/src/routes/tuleapWebhook.js` | Add `POST /unified` route, keep existing routes for backward compat |
| `apps/api/src/routes/tuleapArtifacts.js` | Refactored: uses transform engine + config-based tracker resolution |
| `apps/api/__tests__/tuleapTransformEngine.test.js` | Unit tests for transform engine |
| `apps/api/__tests__/tuleapUnifiedWebhook.test.js` | Integration tests for unified webhook route |
| `apps/api/__tests__/tuleapUnified.integration.test.js` | End-to-end integration tests |

---

### Task 1: DB Migrations — Add New Columns

**Files:**
- Modify: `apps/api/src/config/db.js` (add columns at end of `runMigrations()`)

- [ ] **Step 1: Add `artifact_fields`, `status_value_map` to `tuleap_sync_config` and new columns to artifact tables**

Add these migration statements at the end of `runMigrations()` in `db.js`, before the final `console.log('Database migrations completed successfully')`:

```sql
-- Unified Tuleap payload — enhance tuleap_sync_config
ALTER TABLE tuleap_sync_config
    ADD COLUMN IF NOT EXISTS artifact_fields JSONB DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS status_value_map JSONB DEFAULT '{}';

-- Unified Tuleap payload — add missing columns to bugs table
ALTER TABLE bugs
    ADD COLUMN IF NOT EXISTS environment VARCHAR(20),
    ADD COLUMN IF NOT EXISTS cc TEXT[],
    ADD COLUMN IF NOT EXISTS dev_fix_description TEXT,
    ADD COLUMN IF NOT EXISTS qc_verification_notes TEXT;

-- Unified Tuleap payload — add missing columns to tasks table
ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS initial_estimate NUMERIC,
    ADD COLUMN IF NOT EXISTS final_estimate NUMERIC,
    ADD COLUMN IF NOT EXISTS actual_effort NUMERIC,
    ADD COLUMN IF NOT EXISTS blocked_reason TEXT,
    ADD COLUMN IF NOT EXISTS parent_story_id INTEGER;

-- Unified Tuleap payload — add missing columns to user_stories table
ALTER TABLE user_stories
    ADD COLUMN IF NOT EXISTS initial_effort NUMERIC,
    ADD COLUMN IF NOT EXISTS remaining_effort NUMERIC,
    ADD COLUMN IF NOT EXISTS change_reason TEXT;

-- Unified Tuleap payload — add missing columns to test_cases table
ALTER TABLE test_cases
    ADD COLUMN IF NOT EXISTS service_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS preconditions TEXT,
    ADD COLUMN IF NOT EXISTS actual_result TEXT,
    ADD COLUMN IF NOT EXISTS task_number VARCHAR(50),
    ADD COLUMN IF NOT EXISTS is_regression BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS execution_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS note TEXT;
```

- [ ] **Step 2: Run the API to apply migrations and verify**

Run: `cd apps/api && npm run dev &` then check logs for "Database migrations completed successfully". Alternatively run the Jest tests.

Run: `cd apps/api && npm test 2>&1 | tail -20`
Expected: All existing tests pass.

- [ ] **Step 3: Verify columns exist in Supabase**

After the API starts and migrations run, query:

```bash
docker exec qc-api node -e "
const { pool } = require('./src/config/db');
(async () => {
  const r = await pool.query(\"SELECT column_name FROM information_schema.columns WHERE table_name = 'tuleap_sync_config' ORDER BY ordinal_position\");
  console.log(r.rows.map(r => r.column_name));
  process.exit(0);
})()
"
```

Expected: `artifact_fields` and `status_value_map` appear in the column list.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/config/db.js
git commit -m "feat: add DB columns for unified Tuleap payload (artifact_fields, status_value_map, type-specific fields)"
```

---

### Task 2: Zod Schemas — Unified Payload Validation

**Files:**
- Create: `apps/api/src/schemas/tuleapUnified.js`
- Create: `apps/api/src/schemas/tuleapConfig.js`

- [ ] **Step 1: Create unified payload Zod schemas**

Create `apps/api/src/schemas/tuleapUnified.js` with the full schema definition. Key structure:

- `ArtifactType` enum: `bug`, `task`, `user_story`, `test_case`
- `CommonFields` object: `title` (required), `description`, `status` (required), `assigned_to`, `priority`, `attachments`, `links`
- `BugFields`, `TaskFields`, `UserStoryFields`, `TestCaseFields` objects with type-specific fields
- `UnifiedPayloadSchema` using `z.discriminatedUnion` on `artifact_type`
- `TuleapMeta` for Tuleap routing metadata

Full code is defined in the spec document Section 1.2 and 6.1.

- [ ] **Step 2: Create config Zod schemas**

Create `apps/api/src/schemas/tuleapConfig.js`:

- `SyncConfigSchema`: validates config creation with `tuleap_project_id`, `tuleap_tracker_id`, `tracker_type`, `qc_project_id`, `artifact_fields` (record of string→string), `status_value_map` (record of string→string)
- `SyncConfigUpdateSchema`: partial version for updates

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/schemas/tuleapUnified.js apps/api/src/schemas/tuleapConfig.js
git commit -m "feat: add Zod schemas for unified Tuleap payload and sync config validation"
```

---

### Task 3: Transform Engine — Core Module

**Files:**
- Create: `apps/api/src/services/tuleapTransformEngine.js`
- Create: `apps/api/__tests__/tuleapTransformEngine.test.js`

- [ ] **Step 1: Write the transform engine tests**

Create `apps/api/__tests__/tuleapTransformEngine.test.js`. Tests cover:

1. `applyFieldMappings` — maps Tuleap field names to unified names using `artifact_fields` from config
2. `applyFieldMappings` — falls back to `BASE_FIELD_MAPPINGS` when config `artifact_fields` is empty
3. `applyFieldMappings` — ignores fields not in the mapping
4. `applyStatusMap` — maps Tuleap status labels to QC status values
5. `applyStatusMap` — returns original value when no mapping found
6. `reverseStatusMap` — reverses the status map for outbound
7. `fromTuleap` — transforms a bug Tuleap payload into unified format
8. `fromTuleap` — transforms a task Tuleap payload into unified format
9. `toTuleap` — transforms a unified bug payload into Tuleap field names
10. `toTuleap` — preserves fields not in mapping (pass-through)
11. `toTuleap` — reverses status values for Tuleap

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest tuleapTransformEngine.test.js --no-coverage 2>&1 | tail -20`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the transform engine**

Create `apps/api/src/services/tuleapTransformEngine.js`. Key exports:

- `BASE_FIELD_MAPPINGS` — object mapping tracker_type → { tuleapFieldName: unifiedFieldName }
- `UNIQUE_FIELDS_PER_TYPE` — object mapping tracker_type → array of type-specific unified field names
- `COMMON_FIELD_NAMES` — array of common field names
- `getEffectiveMapping(config)` — merges base + custom `artifact_fields`
- `applyFieldMappings(tuleapValues, config)` — maps Tuleap field values to unified names
- `applyStatusMap(tuleapStatus, config)` — maps Tuleap status → QC status
- `reverseStatusMap(statusValueMap)` — reverses the status mapping for outbound
- `fromTuleap(tuleapValues, config)` — full inbound transform
- `toTuleap(unifiedPayload, config)` — full outbound transform (returns flat object with Tuleap field names)

Implementation notes:
- `fromTuleap` splits mapped values into `common` and `fields` based on `COMMON_FIELD_NAMES` and `UNIQUE_FIELDS_PER_TYPE`
- `toTuleap` reverses the mapping: looks up unified field names → Tuleap field names, reverses status values
- Both functions use `getEffectiveMapping` which merges `BASE_FIELD_MAPPINGS` (defaults) with config's `artifact_fields` (overrides)
- Field names not in the mapping pass through as-is for both directions

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx jest tuleapTransformEngine.test.js --no-coverage 2>&1 | tail -20`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/tuleapTransformEngine.js apps/api/__tests__/tuleapTransformEngine.test.js
git commit -m "feat: add tuleapTransformEngine with bidirectional payload mapping"
```

---

### Task 4: Unified Webhook Route

**Files:**
- Modify: `apps/api/src/routes/tuleapWebhook.js` (add `POST /unified` route)
- Create: `apps/api/__tests__/tuleapUnifiedWebhook.test.js`

- [ ] **Step 1: Write tests for the unified webhook route**

Create `apps/api/__tests__/tuleapUnifiedWebhook.test.js`. Tests cover:

1. Returns 400 when `tracker_id` is missing
2. Returns 404 when no sync config found for tracker
3. Falls back to project-level config when tracker has no direct match
4. Returns 200 and processes valid bug payload through `fromTuleap`
5. Logs webhook to `tuleap_webhook_log`

All tests mock `db.pool.query` and `tuleapTransformEngine`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest tuleapUnifiedWebhook.test.js --no-coverage 2>&1 | tail -20`
Expected: FAIL — route does not exist yet.

- [ ] **Step 3: Add the unified webhook route**

Add the route at the end of `tuleapWebhook.js`, before `module.exports = router`. The route:

1. Validates `tracker_id` is present
2. Queries `tuleap_sync_config` by `tracker_id`
3. Falls back to `tuleap_project_id` if no tracker match
4. Extracts Tuleap values from `artifact.values` array (label-based) or `raw_payload` object
5. Calls `fromTuleap(tuleapValues, config)` to get unified payload
6. Logs to `tuleap_webhook_log` (idempotency via payload hash)
7. Returns unified payload as confirmation (actual DB upsert in Phase 2)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest tuleapUnifiedWebhook.test.js --no-coverage 2>&1 | tail -20`
Expected: All tests PASS.

- [ ] **Step 5: Run all existing tests to ensure nothing is broken**

Run: `cd apps/api && npm test 2>&1 | tail -30`
Expected: All existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/tuleapWebhook.js apps/api/__tests__/tuleapUnifiedWebhook.test.js
git commit -m "feat: add POST /tuleap-webhook/unified route with dynamic field mapping"
```

---

### Task 5: Refactor `tuleapArtifacts.js` — Config-Based Tracker Resolution

**Files:**
- Modify: `apps/api/src/routes/tuleapArtifacts.js`

- [ ] **Step 1: Add config-based tracker ID resolution alongside existing env-var fallback**

Changes to `tuleapArtifacts.js`:

1. Import `db` and `toTuleap` from transform engine
2. Add `resolveConfig(artifactType, projectId)` — queries `tuleap_sync_config` by project_id and tracker_type
3. Add `resolveTrackerId(artifactType, projectId)` — returns `{ trackerId, config }`, falls back to env var `FALLBACK_TRACKER_IDS`
4. Update `GET /:type` to use `resolveTrackerId` (accept optional `?project_id=` query param)
5. Update `POST /:type` to:
   - Use `resolveTrackerId` to get tracker ID and config
   - If config has `artifact_fields` mappings, use `toTuleap()` + field registry for dynamic payload building
   - Otherwise fall back to existing `BUILDERS` object (backward compatible)
6. Keep `GET /:type/:id`, `PATCH /:id`, `DELETE /:id` unchanged

- [ ] **Step 2: Run all existing tests**

Run: `cd apps/api && npx jest tuleapArtifacts.routes.test.js --no-coverage 2>&1 | tail -30`
Expected: Existing tests pass (they don't provide `project_id` so they fall back to env vars).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/tuleapArtifacts.js
git commit -m "feat: add config-based tracker resolution to tuleapArtifacts with env-var fallback"
```

---

### Task 6: Config CRUD Endpoints — Enhance Existing

**Files:**
- Modify: `apps/api/src/routes/tuleapWebhook.js` (add PUT/DELETE config + test-connection + auto-discover)

- [ ] **Step 1: Add `PUT /config/:id` and `DELETE /config/:id` endpoints**

Add to `tuleapWebhook.js`:

- `PUT /config/:id` — Updates `artifact_fields`, `status_value_map`, `tracker_type`, `tuleap_tracker_id`, `tuleap_project_id`, `is_active`
- `DELETE /config/:id` — Soft-deletes by setting `is_active = false`

- [ ] **Step 2: Add `POST /config/test-connection` endpoint**

Validates a Tuleap tracker by calling the API. Returns tracker info + field schema. Uses `createTuleapClient` and `defaultRegistry` to fetch tracker metadata.

- [ ] **Step 3: Add `GET /config/discover/:trackerId` endpoint**

Auto-discovers field mappings. Fetches tracker field schema via `defaultRegistry`, suggests mappings based on name similarity with `BASE_FIELD_MAPPINGS`.

- [ ] **Step 4: Update `POST /config` to accept `artifact_fields` and `status_value_map`**

Ensure the existing config creation endpoint includes the new JSONB columns in its INSERT statement.

- [ ] **Step 5: Run all API tests**

Run: `cd apps/api && npm test 2>&1 | tail -30`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/tuleapWebhook.js
git commit -m "feat: add config CRUD endpoints with artifact_fields/status_value_map, test-connection, and auto-discover"
```

---

### Task 7: Integration Test — End-to-End Unified Flow

**Files:**
- Create: `apps/api/__tests__/tuleapUnified.integration.test.js`

- [ ] **Step 1: Write integration test verifying full unified flow**

Tests cover:
1. Bug webhook through unified route → config lookup → field mapping → unified payload
2. 404 for unconfigured tracker
3. Project-level fallback when tracker has no direct match
4. Config CRUD (create, update, delete)
5. Test connection endpoint (mocked Tuleap API)

- [ ] **Step 2: Run the integration test**

Run: `cd apps/api && npx jest tuleapUnified.integration.test.js --no-coverage 2>&1 | tail -30`
Expected: All tests PASS.

- [ ] **Step 3: Run full test suite**

Run: `cd apps/api && npm test 2>&1 | tail -30`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/__tests__/tuleapUnified.integration.test.js
git commit -m "test: add integration tests for unified Tuleap webhook flow"
```

---

### Task 8: Final Verification — All Tests Pass

- [ ] **Step 1: Run the complete test suite**

Run: `cd apps/api && npm test 2>&1`
Expected: All tests pass with no failures.

- [ ] **Step 2: Start the API and verify the unified route responds**

Run: `cd apps/api && npm run dev &` then:

```bash
sleep 3 && curl -s -X POST https://api.gebrils.cloud/api/tuleap-webhook/unified -H 'Content-Type: application/json' -d '{}'
```

Expected: `{"error":"tracker_id is required"}` with status 400.

- [ ] **Step 3: Final commit if needed**

```bash
git add -A
git status  # Verify no unintended changes
git commit -m "chore: Phase 1 backend foundation complete"  # Only if there are changes
```
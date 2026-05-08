---
title: Unified Tuleap Payload — Persistence, Emission, and Tracker Config
date: 2026-05-08
status: needs-triage
adrs: [0001, 0002, 0003, 0004, 0005, 0006, 0007, 0008]
---

## Problem Statement

The unified Tuleap payload effort (Phase 1) was only half-built. The transform layer exists and produces a clean `{ artifact_type, action, project_id, common, fields, tuleap }` shape, but **nothing in the system actually persists it**. Today:

- The `/tuleap-webhook/unified` route logs the transformed payload to `tuleap_webhook_log` and returns it. It does not write to `bugs`, `tasks`, `user_stories`, or `test_cases`. Real intake still flows through four divergent per-type webhook routes that each duplicate UPSERT, soft-delete revival, link resolution, and bug-source classification logic — drift between them is the silent failure mode.
- The outbound side (`POST /tuleap-artifacts/:type`, `PATCH /tuleap-artifacts/:id`, and the legacy bug-emit path) carries **three coexisting code paths**, including a brittle camelCase-to-snake_case synthesizer with a known data-corruption bug (`BAAuthor` → `b_a_author`). The PATCH route ignores unified payloads entirely and falls back to the legacy synth.
- `apps/api/src/schemas/tuleapUnified.js` defines `UnifiedPayloadSchema`, but neither inbound nor outbound code imports it — it's dead validation code.
- `tuleap_sync_config` carries `field_mappings`, `status_mappings`, and `status_value_map` JSONB columns, of which only `status_value_map` is read; severity, priority, and environment values pass through Tuleap → QC unmapped.
- The n8n unified workflow misorders Tuleap field key preference (`field_name || label || name` resolves to the localized `label`), forwards `bind_value_ids` as raw integers, duplicates normalization with the API, and emits an action vocabulary the API does not recognize (`artifact:created`/`updated`/`deleted`).
- `/unified` auto-provisions a QC project + `tuleap_sync_config` row hardcoded to `tracker_type='task'` whenever a config is missing, silently routing Bug/Story/Test trackers to the wrong table.
- Phase 4 frontend forms send `linked_test_case_ids` as comma-separated strings; outbound `Number()`-coerces them to `NaN`. Cross-artifact links are broken in production whenever an admin types more than one ID.

This PRD captures the work needed to land the unified payload as the **only** path for both inbound and outbound Tuleap traffic, eliminate the divergent per-type routes and synthesizer, and put tracker config under explicit admin control.

## Solution

Adopt the eight architectural decisions captured in `docs/adr/0001..0008` end-to-end. Concretely:

- Build a **persister layer** keyed by artifact type. Each persister owns its UPSERT, soft-delete revival, link resolution, and (for bugs) source classification. A single `dispatchAction(unified, config)` entry point fans out by `artifact_type`. The `/unified` route writes; per-type routes become thin shims that translate legacy payload shapes into unified payloads and call into `dispatchAction`.
- Mirror that pattern on the outbound side with an **emitter layer** and `emitToTuleap(unified, config, mode)`. All three outbound code paths converge on the emitter; `tuleapPayloadBuilder.js` is deleted.
- Move Tuleap value normalization (Tuleap field-key resolution + `bind_value_ids → label`) into a dedicated **API-owned module**. n8n becomes a thin forwarder.
- Replace `status_value_map` on `tuleap_sync_config` with a multi-field **`value_maps` JSONB** column shaped `{ "<field_name>": { "<tuleap_label>": "<qc_label>" } }`. Drop the dead `field_mappings` and `status_mappings` columns in the same migration.
- Make **QC UUIDs canonical** for inter-artifact links. Tuleap integer IDs only at the boundary. Add `pending_links JSONB` to artifact tables for ingest-order races and a **link resolver module** that drains the queue on each persist.
- Validate with **Zod inside** the persister and emitter (not as Express middleware). Use the existing `UnifiedPayloadSchema` for inbound and outbound-create. Add a `UnifiedPatchSchema = deepPartial()` for outbound-update (discriminator + `project_id` re-required).
- Action vocabulary is the lean enum `['sync', 'delete', 'reject', 'archive']`. Non-task actions on a non-task artifact return `400`.
- `/unified` returns `404 Unconfigured` when no `tuleap_sync_config` exists. Admins explicitly map trackers via the Phase 2 `/settings/tuleap` admin UI. The `provisionTuleapProject()` helper and the `tuleap_project_id`-based fallback are removed.
- After a 7-day no-traffic window in `tuleap_webhook_log`, the per-type webhook routes are deleted entirely.

## User Stories

1. As a Tuleap admin, I want a single unified webhook to receive bug/task/story/test artifact changes, so that I do not maintain four divergent route handlers.
2. As a QC operator, I want webhook intake to actually write to the QC database, so that artifacts I see in Tuleap appear in QC without manual replay.
3. As a QC operator, I want soft-deleted artifacts to revive when their Tuleap counterpart is reopened, so that ID continuity is preserved across delete/restore cycles.
4. As a QC operator, I want bug source (`TEST_CASE` vs `EXPLORATORY`) to be classified consistently regardless of which webhook route delivered the bug, so that bug analytics are not skewed by intake-path drift.
5. As a QC operator, I want inter-artifact links (a Bug linked to a Test Case, a Task linked to a Story) to resolve correctly even when the linked artifact is ingested *after* the linking artifact, so that ingest order does not silently drop relationships.
6. As an admin, I want to explicitly map a Tuleap tracker to a QC tracker type via a settings UI, so that misnamed or localized trackers cannot be silently auto-routed to the wrong artifact table.
7. As an admin, I want `/unified` to return `404 Unconfigured` (with the tracker ID and project info) when a config is missing, so that operations sees a clear failure instead of a silent misroute.
8. As an admin, I want to configure value maps for status, severity, priority, and environment per tracker, so that label drift between Tuleap and QC does not require schema or code changes.
9. As a developer, I want one `dispatchAction(unified, config)` entry point for all inbound persistence, so that adding a new artifact type is an isolated change.
10. As a developer, I want one `emitToTuleap(unified, config, mode)` entry point for all outbound emission, so that create/update/delete logic is not scattered across three routes.
11. As a developer, I want the outbound `tuleapPayloadBuilder.js` synthesizer (with its `BAAuthor` → `b_a_author` data-corruption bug) deleted, so that a class of camelCase/snake_case bugs is structurally impossible.
12. As a developer, I want Tuleap value normalization (key preference + `bind_value_ids → label`) in a dedicated API module, so that n8n stays a thin forwarder and normalization is unit-testable without HTTP.
13. As a developer, I want Zod validation co-located with the persister and emitter rather than in middleware, so that legacy webhook shims can translate-then-validate without rejection at the route boundary.
14. As a developer, I want a `UnifiedPatchSchema = deepPartial()` so PATCH callers can send a field diff without re-sending unchanged fields, so that outbound updates are minimal and idempotent.
15. As a developer, I want cross-artifact links keyed by QC UUIDs internally, so that integer Tuleap IDs are not leaked into business logic that should not care about external identifiers.
16. As a developer, I want `pending_links JSONB` to queue unresolved links and drain them on each persist, so that webhook delivery order does not need to be guaranteed.
17. As an oncall engineer, I want a `tuleap_webhook_log` audit trail of every inbound webhook with the resolved unified payload, so that I can replay a failed ingest without losing the original Tuleap envelope.
18. As an oncall engineer, I want per-type webhook routes deleted only after a 7-day no-traffic window in the audit log, so that I can verify no straggler n8n workflows are still pointed at them before the cutover.
19. As a release manager, I want the unified payload migration to drop `field_mappings`, `status_mappings`, and `status_value_map` in the same migration that adds `value_maps`, so that there is no intermediate state where two competing mapping mechanisms coexist.
20. As an admin, I want existing auto-provisioned `tuleap_sync_config` rows (hardcoded `tracker_type='task'`) to be left in place, so that the migration is non-destructive and I can fix wrong types lazily via the admin UI.
21. As a frontend developer, I want `linked_test_case_ids` to flow as an array of UUID strings (not comma-separated), so that outbound emission does not `NaN`-coerce them.
22. As a developer, I want every persister and emitter independently testable with no live Tuleap or live n8n, so that the test suite can run on every commit.
23. As a developer, I want an integration test that exercises `dispatchAction` against a real Postgres test database for each artifact type, so that the seam between persister logic and SQL is validated.
24. As a developer, I want `tuleapValueNormalizer` and `tuleapLinkResolver` covered as pure-function unit tests, so that their behavior is pinned without database setup.

## Implementation Decisions

### New deep modules

- **`services/persisters/`** — one file per artifact type (`bug.js`, `task.js`, `user_story.js`, `test_case.js`). Public entry: `dispatchAction(unified, config) → { qcId, status }`. Each persister owns the artifact's UPSERT (by Tuleap integer ID + `qc_project_id`), soft-delete revival, link resolution via `tuleapLinkResolver`, and (bug only) source classification (`TEST_CASE` if any `linked_test_case_ids` resolved, otherwise `EXPLORATORY`).

- **`services/emitters/`** — one file per artifact type, symmetric with persisters. Public entry: `emitToTuleap(unified, config, mode)` where `mode ∈ {'create', 'update', 'delete'}`. Each emitter selects the correct Zod schema (`UnifiedPayloadSchema` for create, `UnifiedPatchSchema` for update, no payload for delete) and uses `tuleapClient` for the HTTP call.

- **`services/tuleapValueNormalizer.js`** — pure function `normalize(rawTuleapPayload, tracker) → unifiedFields`. Resolves Tuleap field key with preference `name || label`. Maps `bind_value_ids` to `label` via `tuleapFieldRegistry`. No I/O outside the registry.

- **`services/tuleapLinkResolver.js`** — pure functions `resolveLinks({ qcProjectId, tuleapLinks }) → { resolved, pending }` and `drainPending({ qcProjectId, justPersistedQcId, justPersistedTuleapId }) → { resolvedCount }`. Translates Tuleap integer artifact IDs to QC UUIDs; queues unresolved into `pending_links JSONB`. Does not own SQL — receives a query function.

### Shallow modifications

- **`schemas/tuleapUnified.js`** — add `UnifiedPatchSchema = UnifiedPayloadSchema.deepPartial()` with the `artifact_type` discriminator and `project_id` re-required.

- **`routes/tuleapWebhook.js`** — `/unified` calls `dispatchAction()` and persists. Per-type routes (`/task`, `/bug`, `/user-story`, `/test-case`) become thin shims that translate the legacy per-type payload into a unified payload and call `dispatchAction`. `/unified` returns `404 Unconfigured` (with `tracker_id` and `tuleap_project_id` in the response body) when no `tuleap_sync_config` row exists. `provisionTuleapProject()` is removed.

- **`routes/tuleapArtifacts.js`** — collapse the three outbound paths (unified / brittle synth / legacy fallback) into a single call to `emitToTuleap()`. PATCH route stops ignoring unified payloads. The brittle camelCase-to-snake_case synthesizer is removed.

### Schema migration (single migration file)

- Add `value_maps JSONB DEFAULT '{}'::jsonb` to `tuleap_sync_config`.
- Drop `field_mappings`, `status_mappings`, `status_value_map` from `tuleap_sync_config`.
- Add `pending_links JSONB DEFAULT '[]'::jsonb` to `bugs`, `tasks`, `user_stories`, `test_cases`.
- Existing auto-provisioned rows are not migrated; admins fix wrong `tracker_type` lazily via the Phase 2 admin UI.

### Deletions

- `apps/api/src/services/tuleapPayloadBuilder.js` deleted.
- `provisionTuleapProject()` helper deleted.
- Per-type webhook routes deleted after 7-day no-traffic window observed in `tuleap_webhook_log`.

### Out-of-tree changes

- **n8n workflow `tuleap-unified-sync.json`** — fix Tuleap field-key preference order to `name || label`. Stop normalizing `bind_value_ids` (forward as-is; API handles it). Emit action vocabulary as `sync | delete | reject | archive`.

- **Phase 2 admin UI `/settings/tuleap`** — wire up the existing scaffold so admins can list Tuleap projects, list trackers per project, and create `tuleap_sync_config` rows (mapping a Tuleap tracker to a QC tracker type + value maps).

### API contract

- Inbound: `POST /tuleap-webhook/unified { artifact_type, action, project_id, common, fields, tuleap }` → `{ qcId, status }` on success, `404 { error: 'Unconfigured', tracker_id, tuleap_project_id }` on missing config, `400` on schema violation or non-task action against non-task artifact.
- Outbound create: `POST /tuleap-artifacts/:type` body is full unified payload, validated by `UnifiedPayloadSchema`.
- Outbound update: `PATCH /tuleap-artifacts/:id` body is unified patch, validated by `UnifiedPatchSchema`. `artifact_type` and `project_id` required; all other fields optional.
- Outbound delete: `DELETE /tuleap-artifacts/:id` — no body.

### Action vocabulary

`sync | delete | reject | archive`. `reject` and `archive` are task-only and return `400` on bug/story/test.

## Testing Decisions

A good test exercises **external behavior** of a module, not implementation details. Tests should be readable as specifications: given an input that represents a real Tuleap or QC scenario, the test asserts the externally-observable outcome (DB row state, HTTP response, returned value, side effects on `pending_links`). Tests should not assert on intermediate function calls or private helpers.

### Modules to be tested (all four deep modules)

1. **`services/persisters/`** — one test file per artifact type plus one shared dispatch test:
   - Per-type tests verify UPSERT (insert + update + idempotent re-ingest), soft-delete revival, link resolution against pre-existing artifacts, queueing into `pending_links` for unresolved links, and (bug only) source classification.
   - `dispatchAction` test verifies routing by `artifact_type`, `404 Unconfigured` when no config, and `400` on schema violation.
   - These run as **integration tests** against a real Postgres test database, following the pattern already established by `tuleapWebhook.task.test.js` / `.bug.test.js` / `.userStory.test.js`.

2. **`services/emitters/`** — one test file per artifact type:
   - Verify the correct Zod schema is selected per mode, the right `tuleapClient` method is invoked with the right payload shape, value maps applied, and inter-artifact links translated from QC UUIDs back to Tuleap integer IDs.
   - These run as **unit tests** with `tuleapClient` mocked at the module boundary, following the pattern in `tuleapArtifacts.routes.test.js`.

3. **`services/tuleapValueNormalizer.js`** — pure unit tests:
   - Field-key preference (`name || label`), `bind_value_ids → label` resolution against a fixture registry, missing-field tolerance, multi-bind handling.
   - Prior art: `tuleapFieldRegistry.test.js`, `tuleapTransformEngine.test.js`.

4. **`services/tuleapLinkResolver.js`** — pure unit tests:
   - `resolveLinks` returns `{ resolved, pending }` for a mix of present and absent QC artifacts.
   - `drainPending` resolves queued links when the linked artifact is now present, leaves the rest queued.
   - Prior art: pure-function patterns in `tuleapTransformEngine.test.js`.

### Prior art reference

- `apps/api/__tests__/tuleapWebhook.task.test.js` — webhook integration test with real DB (UPSERT + revival + link resolution scenarios).
- `apps/api/__tests__/tuleapWebhook.bug.test.js` — bug-source classification scenarios.
- `apps/api/__tests__/tuleapArtifacts.routes.test.js` — outbound route tests with `tuleapClient` mocked.
- `apps/api/__tests__/tuleapTransformEngine.test.js` — pure unit tests for the transform layer.
- `apps/api/__tests__/tuleapFieldRegistry.test.js` — pure unit tests with fixture registries.
- `apps/api/__tests__/tuleapUnified.integration.test.js` — currently-thin integration test to expand.

### Coverage expectations

- Persisters: integration tests for all four artifact types covering insert, update, soft-delete revival, link resolution (hit + miss), and (bugs) source classification.
- Emitters: unit tests for all four artifact types covering create + update + delete modes and value-map application.
- Normalizer: unit tests for key preference, multi-bind, missing fields, label fallback.
- Link resolver: unit tests for resolve + drain across present/absent QC artifacts.

## Out of Scope

- **Live n8n workflow deployment**. The PRD updates the workflow JSON; rolling it out to staging and prod is a release-management task, not an implementation task.
- **Migrating existing wrong-`tracker_type` rows**. Admins fix these lazily via the Phase 2 UI as discovered.
- **`tuleap_webhook_log` retention policy**. The 7-day no-traffic window is for the per-type-route deletion gate, not a general log retention policy. Long-term retention is a separate ops concern.
- **Tuleap REST polling fallback**. The unified webhook is push-only. A pull/poll fallback for missed webhooks is out of scope.
- **Phase 4 frontend form changes** beyond fixing the `linked_test_case_ids` array shape. Larger form redesign work is tracked separately.
- **Bidirectional comment / attachment sync**. Phase 1 unified payload covers fields and links only.
- **Metrics / alerting on `/unified` failures**. Add later as a separate observability ticket.
- **Tuleap-side schema discovery**. The Phase 2 admin UI lists trackers via existing Tuleap REST calls; building a richer schema-introspection feature is out of scope.

## Further Notes

- The eight ADRs at `docs/adr/0001..0008` are the canonical record of the decisions baked into this PRD. Read those before implementing — the *why* lives there.
- `CONTEXT.md` is the canonical glossary. Use its terminology (Artifact, Tracker, Tuleap Project, QC Project, Tracker Config, Unified Payload, Action enum, Inbound/Outbound, Bug Source, Artifact Link) in all new code, comments, error messages, and tests.
- The flagged ambiguities in `CONTEXT.md` (project overload, sync overload, table-name vs domain term, three identities for the same Test Case) are *not resolved by this PRD*. They are flagged for future cleanup.
- The cutover has two distinct gates:
  1. **Schema migration** (drop columns + add `value_maps` + add `pending_links`) ships with the persister/emitter code in a single deploy.
  2. **Per-type route deletion** ships **after** observing 7 days of zero traffic on those routes in `tuleap_webhook_log`. This is a separate, smaller PR.
- The PAT exposed in the prior session is unrelated to this work but should still be revoked.

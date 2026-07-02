# QC-Manager

QC-Manager is the Quality Control system for managing the testing and delivery lifecycle of work tracked in Tuleap. It mirrors Tuleap artifacts into its own database so QC can layer governance, analytics, and resource planning on top of them.

## Language

### Tuleap integration

**Artifact**:
A single Tuleap-tracked work item — one of four subtypes: **Bug**, **Task**, **User Story**, **Test Case**. Every artifact lives in exactly one **Tracker**.
_Avoid_: ticket, issue, item, record.

**Tracker**:
A Tuleap container holding artifacts of a single subtype. A Tuleap project typically has four trackers — one per artifact subtype.
_Avoid_: queue, project (Tuleap's "project" is a different thing — see below).

**Tuleap Project**:
A top-level container in Tuleap that owns multiple trackers. Distinct from a **QC Project**, which is the QC-Manager-side project that one or more Tuleap projects are mapped to.
_Avoid_: just saying "project" without a qualifier.

**QC Project**:
A QC-Manager-side project (`projects` table). One or more **Tuleap Projects** map to a QC Project via **Tracker Configs**.

**Tracker Config**:
The QC-side mapping that connects one Tuleap **Tracker** to one **QC Project**, with field-name mappings (`artifact_fields`) and status-value mappings (`status_value_map`). One row per (Tuleap Tracker, QC Project) pair. Stored in the `tuleap_sync_config` table.
_Avoid_: "sync config" — the table name is historical; the row covers both inbound sync and outbound creation.

**Unified Payload**:
The canonical JSON envelope used in both directions (Tuleap → QC and QC → Tuleap). Shape: `{ artifact_type, action, project_id, common, fields, tuleap }`. `common` holds fields shared across all artifact subtypes; `fields` holds subtype-specific fields.

**Action**:
What the **Unified Payload** is asking the system to do with the **Artifact**. One of:
- **`sync`** — upsert by `tuleap_artifact_id` (covers both create and update; n8n can't reliably tell them apart)
- **`delete`** — soft-delete the QC row when Tuleap deletes the Artifact
- **`reject`** — *task only* — Tuleap created an Artifact for an assignee not in QC's `resources` table; do not create the QC row, log to `tuleap_task_history`
- **`archive`** — *task only* — an existing QC task got reassigned in Tuleap to someone outside QC; archive to history and soft-delete

**Inbound** / **Outbound**:
- **Inbound** = Tuleap → QC (webhook-driven, mediated by n8n)
- **Outbound** = QC → Tuleap (a QC user creating or editing an Artifact in the UI)

**Bug Source**:
A classification stamped on every **Bug** at ingestion time:
- **`TEST_CASE`** — the bug was discovered through executing a known test case (the inbound payload references one)
- **`EXPLORATORY`** — the bug was discovered ad-hoc, with no linked test case

**Artifact Link**:
A reference from one **Artifact** to another (e.g. a **Bug** linked to its source **Test Case**, a **Task** linked to its parent **User Story**). On the QC side, links are stored as the linked Artifact's QC UUID — never as Tuleap integer IDs and never as business keys like `"T-123"`. The translation to Tuleap's native integer artifact ID happens only at the Tuleap boundary (inbound resolves on the way in, outbound resolves on the way out).

### Task assignment

**Assignment**:
A single row of `task_resource_assignment` linking one **Task** to one **Resource**, carrying that person's own planning and effort numbers (`estimate_hrs`, `actual_hrs`, plus estimate/completion fields). The junction is the source of truth for who is on a task; the legacy `tasks.resource1_id`/`resource2_id`/`rN_*` columns are a synced denormalized cache during rollout. See ADR 0009.
_Avoid_: "slot" (the two fixed columns are the old model we're leaving behind).

**Primary Resource**:
The single owner of a **Task** — the `Assignment` with `assignment_type = 'PRIMARY'` (at most one per task, enforced by a partial unique index). Maps to Tuleap's single `assigned_to` field; the task-level planning numbers (`initial_estimate`, `final_estimate`, `estimate_days`) are the primary's.
_Avoid_: "resource 1", "owner" (reserve "owner" for the access/team-ownership concept).

**Secondary Resource**:
Any supporting contributor on a **Task** — an `Assignment` with `assignment_type = 'SECONDARY'`. A task may have **any number** of secondaries (the model is no longer capped at one). Secondaries are QC-local only — Tuleap's `assigned_to` is single-select, so secondaries never round-trip to Tuleap.
_Avoid_: "resource 2".

**Estimate Accuracy**:
A per-`Assignment` verdict on closed work comparing a person's `actual_hrs` to their `estimate_hrs`: `ratio = actual_hrs / estimate_hrs` → **Over-estimated (padded)** `< 0.75` / **Accurate** `0.75–1.25` / **Under-estimated (blew past)** `> 1.25`. The ±25% band is a single configurable constant. Distinct from **utilization**, which is estimate-vs-capacity over open work.

### AI Intake

**AI Intake**:
The channel by which externally-authored **Markdown** (written by an AI skill or agent — Superpower, GSD, Grill-me, Codex, a customer agent) becomes a QC-native **User Story** under a **QC Project**, with **Tasks** generated from it. Enters via three surfaces that share one backend: API, webhook, and manual UI upload/paste. Distinct from **Inbound** sync, which mirrors **Artifacts** that already exist in Tuleap — AI Intake originates the artifact in QC.
_Avoid_: "import", "AI sync", "PRD import".

**Standalone Artifact**:
A QC-native **Artifact** created in QC-Manager with no Tuleap origin: `sync_status = 'standalone'`, no `tuleap_artifact_id`. All **AI Intake** artifacts are Standalone and are *never* auto-emitted to Tuleap while unreviewed — even when the **QC Project** has a **Tracker Config** that would normally push a QC-created artifact outbound. Contrast with a mirrored Artifact, which always carries a `tuleap_artifact_id`.
_Avoid_: "local artifact", "draft" (Draft is a status, not an origin).

**Artifact Origin** (the `source` column):
Which channel *created* an **Artifact** — an enum first established on `changelog_entries` (`manual`, `ai_agent`, `github`, `n8n`, `system`), extended for this feature with `ai_intake` (and, later, `mcp`). Carried alongside `generated_by_ai`. Distinct from **Bug Source** (which describes how a Bug was *discovered*, not how it was created).
_Avoid_: "source_channel", "source_type", "intake method" (all fold into the single `source` value).

## Relationships

- A **Tuleap Project** contains many **Trackers**; each **Tracker** holds many **Artifacts**
- A **Task** has exactly one **Primary Resource** and zero or more **Secondary Resources**, each represented by one **Assignment**; `actual_effort` on the task is the sum of `actual_hrs` across all its Assignments
- A **QC Project** is connected to one or more **Tuleap Projects** via one **Tracker Config** per (Tracker, QC Project) pair
- An **Artifact** is mapped to a QC row in exactly one of `bugs`, `tasks`, `user_stories`, `test_cases` — keyed by `tuleap_artifact_id`
- A **Unified Payload** carries one **Action** for one **Artifact**; the **Tracker Config** tells the transform engine how to map fields and status values
- Every **Bug** has exactly one **Bug Source**, set on first ingestion

## Flagged ambiguities

- **"project"** is overloaded between **Tuleap Project** (Tuleap-side container) and **QC Project** (QC-side workspace). Always qualify which one. Schema: Tuleap's is the integer `tuleap_project_id`; QC's is the UUID `qc_project_id`.
- **"sync"** is overloaded between (a) the inbound data flow direction and (b) the `sync` **Action** value. Prefer **Inbound** for the direction; reserve "sync" for the action.
- **"source"** is overloaded between **Bug Source** (discovery method — `TEST_CASE`/`EXPLORATORY`) and **Artifact Origin** (creation channel — the `source` column, `manual`/`ai_intake`/…). Different axes; always say which. A Bug can be `source = ai_intake`-adjacent in origin yet `EXPLORATORY` in discovery.
- **`tuleap_sync_config` table name vs "Tracker Config" domain term** — the table is named for its original inbound-only role; today the same row drives outbound artifact creation too. Don't rename the table (migration cost), but speak in terms of "Tracker Config" in design conversations.
- **`tracker_type` column** holds the artifact subtype (`bug`/`task`/`user_story`/`test_case`), not a Tuleap concept. A Tuleap Tracker has no notion of "type"; QC assigns one per Tracker Config so the transform engine knows which field schema applies.
- **Three identities for the same Test Case** (and User Story, and Task): the QC `id` UUID, the QC business key `test_case_id` (e.g. `"T-123"`), and the Tuleap `tuleap_artifact_id` integer (e.g. `140`). Resolved: the QC UUID is canonical for any **Artifact Link** stored on the QC side; the others are display-only or boundary-translation values. See ADR 0006.

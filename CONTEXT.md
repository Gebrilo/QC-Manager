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

## Relationships

- A **Tuleap Project** contains many **Trackers**; each **Tracker** holds many **Artifacts**
- A **QC Project** is connected to one or more **Tuleap Projects** via one **Tracker Config** per (Tracker, QC Project) pair
- An **Artifact** is mapped to a QC row in exactly one of `bugs`, `tasks`, `user_stories`, `test_cases` — keyed by `tuleap_artifact_id`
- A **Unified Payload** carries one **Action** for one **Artifact**; the **Tracker Config** tells the transform engine how to map fields and status values
- Every **Bug** has exactly one **Bug Source**, set on first ingestion

## Flagged ambiguities

- **"project"** is overloaded between **Tuleap Project** (Tuleap-side container) and **QC Project** (QC-side workspace). Always qualify which one. Schema: Tuleap's is the integer `tuleap_project_id`; QC's is the UUID `qc_project_id`.
- **"sync"** is overloaded between (a) the inbound data flow direction and (b) the `sync` **Action** value. Prefer **Inbound** for the direction; reserve "sync" for the action.
- **`tuleap_sync_config` table name vs "Tracker Config" domain term** — the table is named for its original inbound-only role; today the same row drives outbound artifact creation too. Don't rename the table (migration cost), but speak in terms of "Tracker Config" in design conversations.
- **`tracker_type` column** holds the artifact subtype (`bug`/`task`/`user_story`/`test_case`), not a Tuleap concept. A Tuleap Tracker has no notion of "type"; QC assigns one per Tracker Config so the transform engine knows which field schema applies.
- **Three identities for the same Test Case** (and User Story, and Task): the QC `id` UUID, the QC business key `test_case_id` (e.g. `"T-123"`), and the Tuleap `tuleap_artifact_id` integer (e.g. `140`). Resolved: the QC UUID is canonical for any **Artifact Link** stored on the QC side; the others are display-only or boundary-translation values. See ADR 0006.

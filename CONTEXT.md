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

### Relationship kinds

The QC model distinguishes five shapes of inter-artifact relationship. Only **Coverage Links** are user-mutable; the others are structural or immutable.

**Containment**:
A 1:N parent-child relationship stored as a foreign-key column on the child (`tasks.parent_user_story_id`, `tasks.project_id`, `test_run.suite_id`). Edited through the child's own form, not through a link panel.
_Avoid_: "parent link" — Containment is structural, not a link.

**Coverage Link**:
A user-editable many-to-many association between two **Artifacts** that have no parent-child relationship (Bug ↔ Test Case, Bug ↔ Task, Bug ↔ User Story, Task ↔ Test Case, Test Case ↔ User Story). Stored as one named join table per pair (`bug_test_cases`, `bug_tasks`, `bug_user_stories`, `task_test_cases`, `test_case_user_stories`). Read together via the `v_artifact_links` SQL view.
_Avoid_: "association", "relationship" — Coverage Link is the specific term.

**Provenance Link**:
A many-to-many record of how an **Artifact** came to exist, set once at ingestion and never edited from the QC UI (e.g. `bug_test_executions` — the **Test Executions** during which a **Bug** was discovered). Drives the **Bug Source** classification. Provenance Links may be deleted (when the referenced artifact is hard-deleted) but never user-mutated.
_Avoid_: confusing with Coverage Link — a Bug may have a Provenance Link to Test Execution `E-5` _and_ a Coverage Link to Test Case `T-12`; these are different facts.

**Container Content**:
The ordered set of **Test Cases** in a **Test Suite**, stored in `test_suite_cases` with `sort_order` and `snapshot_id`. Has type-specific structure (ordering, snapshots); not a generic link.
_Avoid_: treating as a Coverage Link.

**Child Entity**:
A first-class row owned by a parent, with its own attributes and state machine — specifically, the `test_execution` rows owned by a `test_run`. A Test Run "uses" Test Cases only through these Child Entities, never directly.
_Avoid_: saying "a Test Run is linked to Test Cases" — it is linked to Executions, which are of Test Cases.

**Source Attribution**:
A `source` column on every Coverage Link row, taking the value `tuleap` (the row was created by inbound sync) or `qc` (the row was created by a user in the QC UI). Tuleap-sourced rows are immutable from the QC UI; QC-sourced rows do not push back to Tuleap. When inbound sync removes a link in Tuleap, the row is deleted regardless of source.
_Avoid_: "origin" — Source Attribution is the canonical term.

**Same-Project Link Constraint**:
The rule that both ends of a Coverage Link must belong to the same **QC Project**. Enforced by a `BEFORE INSERT` trigger on each Coverage Link table. Tuleap-sourced links satisfy this automatically because Tuleap's own link graph is intra-project.

## Relationships

- A **Tuleap Project** contains many **Trackers**; each **Tracker** holds many **Artifacts**
- A **QC Project** is connected to one or more **Tuleap Projects** via one **Tracker Config** per (Tracker, QC Project) pair
- An **Artifact** is mapped to a QC row in exactly one of `bugs`, `tasks`, `user_stories`, `test_cases` — keyed by `tuleap_artifact_id`
- A **Unified Payload** carries one **Action** for one **Artifact**; the **Tracker Config** tells the transform engine how to map fields and status values
- Every **Bug** has exactly one **Bug Source**, set on first ingestion
- Every **Coverage Link** row has exactly one **Source Attribution** value (`tuleap` or `qc`) and connects two **Artifacts** in the same **QC Project**
- A **Bug**'s **Bug Source** classification is derived from its **Provenance Links** at ingestion time; later additions or removals of **Coverage Links** never change it

## Naming rules

- **JavaScript identifiers** for QC project IDs use `qcProjectId` (UUID); for Tuleap project IDs use `tuleapProjectId` (integer). Bare `projectId` is banned by ESLint rule `no-bare-projectId` in `apps/api/src/modules/**`.
- **URL path parameters** follow the same pattern: `:qcProjectId` for work/identity/quality/governance routes, `:tuleapProjectId` for integration routes that accept a Tuleap project integer.
- **SQL column names** remain `project_id`, `qc_project_id`, `tuleap_project_id` as they appear in the database schema — do not rename SQL column names.
- **Object property keys** in request/response payloads stay as `project_id` (API contract) — only the JavaScript variable holding that value changes name.
- **Artifact Links** return only `linked_artifact_id` (QC UUID) in link arrays. `business_key` and `tuleap_artifact_id` appear only on the artifact's own detail endpoint — never inside another artifact's link array. Translation between QC UUID and Tuleap integer happens only in `tuleapLinkResolver.js`.

## Flagged ambiguities

- **"project"** is overloaded between **Tuleap Project** (Tuleap-side container) and **QC Project** (QC-side workspace). Always qualify which one. Schema: Tuleap's is the integer `tuleap_project_id`; QC's is the UUID `qc_project_id`.
- **"sync"** is overloaded between (a) the inbound data flow direction and (b) the `sync` **Action** value. Prefer **Inbound** for the direction; reserve "sync" for the action.
- **`tuleap_sync_config` table name vs "Tracker Config" domain term** — the table is named for its original inbound-only role; today the same row drives outbound artifact creation too. Don't rename the table (migration cost), but speak in terms of "Tracker Config" in design conversations.
- **`tracker_type` column** holds the artifact subtype (`bug`/`task`/`user_story`/`test_case`), not a Tuleap concept. A Tuleap Tracker has no notion of "type"; QC assigns one per Tracker Config so the transform engine knows which field schema applies.
- **Three identities for the same Test Case** (and User Story, and Task): the QC `id` UUID, the QC business key `test_case_id` (e.g. `"T-123"`), and the Tuleap `tuleap_artifact_id` integer (e.g. `140`). Resolved: the QC UUID is canonical for any **Artifact Link** stored on the QC side; the others are display-only or boundary-translation values. See ADR 0006.

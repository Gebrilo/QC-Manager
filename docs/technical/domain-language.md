# Domain Language

> [!NOTE]
> This is the central domain language reference for QC-Manager. It defines precise terms for Tuleap integration, task assignment, and artifact management.

## Tuleap Integration

### Artifact

A single Tuleap-tracked work item — one of four subtypes: **Bug**, **Task**, **User Story**, **Test Case**. Every artifact lives in exactly one **Tracker**.

### Tracker

A Tuleap container holding artifacts of a single subtype. A Tuleap project typically has four trackers — one per artifact subtype.

### Tuleap Project

A top-level container in Tuleap that owns multiple trackers. Distinct from a **QC Project**.

### QC Project

A QC-Manager-side project (`projects` table). One or more Tuleap Projects map to a QC Project via **Tracker Configs**.

### Tracker Config

The QC-side mapping connecting one Tuleap Tracker to one QC Project, with field-name mappings (`artifact_fields`) and status-value mappings (`value_maps`). One row per (Tuleap Tracker, QC Project) pair. Stored in `tuleap_sync_config`.

### Unified Payload

The canonical JSON envelope: `{ artifact_type, action, project_id, common, fields, tuleap }`. `common` holds fields shared across all artifact subtypes; `fields` holds subtype-specific fields.

### Actions

| Action | Meaning |
|--------|---------|
| `sync` | Upsert by `tuleap_artifact_id` (create or update) |
| `delete` | Soft-delete the QC row when Tuleap deletes |
| `reject` | *Task only* — Tuleap created for non-QC assignee; skip creation |
| `archive` | *Task only* — reassigned outside QC; archive to history |

### Directional Terms

- **Inbound** = Tuleap → QC (webhook-driven, mediated by n8n)
- **Outbound** = QC → Tuleap (QC user creating/editing in the UI)

## Task Assignment

### Assignment

A single row of `task_resource_assignment` linking one Task to one Resource, with per-person planning/effort (`estimate_hrs`, `actual_hrs`). This junction is the source of truth.

### Primary Resource

The single owner of a Task — `assignment_type = 'PRIMARY'` (at most one per task). Maps to Tuleap's `assigned_to`.

### Secondary Resource

Supporting contributor — `assignment_type = 'SECONDARY'`. Any number allowed. QC-local only (never round-trips to Tuleap).

### Estimate Accuracy

Post-close verdict: `ratio = actual_hrs / estimate_hrs` → Under-estimated `< 0.75` / Accurate `0.75–1.25` / Over-estimated `> 1.25`.

## Bug Classification

| Source | Meaning |
|--------|---------|
| `TEST_CASE` | Bug discovered through executing a known test case |
| `EXPLORATORY` | Bug discovered ad-hoc, no linked test case |

## Identifiers

| ID Type | Format | Scope |
|---------|--------|-------|
| QC UUID | UUID v4 | Canonical for artifact links |
| QC Business Key | `T-123`, `B-456` | Display only |
| Tuleap Artifact ID | Integer (e.g., `140`) | Boundary translation |

## Ambiguities

- **"project"** is overloaded — always qualify: Tuleap Project vs QC Project
- **"sync"** is overloaded — prefer "Inbound" for direction; "sync" for the action
- **`tuleap_sync_config`** table name is historical — use "Tracker Config" in design
- **Three identities per artifact** — QC UUID (canonical), QC business key (display), Tuleap ID (boundary)

> [!IMPORTANT]
> For the full authoritative domain language, see [CONTEXT.md](../../CONTEXT.md). This file is a condensed reference.
